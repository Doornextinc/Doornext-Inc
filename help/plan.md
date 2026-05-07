# DoorNext Seller Registration System
## Technical Specification for Lovable Implementation

---

## 🎯 Product Overview

**Platform**: DoorNext - Local homemade goods marketplace  
**Feature**: Automated Seller Registration with Sole Proprietorship Filing  
**Goal**: Enable anyone to become a registered seller in < 5 minutes  
**Business Model**: Only sole proprietorship registration (simplified)

---

## 📋 Table of Contents

1. [User Journey & Flows](#user-journey--flows)
2. [Database Schema](#database-schema)
3. [API Specifications](#api-specifications)
4. [Component Architecture](#component-architecture)
5. [Integration Requirements](#integration-requirements)
6. [Security & Compliance](#security--compliance)
7. [Admin Dashboard](#admin-dashboard)
8. [Implementation Checklist](#implementation-checklist)

---

## 1. User Journey & Flows

### 1.1 Primary User Flow

```
Step 1: Path Selection
├─ Option A: Casual Seller (no business registration)
└─ Option B: Business Seller (sole proprietorship registration)

Step 2: Basic Information
├─ Legal name
├─ Date of birth  
├─ Phone number
├─ Address
└─ SSN last 4 digits

Step 3: Identity Verification
├─ Upload government ID
├─ Take selfie (optional for MVP)
└─ Automated verification via Persona/Stripe Identity

Step 4: Business Information (Business Path Only)
├─ Business name
├─ Business category
├─ Operating address
└─ One-time filing fee ($79)

Step 5: Bank Connection
├─ Connect via Plaid
└─ Or manual bank details

Step 6: Review & Submit
├─ Terms acceptance
└─ Submit application

Step 7: Approval & Activation
├─ Automated approval (if low risk)
├─ Manual review (if flagged)
└─ Start selling
```

### 1.2 Conversion Funnel Target

```
Started registration:     100% (1000 users)
Completed basic info:      85% (850 users)
Verified identity:         75% (750 users)
Connected bank:            70% (700 users)
Submitted application:     65% (650 users)
Approved:                  60% (600 users)
First listing:             45% (450 users)
```

---

## 2. Database Schema

### 2.1 PostgreSQL Tables

```sql
-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    phone VARCHAR(20),
    phone_verified BOOLEAN DEFAULT FALSE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'buyer', -- 'buyer', 'seller', 'admin'
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_login_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active' -- 'active', 'suspended', 'deleted'
);

-- ============================================
-- SELLER PROFILES
-- ============================================
CREATE TABLE seller_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    
    -- Seller Type
    seller_type VARCHAR(20) NOT NULL, -- 'casual' or 'business'
    
    -- Personal Information
    legal_first_name VARCHAR(100) NOT NULL,
    legal_middle_name VARCHAR(100),
    legal_last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE NOT NULL,
    ssn_last_four VARCHAR(4) NOT NULL,
    ssn_encrypted TEXT, -- Full SSN encrypted with KMS
    
    -- Address
    street_address VARCHAR(255) NOT NULL,
    apt_unit VARCHAR(50),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(2) NOT NULL, -- US state code
    zip_code VARCHAR(10) NOT NULL,
    country VARCHAR(2) DEFAULT 'US',
    
    -- Business Information (NULL for casual sellers)
    business_name VARCHAR(255),
    business_category VARCHAR(100), -- 'food_beverage', 'crafts', 'services', etc.
    business_description TEXT,
    operating_address_same BOOLEAN DEFAULT TRUE,
    
    -- Operating Address (if different from personal)
    operating_street VARCHAR(255),
    operating_apt VARCHAR(50),
    operating_city VARCHAR(100),
    operating_state VARCHAR(2),
    operating_zip VARCHAR(10),
    
    -- Verification Status
    identity_verification_status VARCHAR(30) DEFAULT 'pending',
    -- 'pending', 'in_progress', 'verified', 'failed', 'requires_review'
    identity_provider VARCHAR(50), -- 'persona', 'stripe_identity'
    identity_session_id VARCHAR(255),
    identity_verified_at TIMESTAMP,
    
    -- Bank Account
    bank_connected BOOLEAN DEFAULT FALSE,
    stripe_account_id VARCHAR(255) UNIQUE,
    stripe_account_status VARCHAR(30), -- 'pending', 'active', 'restricted'
    bank_last_four VARCHAR(4),
    
    -- Risk & Compliance
    risk_score INTEGER, -- 0-100
    risk_level VARCHAR(20), -- 'low', 'medium', 'high'
    ofac_checked BOOLEAN DEFAULT FALSE,
    ofac_clear BOOLEAN,
    
    -- Seller Status
    seller_status VARCHAR(30) DEFAULT 'draft',
    -- States: 'draft', 'pending_verification', 'verifying', 'verified', 
    --         'pending_business_filing', 'business_filing', 'pending_approval',
    --         'approved', 'active', 'rejected', 'suspended', 'deactivated'
    
    onboarding_step VARCHAR(30) DEFAULT 'basic_info',
    -- Steps: 'basic_info', 'identity_verification', 'business_info', 
    --        'bank_setup', 'review', 'completed'
    
    onboarding_completed_at TIMESTAMP,
    approved_at TIMESTAMP,
    approved_by UUID REFERENCES users(id),
    rejected_at TIMESTAMP,
    rejected_by UUID REFERENCES users(id),
    rejection_reason TEXT,
    can_reapply BOOLEAN DEFAULT TRUE,
    reapply_after TIMESTAMP,
    
    -- Limits (for phased activation)
    monthly_sales_limit_cents INTEGER, -- NULL = unlimited
    listing_limit INTEGER, -- NULL = unlimited
    
    -- Metadata
    referral_code VARCHAR(50),
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(100),
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT valid_seller_type CHECK (seller_type IN ('casual', 'business'))
);

-- ============================================
-- BUSINESS REGISTRATIONS (Sole Proprietorship)
-- ============================================
CREATE TABLE business_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_profile_id UUID REFERENCES seller_profiles(id) ON DELETE CASCADE,
    
    -- Business Details
    legal_business_name VARCHAR(255) NOT NULL,
    dba_name VARCHAR(255), -- "Doing Business As" if different
    business_purpose TEXT,
    naics_code VARCHAR(10), -- North American Industry Classification
    
    -- Filing Information
    filing_state VARCHAR(2) NOT NULL,
    filing_status VARCHAR(30) DEFAULT 'pending',
    -- 'pending', 'payment_pending', 'submitted', 'processing', 
    -- 'approved', 'rejected', 'cancelled'
    
    filing_provider VARCHAR(50) DEFAULT 'internal', 
    -- 'internal', 'legalzoom', 'northwest', 'incfile'
    filing_reference_id VARCHAR(255), -- Provider's tracking ID
    
    -- Costs
    state_filing_fee_cents INTEGER,
    service_fee_cents INTEGER DEFAULT 7900, -- $79.00
    total_fee_cents INTEGER,
    
    -- Payment
    payment_status VARCHAR(20) DEFAULT 'pending',
    -- 'pending', 'processing', 'paid', 'failed', 'refunded'
    stripe_payment_intent_id VARCHAR(255),
    paid_at TIMESTAMP,
    
    -- EIN (Federal Tax ID)
    ein_requested BOOLEAN DEFAULT FALSE,
    ein_number VARCHAR(20), -- encrypted
    ein_status VARCHAR(30), -- 'pending', 'approved', 'issued'
    ein_issued_at TIMESTAMP,
    
    -- Important Dates
    submitted_at TIMESTAMP,
    approved_at TIMESTAMP,
    effective_date DATE,
    expected_completion_date DATE,
    
    -- Documents
    certificate_url VARCHAR(500), -- S3 URL to business certificate
    ein_letter_url VARCHAR(500), -- S3 URL to EIN confirmation
    
    -- State-Specific Data
    state_specific_data JSONB, -- Store state-specific requirements
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT unique_seller_registration UNIQUE(seller_profile_id)
);

-- ============================================
-- VERIFICATION SESSIONS
-- ============================================
CREATE TABLE verification_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_profile_id UUID REFERENCES seller_profiles(id) ON DELETE CASCADE,
    
    -- Session Details
    provider VARCHAR(50) NOT NULL, -- 'persona', 'stripe_identity', 'manual'
    session_id VARCHAR(255) UNIQUE NOT NULL,
    session_url VARCHAR(500), -- URL user visits for verification
    
    verification_type VARCHAR(50) NOT NULL,
    -- 'identity', 'document', 'selfie', 'background', 'ofac'
    
    status VARCHAR(30) DEFAULT 'created',
    -- 'created', 'pending', 'in_progress', 'requires_input', 
    -- 'completed', 'failed', 'expired'
    
    -- Results
    result JSONB, -- Full verification result from provider
    checks_passed JSONB, -- {"identity_match": true, "document_valid": true}
    risk_score DECIMAL(5,2), -- 0.00 to 100.00
    risk_signals JSONB, -- Array of risk indicators
    
    -- Extracted Data
    extracted_name_first VARCHAR(100),
    extracted_name_last VARCHAR(100),
    extracted_dob DATE,
    extracted_address JSONB,
    document_type VARCHAR(50), -- 'drivers_license', 'passport', 'state_id'
    document_number VARCHAR(100),
    document_expiry DATE,
    
    -- Timing
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    expires_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- DOCUMENTS (ID uploads, certificates, etc.)
-- ============================================
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_profile_id UUID REFERENCES seller_profiles(id) ON DELETE CASCADE,
    
    -- Document Information
    document_type VARCHAR(50) NOT NULL,
    -- 'government_id', 'selfie', 'business_certificate', 'ein_letter',
    -- 'business_license', 'tax_permit', 'food_handler_cert', 'other'
    
    document_category VARCHAR(50), -- 'identity', 'business', 'compliance'
    
    file_name VARCHAR(255) NOT NULL,
    file_url VARCHAR(500) NOT NULL, -- S3 URL
    file_size_bytes INTEGER,
    mime_type VARCHAR(100),
    
    -- Security
    encrypted BOOLEAN DEFAULT TRUE,
    encryption_key_id VARCHAR(255),
    
    -- Status
    status VARCHAR(30) DEFAULT 'uploaded',
    -- 'uploaded', 'processing', 'verified', 'rejected', 'expired'
    
    verified_by UUID REFERENCES users(id), -- Admin who verified
    verified_at TIMESTAMP,
    rejection_reason TEXT,
    
    -- Metadata
    uploaded_by UUID REFERENCES users(id),
    uploaded_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- STATUS CHANGE HISTORY (Audit Trail)
-- ============================================
CREATE TABLE seller_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_profile_id UUID REFERENCES seller_profiles(id) ON DELETE CASCADE,
    
    from_status VARCHAR(30),
    to_status VARCHAR(30) NOT NULL,
    
    changed_by UUID REFERENCES users(id), -- NULL if automated
    change_type VARCHAR(20) DEFAULT 'automated', -- 'automated', 'manual', 'system'
    
    reason TEXT,
    notes TEXT,
    metadata JSONB, -- Additional context
    
    ip_address INET,
    user_agent TEXT,
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- ADMIN ACTIONS (Compliance Audit Trail)
-- ============================================
CREATE TABLE admin_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID REFERENCES users(id) NOT NULL,
    
    action_type VARCHAR(50) NOT NULL,
    -- 'approve_seller', 'reject_seller', 'suspend_seller', 
    -- 'view_pii', 'decrypt_data', 'export_data', 'delete_account'
    
    target_type VARCHAR(50) NOT NULL, -- 'seller_profile', 'user', 'document'
    target_id UUID NOT NULL,
    
    action_details JSONB,
    reason TEXT,
    
    -- Tracking
    ip_address INET NOT NULL,
    user_agent TEXT,
    session_id VARCHAR(255),
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- NOTIFICATIONS
-- ============================================
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    notification_type VARCHAR(50) NOT NULL,
    -- 'email', 'sms', 'push', 'in_app'
    
    template_name VARCHAR(100),
    
    subject VARCHAR(255),
    message TEXT NOT NULL,
    
    status VARCHAR(30) DEFAULT 'pending',
    -- 'pending', 'sent', 'delivered', 'failed', 'bounced'
    
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    read_at TIMESTAMP,
    
    metadata JSONB, -- Template variables, tracking info
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- PLATFORM FEES & PAYMENTS
-- ============================================
CREATE TABLE platform_fees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_profile_id UUID REFERENCES seller_profiles(id) ON DELETE CASCADE,
    
    fee_type VARCHAR(50) NOT NULL,
    -- 'registration', 'business_filing', 'subscription', 
    -- 'transaction', 'instant_payout'
    
    amount_cents INTEGER NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    
    description TEXT,
    
    -- Payment Processing
    stripe_payment_intent_id VARCHAR(255),
    stripe_charge_id VARCHAR(255),
    payment_method_type VARCHAR(50), -- 'card', 'bank_transfer', 'ach'
    
    status VARCHAR(20) DEFAULT 'pending',
    -- 'pending', 'processing', 'succeeded', 'failed', 'refunded'
    
    paid_at TIMESTAMP,
    refunded_at TIMESTAMP,
    refund_amount_cents INTEGER,
    refund_reason TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- User lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);

-- Seller profile lookups
CREATE INDEX idx_seller_profiles_user_id ON seller_profiles(user_id);
CREATE INDEX idx_seller_profiles_status ON seller_profiles(seller_status);
CREATE INDEX idx_seller_profiles_type ON seller_profiles(seller_type);
CREATE INDEX idx_seller_profiles_stripe ON seller_profiles(stripe_account_id);
CREATE INDEX idx_seller_profiles_created ON seller_profiles(created_at DESC);

-- Business registration lookups
CREATE INDEX idx_business_reg_seller ON business_registrations(seller_profile_id);
CREATE INDEX idx_business_reg_status ON business_registrations(filing_status);
CREATE INDEX idx_business_reg_state ON business_registrations(filing_state);
CREATE INDEX idx_business_reg_payment ON business_registrations(stripe_payment_intent_id);

-- Verification lookups
CREATE INDEX idx_verification_seller ON verification_sessions(seller_profile_id);
CREATE INDEX idx_verification_session ON verification_sessions(session_id);
CREATE INDEX idx_verification_status ON verification_sessions(status);

-- Document lookups
CREATE INDEX idx_documents_seller ON documents(seller_profile_id);
CREATE INDEX idx_documents_type ON documents(document_type);
CREATE INDEX idx_documents_status ON documents(status);

-- History & audit trails
CREATE INDEX idx_status_history_seller ON seller_status_history(seller_profile_id);
CREATE INDEX idx_status_history_created ON seller_status_history(created_at DESC);
CREATE INDEX idx_admin_actions_admin ON admin_actions(admin_user_id);
CREATE INDEX idx_admin_actions_target ON admin_actions(target_type, target_id);
CREATE INDEX idx_admin_actions_created ON admin_actions(created_at DESC);

-- Notifications
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- Fees
CREATE INDEX idx_fees_seller ON platform_fees(seller_profile_id);
CREATE INDEX idx_fees_type ON platform_fees(fee_type);
CREATE INDEX idx_fees_status ON platform_fees(status);
```

---

## 3. API Specifications

### 3.1 REST API Endpoints

#### Authentication

```http
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/logout
POST /api/v1/auth/refresh-token
POST /api/v1/auth/verify-email
POST /api/v1/auth/verify-phone
POST /api/v1/auth/forgot-password
POST /api/v1/auth/reset-password
```

#### Seller Registration

```http
# Start seller registration
POST /api/v1/seller/register/start
Body: {
  "seller_type": "casual" | "business"
}
Response: {
  "seller_profile_id": "uuid",
  "onboarding_step": "basic_info"
}

# Save basic information
POST /api/v1/seller/register/basic-info
Body: {
  "legal_first_name": "string",
  "legal_last_name": "string",
  "date_of_birth": "YYYY-MM-DD",
  "phone": "string",
  "address": {
    "street": "string",
    "apt": "string",
    "city": "string",
    "state": "string",
    "zip": "string"
  },
  "ssn_last_four": "string"
}
Response: {
  "seller_profile_id": "uuid",
  "next_step": "identity_verification"
}

# Start identity verification
POST /api/v1/seller/register/verify-identity
Body: {
  "seller_profile_id": "uuid"
}
Response: {
  "verification_url": "https://verify.withpersona.com/...",
  "session_id": "string",
  "expires_at": "ISO timestamp"
}

# Check verification status
GET /api/v1/seller/register/verification-status/:session_id
Response: {
  "status": "pending" | "completed" | "failed",
  "result": {
    "identity_verified": true,
    "risk_score": 25
  }
}

# Submit business information (business sellers only)
POST /api/v1/seller/register/business-info
Body: {
  "seller_profile_id": "uuid",
  "business_name": "string",
  "business_category": "food_beverage" | "crafts" | "services",
  "business_description": "string",
  "operating_address_same": true
}
Response: {
  "business_registration_id": "uuid",
  "filing_fee": {
    "state_fee_cents": 7000,
    "service_fee_cents": 7900,
    "total_cents": 14900
  },
  "next_step": "payment"
}

# Process business filing payment
POST /api/v1/seller/register/pay-filing-fee
Body: {
  "business_registration_id": "uuid",
  "payment_method_id": "pm_xxx" // Stripe payment method
}
Response: {
  "payment_intent_id": "pi_xxx",
  "status": "succeeded",
  "next_step": "bank_setup"
}

# Connect bank account
POST /api/v1/seller/register/connect-bank
Body: {
  "seller_profile_id": "uuid",
  "plaid_public_token": "string",
  "account_id": "string"
}
Response: {
  "stripe_account_id": "acct_xxx",
  "bank_connected": true,
  "next_step": "review"
}

# Manual bank account entry
POST /api/v1/seller/register/bank-manual
Body: {
  "seller_profile_id": "uuid",
  "account_holder_name": "string",
  "routing_number": "string",
  "account_number": "string",
  "account_type": "checking" | "savings"
}
Response: {
  "stripe_account_id": "acct_xxx",
  "verification_required": true
}

# Submit application for approval
POST /api/v1/seller/register/submit
Body: {
  "seller_profile_id": "uuid",
  "terms_accepted": true,
  "terms_version": "1.0"
}
Response: {
  "status": "submitted",
  "estimated_approval_time": "24 hours",
  "can_sell_immediately": false
}

# Get onboarding status
GET /api/v1/seller/register/status/:seller_profile_id
Response: {
  "seller_status": "pending_approval",
  "onboarding_step": "review",
  "completed_steps": ["basic_info", "identity_verification", "bank_setup"],
  "pending_steps": [],
  "can_sell": false,
  "messages": ["Your application is under review"]
}
```

#### Seller Profile Management

```http
GET /api/v1/seller/profile
PUT /api/v1/seller/profile
GET /api/v1/seller/documents
POST /api/v1/seller/documents/upload
DELETE /api/v1/seller/documents/:id
GET /api/v1/seller/business-registration
GET /api/v1/seller/verification-history
```

#### Admin Endpoints

```http
# Review queue
GET /api/v1/admin/sellers/pending
GET /api/v1/admin/sellers/:id
POST /api/v1/admin/sellers/:id/approve
POST /api/v1/admin/sellers/:id/reject
POST /api/v1/admin/sellers/:id/request-info

# Analytics
GET /api/v1/admin/analytics/overview
GET /api/v1/admin/analytics/conversion-funnel
GET /api/v1/admin/analytics/approval-metrics

# Audit logs
GET /api/v1/admin/audit-logs
GET /api/v1/admin/audit-logs/seller/:id
```

### 3.2 API Request/Response Examples

#### POST /api/v1/seller/register/basic-info

**Request:**
```json
{
  "legal_first_name": "Jane",
  "legal_middle_name": "Marie",
  "legal_last_name": "Smith",
  "date_of_birth": "1990-05-15",
  "phone": "+1-555-123-4567",
  "address": {
    "street": "123 Main Street",
    "apt": "Apt 4B",
    "city": "San Francisco",
    "state": "CA",
    "zip": "94102"
  },
  "ssn_last_four": "1234"
}
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "seller_profile_id": "550e8400-e29b-41d4-a716-446655440000",
    "onboarding_step": "identity_verification",
    "next_step_url": "/seller/verify-identity",
    "progress_percentage": 25
  }
}
```

**Response (Validation Error):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "field": "date_of_birth",
        "message": "Must be 18 years or older"
      },
      {
        "field": "phone",
        "message": "Invalid phone number format"
      }
    ]
  }
}
```

#### GET /api/v1/seller/register/status/:seller_profile_id

**Response:**
```json
{
  "success": true,
  "data": {
    "seller_profile_id": "550e8400-e29b-41d4-a716-446655440000",
    "seller_type": "business",
    "seller_status": "active",
    "onboarding_step": "completed",
    "onboarding_completed_at": "2026-02-10T15:30:00Z",
    
    "progress": {
      "completed_steps": [
        "basic_info",
        "identity_verification",
        "business_info",
        "bank_setup",
        "review"
      ],
      "current_step": "completed",
      "percentage": 100
    },
    
    "verification": {
      "identity_verified": true,
      "identity_verified_at": "2026-02-08T10:15:00Z",
      "bank_connected": true,
      "risk_score": 15,
      "risk_level": "low"
    },
    
    "business": {
      "business_name": "Jane's Artisan Bakery",
      "filing_status": "approved",
      "filing_state": "CA",
      "effective_date": "2026-02-09",
      "ein_issued": true
    },
    
    "capabilities": {
      "can_sell": true,
      "can_create_listings": true,
      "monthly_sales_limit_cents": null,
      "listing_limit": null
    },
    
    "next_actions": [
      {
        "action": "create_first_listing",
        "title": "Create your first listing",
        "description": "Start selling by creating your first product",
        "cta": "Create Listing",
        "url": "/seller/listings/new"
      }
    ]
  }
}
```

#### POST /api/v1/admin/sellers/:id/approve

**Request:**
```json
{
  "notes": "All documents verified. Low risk score. Approved for full access.",
  "monthly_sales_limit_cents": null,
  "listing_limit": null,
  "conditions": []
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "seller_profile_id": "550e8400-e29b-41d4-a716-446655440000",
    "previous_status": "pending_approval",
    "new_status": "active",
    "approved_at": "2026-02-11T09:00:00Z",
    "approved_by": "admin-uuid",
    "notification_sent": true
  }
}
```

---

## 4. Component Architecture

### 4.1 Frontend Component Tree

```
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── (auth)/
│   │   ├── login/
│   │   ├── register/
│   │   └── forgot-password/
│   │
│   ├── (seller)/
│   │   ├── register/
│   │   │   ├── page.tsx                    # Path selection
│   │   │   ├── basic-info/
│   │   │   │   └── page.tsx
│   │   │   ├── verify-identity/
│   │   │   │   └── page.tsx
│   │   │   ├── business-info/
│   │   │   │   └── page.tsx
│   │   │   ├── bank-setup/
│   │   │   │   └── page.tsx
│   │   │   ├── review/
│   │   │   │   └── page.tsx
│   │   │   └── success/
│   │   │       └── page.tsx
│   │   │
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── profile/
│   │   └── documents/
│   │
│   └── (admin)/
│       ├── dashboard/
│       ├── sellers/
│       │   ├── page.tsx                    # Pending review queue
│       │   └── [id]/
│       │       └── page.tsx                # Seller detail view
│       └── analytics/
│
├── components/
│   ├── ui/                                 # shadcn/ui components
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── form.tsx
│   │   ├── select.tsx
│   │   ├── badge.tsx
│   │   ├── progress.tsx
│   │   └── ...
│   │
│   ├── seller/
│   │   ├── SellerTypeSelector.tsx
│   │   ├── BasicInfoForm.tsx
│   │   ├── AddressForm.tsx
│   │   ├── IdentityVerification.tsx
│   │   ├── BusinessInfoForm.tsx
│   │   ├── BankConnectionForm.tsx
│   │   ├── PlaidLink.tsx
│   │   ├── ApplicationReview.tsx
│   │   ├── OnboardingProgress.tsx
│   │   ├── StatusTimeline.tsx
│   │   └── DocumentUpload.tsx
│   │
│   ├── admin/
│   │   ├── SellerReviewCard.tsx
│   │   ├── SellerDetailView.tsx
│   │   ├── ApprovalActions.tsx
│   │   ├── RiskScoreDisplay.tsx
│   │   ├── DocumentViewer.tsx
│   │   ├── AdminNotes.tsx
│   │   └── AnalyticsDashboard.tsx
│   │
│   └── shared/
│       ├── Navigation.tsx
│       ├── Footer.tsx
│       ├── LoadingSpinner.tsx
│       ├── ErrorBoundary.tsx
│       └── Notification.tsx
│
├── lib/
│   ├── api/
│   │   ├── client.ts                       # API client setup
│   │   ├── auth.ts
│   │   ├── seller.ts
│   │   └── admin.ts
│   │
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useSellerProfile.ts
│   │   ├── useOnboarding.ts
│   │   └── useAdminActions.ts
│   │
│   ├── utils/
│   │   ├── validation.ts
│   │   ├── formatting.ts
│   │   ├── constants.ts
│   │   └── encryption.ts
│   │
│   ├── types/
│   │   ├── user.ts
│   │   ├── seller.ts
│   │   ├── business.ts
│   │   └── api.ts
│   │
│   └── config/
│       ├── env.ts
│       └── constants.ts
│
└── styles/
    └── globals.css
```

### 4.2 Key React Components

#### SellerTypeSelector Component

```typescript
// components/seller/SellerTypeSelector.tsx
'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

interface SellerTypeSelectorProps {
  onSelect: (type: 'casual' | 'business') => void;
}

export function SellerTypeSelector({ onSelect }: SellerTypeSelectorProps) {
  const [selectedType, setSelectedType] = useState<'casual' | 'business' | null>(null);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Start Selling on DoorNext</h1>
        <p className="text-muted-foreground">
          Choose how you want to sell your homemade goods
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Casual Seller Option */}
        <Card
          className={`p-6 cursor-pointer transition-all hover:border-primary ${
            selectedType === 'casual' ? 'border-primary border-2' : ''
          }`}
          onClick={() => setSelectedType('casual')}
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <h3 className="text-xl font-semibold">Casual Seller</h3>
                <p className="text-sm text-muted-foreground">
                  Perfect for occasional sales
                </p>
              </div>
              {selectedType === 'casual' && (
                <Check className="h-6 w-6 text-primary" />
              )}
            </div>

            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 mt-0.5 text-green-600" />
                <span>Sell under your own name</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 mt-0.5 text-green-600" />
                <span>Up to $5,000/year</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 mt-0.5 text-green-600" />
                <span>No registration fees</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 mt-0.5 text-green-600" />
                <span>Simple tax reporting</span>
              </li>
            </ul>

            <div className="pt-4 border-t">
              <p className="text-xs text-muted-foreground">
                Best for: Hobby sellers, side projects, trying out the platform
              </p>
            </div>
          </div>
        </Card>

        {/* Business Seller Option */}
        <Card
          className={`p-6 cursor-pointer transition-all hover:border-primary ${
            selectedType === 'business' ? 'border-primary border-2' : ''
          }`}
          onClick={() => setSelectedType('business')}
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <h3 className="text-xl font-semibold">Business Seller</h3>
                <p className="text-sm text-muted-foreground">
                  Build a real business
                </p>
              </div>
              {selectedType === 'business' && (
                <Check className="h-6 w-6 text-primary" />
              )}
            </div>

            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 mt-0.5 text-green-600" />
                <span>Register as sole proprietorship</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 mt-0.5 text-green-600" />
                <span>Unlimited sales</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 mt-0.5 text-green-600" />
                <span>Professional business name</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 mt-0.5 text-green-600" />
                <span>We handle registration ($79)</span>
              </li>
            </ul>

            <div className="pt-4 border-t">
              <p className="text-xs text-muted-foreground">
                Best for: Serious sellers, growing businesses, brand building
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex justify-center pt-4">
        <Button
          size="lg"
          disabled={!selectedType}
          onClick={() => selectedType && onSelect(selectedType)}
        >
          Continue
        </Button>
      </div>

      <div className="text-center">
        <a href="#" className="text-sm text-primary hover:underline">
          Learn more about the difference
        </a>
      </div>
    </div>
  );
}
```

#### BasicInfoForm Component

```typescript
// components/seller/BasicInfoForm.tsx
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { US_STATES } from '@/lib/utils/constants';

const formSchema = z.object({
  legal_first_name: z.string().min(2, 'First name is required'),
  legal_middle_name: z.string().optional(),
  legal_last_name: z.string().min(2, 'Last name is required'),
  date_of_birth: z.string().refine((date) => {
    const age = new Date().getFullYear() - new Date(date).getFullYear();
    return age >= 18;
  }, 'Must be 18 years or older'),
  phone: z.string().min(10, 'Valid phone number is required'),
  street_address: z.string().min(5, 'Street address is required'),
  apt_unit: z.string().optional(),
  city: z.string().min(2, 'City is required'),
  state: z.string().length(2, 'State is required'),
  zip_code: z.string().regex(/^\d{5}(-\d{4})?$/, 'Valid ZIP code is required'),
  ssn_last_four: z.string().regex(/^\d{4}$/, 'Last 4 digits of SSN required'),
});

type FormData = z.infer<typeof formSchema>;

interface BasicInfoFormProps {
  onSubmit: (data: FormData) => Promise<void>;
  initialData?: Partial<FormData>;
}

export function BasicInfoForm({ onSubmit, initialData }: BasicInfoFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      legal_first_name: '',
      legal_middle_name: '',
      legal_last_name: '',
      date_of_birth: '',
      phone: '',
      street_address: '',
      apt_unit: '',
      city: '',
      state: '',
      zip_code: '',
      ssn_last_four: '',
    },
  });

  const handleSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      await onSubmit(data);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Tell us about yourself</h2>
          <p className="text-muted-foreground">
            This information is required for identity verification and tax reporting.
          </p>
        </div>

        {/* Name Fields */}
        <div className="grid md:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="legal_first_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Legal First Name</FormLabel>
                <FormControl>
                  <Input placeholder="Jane" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="legal_middle_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Middle Name (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="Marie" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="legal_last_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Legal Last Name</FormLabel>
                <FormControl>
                  <Input placeholder="Smith" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* DOB and Phone */}
        <div className="grid md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="date_of_birth"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date of Birth</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormDescription>Must be 18 or older</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone Number</FormLabel>
                <FormControl>
                  <Input type="tel" placeholder="+1 (555) 123-4567" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Address */}
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="street_address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Street Address</FormLabel>
                <FormControl>
                  <Input placeholder="123 Main Street" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="apt_unit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Apt/Unit (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="Apt 4B" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid md:grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>City</FormLabel>
                  <FormControl>
                    <Input placeholder="San Francisco" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="state"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>State</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {US_STATES.map((state) => (
                        <SelectItem key={state.code} value={state.code}>
                          {state.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="zip_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ZIP Code</FormLabel>
                  <FormControl>
                    <Input placeholder="94102" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* SSN */}
        <FormField
          control={form.control}
          name="ssn_last_four"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Last 4 Digits of SSN</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  maxLength={4}
                  placeholder="1234"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                🔒 Required for tax reporting. Your full SSN will be encrypted and secure.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end pt-4">
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Continue'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
```

#### OnboardingProgress Component

```typescript
// components/seller/OnboardingProgress.tsx
'use client';

import { Check, Circle, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
  id: string;
  title: string;
  status: 'completed' | 'current' | 'upcoming' | 'locked';
}

interface OnboardingProgressProps {
  steps: Step[];
  currentStep: string;
}

export function OnboardingProgress({ steps, currentStep }: OnboardingProgressProps) {
  return (
    <div className="w-full py-8">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <div key={step.id} className="flex flex-1 items-center">
            {/* Step Circle */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full border-2',
                  step.status === 'completed' &&
                    'border-green-500 bg-green-500 text-white',
                  step.status === 'current' &&
                    'border-primary bg-primary text-white',
                  (step.status === 'upcoming' || step.status === 'locked') &&
                    'border-gray-300 bg-white text-gray-400'
                )}
              >
                {step.status === 'completed' ? (
                  <Check className="h-6 w-6" />
                ) : step.status === 'locked' ? (
                  <Lock className="h-5 w-5" />
                ) : (
                  <Circle className="h-6 w-6" />
                )}
              </div>
              <div className="mt-2 text-center">
                <p
                  className={cn(
                    'text-sm font-medium',
                    step.status === 'current' && 'text-primary',
                    step.status === 'completed' && 'text-green-600',
                    (step.status === 'upcoming' || step.status === 'locked') &&
                      'text-gray-500'
                  )}
                >
                  {step.title}
                </p>
              </div>
            </div>

            {/* Connector Line */}
            {index < steps.length - 1 && (
              <div
                className={cn(
                  'mx-2 h-0.5 flex-1',
                  step.status === 'completed' ? 'bg-green-500' : 'bg-gray-300'
                )}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 4.3 State Management

```typescript
// lib/hooks/useOnboarding.ts
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { sellerApi } from '@/lib/api/seller';

export type OnboardingStep =
  | 'path_selection'
  | 'basic_info'
  | 'identity_verification'
  | 'business_info'
  | 'bank_setup'
  | 'review'
  | 'completed';

export interface OnboardingState {
  sellerProfileId: string | null;
  sellerType: 'casual' | 'business' | null;
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  canProceed: boolean;
  data: Record<string, any>;
}

export function useOnboarding() {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState>({
    sellerProfileId: null,
    sellerType: null,
    currentStep: 'path_selection',
    completedSteps: [],
    canProceed: false,
    data: {},
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load onboarding state on mount
  useEffect(() => {
    loadOnboardingState();
  }, []);

  const loadOnboardingState = async () => {
    try {
      setLoading(true);
      const response = await sellerApi.getOnboardingStatus();
      
      if (response.data) {
        setState({
          sellerProfileId: response.data.seller_profile_id,
          sellerType: response.data.seller_type,
          currentStep: response.data.onboarding_step,
          completedSteps: response.data.progress.completed_steps,
          canProceed: true,
          data: response.data,
        });
      }
    } catch (err: any) {
      if (err.response?.status !== 404) {
        setError('Failed to load onboarding state');
      }
    } finally {
      setLoading(false);
    }
  };

  const startOnboarding = async (sellerType: 'casual' | 'business') => {
    try {
      setLoading(true);
      const response = await sellerApi.startRegistration(sellerType);
      
      setState((prev) => ({
        ...prev,
        sellerProfileId: response.data.seller_profile_id,
        sellerType,
        currentStep: 'basic_info',
        canProceed: true,
      }));

      router.push('/seller/register/basic-info');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const completeStep = async (step: OnboardingStep, data: any) => {
    try {
      setLoading(true);
      
      // Save step data to backend
      await sellerApi.saveStepData(state.sellerProfileId!, step, data);

      // Update local state
      setState((prev) => ({
        ...prev,
        completedSteps: [...prev.completedSteps, step],
        data: { ...prev.data, [step]: data },
      }));

      // Navigate to next step
      const nextStep = getNextStep(step, state.sellerType!);
      if (nextStep) {
        setState((prev) => ({ ...prev, currentStep: nextStep }));
        router.push(`/seller/register/${nextStep.replace('_', '-')}`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const goToStep = (step: OnboardingStep) => {
    setState((prev) => ({ ...prev, currentStep: step }));
    router.push(`/seller/register/${step.replace('_', '-')}`);
  };

  return {
    state,
    loading,
    error,
    startOnboarding,
    completeStep,
    goToStep,
    reload: loadOnboardingState,
  };
}

function getNextStep(
  currentStep: OnboardingStep,
  sellerType: 'casual' | 'business'
): OnboardingStep | null {
  const casualFlow: OnboardingStep[] = [
    'path_selection',
    'basic_info',
    'identity_verification',
    'bank_setup',
    'review',
    'completed',
  ];

  const businessFlow: OnboardingStep[] = [
    'path_selection',
    'basic_info',
    'identity_verification',
    'business_info',
    'bank_setup',
    'review',
    'completed',
  ];

  const flow = sellerType === 'business' ? businessFlow : casualFlow;
  const currentIndex = flow.indexOf(currentStep);
  
  if (currentIndex === -1 || currentIndex === flow.length - 1) {
    return null;
  }
  
  return flow[currentIndex + 1];
}
```

---

## 5. Integration Requirements

### 5.1 Identity Verification (Persona)

**Setup:**
```typescript
// lib/integrations/persona.ts
import axios from 'axios';

const PERSONA_API_KEY = process.env.PERSONA_API_KEY!;
const PERSONA_TEMPLATE_ID = process.env.PERSONA_TEMPLATE_ID!;

export const personaClient = axios.create({
  baseURL: 'https://withpersona.com/api/v1',
  headers: {
    'Authorization': `Bearer ${PERSONA_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

// Create verification session
export async function createVerificationSession(data: {
  referenceId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string;
  address: {
    street1: string;
    street2?: string;
    city: string;
    subdivision: string;
    postalCode: string;
  };
}) {
  const response = await personaClient.post('/inquiries', {
    data: {
      type: 'inquiry',
      attributes: {
        'inquiry-template-id': PERSONA_TEMPLATE_ID,
        'reference-id': data.referenceId,
        'name-first': data.firstName,
        'name-last': data.lastName,
        'birthdate': data.dateOfBirth,
        'phone-number': data.phone,
        'address-street-1': data.address.street1,
        'address-street-2': data.address.street2,
        'address-city': data.address.city,
        'address-subdivision': data.address.subdivision,
        'address-postal-code': data.address.postalCode,
      },
    },
  });

  return {
    sessionId: response.data.data.id,
    sessionUrl: response.data.data.attributes['session-url'],
  };
}

// Webhook handler for verification results
export async function handlePersonaWebhook(payload: any) {
  const { type, data } = payload;

  if (type === 'inquiry.completed') {
    return {
      inquiryId: data.id,
      status: data.attributes.status, // 'approved', 'declined', 'needs_review'
      checks: data.attributes.checks,
      riskScore: calculateRiskScore(data),
    };
  }

  return null;
}

function calculateRiskScore(data: any): number {
  // Risk scoring logic based on Persona checks
  let score = 0;
  
  const checks = data.attributes.checks;
  if (checks['identity-comparison'] === 'failed') score += 40;
  if (checks['document-verification'] === 'failed') score += 30;
  if (checks['selfie-verification'] === 'failed') score += 20;
  if (data.attributes['is-potential-synthetic-identity']) score += 50;
  
  return Math.min(score, 100);
}
```

### 5.2 Payment Processing (Stripe Connect)

**Setup:**
```typescript
// lib/integrations/stripe.ts
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia',
});

// Create Stripe Connect account for seller
export async function createConnectAccount(data: {
  email: string;
  firstName: string;
  lastName: string;
  dateOfBirth: { day: number; month: number; year: number };
  ssnLast4: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
  };
  businessType: 'individual' | 'company';
  businessName?: string;
}) {
  const account = await stripe.accounts.create({
    type: 'custom',
    country: 'US',
    email: data.email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_type: data.businessType,
    business_profile: {
      mcc: '5499', // Misc food stores
      product_description: 'Homemade goods',
    },
    individual: {
      first_name: data.firstName,
      last_name: data.lastName,
      dob: data.dateOfBirth,
      ssn_last_4: data.ssnLast4,
      address: {
        line1: data.address.line1,
        line2: data.address.line2,
        city: data.address.city,
        state: data.address.state,
        postal_code: data.address.postalCode,
        country: 'US',
      },
      email: data.email,
    },
    ...(data.businessName && {
      company: {
        name: data.businessName,
      },
    }),
    tos_acceptance: {
      date: Math.floor(Date.now() / 1000),
      ip: '0.0.0.0', // Should be actual user IP
    },
  });

  return {
    accountId: account.id,
    status: account.details_submitted ? 'active' : 'pending',
  };
}

// Add bank account via Plaid token
export async function addBankAccount(
  accountId: string,
  plaidToken: string,
  accountId: string
) {
  // Exchange Plaid token for Stripe bank account token
  const bankToken = await stripe.tokens.create({
    bank_account: {
      country: 'US',
      currency: 'usd',
      account_holder_name: 'Account Holder',
      account_holder_type: 'individual',
      routing_number: 'EXTRACTED_FROM_PLAID',
      account_number: 'EXTRACTED_FROM_PLAID',
    },
  });

  // Attach to Connect account
  const bankAccount = await stripe.accounts.createExternalAccount(
    accountId,
    { external_account: bankToken.id }
  );

  return {
    bankAccountId: bankAccount.id,
    last4: (bankAccount as Stripe.BankAccount).last4,
  };
}

// Process business filing fee
export async function processFilingFee(data: {
  amount: number; // in cents
  paymentMethodId: string;
  sellerId: string;
  description: string;
}) {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: data.amount,
    currency: 'usd',
    payment_method: data.paymentMethodId,
    confirm: true,
    description: data.description,
    metadata: {
      seller_id: data.sellerId,
      type: 'business_filing_fee',
    },
  });

  return {
    paymentIntentId: paymentIntent.id,
    status: paymentIntent.status,
  };
}
```

### 5.3 Bank Verification (Plaid)

**Setup:**
```typescript
// lib/integrations/plaid.ts
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

const configuration = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID!,
      'PLAID-SECRET': process.env.PLAID_SECRET!,
    },
  },
});

const plaidClient = new PlaidApi(configuration);

// Create Link token for bank connection
export async function createLinkToken(userId: string) {
  const response = await plaidClient.linkTokenCreate({
    user: { client_user_id: userId },
    client_name: 'DoorNext',
    products: ['auth'],
    country_codes: ['US'],
    language: 'en',
    webhook: `${process.env.APP_URL}/api/webhooks/plaid`,
  });

  return {
    linkToken: response.data.link_token,
    expiration: response.data.expiration,
  };
}

// Exchange public token for access token
export async function exchangePublicToken(publicToken: string) {
  const response = await plaidClient.itemPublicTokenExchange({
    public_token: publicToken,
  });

  return {
    accessToken: response.data.access_token,
    itemId: response.data.item_id,
  };
}

// Get bank account details
export async function getBankAccountDetails(accessToken: string) {
  const authResponse = await plaidClient.authGet({
    access_token: accessToken,
  });

  const accounts = authResponse.data.accounts;
  const numbers = authResponse.data.numbers.ach;

  return accounts.map((account, index) => ({
    accountId: account.account_id,
    name: account.name,
    type: account.type,
    subtype: account.subtype,
    routingNumber: numbers[index]?.routing,
    accountNumber: numbers[index]?.account,
    wireRoutingNumber: numbers[index]?.wire_routing,
  }));
}
```

### 5.4 Business Registration Service

**For MVP - Manual Filing:**
```typescript
// lib/services/businessRegistration.ts

interface BusinessFilingData {
  businessName: string;
  ownerName: string;
  address: Address;
  state: string;
  category: string;
}

export async function submitBusinessFiling(data: BusinessFilingData) {
  // For MVP: Create task for admin to file manually
  const filing = await db.business_registrations.create({
    data: {
      legal_business_name: data.businessName,
      filing_state: data.state,
      filing_status: 'pending',
      filing_provider: 'internal',
      state_filing_fee_cents: getStateFilingFee(data.state),
      service_fee_cents: 7900,
      total_fee_cents: getStateFilingFee(data.state) + 7900,
    },
  });

  // Send notification to admin
  await notifyAdminOfNewFiling(filing.id);

  return {
    filingId: filing.id,
    status: 'pending',
    estimatedCompletion: calculateEstimatedCompletion(data.state),
  };
}

function getStateFilingFee(state: string): number {
  const fees: Record<string, number> = {
    CA: 7000, // $70
    TX: 30000, // $300
    NY: 20000, // $200
    FL: 12500, // $125
    // ... all states
  };
  return fees[state] || 10000;
}

function calculateEstimatedCompletion(state: string): string {
  const processingDays: Record<string, number> = {
    CA: 5,
    TX: 3,
    NY: 7,
    FL: 4,
    // ... all states
  };
  
  const days = processingDays[state] || 5;
  const date = new Date();
  date.setDate(date.getDate() + days);
  
  return date.toISOString();
}
```

**For Scale - Automated Filing:**
```typescript
// Integration with LegalZoom or similar
export async function submitBusinessFilingAutomated(data: BusinessFilingData) {
  const response = await axios.post(
    'https://api.legalzoom.com/v1/business/register',
    {
      businessName: data.businessName,
      state: data.state,
      entityType: 'SOLE_PROPRIETORSHIP',
      owner: {
        name: data.ownerName,
        address: data.address,
      },
      category: data.category,
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.LEGALZOOM_API_KEY}`,
      },
    }
  );

  return {
    filingId: response.data.orderId,
    status: 'submitted',
    trackingUrl: response.data.trackingUrl,
  };
}
```

---

## 6. Security & Compliance

### 6.1 Data Encryption

```typescript
// lib/utils/encryption.ts
import { KMS } from 'aws-sdk';

const kms = new KMS({
  region: process.env.AWS_REGION,
});

const KEY_ID = process.env.KMS_KEY_ID!;

// Encrypt sensitive data (SSN, EIN)
export async function encrypt(plaintext: string): Promise<string> {
  const params = {
    KeyId: KEY_ID,
    Plaintext: Buffer.from(plaintext),
  };

  const result = await kms.encrypt(params).promise();
  return result.CiphertextBlob!.toString('base64');
}

// Decrypt sensitive data
export async function decrypt(ciphertext: string): Promise<string> {
  const params = {
    CiphertextBlob: Buffer.from(ciphertext, 'base64'),
  };

  const result = await kms.decrypt(params).promise();
  return result.Plaintext!.toString('utf-8');
}

// One-way hash for comparison
export function hashSensitiveData(data: string): string {
  return crypto
    .createHash('sha256')
    .update(data + process.env.HASH_SALT)
    .digest('hex');
}
```

### 6.2 Access Control Middleware

```typescript
// middleware/auth.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT } from '@/lib/auth/jwt';

export async function requireAuth(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const payload = await verifyJWT(token);
    request.headers.set('user-id', payload.userId);
    request.headers.set('user-role', payload.role);
    return null;
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
}

export async function requireAdmin(request: NextRequest) {
  const authCheck = await requireAuth(request);
  if (authCheck) return authCheck;

  const role = request.headers.get('user-role');
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Log admin access
  await logAdminAccess({
    userId: request.headers.get('user-id')!,
    action: request.method,
    path: request.url,
    ip: request.ip,
  });

  return null;
}
```

### 6.3 PII Access Logging

```typescript
// lib/audit/pii-access.ts

export async function logPIIAccess(data: {
  userId: string;
  accessedBy: string;
  dataType: 'ssn' | 'bank_account' | 'full_profile' | 'document';
  targetId: string;
  reason: string;
  ipAddress: string;
}) {
  await db.admin_actions.create({
    data: {
      admin_user_id: data.accessedBy,
      action_type: `view_${data.dataType}`,
      target_type: 'seller_profile',
      target_id: data.targetId,
      action_details: { reason: data.reason },
      ip_address: data.ipAddress,
    },
  });

  // Alert on suspicious patterns
  const recentAccesses = await db.admin_actions.count({
    where: {
      admin_user_id: data.accessedBy,
      action_type: { startsWith: 'view_' },
      created_at: { gte: new Date(Date.now() - 3600000) }, // Last hour
    },
  });

  if (recentAccesses > 50) {
    await alertSecurityTeam({
      alert: 'Excessive PII access detected',
      adminId: data.accessedBy,
      count: recentAccesses,
    });
  }
}
```

---

## 7. Admin Dashboard

### 7.1 Admin Dashboard Components

```typescript
// components/admin/SellerReviewQueue.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { adminApi } from '@/lib/api/admin';
import { SellerReviewCard } from './SellerReviewCard';

export function SellerReviewQueue() {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadPendingSellers();
  }, [filter]);

  const loadPendingSellers = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getPendingSellers({ filter });
      setSellers(response.data);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (sellerId: string) => {
    await adminApi.approveSeller(sellerId);
    loadPendingSellers();
  };

  const handleReject = async (sellerId: string, reason: string) => {
    await adminApi.rejectSeller(sellerId, reason);
    loadPendingSellers();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Seller Review Queue</h1>
        <div className="flex gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            onClick={() => setFilter('all')}
          >
            All
          </Button>
          <Button
            variant={filter === 'high_risk' ? 'default' : 'outline'}
            onClick={() => setFilter('high_risk')}
          >
            High Risk
          </Button>
          <Button
            variant={filter === 'business' ? 'default' : 'outline'}
            onClick={() => setFilter('business')}
          >
            Business
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {sellers.map((seller) => (
          <SellerReviewCard
            key={seller.id}
            seller={seller}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        ))}
      </div>
    </div>
  );
}
```

---

## 8. Implementation Checklist

### Phase 1: MVP (Weeks 1-4)

**Week 1: Setup & Infrastructure**
- [ ] Initialize Next.js project with TypeScript
- [ ] Set up PostgreSQL database
- [ ] Configure Supabase/Prisma ORM
- [ ] Set up environment variables
- [ ] Create base layout and routing structure
- [ ] Install shadcn/ui components
- [ ] Set up authentication (JWT)

**Week 2: Core Registration Flow**
- [ ] Build seller type selection page
- [ ] Build basic info form
- [ ] Implement form validation with Zod
- [ ] Create API routes for registration
- [ ] Set up database models
- [ ] Implement onboarding state management
- [ ] Build progress indicator component

**Week 3: Verification & Payment**
- [ ] Integrate Persona for ID verification
- [ ] Build identity verification flow
- [ ] Integrate Stripe Connect
- [ ] Build bank connection flow
- [ ] Integrate Plaid for bank verification
- [ ] Implement payment processing for filing fees

**Week 4: Admin & Testing**
- [ ] Build admin dashboard
- [ ] Create review queue
- [ ] Implement approval/rejection workflow
- [ ] Add email notifications
- [ ] Write integration tests
- [ ] Deploy to staging
- [ ] Beta test with 10 users

### Phase 2: Enhancement (Weeks 5-8)

**Week 5-6: Business Registration**
- [ ] Build business info collection flow
- [ ] Implement state-specific requirements
- [ ] Create manual filing workflow for admin
- [ ] Build document management system
- [ ] Add business certificate generation
- [ ] Implement EIN application tracking

**Week 7: Automation**
- [ ] Build risk scoring engine
- [ ] Implement auto-approval logic
- [ ] Add fraud detection patterns
- [ ] Create webhook handlers
- [ ] Build notification system (email/SMS)

**Week 8: Polish & Launch**
- [ ] Mobile responsive optimization
- [ ] Add analytics tracking
- [ ] Security audit
- [ ] Load testing
- [ ] Documentation
- [ ] Production deployment

### Phase 3: Scale (Months 3-6)

- [ ] Add automated business filing (LegalZoom integration)
- [ ] Build mobile apps (iOS/Android)
- [ ] Multi-state expansion
- [ ] Advanced analytics dashboard
- [ ] Machine learning fraud detection
- [ ] API for third-party integrations

---

## 9. Environment Variables

```bash
# .env.local

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3000/api

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/doornext

# Authentication
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Persona (Identity Verification)
PERSONA_API_KEY=persona_sandbox_...
PERSONA_TEMPLATE_ID=itmpl_...
PERSONA_WEBHOOK_SECRET=whsec_...

# Plaid (Bank Verification)
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_secret
PLAID_ENV=sandbox

# AWS (for document storage)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=doornext-documents
AWS_KMS_KEY_ID=arn:aws:kms:...

# Email (SendGrid)
SENDGRID_API_KEY=SG...
FROM_EMAIL=noreply@doornext.com

# SMS (Twilio)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1234567890

# LegalZoom (optional, for automated filing)
LEGALZOOM_API_KEY=...
LEGALZOOM_API_SECRET=...

# Encryption
HASH_SALT=random-salt-for-hashing
```

---

## 10. Success Metrics & KPIs

```yaml
Registration Metrics:
  - Conversion rate (started → completed): Target 65%
  - Time to complete: Target < 5 minutes
  - Drop-off rate per step: Target < 10% per step
  - Identity verification success: Target > 90%

Approval Metrics:
  - Auto-approval rate: Target 80%
  - Manual review time: Target < 2 hours
  - Approval rate: Target > 95%
  - Rejection rate: Target < 5%

Quality Metrics:
  - Fraud rate: Target < 0.5%
  - Chargeback rate: Target < 0.3%
  - Seller satisfaction (NPS): Target > 50

Business Metrics:
  - Business registration attach rate: Target 30%
  - Filing fee revenue per seller: Target $24
  - Monthly active sellers: Growth target 20% MoM
```

---

## 11. Technical Decisions & Rationale

### Why Next.js 14 (App Router)?
- Server-side rendering for better SEO
- API routes for backend logic
- File-based routing simplifies structure
- React Server Components reduce client-side JavaScript
- Built-in optimization (images, fonts, etc.)

### Why PostgreSQL?
- ACID compliance for financial data
- Rich data types (JSONB for flexible metadata)
- Strong consistency for audit trails
- Excellent performance for relational data

### Why Stripe Connect?
- Industry standard for marketplace payments
- Handles all compliance (PCI-DSS)
- Automatic 1099 generation
- Flexible payout schedules
- Strong API and documentation

### Why Persona over alternatives?
- Best-in-class UX for identity verification
- Real-time verification (30 seconds)
- Strong fraud detection
- Government ID + selfie matching
- Comprehensive API

---

## 12. Cost Projections

### Monthly Costs (at 1,000 active sellers)

```
Infrastructure:
  - Vercel Pro: $20
  - Supabase Pro: $25
  - AWS S3: $10
  - Total: $55/month

Per-Transaction Costs:
  - Persona verification: $2 × 1,000 = $2,000 (one-time)
  - Plaid bank link: $0.10 × 1,000 = $100 (one-time)
  - Stripe Connect: 0.25% of GMV
  - SendGrid emails: $15/month
  - Twilio SMS: $50/month
  
Business Registration Revenue:
  - 300 business sellers × $79 = $23,700 (one-time)
  - Minus state fees: ~$6,000
  - Net revenue: $17,700

Total First Month: ~$2,220 costs, $17,700 revenue
Ongoing Monthly: ~$120 infrastructure
```

---

## Next Steps

1. **Immediate**: Set up development environment
2. **Week 1**: Build core registration flow
3. **Week 2**: Integrate identity verification
4. **Week 3**: Add payment processing
5. **Week 4**: Beta launch with 10 sellers
6. **Month 2**: Iterate based on feedback
7. **Month 3**: Public launch

---

This specification is ready for implementation in Lovable or any modern React framework. The architecture is modular, scalable, and follows industry best practices for marketplace platforms.
