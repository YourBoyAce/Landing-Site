# STANDARD OPERATING PROCEDURE (SOP)
## The Auto-Mate — Enterprise Landing Site, E-Commerce & CMS Architecture

**Document ID:** SOP-AUTOMATE-001  
**Target Systems:** `web` (Next.js 16 Web Application) & `automate-studio` (Sanity Content Studio)  
**Classification:** Internal System Architecture & Operational Playbook  
**Last Updated:** Current Production State  

---

## 1. Executive Summary & Purpose

**The Auto-Mate** is a specialized automation learning platform and education technology provider focused on software quality assurance (QA), automation testing, SDET careers, and related engineering competencies.

This repository (`Landing-Site`) houses the complete **commercial gateway, digital storefront, content publishing engine, and student onboarding pipeline** for The Auto-Mate ecosystem. It coordinates public marketing, course discovery, dynamic tier pricing, frictionless shopping cart and checkout, multi-tier automated identity provisioning (Supabase Auth), payment verification (Razorpay), tax invoice PDF generation, automated transactional notifications (SMTP), CRM synchronization (Google Sheets), and cross-system upgrade handoffs to an external **Learning Management System (LMS Portal)**.

---

## 2. High-Level Architecture & Monorepo Layout

The repository is organized as a multi-package monorepo managed with `pnpm` workspaces:

```
Landing-Site/
├── package.json / pnpm-workspace.yaml   # Monorepo configuration
├── automate-studio/                     # Sanity Studio v5 Headless CMS
│   ├── schema/                          # Content definitions (courses, plans, blogs, etc.)
│   ├── schemaTypes/                     # Schema registry for Sanity Studio
│   ├── components/                      # Custom Studio widgets (ProductSelectorInput.tsx)
│   ├── lib/supabase.ts                  # Read client connecting CMS to Supabase LMS products
│   ├── sanity.config.ts                 # Sanity Studio environment & plugin configs
│   └── sanity.cli.ts                    # Sanity command-line interface config
│
└── web/                                 # Next.js 16 (App Router) Storefront & Fulfillment
    ├── app/                             # Routes, layouts, and API route handlers
    │   ├── page.tsx                     # Landing homepage
    │   ├── about/                       # About us & mission
    │   ├── courses/                     # Course catalog & dynamic course detail pages
    │   ├── plans/                       # Standalone plan/pricing exploration
    │   ├── blogs/                       # Articles & learning resources
    │   ├── case-studies/                # Student success stories & case studies
    │   ├── cart/                        # Multi-item client-side shopping cart
    │   ├── payment/                     # Payment checkout & upgrade execution
    │   ├── contact/                     # Contact page & lead capture
    │   ├── webinar/                     # Webinar registration & masterclasses
    │   ├── api/                         # Backend route handlers
    │   │   ├── razorpay/                # Order creation, verification, and upgrade orders
    │   │   ├── upgrade/                 # Cross-portal HMAC handoff validation
    │   │   ├── bundles/sync-price/      # Sanity-to-Supabase price sync engine
    │   │   ├── invoice/                 # On-demand signed PDF invoice downloads
    │   │   ├── courses/check-product/   # Product readiness and UUID verification
    │   │   ├── sync-to-sheet/           # Google Apps Script CRM synchronization
    │   │   └── contact/                 # Contact form submission webhook
    ├── components/                      # UI primitives, layout headers/footers, and PDF templates
    ├── sections/                        # Rich visual section components (Hero, FAQ, Stats, etc.)
    ├── contexts/                        # React Contexts (AuthContext, LoadingContext)
    ├── hooks/                           # Custom React hooks (useGlobalLoader, etc.)
    ├── lib/                             # Core utilities, Sanity client, Supabase clients, mailer
    ├── middleware.ts                    # Edge middleware guarding portal upgrade checkouts
    └── docs/                            # Internal engineering documentation
```

---

## 3. Core Technologies & External Integrations

| Subsystem | Technology / Provider | Key Responsibilities |
| :--- | :--- | :--- |
| **Storefront Framework** | **Next.js 16 (App Router)** | Server Side Rendering (SSR), Server Components, Edge Middleware, Static Generation |
| **Language & Styling** | **TypeScript, Tailwind CSS v4, Framer Motion, GSAP** | Type safety, modern glassmorphic responsive UI, fluid micro-animations |
| **Headless CMS** | **Sanity Studio v5 (`@sanity/client`, `next-sanity`)** | Marketing copy, course descriptions, syllabus curriculum, FAQs, blogs, testimonials, tier definitions |
| **Database & Identity** | **Supabase (PostgreSQL & Supabase Auth)** | Dual schema architecture (`public` and `phase2`): User credentials, user profiles, courses, orders, payments, enrollments, bundles |
| **Payment Gateway** | **Razorpay Node SDK** | INR order generation, web checkout modal, HMAC-SHA256 cryptographic signature validation |
| **Invoice Engine** | **`@react-pdf/renderer`** | Server-side runtime vector PDF invoice rendering conforming to corporate billing standards |
| **Email Delivery** | **Nodemailer (SMTP / Gmail / Google Workspace)** | Dynamic HTML welcome emails with PDF invoice attachments and temporary password delivery |
| **CRM / Lead Sync** | **Google Apps Script Webhooks** | Real-time write-through sync of customer orders and contact inquiries to Google Sheets |
| **LMS Interop** | **HMAC-SHA256 Token Protocol** | Secure, replay-proof student upgrade handoff between external LMS portal and the checkout site |

---

## 4. Database Architecture & Dual-Schema Partitioning

The application interacts with two schemas inside the target Supabase PostgreSQL instance:

### 4.1 Schema Partition: `phase2` (Commerce & Fulfillment Core)
* **`phase2.users`**: System user records linked to `auth_user_id`, tracking email, username, and role.
* **`phase2.orders`**: Commerce orders tracking `user_id`, `course_id`, `bundle_id`, `razorpay_order_id`, `razorpay_payment_id`, `amount`, `status` (`pending`, `paid`), customer phone, and serialized metadata.
* **`phase2.payments`**: Gateway transactions tracking `order_id`, `payment_gateway` (`razorpay`), `gateway_order_id`, `gateway_payment_id`, `amount`, `payment_status` (`success`), and timestamps.
* **`phase2.enrollments`**: Active course enrollments mapping `user_id`, `course_id`, `bundle_id`, `order_id`, `status` (`active`), `batch_type` (`recorded`/`live`), `access_start_date`, and `access_end_date` (1-year access).
* **`phase2.bundles`**: Plan tiers (e.g., Starter, Pro, Premium / Live Sessions) and their authoritative base prices.
* **`phase2.upgrade_handoffs`**: Nonce-consumed one-time tokens for secure LMS portal upgrade sessions.

### 4.2 Schema Partition: `public` (LMS Sync & Global Auth)
* **`public.profiles`**: Auth user metadata (maps 1:1 with `auth.users.id`), tracking `role` (`user`, `instructor`, `admin`).
* **`public.maincourses`**: Primary LMS course definitions, referenced by `course_id` (UUID).
* **`public.products`**: Active LMS products queried inside Sanity Studio via `fetchActiveProducts()`.
* **`public.course_members`** & **`public.course_enrollments`**: Legacy and portal-visible enrollment tables synced upon payment confirmation to ensure immediate LMS course access.

---

## 5. End-to-End Operational Workflows

### 5.1 Content Authoring & Catalog Management Workflow
1. **CMS Input (`automate-studio`)**:
   - Content managers create or update course details, pricing plans, testimonials, FAQs, or blogs in Sanity Studio.
   - When configuring a `courseDetails` document, the manager links the course to an LMS product using the custom `ProductSelectorInput` component, which reads live products from Supabase `public.products`.
2. **Automated Price Synchronization**:
   - Sanity acts as the **ultimate source of truth** for commercial pricing.
   - Whenever plans are retrieved via `getPlans()` or `getPlanByBadge()`, the service executes `syncSanityPricesToSupabase()`, which compares Sanity plan prices against `phase2.bundles` in Supabase and automatically updates the database to prevent pricing discrepancies.
   - Dedicated webhook route `POST /api/bundles/sync-price` is available for external trigger or scheduled synchronization.

### 5.2 Discovery, Cart & Checkout Workflow
1. **Student Browsing**:
   - Prospective students view course syllabus, curriculum modules, FAQs, and reviews.
   - They select a plan tier:
     - **Starter Plan** (Recorded modules & essential materials)
     - **Pro Plan** (Advanced projects, mentor review, community)
     - **Live Sessions / Premium Plan** (Live interactive mentoring, career coaching)
2. **Cart Management**:
   - Multiple courses can be added to the shopping cart (`localStorage`).
   - The cart synchronizes cross-tab and in-tab via custom `cart-updated` window events and `StorageEvent` listeners.
3. **Checkout Initiation**:
   - The user transitions to `/payment`.
   - Single item purchases pass query parameters directly (`course`, `bundleId`, `bundleTitle`, `amount`).
   - Multi-item purchases transfer via `fromCart=1`, reading structured cart items from client memory to avoid URL length constraints.

### 5.3 Payment Execution & Order Verification Engine (`POST /api/razorpay/verify-payment`)
When a student completes payment through Razorpay modal, the following sequential pipeline executes:

```
[Razorpay Payment Succeeded]
             │
             ▼
[POST /api/razorpay/verify-payment]
             │
             ├── 1. Cryptographic HMAC-SHA256 Signature Verification
             │      (Calculates hash of order_id|payment_id against RAZORPAY_KEY_SECRET)
             │
             ├── 2. Idempotency Check
             │      (If order already exists and is not pending -> Return success early)
             │
             ├── 3. Role Gate Security Check
             │      (Lookup email in public.profiles; if role is 'admin' or 'instructor' -> REJECT)
             │
             ├── 4. Three-Tier User Resolution & Account Provisioning
             │      ├─ Tier 1: User exists in phase2.users -> Re-use existing userId
             │      ├─ Tier 2: Auth account in public.profiles exists -> Backfill phase2.users record
             │      └─ Tier 3: Brand new user -> Create Supabase Auth user with secure random temp
             │                 password, upsert profile, and create phase2.users record.
             │                 (If race condition on auth email -> Recover existing auth UID via listUsers)
             │
             ├── 5. Course & Bundle Entity Resolution
             │      (Resolve UUIDs in public.maincourses and phase2.bundles)
             │
             ├── 6. Transaction & Enrollment Creation
             │      ├─ Upsert phase2.orders (status = 'paid')
             │      ├─ Insert phase2.payments (status = 'success')
             │      ├─ Upsert phase2.enrollments (active for 365 days)
             │      └─ Sync to public.course_members & public.course_enrollments
             │
             ├── 7. Automated Invoicing & Email Dispatch
             │      ├─ Render InvoicePDF stream with @react-pdf/renderer
             │      ├─ Convert stream to Buffer
             │      └─ Dispatch transactional email via Nodemailer:
             │           • Attaches official tax invoice PDF
             │           • If new user: Includes generated temporary login password
             │           • Embeds direct access button to LMS portal
             │
             ├── 8. CRM Google Sheet Synchronization
             │      (Dispatches customer payload to GOOGLE_SHEET_WEBAPP_URL)
             │
             └─► 9. Student Portal Redirection
                    (Returns redirectUrl to Learning Portal with ?newUser=true or ?message=)
```

### 5.4 The LMS Portal Pro Upgrade Handoff Flow
Students who already own a Starter plan inside the LMS Portal can upgrade to Pro through an authenticated, secure handoff:

1. **LMS Initiation**:
   - Student clicks "Upgrade to Pro" inside their logged-in portal.
   - Portal generates a cryptographically signed HMAC one-time token containing user details, eligible enrollment IDs, and expiry.
   - Portal redirects browser to:  
     `https://theautomate.com/payment?upgradeMode=1&token=<TOKEN>`
2. **Edge Middleware Guard (`web/middleware.ts`)**:
   - Intercepts `/payment?upgradeMode=1`.
   - Checks for presence of `upgrade_session` cookie or `token` query param.
   - If missing or unauthenticated, redirects immediately to LMS portal `/login`.
3. **Server-Side Token Validation (`POST /api/upgrade/validate-handoff`)**:
   - Parses HMAC signature and verifies expiry (5-minute TTL).
   - Enforces **Replay Protection**: Verifies token nonce hasn't been consumed in `phase2.upgrade_handoffs`.
   - Queries Supabase for authoritative eligible enrollments.
   - Sets secure HttpOnly cookie `upgrade_session`.
4. **Checkout & Upgrade Fulfillment**:
   - Student sees the dedicated `UpgradeCheckoutClient` UI with pre-calculated upgrade delta price.
   - Order creation verifies session cookie server-side.
   - Payment verification detects `portal_pro_upgrade` metadata, updates existing enrollment rows in-place, and redirects student back to LMS portal `/upgrade/success`.

---

## 6. Standard Operating Procedures by Role

### 6.1 Content Operations & Marketing Managers

#### SOP-MKT-01: Publishing a New Course
1. Log in to Sanity Content Studio (`automate-studio`).
2. Navigate to **Course Details**.
3. Create a new document:
   - Provide **Title**, **Slug**, **Description**, **Category**, and **Course Level**.
   - Under **Product Link**, choose the corresponding LMS Product from the dropdown (populated directly from the active LMS Supabase products table).
   - Enter curriculum modules, prerequisites, FAQs, and learning outcomes.
4. Set status to **Published**.
5. Verify on storefront by navigating to `/courses/[slug]`.

#### SOP-MKT-02: Updating Plan Pricing
1. Navigate to **Plans** in Sanity Studio.
2. Select the plan to modify (e.g., Starter, Pro, Live Sessions).
3. Adjust the `Price` (in INR base currency) and `Original Price` (for strike-through discount display).
4. Publish the document.
5. *Automatic:* The next request to the site or payment engine will automatically overwrite `phase2.bundles.price` in Supabase with the new Sanity price.
6. *Manual Flush (Optional):* Trigger `POST /api/bundles/sync-price` using the administrative synchronization secret to force immediate database-wide sync.

---

### 6.2 Customer Support & Enrollment Administration

#### SOP-SUP-01: Handling Customer "Access Not Received" Queries
1. Obtain the customer's email address and Razorpay Payment ID (`pay_...`).
2. Search Supabase `phase2.orders` by `razorpay_payment_id` or `razorpay_order_id`.
3. Verify status is `paid`:
   - If status is `pending` or missing, verify the transaction status in the Razorpay Dashboard.
   - If Razorpay shows captured, re-trigger the verification endpoint or manually insert the enrollment row in `phase2.enrollments`.
4. Check `public.course_members` and `public.course_enrollments` to ensure the LMS recognizes the email.
5. If the user forgot their temporary password, direct them to use the "Forgot Password" link on the LMS Portal login screen (`NEXT_PUBLIC_LEARNING_PORTAL_URL`).

#### SOP-SUP-02: Issuing Duplicate Tax Invoices
1. Locate the `order.id` in `phase2.orders`.
2. Generate an authorized invoice retrieval URL:  
   `GET /api/invoice/{orderId}?token={HMAC_SHA256(orderId, UPGRADE_HANDOFF_SECRET)}`
3. Download the PDF and send it to the customer, or trigger a re-send via customer service tooling.

---

### 6.3 Engineering & DevOps Operations

#### SOP-DEV-01: Local Development Environment Setup
1. **Clone & Install**:
   ```bash
   git clone https://github.com/YourBoyAce/Landing-Site
   cd Landing-Site
   pnpm install
   ```
2. **Environment Configuration**:
   - Create `web/.env.local` using the template below.
   - Create `automate-studio/.env.local` using the template below.
3. **Execution**:
   - Start storefront dev server:
     ```bash
     cd web && pnpm dev
     # Accessible at http://localhost:3000
     ```
   - Start Sanity Studio dev server:
     ```bash
     cd automate-studio && pnpm dev
     # Accessible at http://localhost:3333
     ```

#### SOP-DEV-02: Mandatory Environment Variables

**Storefront Application (`web/.env.local`):**
```ini
# Sanity CMS Credentials
NEXT_PUBLIC_SANITY_PROJECT_ID="<sanity_project_id>"
NEXT_PUBLIC_SANITY_DATASET="production"
NEXT_PUBLIC_SANITY_API_VERSION="2024-01-01"
SANITY_API_READ_TOKEN="<sanity_read_token>"

# Supabase Infrastructure
NEXT_PUBLIC_SUPABASE_URL="https://<project-id>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<public_anon_key>"
SUPABASE_SERVICE_ROLE_KEY="<service_role_secret_key>"

# Razorpay Payment Gateway
NEXT_PUBLIC_RAZORPAY_KEY_ID="rzp_live_..."
RAZORPAY_KEY_ID="rzp_live_..."
RAZORPAY_KEY_SECRET="<razorpay_secret>"

# Transactional Mailer (Nodemailer SMTP)
ADMIN_EMAIL="support@theautomate.com"
ADMIN_PASSWORD="<app_specific_smtp_password>"

# LMS Portal Interop & Cryptography
NEXT_PUBLIC_LEARNING_PORTAL_URL="https://learn.theautomate.com"
LEARNING_PORTAL_URL="https://learn.theautomate.com"
UPGRADE_HANDOFF_SECRET="<32_byte_cryptographic_hex_secret>"
PRO_UPGRADE_PRICE_INR="4900"

# External Webhooks
GOOGLE_SHEET_WEBAPP_URL="https://script.google.com/macros/s/.../exec"
CONTACT_SHEET_WEBAPP_URL="https://script.google.com/macros/s/.../exec"
```

**Sanity Studio (`automate-studio/.env.local`):**
```ini
SANITY_STUDIO_PROJECT_ID="<sanity_project_id>"
SANITY_STUDIO_DATASET="production"
SANITY_STUDIO_SUPABASE_URL="https://<project-id>.supabase.co"
SANITY_STUDIO_SUPABASE_ANON_KEY="<public_anon_key>"
```

#### SOP-DEV-03: Production Deployment & Verification Checklist
1. **Type Checking & Linting**:
   ```bash
   cd web && pnpm lint && pnpm build
   cd ../automate-studio && pnpm build
   ```
2. **Pre-Deployment Sanity Check**:
   - Validate that `SUPABASE_SERVICE_ROLE_KEY` is never exposed with `NEXT_PUBLIC_` prefix.
   - Confirm Razorpay keys match the target environment (Test vs. Live).
   - Verify `UPGRADE_HANDOFF_SECRET` matches the exact secret configured in the LMS Portal backend.
3. **Deployment**:
   - `web` is deployed to Vercel or Node.js hosting platform with Edge Middleware support.
   - `automate-studio` can be deployed to Sanity hosting (`pnpm deploy`) or embedded route.
4. **Post-Deployment Verification**:
   - Test checkout flow with test card credentials.
   - Verify receipt of welcome email and attached PDF invoice.
   - Verify user registration in `phase2.users` and enrollment in `phase2.enrollments`.
   - Verify Google Sheets sync row was written.

---

## 7. Incident Response & Troubleshooting Playbook

| Symptom | Probable Cause | Corrective Action |
| :--- | :--- | :--- |
| **Payment succeeds in Razorpay but returns 400 signature mismatch** | `RAZORPAY_KEY_SECRET` mismatch or order ID tampering | Verify that `RAZORPAY_KEY_SECRET` in production env matches the active API keys generated in Razorpay Dashboard. Check webhook payload logs. |
| **"This email is registered as an admin/instructor" on checkout** | Internal staff attempting to purchase with privileged accounts | Role gate is actively blocking privileged accounts to protect LMS role permissions. Instruct user to test using an incognito window with a personal/test student email. |
| **User receives "Failed to create Supabase Auth account"** | Supabase Auth rate limits or unhandled edge cases | Check Supabase Auth logs in Supabase Dashboard. Note: Tier 3b auto-recovery handles duplicate email errors automatically; check if user has reached auth project quota. |
| **Customer reports no welcome email or invoice** | SMTP rate limits or invalid Google Workspace app password | Inspect server logs for `[verify-payment] Email sending failed:`. Regenerate Google App Password in Gmail security settings and update `ADMIN_PASSWORD`. Invoices can always be downloaded via `/api/invoice/[orderId]`. |
| **Upgrade checkout returns "Upgrade session expired or invalid"** | Token expired (> 5 min TTL) or replay attempt | Tokens are single-use nonces. Ask the student to re-initiate the Pro upgrade from within their LMS course dashboard. |
| **Plan prices on website don't match database pricing** | Sanity sync hasn't run or bundle UUID mismatch | Trigger `POST /api/bundles/sync-price` with `x-sync-secret` header. Verify that bundle title/badge in Sanity corresponds to the `bundle_name` in `phase2.bundles`. |

---

## 8. Summary of System Ownership & Governance

- **System Owner:** The Auto-Mate Engineering & Curriculum Team
- **Database Custodian:** Supabase Database Administrators
- **Content Governance:** Curriculum & Marketing Leads via Sanity Studio
- **Escalation SLA:** 
  - Payment & Enrollment Blockers (P0): < 30 minutes
  - Content Sync Discrepancies (P1): < 4 hours
  - General Maintenance (P2): Normal deployment windows
