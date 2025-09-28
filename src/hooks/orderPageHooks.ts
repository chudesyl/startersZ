import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateOrder } from '@/api/orders';
import { sendOrderStatusEmail } from '@/utils/sendOrderStatusEmail';
import { useToast } from '@/hooks/use-toast';

interface UseOrderPageHooksProps {
  orderId: string;
  orderData?: any;
  adminEmail?: string;
}

interface OrderUpdateData {
  status?: string;
  assigned_rider_id?: string;
  customer_phone?: string;
}

/**
 * Custom hooks for order page functionality
 * Handles status updates, rider assignments, and email notifications
 */
export const useOrderPageHooks = ({ orderId, orderData, adminEmail }: UseOrderPageHooksProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Local state for UI
  const [isUpdating, setIsUpdating] = useState(false);
  const [connectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connected');

  // Order update mutation with email notification
  const updateOrderMutation = useMutation({
    mutationFn: async (updates: OrderUpdateData) => {
      setIsUpdating(true);
      return updateOrder(orderId, updates);
    },
    onSuccess: async (updatedOrder, variables) => {
      setIsUpdating(false);
      
      // Send email notification if status changed
      if (variables.status && orderData?.order?.customer_email) {
        try {
          await sendOrderStatusEmail(
            orderData.order.customer_email,
            variables.status,
            orderData.order.order_number || orderId,
            {
              customerName: orderData.order.customer_name || 'Valued Customer',
              adminEmail: adminEmail || 'admin@example.com'
            }
          );
          
          toast({
            title: 'Success',
            description: 'Order updated and notification sent to customer.',
          });
        } catch (emailError) {
          console.error('Email notification failed:', emailError);
          toast({
            title: 'Order Updated',
            description: 'Order updated successfully, but email notification failed.',
            variant: 'destructive'
          });
        }
      } else {
        toast({
          title: 'Success',
          description: 'Order updated successfully.',
        });
      }
      
      // Invalidate and refetch order data
      queryClient.invalidateQueries({ queryKey: ['detailed-order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error: any) => {
      setIsUpdating(false);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update order',
        variant: 'destructive'
      });
    }
  });

  // Status update helper
  const updateStatus = (status: string) => {
    updateOrderMutation.mutate({ status });
  };

  // Rider assignment helper
  const assignRider = (riderId: string) => {
    updateOrderMutation.mutate({ assigned_rider_id: riderId });
  };

  // Phone update helper
  const updatePhone = (phone: string) => {
    updateOrderMutation.mutate({ customer_phone: phone });
  };

  // Combined update helper
  const updateOrder = (updates: OrderUpdateData) => {
    updateOrderMutation.mutate(updates);
  };

  return {
    // State
    isUpdating,
    connectionStatus,
    
    // Mutations
    updateOrderMutation,
    
    // Helper functions
    updateStatus,
    assignRider,
    updatePhone,
    updateOrder,
    
    // Status
    isLoading: updateOrderMutation.isPending || isUpdating,
    error: updateOrderMutation.error,
  };
};

/**
 * Hook for managing order status changes with validation
 */
export const useOrderStatusManager = (orderId: string, currentStatus: string) => {
  const { toast } = useToast();
  const [selectedStatus, setSelectedStatus] = useState('');

  // Valid status transitions
  const statusTransitions: { [key: string]: string[] } = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['preparing', 'cancelled'],
    preparing: ['ready', 'cancelled'],
    ready: ['out_for_delivery', 'delivered', 'cancelled'],
    out_for_delivery: ['delivered', 'cancelled'],
    delivered: [],
    cancelled: []
  };

  const getValidStatuses = () => {
    return statusTransitions[currentStatus] || [];
  };

  const isValidTransition = (newStatus: string) => {
    return getValidStatuses().includes(newStatus);
  };

  const validateStatusChange = (newStatus: string) => {
    if (!isValidTransition(newStatus)) {
      toast({
        title: 'Invalid Status Change',
        description: `Cannot change from ${currentStatus} to ${newStatus}`,
        variant: 'destructive'
      });
      return false;
    }
    return true;
  };

  return {
    selectedStatus,
    setSelectedStatus,
    getValidStatuses,
    isValidTransition,
    validateStatusChange
  };
};

/**
 * Hook for managing rider assignments
 */
export const useRiderAssignment = (orderId: string, orderType: string) => {
  const [selectedRider, setSelectedRider] = useState('');

  const canAssignRider = orderType === 'delivery';

  const clearRiderSelection = () => {
    setSelectedRider('');
  };

  return {
    selectedRider,
    setSelectedRider,
    canAssignRider,
    clearRiderSelection
  };
};

export default useOrderPageHooks;