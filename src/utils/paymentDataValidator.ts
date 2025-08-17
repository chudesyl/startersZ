export interface PaymentValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  missingFields: string[];
  data?: {
    payment_url?: string;
    authorization_url?: string;
    reference?: string;
    total_amount?: number;
    order_number?: string;
    access_code?: string;
  };
}

export interface PaymentData {
  payment?: {
    payment_url?: string;
    authorization_url?: string;
    reference?: string;
  };
  total_amount?: number;
  order_number?: string;
  order_id?: string;
  success?: boolean;
}

/**
 * Enhanced payment data validator that checks for required fields and provides detailed validation results
 */
export function validatePaymentInitializationData(responseData: any): PaymentValidationResult {
  console.log('🔍 Validating payment initialization data:', responseData);
  
  const result: PaymentValidationResult = {
    isValid: false,
    errors: [],
    warnings: [],
    missingFields: [],
    data: {}
  };

  // Check if response data exists
  if (!responseData) {
    result.errors.push('No response data received');
    console.error('❌ Payment validation failed: No response data');
    return result;
  }

  // Extract data for analysis
  result.data = {
    payment_url: responseData.payment?.payment_url,
    authorization_url: responseData.payment?.authorization_url,
    reference: responseData.payment?.reference,
    total_amount: responseData.total_amount,
    order_number: responseData.order_number
  };

  // Check success flag
  if (responseData.success !== true) {
    result.errors.push('Response indicates operation was not successful');
    console.error('❌ Payment validation failed: success !== true');
  }

  // Check payment object exists
  if (!responseData.payment) {
    result.errors.push('Payment object is missing from response');
    result.missingFields.push('payment');
    console.error('❌ Payment validation failed: Missing payment object');
  } else {
    // ✅ ENHANCED: Check for payment URL with access_code fallback
    const hasPaymentUrl = responseData.payment.payment_url || responseData.payment.authorization_url;
    const hasAccessCode = responseData.payment.access_code;
    
    if (!hasPaymentUrl && !hasAccessCode) {
      result.errors.push('Neither payment_url nor authorization_url found, and no access_code to build URL');
      result.missingFields.push('payment.payment_url / payment.authorization_url / payment.access_code');
      console.error('❌ Payment validation failed: Missing payment URLs and access_code');
    } else if (!hasPaymentUrl && hasAccessCode) {
      result.warnings.push('Payment URL missing but access_code present - will build URL from access_code');
      console.log('⚠️ Will build payment URL from access_code:', hasAccessCode);
      // Include access_code in extracted data for downstream processing
      result.data.access_code = responseData.payment.access_code;
    } else if (responseData.payment.authorization_url) {
      console.log('✅ Found authorization_url from Paystack - this is the correct response format');
    }

    // Check payment reference
    if (!responseData.payment.reference) {
      result.errors.push('Payment reference is missing');
      result.missingFields.push('payment.reference');
      console.error('❌ Payment validation failed: Missing payment reference');
    }
  }

  // Check total amount
  if (typeof responseData.total_amount !== 'number' || responseData.total_amount <= 0) {
    result.errors.push('Total amount is missing or invalid');
    result.missingFields.push('total_amount');
    console.error('❌ Payment validation failed: Invalid total_amount');
  }

  // Check order number
  if (!responseData.order_number) {
    result.errors.push('Order number is missing');
    result.missingFields.push('order_number');
    console.error('❌ Payment validation failed: Missing order_number');
  }

  // Set validation result
  result.isValid = result.errors.length === 0;

  // Log validation summary
  if (result.isValid) {
    console.log('✅ Payment validation successful:', {
      hasPaymentUrl: !!result.data.payment_url,
      hasAuthUrl: !!result.data.authorization_url,
      hasReference: !!result.data.reference,
      totalAmount: result.data.total_amount,
      orderNumber: result.data.order_number,
      warnings: result.warnings
    });
  } else {
    console.error('❌ Payment validation failed:', {
      errors: result.errors,
      missingFields: result.missingFields,
      warnings: result.warnings
    });
  }

  return result;
}

/**
 * Helper function to normalize payment data (convert authorization_url to payment_url if needed)
 */
export function normalizePaymentData(responseData: PaymentData): PaymentData {
  if (!responseData.payment) {
    return responseData;
  }

  // If we have authorization_url but no payment_url, use authorization_url as payment_url
  if (responseData.payment.authorization_url && !responseData.payment.payment_url) {
    console.log('🔄 Normalizing payment data: Using authorization_url as payment_url');
    return {
      ...responseData,
      payment: {
        ...responseData.payment,
        payment_url: responseData.payment.authorization_url
      }
    };
  }

  return responseData;
}

/**
 * Generate user-friendly error message based on validation result
 */
export function generateUserFriendlyErrorMessage(validationResult: PaymentValidationResult, responseData?: any): string {
  if (validationResult.isValid) {
    return '';
  }

  const { errors, missingFields } = validationResult;

  // ✅ ENHANCED: Better distinguish config vs connectivity issues
  
  // Check for payment data in various locations if responseData is provided
  if (responseData) {
    const hasPaymentData = responseData.payment || 
                          responseData.data || 
                          responseData.payment_url || 
                          responseData.authorization_url ||
                          (responseData.access_code ? true : false);

    if (!hasPaymentData && missingFields.includes('payment')) {
      return 'Payment system configuration issue. Please contact support.';
    }
  } else if (missingFields.includes('payment')) {
    return 'Payment system configuration issue. Please contact support.';
  }

  // Distinguish between missing URLs (config issue) vs connectivity issue
  if (missingFields.includes('payment.payment_url / payment.authorization_url / payment.access_code')) {
    return 'Payment system configuration issue. Please contact support.';
  } else if (missingFields.includes('payment.payment_url / payment.authorization_url')) {
    return 'Payment gateway connection failed. Please try again.';
  }

  if (missingFields.includes('payment.reference')) {
    return 'Payment reference could not be generated. Please refresh the page and try again.';
  }

  if (missingFields.includes('total_amount')) {
    return 'Order total calculation failed. Please refresh your cart and try again.';
  }

  if (missingFields.includes('order_number')) {
    return 'Order processing failed. Please try again or contact support.';
  }

  // Generic fallback
  return `Payment initialization failed: ${errors.join(', ')}. Please try again.`;
}