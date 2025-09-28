#!/usr/bin/env tsx

/**
 * Test harness for order status email sender
 * 
 * Usage:
 * - Edit the TEST_CONFIG below with your test settings
 * - Run: npm run tsx src/utils/testOrderStatusEmailSender.ts
 * - Or: ts-node src/utils/testOrderStatusEmailSender.ts
 * 
 * This script will test sending all order status emails to verify the system works correctly.
 */

import { sendOrderStatusEmail, sendTestOrderStatusEmail } from './sendOrderStatusEmail';
import { orderStatusTemplates } from '@/emailTemplates/orderStatusTemplates';

// ⚠️ EDIT THESE SETTINGS BEFORE RUNNING THE TEST
const TEST_CONFIG = {
  // Change this to your test email address
  recipientEmail: 'test@example.com',
  
  // Test order details
  orderNumber: 'TEST-ORD-' + Date.now(),
  customerName: 'Test Customer',
  adminEmail: 'admin@smallchops.com',
  
  // Which statuses to test (set to false to skip)
  testStatuses: {
    pending: true,
    confirmed: true,
    preparing: true,
    ready: true,
    out_for_delivery: true,
    delivered: true,
    cancelled: false // Usually skip cancelled in tests
  }
};

/**
 * Test individual email status
 */
async function testStatusEmail(status: string): Promise<boolean> {
  try {
    console.log(`\n🧪 Testing ${status} email...`);
    
    await sendOrderStatusEmail(
      TEST_CONFIG.recipientEmail,
      status,
      TEST_CONFIG.orderNumber,
      {
        customerName: TEST_CONFIG.customerName,
        adminEmail: TEST_CONFIG.adminEmail
      }
    );
    
    console.log(`✅ ${status} email sent successfully`);
    return true;
  } catch (error) {
    console.error(`❌ ${status} email failed:`, error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Test all email templates
 */
async function testAllEmailTemplates(): Promise<void> {
  console.log('🚀 Starting Order Status Email Test Suite');
  console.log('📧 Recipient:', TEST_CONFIG.recipientEmail);
  console.log('📦 Order Number:', TEST_CONFIG.orderNumber);
  console.log('👤 Customer Name:', TEST_CONFIG.customerName);
  console.log('🔧 Admin Email:', TEST_CONFIG.adminEmail);
  
  const results: { [key: string]: boolean } = {};
  let totalTests = 0;
  let passedTests = 0;
  
  // Test each enabled status
  for (const [status, enabled] of Object.entries(TEST_CONFIG.testStatuses)) {
    if (enabled) {
      totalTests++;
      const success = await testStatusEmail(status);
      results[status] = success;
      if (success) passedTests++;
      
      // Small delay between emails to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Print summary
  console.log('\n📊 Test Results Summary:');
  console.log('━'.repeat(50));
  
  for (const [status, result] of Object.entries(results)) {
    const icon = result ? '✅' : '❌';
    console.log(`${icon} ${status.padEnd(20)} ${result ? 'PASSED' : 'FAILED'}`);
  }
  
  console.log('━'.repeat(50));
  console.log(`📈 Overall: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All tests passed! Email system is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Please check the errors above.');
  }
}

/**
 * Test template generation (without sending)
 */
function testTemplateGeneration(): void {
  console.log('\n🔍 Testing Template Generation:');
  
  const testData = {
    customerName: TEST_CONFIG.customerName,
    orderNumber: TEST_CONFIG.orderNumber,
    adminEmail: TEST_CONFIG.adminEmail
  };
  
  for (const [status, enabled] of Object.entries(TEST_CONFIG.testStatuses)) {
    if (enabled) {
      try {
        const templateKey = status as keyof typeof orderStatusTemplates;
        const template = orderStatusTemplates[templateKey](testData);
        
        console.log(`✅ ${status} template generated:`);
        console.log(`   Subject: ${template.subject}`);
        console.log(`   HTML Length: ${template.html.length} chars`);
        console.log(`   Text Length: ${template.text.length} chars`);
      } catch (error) {
        console.error(`❌ ${status} template failed:`, error instanceof Error ? error.message : error);
      }
    }
  }
}

/**
 * Main test runner
 */
async function runTests(): Promise<void> {
  console.log('🧪 Order Status Email Test Harness');
  console.log('=' .repeat(60));
  
  // Validate configuration
  if (!TEST_CONFIG.recipientEmail || TEST_CONFIG.recipientEmail === 'test@example.com') {
    console.error('⚠️  Please edit TEST_CONFIG.recipientEmail with a valid email address');
    process.exit(1);
  }
  
  try {
    // First test template generation
    testTemplateGeneration();
    
    // Then test actual email sending
    await testAllEmailTemplates();
    
    console.log('\n✨ Test suite completed!');
    console.log('📧 Check your inbox at:', TEST_CONFIG.recipientEmail);
    
  } catch (error) {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  }
}

/**
 * Quick test function for single status
 */
export async function quickTest(status: string = 'confirmed'): Promise<void> {
  console.log(`🏃‍♂️ Quick test: Sending ${status} email to ${TEST_CONFIG.recipientEmail}`);
  
  try {
    await sendTestOrderStatusEmail(TEST_CONFIG.recipientEmail, status);
    console.log('✅ Quick test completed successfully!');
  } catch (error) {
    console.error('❌ Quick test failed:', error);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

export { runTests, testStatusEmail, testTemplateGeneration };
export default runTests;