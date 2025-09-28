import { orderStatusTemplates } from '@/emailTemplates/orderStatusTemplates';
import { supabase } from '@/integrations/supabase/client';

interface EmailData {
  customerName: string;
  adminEmail?: string;
  [key: string]: any;
}

/**
 * Send order status email notification using the existing email service infrastructure
 * @param customerEmail - Recipient email
 * @param status - Order status (pending, confirmed, preparing, ready, out_for_delivery, delivered, cancelled)
 * @param orderNumber - Order number/ID
 * @param data - Additional email template data
 */
export const sendOrderStatusEmail = async (
  customerEmail: string,
  status: string,
  orderNumber: string,
  data: EmailData = { customerName: 'Valued Customer' }
): Promise<void> => {
  try {
    // Get the appropriate template
    const templateKey = status as keyof typeof orderStatusTemplates;
    
    if (!orderStatusTemplates[templateKey]) {
      throw new Error(`No email template found for status: ${status}`);
    }

    const templateData = {
      customerName: data.customerName || 'Valued Customer',
      orderNumber,
      adminEmail: data.adminEmail || 'admin@example.com',
      ...data
    };

    const template = orderStatusTemplates[templateKey](templateData);

    // Use the existing Supabase edge function for sending emails
    console.log('📧 Sending order status email via unified SMTP sender:', {
      to: customerEmail,
      status,
      orderNumber
    });

    const { data: result, error } = await supabase.functions.invoke('unified-smtp-sender', {
      body: {
        to: customerEmail,
        subject: template.subject,
        textContent: template.text,
        htmlContent: template.html,
        templateKey: `order_${status}`,
        templateData,
        emailType: 'transactional',
        category: 'order_status'
      }
    });

    if (error) {
      console.error('❌ SMTP function error:', error);
      throw new Error(`Email sending failed: ${error.message}`);
    }

    if (result && !result.success && result.error) {
      console.error('❌ SMTP service error:', result.error);
      throw new Error(`SMTP Error: ${result.error}`);
    }

    console.log('✅ Order status email sent successfully:', {
      to: customerEmail,
      status,
      orderNumber,
      result
    });

  } catch (error) {
    console.error('💥 Order status email sending failed:', error);
    throw error;
  }
};

/**
 * Send a test order status email for debugging purposes
 * @param recipientEmail - Test recipient email
 * @param status - Status to test
 * @param orderNumber - Test order number
 */
export const sendTestOrderStatusEmail = async (
  recipientEmail: string,
  status: string = 'confirmed',
  orderNumber: string = 'TEST-ORDER-001'
): Promise<void> => {
  const testData = {
    customerName: 'Test Customer',
    adminEmail: 'test-admin@example.com'
  };

  return sendOrderStatusEmail(recipientEmail, status, orderNumber, testData);
};

export default sendOrderStatusEmail;