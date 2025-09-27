-- Comprehensive validation script for communication events deduplication fix
-- Tests edge cases and error conditions

-- Test 1: Validate all trigger functions exist and use resilient insertion
DO $$
DECLARE
  v_function_record RECORD;
  v_function_source TEXT;
  v_resilient_usage_count INTEGER;
BEGIN
  RAISE NOTICE 'Testing trigger function updates...';
  
  -- Check each trigger function for resilient insertion usage
  FOR v_function_record IN 
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE proname IN (
      'queue_order_status_change_communication',
      'trigger_order_status_email_notifications', 
      'trigger_order_ready_notification',
      'trigger_purchase_receipt'
    )
  LOOP
    v_function_source := v_function_record.prosrc;
    
    IF v_function_source LIKE '%insert_communication_event_resilient%' THEN
      RAISE NOTICE '✅ Function % uses resilient insertion', v_function_record.proname;
    ELSE
      RAISE NOTICE '❌ Function % does NOT use resilient insertion', v_function_record.proname;
    END IF;
    
    -- Check for direct INSERT statements (should be avoided now)
    IF v_function_source LIKE '%INSERT INTO communication_events%' 
       AND v_function_source NOT LIKE '%insert_communication_event_resilient%' THEN
      RAISE NOTICE '⚠️  Function % still contains direct INSERT statements', v_function_record.proname;
    END IF;
  END LOOP;
END $$;

-- Test 2: Validate dedupe_key constraint works
DO $$
DECLARE
  v_test_order_id UUID := gen_random_uuid();
  v_test_email TEXT := 'test.dedupe@example.com';
  v_dedupe_key TEXT;
  v_event_id1 UUID;
  v_event_id2 UUID;
BEGIN
  RAISE NOTICE 'Testing dedupe_key constraint...';
  
  -- Generate test dedupe key
  v_dedupe_key := generate_communication_event_dedupe_key(
    'test_constraint', 
    v_test_order_id, 
    v_test_email, 
    'test_template'
  );
  
  -- Insert first event
  INSERT INTO communication_events (
    order_id, event_type, recipient_email, template_key, dedupe_key, status
  ) VALUES (
    v_test_order_id, 'test_constraint', v_test_email, 'test_template', v_dedupe_key, 'queued'
  ) RETURNING id INTO v_event_id1;
  
  RAISE NOTICE 'First event inserted with ID: %', v_event_id1;
  
  -- Try to insert duplicate (should fail with constraint violation)
  BEGIN
    INSERT INTO communication_events (
      order_id, event_type, recipient_email, template_key, dedupe_key, status
    ) VALUES (
      v_test_order_id, 'test_constraint', v_test_email, 'test_template', v_dedupe_key, 'queued'
    ) RETURNING id INTO v_event_id2;
    
    RAISE NOTICE '❌ Duplicate constraint test FAILED - duplicate was allowed';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE '✅ Duplicate constraint test PASSED - duplicate was prevented';
  END;
  
  -- Clean up
  DELETE FROM communication_events WHERE id = v_event_id1;
END $$;

-- Test 3: Validate resilient insertion handles various scenarios
DO $$
DECLARE
  v_test_order_id UUID := gen_random_uuid();
  v_result JSONB;
BEGIN
  RAISE NOTICE 'Testing resilient insertion scenarios...';
  
  -- Scenario 1: Valid insertion
  v_result := insert_communication_event_resilient(
    p_order_id := v_test_order_id,
    p_event_type := 'test_valid',
    p_recipient_email := 'valid@example.com',
    p_template_key := 'test_template'
  );
  
  IF (v_result->>'success')::boolean AND v_result->>'action' = 'created' THEN
    RAISE NOTICE '✅ Valid insertion test PASSED';
  ELSE
    RAISE NOTICE '❌ Valid insertion test FAILED: %', v_result;
  END IF;
  
  -- Scenario 2: Duplicate insertion (should be deduplicated)
  v_result := insert_communication_event_resilient(
    p_order_id := v_test_order_id,
    p_event_type := 'test_valid',
    p_recipient_email := 'valid@example.com',
    p_template_key := 'test_template'
  );
  
  IF (v_result->>'success')::boolean AND v_result->>'action' = 'deduplicated' THEN
    RAISE NOTICE '✅ Deduplication test PASSED';
  ELSE
    RAISE NOTICE '❌ Deduplication test FAILED: %', v_result;
  END IF;
  
  -- Scenario 3: Missing recipient email (should be skipped)
  v_result := insert_communication_event_resilient(
    p_order_id := v_test_order_id,
    p_event_type := 'test_no_email',
    p_recipient_email := NULL,
    p_template_key := 'test_template'
  );
  
  IF (v_result->>'success')::boolean AND v_result->>'action' = 'skipped' THEN
    RAISE NOTICE '✅ Missing email skip test PASSED';
  ELSE
    RAISE NOTICE '❌ Missing email skip test FAILED: %', v_result;
  END IF;
  
  -- Scenario 4: Empty email (should be skipped)
  v_result := insert_communication_event_resilient(
    p_order_id := v_test_order_id,
    p_event_type := 'test_empty_email',
    p_recipient_email := '   ',
    p_template_key := 'test_template'
  );
  
  IF (v_result->>'success')::boolean AND v_result->>'action' = 'skipped' THEN
    RAISE NOTICE '✅ Empty email skip test PASSED';
  ELSE
    RAISE NOTICE '❌ Empty email skip test FAILED: %', v_result;
  END IF;
  
  -- Scenario 5: Missing required parameters
  v_result := insert_communication_event_resilient(
    p_order_id := NULL,
    p_event_type := 'test_invalid',
    p_recipient_email := 'test@example.com'
  );
  
  IF NOT (v_result->>'success')::boolean THEN
    RAISE NOTICE '✅ Invalid parameters test PASSED';
  ELSE
    RAISE NOTICE '❌ Invalid parameters test FAILED: %', v_result;
  END IF;
  
  -- Clean up
  DELETE FROM communication_events WHERE order_id = v_test_order_id;
END $$;

-- Test 4: Validate case insensitive email handling
DO $$
DECLARE
  v_key1 TEXT;
  v_key2 TEXT;
  v_key3 TEXT;
BEGIN
  RAISE NOTICE 'Testing case insensitive email handling...';
  
  v_key1 := generate_communication_event_dedupe_key(
    'test_case', 
    gen_random_uuid(), 
    'Test@Example.COM', 
    'template'
  );
  
  v_key2 := generate_communication_event_dedupe_key(
    'test_case', 
    gen_random_uuid(), 
    'test@example.com', 
    'template'
  );
  
  v_key3 := generate_communication_event_dedupe_key(
    'test_case', 
    gen_random_uuid(), 
    '  TEST@EXAMPLE.COM  ', 
    'template'
  );
  
  IF v_key1 = v_key2 AND v_key2 = v_key3 THEN
    RAISE NOTICE '✅ Case insensitive email test PASSED';
  ELSE
    RAISE NOTICE '❌ Case insensitive email test FAILED';
    RAISE NOTICE 'Key 1: %', v_key1;
    RAISE NOTICE 'Key 2: %', v_key2; 
    RAISE NOTICE 'Key 3: %', v_key3;
  END IF;
END $$;

-- Test 5: Performance test with multiple rapid inserts
DO $$
DECLARE
  v_test_order_id UUID := gen_random_uuid();
  v_start_time TIMESTAMP;
  v_end_time TIMESTAMP;
  v_duration INTERVAL;
  v_result JSONB;
  i INTEGER;
BEGIN
  RAISE NOTICE 'Testing performance with rapid inserts...';
  
  v_start_time := clock_timestamp();
  
  -- Attempt 100 rapid inserts of the same event (should all be deduplicated after first)
  FOR i IN 1..100 LOOP
    v_result := insert_communication_event_resilient(
      p_order_id := v_test_order_id,
      p_event_type := 'performance_test',
      p_recipient_email := 'performance@example.com',
      p_template_key := 'test_template'
    );
  END LOOP;
  
  v_end_time := clock_timestamp();
  v_duration := v_end_time - v_start_time;
  
  -- Check only one event was created
  IF (SELECT COUNT(*) FROM communication_events WHERE order_id = v_test_order_id) = 1 THEN
    RAISE NOTICE '✅ Performance test PASSED - only 1 event created from 100 attempts';
    RAISE NOTICE 'Duration: %', v_duration;
  ELSE
    RAISE NOTICE '❌ Performance test FAILED - % events created', 
      (SELECT COUNT(*) FROM communication_events WHERE order_id = v_test_order_id);
  END IF;
  
  -- Clean up
  DELETE FROM communication_events WHERE order_id = v_test_order_id;
END $$;

-- Test 6: Validate audit logging
DO $$
DECLARE
  v_test_order_id UUID := gen_random_uuid();
  v_result JSONB;
  v_audit_count INTEGER;
BEGIN
  RAISE NOTICE 'Testing audit logging...';
  
  -- Clear any existing audit logs for our test
  DELETE FROM audit_logs WHERE action LIKE '%communication_event%' AND entity_id = v_test_order_id;
  
  -- Create first event
  v_result := insert_communication_event_resilient(
    p_order_id := v_test_order_id,
    p_event_type := 'audit_test',
    p_recipient_email := 'audit@example.com',
    p_template_key := 'test_template'
  );
  
  -- Try duplicate (should trigger audit log)
  v_result := insert_communication_event_resilient(
    p_order_id := v_test_order_id,
    p_event_type := 'audit_test',
    p_recipient_email := 'audit@example.com',
    p_template_key := 'test_template'
  );
  
  -- Try with missing email (should trigger audit log)
  v_result := insert_communication_event_resilient(
    p_order_id := v_test_order_id,
    p_event_type := 'audit_test',
    p_recipient_email := NULL,
    p_template_key := 'test_template'
  );
  
  -- Check audit logs were created
  SELECT COUNT(*) INTO v_audit_count 
  FROM audit_logs 
  WHERE action LIKE '%communication_event%' 
    AND entity_id = v_test_order_id;
  
  IF v_audit_count >= 2 THEN
    RAISE NOTICE '✅ Audit logging test PASSED - % audit entries created', v_audit_count;
  ELSE
    RAISE NOTICE '❌ Audit logging test FAILED - only % audit entries created', v_audit_count;
  END IF;
  
  -- Clean up
  DELETE FROM communication_events WHERE order_id = v_test_order_id;
  DELETE FROM audit_logs WHERE action LIKE '%communication_event%' AND entity_id = v_test_order_id;
END $$;

-- Final summary
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==================================================';
  RAISE NOTICE 'Communication Events Deduplication Fix Validation';
  RAISE NOTICE '==================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'All tests completed. Check the notices above for results.';
  RAISE NOTICE 'Look for ✅ (PASSED) and ❌ (FAILED) indicators.';
  RAISE NOTICE '';
  RAISE NOTICE 'If all tests passed, the deduplication fix is working correctly';
  RAISE NOTICE 'and should prevent 500 errors from duplicate key violations.';
  RAISE NOTICE '';
END $$;