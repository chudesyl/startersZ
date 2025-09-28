// Enhanced admin user validation utilities with security focus

export interface AdminValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedData?: Record<string, any>;
}

export interface AdminPasswordRequirements {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  requireMixedCase: boolean;
  forbiddenPatterns: string[];
  allowedDomains?: string[];
}

// Production-ready admin password requirements
export const ADMIN_PASSWORD_REQUIREMENTS: AdminPasswordRequirements = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  requireMixedCase: true,
  forbiddenPatterns: [
    'password', 'admin', 'root', 'user', 'test', 'login',
    '123456', 'qwerty', 'letmein', 'welcome', 'startersmallchops'
  ],
  allowedDomains: [
    'startersmallchops.com',
    'gmail.com', // Temporary for development
    'outlook.com' // Temporary for development
  ]
};

/**
 * Validate admin email with domain restrictions and format checks
 */
export function validateAdminEmail(email: string): AdminValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!email || typeof email !== 'string') {
    errors.push('Email is required');
    return { valid: false, errors, warnings };
  }

  const trimmedEmail = email.toLowerCase().trim();
  
  // Basic format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmedEmail)) {
    errors.push('Invalid email format');
    return { valid: false, errors, warnings };
  }

  // Enhanced format validation
  const strictEmailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!strictEmailRegex.test(trimmedEmail)) {
    errors.push('Email contains invalid characters');
  }

  // Domain validation for admin accounts
  const domain = trimmedEmail.split('@')[1];
  if (ADMIN_PASSWORD_REQUIREMENTS.allowedDomains && 
      !ADMIN_PASSWORD_REQUIREMENTS.allowedDomains.includes(domain)) {
    warnings.push(`Email domain '${domain}' is not in the approved list for admin accounts`);
  }

  // Security checks
  if (trimmedEmail.length > 254) {
    errors.push('Email address is too long');
  }

  const localPart = trimmedEmail.split('@')[0];
  if (localPart.length > 64) {
    errors.push('Email local part is too long');
  }

  // Check for suspicious patterns
  const suspiciousPatterns = ['script', 'admin+', 'test+', 'noreply', 'no-reply'];
  const hasSuspiciousPattern = suspiciousPatterns.some(pattern => 
    trimmedEmail.includes(pattern)
  );
  
  if (hasSuspiciousPattern) {
    warnings.push('Email contains patterns that may indicate automated account creation');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sanitizedData: { email: trimmedEmail }
  };
}

/**
 * Validate admin password with enhanced security requirements
 */
export function validateAdminPassword(password: string, email?: string): AdminValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const requirements = ADMIN_PASSWORD_REQUIREMENTS;

  if (!password || typeof password !== 'string') {
    errors.push('Password is required');
    return { valid: false, errors, warnings };
  }

  // Length check
  if (password.length < requirements.minLength) {
    errors.push(`Password must be at least ${requirements.minLength} characters long`);
  }

  // Character type requirements
  if (requirements.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (requirements.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (requirements.requireNumbers && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (requirements.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>_+=\-\[\]\\\/~`]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  // Forbidden patterns check
  const lowerPassword = password.toLowerCase();
  const foundForbiddenPattern = requirements.forbiddenPatterns.find(pattern =>
    lowerPassword.includes(pattern.toLowerCase())
  );

  if (foundForbiddenPattern) {
    errors.push(`Password cannot contain common patterns like '${foundForbiddenPattern}'`);
  }

  // Email-based validation
  if (email) {
    const emailLocal = email.split('@')[0].toLowerCase();
    if (lowerPassword.includes(emailLocal) && emailLocal.length > 3) {
      errors.push('Password cannot contain parts of your email address');
    }
  }

  // Strength warnings
  if (password.length < 16) {
    warnings.push('Consider using a longer password for better security');
  }

  // Repetitive character check
  const hasRepetitiveChars = /(.)\1{2,}/.test(password);
  if (hasRepetitiveChars) {
    warnings.push('Password contains repetitive characters');
  }

  // Sequential character check
  const hasSequential = /(?:abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz|123|234|345|456|567|678|789)/i.test(password);
  if (hasSequential) {
    warnings.push('Password contains sequential characters');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate admin role with restricted options
 */
export function validateAdminRole(role: string): AdminValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!role || typeof role !== 'string') {
    errors.push('Role is required');
    return { valid: false, errors, warnings };
  }

  const validRoles = ['admin', 'manager', 'staff', 'dispatch_rider'];
  const sanitizedRole = role.toLowerCase().trim();

  if (!validRoles.includes(sanitizedRole)) {
    errors.push(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    return { valid: false, errors, warnings };
  }

  // Security warning for admin role
  if (sanitizedRole === 'admin') {
    warnings.push('Admin role grants full system access. Ensure this is intentional.');
  }

  return {
    valid: true,
    errors,
    warnings,
    sanitizedData: { role: sanitizedRole }
  };
}

/**
 * Comprehensive admin user data validation
 */
export function validateAdminUserData(data: {
  email: string;
  role: string;
  password?: string;
  username?: string;
}): AdminValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sanitizedData: Record<string, any> = {};

  // Validate email
  const emailValidation = validateAdminEmail(data.email);
  errors.push(...emailValidation.errors);
  warnings.push(...emailValidation.warnings);
  if (emailValidation.sanitizedData) {
    Object.assign(sanitizedData, emailValidation.sanitizedData);
  }

  // Validate role
  const roleValidation = validateAdminRole(data.role);
  errors.push(...roleValidation.errors);
  warnings.push(...roleValidation.warnings);
  if (roleValidation.sanitizedData) {
    Object.assign(sanitizedData, roleValidation.sanitizedData);
  }

  // Validate password if provided
  if (data.password) {
    const passwordValidation = validateAdminPassword(data.password, data.email);
    errors.push(...passwordValidation.errors);
    warnings.push(...passwordValidation.warnings);
  }

  // Validate username if provided
  if (data.username) {
    const usernameValidation = validateUsername(data.username);
    errors.push(...usernameValidation.errors);
    warnings.push(...usernameValidation.warnings);
    if (usernameValidation.sanitizedData) {
      Object.assign(sanitizedData, usernameValidation.sanitizedData);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sanitizedData
  };
}

/**
 * Validate username with security considerations
 */
export function validateUsername(username: string): AdminValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!username || typeof username !== 'string') {
    errors.push('Username is required');
    return { valid: false, errors, warnings };
  }

  const trimmedUsername = username.trim();

  // Length validation
  if (trimmedUsername.length < 3) {
    errors.push('Username must be at least 3 characters long');
  }

  if (trimmedUsername.length > 30) {
    errors.push('Username must be no more than 30 characters long');
  }

  // Character validation
  const usernameRegex = /^[a-zA-Z0-9._-]+$/;
  if (!usernameRegex.test(trimmedUsername)) {
    errors.push('Username can only contain letters, numbers, dots, underscores, and hyphens');
  }

  // Reserved username check
  const reservedUsernames = [
    'admin', 'root', 'user', 'test', 'api', 'www', 'mail', 'support',
    'system', 'null', 'undefined', 'anonymous', 'guest', 'public'
  ];

  if (reservedUsernames.includes(trimmedUsername.toLowerCase())) {
    errors.push('Username is reserved and cannot be used');
  }

  // Security patterns
  if (trimmedUsername.toLowerCase().includes('script')) {
    warnings.push('Username contains potentially suspicious patterns');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sanitizedData: { username: trimmedUsername }
  };
}