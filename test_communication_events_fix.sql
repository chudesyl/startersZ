-- Test script to validate communication events deduplication fix
-- This script tests rapid order status changes to ensure no 500 errors occur

-- Test 1: Create a test order and update its status rapidly
DO $$
DECLARE
  v_test_order_id UUID;
  v_test_customer_email TEXT := 'test@example.com';
  v_test_order_number TEXT := 'TEST-' || extract(epoch from now())::text;
  v_result JSONB;
  v_error_count INTEGER := 0;
BEGIN
  -- Create a test order
  INSERT INTO orders (
    id,
    order_number,
    customer_name,
    customer_email,
    customer_phone,
    status,
    payment_status,
    total_amount,
    order_type,
    order_time,
    created_at
  ) VALUES (
    gen_random_uuid(),
    v_test_order_number,
    'Test Customer',
    v_test_customer_email,
    '+1234567890',
    'pending',
    'pending',
    25.00,
    'delivery',
    NOW(),
    NOW()
  ) RETURNING id INTO v_test_order_id;

  RAISE NOTICE 'Created test order: % with ID: %', v_test_order_number, v_test_order_id;

  -- Test rapid status changes that would previously cause duplicate key violations
  BEGIN
    -- Update 1: pending -> confirmed
    UPDATE orders SET status = 'confirmed', payment_status = 'paid' WHERE id = v_test_order_id;
    RAISE NOTICE 'Status update 1: pending -> confirmed';
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    RAISE NOTICE 'ERROR in update 1: %', SQLERRM;
  END;

  BEGIN
    -- Update 2: confirmed -> preparing (rapid change)
    UPDATE orders SET status = 'preparing' WHERE id = v_test_order_id;
    RAISE NOTICE 'Status update 2: confirmed -> preparing';
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    RAISE NOTICE 'ERROR in update 2: %', SQLERRM;
  END;

  BEGIN
    -- Update 3: preparing -> ready (rapid change)
    UPDATE orders SET status = 'ready' WHERE id = v_test_order_id;
    RAISE NOTICE 'Status update 3: preparing -> ready';
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    RAISE NOTICE 'ERROR in update 3: %', SQLERRM;
  END;

  BEGIN
    -- Update 4: ready -> out_for_delivery (rapid change)
    UPDATE orders SET status = 'out_for_delivery' WHERE id = v_test_order_id;
    RAISE NOTICE 'Status update 4: ready -> out_for_delivery';
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    RAISE NOTICE 'ERROR in update 4: %', SQLERRM;
  END;

  BEGIN
    -- Update 5: out_for_delivery -> delivered (rapid change)
    UPDATE orders SET status = 'delivered' WHERE id = v_test_order_id;
    RAISE NOTICE 'Status update 5: out_for_delivery -> delivered';
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    RAISE NOTICE 'ERROR in update 5: %', SQLERRM;
  END;

  -- Check communication events created
  SELECT COUNT(*) FROM communication_events WHERE order_id = v_test_order_id;
  RAISE NOTICE 'Total communication events created: %', (SELECT COUNT(*) FROM communication_events WHERE order_id = v_test_order_id);

  -- Check for duplicates by dedupe_key
  SELECT COUNT(*) FROM (
    SELECT dedupe_key, COUNT(*) as cnt 
    FROM communication_events 
    WHERE order_id = v_test_order_id 
      AND dedupe_key IS NOT NULL
    GROUP BY dedupe_key 
    HAVING COUNT(*) > 1
  ) duplicates;
  RAISE NOTICE 'Duplicate communication events (should be 0): %', (
    SELECT COUNT(*) FROM (
      SELECT dedupe_key, COUNT(*) as cnt 
      FROM communication_events 
      WHERE order_id = v_test_order_id 
        AND dedupe_key IS NOT NULL
      GROUP BY dedupe_key 
      HAVING COUNT(*) > 1
    ) duplicates
  );

  -- Test resilient insertion function directly
  BEGIN
    v_result := insert_communication_event_resilient(
      p_order_id := v_test_order_id,
      p_event_type := 'test_event',
      p_recipient_email := v_test_customer_email,
      p_template_key := 'test_template'
    );
    RAISE NOTICE 'Direct resilient insertion result: %', v_result;

    -- Try to insert the same event again (should be deduplicated)
    v_result := insert_communication_event_resilient(
      p_order_id := v_test_order_id,
      p_event_type := 'test_event',
      p_recipient_email := v_test_customer_email,
      p_template_key := 'test_template'
    );
    RAISE NOTICE 'Duplicate resilient insertion result: %', v_result;
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    RAISE NOTICE 'ERROR in resilient insertion test: %', SQLERRM;
  END;

  -- Clean up test data
  DELETE FROM communication_events WHERE order_id = v_test_order_id;
  DELETE FROM orders WHERE id = v_test_order_id;

  -- Summary
  IF v_error_count = 0 THEN
    RAISE NOTICE '✅ SUCCESS: All tests passed! No duplicate key violations detected.';
  ELSE
    RAISE NOTICE '❌ FAILURE: % errors occurred during testing.', v_error_count;
  END IF;

END $$;

-- Test 2: Validate dedupe_key generation function
DO $$
DECLARE
  v_key1 TEXT;
  v_key2 TEXT;
  v_key3 TEXT;
BEGIN
  -- Test dedupe_key generation
  v_key1 := generate_communication_event_dedupe_key(
    'order_status_update', 
    '123e4567-e89b-12d3-a456-426614174000'::uuid, 
    'test@example.com', 
    'order_confirmation'
  );
  
  v_key2 := generate_communication_event_dedupe_key(
    'order_status_update', 
    '123e4567-e89b-12d3-a456-426614174000'::uuid, 
    'TEST@EXAMPLE.COM',  -- Different case
    'order_confirmation'
  );
  
  v_key3 := generate_communication_event_dedupe_key(
    'order_status_update', 
    '123e4567-e89b-12d3-a456-426614174000'::uuid, 
    'test@example.com', 
    'order_delivered'     -- Different template
  );

  RAISE NOTICE 'Dedupe key 1: %', v_key1;
  RAISE NOTICE 'Dedupe key 2 (case insensitive): %', v_key2;
  RAISE NOTICE 'Dedupe key 3 (different template): %', v_key3;

  IF v_key1 = v_key2 THEN
    RAISE NOTICE '✅ Case insensitive deduplication working correctly';
  ELSE
    RAISE NOTICE '❌ Case insensitive deduplication failed';
  END IF;

  IF v_key1 != v_key3 THEN
    RAISE NOTICE '✅ Template-specific deduplication working correctly';
  ELSE
    RAISE NOTICE '❌ Template-specific deduplication failed';
  END IF;
END $$;

-- Test 3: Check existing triggers are using resilient insertion
SELECT 
  schemaname,
  tablename,
  triggername,
  tgfoid::regproc as trigger_function
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname = 'orders'
  AND n.nspname = 'public'
  AND NOT t.tgisinternal
ORDER BY triggername;