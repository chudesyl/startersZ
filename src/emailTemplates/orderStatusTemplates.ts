interface EmailTemplateData {
  customerName: string;
  orderNumber: string;
  adminEmail?: string;
}

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export const orderStatusTemplates = {
  pending: (data: EmailTemplateData): EmailTemplate => ({
    subject: `Order ${data.orderNumber} - Pending Confirmation`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
          <h2 style="color: #333; margin-top: 0;">Order Pending Confirmation</h2>
          
          <p>Dear ${data.customerName},</p>
          
          <p>Thank you for your order! Your order <strong>#${data.orderNumber}</strong> is currently pending confirmation.</p>
          
          <p>We will review your order shortly and send you an update once it's confirmed.</p>
          
          <div style="background-color: #fff; padding: 15px; border-radius: 4px; margin: 20px 0;">
            <p style="margin: 0; color: #666;">Order Number: <strong>${data.orderNumber}</strong></p>
            <p style="margin: 5px 0 0 0; color: #666;">Status: <strong>Pending</strong></p>
          </div>
          
          <p>If you have any questions, please don't hesitate to contact us.</p>
          
          <p>Thank you for choosing us!</p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">
            This is an automated message from ${data.adminEmail || 'our system'}. Please do not reply to this email.
          </p>
        </div>
      </div>
    `,
    text: `
Order Pending Confirmation

Dear ${data.customerName},

Thank you for your order! Your order #${data.orderNumber} is currently pending confirmation.

We will review your order shortly and send you an update once it's confirmed.

Order Number: ${data.orderNumber}
Status: Pending

If you have any questions, please don't hesitate to contact us.

Thank you for choosing us!

This is an automated message from ${data.adminEmail || 'our system'}. Please do not reply to this email.
    `
  }),

  confirmed: (data: EmailTemplateData): EmailTemplate => ({
    subject: `Order ${data.orderNumber} - Confirmed!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
          <h2 style="color: #28a745; margin-top: 0;">✅ Order Confirmed!</h2>
          
          <p>Dear ${data.customerName},</p>
          
          <p>Great news! Your order <strong>#${data.orderNumber}</strong> has been confirmed and is now being processed.</p>
          
          <p>We're getting your items ready and will send you another update when your order is being prepared.</p>
          
          <div style="background-color: #d4edda; padding: 15px; border-radius: 4px; margin: 20px 0; border-left: 4px solid #28a745;">
            <p style="margin: 0; color: #155724;">Order Number: <strong>${data.orderNumber}</strong></p>
            <p style="margin: 5px 0 0 0; color: #155724;">Status: <strong>Confirmed</strong></p>
          </div>
          
          <p>Thank you for your patience and for choosing us!</p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">
            This is an automated message from ${data.adminEmail || 'our system'}. Please do not reply to this email.
          </p>
        </div>
      </div>
    `,
    text: `
Order Confirmed!

Dear ${data.customerName},

Great news! Your order #${data.orderNumber} has been confirmed and is now being processed.

We're getting your items ready and will send you another update when your order is being prepared.

Order Number: ${data.orderNumber}
Status: Confirmed

Thank you for your patience and for choosing us!

This is an automated message from ${data.adminEmail || 'our system'}. Please do not reply to this email.
    `
  }),

  preparing: (data: EmailTemplateData): EmailTemplate => ({
    subject: `Order ${data.orderNumber} - Now Preparing`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
          <h2 style="color: #007bff; margin-top: 0;">👨‍🍳 Order Being Prepared</h2>
          
          <p>Dear ${data.customerName},</p>
          
          <p>Your order <strong>#${data.orderNumber}</strong> is now being prepared by our kitchen team!</p>
          
          <p>We're carefully preparing each item to ensure the highest quality. We'll notify you as soon as your order is ready.</p>
          
          <div style="background-color: #cce5ff; padding: 15px; border-radius: 4px; margin: 20px 0; border-left: 4px solid #007bff;">
            <p style="margin: 0; color: #004085;">Order Number: <strong>${data.orderNumber}</strong></p>
            <p style="margin: 5px 0 0 0; color: #004085;">Status: <strong>Preparing</strong></p>
          </div>
          
          <p>Thank you for your patience!</p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">
            This is an automated message from ${data.adminEmail || 'our system'}. Please do not reply to this email.
          </p>
        </div>
      </div>
    `,
    text: `
Order Being Prepared

Dear ${data.customerName},

Your order #${data.orderNumber} is now being prepared by our kitchen team!

We're carefully preparing each item to ensure the highest quality. We'll notify you as soon as your order is ready.

Order Number: ${data.orderNumber}
Status: Preparing

Thank you for your patience!

This is an automated message from ${data.adminEmail || 'our system'}. Please do not reply to this email.
    `
  }),

  ready: (data: EmailTemplateData): EmailTemplate => ({
    subject: `Order ${data.orderNumber} - Ready for Pickup/Delivery!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
          <h2 style="color: #ffc107; margin-top: 0;">🎉 Order Ready!</h2>
          
          <p>Dear ${data.customerName},</p>
          
          <p>Excellent news! Your order <strong>#${data.orderNumber}</strong> is now ready for pickup or delivery!</p>
          
          <p>If this is a pickup order, you can collect it at your convenience during our business hours. 
          If it's a delivery order, our delivery team will be in touch shortly.</p>
          
          <div style="background-color: #fff3cd; padding: 15px; border-radius: 4px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <p style="margin: 0; color: #856404;">Order Number: <strong>${data.orderNumber}</strong></p>
            <p style="margin: 5px 0 0 0; color: #856404;">Status: <strong>Ready</strong></p>
          </div>
          
          <p>Thank you for your order!</p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">
            This is an automated message from ${data.adminEmail || 'our system'}. Please do not reply to this email.
          </p>
        </div>
      </div>
    `,
    text: `
Order Ready!

Dear ${data.customerName},

Excellent news! Your order #${data.orderNumber} is now ready for pickup or delivery!

If this is a pickup order, you can collect it at your convenience during our business hours. 
If it's a delivery order, our delivery team will be in touch shortly.

Order Number: ${data.orderNumber}
Status: Ready

Thank you for your order!

This is an automated message from ${data.adminEmail || 'our system'}. Please do not reply to this email.
    `
  }),

  out_for_delivery: (data: EmailTemplateData): EmailTemplate => ({
    subject: `Order ${data.orderNumber} - Out for Delivery!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
          <h2 style="color: #17a2b8; margin-top: 0;">🚚 Order Out for Delivery!</h2>
          
          <p>Dear ${data.customerName},</p>
          
          <p>Your order <strong>#${data.orderNumber}</strong> is now out for delivery!</p>
          
          <p>Our delivery rider is on the way to your location. Please ensure someone is available to receive the order.</p>
          
          <div style="background-color: #d1ecf1; padding: 15px; border-radius: 4px; margin: 20px 0; border-left: 4px solid #17a2b8;">
            <p style="margin: 0; color: #0c5460;">Order Number: <strong>${data.orderNumber}</strong></p>
            <p style="margin: 5px 0 0 0; color: #0c5460;">Status: <strong>Out for Delivery</strong></p>
          </div>
          
          <p>You should receive your order shortly!</p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">
            This is an automated message from ${data.adminEmail || 'our system'}. Please do not reply to this email.
          </p>
        </div>
      </div>
    `,
    text: `
Order Out for Delivery!

Dear ${data.customerName},

Your order #${data.orderNumber} is now out for delivery!

Our delivery rider is on the way to your location. Please ensure someone is available to receive the order.

Order Number: ${data.orderNumber}
Status: Out for Delivery

You should receive your order shortly!

This is an automated message from ${data.adminEmail || 'our system'}. Please do not reply to this email.
    `
  }),

  delivered: (data: EmailTemplateData): EmailTemplate => ({
    subject: `Order ${data.orderNumber} - Delivered Successfully!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
          <h2 style="color: #28a745; margin-top: 0;">✅ Order Delivered!</h2>
          
          <p>Dear ${data.customerName},</p>
          
          <p>Your order <strong>#${data.orderNumber}</strong> has been successfully delivered!</p>
          
          <p>We hope you enjoy your order. If you have any issues or feedback, please don't hesitate to contact us.</p>
          
          <div style="background-color: #d4edda; padding: 15px; border-radius: 4px; margin: 20px 0; border-left: 4px solid #28a745;">
            <p style="margin: 0; color: #155724;">Order Number: <strong>${data.orderNumber}</strong></p>
            <p style="margin: 5px 0 0 0; color: #155724;">Status: <strong>Delivered</strong></p>
          </div>
          
          <p>Thank you for choosing us and we look forward to serving you again!</p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">
            This is an automated message from ${data.adminEmail || 'our system'}. Please do not reply to this email.
          </p>
        </div>
      </div>
    `,
    text: `
Order Delivered!

Dear ${data.customerName},

Your order #${data.orderNumber} has been successfully delivered!

We hope you enjoy your order. If you have any issues or feedback, please don't hesitate to contact us.

Order Number: ${data.orderNumber}
Status: Delivered

Thank you for choosing us and we look forward to serving you again!

This is an automated message from ${data.adminEmail || 'our system'}. Please do not reply to this email.
    `
  }),

  cancelled: (data: EmailTemplateData): EmailTemplate => ({
    subject: `Order ${data.orderNumber} - Cancelled`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
          <h2 style="color: #dc3545; margin-top: 0;">❌ Order Cancelled</h2>
          
          <p>Dear ${data.customerName},</p>
          
          <p>We regret to inform you that your order <strong>#${data.orderNumber}</strong> has been cancelled.</p>
          
          <p>If you have any questions about this cancellation or need assistance placing a new order, please contact us.</p>
          
          <div style="background-color: #f8d7da; padding: 15px; border-radius: 4px; margin: 20px 0; border-left: 4px solid #dc3545;">
            <p style="margin: 0; color: #721c24;">Order Number: <strong>${data.orderNumber}</strong></p>
            <p style="margin: 5px 0 0 0; color: #721c24;">Status: <strong>Cancelled</strong></p>
          </div>
          
          <p>We apologize for any inconvenience and appreciate your understanding.</p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">
            This is an automated message from ${data.adminEmail || 'our system'}. Please do not reply to this email.
          </p>
        </div>
      </div>
    `,
    text: `
Order Cancelled

Dear ${data.customerName},

We regret to inform you that your order #${data.orderNumber} has been cancelled.

If you have any questions about this cancellation or need assistance placing a new order, please contact us.

Order Number: ${data.orderNumber}
Status: Cancelled

We apologize for any inconvenience and appreciate your understanding.

This is an automated message from ${data.adminEmail || 'our system'}. Please do not reply to this email.
    `
  })
};

export default orderStatusTemplates;