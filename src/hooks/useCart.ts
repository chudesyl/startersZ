import { useState, useEffect, useMemo, useCallback, useContext } from 'react';
import { useCartTracking } from '@/hooks/useCartTracking';
import { calculateCartVATSummary } from '@/lib/vatCalculations';
import { useGuestSession } from './useGuestSession';
import { useCustomerAuth } from './useCustomerAuth';
import { useToast } from '@/hooks/use-toast';
import { CartContext } from '@/contexts/CartContext';

export interface CartItem {
  id: string;
  product_id: string;
  product_name: string;
  price: number;
  original_price?: number;
  discount_amount?: number;
  quantity: number;
  vat_rate?: number;
  image_url?: string;
  customizations?: Record<string, any>;
  special_instructions?: string;
  minimum_order_quantity?: number; // Add MOQ to cart items
}

export interface OrderSummary {
  subtotal: number;
  subtotal_cost: number;
  total_vat: number;
  tax_amount: number;
  delivery_fee: number;
  discount_amount: number;
  delivery_discount: number;
  total_amount: number;
  
}

const CART_STORAGE_KEY = 'restaurant_cart';
const TAX_RATE = 0.08; // 8% tax rate
const DELIVERY_FEE = 5.99;
const FREE_DELIVERY_THRESHOLD = 30;

// Optimize cart operations for production
const isProduction = !window.location.hostname.includes('localhost');

export interface Cart {
  items: CartItem[];
  summary: OrderSummary;
  itemCount: number;
  
}

export const useCartInternal = () => {
  const { guestSession, generateGuestSession } = useGuestSession();
  const { customerAccount } = useCustomerAuth();
  const { toast } = useToast();
  const [cart, setCart] = useState<Cart>({
    items: [],
    summary: {
      subtotal: 0,
      subtotal_cost: 0,
      total_vat: 0,
      tax_amount: 0,
      delivery_fee: 0,
      discount_amount: 0,
      delivery_discount: 0,
      total_amount: 0,
    },
    itemCount: 0
  });
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize cart tracking
  const { trackCart } = useCartTracking(cart);

  // Initialize guest session when cart is first used (PRODUCTION OPTIMIZED)
  useEffect(() => {
    if (!customerAccount && !guestSession && cart.items.length > 0 && isInitialized) {
      console.log('🛒 Initializing guest session for cart...');
      generateGuestSession().catch(console.error);
    }
  }, [cart.items.length, customerAccount, guestSession, generateGuestSession, isInitialized]);

  // Load cart from localStorage on mount (PRODUCTION OPTIMIZED)
  useEffect(() => {
    if (isInitialized) return; // Prevent double initialization
    
    console.log('🛒 useCart - Loading cart from localStorage...');
    try {
      const savedCart = localStorage.getItem(CART_STORAGE_KEY);
      console.log('🛒 useCart - Raw saved cart:', savedCart);
      
      if (savedCart) {
        const parsedCart = JSON.parse(savedCart);
        
        // Validate the parsed cart structure
        if (parsedCart && typeof parsedCart === 'object' && Array.isArray(parsedCart.items)) {
          setCart(parsedCart);
          console.log('🛒 useCart - Cart restored from localStorage');
        } else {
          console.warn('🛒 useCart - Invalid cart structure, resetting...');
          localStorage.removeItem(CART_STORAGE_KEY);
        }
      } else {
        console.log('🛒 useCart - No saved cart found in localStorage');
      }
    } catch (error) {
      console.error('🛒 useCart - Error loading cart:', error);
      localStorage.removeItem(CART_STORAGE_KEY);
    }
    
    setIsInitialized(true);
  }, []); // Remove isInitialized dependency to prevent loops

  // Save cart to localStorage with optimized debouncing
  useEffect(() => {
    if (!isInitialized) return;
    
    const timeoutId = setTimeout(() => {
      try {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
      } catch (error) {
        console.error('🛒 useCart - Error saving cart:', error);
      }
    }, 50); // Reduced debounce for faster persistence

    return () => clearTimeout(timeoutId);
  }, [cart, isInitialized]);

  // Memoized cart calculations for performance
  const calculateCartSummary = useCallback((
    items: CartItem[], 
    deliveryFee = 0
  ): Cart => {
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

    // Calculate VAT breakdown
    const vatSummary = calculateCartVATSummary(
      items.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        price: item.price,
        quantity: item.quantity,
        vat_rate: item.vat_rate || 7.5
      })),
      deliveryFee
    );

    const total_amount = subtotal + deliveryFee;

    return {
      items: items,
      summary: {
        subtotal: Math.round(subtotal * 100) / 100,
        subtotal_cost: Math.round(vatSummary.subtotal_cost * 100) / 100,
        total_vat: Math.round(vatSummary.total_vat * 100) / 100,
        tax_amount: 0,
        delivery_fee: Math.round(deliveryFee * 100) / 100,
        discount_amount: 0,
        delivery_discount: 0,
        total_amount: Math.round(total_amount * 100) / 100
      },
      itemCount
    };
  }, []);

  const addItem = (product: {
    id: string;
    name: string;
    price: number;
    original_price?: number;
    discount_amount?: number;
    vat_rate?: number;
    image_url?: string;
    customizations?: Record<string, any>;
    special_instructions?: string;
    minimum_order_quantity?: number; // Add MOQ to product interface
  }, quantity = 1) => {
    console.log('🛒 addItem called with:', { product, quantity });
    console.log('🛒 Current cart state:', cart);
    
    try {
      const moq = product.minimum_order_quantity || 1;
      
      // Check if product already exists in cart
      const existingItemIndex = cart.items.findIndex(item => item.product_id === product.id);
      console.log('🛒 Existing item index:', existingItemIndex);
      
      let updatedItems: CartItem[];
      
      if (existingItemIndex >= 0) {
        // Product exists, update quantity
        console.log('🛒 Updating existing item quantity');
        const newQuantity = cart.items[existingItemIndex].quantity + quantity;
        
        // Validate MOQ for updated quantity
        if (newQuantity < moq) {
          console.warn(`🛒 MOQ violation: ${product.name} requires minimum ${moq}, attempting to set ${newQuantity}`);
          // Automatically adjust to MOQ if below minimum
          updatedItems = cart.items.map((item, index) => 
            index === existingItemIndex 
              ? { ...item, quantity: moq }
              : item
          );
          
          // Show MOQ notification
          toast({
            title: "Quantity Adjusted",
            description: `${product.name} quantity adjusted to meet minimum order requirement (${moq} items)`,
            variant: "default",
          });
        } else {
          updatedItems = cart.items.map((item, index) => 
            index === existingItemIndex 
              ? { ...item, quantity: newQuantity }
              : item
          );
        }
      } else {
        // New product, add to cart
        console.log('🛒 Adding new item to cart');
        
        // Ensure quantity meets MOQ
        const validQuantity = Math.max(quantity, moq);
        
        const newItem: CartItem = {
          id: `${product.id}_${Date.now()}`,
          product_id: product.id,
          product_name: product.name,
          price: product.price,
          original_price: product.original_price,
          discount_amount: product.discount_amount,
          quantity: validQuantity,
          vat_rate: product.vat_rate || 7.5,
          image_url: product.image_url,
          customizations: product.customizations,
          special_instructions: product.special_instructions,
          minimum_order_quantity: moq
        };
        console.log('🛒 New item created:', newItem);
        updatedItems = [...cart.items, newItem];
      }
      
      console.log('🛒 Updated items:', updatedItems);
      const newCart = calculateCartSummary(updatedItems, 0); // No delivery fee in cart
      console.log('🛒 New cart calculated:', newCart);
      setCart(newCart);
      console.log('🛒 Cart state updated successfully');
    } catch (error) {
      console.error('🛒 Error in addItem:', error);
    }
  };

  const removeItem = useCallback((cartItemId: string) => {
    // Optimistic update: immediately filter out the item
    const updatedItems = cart.items.filter(item => item.id !== cartItemId);
    
    // Immediate calculation and state update
    const newCart = calculateCartSummary(updatedItems, 0);
    setCart(newCart);
  }, [cart.items, calculateCartSummary]);

  const updateQuantity = useCallback((cartItemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(cartItemId);
      return;
    }

    // Optimistic update: immediately update the quantity
    const updatedItems = cart.items.map(item => {
      if (item.id === cartItemId) {
        const moq = item.minimum_order_quantity || 1;
        const validQuantity = Math.max(quantity, moq);
        return { ...item, quantity: validQuantity };
      }
      return item;
    });
    
    // Immediate calculation and state update
    const newCart = calculateCartSummary(updatedItems, 0);
    setCart(newCart);
  }, [cart.items, calculateCartSummary, removeItem]);

  const clearCart = () => {
    console.log('🛒 Clearing cart and all related data...');
    setCart({
      items: [],
      summary: {
        subtotal: 0,
        subtotal_cost: 0,
        total_vat: 0,
        tax_amount: 0,
        delivery_fee: 0,
        discount_amount: 0,
        delivery_discount: 0,
        total_amount: 0,
        
      },
      itemCount: 0
    });
    localStorage.removeItem(CART_STORAGE_KEY);
    localStorage.removeItem('guest_session');
    localStorage.removeItem('cart_abandonment_tracking');
    console.log('🛒 Cart and shopping data cleared successfully');
  };

  const updateDeliveryFee = (deliveryFee: number) => {
    setCart(calculateCartSummary(cart.items, deliveryFee));
  };


  const getCartTotal = () => cart.summary.total_amount;
  const getItemCount = () => cart.itemCount;
  const isEmpty = () => cart.items.length === 0;

  return {
    cart,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    updateDeliveryFee,
    getCartTotal,
    getItemCount,
    isEmpty
  };
};

// Context consumer hook to ensure a single cart instance app-wide
export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used within CartProvider');
  }
  return ctx;
};