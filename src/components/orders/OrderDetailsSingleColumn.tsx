import React, { useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Printer, Package, User, Phone, Mail, MapPin, Clock, Truck, Building2, CheckCircle2, AlertCircle, Wifi } from 'lucide-react';
import { useDetailedOrderData } from '@/hooks/useDetailedOrderData';
import { getDispatchRiders } from '@/api/users';
import { updateOrder } from '@/api/orders';
import { sendOrderStatusEmail } from '@/utils/sendOrderStatusEmail';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { useReactToPrint } from 'react-to-print';

interface OrderDetailsSingleColumnProps {
  orderId: string;
  adminEmail?: string;
}

const OrderDetailsSingleColumn: React.FC<OrderDetailsSingleColumnProps> = ({ 
  orderId, 
  adminEmail = 'admin@example.com' 
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);
  
  // State for editable fields
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneValue, setPhoneValue] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedRider, setSelectedRider] = useState('');
  const [connectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connected');
  
  // Data queries
  const { data: orderData, isLoading, error, refetch } = useDetailedOrderData(orderId);
  const { data: riders = [] } = useQuery({
    queryKey: ['dispatch-riders'],
    queryFn: getDispatchRiders,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Order update mutation
  const updateMutation = useMutation({
    mutationFn: (updates: { status?: string; assigned_rider_id?: string; customer_phone?: string }) => 
      updateOrder(orderId, updates),
    onSuccess: async (updatedOrder, variables) => {
      // Send email notification if status changed
      if (variables.status && orderData?.order?.customer_email) {
        try {
          await sendOrderStatusEmail(
            orderData.order.customer_email,
            variables.status,
            orderData.order.order_number || orderId,
            {
              customerName: orderData.order.customer_name || 'Valued Customer',
              adminEmail
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
      
      queryClient.invalidateQueries({ queryKey: ['detailed-order', orderId] });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update order',
        variant: 'destructive'
      });
    }
  });

  // Print handler
  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    documentTitle: `Order-${orderData?.order?.order_number || orderId}`,
  });

  // Phone update handler
  const handlePhoneUpdate = () => {
    if (phoneValue.trim()) {
      updateMutation.mutate({ customer_phone: phoneValue });
      setEditingPhone(false);
    }
  };

  // Status update handler
  const handleStatusUpdate = () => {
    if (selectedStatus) {
      updateMutation.mutate({ status: selectedStatus });
    }
  };

  // Rider assignment handler
  const handleRiderAssignment = () => {
    if (selectedRider) {
      updateMutation.mutate({ assigned_rider_id: selectedRider });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full border-4 border-primary border-t-transparent h-8 w-8 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading order details...</p>
        </div>
      </div>
    );
  }

  if (error || !orderData?.order) {
    return (
      <div className="flex items-center justify-center p-8">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Order Not Found</h3>
            <p className="text-muted-foreground mb-4">
              {error?.message || 'Unable to load order details'}
            </p>
            <Button onClick={() => refetch()} variant="outline">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { order, items = [], fulfillment_info } = orderData;
  const deliveryFee = order.order_type === 'delivery' ? (order.delivery_fee || 0) : 0;
  const isAdmin = true; // In real app, check user permissions

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6" ref={printRef}>
      {/* Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Package className="w-6 h-6" />
                  #{order.order_number}
                </h1>
                <Badge variant={order.status === 'delivered' ? 'default' : 'secondary'} className="capitalize">
                  {order.status?.replace('_', ' ')}
                </Badge>
                <Badge variant="outline" className="capitalize">
                  {order.order_type}
                </Badge>
                <Badge 
                  variant={connectionStatus === 'connected' ? 'default' : 'secondary'}
                  className="flex items-center gap-1"
                >
                  <Wifi className="w-3 h-3" />
                  {connectionStatus}
                </Badge>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Print
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Customer Information */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <User className="w-5 h-5" />
            Customer Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Name</p>
              <p className="font-medium">{order.customer_name || 'Guest Customer'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium flex items-center gap-2">
                <Mail className="w-4 h-4" />
                {order.customer_email || 'No email provided'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Phone</p>
              {editingPhone ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={phoneValue}
                    onChange={(e) => setPhoneValue(e.target.value)}
                    placeholder="Enter phone number"
                    className="flex-1"
                  />
                  <Button size="sm" onClick={handlePhoneUpdate}>
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingPhone(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <p 
                  className="font-medium flex items-center gap-2 cursor-pointer hover:text-primary"
                  onClick={() => {
                    setPhoneValue(order.customer_phone || '');
                    setEditingPhone(true);
                  }}
                >
                  <Phone className="w-4 h-4" />
                  {order.customer_phone || 'Click to add phone'}
                </p>
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Customer Type</p>
              <p className="font-medium">Guest Customer</p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Payment Status</p>
              <Badge variant={order.payment_status === 'completed' ? 'default' : 'secondary'}>
                {order.payment_status || 'Pending'}
              </Badge>
            </div>
            {order.payment_reference && (
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Payment Reference</p>
                <p className="font-mono text-sm">{order.payment_reference}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Order Items */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4">Order Items</h2>
          <div className="space-y-4">
            {items.map((item: any) => (
              <div key={item.id} className="flex items-center gap-4 p-4 border rounded-lg">
                <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center">
                  <Package className="w-8 h-8 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium">{item.name || item.product_name}</h3>
                  <p className="text-sm text-muted-foreground">
                    Quantity: {item.quantity} × ₦{item.unit_price?.toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">₦{item.total_price?.toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Delivery Fee (if delivery order) */}
      {order.order_type === 'delivery' && deliveryFee > 0 && (
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Delivery Fee
            </h2>
            <div className="flex justify-between items-center">
              <span>Delivery Charge</span>
              <span className="font-semibold">₦{deliveryFee.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delivery Information (delivery orders only) */}
      {order.order_type === 'delivery' && (
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Delivery Information
            </h2>
            <div className="space-y-3">
              {fulfillment_info?.delivery_hours && (
                <div>
                  <p className="text-sm text-muted-foreground">Delivery Window</p>
                  <p className="font-medium flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    {fulfillment_info.delivery_hours.start} - {fulfillment_info.delivery_hours.end}
                  </p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Delivery Address</p>
                <p className="font-medium">{fulfillment_info?.address || 'Address not available'}</p>
              </div>
              {fulfillment_info?.special_instructions && (
                <div>
                  <p className="text-sm text-muted-foreground">Special Instructions</p>
                  <p className="font-medium">{fulfillment_info.special_instructions}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pickup Information (pickup orders only) */}
      {order.order_type === 'pickup' && (
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Pickup Information
            </h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground">Pickup Point</p>
                <p className="font-medium">{fulfillment_info?.pickup_point_name || 'Main Location'}</p>
              </div>
              {fulfillment_info?.delivery_hours && (
                <div>
                  <p className="text-sm text-muted-foreground">Pickup Window</p>
                  <p className="font-medium flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    {fulfillment_info.delivery_hours.start} - {fulfillment_info.delivery_hours.end}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status Change (Admin Only) */}
      {isAdmin && (
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-4">Admin Actions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Update Status</label>
                <div className="flex gap-2">
                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="preparing">Preparing</SelectItem>
                      <SelectItem value="ready">Ready</SelectItem>
                      <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button 
                    onClick={handleStatusUpdate} 
                    disabled={!selectedStatus || updateMutation.isPending}
                  >
                    Update
                  </Button>
                </div>
              </div>
              
              {order.order_type === 'delivery' && (
                <div>
                  <label className="text-sm font-medium mb-2 block">Assign Rider</label>
                  <div className="flex gap-2">
                    <Select value={selectedRider} onValueChange={setSelectedRider}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select rider" />
                      </SelectTrigger>
                      <SelectContent>
                        {riders.map((rider: any) => (
                          <SelectItem key={rider.id} value={rider.id}>
                            {rider.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button 
                      onClick={handleRiderAssignment} 
                      disabled={!selectedRider || updateMutation.isPending}
                    >
                      Assign
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Last Update */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4">Last Update</h2>
          <div className="flex items-center gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Last Updated</p>
              <p className="font-medium">
                {order.updated_at ? format(new Date(order.updated_at), 'PPp') : 'Not available'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Updated By</p>
              <p className="font-medium">{adminEmail}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default OrderDetailsSingleColumn;