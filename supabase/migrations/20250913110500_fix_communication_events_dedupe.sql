-- Fix communication_events duplicate key violations by implementing robust deduplication
-- This addresses 500 errors when updating order statuses via admin-orders-manager edge function

-- 1. Add dedupe_key column to communication_events table for deduplication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'communication_events' 
    AND column_name = 'dedupe_key'
  ) THEN
    ALTER TABLE communication_events ADD COLUMN dedupe_key TEXT;
    
    -- Create unique index on dedupe_key to prevent duplicates
    CREATE UNIQUE INDEX idx_communication_events_dedupe_key_unique 
    ON communication_events (dedupe_key) 
    WHERE dedupe_key IS NOT NULL;
    
    -- Add index for performance
    CREATE INDEX idx_communication_events_dedupe_key 
    ON communication_events (dedupe_key);
  END IF;
END $$;

-- 2. Create helper function to generate dedupe_key
CREATE OR REPLACE FUNCTION public.generate_communication_event_dedupe_key(
  p_event_type TEXT,
  p_order_id UUID,
  p_recipient_email TEXT,
  p_template_key TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Generate a deterministic dedupe key based on event context
  -- Include template_key for more granular deduplication when available
  IF p_template_key IS NOT NULL THEN
    RETURN format('%s:%s:%s:%s', 
      p_event_type, 
      p_order_id::text, 
      lower(trim(p_recipient_email)),
      p_template_key
    );
  ELSE
    RETURN format('%s:%s:%s', 
      p_event_type, 
      p_order_id::text, 
      lower(trim(p_recipient_email))
    );
  END IF;
END;
$$;

-- 3. Create resilient communication event insertion function
CREATE OR REPLACE FUNCTION public.insert_communication_event_resilient(
  p_order_id UUID,
  p_event_type TEXT,
  p_recipient_email TEXT DEFAULT NULL,
  p_template_key TEXT DEFAULT NULL,
  p_email_type TEXT DEFAULT 'transactional',
  p_status TEXT DEFAULT 'queued',
  p_priority TEXT DEFAULT 'normal',
  p_variables JSONB DEFAULT '{}',
  p_payload JSONB DEFAULT NULL,
  p_scheduled_at TIMESTAMPTZ DEFAULT NOW(),
  p_template_variables JSONB DEFAULT NULL,
  p_external_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_event_id UUID;
  v_dedupe_key TEXT;
  v_existing_event RECORD;
BEGIN
  -- Validate required parameters
  IF p_order_id IS NULL OR p_event_type IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'order_id and event_type are required'
    );
  END IF;

  -- Skip if no recipient for email events
  IF p_recipient_email IS NULL OR trim(p_recipient_email) = '' THEN
    -- Log the skip for debugging
    INSERT INTO audit_logs (
      action,
      category,
      message,
      entity_id,
      new_values
    ) VALUES (
      'communication_event_skipped',
      'Email System',
      'Communication event skipped: Missing recipient email',
      p_order_id,
      jsonb_build_object(
        'event_type', p_event_type,
        'template_key', p_template_key,
        'reason', 'missing_recipient_email'
      )
    );
    
    RETURN jsonb_build_object(
      'success', true,
      'action', 'skipped',
      'reason', 'missing_recipient_email'
    );
  END IF;

  -- Generate dedupe key
  v_dedupe_key := generate_communication_event_dedupe_key(
    p_event_type, 
    p_order_id, 
    p_recipient_email, 
    p_template_key
  );

  -- Try to insert, handle conflicts gracefully
  BEGIN
    INSERT INTO communication_events (
      order_id,
      event_type,
      recipient_email,
      template_key,
      email_type,
      status,
      priority,
      variables,
      payload,
      template_variables,
      external_id,
      dedupe_key,
      created_at,
      scheduled_at
    )
    VALUES (
      p_order_id,
      p_event_type,
      p_recipient_email,
      p_template_key,
      p_email_type,
      p_status,
      p_priority,
      COALESCE(p_variables, '{}'),
      p_payload,
      p_template_variables,
      p_external_id,
      v_dedupe_key,
      NOW(),
      COALESCE(p_scheduled_at, NOW())
    )
    RETURNING id INTO v_event_id;
    
    RETURN jsonb_build_object(
      'success', true,
      'action', 'created',
      'event_id', v_event_id,
      'dedupe_key', v_dedupe_key
    );
    
  EXCEPTION WHEN unique_violation THEN
    -- Check if it's a dedupe_key conflict
    IF SQLSTATE = '23505' AND SQLERRM LIKE '%dedupe_key%' THEN
      -- Find the existing event
      SELECT id, status, created_at INTO v_existing_event
      FROM communication_events
      WHERE dedupe_key = v_dedupe_key
      LIMIT 1;
      
      -- Log the deduplication for monitoring
      INSERT INTO audit_logs (
        action,
        category,
        message,
        entity_id,
        new_values
      ) VALUES (
        'communication_event_deduplicated',
        'Email System',
        'Duplicate communication event prevented by dedupe_key',
        p_order_id,
        jsonb_build_object(
          'event_type', p_event_type,
          'dedupe_key', v_dedupe_key,
          'existing_event_id', v_existing_event.id,
          'existing_status', v_existing_event.status
        )
      );
      
      RETURN jsonb_build_object(
        'success', true,
        'action', 'deduplicated',
        'existing_event_id', v_existing_event.id,
        'existing_status', v_existing_event.status,
        'dedupe_key', v_dedupe_key
      );
    ELSE
      -- Re-raise if it's a different constraint violation
      RAISE;
    END IF;
  END;
END;
$$;

-- 4. Update queue_order_status_change_communication to use resilient insertion
CREATE OR REPLACE FUNCTION public.queue_order_status_change_communication()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Insert an event into the queue only when the order status changes
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    v_result := insert_communication_event_resilient(
      p_order_id := NEW.id,
      p_event_type := 'order_status_update',
      p_recipient_email := NEW.customer_email,
      p_payload := jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'customer_name', NEW.customer_name,
        'customer_phone', NEW.customer_phone,
        'customer_email', NEW.customer_email
      )
    );
    
    -- Log if insertion failed for debugging
    IF NOT (v_result->>'success')::boolean THEN
      INSERT INTO audit_logs (
        action,
        category,
        message,
        entity_id,
        new_values
      ) VALUES (
        'communication_event_insertion_failed',
        'Email System',
        'Failed to insert communication event: ' || (v_result->>'error'),
        NEW.id,
        jsonb_build_object(
          'event_type', 'order_status_update',
          'error', v_result->>'error'
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 5. Update trigger_order_status_email_notifications to use resilient insertion
CREATE OR REPLACE FUNCTION trigger_order_status_email_notifications()
RETURNS TRIGGER AS $$
DECLARE
  v_template_key TEXT;
  v_business_name TEXT := 'Starters Small Chops';
  v_admin_email TEXT;
  v_support_phone TEXT;
  v_pickup_info JSONB;
  v_result JSONB;
BEGIN
  -- Only process status changes
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    
    -- Get business info
    SELECT name, admin_notification_email, whatsapp_support_number
    INTO v_business_name, v_admin_email, v_support_phone
    FROM business_settings
    ORDER BY created_at ASC LIMIT 1;
    
    -- Map status to template
    CASE NEW.status
      WHEN 'confirmed' THEN v_template_key := 'order_confirmation';
      WHEN 'out_for_delivery' THEN v_template_key := 'shipping_notification';
      WHEN 'ready' THEN v_template_key := 'order_delivered';
      WHEN 'delivered' THEN v_template_key := 'order_delivered';
      WHEN 'cancelled' THEN v_template_key := 'order_cancellation';
      ELSE v_template_key := NULL;
    END CASE;
    
    -- Get pickup info if needed
    IF NEW.order_type = 'pickup' AND NEW.pickup_point_id IS NOT NULL THEN
      SELECT jsonb_build_object(
        'name', name,
        'address', address,
        'phone', contact_phone,
        'hours', operating_hours
      ) INTO v_pickup_info
      FROM pickup_points 
      WHERE id = NEW.pickup_point_id;
    END IF;
    
    -- Use resilient insertion if template exists
    IF v_template_key IS NOT NULL AND NEW.customer_email IS NOT NULL THEN
      v_result := insert_communication_event_resilient(
        p_order_id := NEW.id,
        p_event_type := 'order_status_email',
        p_recipient_email := NEW.customer_email,
        p_template_key := v_template_key,
        p_email_type := 'transactional',
        p_status := 'queued',
        p_priority := 'high',
        p_variables := jsonb_build_object(
          'customer_name', NEW.customer_name,
          'order_number', NEW.order_number,
          'order_type', NEW.order_type,
          'total_amount', NEW.total_amount::text,
          'business_name', COALESCE(v_business_name, 'Starters Small Chops'),
          'admin_email', v_admin_email,
          'support_phone', v_support_phone,
          'delivery_address', CASE 
            WHEN NEW.order_type = 'delivery' THEN 
              COALESCE(NEW.delivery_address->>'formatted_address', NEW.delivery_address::text)
            ELSE NULL 
          END,
          'delivery_instructions', CASE 
            WHEN NEW.order_type = 'delivery' THEN 
              NEW.delivery_address->>'instructions'
            ELSE NULL 
          END,
          'pickup_point', CASE 
            WHEN NEW.order_type = 'pickup' THEN v_pickup_info->>'name'
            ELSE NULL 
          END,
          'pickup_address', CASE 
            WHEN NEW.order_type = 'pickup' THEN v_pickup_info->>'address'
            ELSE NULL 
          END,
          'pickup_phone', CASE 
            WHEN NEW.order_type = 'pickup' THEN v_pickup_info->>'phone'
            ELSE NULL 
          END,
          'pickup_hours', CASE 
            WHEN NEW.order_type = 'pickup' THEN v_pickup_info->>'hours'
            ELSE NULL 
          END,
          'order_type_pickup', (NEW.order_type = 'pickup'),
          'order_type_delivery', (NEW.order_type = 'delivery'),
          'cancellation_reason', CASE 
            WHEN NEW.status = 'cancelled' THEN 
              COALESCE(NEW.admin_notes, 'Administrative decision')
            ELSE NULL 
          END,
          'estimated_delivery_time', CASE 
            WHEN NEW.status = 'out_for_delivery' THEN 
              COALESCE(NEW.delivery_time::text, 'Soon')
            ELSE NULL 
          END
        )
      );
      
      -- Log the email queuing if successful
      IF (v_result->>'success')::boolean AND v_result->>'action' = 'created' THEN
        INSERT INTO audit_logs (
          action,
          category, 
          message,
          entity_id,
          new_values
        ) VALUES (
          'order_email_queued',
          'Email Processing',
          'Queued ' || v_template_key || ' email for order ' || NEW.order_number,
          NEW.id,
          jsonb_build_object(
            'template_key', v_template_key,
            'recipient', NEW.customer_email,
            'order_status', NEW.status,
            'event_id', v_result->>'event_id'
          )
        );
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Backfill dedupe_key for existing records
UPDATE communication_events 
SET dedupe_key = generate_communication_event_dedupe_key(
  event_type, 
  order_id, 
  recipient_email, 
  template_key
)
WHERE dedupe_key IS NULL 
  AND order_id IS NOT NULL 
  AND recipient_email IS NOT NULL;

-- 7. Create function to clean up duplicate communication events (optional maintenance)
CREATE OR REPLACE FUNCTION public.cleanup_duplicate_communication_events()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_deleted_count INTEGER := 0;
  v_duplicate_record RECORD;
BEGIN
  -- Find and remove older duplicates, keeping the newest one
  FOR v_duplicate_record IN
    SELECT 
      event_type,
      order_id,
      recipient_email,
      template_key,
      COUNT(*) as duplicate_count,
      MIN(created_at) as first_created,
      MAX(created_at) as last_created,
      ARRAY_AGG(id ORDER BY created_at DESC) as all_ids
    FROM communication_events
    WHERE order_id IS NOT NULL 
      AND recipient_email IS NOT NULL
      AND created_at >= NOW() - INTERVAL '7 days'  -- Only look at recent events
    GROUP BY event_type, order_id, recipient_email, template_key
    HAVING COUNT(*) > 1
  LOOP
    -- Delete all but the newest record (first in array after DESC sort)
    DELETE FROM communication_events
    WHERE id = ANY(v_duplicate_record.all_ids[2:]);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    -- Log the cleanup
    INSERT INTO audit_logs (
      action,
      category,
      message,
      entity_id,
      new_values
    ) VALUES (
      'communication_events_cleanup',
      'Database Maintenance',
      format('Removed %s duplicate communication events for order %s', 
        array_length(v_duplicate_record.all_ids, 1) - 1,
        v_duplicate_record.order_id
      ),
      v_duplicate_record.order_id,
      jsonb_build_object(
        'event_type', v_duplicate_record.event_type,
        'duplicate_count', v_duplicate_record.duplicate_count,
        'deleted_ids', v_duplicate_record.all_ids[2:]
      )
    );
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Cleanup completed',
    'deleted_count', v_deleted_count
  );
END;
$$;

-- 8. Update trigger_order_ready_notification to use resilient insertion
CREATE OR REPLACE FUNCTION public.trigger_order_ready_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  -- pickup details (nullable)
  v_pickup_name text;
  v_pickup_address text;
  v_pickup_phone text;
  v_pickup_hours jsonb;

  -- business info (nullable)
  v_admin_email text;
  v_support_phone text;
  v_result JSONB;
BEGIN
  -- Only trigger when status changes to 'ready'
  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status = 'ready' THEN

    -- Business contact info (best-effort)
    SELECT
      admin_notification_email,
      whatsapp_support_number
    INTO v_admin_email, v_support_phone
    FROM business_settings
    ORDER BY created_at ASC
    LIMIT 1;

    -- Initialize pickup vars as NULL defaults (prevents unassigned record errors)
    v_pickup_name := NULL;
    v_pickup_address := NULL;
    v_pickup_phone := NULL;
    v_pickup_hours := NULL;

    -- Populate pickup info only for pickup orders with a valid pickup point
    IF NEW.order_type = 'pickup' AND NEW.pickup_point_id IS NOT NULL THEN
      SELECT
        name,
        address,
        contact_phone,
        operating_hours
      INTO v_pickup_name, v_pickup_address, v_pickup_phone, v_pickup_hours
      FROM pickup_points
      WHERE id = NEW.pickup_point_id
      LIMIT 1;
    END IF;

    -- Use resilient insertion for order ready notification
    v_result := insert_communication_event_resilient(
      p_order_id := NEW.id,
      p_event_type := 'order_ready',
      p_recipient_email := NEW.customer_email,
      p_template_key := 'order_ready',
      p_email_type := 'transactional',
      p_status := 'queued',
      p_variables := jsonb_build_object(
        'customerName', NEW.customer_name,
        'orderNumber', NEW.order_number,
        'orderType', NEW.order_type,
        'orderDate', NEW.order_time::text,
        'totalAmount', NEW.total_amount::text,
        'deliveryAddress', CASE WHEN NEW.order_type = 'delivery' THEN
          COALESCE(NEW.delivery_address->>'formatted_address', NEW.delivery_address::text)
          ELSE NULL END,
        'deliveryInstructions', CASE WHEN NEW.order_type = 'delivery' THEN
          COALESCE(NEW.delivery_address->>'instructions', NULL)
          ELSE NULL END,
        'pickupPoint', CASE WHEN NEW.order_type = 'pickup' THEN v_pickup_name ELSE NULL END,
        'pickupAddress', CASE WHEN NEW.order_type = 'pickup' THEN v_pickup_address ELSE NULL END,
        'pickupPhone', CASE WHEN NEW.order_type = 'pickup' THEN v_pickup_phone ELSE NULL END,
        'pickupHours', CASE WHEN NEW.order_type = 'pickup' THEN v_pickup_hours ELSE NULL END,
        'adminEmail', v_admin_email,
        'supportPhone', v_support_phone
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 9. Check for and update any other trigger functions that insert into communication_events
-- Update any remaining trigger functions to use resilient insertion
CREATE OR REPLACE FUNCTION public.trigger_purchase_receipt()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Only trigger when payment status changes to 'paid'
  IF TG_OP = 'UPDATE' 
     AND OLD.payment_status IS DISTINCT FROM NEW.payment_status 
     AND NEW.payment_status = 'paid' THEN

    -- Use resilient insertion for purchase receipt
    v_result := insert_communication_event_resilient(
      p_order_id := NEW.id,
      p_event_type := 'purchase_receipt',
      p_recipient_email := NEW.customer_email,
      p_template_key := 'purchase_receipt',
      p_email_type := 'transactional',
      p_status := 'queued',
      p_variables := jsonb_build_object(
        'customerName', NEW.customer_name,
        'orderNumber', NEW.order_number,
        'totalAmount', NEW.total_amount::text,
        'paymentMethod', COALESCE(NEW.payment_method, 'Online Payment'),
        'orderDate', NEW.order_time::text
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 10. Add comment documenting the new behavior
COMMENT ON FUNCTION public.insert_communication_event_resilient IS 
'Resilient communication event insertion that prevents duplicate key violations using dedupe_key. 
Supports ON CONFLICT DO NOTHING behavior for idempotent event creation.
Used by all trigger functions to prevent 500 errors during rapid order status changes.';

COMMENT ON COLUMN communication_events.dedupe_key IS 
'Deduplication key generated from event_type:order_id:recipient_email:template_key. 
Prevents duplicate communication events for the same order-status-email combination.';