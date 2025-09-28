/**
 * Basic tests for admin user validation utilities
 * These tests verify the security validation logic
 */

import { 
  validateAdminEmail, 
  validateAdminPassword, 
  validateAdminRole,
  validateAdminUserData,
  generateUniqueUsername,
  checkSecurityRisks
} from '../admin-user';

describe('Admin User Validation', () => {
  describe('validateAdminEmail', () => {
    test('should accept valid emails', () => {
      const result = validateAdminEmail('admin@startersmallchops.com');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject invalid email formats', () => {
      const result = validateAdminEmail('invalid-email');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid email format');
    });

    test('should warn about non-approved domains', () => {
      const result = validateAdminEmail('admin@example.com');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    test('should sanitize email addresses', () => {
      const result = validateAdminEmail('  ADMIN@Gmail.COM  ');
      expect(result.sanitizedData?.email).toBe('admin@gmail.com');
    });
  });

  describe('validateAdminPassword', () => {
    test('should accept strong passwords', () => {
      const result = validateAdminPassword('MyStr0ng!Passw0rd#2024');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject short passwords', () => {
      const result = validateAdminPassword('short');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 12 characters long');
    });

    test('should reject passwords without complexity', () => {
      const result = validateAdminPassword('alllowercase');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should reject common patterns', () => {
      const result = validateAdminPassword('Password123!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Password cannot contain common patterns like 'password'");
    });

    test('should reject passwords containing email parts', () => {
      const result = validateAdminPassword('johnsmith123!', 'john.smith@example.com');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password cannot contain parts of your email address');
    });
  });

  describe('validateAdminRole', () => {
    test('should accept valid roles', () => {
      const result = validateAdminRole('admin');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject invalid roles', () => {
      const result = validateAdminRole('invalid_role');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid role. Must be one of: admin, manager, staff, dispatch_rider');
    });

    test('should warn about admin role', () => {
      const result = validateAdminRole('admin');
      expect(result.warnings).toContain('Admin role grants full system access. Ensure this is intentional.');
    });
  });

  describe('validateAdminUserData', () => {
    test('should validate complete user data', () => {
      const result = validateAdminUserData({
        email: 'admin@startersmallchops.com',
        role: 'admin',
        password: 'MyStr0ng!Passw0rd#2024',
        username: 'admin_user'
      });

      expect(result.valid).toBe(true);
      expect(result.sanitizedData).toBeDefined();
    });

    test('should aggregate validation errors', () => {
      const result = validateAdminUserData({
        email: 'invalid-email',
        role: 'invalid_role',
        password: 'weak',
        username: ''
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('generateUniqueUsername', () => {
    test('should generate unique username', () => {
      const username = generateUniqueUsername('john.doe@example.com', []);
      expect(username).toBe('john.doe');
    });

    test('should handle conflicts with numbers', () => {
      const existingUsernames = ['john.doe', 'john.doe1'];
      const username = generateUniqueUsername('john.doe@example.com', existingUsernames);
      expect(username).toBe('john.doe2');
    });

    test('should fallback to timestamp for many conflicts', () => {
      const existingUsernames = Array.from({ length: 100 }, (_, i) => 
        i === 0 ? 'john.doe' : `john.doe${i}`
      );
      const username = generateUniqueUsername('john.doe@example.com', existingUsernames);
      expect(username).toMatch(/^john\.doe_\d{4}$/);
    });
  });

  describe('checkSecurityRisks', () => {
    test('should identify disposable email risks', () => {
      const result = checkSecurityRisks({
        email: 'test@tempmail.com',
        role: 'admin'
      });

      expect(result.risks.length).toBeGreaterThan(0);
      expect(result.risks).toContain('Email appears to be from a temporary/disposable email service');
    });

    test('should identify weak username patterns', () => {
      const result = checkSecurityRisks({
        email: 'user@example.com',
        role: 'admin',
        username: 'test_admin'
      });

      expect(result.risks).toContain('Username contains common/predictable patterns');
    });

    test('should identify password security issues', () => {
      const result = checkSecurityRisks({
        email: 'john@example.com',
        role: 'admin',
        password: 'john123!'
      });

      expect(result.risks).toContain('Password contains parts of the email address');
    });

    test('should provide admin role recommendations', () => {
      const result = checkSecurityRisks({
        email: 'user@example.com',
        role: 'admin'
      });

      expect(result.recommendations).toContain('Admin role grants full system access - ensure user requires this level of access');
    });
  });
});

// Mock tests setup if no testing framework is available
if (typeof expect === 'undefined') {
  console.log('Admin User Validation Tests - Manual Verification:');
  
  // Test valid email
  const emailTest = validateAdminEmail('admin@startersmallchops.com');
  console.log('✓ Valid email test:', emailTest.valid ? 'PASS' : 'FAIL');
  
  // Test strong password
  const passwordTest = validateAdminPassword('MyStr0ng!Passw0rd#2024');
  console.log('✓ Strong password test:', passwordTest.valid ? 'PASS' : 'FAIL');
  
  // Test weak password
  const weakPasswordTest = validateAdminPassword('weak');
  console.log('✓ Weak password rejection:', !weakPasswordTest.valid ? 'PASS' : 'FAIL');
  
  // Test role validation
  const roleTest = validateAdminRole('admin');
  console.log('✓ Valid role test:', roleTest.valid ? 'PASS' : 'FAIL');
  
  // Test username generation
  const usernameTest = generateUniqueUsername('test@example.com', ['test']);
  console.log('✓ Unique username generation:', usernameTest === 'test1' ? 'PASS' : 'FAIL');
  
  console.log('All manual tests completed.');
}