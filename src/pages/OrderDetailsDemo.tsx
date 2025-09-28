import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import OrderDetailsSingleColumn from '@/components/orders/OrderDetailsSingleColumn';
import { Badge } from '@/components/ui/badge';

/**
 * Demo page to test and showcase the OrderDetailsSingleColumn component
 * This page allows testing with different order IDs and admin emails
 */
const OrderDetailsDemo: React.FC = () => {
  const [orderId, setOrderId] = useState('');
  const [adminEmail, setAdminEmail] = useState('admin@smallchops.com');
  const [showComponent, setShowComponent] = useState(false);

  // Sample order IDs for testing (you can replace these with real ones)
  const sampleOrderIds = [
    'ORD-1759037430451-w8s41yaaf',
    'TEST-ORDER-001',
    'sample-uuid-order-id'
  ];

  const handleShowComponent = () => {
    if (orderId.trim()) {
      setShowComponent(true);
    }
  };

  const handleReset = () => {
    setShowComponent(false);
    setOrderId('');
  };

  const loadSampleOrder = (sampleId: string) => {
    setOrderId(sampleId);
    setShowComponent(false);
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Order Details Demo</h1>
        <p className="text-muted-foreground">
          Test the OrderDetailsSingleColumn component with different order IDs
        </p>
      </div>

      {!showComponent ? (
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Order Details Component Demo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orderId">Order ID</Label>
              <Input
                id="orderId"
                placeholder="Enter order ID (e.g., ORD-1759037430451-w8s41yaaf)"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="adminEmail">Admin Email</Label>
              <Input
                id="adminEmail"
                placeholder="admin@example.com"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Sample Order IDs (click to use)</Label>
              <div className="flex flex-wrap gap-2">
                {sampleOrderIds.map((sampleId) => (
                  <Badge
                    key={sampleId}
                    variant="outline"
                    className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                    onClick={() => loadSampleOrder(sampleId)}
                  >
                    {sampleId}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="pt-4">
              <Button 
                onClick={handleShowComponent}
                disabled={!orderId.trim()}
                className="w-full"
              >
                Load Order Details
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-center">
            <Button variant="outline" onClick={handleReset}>
              ← Back to Demo Controls
            </Button>
          </div>
          
          <div className="border rounded-lg p-1">
            <OrderDetailsSingleColumn 
              orderId={orderId}
              adminEmail={adminEmail}
            />
          </div>
        </div>
      )}

      {/* Documentation section */}
      <Card className="max-w-4xl mx-auto mt-8">
        <CardHeader>
          <CardTitle>Component Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold mb-2">UI Sections</h3>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Header with order number and status badges</li>
                <li>• Customer information with editable phone</li>
                <li>• Order items with pricing</li>
                <li>• Delivery fee (for delivery orders)</li>
                <li>• Delivery/pickup information</li>
                <li>• Admin controls for status and rider assignment</li>
                <li>• Last update tracking</li>
                <li>• Print functionality</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Backend Features</h3>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Real-time order data fetching</li>
                <li>• Status update with email notifications</li>
                <li>• Rider assignment for delivery orders</li>
                <li>• Customer phone number updates</li>
                <li>• Error handling and loading states</li>
                <li>• React Query integration</li>
                <li>• Email template system</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default OrderDetailsDemo;