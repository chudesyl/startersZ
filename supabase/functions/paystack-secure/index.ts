import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const VERSION = "v2025-08-17-fixed";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE'
};

serve(async (req) => {
  console.log(`🔄 Paystack secure function called [${VERSION}]`);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // FIX: Use ANON_KEY instead of SERVICE_ROLE_KEY for standard operations
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '', 
      Deno.env.get('SUPABASE_ANON_KEY') ?? '', 
      {
        auth: { persistSession: false }
      }
    );

    const requestBody = await req.json();
    console.log('📨 Request payload:', JSON.stringify(requestBody, null, 2));

    const { action, ...requestData } = requestBody;

    if (action === 'initialize') {
      return await initializePayment(supabaseClient, requestData);
    } else if (action === 'verify') {
      return await verifyPayment(supabaseClient, requestData);
    } else {
      return new Response(JSON.stringify({
        status: false,
        error: 'Invalid action specified'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('❌ Paystack secure operation error:', error);
    return new Response(JSON.stringify({
      status: false,
      error: 'Operation failed',
      message: error.message,
      version: VERSION
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function initializePayment(supabaseClient, requestData) {
  try {
    const { email, amount, reference, metadata, channels } = requestData;

    // Input validation
    if (!email || !amount) {
      throw new Error('Email and amount are required');
    }

    // 🔧 SAFETY NET: Recompute authoritative amount if order_id provided
    let authoritativeAmount = amount;
    if (metadata?.order_id) {
      try {
        console.log('🔍 Verifying amount for order:', metadata.order_id);
        
        const serviceClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
          { auth: { persistSession: false } }
        );

        const { data: orderData } = await serviceClient
          .from('orders')
          .select('total_amount, delivery_fee')
          .eq('id', metadata.order_id)
          .single();

        if (orderData) {
          const computedAmount = (orderData.total_amount || 0) + (orderData.delivery_fee || 0);
          
          console.log('💰 Amount verification:', {
            provided_amount: amount,
            computed_amount: computedAmount,
            discrepancy: Math.abs(computedAmount - amount)
          });

          // Use computed amount if there's a significant discrepancy
          if (Math.abs(computedAmount - amount) > 0.01) {
            console.log('⚠️ Amount discrepancy detected, using computed amount');
            authoritativeAmount = computedAmount;
          }
        }
      } catch (error) {
        console.error('⚠️ Amount verification failed, using provided amount:', error);
      }
    }

    // FIX: Use provided reference if available, generate only if missing
    let transactionRef = reference;
    if (!transactionRef) {
      transactionRef = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      console.log('🆕 Generated new reference:', transactionRef);
    } else {
      console.log('✅ Using provided reference:', transactionRef);
      
      // Validate reference format
      if (!transactionRef.startsWith('txn_') && !transactionRef.startsWith('pay_')) {
        console.log('⚠️ Invalid reference format, generating new one');
        transactionRef = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }
      
      // Convert pay_ to txn_ for consistency
      if (transactionRef.startsWith('pay_')) {
        const oldRef = transactionRef;
        transactionRef = transactionRef.replace('pay_', 'txn_');
        console.log(`🔄 Converted reference: ${oldRef} -> ${transactionRef}`);
      }
    }

    // Amount validation and conversion using authoritative amount
    const amountInKobo = Math.round(parseFloat(authoritativeAmount) * 100);
    if (isNaN(amountInKobo) || amountInKobo < 100) {
      throw new Error('Amount must be a number equal to or greater than ₦1.00');
    }

    console.log('💰 Authoritative amount conversion details:', {
      original_amount: amount,
      authoritative_amount: authoritativeAmount,
      amount_in_kobo: amountInKobo,
      amount_in_naira: amountInKobo / 100,
      metadata: metadata
    })

    console.log(`💳 Initializing payment: ${transactionRef} for ${email}, amount: ₦${amountInKobo/100}`);

    // FIX: Get secret key from environment variables instead of database
    const secretKey = Deno.env.get('PAYSTACK_SECRET_KEY') || 
                     Deno.env.get('PAYSTACK_SECRET_KEY_TEST') || 
                     Deno.env.get('PAYSTACK_SECRET_KEY_LIVE');
    
    if (!secretKey) {
      console.error('❌ No Paystack secret key found in environment');
      throw new Error('Paystack secret key not configured');
    }

    console.log('🔑 Using Paystack secret key:', secretKey.substring(0, 10) + '...');

    // Use provided callback_url or default to frontend success page
    const callbackUrl = requestData.callback_url || `${Deno.env.get('FRONTEND_URL') || 'https://startersmallchops.com'}/checkout/success`;

    // Prepare Paystack payload
    const paystackPayload = {
      email,
      amount: amountInKobo.toString(),
      currency: 'NGN',
      reference: transactionRef,
      callback_url: callbackUrl, // FIX: Added callback URL
      channels: channels || ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'],
      metadata: metadata || {} // FIX: Keep as object, don't stringify
    };

    console.log('🚀 Sending to Paystack:', JSON.stringify(paystackPayload, null, 2));

    // Initialize payment with Paystack
    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(paystackPayload)
    });

    console.log('📡 Paystack response status:', paystackResponse.status);

    if (!paystackResponse.ok) {
      const errorText = await paystackResponse.text();
      console.error('❌ Paystack HTTP error:', paystackResponse.status, errorText);
      
      let errorDetails = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorDetails = errorJson.message || errorJson.error || errorText;
      } catch (e) {
        // Use raw text if JSON parsing fails
      }
      
      throw new Error(`Paystack API error (${paystackResponse.status}): ${errorDetails}`);
    }

    const paystackData = await paystackResponse.json();
    console.log('📦 Paystack response data:', JSON.stringify(paystackData, null, 2));

    if (!paystackData.status) {
      console.error('❌ Paystack initialization failed:', paystackData);
      throw new Error(paystackData.message || 'Failed to initialize payment');
    }

    // FIX: Validate required fields before returning
    if (!paystackData.data?.authorization_url || !paystackData.data?.access_code) {
      console.error('❌ Missing required fields in Paystack response');
      throw new Error('Missing authorization_url or access_code from Paystack');
    }

    console.log('✅ Paystack payment initialized successfully:', paystackData.data.reference);

    // Create payment transaction record using service role client
    try {
      const serviceClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { persistSession: false } }
      )

      const { error: transactionError } = await serviceClient
        .from('payment_transactions')
        .upsert({
          reference: transactionRef,
          provider_reference: paystackData.data.reference,
          amount: amountInKobo / 100, // Convert back to naira
          status: 'pending',
          provider: 'paystack',
          customer_email: email,
          authorization_url: paystackData.data.authorization_url,
          access_code: paystackData.data.access_code,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'reference'
        })
      
      if (transactionError) {
        console.error('⚠️ Failed to create payment transaction record:', transactionError)
      } else {
        console.log('✅ Payment transaction record created successfully')
      }
    } catch (dbError) {
      console.error('⚠️ Database error creating transaction record:', dbError)
      // Non-blocking - payment initialization should still succeed
    }

    return new Response(JSON.stringify({
      status: true,
      data: {
        authorization_url: paystackData.data.authorization_url,
        access_code: paystackData.data.access_code,
        reference: paystackData.data.reference
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Payment initialization error:', error);
    return new Response(JSON.stringify({
      status: false,
      error: error.message || 'Failed to initialize payment'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function verifyPayment(supabaseClient, requestData) {
  try {
    const { reference } = requestData;

    if (!reference) {
      throw new Error('Payment reference is required');
    }

    console.log('🔍 Verifying payment:', reference);

    // FIX: Get secret key from environment variables
    const secretKey = Deno.env.get('PAYSTACK_SECRET_KEY') || 
                     Deno.env.get('PAYSTACK_SECRET_KEY_TEST') || 
                     Deno.env.get('PAYSTACK_SECRET_KEY_LIVE');
    
    if (!secretKey) {
      throw new Error('Paystack secret key not configured');
    }

    // Verify payment with Paystack
    const paystackResponse = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!paystackResponse.ok) {
      const errorText = await paystackResponse.text();
      console.error('❌ Paystack verification HTTP error:', paystackResponse.status, errorText);
      throw new Error(`Paystack verification failed (${paystackResponse.status}): ${errorText}`);
    }

    const paystackData = await paystackResponse.json();

    if (!paystackData.status) {
      console.error('❌ Paystack verification failed:', paystackData);
      throw new Error(paystackData.message || 'Failed to verify payment');
    }

    console.log('✅ Paystack payment verified successfully:', reference);

    // Update database records after successful verification using service role
    if (paystackData.data.status === 'success') {
      try {
        const serviceClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
          { auth: { persistSession: false } }
        )

        // Update payment transaction
        const { error: transactionUpdateError } = await serviceClient
          .from('payment_transactions')
          .update({ 
            status: 'completed',
            verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('reference', reference)

        if (transactionUpdateError) {
          console.error('⚠️ Failed to update payment transaction:', transactionUpdateError)
        }

        // Update order status
        const { error: orderUpdateError } = await serviceClient
          .from('orders')
          .update({ 
            status: 'confirmed',
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('payment_reference', reference)

        if (orderUpdateError) {
          console.error('⚠️ Failed to update order status:', orderUpdateError)
        } else {
          console.log('✅ Database records updated after verification')
        }
      } catch (dbError) {
        console.error('⚠️ Failed to update database after verification:', dbError)
        // Don't fail the verification response
      }
    }

    return new Response(JSON.stringify({
      status: true,
      data: {
        status: paystackData.data.status,
        amount: paystackData.data.amount,
        currency: paystackData.data.currency,
        customer: paystackData.data.customer,
        metadata: paystackData.data.metadata,
        paid_at: paystackData.data.paid_at,
        channel: paystackData.data.channel,
        gateway_response: paystackData.data.gateway_response,
        reference: reference
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Payment verification error:', error);
    return new Response(JSON.stringify({
      status: false,
      error: error.message || 'Failed to verify payment'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}