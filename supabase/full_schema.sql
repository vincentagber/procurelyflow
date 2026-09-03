-- ==============================================================================
-- PROCURELY / PROCUREMENT FLOW - COMPLETE MASTER DATABASE SCHEMA
-- ==============================================================================
-- This single script creates all necessary ENUMs, Tables, Functions, Triggers,
-- Row-Level Security (RLS) policies, and Indexes for the entire application.
-- It can be safely executed all at once in the Supabase SQL Editor.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 2. CUSTOM ENUMS
-- ------------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE public.app_role AS ENUM (
        'requester',
        'approver',
        'procurement_officer',
        'finance',
        'executive',
        'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.requisition_status AS ENUM (
        'draft',
        'pending_approval',
        'approved',
        'rejected',
        'rfq_issued',
        'po_issued',
        'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.approval_status AS ENUM (
        'pending',
        'approved',
        'rejected',
        'skipped'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.approval_mode AS ENUM (
        'sequential',
        'parallel'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.rfq_status AS ENUM (
        'open',
        'closed',
        'awarded',
        'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.quote_status AS ENUM (
        'invited',
        'submitted',
        'shortlisted',
        'awarded',
        'rejected'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.po_status AS ENUM (
        'draft',
        'issued',
        'acknowledged',
        'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.currency_code AS ENUM (
        'NGN',
        'USD'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.subscription_plan AS ENUM (
        'starter',
        'growth',
        'business',
        'enterprise',
        'custom'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------------------------
-- 3. CORE & TENANCY TABLES
-- ------------------------------------------------------------------------------

-- Organizations (Tenants)
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    base_currency public.currency_code NOT NULL DEFAULT 'NGN',
    plan public.subscription_plan NOT NULL DEFAULT 'starter',
    status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'overdue', 'suspended')),
    primary_contact_email TEXT,
    suspended_at TIMESTAMPTZ,
    suspension_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY,
    org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    department TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User Roles
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    role public.app_role NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, org_id, role)
);

-- Platform Admins (Super Admins)
CREATE TABLE IF NOT EXISTS public.platform_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE,
    email TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_admins_email_key ON public.platform_admins (lower(email));

-- Pre-authorized platform admin
INSERT INTO public.platform_admins (email, note)
VALUES ('bosjatech@gmail.com', 'Founding platform admin')
ON CONFLICT (lower(email)) DO NOTHING;

-- Organization Team Invitations
CREATE TABLE IF NOT EXISTS public.org_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    roles public.app_role[] NOT NULL DEFAULT ARRAY['requester']::public.app_role[],
    status TEXT NOT NULL DEFAULT 'pending',
    invited_by UUID,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS org_invitations_org_email_pending_idx
    ON public.org_invitations (org_id, lower(email))
    WHERE status = 'pending';

-- ------------------------------------------------------------------------------
-- 4. MASTER CATALOG, SITES & SUPPLIERS
-- ------------------------------------------------------------------------------

-- Projects
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    location TEXT,
    budget_amount NUMERIC(16,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sites
CREATE TABLE IF NOT EXISTS public.sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    location TEXT,
    contact_person TEXT,
    contact_phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Units of Measure
CREATE TABLE IF NOT EXISTS public.units_of_measure (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    symbol TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, code)
);

-- Item Categories
CREATE TABLE IF NOT EXISTS public.item_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, code)
);

-- Suppliers
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    contact_name TEXT,
    email TEXT,
    phone TEXT,
    tax_id TEXT,
    is_compliant BOOLEAN NOT NULL DEFAULT TRUE,
    rating NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Item Master Catalog
CREATE TABLE IF NOT EXISTS public.items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.item_categories(id) ON DELETE SET NULL,
    uom_id UUID REFERENCES public.units_of_measure(id) ON DELETE SET NULL,
    sku TEXT,
    name TEXT NOT NULL,
    description TEXT,
    estimated_unit_price NUMERIC(16,2) NOT NULL DEFAULT 0,
    currency public.currency_code NOT NULL DEFAULT 'NGN',
    preferred_supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cost Codes & Budget Allocations
CREATE TABLE IF NOT EXISTS public.cost_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    description TEXT NOT NULL,
    allocated_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
    committed_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
    incurred_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
    currency public.currency_code NOT NULL DEFAULT 'NGN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, project_id, code)
);

-- ------------------------------------------------------------------------------
-- 5. REQUISITIONS & APPROVAL WORKFLOW
-- ------------------------------------------------------------------------------

-- Approval Rules
CREATE TABLE IF NOT EXISTS public.approval_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    min_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
    max_amount NUMERIC(16,2),
    required_roles public.app_role[] NOT NULL DEFAULT '{}',
    extra_role_if_unbudgeted public.app_role,
    approval_mode public.approval_mode NOT NULL DEFAULT 'sequential',
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Requisitions
CREATE TABLE IF NOT EXISTS public.requisitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    requester_id UUID NOT NULL,
    reference TEXT NOT NULL DEFAULT concat('REQ-', to_char(now(),'YYMMDD'), '-', upper(substr(md5(random()::text),1,5))),
    title TEXT NOT NULL,
    notes TEXT,
    needed_by DATE,
    currency public.currency_code NOT NULL DEFAULT 'NGN',
    total_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
    is_unbudgeted BOOLEAN NOT NULL DEFAULT FALSE,
    status public.requisition_status NOT NULL DEFAULT 'draft',
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Requisition Line Items
CREATE TABLE IF NOT EXISTS public.requisition_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requisition_id UUID NOT NULL REFERENCES public.requisitions(id) ON DELETE CASCADE,
    item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
    cost_code_id UUID REFERENCES public.cost_codes(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    quantity NUMERIC(14,3) NOT NULL DEFAULT 1,
    unit TEXT NOT NULL DEFAULT 'unit',
    estimated_unit_price NUMERIC(16,2) NOT NULL DEFAULT 0,
    attachments JSONB DEFAULT '[]'::jsonb,
    sort_order INT NOT NULL DEFAULT 0
);

-- Approval Steps
CREATE TABLE IF NOT EXISTS public.approval_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    requisition_id UUID NOT NULL REFERENCES public.requisitions(id) ON DELETE CASCADE,
    step_order INT NOT NULL,
    required_role public.app_role NOT NULL,
    reason TEXT,
    status public.approval_status NOT NULL DEFAULT 'pending',
    decided_by UUID,
    decided_at TIMESTAMPTZ,
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Immutable Approval & Audit Log
CREATE TABLE IF NOT EXISTS public.approval_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    requisition_id UUID,
    actor_id UUID,
    actor_name TEXT,
    actor_role public.app_role,
    action TEXT NOT NULL,
    detail TEXT,
    amount NUMERIC(16,2),
    event_type TEXT NOT NULL DEFAULT 'LEGACY_EVENT',
    entity_type TEXT NOT NULL DEFAULT 'requisition',
    entity_id TEXT,
    payload_hash TEXT,
    previous_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 6. RFQ, QUOTATIONS & PURCHASE ORDERS
-- ------------------------------------------------------------------------------

-- Request for Quotations (RFQs)
CREATE TABLE IF NOT EXISTS public.rfqs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    requisition_id UUID NOT NULL REFERENCES public.requisitions(id) ON DELETE CASCADE,
    reference TEXT NOT NULL DEFAULT concat('RFQ-', to_char(now(),'YYMMDD'), '-', upper(substr(md5(random()::text),1,5))),
    title TEXT NOT NULL,
    instructions TEXT,
    closes_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    status public.rfq_status NOT NULL DEFAULT 'open',
    closed_notified_at TIMESTAMPTZ,
    all_responded_notified_at TIMESTAMPTZ,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RFQ Invitations
CREATE TABLE IF NOT EXISTS public.rfq_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    rfq_id UUID NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24),'hex'),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    opened_at TIMESTAMPTZ,
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (rfq_id, supplier_id)
);

-- Quotes
CREATE TABLE IF NOT EXISTS public.quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    rfq_id UUID NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    currency public.currency_code NOT NULL DEFAULT 'NGN',
    subtotal NUMERIC NOT NULL DEFAULT 0,
    vat_amount NUMERIC NOT NULL DEFAULT 0,
    delivery_charge NUMERIC NOT NULL DEFAULT 0,
    total_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
    validity_days INT,
    lead_time_days INT,
    payment_terms TEXT,
    warranty_note TEXT,
    attachment_path TEXT,
    status public.quote_status NOT NULL DEFAULT 'submitted',
    is_proxy BOOLEAN NOT NULL DEFAULT FALSE,
    proxy_entered_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    proxy_source TEXT CHECK (proxy_source IN ('whatsapp_message', 'phone_call', 'physical_document', 'email', 'other')),
    proxy_evidence_url TEXT,
    proxy_notes TEXT,
    valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '14 days'),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (rfq_id, supplier_id)
);

-- Quote Items
CREATE TABLE IF NOT EXISTS public.quote_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
    requisition_item_id UUID REFERENCES public.requisition_items(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    quantity NUMERIC(14,3) NOT NULL DEFAULT 1,
    unit_price NUMERIC(16,2) NOT NULL DEFAULT 0,
    vat_rate NUMERIC NOT NULL DEFAULT 0,
    vat_amount NUMERIC NOT NULL DEFAULT 0,
    currency public.currency_code NOT NULL DEFAULT 'NGN',
    sort_order INT NOT NULL DEFAULT 0
);

-- Purchase Orders
CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    po_number TEXT NOT NULL DEFAULT concat('PO-', to_char(now(),'YYMMDD'), '-', upper(substr(md5(random()::text),1,5))),
    requisition_id UUID REFERENCES public.requisitions(id) ON DELETE SET NULL,
    rfq_id UUID REFERENCES public.rfqs(id) ON DELETE SET NULL,
    quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    settlement_currency public.currency_code NOT NULL DEFAULT 'NGN',
    total_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
    fx_rate_note TEXT,
    delivery_address TEXT,
    status public.po_status NOT NULL DEFAULT 'issued',
    override_reason TEXT,
    recommended_quote_id UUID,
    issued_by UUID NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by_name TEXT
);

-- Purchase Order Line Items
CREATE TABLE IF NOT EXISTS public.po_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
    cost_code_id UUID REFERENCES public.cost_codes(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    quantity NUMERIC(14,3) NOT NULL DEFAULT 1,
    unit_price NUMERIC(16,2) NOT NULL DEFAULT 0,
    currency public.currency_code NOT NULL DEFAULT 'NGN',
    sort_order INT NOT NULL DEFAULT 0
);

-- ------------------------------------------------------------------------------
-- 7. DELIVERY RECEIPTS, INVOICING & PAYMENTS
-- ------------------------------------------------------------------------------

-- Delivery Receipts (GRN / Inspection)
CREATE TABLE IF NOT EXISTS public.delivery_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    receiving_officer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    receiving_officer_name TEXT NOT NULL,
    delivery_note_ref TEXT,
    delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted', 'partial', 'rejected')),
    quality_observations TEXT,
    photos JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Delivery Receipt Items
CREATE TABLE IF NOT EXISTS public.delivery_receipt_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_receipt_id UUID NOT NULL REFERENCES public.delivery_receipts(id) ON DELETE CASCADE,
    po_item_id UUID REFERENCES public.po_line_items(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    quantity_delivered NUMERIC NOT NULL DEFAULT 0,
    quantity_accepted NUMERIC NOT NULL DEFAULT 0,
    quantity_rejected NUMERIC NOT NULL DEFAULT 0,
    rejection_reason TEXT
);

-- Supplier Invoices (with NRS e-Invoicing & WHT Compliance)
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    invoice_number TEXT NOT NULL,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    currency public.currency_code NOT NULL DEFAULT 'NGN',
    subtotal NUMERIC NOT NULL DEFAULT 0,
    vat_amount NUMERIC NOT NULL DEFAULT 0,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    -- WHT (Withholding Tax)
    wht_applicable BOOLEAN NOT NULL DEFAULT FALSE,
    wht_rate NUMERIC NOT NULL DEFAULT 2.0 CHECK (wht_rate >= 0 AND wht_rate <= 100),
    wht_amount NUMERIC GENERATED ALWAYS AS (
        CASE WHEN wht_applicable THEN ROUND(subtotal * (wht_rate / 100), 2) ELSE 0 END
    ) STORED,
    wht_credit_note_received BOOLEAN NOT NULL DEFAULT FALSE,
    wht_credit_note_reference TEXT,
    -- NRS e-Invoicing (UBL / PEPPOL BIS 3.0)
    seller_legal_name TEXT,
    seller_tin TEXT,
    buyer_legal_name TEXT,
    buyer_tin TEXT,
    irn TEXT,
    irn_clearance_status TEXT NOT NULL DEFAULT 'pending' CHECK (irn_clearance_status IN ('pending', 'cleared', 'flagged')),
    irn_cleared_at TIMESTAMPTZ,
    clearance_reference TEXT,
    clearance_status TEXT,
    -- Three-Way Matching Status
    three_way_match_status TEXT NOT NULL DEFAULT 'pending' CHECK (three_way_match_status IN ('pending', 'matched', 'discrepancy_flagged')),
    match_discrepancies JSONB DEFAULT '[]'::jsonb,
    line_items JSONB NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('draft', 'pending_approval', 'approved_for_payment', 'paid', 'rejected')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Invoice Line Items
CREATE TABLE IF NOT EXISTS public.invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    po_item_id UUID REFERENCES public.po_line_items(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    quantity NUMERIC NOT NULL DEFAULT 1,
    unit_price NUMERIC NOT NULL DEFAULT 0,
    vat_rate NUMERIC NOT NULL DEFAULT 7.5,
    total_amount NUMERIC NOT NULL DEFAULT 0
);

-- Payments
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
    amount NUMERIC NOT NULL,
    currency public.currency_code NOT NULL DEFAULT 'NGN',
    payment_method TEXT NOT NULL DEFAULT 'bank_transfer' CHECK (payment_method IN ('bank_transfer', 'virtual_account', 'invoice_billing', 'card')),
    payment_reference TEXT,
    paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 8. BILLING, TOKENS, AUDITING & NOTIFICATIONS
-- ------------------------------------------------------------------------------

-- Platform Billing Invoices (Subscription billing for tenants)
CREATE TABLE IF NOT EXISTS public.billing_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL UNIQUE,
    plan public.subscription_plan NOT NULL DEFAULT 'starter',
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    description TEXT,
    subtotal NUMERIC(14,2) NOT NULL CHECK (subtotal >= 0),
    vat_rate NUMERIC(5,2) NOT NULL DEFAULT 7.5 CHECK (vat_rate >= 0 AND vat_rate <= 100),
    vat_amount NUMERIC(14,2) GENERATED ALWAYS AS (round(subtotal * vat_rate / 100, 2)) STORED,
    total_amount NUMERIC(14,2) GENERATED ALWAYS AS (round(subtotal + (subtotal * vat_rate / 100), 2)) STORED,
    currency public.currency_code NOT NULL DEFAULT 'NGN',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','overdue')),
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    paid_at TIMESTAMPTZ,
    payment_reference TEXT,
    marked_paid_by UUID,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    rfq_id UUID REFERENCES public.rfqs(id) ON DELETE CASCADE,
    requisition_id UUID REFERENCES public.requisitions(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Security Events
CREATE TABLE IF NOT EXISTS public.security_events (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    event TEXT NOT NULL,
    email TEXT,
    ip_address TEXT,
    user_agent TEXT,
    detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- NDPA 2023 Compliance Consent Logs
CREATE TABLE IF NOT EXISTS public.ndpa_consent_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    consent_type TEXT NOT NULL,
    granted BOOLEAN NOT NULL DEFAULT TRUE,
    ip_address TEXT,
    details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Secure Action Tokens (1-click approvals via email/WhatsApp)
CREATE TABLE IF NOT EXISTS public.secure_action_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    action_type TEXT NOT NULL CHECK (action_type IN ('approve_requisition', 'reject_requisition', 'submit_quote', 'acknowledge_po')),
    entity_type TEXT NOT NULL CHECK (entity_type IN ('requisition', 'approval_step', 'rfq', 'purchase_order')),
    entity_id UUID NOT NULL,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_identifier TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 9. FUNCTIONS & STORED PROCEDURES
-- ------------------------------------------------------------------------------

-- Helper: Get current user org_id
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid()
$$;

-- Helper: Check single role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Helper: Check any of given roles
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _roles public.app_role[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles))
$$;

-- Helper: Check if org staff
CREATE OR REPLACE FUNCTION public.is_org_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_any_role(_user_id, ARRAY['approver','procurement_officer','finance','executive','admin']::public.app_role[])
$$;

-- Helper: Platform admin check
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = _user_id)
$$;

-- Trigger Function: Set updated_at timestamp
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Trigger Function: Block mutations on immutable audit tables
CREATE OR REPLACE FUNCTION public.block_audit_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'This table is append-only and cannot be modified or deleted';
END;
$$;

-- Trigger Function: Validate WHT credit note
CREATE OR REPLACE FUNCTION public.validate_wht_credit_note_reference()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.wht_credit_note_reference IS NOT NULL AND NEW.wht_credit_note_received IS NOT TRUE THEN
    RAISE EXCEPTION 'WHT credit note reference can only be set when wht_credit_note_received is true';
  END IF;
  RETURN NEW;
END;
$$;

-- Query Helper: Project budget calculation
CREATE OR REPLACE FUNCTION public.project_budget_status(_project_id UUID)
RETURNS TABLE (
  budget_amount NUMERIC,
  committed NUMERIC,
  issued NUMERIC,
  remaining NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.budget_amount,
    COALESCE(SUM(CASE WHEN r.status IN ('approved', 'pending_approval', 'rfq_issued', 'po_issued') THEN r.total_amount ELSE 0 END), 0)::NUMERIC as committed,
    COALESCE(SUM(CASE WHEN r.status = 'po_issued' THEN r.total_amount ELSE 0 END), 0)::NUMERIC as issued,
    (COALESCE(p.budget_amount, 0) - COALESCE(SUM(CASE WHEN r.status IN ('approved', 'pending_approval', 'rfq_issued', 'po_issued') THEN r.total_amount ELSE 0 END), 0))::NUMERIC as remaining
  FROM public.projects p
  LEFT JOIN public.requisitions r ON r.project_id = p.id
  WHERE p.id = _project_id
  GROUP BY p.id, p.budget_amount;
$$;

-- Query Helper: Organization users with roles
CREATE OR REPLACE FUNCTION public.org_users_with_roles(_org_id UUID, _roles public.app_role[])
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  full_name TEXT,
  roles public.app_role[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.id as user_id,
    p.email,
    p.full_name,
    ARRAY_AGG(ur.role)::public.app_role[] as roles
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE p.org_id = _org_id
  AND ur.role = ANY(_roles)
  GROUP BY p.id, p.email, p.full_name;
$$;

-- Maintenance Helper: Overdue sweep
CREATE OR REPLACE FUNCTION public.sweep_overdue_billing()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE affected INTEGER;
BEGIN
  UPDATE public.billing_invoices
  SET status = 'overdue'
  WHERE status = 'pending' AND due_date < current_date;

  GET DIAGNOSTICS affected = ROW_COUNT;

  UPDATE public.organizations o
  SET status = 'overdue'
  WHERE o.status IN ('trial','active')
    AND EXISTS (
      SELECT 1 FROM public.billing_invoices b
      WHERE b.org_id = o.id AND b.status = 'overdue'
    );

  RETURN affected;
END;
$$;

-- ------------------------------------------------------------------------------
-- 10. TRIGGERS
-- ------------------------------------------------------------------------------

-- Updated_at triggers
DROP TRIGGER IF EXISTS org_invitations_set_updated_at ON public.org_invitations;
CREATE TRIGGER org_invitations_set_updated_at
  BEFORE UPDATE ON public.org_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS billing_invoices_set_updated_at ON public.billing_invoices;
CREATE TRIGGER billing_invoices_set_updated_at
  BEFORE UPDATE ON public.billing_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Immutability triggers
DROP TRIGGER IF EXISTS audit_log_no_update ON public.approval_audit_log;
CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON public.approval_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.block_audit_mutation();

DROP TRIGGER IF EXISTS audit_log_no_delete ON public.approval_audit_log;
CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON public.approval_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.block_audit_mutation();

DROP TRIGGER IF EXISTS security_events_no_update ON public.security_events;
CREATE TRIGGER security_events_no_update
  BEFORE UPDATE ON public.security_events
  FOR EACH ROW EXECUTE FUNCTION public.block_audit_mutation();

DROP TRIGGER IF EXISTS security_events_no_delete ON public.security_events;
CREATE TRIGGER security_events_no_delete
  BEFORE DELETE ON public.security_events
  FOR EACH ROW EXECUTE FUNCTION public.block_audit_mutation();

-- WHT trigger
DROP TRIGGER IF EXISTS invoices_wht_credit_note_reference_check ON public.invoices;
CREATE TRIGGER invoices_wht_credit_note_reference_check
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.validate_wht_credit_note_reference();

-- ------------------------------------------------------------------------------
-- 11. INDEXES FOR PERFORMANCE
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_requisitions_org_status ON public.requisitions(org_id, status);
CREATE INDEX IF NOT EXISTS idx_requisitions_project ON public.requisitions(project_id);
CREATE INDEX IF NOT EXISTS idx_approval_steps_req_status ON public.approval_steps(requisition_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_org_status ON public.purchase_orders(org_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_project ON public.purchase_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_delivery_receipts_org_po ON public.delivery_receipts(org_id, purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org_po ON public.invoices(org_id, purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_org_invoice ON public.payments(org_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_items_org_category ON public.items(org_id, category_id);
CREATE INDEX IF NOT EXISTS idx_cost_codes_project ON public.cost_codes(org_id, project_id);
CREATE INDEX IF NOT EXISTS idx_sites_project ON public.sites(org_id, project_id);
CREATE INDEX IF NOT EXISTS idx_action_tokens_hash ON public.secure_action_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_org ON public.billing_invoices (org_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON public.security_events (created_at DESC);

-- ------------------------------------------------------------------------------
-- 12. ROW LEVEL SECURITY (RLS) & GRANTS
-- ------------------------------------------------------------------------------

-- Enable RLS across all tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units_of_measure ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requisition_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ndpa_consent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.secure_action_tokens ENABLE ROW LEVEL SECURITY;

-- Schema Grants
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, supabase_auth_admin, postgres;

-- Grants to authenticated & service_role
GRANT SELECT, INSERT, UPDATE ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT ON public.platform_admins TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_invitations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units_of_measure TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_codes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.requisitions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.requisition_items TO authenticated;
GRANT SELECT, UPDATE ON public.approval_steps TO authenticated;
GRANT SELECT ON public.approval_audit_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.rfqs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rfq_invitations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.quotes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.quote_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.purchase_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.po_line_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.delivery_receipts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.delivery_receipt_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.invoice_items TO authenticated;
GRANT SELECT, INSERT ON public.payments TO authenticated;
GRANT SELECT ON public.billing_invoices TO authenticated;
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT SELECT ON public.security_events TO authenticated;
GRANT SELECT, INSERT ON public.ndpa_consent_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.secure_action_tokens TO authenticated;

-- Service Role & Auth Admin Privileges
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role, supabase_auth_admin, postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role, supabase_auth_admin, postgres;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role, supabase_auth_admin, postgres;

-- Function Execution Grants
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_budget_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_users_with_roles(uuid, public.app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_overdue_billing() TO service_role;

-- ------------------------------------------------------------------------------
-- 13. POLICIES
-- ------------------------------------------------------------------------------

-- Organizations
DROP POLICY IF EXISTS "org members read own org" ON public.organizations;
CREATE POLICY "org members read own org" ON public.organizations FOR SELECT TO authenticated USING (id = public.current_org_id() OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "admins update own org" ON public.organizations;
CREATE POLICY "admins update own org" ON public.organizations FOR UPDATE TO authenticated USING (id = public.current_org_id() AND public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "any user creates org" ON public.organizations;
CREATE POLICY "any user creates org" ON public.organizations FOR INSERT TO authenticated WITH CHECK (true);

-- Profiles
DROP POLICY IF EXISTS "read profiles in org" ON public.profiles;
CREATE POLICY "read profiles in org" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR org_id = public.current_org_id() OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "insert own profile" ON public.profiles;
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "update own profile" ON public.profiles;
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- User Roles
DROP POLICY IF EXISTS "read roles in org" ON public.user_roles;
CREATE POLICY "read roles in org" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR org_id = public.current_org_id() OR public.is_platform_admin(auth.uid()));

-- Platform Admins
DROP POLICY IF EXISTS "Users can see their own platform admin record" ON public.platform_admins;
CREATE POLICY "Users can see their own platform admin record" ON public.platform_admins FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

-- Org Invitations
DROP POLICY IF EXISTS "Org staff can view invitations" ON public.org_invitations;
CREATE POLICY "Org staff can view invitations" ON public.org_invitations FOR SELECT TO authenticated USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS "Invitee can view their own invitation" ON public.org_invitations;
CREATE POLICY "Invitee can view their own invitation" ON public.org_invitations FOR SELECT TO authenticated USING (lower(email) = lower(coalesce((auth.jwt() ->> 'email'), '')));

DROP POLICY IF EXISTS "Admins can create invitations" ON public.org_invitations;
CREATE POLICY "Admins can create invitations" ON public.org_invitations FOR INSERT TO authenticated WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update invitations" ON public.org_invitations;
CREATE POLICY "Admins can update invitations" ON public.org_invitations FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete invitations" ON public.org_invitations;
CREATE POLICY "Admins can delete invitations" ON public.org_invitations FOR DELETE TO authenticated USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));

-- Projects
DROP POLICY IF EXISTS "org reads projects" ON public.projects;
CREATE POLICY "org reads projects" ON public.projects FOR SELECT TO authenticated USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS "admins manage projects" ON public.projects;
CREATE POLICY "admins manage projects" ON public.projects FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['admin','procurement_officer']::public.app_role[]))
  WITH CHECK (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['admin','procurement_officer']::public.app_role[]));

-- Units of Measure
DROP POLICY IF EXISTS "org reads uoms" ON public.units_of_measure;
CREATE POLICY "org reads uoms" ON public.units_of_measure FOR SELECT TO authenticated USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS "procurement manages uoms" ON public.units_of_measure;
CREATE POLICY "procurement manages uoms" ON public.units_of_measure FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]))
  WITH CHECK (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));

-- Item Categories
DROP POLICY IF EXISTS "org reads item categories" ON public.item_categories;
CREATE POLICY "org reads item categories" ON public.item_categories FOR SELECT TO authenticated USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS "procurement manages item categories" ON public.item_categories;
CREATE POLICY "procurement manages item categories" ON public.item_categories FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]))
  WITH CHECK (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));

-- Items Master
DROP POLICY IF EXISTS "org reads items" ON public.items;
CREATE POLICY "org reads items" ON public.items FOR SELECT TO authenticated USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS "procurement manages items" ON public.items;
CREATE POLICY "procurement manages items" ON public.items FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]))
  WITH CHECK (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));

-- Sites
DROP POLICY IF EXISTS "org reads sites" ON public.sites;
CREATE POLICY "org reads sites" ON public.sites FOR SELECT TO authenticated USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS "admins manage sites" ON public.sites;
CREATE POLICY "admins manage sites" ON public.sites FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]))
  WITH CHECK (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));

-- Cost Codes
DROP POLICY IF EXISTS "org reads cost codes" ON public.cost_codes;
CREATE POLICY "org reads cost codes" ON public.cost_codes FOR SELECT TO authenticated USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS "finance manages cost codes" ON public.cost_codes;
CREATE POLICY "finance manages cost codes" ON public.cost_codes FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['finance','admin']::public.app_role[]))
  WITH CHECK (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['finance','admin']::public.app_role[]));

-- Approval Rules
DROP POLICY IF EXISTS "org reads rules" ON public.approval_rules;
CREATE POLICY "org reads rules" ON public.approval_rules FOR SELECT TO authenticated USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS "admins manage rules" ON public.approval_rules;
CREATE POLICY "admins manage rules" ON public.approval_rules FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(),'admin'));

-- Requisitions
DROP POLICY IF EXISTS "read requisitions" ON public.requisitions;
CREATE POLICY "read requisitions" ON public.requisitions FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() AND (requester_id = auth.uid() OR public.is_org_staff(auth.uid())) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "create own requisition" ON public.requisitions;
CREATE POLICY "create own requisition" ON public.requisitions FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND requester_id = auth.uid());

DROP POLICY IF EXISTS "update own draft requisition" ON public.requisitions;
CREATE POLICY "update own draft requisition" ON public.requisitions FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND (requester_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[])));

DROP POLICY IF EXISTS "delete own draft requisition" ON public.requisitions;
CREATE POLICY "delete own draft requisition" ON public.requisitions FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND requester_id = auth.uid() AND status = 'draft');

-- Requisition Items
DROP POLICY IF EXISTS "read req items" ON public.requisition_items;
CREATE POLICY "read req items" ON public.requisition_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.requisitions r WHERE r.id = requisition_id AND r.org_id = public.current_org_id() AND (r.requester_id = auth.uid() OR public.is_org_staff(auth.uid()))));

DROP POLICY IF EXISTS "manage own req items" ON public.requisition_items;
CREATE POLICY "manage own req items" ON public.requisition_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.requisitions r WHERE r.id = requisition_id AND r.org_id = public.current_org_id() AND r.requester_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.requisitions r WHERE r.id = requisition_id AND r.org_id = public.current_org_id() AND r.requester_id = auth.uid()));

-- Approval Steps
DROP POLICY IF EXISTS "read approval steps" ON public.approval_steps;
CREATE POLICY "read approval steps" ON public.approval_steps FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() AND (public.is_org_staff(auth.uid()) OR EXISTS (SELECT 1 FROM public.requisitions r WHERE r.id = requisition_id AND r.requester_id = auth.uid())));

DROP POLICY IF EXISTS "approver decides own step" ON public.approval_steps;
CREATE POLICY "approver decides own step" ON public.approval_steps FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND status = 'pending' AND public.has_role(auth.uid(), required_role))
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), required_role));

-- Audit Log
DROP POLICY IF EXISTS "org reads audit log" ON public.approval_audit_log;
CREATE POLICY "org reads audit log" ON public.approval_audit_log FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() OR public.is_platform_admin(auth.uid()));

-- Suppliers
DROP POLICY IF EXISTS "org reads suppliers" ON public.suppliers;
CREATE POLICY "org reads suppliers" ON public.suppliers FOR SELECT TO authenticated USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS "procurement manages suppliers" ON public.suppliers;
CREATE POLICY "procurement manages suppliers" ON public.suppliers FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]))
  WITH CHECK (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));

-- RFQs
DROP POLICY IF EXISTS "org reads rfqs" ON public.rfqs;
CREATE POLICY "org reads rfqs" ON public.rfqs FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "procurement manages rfqs" ON public.rfqs;
CREATE POLICY "procurement manages rfqs" ON public.rfqs FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]))
  WITH CHECK (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));

-- RFQ Invitations
DROP POLICY IF EXISTS "procurement reads invitations" ON public.rfq_invitations;
CREATE POLICY "procurement reads invitations" ON public.rfq_invitations FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));

DROP POLICY IF EXISTS "procurement manages invitations" ON public.rfq_invitations;
CREATE POLICY "procurement manages invitations" ON public.rfq_invitations FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]))
  WITH CHECK (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));

-- Quotes & Items
DROP POLICY IF EXISTS "org reads quotes" ON public.quotes;
CREATE POLICY "org reads quotes" ON public.quotes FOR SELECT TO authenticated USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS "procurement writes quotes" ON public.quotes;
CREATE POLICY "procurement writes quotes" ON public.quotes FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));

DROP POLICY IF EXISTS "procurement updates quotes" ON public.quotes;
CREATE POLICY "procurement updates quotes" ON public.quotes FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]))
  WITH CHECK (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));

DROP POLICY IF EXISTS "org reads quote items" ON public.quote_items;
CREATE POLICY "org reads quote items" ON public.quote_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND q.org_id = public.current_org_id()));

DROP POLICY IF EXISTS "procurement writes quote items" ON public.quote_items;
CREATE POLICY "procurement writes quote items" ON public.quote_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id AND q.org_id = public.current_org_id()) AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));

DROP POLICY IF EXISTS "procurement updates quote items" ON public.quote_items;
CREATE POLICY "procurement updates quote items" ON public.quote_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id AND q.org_id = public.current_org_id()) AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id AND q.org_id = public.current_org_id()) AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));

-- Purchase Orders & Items
DROP POLICY IF EXISTS "org reads pos" ON public.purchase_orders;
CREATE POLICY "org reads pos" ON public.purchase_orders FOR SELECT TO authenticated USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS "procurement writes pos" ON public.purchase_orders;
CREATE POLICY "procurement writes pos" ON public.purchase_orders FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));

DROP POLICY IF EXISTS "procurement updates pos" ON public.purchase_orders;
CREATE POLICY "procurement updates pos" ON public.purchase_orders FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]))
  WITH CHECK (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));

DROP POLICY IF EXISTS "org reads po items" ON public.po_line_items;
CREATE POLICY "org reads po items" ON public.po_line_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = purchase_order_id AND p.org_id = public.current_org_id()));

DROP POLICY IF EXISTS "procurement writes po items" ON public.po_line_items;
CREATE POLICY "procurement writes po items" ON public.po_line_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = po_line_items.purchase_order_id AND p.org_id = public.current_org_id()) AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));

DROP POLICY IF EXISTS "procurement updates po items" ON public.po_line_items;
CREATE POLICY "procurement updates po items" ON public.po_line_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = po_line_items.purchase_order_id AND p.org_id = public.current_org_id()) AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = po_line_items.purchase_order_id AND p.org_id = public.current_org_id()) AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));

-- Delivery Receipts
DROP POLICY IF EXISTS "Users can access org delivery_receipts" ON public.delivery_receipts;
CREATE POLICY "Users can access org delivery_receipts" ON public.delivery_receipts FOR ALL TO authenticated
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

DROP POLICY IF EXISTS "Users can access org delivery_receipt_items" ON public.delivery_receipt_items;
CREATE POLICY "Users can access org delivery_receipt_items" ON public.delivery_receipt_items FOR ALL TO authenticated
  USING (delivery_receipt_id IN (SELECT id FROM public.delivery_receipts WHERE org_id = public.current_org_id()))
  WITH CHECK (delivery_receipt_id IN (SELECT id FROM public.delivery_receipts WHERE org_id = public.current_org_id()));

-- Invoices & Invoice Items
DROP POLICY IF EXISTS "Users can access org invoices" ON public.invoices;
CREATE POLICY "Users can access org invoices" ON public.invoices FOR ALL TO authenticated
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

DROP POLICY IF EXISTS "Users can access org invoice_items" ON public.invoice_items;
CREATE POLICY "Users can access org invoice_items" ON public.invoice_items FOR ALL TO authenticated
  USING (invoice_id IN (SELECT id FROM public.invoices WHERE org_id = public.current_org_id()))
  WITH CHECK (invoice_id IN (SELECT id FROM public.invoices WHERE org_id = public.current_org_id()));

-- Payments
DROP POLICY IF EXISTS "Users can access org payments" ON public.payments;
CREATE POLICY "Users can access org payments" ON public.payments FOR ALL TO authenticated
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

-- Billing Invoices
DROP POLICY IF EXISTS "Platform staff can read billing invoices" ON public.billing_invoices;
CREATE POLICY "Platform staff can read billing invoices" ON public.billing_invoices FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- Notifications
DROP POLICY IF EXISTS "Users read their own notifications" ON public.notifications;
CREATE POLICY "Users read their own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users mark their own notifications read" ON public.notifications;
CREATE POLICY "Users mark their own notifications read" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Security Events
DROP POLICY IF EXISTS "Platform admins can read security events" ON public.security_events;
CREATE POLICY "Platform admins can read security events" ON public.security_events FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- NDPA Consent Logs
DROP POLICY IF EXISTS "Users can access org ndpa_consent_logs" ON public.ndpa_consent_logs;
CREATE POLICY "Users can access org ndpa_consent_logs" ON public.ndpa_consent_logs FOR ALL TO authenticated
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

-- Secure Action Tokens
DROP POLICY IF EXISTS "org reads action tokens" ON public.secure_action_tokens;
CREATE POLICY "org reads action tokens" ON public.secure_action_tokens FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

-- ------------------------------------------------------------------------------
-- 14. SUPABASE REALTIME BROADCASTING (LIVE PRODUCTION)
-- ------------------------------------------------------------------------------
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.requisitions;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.approval_steps;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rfqs;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.quotes;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_orders;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ------------------------------------------------------------------------------
-- 15. INITIAL PRODUCTION SEED DATA & VERIFICATION
-- ------------------------------------------------------------------------------

-- 1. Create Organization (Acme Infrastructure Ltd)
INSERT INTO public.organizations (id, name, base_currency, plan, status, primary_contact_email)
VALUES ('11111111-1111-1111-1111-111111111111', 'Acme Infrastructure Ltd', 'NGN', 'business', 'active', 'admin@procurely.com')
ON CONFLICT (id) DO UPDATE 
SET name = EXCLUDED.name, status = EXCLUDED.status;

-- 2. Create Project (Lekki Coastal Highway Tower A)
INSERT INTO public.projects (id, org_id, name, location, budget_amount)
VALUES ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Lekki Coastal Highway Tower A', 'Lekki Phase 1, Lagos', 150000000.00)
ON CONFLICT (id) DO NOTHING;

-- 3. Create Cost Codes
INSERT INTO public.cost_codes (org_id, project_id, code, description, allocated_amount, committed_amount, incurred_amount, currency)
VALUES 
    ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '01-FOUNDATION', 'Substructure, piling and foundation works', 45000000.00, 0, 0, 'NGN'),
    ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '02-SUPERSTRUCTURE', 'Reinforced concrete, columns and beams', 65000000.00, 0, 0, 'NGN'),
    ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '03-ELECTRICAL', 'Conduits, wiring, panels and switchgear', 20000000.00, 0, 0, 'NGN'),
    ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '04-PLUMBING', 'Piping, pumps and sanitary fittings', 20000000.00, 0, 0, 'NGN')
ON CONFLICT (org_id, project_id, code) DO NOTHING;

-- 4. Create Units of Measure & Item Categories
INSERT INTO public.units_of_measure (id, org_id, code, name, symbol)
VALUES 
    ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'BAG', '50kg Bag', 'bag'),
    ('44444444-4444-4444-4444-444444444445', '11111111-1111-1111-1111-111111111111', 'TON', 'Metric Ton', 'ton')
ON CONFLICT (org_id, code) DO NOTHING;

INSERT INTO public.item_categories (id, org_id, code, name, description)
VALUES 
    ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'CIVIL', 'Civil & Structural Works', 'Cement, rebar, aggregates and blockwork')
ON CONFLICT (org_id, code) DO NOTHING;

-- 5. Create Supplier
INSERT INTO public.suppliers (id, org_id, name, contact_name, email, phone, tax_id, is_compliant, rating)
VALUES (
    '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Dangote Cement & Building Supplies Plc',
    'Alhaji Musa Ibrahim', 'musa@dangotesupplies.com', '+2348031234567', 'TIN-23490812', true, 4.8
) ON CONFLICT (id) DO NOTHING;

-- 6. Create Catalog Item
INSERT INTO public.items (id, org_id, category_id, uom_id, sku, name, description, estimated_unit_price, currency, preferred_supplier_id, is_active)
VALUES (
    gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444',
    'MAT-CEM-001', 'Dangote Portland Cement 42.5R (50kg)',
    'Grade 42.5R high early strength cement for structural concrete', 8500.00, 'NGN', '33333333-3333-3333-3333-333333333333', true
) ON CONFLICT DO NOTHING;

-- 7. Create Approval Rules
INSERT INTO public.approval_rules (org_id, label, min_amount, max_amount, required_roles, approval_mode, sort_order, is_active)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'Standard Requisition (< ₦1,000,000)', 0, 1000000, ARRAY['approver']::public.app_role[], 'sequential', 1, true),
    ('11111111-1111-1111-1111-111111111111', 'Major Requisition (₦1,000,000 - ₦10,000,000)', 1000000, 10000000, ARRAY['approver','procurement_officer','finance']::public.app_role[], 'sequential', 2, true),
    ('11111111-1111-1111-1111-111111111111', 'Executive Threshold (> ₦10,000,000)', 10000000, NULL, ARRAY['approver','procurement_officer','finance','executive']::public.app_role[], 'sequential', 3, true)
ON CONFLICT DO NOTHING;

-- 8. Return Verification Table Summary
SELECT 'organizations' AS table_name, count(*) AS total_rows FROM public.organizations
UNION ALL SELECT 'projects', count(*) FROM public.projects
UNION ALL SELECT 'cost_codes', count(*) FROM public.cost_codes
UNION ALL SELECT 'units_of_measure', count(*) FROM public.units_of_measure
UNION ALL SELECT 'item_categories', count(*) FROM public.item_categories
UNION ALL SELECT 'suppliers', count(*) FROM public.suppliers
UNION ALL SELECT 'items', count(*) FROM public.items
UNION ALL SELECT 'approval_rules', count(*) FROM public.approval_rules;
