import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// Create Supabase client once (service role)
const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } }
);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔄 Paystack secure function called');
    const requestBody = await req.json();
    const { action, ...requestData } = requestBody || {};

    if (action === 'initialize') {
      return await initializePayment(requestData);
    } else if (action === 'verify') {
      return await verifyPayment(requestData);
    } else {
      return new Response(JSON.stringify({ status: false, error: 'Invalid action specified' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  } catch (error: any) {
    console.error('Paystack secure operation error:', error);
    return new Response(JSON.stringify({ status: false, error: 'Operation failed', message: error?.message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Helper to parse metadata to object safely
function parseMetadata(input: unknown): Record<string, any> {
  if (!input) return {};
  try {
    if (typeof input === 'string') return JSON.parse(input);
    if (typeof input === 'object') return input as Record<string, any>;
  } catch (_) {}
  return {};
}

async function initializePayment(requestData: any) {
  try {
    // Ignore reference from frontend; always generate server reference
    const { email, amount, channels, metadata, callback_url, reference: client_reference } = requestData || {};

    if (!email || amount === undefined || amount === null) {
      throw new Error('Email and amount are required');
    }

    const amountInKobo = Math.round(parseFloat(String(amount)));
    if (isNaN(amountInKobo) || amountInKobo < 100) {
      throw new Error('Amount must be >= 100 kobo (₦1.00)');
    }

    // Load Paystack config directly from table (connected row)
    const { data: config, error: configError } = await supabaseClient
      .from('payment_integrations')
      .select('*')
      .eq('provider', 'paystack')
      .eq('connection_status', 'connected')
      .single();

    if (configError || !config) {
      console.error('Paystack configuration error:', configError);
      throw new Error('Paystack not configured properly');
    }

    const secretKey: string | null = config.test_mode ? config.secret_key : (config.live_secret_key || config.secret_key);
    if (!secretKey) {
      const mode = config.test_mode ? 'test' : 'live';
      throw new Error(`Paystack ${mode} secret key not configured`);
    }

    const transactionRef = `txn_${Date.now()}_${crypto.randomUUID()}`;
    console.log(`✅ Server-generated reference: ${transactionRef}`);

    const paystackPayload: Record<string, any> = {
      email,
      amount: amountInKobo.toString(),
      currency: 'NGN',
      reference: transactionRef,
      channels: channels || ['card', 'bank_transfer', 'ussd'],
      metadata: JSON.stringify(metadata || {}),
      ...(callback_url ? { callback_url } : {})
    };

    console.log('🚀 Sending to Paystack initialize:', JSON.stringify({ ...paystackPayload, metadata: '[stringified]' }));

    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(paystackPayload)
    });

    if (!paystackResponse.ok) {
      const errorText = await paystackResponse.text();
      console.error('❌ Paystack HTTP error:', paystackResponse.status, errorText);
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(`Paystack API error (${paystackResponse.status}): ${errorJson.message || errorText}`);
      } catch (_) {
        throw new Error(`Paystack API error (${paystackResponse.status}): ${errorText}`);
      }
    }

    const paystackData = await paystackResponse.json();
    if (!paystackData?.status) {
      console.error('❌ Paystack initialization failed:', paystackData);
      throw new Error(paystackData?.message || 'Failed to initialize payment');
    }

    const returnedRef: string = paystackData.data?.reference || transactionRef;

    // Track critical insert error across persistence block
    let criticalInsertError: any = null;
    let resolvedOrderIdForInsert: string | null = null;
    let metaObjCache: any = {};

    // Persist reference for consistency (best-effort for non-critical parts)
    try {
      const metaObj = parseMetadata(metadata);
      metaObjCache = metaObj;
      // Persist any client-supplied provisional reference for later mapping
      if (client_reference && !metaObj.client_reference) {
        (metaObj as any).client_reference = client_reference;
      }
      let orderId: string | null = (metaObj as any).order_id || (metaObj as any).orderId || null;
      const orderNumber: string | null = (metaObj as any).order_number || (metaObj as any).orderNumber || null;

      // Resolve order id by number if needed
      if (!orderId && orderNumber) {
        const { data: orderByNumber } = await supabaseClient
          .from('orders')
          .select('id')
          .eq('order_number', orderNumber)
          .maybeSingle();
        if (orderByNumber?.id) orderId = orderByNumber.id;
      }

      resolvedOrderIdForInsert = orderId;

      // Update order payment_reference when resolvable
      if (orderId) {
        const { error: orderErr } = await supabaseClient
          .from('orders')
          .update({ payment_reference: returnedRef, updated_at: new Date().toISOString() })
          .eq('id', orderId);
        if (orderErr) console.warn('Order payment_reference update failed:', orderErr);
      }

      // CRITICAL: Seed a pending transaction so verification can find it
      const txInsert: any = {
        order_id: orderId,
        provider_reference: returnedRef,
        amount: amountInKobo / 100, // store in NGN
        currency: 'NGN',
        status: 'pending',
        metadata: {
          ...metaObj,
          ...(client_reference ? { client_reference } : {}),
          user_id: null, // Will be populated from auth context if available
          payment_method: 'paystack',
          initialized_at: new Date().toISOString()
        },
        customer_email: email,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      console.log(`💾 Creating payment transaction for order ${orderId} with reference ${returnedRef}`);
      const { error: insertErr } = await supabaseClient.from('payment_transactions').insert(txInsert);
      if (insertErr) {
        console.error('❌ CRITICAL: Failed to insert pending transaction:', insertErr);
        criticalInsertError = insertErr;
      } else {
        console.log('✅ Payment transaction created successfully');
      }

      // Audit trail (best-effort)
      await supabaseClient.from('audit_logs').insert({
        action: 'payment_initialized',
        category: 'Payment',
        message: `Initialized Paystack payment: ${returnedRef}`,
        new_values: { reference: returnedRef, order_id: orderId, amount_ngn: amountInKobo / 100 }
      });
    } catch (e) {
      console.warn('Initialization persistence warning:', e);
    }

    // Fail loudly if we could not record the pending transaction
    if (criticalInsertError) {
      throw new Error(`Failed to record pending transaction: ${criticalInsertError.message || criticalInsertError}`);
    }

    return new Response(JSON.stringify({
      status: true,
      data: {
        authorization_url: paystackData.data.authorization_url,
        access_code: paystackData.data.access_code,
        reference: returnedRef
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Payment initialization error:', error);
    return new Response(JSON.stringify({ status: false, error: error?.message || 'Failed to initialize payment' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function verifyPayment(requestData: any) {
  try {
    const { reference } = requestData || {};
    console.log('📨 Request payload:', JSON.stringify({ action: 'verify', reference }));
    if (!reference) throw new Error('Payment reference is required');

    // Load Paystack config
    const { data: config, error: configError } = await supabaseClient
      .from('payment_integrations')
      .select('*')
      .eq('provider', 'paystack')
      .eq('connection_status', 'connected')
      .single();

    if (configError || !config) throw new Error('Paystack not configured properly');

    const secretKey: string | null = config.test_mode ? config.secret_key : (config.live_secret_key || config.secret_key);
    if (!secretKey) {
      const mode = config.test_mode ? 'test' : 'live';
      throw new Error(`Paystack ${mode} secret key not configured`);
    }

    let effectiveRef = reference;
    let mappingStrategy: string | null = null;
    console.log('Verifying Paystack payment:', effectiveRef);

    // Enhanced verification with retry logic and validation
    function validateReference(reference: string): boolean {
      if (!reference || typeof reference !== 'string') {
        throw new Error('Invalid reference format: must be a non-empty string')
      }
      if (reference.length < 10) {
        throw new Error('Invalid reference format: too short')
      }
      return true
    }

    function ensureEnvironmentConsistency(secretKey: string) {
      const isTestKey = secretKey.startsWith('sk_test_')
      const isProduction = Deno.env.get('DENO_DEPLOYMENT_ID') !== undefined
      
      if (isProduction && isTestKey) {
        console.warn('⚠️  Using test key in production environment')
      }
      
      console.log(`🔧 Environment: ${isProduction ? 'production' : 'development'}, Key type: ${isTestKey ? 'test' : 'live'}`)
    }

    async function verifyWithPaystackRetry(ref: string, maxRetries = 3) {
      validateReference(ref)
      ensureEnvironmentConsistency(secretKey)
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`🔄 Verification attempt ${attempt}/${maxRetries} for reference: ${ref}`)
          
          const resp = await fetch(`https://api.paystack.co/transaction/verify/${ref}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${secretKey}`, 'Content-Type': 'application/json' }
          });
          
          if (resp.status === 200) {
            console.log(`✅ Verification successful on attempt ${attempt}`)
            return resp
          }
          
          if (resp.status === 400 && attempt < maxRetries) {
            const errorData = await resp.text()
            if (errorData.includes('Transaction reference not found')) {
              console.log(`⏳ Transaction not found, retrying in ${Math.pow(2, attempt)}s...`)
              // Wait before retry with exponential backoff
              const delay = Math.pow(2, attempt) * 1000 // 2s, 4s, 8s
              await new Promise(resolve => setTimeout(resolve, delay))
              continue
            }
          }
          
          console.error(`❌ Verification failed: ${resp.status}`)
          return resp
          
        } catch (error) {
          console.error(`💥 Verification error on attempt ${attempt}:`, error)
          if (attempt === maxRetries) {
            throw error
          }
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
        }
      }
      
      throw new Error('All verification attempts failed')
    }

    // Legacy function for backward compatibility
    async function verifyWithPaystack(ref: string) {
      return await verifyWithPaystackRetry(ref, 1) // Single attempt for existing logic
    }

    let paystackResponse = await verifyWithPaystackRetry(effectiveRef, 3); // Use retry logic by default

    if (!paystackResponse.ok) {
      const errorText = await paystackResponse.text();
      console.error('❌ Paystack verification HTTP error:', paystackResponse.status, errorText);
      // Try to map references when Paystack says not found
      const notFound = /transaction_not_found|not found/i.test(errorText);

      // A) Map client provisional refs like "pay_*" to server refs we generated
      let shouldMapClient = notFound && /^(pay|PAY|Pay)[-_]/.test(reference);
      if (shouldMapClient) {
        try {
          // 1) Find by metadata.client_reference
          const { data: mappedTx } = await supabaseClient
            .from('payment_transactions')
            .select('provider_reference, order_id, metadata')
            .contains('metadata', { client_reference: reference })
            .order('created_at', { ascending: false })
            .maybeSingle();

          if (mappedTx?.provider_reference) {
            effectiveRef = mappedTx.provider_reference as string;
            mappingStrategy = 'client_metadata';
            console.log('🔁 Mapped client reference to server reference:', effectiveRef);
            paystackResponse = await verifyWithPaystack(effectiveRef);
          } else if (requestData?.order_id) {
            // 2) Fallback by order_id
            const { data: byOrder } = await supabaseClient
              .from('payment_transactions')
              .select('provider_reference')
              .eq('order_id', requestData.order_id)
              .order('created_at', { ascending: false })
              .maybeSingle();
            if (byOrder?.provider_reference) {
              effectiveRef = byOrder.provider_reference as string;
              mappingStrategy = 'by_order_id';
              console.log('🔁 Fallback mapped by order_id to reference:', effectiveRef);
              paystackResponse = await verifyWithPaystack(effectiveRef);
            } else {
              const { data: orderRow } = await supabaseClient
                .from('orders')
                .select('payment_reference')
                .eq('id', requestData.order_id)
                .maybeSingle();
              if (orderRow?.payment_reference) {
                effectiveRef = orderRow.payment_reference as string;
                mappingStrategy = 'orders_payment_reference';
                console.log('🔁 Fallback mapped from orders.payment_reference:', effectiveRef);
                paystackResponse = await verifyWithPaystack(effectiveRef);
              }
            }
          }
        } catch (mapErr) {
          console.warn('Reference mapping attempt (client->server) failed:', mapErr);
        }
      }

      // B) Extra resilience for server-side refs and common input mistakes
      //    - Try a prefixed variant if user omitted the `txn_` prefix
      //    - Try DB prefix/contains lookups to recover truncated inputs
      if (notFound && !paystackResponse.ok) {
        try {
          // 0) If the provided reference is missing the txn_ prefix, try with it
          if (!/^txn_/.test(reference)) {
            const prefixed = `txn_${reference}`;
            console.log('🔎 Trying prefixed variant:', prefixed);
            mappingStrategy = 'prefix_added';
            paystackResponse = await verifyWithPaystack(prefixed);
            if (paystackResponse.ok) {
              effectiveRef = prefixed;
            }
          }

          // Only perform DB lookups if still not resolved
          if (!paystackResponse.ok) {
            // 1) Look up in payment_transactions by prefix match (original and prefixed)
            const tryPrefixes = [reference, /^txn_/.test(reference) ? reference : `txn_${reference}`];
            let matchedRef: string | null = null;
            for (const pfx of tryPrefixes) {
              const { data: byPrefix } = await supabaseClient
                .from('payment_transactions')
                .select('provider_reference')
                .ilike('provider_reference', `${pfx}%`)
                .order('created_at', { ascending: false })
                .maybeSingle();
              if (byPrefix?.provider_reference) {
                matchedRef = byPrefix.provider_reference as string;
                mappingStrategy = 'tx_prefix_match';
                console.log('🔁 Mapped by tx prefix to:', matchedRef);
                break;
              }
            }
            if (matchedRef) {
              effectiveRef = matchedRef;
              paystackResponse = await verifyWithPaystack(effectiveRef);
            }
          }

          // 2) If still not mapped, try orders.payment_reference by prefix (original and prefixed)
          if (!paystackResponse.ok) {
            const tryPrefixes = [reference, /^txn_/.test(reference) ? reference : `txn_${reference}`];
            let matchedRef: string | null = null;
            for (const pfx of tryPrefixes) {
              const { data: orderByPrefix } = await supabaseClient
                .from('orders')
                .select('payment_reference')
                .ilike('payment_reference', `${pfx}%`)
                .order('created_at', { ascending: false })
                .maybeSingle();
              if (orderByPrefix?.payment_reference) {
                matchedRef = orderByPrefix.payment_reference as string;
                mappingStrategy = 'orders_prefix_match';
                console.log('🔁 Mapped via orders.payment_reference prefix to:', matchedRef);
                break;
              }
            }
            if (matchedRef) {
              effectiveRef = matchedRef;
              paystackResponse = await verifyWithPaystack(effectiveRef);
            }
          }

          // 3) As a last resort, try contains match (handles truncated tails or missing prefix)
          if (!paystackResponse.ok) {
            const { data: byContains } = await supabaseClient
              .from('payment_transactions')
              .select('provider_reference')
              .ilike('provider_reference', `%${reference}%`)
              .order('created_at', { ascending: false })
              .maybeSingle();
            if (byContains?.provider_reference) {
              effectiveRef = byContains.provider_reference as string;
              mappingStrategy = 'tx_contains_match';
              console.log('🔁 Mapped by tx contains-match to:', effectiveRef);
              paystackResponse = await verifyWithPaystack(effectiveRef);
            }
          }

          if (!paystackResponse.ok) {
            const { data: orderContains } = await supabaseClient
              .from('orders')
              .select('payment_reference')
              .ilike('payment_reference', `%${reference}%`)
              .order('created_at', { ascending: false })
              .maybeSingle();
            if (orderContains?.payment_reference) {
              effectiveRef = orderContains.payment_reference as string;
              mappingStrategy = 'orders_contains_match';
              console.log('🔁 Mapped via orders.payment_reference contains-match to:', effectiveRef);
              paystackResponse = await verifyWithPaystack(effectiveRef);
            }
          }
        } catch (e) {
          console.warn('Prefix/contains-based reference mapping failed:', e);
        }
      }

      if (!paystackResponse.ok) {
        // Still failing after mapping — normalize to 200 with structured payload
        console.warn('🔚 Verification still failing after mapping attempts', { reference, effectiveRef, mappingStrategy });
        return new Response(JSON.stringify({
          status: false,
          error: `Paystack verification failed (${paystackResponse.status})`,
          message: 'Transaction reference not found or mismatched',
          data: null,
          diagnostics: {
            provided_reference: reference,
            effective_reference: effectiveRef,
            mapping_strategy: mappingStrategy,
            provider_status: paystackResponse.status
          }
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    const paystackData = await paystackResponse.json();
    if (!paystackData?.status) {
      console.error('Paystack verification failed:', paystackData);
      throw new Error(paystackData?.message || 'Failed to verify payment');
    }

    const tx = paystackData.data || {};

    // Persist verification outcome (best-effort) and let DB triggers/RPC handle order updates
    try {
      let metadataObj = parseMetadata(tx.metadata);
      let orderId: string | null = metadataObj.order_id || metadataObj.orderId || null;
      const orderNumber: string | null = metadataObj.order_number || metadataObj.orderNumber || null;

      // Resolve order id by payment_reference or number if needed
      if (!orderId) {
        const { data: byRef } = await supabaseClient
          .from('orders')
          .select('id')
          .or(`payment_reference.eq.${effectiveRef},id.eq.${effectiveRef}`)
          .maybeSingle();
        if (byRef?.id) orderId = byRef.id;
      }
      if (!orderId && orderNumber) {
        const { data: byNum } = await supabaseClient
          .from('orders')
          .select('id')
          .eq('order_number', orderNumber)
          .maybeSingle();
        if (byNum?.id) orderId = byNum.id;
      }

      const isSuccess = tx.status === 'success';
      const baseUpdate: any = {
        provider_reference: effectiveRef,
        transaction_type: 'charge',
        status: isSuccess ? 'paid' : tx.status || 'failed',
        amount: typeof tx.amount === 'number' ? tx.amount / 100 : null,
        currency: tx.currency || 'NGN',
        channel: tx.channel || 'online',
        gateway_response: tx.gateway_response || null,
        paid_at: tx.paid_at || new Date().toISOString(),
        customer_email: tx?.customer?.email || null,
        provider_response: tx || null,
        updated_at: new Date().toISOString()
      };
      const payload = orderId ? { ...baseUpdate, order_id: orderId } : baseUpdate;

      // Upsert by provider_reference when possible; if not, fallback to insert/update sequence
      let upsertError: any = null;
      try {
        const { error } = await supabaseClient
          .from('payment_transactions')
          .upsert(payload, { onConflict: 'provider_reference' });
        upsertError = error;
      } catch (e) {
        upsertError = e;
      }

      if (upsertError) {
        // Fallback: try to find and update
        const { data: existing } = await supabaseClient
          .from('payment_transactions')
          .select('id')
           .eq('provider_reference', effectiveRef)
          .maybeSingle();
        if (existing?.id) {
          await supabaseClient
            .from('payment_transactions')
            .update(payload)
            .eq('id', existing.id);
        } else {
          await supabaseClient.from('payment_transactions').insert({ ...payload, created_at: new Date().toISOString() });
        }
      }

      // Call NEW RPC to finalize (updates orders, creates payment transaction, logs)
      try {
        console.log('🔄 Calling new handle_successful_payment RPC for:', effectiveRef);
        const { data: rpcResult, error: rpcError } = await supabaseClient.rpc('handle_successful_payment', {
          p_paystack_reference: effectiveRef,
          p_order_reference: effectiveRef, // Same reference for consistency
          p_amount: typeof tx.amount === 'number' ? tx.amount / 100 : 0,
          p_currency: tx.currency || 'NGN',
          p_paystack_data: tx || {}
        });
        
        if (rpcError) {
          console.error('❌ handle_successful_payment RPC error:', rpcError);
        } else {
          console.log('✅ Payment processing result:', rpcResult);
          // Update order ID from RPC result if available
          if (rpcResult && typeof rpcResult === 'object' && rpcResult.order_id) {
            orderId = rpcResult.order_id;
          }
        }
      } catch (e) {
        console.error('❌ handle_successful_payment RPC crashed:', e);
      }

      // Ensure orders table has reference (idempotent)
      if (orderId) {
        await supabaseClient
          .from('orders')
          .update({ payment_reference: effectiveRef, updated_at: new Date().toISOString() })
          .eq('id', orderId);
      }

      // Audit
      await supabaseClient.from('audit_logs').insert({
        action: 'payment_verified',
        category: 'Payment',
        message: `Paystack verified: ${reference}`,
        new_values: { order_id: orderId, status: tx.status }
      });
    } catch (e) {
      console.warn('Verification persistence warning:', e);
    }

    // Fetch updated order details to return a definitive status and order info
    let orderInfo: any = null;
    try {
      const { data: txWithOrder } = await supabaseClient
        .from('payment_transactions')
        .select(`
          order_id,
          order:orders(
            id,
            order_number,
            status,
            payment_status,
            total_amount
          )
        `)
        .eq('provider_reference', effectiveRef)
        .maybeSingle();
      orderInfo = txWithOrder?.order ? txWithOrder.order : null;
    } catch (e) {
      console.warn('Could not fetch order info after verification:', e);
    }

    return new Response(JSON.stringify({
      status: true,
      data: {
        status: tx.status,
        amount: tx.amount,
        currency: tx.currency,
        customer: tx.customer,
        metadata: tx.metadata,
        paid_at: tx.paid_at,
        channel: tx.channel,
        gateway_response: tx.gateway_response,
        order_id: orderInfo?.id || null,
        order_number: orderInfo?.order_number || null,
        order_status: orderInfo?.status || null,
        payment_status: orderInfo?.payment_status || null,
        total_amount: orderInfo?.total_amount || null
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Payment verification error:', error);
    return new Response(JSON.stringify({ status: false, error: error?.message || 'Failed to verify payment' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
