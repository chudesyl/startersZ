import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/hooks/useCart";
import { useGuestSession } from "@/hooks/useGuestSession";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCustomerProfile } from "@/hooks/useCustomerProfile";
import { useNavigate } from "react-router-dom";
import { Mail, Phone, MapPin, Truck, X, RefreshCw, AlertTriangle } from "lucide-react";
import { DeliveryZoneDropdown } from "@/components/delivery/DeliveryZoneDropdown";
import { PickupPointSelector } from "@/components/delivery/PickupPointSelector";
import { GuestOrLoginChoice } from "./GuestOrLoginChoice";
import { PaystackPaymentHandler } from "@/components/payments/PaystackPaymentHandler";
import { storeRedirectUrl } from "@/utils/redirect";
import { useOrderProcessing } from "@/hooks/useOrderProcessing";
import { validatePaymentInitializationData, normalizePaymentData, generateUserFriendlyErrorMessage } from "@/utils/paymentDataValidator";
import { debugPaymentInitialization, quickPaymentDiagnostic, logPaymentAttempt } from "@/utils/paymentDebugger";
import { useCheckoutStateRecovery } from "@/utils/checkoutStateManager";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";

interface DeliveryAddress {
  address_line_1: string;
  address_line_2?: string;
  city: string;
  state: string;
  postal_code: string;
  landmark?: string;
}

interface CheckoutData {
  customer_email: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: DeliveryAddress;
  payment_method: string;
  delivery_zone_id?: string;
  fulfillment_type: 'delivery' | 'pickup';
  pickup_point_id?: string;
}

interface EnhancedCheckoutFlowProps {
  isOpen: boolean;
  onClose: () => void;
}

// Error boundary component
class CheckoutErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('🚨 Checkout error boundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-center">
          <p className="text-destructive">Something went wrong with checkout. Please refresh and try again.</p>
        </div>
      );
    }

    return this.props.children;
  }
}

const EnhancedCheckoutFlowComponent: React.FC<EnhancedCheckoutFlowProps> = React.memo(({ 
  isOpen, 
  onClose 
}) => {
  const { cart, clearCart } = useCart();
  const { profile: customerAccount } = useCustomerProfile();
  const { isAuthenticated, customerAccount: authCustomerAccount, session } = useAuth();
  const { guestSession, generateGuestSession } = useGuestSession();
  const { markCheckoutInProgress } = useOrderProcessing();
  const navigate = useNavigate();
  const { 
    saveState, 
    recoverState, 
    clearState, 
    hasRecoverableState,
    savePrePaymentState,
    markPaymentCompleted,
    handlePaymentFailure,
    getRetryInfo
  } = useCheckoutStateRecovery();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [checkoutStep, setCheckoutStep] = useState<'choice' | 'details' | 'payment'>('choice');
  const [paymentData, setPaymentData] = useState<any>(null);
  const [lastPaymentError, setLastPaymentError] = useState<string | null>(null);
  const [showRecoveryOption, setShowRecoveryOption] = useState(false);

  const [formData, setFormData] = useState<CheckoutData>({
    customer_email: session?.user?.email || '',
    customer_name: authCustomerAccount?.name || customerAccount?.name || '',
    customer_phone: authCustomerAccount?.phone || customerAccount?.phone || '',
    delivery_address: {
      address_line_1: '',
      address_line_2: '',
      city: '',
      state: 'Lagos',
      postal_code: '',
      landmark: ''
    },
    payment_method: '',
    delivery_zone_id: '',
    fulfillment_type: 'delivery',
    pickup_point_id: ''
  });

  const items = useMemo(() => cart?.items || [], [cart?.items]);
  const currentDeliveryFee = useMemo(() => 
    formData.fulfillment_type === 'pickup' ? 0 : deliveryFee, 
    [formData.fulfillment_type, deliveryFee]
  );
  const total = useMemo(() => 
    (cart?.summary?.total_amount || 0) + currentDeliveryFee, 
    [cart?.summary?.total_amount, currentDeliveryFee]
  );

  // Recovery and initialization effect
  useEffect(() => {
    if (isOpen) {
      // Check for recoverable state when checkout opens
      if (hasRecoverableState()) {
        const recovered = recoverState();
        if (recovered) {
          const retryInfo = getRetryInfo();
          console.log('🔄 Checkout state recovery available:', {
            step: recovered.checkoutStep,
            retryCount: retryInfo.retryCount,
            canRetry: retryInfo.canRetry
          });
          
          if (retryInfo.canRetry) {
            setShowRecoveryOption(true);
            setLastPaymentError(retryInfo.lastError?.message || 'Previous payment attempt failed');
          } else {
            clearState(); // Clear if max retries exceeded
          }
        }
      }
    }
  }, [isOpen]);

  // Clear payment state when component mounts or step changes
  useEffect(() => {
    if (checkoutStep !== 'payment') {
      setPaymentData(null);
      setLastPaymentError(null);
    }
  }, [checkoutStep]);

  // Auto-save state when form data changes
  useEffect(() => {
    if (checkoutStep === 'details' && formData.customer_email) {
      saveState(formData, checkoutStep, deliveryFee);
    }
  }, [formData, checkoutStep, deliveryFee]);

  const handleContinueAsGuest = useCallback(async () => {
    if (!guestSession) {
      await generateGuestSession();
    }
    setCheckoutStep('details');
  }, [guestSession, generateGuestSession]);

  const handleLogin = useCallback(() => {
    storeRedirectUrl(window.location.pathname + window.location.search);
    onClose();
    navigate('/auth');
  }, [onClose, navigate]);

  React.useEffect(() => {
    if (isAuthenticated && checkoutStep === 'choice') {
      setCheckoutStep('details');
    }
  }, [isAuthenticated, checkoutStep]);

  React.useEffect(() => {
    if (session?.user || authCustomerAccount) {
      setFormData(prev => ({
        ...prev,
        customer_email: session?.user?.email || prev.customer_email,
        customer_name: authCustomerAccount?.name || customerAccount?.name || prev.customer_name,
        customer_phone: authCustomerAccount?.phone || customerAccount?.phone || prev.customer_phone,
      }));
    }
  }, [session, authCustomerAccount, customerAccount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear any previous payment state and errors
    setIsSubmitting(false);
    setPaymentData(null);
    setLastPaymentError(null);
    
    // Add a small delay to ensure cleanup
    await new Promise(resolve => setTimeout(resolve, 100));
    
    setIsSubmitting(true);

    try {
      // Generate a unique reference for this checkout attempt
      const uniqueReference = `checkout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      console.log('🚀 Processing checkout with unique reference:', uniqueReference);

      const sanitizedData = {
        customer_email: formData.customer_email?.trim(),
        customer_name: formData.customer_name?.trim(),
        customer_phone: formData.customer_phone?.trim() || null,
        fulfillment_type: formData.fulfillment_type,
        delivery_address: formData.fulfillment_type === 'delivery' ? formData.delivery_address : null,
        pickup_point_id: formData.fulfillment_type === 'pickup' ? formData.pickup_point_id : null,
        order_items: items.map(item => {
          // Check if this is a custom bundle by checking the product_id format
          const isCustomBundle = item.product_id && !item.product_id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
          
          if (isCustomBundle) {
            // For custom bundles, include the customization_items from the cart item
            const customizationItems = (item as any).customization_items || [];
            
            return {
              product_id: String(item.product_id || ''),
              product_name: item.product_name,
              quantity: Number(item.quantity || 1),
              unit_price: Number(item.price || 0),
              total_price: Number((item.price || 0) * (item.quantity || 1)),
              customization_items: customizationItems
            };
          } else {
            // For regular products
            return {
              product_id: String(item.product_id || ''),
              quantity: Number(item.quantity || 1),
              unit_price: Number(item.price || 0),
              total_price: Number((item.price || 0) * (item.quantity || 1))
            };
          }
        }),
        total_amount: total,
        delivery_fee: formData.fulfillment_type === 'delivery' ? deliveryFee : 0,
        delivery_zone_id: formData.fulfillment_type === 'delivery' && formData.delivery_zone_id ? formData.delivery_zone_id : null,
        payment_method: 'paystack',
        guest_session_id: !isAuthenticated ? guestSession?.sessionId : null,
        payment_reference: uniqueReference, // Add unique reference
        timestamp: new Date().toISOString()
      };

      // Save pre-payment state
      savePrePaymentState(formData, checkoutStep, deliveryFee, uniqueReference);

      console.log('🚀 Processing checkout with enhanced debugging...');
      
      // Log payment attempt
      logPaymentAttempt(sanitizedData, 'attempt');

      const { data, error } = await supabase.functions.invoke('process-checkout', {
        body: sanitizedData
      });

      if (error) {
        console.error('🔍 Supabase function error:', error);
        handlePaymentFailure({ type: 'supabase_error', message: error.message });
        throw new Error(error.message);
      }

      let parsedData = data;
      if (typeof data === 'string') {
        try {
          parsedData = JSON.parse(data);
        } catch (parseError) {
          console.error('❌ Failed to parse JSON response:', parseError);
          handlePaymentFailure({ type: 'parse_error', message: 'Invalid response format' });
          throw new Error('Invalid response format from server');
        }
      }

      // Enhanced debugging and validation
      const debugInfo = debugPaymentInitialization(sanitizedData, parsedData);
      const quickDiag = quickPaymentDiagnostic(parsedData);
      
      if (quickDiag) {
        console.error('🚨 Quick diagnostic found issue:', quickDiag);
        setLastPaymentError(quickDiag.fix);
        handlePaymentFailure({ type: 'diagnostic_issue', ...quickDiag });
        throw new Error(quickDiag.issue);
      }

      if (parsedData?.success === true) {
        // Validate payment initialization data
        const validationResult = validatePaymentInitializationData(parsedData);
        
        if (!validationResult.isValid) {
          const userFriendlyError = generateUserFriendlyErrorMessage(validationResult);
          console.error('❌ Payment validation failed:', validationResult);
          setLastPaymentError(userFriendlyError);
          handlePaymentFailure({ type: 'validation_failed', validation: validationResult });
          logPaymentAttempt(sanitizedData, 'failure', { validation: validationResult });
          throw new Error(userFriendlyError);
        }

        // Normalize the payment data (handle authorization_url vs payment_url mismatch)
        const normalizedData = normalizePaymentData(parsedData);
        
        console.log('✅ Checkout successful! Order created:', {
          orderId: normalizedData.order_id,
          orderNumber: normalizedData.order_number,
          totalAmount: normalizedData.total_amount,
          paymentReference: normalizedData.payment?.reference,
          paymentUrl: normalizedData.payment?.payment_url,
          hasAuthUrl: !!normalizedData.payment?.authorization_url,
          normalized: normalizedData !== parsedData
        });

        logPaymentAttempt(sanitizedData, 'success', { orderId: normalizedData.order_id });

        setPaymentData({
          reference: normalizedData.payment.reference,
          amount: normalizedData.total_amount,
          email: formData.customer_email,
          orderNumber: normalizedData.order_number,
          paymentUrl: normalizedData.payment.payment_url
        });
        setCheckoutStep('payment');
        setShowRecoveryOption(false); // Hide recovery option on success
        
      } else {
        const errorMessage = parsedData?.message || parsedData?.error || "Failed to process checkout";
        handlePaymentFailure({ type: 'checkout_failed', message: errorMessage });
        logPaymentAttempt(sanitizedData, 'failure', { error: errorMessage });
        toast({
          title: "Checkout Failed",
          description: errorMessage,
          variant: "destructive",
        });
      }

    } catch (error) {
      console.error('💥 Checkout error:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to process checkout. Please try again.";
      setLastPaymentError(errorMessage);
      
      toast({
        title: "Checkout Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePaymentSuccess = useCallback((reference: string) => {
    markCheckoutInProgress(reference);
    markPaymentCompleted(); // Clear recovery state
    clearCart();
    
    toast({
      title: "Payment Successful!",
      description: "Your payment has been processed successfully.",
    });
    
    window.location.href = `/payment-callback?reference=${reference}&status=success`;
  }, [markCheckoutInProgress, clearCart, markPaymentCompleted]);

  const handlePaymentError = useCallback((error: string) => {
    console.error('❌ Payment error:', error);
    handlePaymentFailure({ type: 'payment_gateway_error', message: error });
    setLastPaymentError(error);
    
    toast({
      title: "Payment Failed",
      description: error || "Your payment was not successful. Please try again.",
      variant: "destructive",
    });
    
    setCheckoutStep('details');
    setShowRecoveryOption(true); // Show recovery option after payment failure
  }, [handlePaymentFailure]);

  // Recovery functions
  const handleRecoverCheckout = useCallback(() => {
    const recovered = recoverState();
    if (recovered) {
      setFormData(recovered.formData);
      setDeliveryFee(recovered.deliveryFee);
      setCheckoutStep(recovered.checkoutStep as 'choice' | 'details' | 'payment');
      setShowRecoveryOption(false);
      setLastPaymentError(null);
      
      toast({
        title: "Checkout Recovered",
        description: "Your previous checkout data has been restored.",
      });
    }
  }, [recoverState]);

  const handleDiscardRecovery = useCallback(() => {
    clearState();
    setShowRecoveryOption(false);
    setLastPaymentError(null);
  }, [clearState]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Secure Checkout</CardTitle>
            <CardDescription>
              {checkoutStep === 'choice' 
                ? 'Choose how you want to proceed with your order'
                : checkoutStep === 'details'
                ? 'Complete your order details and choose your payment method'
                : 'Complete your payment'
              }
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        
        <CardContent>
          {/* Recovery Option Banner */}
          {showRecoveryOption && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-amber-800">Previous Checkout Found</h4>
                  <p className="text-sm text-amber-700 mt-1">
                    {lastPaymentError || 'Your previous checkout attempt was interrupted.'}
                  </p>
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleRecoverCheckout}
                      className="border-amber-300 text-amber-700 hover:bg-amber-100"
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Recover & Retry
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleDiscardRecovery}
                      className="text-amber-600"
                    >
                      Start Fresh
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4 mb-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Order Summary</h3>
            </div>
            <div className="bg-muted/50 p-4 rounded-lg space-y-2">
              {items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span>{item.product_name} × {item.quantity}</span>
                  <span>₦{(item.price * item.quantity).toLocaleString()}</span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>₦{(cart?.summary?.subtotal || 0).toLocaleString()}</span>
              </div>
              {checkoutStep !== 'choice' && formData.fulfillment_type === 'delivery' && deliveryFee > 0 && (
                <div className="flex justify-between">
                  <span>Delivery Fee:</span>
                  <span>₦{deliveryFee.toLocaleString()}</span>
                </div>
              )}
              {checkoutStep !== 'choice' && formData.fulfillment_type === 'pickup' && (
                <div className="flex justify-between text-green-600">
                  <span>Pickup (No delivery fee):</span>
                  <span>FREE</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-lg pt-2 border-t">
                <span>Total:</span>
                <span>₦{total.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {checkoutStep === 'choice' && !isAuthenticated && (
            <GuestOrLoginChoice
              totalAmount={total}
              onContinueAsGuest={handleContinueAsGuest}
              onLogin={handleLogin}
            />
          )}

          {checkoutStep === 'details' && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Contact Information
                  {isAuthenticated && (
                    <span className="text-sm text-green-600 bg-green-50 px-2 py-1 rounded-full">
                      Signed in as {authCustomerAccount?.name || session?.user?.email}
                    </span>
                  )}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="customer_name">Full Name *</Label>
                    <Input
                      id="customer_name"
                      value={formData.customer_name}
                      onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                      placeholder="Enter your full name"
                      disabled={isAuthenticated}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="customer_phone">Phone Number *</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="customer_phone"
                        value={formData.customer_phone}
                        onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                        placeholder="e.g., +234 801 234 5678"
                        className="pl-10"
                        disabled={isAuthenticated && !!authCustomerAccount?.phone}
                        required
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <Label htmlFor="customer_email">Email Address *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="customer_email"
                      type="email"
                      value={formData.customer_email}
                      onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                      placeholder="your.email@example.com"
                      className="pl-10"
                      disabled={isAuthenticated}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <Truck className="h-5 w-5" />
                  Fulfillment Options
                </h3>
                <RadioGroup
                  value={formData.fulfillment_type}
                  onValueChange={(value: 'delivery' | 'pickup') => {
                    setFormData({ ...formData, fulfillment_type: value });
                    if (value === 'pickup') {
                      setDeliveryFee(0);
                    }
                  }}
                  className="grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                  <Card className="cursor-pointer hover:border-primary transition-colors">
                    <CardContent className="flex items-center space-x-3 p-4">
                      <RadioGroupItem value="delivery" id="delivery" />
                      <Truck className="h-5 w-5 text-primary" />
                      <div className="flex-1">
                        <Label htmlFor="delivery" className="text-sm font-medium cursor-pointer">
                          Home Delivery
                        </Label>
                        <p className="text-xs text-muted-foreground">Get your order delivered to your address</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="cursor-pointer hover:border-primary transition-colors">
                    <CardContent className="flex items-center space-x-3 p-4">
                      <RadioGroupItem value="pickup" id="pickup" />
                      <MapPin className="h-5 w-5 text-primary" />
                      <div className="flex-1">
                        <Label htmlFor="pickup" className="text-sm font-medium cursor-pointer">
                          Store Pickup
                        </Label>
                        <p className="text-xs text-muted-foreground">Pick up your order from our store location</p>
                      </div>
                    </CardContent>
                  </Card>
                </RadioGroup>
              </div>

              {formData.fulfillment_type === 'delivery' && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Delivery Address
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <Label htmlFor="address_line_1">Street Address *</Label>
                      <Input
                        id="address_line_1"
                        value={formData.delivery_address.address_line_1}
                        onChange={(e) => setFormData({
                          ...formData,
                          delivery_address: { ...formData.delivery_address, address_line_1: e.target.value }
                        })}
                        placeholder="House number and street name"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="address_line_2">Apartment/Unit (Optional)</Label>
                      <Input
                        id="address_line_2"
                        value={formData.delivery_address.address_line_2}
                        onChange={(e) => setFormData({
                          ...formData,
                          delivery_address: { ...formData.delivery_address, address_line_2: e.target.value }
                        })}
                        placeholder="Apartment, suite, unit, etc."
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="city">City *</Label>
                        <Input
                          id="city"
                          value={formData.delivery_address.city}
                          onChange={(e) => setFormData({
                            ...formData,
                            delivery_address: { ...formData.delivery_address, city: e.target.value }
                          })}
                          placeholder="e.g., Lagos"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="state">State *</Label>
                        <Select
                          value={formData.delivery_address.state}
                          onValueChange={(value) => setFormData({
                            ...formData,
                            delivery_address: { ...formData.delivery_address, state: value }
                          })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select state" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Lagos">Lagos</SelectItem>
                            <SelectItem value="Abuja">Abuja</SelectItem>
                            <SelectItem value="Ogun">Ogun</SelectItem>
                            <SelectItem value="Rivers">Rivers</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="landmark">Landmark (Optional)</Label>
                      <Input
                        id="landmark"
                        value={formData.delivery_address.landmark}
                        onChange={(e) => setFormData({
                          ...formData,
                          delivery_address: { ...formData.delivery_address, landmark: e.target.value }
                        })}
                        placeholder="Nearest landmark or additional directions"
                      />
                    </div>
                  </div>

                  <DeliveryZoneDropdown
                    selectedZoneId={formData.delivery_zone_id}
                    onZoneSelect={(zoneId, fee) => {
                      setFormData({ ...formData, delivery_zone_id: zoneId });
                      setDeliveryFee(fee);
                    }}
                    orderSubtotal={cart?.summary?.subtotal || 0}
                  />
                </div>
              )}

              {formData.fulfillment_type === 'pickup' && (
                <div className="space-y-4">
                  <PickupPointSelector
                    selectedPointId={formData.pickup_point_id}
                    onSelect={(pickupPoint) => {
                      setFormData({ 
                        ...formData, 
                        pickup_point_id: pickupPoint?.id || '' 
                      });
                    }}
                  />
                </div>
              )}

              <div className="flex gap-4 pt-6">
                <Button 
                  type="button" 
                  onClick={() => isAuthenticated ? onClose() : setCheckoutStep('choice')} 
                  variant="outline" 
                  className="flex-1"
                  disabled={isSubmitting}
                >
                  {isAuthenticated ? 'Cancel' : 'Back'}
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSubmitting || items.length === 0} 
                  className="flex-1"
                >
                  {isSubmitting ? "Processing..." : "Continue to Payment"}
                </Button>
              </div>
            </form>
          )}

          {checkoutStep === 'payment' && paymentData && (
            <div className="space-y-6">
              <div className="text-center">
                <h3 className="font-semibold text-lg mb-2">Complete Payment</h3>
                <p className="text-muted-foreground">
                  Secure payment powered by Paystack
                </p>
              </div>

              <PaystackPaymentHandler
                amount={paymentData.amount}
                email={paymentData.email}
                reference={paymentData.reference}
                orderNumber={paymentData.orderNumber}
                paymentUrl={paymentData.paymentUrl}
                onSuccess={handlePaymentSuccess}
                onError={handlePaymentError}
                onClose={() => setCheckoutStep('details')}
              />

              <div className="flex gap-4">
                <Button 
                  variant="outline" 
                  onClick={() => setCheckoutStep('details')} 
                  className="flex-1"
                >
                  Back to Details
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
});

EnhancedCheckoutFlowComponent.displayName = 'EnhancedCheckoutFlowComponent';

export const EnhancedCheckoutFlow: React.FC<EnhancedCheckoutFlowProps> = (props) => (
  <CheckoutErrorBoundary>
    <EnhancedCheckoutFlowComponent {...props} />
  </CheckoutErrorBoundary>
);
