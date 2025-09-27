# Smallchops-09 E-commerce Platform

Smallchops-09 is a React + TypeScript web application for an African food business specializing in "small chops" catering and delivery. The platform includes a customer storefront, admin dashboard, order management, Paystack payment integration, and automated email systems.

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

### Bootstrap and Build Process
- **Dependencies Installation**: `npm install` -- takes 15+ minutes to complete. NEVER CANCEL. Set timeout to 30+ minutes.
- **Type Checking**: `npm run type-check` -- takes less than 1 minute. Always run before building.
- **Linting**: `npx eslint .` -- ESLint needs to be run with npx due to module resolution. Takes 1-2 minutes.
- **Build Process**: `npx vite build --minify=false` -- takes 3-5 minutes. NEVER CANCEL. Set timeout to 10+ minutes.
- **Development Server**: `npm run dev` -- starts Vite dev server on port 8080.
- **Production Preview**: `npm run preview` -- preview production build locally.

### Environment Setup Requirements
- Node.js 20+ and npm 10+ are required
- Supabase project configured with Edge Functions
- Environment variables must be set for Supabase and Paystack integration
- Google OAuth configured in Supabase for authentication

### Critical Build Notes
- **NEVER CANCEL** npm install - it consistently takes 15+ minutes due to large dependency tree
- Use `npx` prefix for vite and eslint commands due to module resolution issues
- TypeScript compilation is fast but build process involves complex React component tree
- Build uses Vite with React SWC plugin for fast compilation

## Validation

### Manual Testing Scenarios
Always test these complete end-to-end scenarios after making changes:

1. **Customer Purchase Flow**:
   - Navigate to `/` (homepage)
   - Browse products and add items to cart
   - Proceed to checkout and fill customer details
   - Complete payment flow (use test Paystack keys)
   - Verify order confirmation and email delivery

2. **Admin Management Flow**:
   - Login to admin at `/admin/auth`
   - Access orders dashboard at `/admin/orders`
   - Process order status updates
   - Test delivery/pickup scheduling
   - Verify customer communication triggers

3. **Authentication Testing**:
   - Test Google OAuth login flow at `/auth`
   - Verify phone collection for new OAuth users
   - Test admin authentication and session management
   - Validate customer profile and order history access

### Build Validation Steps
- Always run `npm run type-check` before committing - catches TypeScript errors
- Use `npx eslint .` to check code style (note: requires npx prefix)
- Test development server startup with `npm run dev`
- Build and preview production version to catch build-time issues

## Technology Stack

### Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite 5 with SWC plugin
- **UI Library**: shadcn-ui components + Radix UI primitives
- **Styling**: Tailwind CSS with custom design system
- **State Management**: React Context + TanStack Query
- **Routing**: React Router v6

### Backend & Services
- **Database**: Supabase PostgreSQL with Row Level Security
- **Authentication**: Supabase Auth + Google OAuth
- **Edge Functions**: Supabase Deno runtime (60+ functions)
- **Payment Processing**: Paystack integration with webhook handling
- **Email System**: Custom SMTP with multiple providers and automation

### Key Dependencies
- `@supabase/supabase-js` - Database and auth client
- `@tanstack/react-query` - Server state management  
- `react-hook-form` + `zod` - Form handling and validation
- `lucide-react` - Icon system
- `date-fns` - Date manipulation
- `react-router-dom` - Client-side routing

## Project Structure

### Core Directories
```
/src
  /components - Reusable UI components
    /ui - shadcn-ui base components
    /admin - Admin-specific components
    /forms - Form components with validation
  /pages - Route components
    /admin - Admin dashboard pages
  /hooks - Custom React hooks
  /lib - Utility functions and configurations
  /types - TypeScript type definitions
  /integrations - External service integrations
  
/supabase
  /functions - Edge Functions (60+ functions)
  /migrations - Database schema changes
  config.toml - Supabase configuration

/public - Static assets
```

### Important Files
- `vite.config.ts` - Build configuration with chunk optimization
- `eslint.config.js` - Linting rules (requires npx to run)
- `tailwind.config.ts` - Styling configuration
- `supabase/config.toml` - Function permissions and routing

## Common Issues & Solutions

### Build Issues
- **"vite not found"**: Use `npx vite` instead of `npm run build`
- **"eslint not found"**: Use `npx eslint .` instead of `npm run lint`
- **Long install times**: This is normal - wait 15-30 minutes for npm install
- **Memory errors during build**: Use Node.js 20+ with increased heap size

### Development Issues
- **Authentication errors**: Check environment variables for Supabase URL and keys
- **Payment failures**: Verify Paystack test/live key configuration
- **Email delivery issues**: Check SMTP configuration in Supabase Edge Functions
- **CORS errors**: Verify allowed origins in Supabase function environment variables

### Database & Functions
- **Function deployment**: Use Supabase CLI or deploy via GitHub Actions
- **Environment variables**: Set in Supabase Dashboard under Edge Functions settings
- **Database migrations**: Located in `/supabase/migrations`
- **Row Level Security**: Configured for all tables - check policies when debugging access

## Key Features

### Customer Features
- Product browsing with categories and search
- Shopping cart with local storage persistence
- Checkout with delivery/pickup options
- Paystack payment integration (test/live modes)
- Order tracking and history
- Google OAuth authentication
- Email notifications and order updates

### Admin Features
- Order management dashboard
- Product and category management
- Customer relationship management
- Delivery and pickup scheduling
- Payment reconciliation tools
- Email automation and templates
- Analytics and reporting
- Security monitoring and audit logs

### Payment Integration
- Paystack payment processor with environment detection
- Webhook handling for payment confirmation
- Automated refund and dispute management
- Payment health monitoring and diagnostics
- Test/live mode switching based on domain

### Email System
- Multi-provider SMTP with failover
- Automated welcome series and order updates
- Unsubscribe management and compliance
- Email template system with variables
- Delivery confirmation and bounce handling

## Performance Considerations

- Build process uses code splitting and lazy loading
- TanStack Query for efficient data fetching and caching
- React.lazy() for route-based code splitting
- Optimized bundle chunks for vendor, UI, and app code
- Image optimization and CDN integration via Supabase Storage

## Security Notes

- Row Level Security enabled on all database tables
- API keys stored as environment variables
- CORS properly configured for production domains
- Rate limiting implemented on Edge Functions
- Audit logging for all admin actions
- Input validation on both client and server

## Deployment

The application is deployed via Lovable platform with automatic deployments from the main branch. Production domain configuration and environment variables must be set in both Lovable and Supabase dashboards.

For manual deployment:
- Build with `npx vite build --minify=false`
- Deploy `dist` folder to any static hosting provider
- Configure Supabase Edge Functions with production environment variables
- Set up custom domain with HTTPS certificate