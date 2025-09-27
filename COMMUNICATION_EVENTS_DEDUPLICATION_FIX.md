# Communication Events Deduplication Fix

## Problem Statement

The system was experiencing 500 errors when updating order statuses via the admin-orders-manager edge function due to duplicate key violations on the communication_events table. Multiple triggers were attempting to insert communication events with identical dedupe keys for the same order-status-email combination.

## Root Cause Analysis

1. **Multiple Active Triggers**: Both `on_order_status_update` and `trigger_order_status_email_notifications` triggers were firing on order updates
2. **Identical Event Types**: Both triggers inserted events with `event_type = 'order_status_update'`
3. **No Deduplication**: No mechanism to prevent duplicate communication events
4. **Race Conditions**: Rapid status changes could cause multiple simultaneous insertions

## Solution Overview

### 1. Dedupe Key Implementation
- Added `dedupe_key` column to `communication_events` table
- Created unique constraint on `dedupe_key` to prevent duplicates
- Implemented deterministic key generation: `event_type:order_id:recipient_email:template_key`

### 2. Resilient Insertion Function
Created `insert_communication_event_resilient()` function that:
- Handles INSERT ... ON CONFLICT gracefully
- Returns success for duplicates instead of throwing errors
- Logs deduplication events for monitoring
- Supports all communication event fields

### 3. Updated Trigger Functions
Modified all trigger functions to use resilient insertion:
- `queue_order_status_change_communication()`
- `trigger_order_status_email_notifications()`
- `trigger_order_ready_notification()`
- `trigger_purchase_receipt()`

## Key Features

### Dedupe Key Generation
```sql
-- Format: event_type:order_id:recipient_email:template_key
generate_communication_event_dedupe_key(
  'order_status_update',
  '123e4567-e89b-12d3-a456-426614174000',
  'customer@example.com',
  'order_confirmation'
)
-- Returns: "order_status_update:123e4567-e89b-12d3-a456-426614174000:customer@example.com:order_confirmation"
```

### Resilient Insertion
```sql
-- Example usage in trigger functions
v_result := insert_communication_event_resilient(
  p_order_id := NEW.id,
  p_event_type := 'order_status_update',
  p_recipient_email := NEW.customer_email,
  p_template_key := 'order_confirmation',
  p_variables := jsonb_build_object('key', 'value')
);

-- Returns:
-- Success: {"success": true, "action": "created", "event_id": "uuid"}
-- Duplicate: {"success": true, "action": "deduplicated", "existing_event_id": "uuid"}
```

### Case Insensitive Deduplication
- Email addresses are normalized to lowercase
- `test@EXAMPLE.com` and `test@example.com` are treated as the same recipient

### Template-Specific Deduplication
- Different templates can have separate events for the same order
- `order_confirmation` and `order_delivered` templates create distinct events

## Benefits

1. **No More 500 Errors**: Duplicate key violations are prevented
2. **Continued Email Delivery**: No lost emails due to deduplication
3. **Audit Trail**: All deduplication events are logged
4. **Performance**: Unique index on dedupe_key improves query performance
5. **Backward Compatible**: Existing functionality is preserved

## Migration Details

### Database Changes
```sql
-- Add dedupe_key column
ALTER TABLE communication_events ADD COLUMN dedupe_key TEXT;

-- Create unique constraint
CREATE UNIQUE INDEX idx_communication_events_dedupe_key_unique 
ON communication_events (dedupe_key) 
WHERE dedupe_key IS NOT NULL;

-- Backfill existing records
UPDATE communication_events 
SET dedupe_key = generate_communication_event_dedupe_key(...)
WHERE dedupe_key IS NULL;
```

### Function Updates
All trigger functions now use `insert_communication_event_resilient()` instead of direct INSERT statements.

## Testing

### Rapid Status Change Test
```sql
-- Test rapid order status changes
UPDATE orders SET status = 'confirmed' WHERE id = test_order_id;
UPDATE orders SET status = 'preparing' WHERE id = test_order_id;
UPDATE orders SET status = 'ready' WHERE id = test_order_id;
UPDATE orders SET status = 'out_for_delivery' WHERE id = test_order_id;
UPDATE orders SET status = 'delivered' WHERE id = test_order_id;

-- Result: No duplicate key violations, appropriate communication events created
```

### Deduplication Verification
```sql
-- Check for duplicates (should return 0)
SELECT COUNT(*) FROM (
  SELECT dedupe_key, COUNT(*) 
  FROM communication_events 
  WHERE order_id = test_order_id 
  GROUP BY dedupe_key 
  HAVING COUNT(*) > 1
) duplicates;
```

## Monitoring

### Audit Logs
The system logs the following events:
- `communication_event_deduplicated`: When a duplicate is prevented
- `communication_event_skipped`: When recipient email is missing
- `communication_event_insertion_failed`: When insertion fails for other reasons

### Performance Monitoring
- Monitor dedupe_key index usage
- Track deduplication frequency via audit logs
- Monitor communication event creation rates

## Maintenance

### Cleanup Function
```sql
-- Remove duplicate events (optional maintenance)
SELECT cleanup_duplicate_communication_events();
```

### Index Maintenance
- Monitor unique index performance
- Consider periodic REINDEX if needed

## Rollback Plan

If issues occur, the migration can be rolled back by:
1. Reverting trigger functions to use direct INSERT
2. Dropping the unique constraint
3. Removing the dedupe_key column

However, this is not recommended as it would reintroduce the duplicate key violation issue.

## Future Enhancements

1. **Time-Based Deduplication**: Add timestamp granularity for legitimate repeated notifications
2. **Event Batching**: Group multiple status changes into single events
3. **Smart Deduplication**: Different rules for different event types
4. **Performance Optimization**: Further index optimizations based on usage patterns