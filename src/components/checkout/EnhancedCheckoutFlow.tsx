import React, { useState, useEffect } from 'react';
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/hooks/useCart";
import { useGuestSession } from "@/hooks/useGuestSession";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCustomerProfile } from "@/hooks/useCustomerProfile";
import { useNavigate } from "react-router-dom";
import { Mail, Phone, MapPin, CreditCard, Banknote, Truck, X } from "lucide-react";
import { DeliveryZoneDropdown } from "@/components/delivery/DeliveryZoneDropdown";
import { PickupPointSelector } from "@/components/delivery/PickupPointSelector";
import { GuestOrLoginChoice } from "./GuestOrLoginChoice";
import { storeRedirectUrl } from "@/utils/redirect";
import { useOrderProcessing } from "@/hooks/useOrderProcessing";
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

export const EnhancedCheckoutFlow: React.FC<EnhancedCheckoutFlowProps> = ({ 
  isOpen, 
  onClose 
}) => {
  const { cart, clearCart } = useCart();
  const { profile: customerAccount } = useCustomerProfile();
  const { isAuthenticated, customerAccount: authCustomerAccount, session } = useAuth();
  const { guestSession, generateGuestSession } = useGuestSession();
  const { markCheckoutInProgress } = useOrderProcessing();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [checkoutStep, setCheckoutStep] = useState<'choice' | 'details'>('choice');
  const [paymentInProgress, setPaymentInProgress] = useState(false);
  const [paystackLoaded, setPaystackLoaded] = useState(false);

  // Load Paystack script on component mount
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.async = true;
    script.onload = () => {
      console.log('✅ Paystack script loaded successfully');
      setPaystackLoaded(true);
    };
    script.onerror = () => {
      console.error('❌ Failed to load Paystack script');
    };
    
    if (!document.querySelector('script[src="https://js.paystack.co/v1/inline.js"]')) {
      document.head.appendChild(script);
    } else {
      setPaystackLoaded(true);
    }

    return () => {
      // Cleanup if needed
    };
  }, []);

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

  const items = cart?.items || [];
  const currentDeliveryFee = formData.fulfillment_type === 'pickup' ? 0 : deliveryFee;
  const total = (cart?.summary?.total_amount || 0) + currentDeliveryFee;

  // Handle authentication choice
  const handleContinueAsGuest = async () => {
    if (!guestSession) {
      await generateGuestSession();
    }
    setCheckoutStep('details');
  };

  const handleLogin = () => {
    // Store current URL for redirect after login
    storeRedirectUrl(window.location.pathname + window.location.search);
    onClose();
    navigate('/auth');
  };

  // Auto-advance to details if user is already authenticated
  React.useEffect(() => {
    if (isAuthenticated && checkoutStep === 'choice') {
      setCheckoutStep('details');
    }
  }, [isAuthenticated, checkoutStep]);

  // Auto-populate form data when session or customer account is available
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

  // UUID validation utility
  const isValidUUID = (str: string): boolean => {
    if (!str || typeof str !== 'string') return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  };

  // Sanitize pickup point ID
  const sanitizePickupPointId = (id: string | undefined, fulfillmentType: string): string | null => {
    if (fulfillmentType !== 'pickup') return null;
    if (!id || id === '' || id === 'default') return null;
    return isValidUUID(id) ? id : null;
  };

  // Sanitize guest session ID
  const sanitizeGuestSessionId = (guestSession: any): string | null => {
    if (!guestSession || typeof guestSession !== 'object') return null;
    const sessionId = guestSession.sessionId;
    if (!sessionId || typeof sessionId !== 'string') return null;
    return isValidUUID(sessionId) ? sessionId : null;
  };

  // Sanitize delivery address
  const sanitizeDeliveryAddress = (address: DeliveryAddress, fulfillmentType: string): object | null => {
    if (fulfillmentType !== 'delivery') return null;
    
    // Ensure all required fields are present and clean
    const cleanAddress = {
      address_line_1: address.address_line_1?.trim() || '',
      address_line_2: address.address_line_2?.trim() || '',
      city: address.city?.trim() || '',
      state: address.state?.trim() || 'Lagos',
      postal_code: address.postal_code?.trim() || '',
      landmark: address.landmark?.trim() || ''
    };

    // Remove empty optional fields
    if (!cleanAddress.address_line_2) delete cleanAddress.address_line_2;
    if (!cleanAddress.landmark) delete cleanAddress.landmark;
    if (!cleanAddress.postal_code) delete cleanAddress.postal_code;

    return cleanAddress;
  };

  // Sanitize order items for JSONB compatibility
  const sanitizeOrderItems = (items: any[]): any[] => {
    return items.map(item => ({
      product_id: String(item.product_id || ''),
      quantity: Number(item.quantity || 1),
      unit_price: Number(item.price || 0),
      total_price: Number((item.price || 0) * (item.quantity || 1))
    }));
  };

  // Comprehensive data validation
  const validateCheckoutData = (data: any): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];

    // Required field validation
    if (!data.customer_email) errors.push('Email is required');
    if (!data.customer_name) errors.push('Name is required');
    if (!data.customer_phone) errors.push('Phone is required');

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (data.customer_email && !emailRegex.test(data.customer_email)) {
      errors.push('Invalid email format');
    }

    // Fulfillment type validation
    if (data.fulfillment_type === 'delivery') {
      if (!data.delivery_address?.address_line_1) errors.push('Street address is required for delivery');
      if (!data.delivery_address?.city) errors.push('City is required for delivery');
      if (!data.delivery_zone_id) errors.push('Delivery zone is required');
    } else if (data.fulfillment_type === 'pickup') {
      if (!data.pickup_point_id) errors.push('Pickup point is required');
    }

    // Items validation
    if (!data.order_items || data.order_items.length === 0) {
      errors.push('No items in order');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Collect raw form data for logging
      const rawData = {
        customer_email: formData.customer_email,
        customer_name: formData.customer_name,
        customer_phone: formData.customer_phone,
        fulfillment_type: formData.fulfillment_type,
        delivery_address: formData.delivery_address,
        pickup_point_id: formData.pickup_point_id,
        delivery_zone_id: formData.delivery_zone_id,
        items: items,
        guestSession: guestSession
      };

      console.log('🔍 Raw checkout data:', rawData);

      // Sanitize and clean all data
      const sanitizedData = {
        customer_email: formData.customer_email?.trim(),
        customer_name: formData.customer_name?.trim(),
        customer_phone: formData.customer_phone?.trim() || null,
        fulfillment_type: formData.fulfillment_type,
        delivery_address: sanitizeDeliveryAddress(formData.delivery_address, formData.fulfillment_type),
        pickup_point_id: sanitizePickupPointId(formData.pickup_point_id, formData.fulfillment_type),
        order_items: sanitizeOrderItems(items),
        total_amount: total,
        delivery_fee: formData.fulfillment_type === 'delivery' ? deliveryFee : 0,
        delivery_zone_id: formData.fulfillment_type === 'delivery' && formData.delivery_zone_id && isValidUUID(formData.delivery_zone_id) ? formData.delivery_zone_id : null,
        payment_method: 'paystack',
        guest_session_id: !isAuthenticated ? sanitizeGuestSessionId(guestSession) : null
      };

      console.log('✅ Sanitized checkout data:', sanitizedData);

      // Validate sanitized data
      const validation = validateCheckoutData(sanitizedData);
      if (!validation.isValid) {
        console.error('❌ Validation errors:', validation.errors);
        toast({
          title: "Validation Error",
          description: validation.errors[0],
          variant: "destructive",
        });
        return;
      }

      console.log('🚀 Processing checkout with clean data...');

      const { data, error } = await supabase.functions.invoke('process-checkout', {
        body: sanitizedData
      });

      // 🔍 CRITICAL DEBUG: Check exact response format
      console.log('🔍 Success value type check:', {
        success: data?.success,
        successType: typeof data?.success,
        isStrictTrue: data?.success === true,
        isStringTrue: data?.success === 'true',
        isTruthyTrue: !!data?.success,
        rawResponse: data
      });

      if (error) {
        console.error('🔍 Supabase function error:', error);
        throw new Error(error.message);
      }

      // ✅ CRITICAL FIX: Handle both boolean true and string "true"
      const isSuccess = data && (data.success === true || data.success === 'true' || String(data.success).toLowerCase() === 'true');
      
      if (isSuccess) {
        console.log('✅ Checkout successful! Order created:', {
          orderId: data.order_id,
          orderNumber: data.order_number,
          totalAmount: data.total_amount,
          paymentReference: data.payment?.reference,
          successValue: data.success,
          successType: typeof data.success
        });

        // Process Paystack payment with popup
        if (data.payment?.payment_url && data.payment?.reference) {
          console.log('🛒 Initializing Paystack popup payment...');
          
          try {
            await processPaystackPayment({
              reference: data.payment.reference,
              amount: data.total_amount,
              email: formData.customer_email,
              orderNumber: data.order_number,
              paymentUrl: data.payment.payment_url
            });
            
            // Success is handled in the payment callback
            return;
          } catch (paymentError) {
            console.error('🚨 Paystack payment error:', paymentError);
            toast({
              title: "Payment Error",
              description: "Failed to initialize payment. Please try again.",
              variant: "destructive",
            });
            return;
          }
        } else {
          console.error('❌ Missing payment data in response:', data);
          toast({
            title: "Payment Error",
            description: "Payment initialization data missing. Please try again.",
            variant: "destructive",
          });
          return;
        }
      } else {
        // Handle actual failures - only trigger if success is explicitly false
        console.error('❌ Checkout failed - backend response:', {
          success: data?.success,
          successType: typeof data?.success,
          message: data?.message,
          error: data?.error,
          fullResponse: data
        });
        
        const errorMessage = data?.message || data?.error || "Failed to process checkout";
        toast({
          title: "Checkout Failed",
          description: errorMessage,
          variant: "destructive",
        });
        return;
      }

    } catch (error) {
      console.error('💥 Checkout error:', error);
      toast({
        title: "Checkout Error",
        description: error instanceof Error ? error.message : "Failed to process checkout. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Process Paystack payment with popup
  // Enhanced Paystack script loading with retry mechanism
  const loadPaystackScript = () => {
    return new Promise((resolve, reject) => {
      if (window.PaystackPop) {
        resolve(window.PaystackPop);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://js.paystack.co/v1/inline.js';
      script.async = true;
      script.onload = () => {
        if (window.PaystackPop) {
          resolve(window.PaystackPop);
        } else {
          reject(new Error('PaystackPop not available after script load'));
        }
      };
      script.onerror = () => reject(new Error('Failed to load Paystack script'));
      document.head.appendChild(script);
    });
  };

  const processPaystackPayment = async (paymentData: {
    reference: string;
    amount: number;
    email: string;
    orderNumber: string;
    paymentUrl: string;
  }) => {
    setPaymentInProgress(true);
    
    try {
      console.log('🚀 Starting Paystack payment initialization...', {
        amount: paymentData.amount,
        email: paymentData.email,
        reference: paymentData.reference,
        paystackLoaded: !!window.PaystackPop
      });

      // Wait for Paystack to be available with timeout
      let attempts = 0;
      while (!window.PaystackPop && attempts < 30) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (!window.PaystackPop) {
        throw new Error('Paystack failed to load after 3 seconds');
      }

      console.log('✅ Paystack available, initializing payment popup...');

      // Use setup method which is available on the PaystackPop object
      const handler = window.PaystackPop.setup({
        key: 'pk_live_0b6a7a38a3afaaa5dd1ab30c7fbee8a3d9a4e2e7',
        email: paymentData.email,
        amount: paymentData.amount * 100, // Convert to kobo
        currency: 'NGN',
        ref: paymentData.reference,
        channels: ['card', 'bank', 'ussd', 'mobile_money'],
        metadata: {
          order_number: paymentData.orderNumber,
          customer_email: paymentData.email
        },
        callback: function(response: any) {
          console.log('✅ Paystack payment callback received:', response);
          setPaymentInProgress(false);
          
          if (response.status === 'success') {
            markCheckoutInProgress(response.reference);
            clearCart();
            
            toast({
              title: "Payment Successful!",
              description: "Your payment has been processed successfully.",
            });
            
            // Navigate to payment callback for verification
            window.location.href = `/payment-callback?reference=${response.reference}&status=success`;
          } else {
            console.error('❌ Payment was not successful:', response);
            toast({
              title: "Payment Failed",
              description: response.message || "Your payment was not successful. Please try again.",
              variant: "destructive",
            });
          }
        },
        onClose: function() {
          console.log('🚪 Paystack popup closed by user');
          setPaymentInProgress(false);
          // Don't show error toast for user-initiated close
        }
      });

      // Open the payment popup
      handler.openIframe();
      
    } catch (error) {
      console.error('💳 Paystack initialization failed:', error);
      setPaymentInProgress(false);
      
      // Show error and fallback to redirect
      toast({
        title: "Payment Error",
        description: "Failed to open payment popup. Redirecting to secure payment page...",
        variant: "destructive",
      });
      
      setTimeout(() => {
        window.location.href = paymentData.paymentUrl;
      }, 2000);
    }
  };

  console.log('🔄 EnhancedCheckoutFlow render - isOpen:', isOpen, 'cart items:', cart?.items?.length);

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
                : 'Complete your order details and choose your payment method'
              }
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        
        <CardContent>
          {/* Order Summary */}
          <div className="space-y-4 mb-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Order Summary</h3>
              {checkoutStep === 'details' && (
                <span className="text-sm text-muted-foreground">
                  Order will be assigned an ID upon placement
                </span>
              )}
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
              {checkoutStep === 'details' && formData.fulfillment_type === 'delivery' && deliveryFee > 0 && (
                <div className="flex justify-between">
                  <span>Delivery Fee:</span>
                  <span>₦{deliveryFee.toLocaleString()}</span>
                </div>
              )}
              {checkoutStep === 'details' && formData.fulfillment_type === 'pickup' && (
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

          {/* Guest vs Login Choice */}
          {checkoutStep === 'choice' && !isAuthenticated && (
            <GuestOrLoginChoice
              totalAmount={total}
              onContinueAsGuest={handleContinueAsGuest}
              onLogin={handleLogin}
            />
          )}

          {/* Checkout Details Form */}
          {checkoutStep === 'details' && (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Customer Information */}
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

              {/* Fulfillment Options */}
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

              {/* Delivery Address (only show for delivery) */}
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

                  {/* Delivery Zone Dropdown */}
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

              {/* Pickup Point Selection (only show for pickup) */}
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

              {/* Payment Method */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Payment Method
                </h3>
                <Card className="border-primary bg-primary/5">
                  <CardContent className="flex items-center space-x-3 p-4">
                    <CreditCard className="h-5 w-5 text-primary" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">Secure Card Payment</div>
                      <p className="text-xs text-muted-foreground">Pay securely with your debit/credit card via Paystack</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Action Buttons */}
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
                  disabled={isSubmitting || paymentInProgress || items.length === 0} 
                  className="flex-1"
                >
                  {isSubmitting || paymentInProgress ? 
                    (paymentInProgress ? "Processing Payment..." : "Processing...") : 
                    "Place Order"
                  }
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
