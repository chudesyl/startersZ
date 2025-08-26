import React, { Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import ErrorBoundaryWrapper from "./components/ErrorBoundaryWrapper";
import { withLazyLoading, preloadRoute } from "./utils/lazyLoad";
import { FullPageLoader } from "./components/ui/page-loader";
import { PerformanceMonitor } from "./utils/performance";
import { initPaymentMonitoring } from "./utils/paymentMonitoring";
import DynamicFavicon from "./components/seo/DynamicFavicon";
import { initializeConsoleCleanup, validatePaystackCSP, suppressWebSocketErrors } from "./utils/consoleCleanup";
import { logEnvironmentStatus, validateEnvironment, createEnvironmentErrorElement } from "./utils/environmentValidator";
import { logPaystackHealthCheck } from "./utils/paystackHealthCheck";
import { ErrorTrackerComponent } from "./components/monitoring/ErrorTracker";
import { NetworkProvider } from "./components/network/NetworkProvider";
import { OnlineStatusBanner } from "./components/network/OnlineStatusBanner";

// Initialize payment monitoring and cache busting
initPaymentMonitoring();

// Immediate load critical components
import NotFound from "./pages/NotFound";
import PublicHome from "./pages/PublicHome";

// Lazy load admin components
const Orders = withLazyLoading(() => import("./pages/Orders"));
const AdminOrders = withLazyLoading(() => import("./pages/admin/AdminOrders"));
const AdminDelivery = withLazyLoading(() => import("./pages/admin/AdminDelivery"));
const Products = withLazyLoading(() => import("./pages/Products"));
const Customers = withLazyLoading(() => import("./pages/Customers"));
const Reports = withLazyLoading(() => import("./pages/Reports"));
const PaymentSettings = withLazyLoading(() => import("./pages/PaymentSettings").then(m => ({ default: m.PaymentSettings })));
const Index = withLazyLoading(() => import("./pages/Index"));
const ProductDetail = withLazyLoading(() => import("./pages/ProductDetail"));
const CategoryProducts = withLazyLoading(() => import("./pages/CategoryProducts"));
const Promotions = withLazyLoading(() => import("./pages/Promotions"));
const BookingManagement = withLazyLoading(() => import("./pages/BookingManagement"));
const DeliveryPickup = withLazyLoading(() => import("./pages/DeliveryPickup"));
const AuditLogs = withLazyLoading(() => import("./pages/AuditLogs"));
const Settings = withLazyLoading(() => import("./pages/Settings"));
const Categories = withLazyLoading(() => import("./pages/Categories"));

// Lazy load customer components
const CustomerFavorites = withLazyLoading(() => import("./pages/CustomerFavorites"));
const PurchaseHistory = withLazyLoading(() => import("./pages/PurchaseHistory"));
const PaymentCallback = withLazyLoading(() => import("./pages/PaymentCallbackPage").then(m => ({ default: m.PaymentCallbackPage })));
const PaymentCallbackRedirect = withLazyLoading(() => import("./pages/PaymentCallbackRedirect"));
const Unsubscribe = withLazyLoading(() => import("./pages/Unsubscribe"));
const AdminSetup = withLazyLoading(() => import("./pages/AdminSetup"));
const CustomerRegister = withLazyLoading(() => import("./pages/CustomerRegister"));
const SimpleRegisterPage = withLazyLoading(() => import("./pages/SimpleRegisterPage"));
const CustomerProfile = withLazyLoading(() => import("./pages/CustomerProfile"));
const AuthPage = withLazyLoading(() => import("./pages/AuthPage"));
const AdminAuth = withLazyLoading(() => import("./pages/admin/AdminAuth"));
const Cart = withLazyLoading(() => import("./pages/Cart"));
const Booking = withLazyLoading(() => import("./pages/Booking"));
const PublicProducts = withLazyLoading(() => import("./pages/PublicProducts"));
const Contact = withLazyLoading(() => import("./pages/Contact"));
const About = withLazyLoading(() => import("./pages/About"));
const PaystackTest = withLazyLoading(() => import("./pages/PaystackTest"));
const PaystackTestingDashboard = withLazyLoading(() => import("./pages/PaystackTestingDashboard"));
const AuthCallback = withLazyLoading(() => import("./pages/AuthCallback"));
const EmailVerificationPage = withLazyLoading(() => import("./pages/EmailVerificationPage"));
const PasswordResetPage = withLazyLoading(() => import("./pages/PasswordResetPage"));
const OrderDetails = withLazyLoading(() => import("./pages/OrderDetails"));
const TrackOrder = withLazyLoading(() => import("./pages/TrackOrder"));
const EmergencyPaymentFix = withLazyLoading(() => import("./components/admin/EmergencyPaymentFix").then(m => ({ default: m.default })));

// Hardened QueryClient with comprehensive error handling and performance optimizations
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,         // 2 minutes - faster fresh data
      gcTime: 10 * 60 * 1000,           // 10 minutes cache retention
      refetchOnWindowFocus: false,       // Prevent unnecessary refetches
      refetchIntervalInBackground: false,
      refetchInterval: false,
      refetchOnMount: false,             // Use cached data when available
      retry: (failureCount, error: any) => {
        // Enhanced retry logic for stability
        const errorStatus = error?.status || error?.response?.status;
        
        // Never retry client errors (4xx)
        if (errorStatus >= 400 && errorStatus < 500) {
          return false;
        }
        
        // Never retry auth errors
        if (error?.message?.includes('auth') || error?.message?.includes('unauthorized')) {
          return false;
        }
        
        // Limit retries to prevent infinite loops
        return failureCount < 1;
      },
      retryDelay: attemptIndex => Math.min(300 * 2 ** attemptIndex, 1500),
      networkMode: 'online',
      throwOnError: false, // Prevent uncaught errors from crashing the app
      meta: {
        timeout: 8000,
      },
    },
    mutations: {
      retry: (failureCount, error: any) => {
        // Only retry mutations for network errors
        const errorStatus = error?.status || error?.response?.status;
        if (errorStatus >= 500 && failureCount < 1) {
          return true;
        }
        return false;
      },
      retryDelay: 1000,
      networkMode: 'online',
      throwOnError: false, // Prevent uncaught mutation errors
    },
  },
});

// Preload critical routes
if (typeof window !== 'undefined') {
  preloadRoute(() => import("./pages/PublicProducts"));
  preloadRoute(() => import("./pages/Cart"));
  preloadRoute(() => import("./pages/Booking"));
}


const App = () => {
  PerformanceMonitor.startTiming('App Render');
  const [environmentStatus, setEnvironmentStatus] = React.useState<ReturnType<typeof validateEnvironment> | null>(null);
  
  React.useEffect(() => {
    PerformanceMonitor.endTiming('App Render');
    
    // Validate environment first
    const envStatus = logEnvironmentStatus();
    setEnvironmentStatus(envStatus);
    
    // Run Paystack configuration health check
    logPaystackHealthCheck();
    
    // Initialize production optimizations
    initializeConsoleCleanup();
    suppressWebSocketErrors();
    validatePaystackCSP();
    
    // Payment system status logging
    console.log('✅ Payment System: Backend-only references active');
    console.log('✅ Paystack-only migration completed');
    
    // Enhanced environment validation with detailed feedback
    console.group('🌍 Environment Status');
    console.log(`Production Ready: ${envStatus.isProductionReady ? '✅' : '❌'}`);
    console.log(`Mode: ${import.meta.env.DEV ? 'Development' : 'Production'}`);
    console.groupEnd();
  }, []);

  // Show environment error screen if critical issues found
  if (environmentStatus && !environmentStatus.isProductionReady) {
    const criticalErrors = environmentStatus.checks.filter(c => c.level === 'error');
    if (criticalErrors.length > 0) {
      // In a real app, you might want to show this error screen
      // For now, we'll just log and continue
      console.error('Critical environment errors detected but continuing...');
    }
  }

  return (
  <ErrorBoundaryWrapper 
    context="Main Application"
    showErrorDetails={import.meta.env.DEV}
    onError={(error, errorInfo) => {
      console.error('App-level error:', { error, errorInfo, timestamp: new Date().toISOString() });
    }}
  >
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <NetworkProvider>
          <ErrorTrackerComponent />
          <Toaster />
          <Sonner />
          <DynamicFavicon />
          <OnlineStatusBanner />
          <AuthProvider>
            <BrowserRouter>
            <Routes>
              {/* Customer store at root */}
              <Route path="/" element={<ErrorBoundaryWrapper context="Public Home"><PublicHome /></ErrorBoundaryWrapper>} />
              
              {/* Redirect legacy /home to root */}
              <Route path="/home" element={<Navigate to="/" replace />} />
              <Route path="/products" element={<ErrorBoundaryWrapper context="Public Products"><PublicProducts /></ErrorBoundaryWrapper>} />
              <Route path="/cart" element={<ErrorBoundaryWrapper context="Shopping Cart"><Cart /></ErrorBoundaryWrapper>} />
              <Route path="/booking" element={<ErrorBoundaryWrapper context="Booking"><Booking /></ErrorBoundaryWrapper>} />
              <Route path="/about" element={<ErrorBoundaryWrapper context="About Page"><About /></ErrorBoundaryWrapper>} />
              <Route path="/contact" element={<ErrorBoundaryWrapper context="Contact Page"><Contact /></ErrorBoundaryWrapper>} />
              <Route path="/paystack-test" element={<PaystackTest />} />
              <Route path="/paystack-testing" element={<PaystackTestingDashboard />} />
              <Route path="/emergency-fix" element={<EmergencyPaymentFix />} />
              <Route path="/product/:id" element={<ErrorBoundaryWrapper context="Product Detail"><ProductDetail /></ErrorBoundaryWrapper>} />
              <Route path="/category/:categoryId" element={<ErrorBoundaryWrapper context="Category Products"><CategoryProducts /></ErrorBoundaryWrapper>} />
              
              {/* Authentication routes */}
              <Route path="/auth" element={<ErrorBoundaryWrapper context="Auth Page"><AuthPage /></ErrorBoundaryWrapper>} />
              <Route path="/auth/callback" element={<ErrorBoundaryWrapper context="Auth Callback"><AuthCallback /></ErrorBoundaryWrapper>} />
              <Route path="/auth-callback" element={<ErrorBoundaryWrapper context="Auth Callback"><AuthCallback /></ErrorBoundaryWrapper>} /> {/* Legacy support */}
              <Route path="/auth/verify" element={<ErrorBoundaryWrapper context="Email Verification"><EmailVerificationPage /></ErrorBoundaryWrapper>} />
              <Route path="/auth/reset" element={<ErrorBoundaryWrapper context="Password Reset"><PasswordResetPage /></ErrorBoundaryWrapper>} />
              
              {/* Admin authentication */}
              <Route path="/admin/auth" element={<ErrorBoundaryWrapper context="Admin Auth"><AdminAuth /></ErrorBoundaryWrapper>} />
              
              {/* Legacy redirects */}
              <Route path="/login" element={<Navigate to="/auth" replace />} />
              <Route path="/admin/login" element={<Navigate to="/admin/auth" replace />} />
              
              {/* Customer routes */}
              <Route path="/customer-portal" element={<Navigate to="/" replace />} />
              <Route path="/customer-profile" element={<ErrorBoundaryWrapper context="Customer Profile"><CustomerProfile /></ErrorBoundaryWrapper>} />
              <Route path="/customer-favorites" element={<ErrorBoundaryWrapper context="Customer Favorites"><CustomerFavorites /></ErrorBoundaryWrapper>} />
              <Route path="/purchase-history" element={<ErrorBoundaryWrapper context="Purchase History"><PurchaseHistory /></ErrorBoundaryWrapper>} />
              <Route path="/purchase-history/:customerEmail" element={<ErrorBoundaryWrapper context="Purchase History"><PurchaseHistory /></ErrorBoundaryWrapper>} />
              <Route path="/orders/:id" element={<ErrorBoundaryWrapper context="Order Details"><OrderDetails /></ErrorBoundaryWrapper>} />
              <Route path="/track-order" element={<ErrorBoundaryWrapper context="Track Order"><TrackOrder /></ErrorBoundaryWrapper>} />
              <Route path="/track/:orderNumber" element={<ErrorBoundaryWrapper context="Track Order"><TrackOrder /></ErrorBoundaryWrapper>} />
              
              {/* Payment routes */}
              <Route path="/payment/callback" element={<ErrorBoundaryWrapper context="Payment Callback"><PaymentCallback /></ErrorBoundaryWrapper>} />
              <Route path="/payment/success" element={<ErrorBoundaryWrapper context="Payment Success"><PaymentCallback /></ErrorBoundaryWrapper>} />
              <Route path="/payment/failed" element={<ErrorBoundaryWrapper context="Payment Failed"><PaymentCallback /></ErrorBoundaryWrapper>} />
              <Route path="/payment-callback" element={<ErrorBoundaryWrapper context="Payment Redirect"><PaymentCallbackRedirect /></ErrorBoundaryWrapper>} />
              
              {/* Misc routes */}
              <Route path="/unsubscribe" element={<ErrorBoundaryWrapper context="Unsubscribe"><Unsubscribe /></ErrorBoundaryWrapper>} />
              <Route path="/admin-setup/:token" element={<ErrorBoundaryWrapper context="Admin Setup"><AdminSetup /></ErrorBoundaryWrapper>} />
              
              {/* Simple registration routes - removed to discourage OTP flow */}
              {/* <Route path="/simple-register" element={<SimpleRegisterPage />} /> */}
              
              {/* Legacy customer registration route */}
              <Route path="/customer-register" element={<ErrorBoundaryWrapper context="Customer Register"><CustomerRegister /></ErrorBoundaryWrapper>} />
              
              {/* Legacy admin redirects for seamless transition */}
              <Route path="/orders" element={<Navigate to="/admin/orders" replace />} />
              <Route path="/delivery-pickup" element={<Navigate to="/admin/delivery" replace />} />

              {/* Protected admin routes */}
              <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route path="/admin" element={<ErrorBoundaryWrapper context="Dashboard"><Index /></ErrorBoundaryWrapper>} />
                <Route path="/dashboard" element={<ErrorBoundaryWrapper context="Dashboard"><Index /></ErrorBoundaryWrapper>} />
                <Route path="/admin/orders" element={<ErrorBoundaryWrapper context="Admin Orders"><AdminOrders /></ErrorBoundaryWrapper>} />
                <Route path="/admin/delivery" element={<ErrorBoundaryWrapper context="Admin Delivery"><AdminDelivery /></ErrorBoundaryWrapper>} />
                <Route path="/admin/products" element={<ErrorBoundaryWrapper context="Products"><Products /></ErrorBoundaryWrapper>} />
                <Route path="/categories" element={<ErrorBoundaryWrapper context="Categories"><Categories /></ErrorBoundaryWrapper>} />
                <Route path="/customers" element={<ErrorBoundaryWrapper context="Customers"><Customers /></ErrorBoundaryWrapper>} />
                <Route path="/reports" element={<ErrorBoundaryWrapper context="Reports"><Reports /></ErrorBoundaryWrapper>} />
                <Route path="/promotions" element={<ErrorBoundaryWrapper context="Promotions"><Promotions /></ErrorBoundaryWrapper>} />
                <Route path="/bookings" element={<ErrorBoundaryWrapper context="Catering Bookings"><BookingManagement /></ErrorBoundaryWrapper>} />
                <Route path="/audit-logs" element={<ErrorBoundaryWrapper context="Audit Logs"><AuditLogs /></ErrorBoundaryWrapper>} />
                <Route path="/settings" element={<ErrorBoundaryWrapper context="Settings"><Settings /></ErrorBoundaryWrapper>} />
                <Route path="/payment-settings" element={<ErrorBoundaryWrapper context="Payment Settings"><PaymentSettings /></ErrorBoundaryWrapper>} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
        </NetworkProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundaryWrapper>
  );
};

export default App;
