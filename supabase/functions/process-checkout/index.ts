import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CheckoutRequest {
  customer_email: string;
  customer_name: string;
  order_items: Array<{
    product_id: string;
    quantity: number;
  }>;
  fulfillment_type: 'delivery' | 'pickup';
  delivery_address?: {
    address_line_1: string;
    address_line_2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
    phone?: string;
    delivery_instructions?: string;
  };
  pickup_point_id?: string;
  payment_method: 'bank_transfer' | 'cash_on_delivery' | 'paystack';
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const checkoutData: CheckoutRequest = await req.json();
    console.log('Processing checkout request:', JSON.stringify(checkoutData, null, 2));

    // Validate required fields
    if (!checkoutData.customer_email || !checkoutData.customer_name || !checkoutData.order_items || checkoutData.order_items.length === 0) {
      console.error('Missing required fields:', { 
        hasEmail: !!checkoutData.customer_email, 
        hasName: !!checkoutData.customer_name,
        hasItems: !!(checkoutData.order_items && checkoutData.order_items.length > 0)
      });
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate order items structure
    for (const item of checkoutData.order_items) {
      if (!item.product_id || !item.quantity || item.quantity <= 0) {
        console.error('Invalid item structure:', item);
        return new Response(
          JSON.stringify({ error: 'Each item must have product_id and positive quantity' }),
          { status: 400, headers: corsHeaders }
        );
      }
    }

    console.log('Calling create_order_with_items with:', {
      p_customer_email: checkoutData.customer_email,
      p_customer_name: checkoutData.customer_name,
      p_items: checkoutData.order_items
    });

    // Create order using the simplified RPC function
    const { data: orderResult, error: orderError } = await supabaseClient
      .rpc('create_order_with_items', {
        p_customer_email: checkoutData.customer_email,
        p_customer_name: checkoutData.customer_name,
        p_items: JSON.stringify(checkoutData.order_items) // Serialize to JSON string for jsonb parameter
      });

    if (orderError) {
      console.error('Error creating order:', orderError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to create order', 
          details: orderError.message,
          hint: orderError.hint 
        }),
        { status: 500, headers: corsHeaders }
      );
    }

    console.log('Order creation result:', orderResult);

    // Extract order ID from the returned JSON
    const orderId = orderResult?.order_id;
    const subtotal = orderResult?.subtotal || 0;

    if (!orderId) {
      console.error('No order ID returned from function');
      return new Response(
        JSON.stringify({ error: 'Failed to get order ID' }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Handle payment processing
    if (checkoutData.payment_method === 'paystack') {
      console.log('Processing Paystack payment for amount:', subtotal);
      
      // Generate unique reference for payment transaction
      const paymentReference = `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Insert payment transaction record
      const { data: paymentTransaction, error: paymentError } = await supabaseClient
        .from('payment_transactions')
        .insert({
          order_id: orderId,
          customer_email: checkoutData.customer_email,
          customer_name: checkoutData.customer_name,
          amount: subtotal,
          currency: 'NGN',
          payment_method: 'paystack',
          status: 'pending',
          provider_reference: paymentReference,
          transaction_type: 'charge'
        })
        .select()
        .single();

      if (paymentError) {
        console.error('Error creating payment transaction:', paymentError);
        return new Response(
          JSON.stringify({ error: 'Failed to create payment transaction' }),
          { status: 500, headers: corsHeaders }
        );
      }

      // Use paystack-secure function instead of direct API call
      const { data: paystackData, error: paystackError } = await supabaseClient.functions.invoke('paystack-secure', {
        body: {
          action: 'initialize',
          email: checkoutData.customer_email,
          amount: subtotal * 100, // Convert to kobo
          reference: paymentReference,
          channels: ['card', 'bank', 'ussd', 'mobile_money'],
          metadata: {
            order_id: orderId,
            customer_name: checkoutData.customer_name,
            customer_email: checkoutData.customer_email
          }
        }
      });

      if (paystackError || !paystackData?.status) {
        console.error('Paystack initialization failed:', paystackError || paystackData);
        return new Response(
          JSON.stringify({ error: 'Payment initialization failed' }),
          { status: 500, headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          order_id: orderId,
          payment_url: paystackData.data.authorization_url,
          reference: paymentReference
        }),
        { status: 200, headers: corsHeaders }
      );
    } else {
      // For other payment methods, trigger order confirmation email
      await supabaseClient.functions.invoke('enhanced-email-processor', {
        body: {
          event_type: 'order_confirmation',
          recipient_email: checkoutData.customer_email,
          order_id: orderId,
          priority: 'high'
        }
      });
    }

    // Log checkout completion
    await supabaseClient
      .from('audit_logs')
      .insert({
        action: 'checkout_completed',
        category: 'Order Management',
        message: `Checkout completed for order ${orderId}`,
        new_values: {
          order_id: orderId,
          customer_email: checkoutData.customer_email,
          payment_method: checkoutData.payment_method,
          subtotal: subtotal
        }
      });

    // Trigger enhanced email processor
    await supabaseClient.functions.invoke('enhanced-email-processor', {
      body: {
        event_type: 'order_created',
        recipient_email: checkoutData.customer_email,
        order_id: orderId
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        order_id: orderId,
        subtotal: subtotal,
        message: 'Order created successfully'
      }),
      { status: 200, headers: corsHeaders }
    );

  } catch (error) {
    console.error('Checkout processing error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message 
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});