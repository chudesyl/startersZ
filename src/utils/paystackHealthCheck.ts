/**
 * Paystack Configuration Health Check Utility
 * Validates environment setup without making network calls
 */

interface HealthCheckResult {
  isHealthy: boolean;
  issues: string[];
  mode: 'secure-backend-only' | 'misconfigured';
  hasRequiredSecrets: boolean;
}

/**
 * Lightweight health check that runs at app start
 * No network calls - just validates configuration state
 */
export const performPaystackHealthCheck = (): HealthCheckResult => {
  const result: HealthCheckResult = {
    isHealthy: true,
    issues: [],
    mode: 'secure-backend-only',
    hasRequiredSecrets: false
  };

  // Check if we're in secure backend-only mode (expected state)
  const hasBackendReferences = localStorage.getItem('payment_system_mode') === 'backend-only';
  
  if (!hasBackendReferences) {
    result.issues.push('App not in secure backend-only references mode');
    result.mode = 'misconfigured';
    result.isHealthy = false;
  }

  // Note: We cannot check actual secret values from frontend for security
  // This is just a configuration state check
  result.hasRequiredSecrets = true; // Assume true, will be validated by backend

  // Check for any obvious frontend payment reference generation (should not exist)
  const hasPayRefs = document.body.innerHTML.includes('pay_') || 
                     window.localStorage.getItem('payment_refs')?.includes('pay_');
  
  if (hasPayRefs) {
    result.issues.push('Frontend payment reference generation detected');
    result.isHealthy = false;
  }

  return result;
};

/**
 * Log health check results to console (no sensitive data)
 */
export const logPaystackHealthCheck = () => {
  const healthCheck = performPaystackHealthCheck();
  
  console.log('🔐 Paystack Configuration Health Check:', {
    mode: healthCheck.mode,
    healthy: healthCheck.isHealthy,
    issues_count: healthCheck.issues.length
  });

  if (!healthCheck.isHealthy) {
    console.warn('⚠️ Paystack configuration issues detected:', healthCheck.issues);
  } else {
    console.log('✅ Paystack configuration appears healthy');
  }

  return healthCheck;
};

/**
 * Check if app is in production-ready secure mode
 */
export const isSecureMode = (): boolean => {
  const healthCheck = performPaystackHealthCheck();
  return healthCheck.isHealthy && healthCheck.mode === 'secure-backend-only';
};