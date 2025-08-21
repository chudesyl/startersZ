
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    console.log('🛒 Processing checkout request...');
    const requestBody = await req.json();

    console.log('📨 Checkout request received:', {
      customer_email: requestBody.customer?.email,
      items_count: requestBody.items?.length
    });

    // Validate request
    if (!requestBody.customer?.email) {
      throw new Error('Customer email is required');
    }
    if (!requestBody.items || requestBody.items.length === 0) {
      throw new Error('Order must contain at least one item');
    }
    if (!requestBody.fulfillment?.type) {
      throw new Error('Fulfillment type is required');
    }

    let customerId;
    const customerEmail = requestBody.customer.email.toLowerCase();

    // The FIX: First, check if a customer with this email already exists
    const { data: existingCustomer, error: findError } = await supabaseAdmin
      .from('customer_accounts')
      .select('id')
      .eq('email', customerEmail)
      .single();
    
    // Check for an error that is NOT a "not found" error.
    if (findError && findError.code !== 'PGRST116') {
      console.error('❌ Failed to check for existing customer:', findError);
      throw new Error('Failed to find customer account');
    }

    if (existingCustomer) {
      // If a customer is found, use their existing ID
      customerId = existingCustomer.id;
      console.log('👤 Using existing customer:', customerId);
    } else {
      // If no customer is found, proceed with creating a new account
      const { data: newCustomer, error: createError } = await supabaseAdmin.from('customer_accounts').insert({
        name: requestBody.customer.name,
        email: customerEmail,
        phone: requestBody.customer.phone,
        email_verified: false,
        phone_verified: false,
        profile_completion_percentage: 60
      }).select('id').single();
      
      if (createError) {
        console.error('❌ Customer creation failed:', createError);
        throw new Error('Failed to create customer account');
      }
      
      customerId = newCustomer.id;
      console.log('👤 Created new customer:', customerId);
    }
    
    // The rest of the logic remains unchanged, using the determined customerId
    console.log('📝 Creating order with items...');
    
    const orderItems = requestBody.items.map((item) => ({
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      customizations: item.customizations
    }));

    // Create order using the database function
    const { data: orderId, error: orderError } = await supabaseAdmin.rpc('create_order_with_items', {
      p_customer_id: customerId,
      p_fulfillment_type: requestBody.fulfillment.type,
      p_delivery_address: requestBody.fulfillment.address || null,
      p_pickup_point_id: requestBody.fulfillment.pickup_point_id || null,
      p_delivery_zone_id: requestBody.fulfillment.delivery_zone_id || null,
      p_guest_session_id: null,
      p_items: orderItems
    });

    if (orderError) {
      console.error('❌ Order creation failed:', orderError);
      throw new Error(`Order creation failed: ${orderError.message}`);
    }

    console.log('✅ Order created successfully:', orderId);
    
    const { data: order, error: fetchError } = await supabaseAdmin.from('orders').select('id, order_number, total_amount, customer_email').eq('id', orderId).single();

    if (fetchError || !order) {
      throw new Error('Failed to fetch created order');
    }

    console.log('💰 Order details:', {
      order_id: order.id,
      order_number: order.order_number,
      total_amount: order.total_amount,
      customer_email: order.customer_email
    });
    
    console.log('💳 Initializing payment via paystack-secure...');
    const { data: paymentData, error: paymentError } = await supabaseAdmin.functions.invoke('paystack-secure', {
      body: {
        action: 'initialize',
        email: order.customer_email,
        amount: order.total_amount,
        metadata: {
          order_id: order.id,
          customer_name: requestBody.customer.name,
          order_number: order.order_number,
          fulfillment_type: requestBody.fulfillment.type,
          items_subtotal: order.total_amount,
          delivery_fee: 0,
          client_total: order.total_amount,
          authoritative_total: order.total_amount
        },
        // FIX: Removed the __REFERENCE__ placeholder. Paystack automatically appends the reference to the callback URL.
        callback_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/payment-callback?order_id=${order.id}`
      }
    });

    if (paymentError) {
      console.error('❌ Payment initialization failed:', paymentError);
      throw new Error(`Payment initialization failed: ${paymentError.message}`);
    }

    console.log('✅ Payment initialized successfully via paystack-secure');

    return new Response(JSON.stringify({
      success: true,
      order: {
        id: order.id,
        order_number: order.order_number,
        total_amount: order.total_amount,
        status: 'pending'
      },
      customer: {
        id: customerId,
        email: order.customer_email
      },
      payment: {
        authorization_url: paymentData.data?.authorization_url || paymentData.authorization_url,
        reference: paymentData.data?.reference || paymentData.reference
      }
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('❌ Checkout processing error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Checkout processing failed',
      details: {
        timestamp: new Date().toISOString(),
        error_type: error.constructor.name
      }
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
