# SmallChops Order Management System

A comprehensive order management system with email notifications and admin controls.

## Project info

**URL**: https://lovable.dev/projects/bcf6b922-d18e-44c0-ae6a-54a3a8295ebc

## Order Details System

### Features

- **Single-Column Order Details UI** - Complete order information display
- **Admin Order Management** - Status updates and rider assignments
- **Email Notifications** - Automated customer notifications for status changes
- **Real-time Updates** - Live order tracking and status changes
- **Print Functionality** - Print-friendly order receipts

### Setup & Configuration

#### 1. Install Dependencies

```bash
npm install nodemailer @tanstack/react-query
```

#### 2. Environment Variables

Configure your `.env` file with email settings:

```env
# Gmail SMTP Configuration (recommended)
GMAIL_USER=yourgmail@gmail.com
GMAIL_PASS=your-app-password

# Alternative SMTP Configuration
SMTP_HOST=smtp.yourdomain.com
SMTP_PORT=587
SMTP_USER=admin@yourdomain.com
SMTP_PASS=your-smtp-password
```

**Note**: For Gmail, use "App Passwords" instead of your regular password for security.

#### 3. File Structure

The order details system includes these key files:

```
src/
├── components/orders/
│   └── OrderDetailsSingleColumn.tsx     # Main UI component
├── hooks/
│   ├── useDetailedOrderData.ts          # Order data fetching
│   └── orderPageHooks.ts                # Order management hooks
├── api/
│   ├── orders.ts                        # Order API functions
│   └── users.ts                         # User/rider API functions
├── emailTemplates/
│   └── orderStatusTemplates.ts          # Email templates
├── utils/
│   ├── sendOrderStatusEmail.ts          # Email sender utility
│   └── testOrderStatusEmailSender.ts    # Test harness
└── .env.example                         # Environment template
```

### Usage

#### Using the Order Details Component

```tsx
import OrderDetailsSingleColumn from "@/components/orders/OrderDetailsSingleColumn";

function OrderPage({ orderId }) {
  return (
    <OrderDetailsSingleColumn 
      orderId={orderId} 
      adminEmail="admin@yourdomain.com" 
    />
  );
}
```

#### Testing Email Functionality

1. **Edit the test configuration** in `src/utils/testOrderStatusEmailSender.ts`:
   ```typescript
   const TEST_CONFIG = {
     recipientEmail: 'your-test@email.com', // Change this!
     orderNumber: 'TEST-ORD-' + Date.now(),
     customerName: 'Test Customer',
     adminEmail: 'admin@yourdomain.com'
   };
   ```

2. **Run the test harness**:
   ```bash
   # Using ts-node
   npx ts-node src/utils/testOrderStatusEmailSender.ts
   
   # Or using tsx
   npx tsx src/utils/testOrderStatusEmailSender.ts
   ```

3. **Quick single status test**:
   ```typescript
   import { quickTest } from '@/utils/testOrderStatusEmailSender';
   await quickTest('confirmed'); // Test confirmed status email
   ```

### Order Status Flow

The system supports these order statuses with automatic email notifications:

1. **pending** → Order placed, awaiting confirmation
2. **confirmed** → Order confirmed and accepted
3. **preparing** → Kitchen/preparation started
4. **ready** → Order ready for pickup/delivery
5. **out_for_delivery** → Delivery in progress (delivery orders only)
6. **delivered** → Order completed successfully
7. **cancelled** → Order cancelled

### Admin Features

- **Status Management**: Update order status with automatic notifications
- **Rider Assignment**: Assign delivery riders to orders
- **Customer Info Editing**: Update customer phone numbers
- **Real-time Connection Status**: Monitor system connectivity
- **Print Functionality**: Generate printable order receipts

### Email System

#### Templates
- Customizable HTML and text templates for each order status
- Professional styling with responsive design
- Template variables for personalization

#### Delivery
- Uses Supabase Edge Functions for reliable delivery
- SMTP integration with Gmail or custom providers
- Delivery tracking and logging
- Error handling and retry logic

### API Integration

#### Order Data Hook
```typescript
const { data: orderData, isLoading, error } = useDetailedOrderData(orderId);
```

#### Order Updates
```typescript
const updateMutation = useMutation({
  mutationFn: (updates) => updateOrder(orderId, updates),
  onSuccess: () => {
    // Handle success, send email notification
  }
});
```

#### Rider Management
```typescript
const { data: riders } = useQuery({
  queryKey: ['dispatch-riders'],
  queryFn: getDispatchRiders
});
```

### Testing Checklist

- [ ] Order details display correctly for all order types
- [ ] Status updates work and trigger email notifications
- [ ] Rider assignment functions properly (delivery orders)
- [ ] Phone number editing saves correctly
- [ ] Print functionality generates proper receipts
- [ ] Email templates render correctly in both HTML and text
- [ ] Error handling displays appropriate messages
- [ ] Real-time updates refresh data properly

### Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Run linter
npm run lint

# Type checking
npm run type-check

# Test email system
npx tsx src/utils/testOrderStatusEmailSender.ts
```

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/bcf6b922-d18e-44c0-ae6a-54a3a8295ebc) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/bcf6b922-d18e-44c0-ae6a-54a3a8295ebc) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)
