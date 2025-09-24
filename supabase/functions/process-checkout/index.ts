// supabase/functions/process-checkout/index.ts - Updated to fix reference mismatch
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders, handleCorsPreflightResponse } from "../_shared/cors.ts"

serve(async (req: Request) => {
  const origin = req.headers.get('Origin')
  
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightResponse(origin)
  }

  const corsHeaders = getCorsHeaders(origin)

  try {
    console.log('🚀 Starting checkout process...')
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json()
    console.log('📦 Checkout request:', JSON.stringify(body, null, 2))

    // Handle both old and new data structures
    const {
      items = [],
      customer = {},
      delivery = {},
      fulfillment = {},
      total_amount,
      idempotency_key
    } = body

    // Map fulfillment to delivery for backward compatibility
    const deliveryData = Object.keys(delivery).length > 0 ? delivery : {
      method: fulfillment.type === 'pickup' ? 'pickup' : 'delivery',
      location: fulfillment.pickup_point_id ? 'Pickup Point' : fulfillment.address || 'Main Store',
      address: fulfillment.address || '',
      fee: fulfillment.fee || 0
    }

    // Validate required fields
    if (!items.length) throw new Error('No items in cart')
    if (!customer.email) throw new Error('Customer email is required')

    // Calculate total_amount if missing (new structure)
    let calculatedTotalAmount = total_amount
    if (!calculatedTotalAmount || calculatedTotalAmount <= 0) {
      // Calculate from items - handle both unit_price and price fields
      const subtotal = items.reduce((sum: number, item: any) => {
        const itemPrice = item.price || item.unit_price || 0
        const itemQuantity = item.quantity || 1
        return sum + (itemPrice * itemQuantity)
      }, 0)
      
      const deliveryFee = deliveryData.fee || 0
      calculatedTotalAmount = subtotal + deliveryFee
      
      console.log('💰 Calculated total:', { subtotal, deliveryFee, calculatedTotalAmount })
    }

    if (!calculatedTotalAmount || calculatedTotalAmount <= 0) {
      throw new Error('Invalid total amount - please check your cart items')
    }

    // Generate consistent payment reference
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substr(2, 9)
    const paymentReference = `txn_${timestamp}_${randomId}`
    
    console.log('🏷️ Generated payment reference:', paymentReference)

    // Calculate amounts using production-ready logic
    const subtotal = items.reduce((sum: number, item: any) => {
      const itemPrice = item.price || item.unit_price || 0
      const itemQuantity = item.quantity || 1
      return sum + (itemPrice * itemQuantity)
    }, 0)
    const deliveryFee = deliveryData.fee || 0
    const finalTotal = calculatedTotalAmount // Use the validated total amount

    // Create order data with BOTH references
    const orderData = {
      id: crypto.randomUUID(),
      reference: paymentReference, // Use same reference for both
      payment_reference: paymentReference, // Critical: Store payment reference
      customer_email: customer.email,
      customer_name: customer.name || 'Guest Customer',
      customer_phone: customer.phone || '',
      items: items,
      subtotal: subtotal,
      delivery_fee: deliveryFee,
      total_amount: finalTotal,
      status: 'pending',
      payment_status: 'pending',
      delivery_method: deliveryData.method || 'pickup',
      delivery_location: deliveryData.location || 'Main Store',
      delivery_address: deliveryData.address || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      idempotency_key: idempotency_key || `checkout_${timestamp}_${randomId}`
    }

    console.log('💾 Creating order with references:', {
      order_id: orderData.id,
      reference: orderData.reference,
      payment_reference: orderData.payment_reference
    })

    // Insert order with upsert to handle duplicates
    const { data: orderResult, error: orderError } = await supabase
      .from('orders')
      .upsert(orderData, { 
        onConflict: 'idempotency_key',
        ignoreDuplicates: false 
      })
      .select()
      .single()

    if (orderError) {
      console.error('❌ Database error:', orderError)
      
      if (orderError.code === '23505') {
        // Handle duplicate - fetch existing order
        const { data: existingOrder } = await supabase
          .from('orders')
          .select('*')
          .eq('idempotency_key', orderData.idempotency_key)
          .single()
        
        if (existingOrder) {
          console.log('♻️ Using existing order:', existingOrder.id)
          
          // Ensure existing order has payment_reference
          if (!existingOrder.payment_reference) {
            await supabase
              .from('orders')
              .update({ payment_reference: paymentReference })
              .eq('id', existingOrder.id)
          }
          
          // Continue with existing order
          orderResult = existingOrder
        }
      }
      
      if (!orderResult) {
        throw new Error(`Database error: ${orderError.message}`)
      }
    }

    console.log('✅ Order created/found:', orderResult?.id)

    // Initialize Paystack payment
    const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY')
    if (!PAYSTACK_SECRET_KEY) {
      throw new Error('Paystack secret key not configured')
    }

    const paystackPayload = {
      email: customer.email,
      amount: finalTotal * 100, // Convert to kobo
      reference: paymentReference, // Use consistent reference
      callback_url: `https://startersmallchops.com/payment/callback?trxref=${paymentReference}&reference=${paymentReference}`,
      metadata: {
        order_id: orderResult?.id || orderData.id,
        customer_name: customer.name,
        items_count: items.length,
        order_reference: paymentReference
      }
    }

    console.log('💳 Initializing Paystack payment:', {
      reference: paystackPayload.reference,
      amount: paystackPayload.amount,
      email: paystackPayload.email
    })

    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(paystackPayload)
    })

    const paystackData = await paystackResponse.json()
    console.log('💳 Paystack response status:', paystackResponse.ok, paystackData.status)

    if (!paystackResponse.ok || !paystackData.status) {
      throw new Error(`Paystack error: ${paystackData.message || 'Payment initialization failed'}`)
    }

    // Update order with payment info - CRITICAL STEP
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        payment_reference: paymentReference, // Ensure this is set
        payment_url: paystackData.data.authorization_url,
        paystack_access_code: paystackData.data.access_code,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderResult?.id || orderData.id)

    if (updateError) {
      console.error('⚠️ Payment info update warning:', updateError)
    }

    console.log('✅ Checkout process completed successfully')

    // Verify the order was saved with correct reference
    const { data: verifyOrder } = await supabase
      .from('orders')
      .select('id, reference, payment_reference')
      .eq('id', orderResult?.id || orderData.id)
      .single()

    console.log('🔍 Order verification:', verifyOrder)

    return new Response(JSON.stringify({
      success: true,
      order: {
        id: orderResult?.id || orderData.id,
        reference: paymentReference,
        payment_reference: paymentReference,
        total_amount: finalTotal,
        status: 'pending'
      },
      payment: {
        authorization_url: paystackData.data.authorization_url,
        access_code: paystackData.data.access_code,
        reference: paymentReference
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })

  } catch (error) {
    console.error('❌ Checkout process failed:', error)
    
    return new Response(JSON.stringify({
      success: false,
      error: 'Checkout failed',
      details: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })
  }
})