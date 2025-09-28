import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, RefreshCw, Home, Mail } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  context?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
}

/**
 * Error boundary specifically for admin user creation components
 * Provides graceful error handling with recovery options
 */
class AdminUserCreationErrorBoundary extends Component<Props, State> {
  private maxRetries = 3;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('🚨 Admin User Creation Error:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      context: this.props.context,
      timestamp: new Date().toISOString()
    });

    // Log to audit trail
    this.logErrorToAuditTrail(error, errorInfo);

    this.setState({
      error,
      errorInfo,
      hasError: true
    });

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    // Show error toast
    toast.error(`Admin user creation error: ${error.message}`);
  }

  private async logErrorToAuditTrail(error: Error, errorInfo: ErrorInfo) {
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      
      // Log to audit_logs table
      await supabase.from('audit_logs').insert({
        action: 'admin_user_creation_component_error',
        category: 'Error Boundary',
        message: `Admin User Creation Error: ${error.message}`,
        new_values: {
          error_message: error.message,
          error_stack: error.stack,
          component_stack: errorInfo.componentStack,
          context: this.props.context,
          timestamp: new Date().toISOString(),
          user_agent: navigator.userAgent,
          url: window.location.href
        }
      });
    } catch (auditError) {
      // Fail silently in production to prevent error boundary loops
      console.warn('Failed to log admin user creation error to audit trail:', auditError);
    }
  }

  handleRetry = () => {
    if (this.state.retryCount < this.maxRetries) {
      this.setState(prevState => ({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: prevState.retryCount + 1
      }));
      
      toast.success('Retrying admin user creation...');
    } else {
      toast.error('Maximum retry attempts reached. Please refresh the page.');
      window.location.reload();
    }
  };

  handleRefreshPage = () => {
    window.location.reload();
  };

  handleGoToDashboard = () => {
    window.location.href = '/dashboard';
  };

  handleContactSupport = () => {
    const subject = encodeURIComponent('Admin User Creation Error');
    const body = encodeURIComponent(`
Error Details:
- Message: ${this.state.error?.message}
- Context: ${this.props.context || 'Admin User Creation'}
- Time: ${new Date().toISOString()}
- Browser: ${navigator.userAgent}
- URL: ${window.location.href}

Please provide any additional context about what you were trying to do when this error occurred.
    `);
    
    window.open(`mailto:support@startersmallchops.com?subject=${subject}&body=${body}`);
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-4">
          <Card className="max-w-2xl w-full">
            <CardHeader className="text-center pb-4">
              <div className="flex justify-center mb-4">
                <div className="p-3 rounded-full bg-red-100">
                  <AlertTriangle className="h-8 w-8 text-red-600" />
                </div>
              </div>
              <CardTitle className="text-xl text-red-700">
                Admin User Creation Error
              </CardTitle>
              <CardDescription className="text-base">
                An error occurred while creating or managing admin users. 
                {this.props.context && ` Context: ${this.props.context}`}
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-6">
              {/* Error Details */}
              <Alert className="border-red-200 bg-red-50">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  <div className="space-y-2">
                    <p className="font-medium">Error Message:</p>
                    <p className="text-sm font-mono bg-red-100 p-2 rounded">
                      {this.state.error?.message || 'Unknown error occurred'}
                    </p>
                  </div>
                </AlertDescription>
              </Alert>

              {/* Troubleshooting Tips */}
              <div className="space-y-3">
                <h4 className="font-medium text-gray-900">Possible Solutions:</h4>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mt-2 flex-shrink-0"></span>
                    <span>Check your internet connection and try again</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mt-2 flex-shrink-0"></span>
                    <span>Verify that all required fields are filled correctly</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mt-2 flex-shrink-0"></span>
                    <span>Ensure you have the necessary permissions to create admin users</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mt-2 flex-shrink-0"></span>
                    <span>Check if the email address is already in use</span>
                  </li>
                </ul>
              </div>

              {/* Retry Information */}
              {this.state.retryCount > 0 && (
                <Alert className="border-yellow-200 bg-yellow-50">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-yellow-800">
                    Retry attempt {this.state.retryCount} of {this.maxRetries}
                  </AlertDescription>
                </Alert>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button 
                  onClick={this.handleRetry}
                  disabled={this.state.retryCount >= this.maxRetries}
                  className="flex-1 sm:flex-initial"
                  variant="default"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {this.state.retryCount >= this.maxRetries ? 'Max Retries Reached' : 'Try Again'}
                </Button>
                
                <Button 
                  onClick={this.handleRefreshPage}
                  variant="outline"
                  className="flex-1 sm:flex-initial"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Page
                </Button>
                
                <Button 
                  onClick={this.handleGoToDashboard}
                  variant="outline"
                  className="flex-1 sm:flex-initial"
                >
                  <Home className="h-4 w-4 mr-2" />
                  Go to Dashboard
                </Button>
              </div>

              {/* Support Contact */}
              <div className="pt-4 border-t">
                <div className="text-center space-y-3">
                  <p className="text-sm text-gray-600">
                    If the problem persists, please contact support with the error details above.
                  </p>
                  <Button 
                    onClick={this.handleContactSupport}
                    variant="ghost"
                    size="sm"
                    className="text-blue-600 hover:text-blue-700"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Contact Support
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AdminUserCreationErrorBoundary;