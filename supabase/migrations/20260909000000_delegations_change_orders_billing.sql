-- Migration: 20260909000000_delegations_change_orders_billing.sql
-- Description: Adds Requisition Delivery Location, Approval Delegations (FR-2.6), PO Change Orders (FR-5.4), and Tenant B2B Subscriptions (NFR-LOC.2).

-- 1. Requisition Delivery Location (FR-1.1)
ALTER TABLE public.requisitions
    ADD COLUMN IF NOT EXISTS delivery_location TEXT;

-- 2. PO Revision columns for Baseline Preservation (FR-5.4)
ALTER TABLE public.purchase_orders
    ADD COLUMN IF NOT EXISTS revision_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS baseline_po_number TEXT;

-- 3. Approval Delegations (FR-2.6)
CREATE TABLE IF NOT EXISTS public.approval_delegations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    delegator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    substitute_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delegations_org_substitute ON public.approval_delegations(org_id, substitute_id, status);
CREATE INDEX IF NOT EXISTS idx_delegations_org_delegator ON public.approval_delegations(org_id, delegator_id);

ALTER TABLE public.approval_delegations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read delegations" ON public.approval_delegations
    FOR SELECT TO authenticated
    USING (org_id = public.current_org_id());

CREATE POLICY "users create own delegations" ON public.approval_delegations
    FOR INSERT TO authenticated
    WITH CHECK (org_id = public.current_org_id() AND (delegator_id = auth.uid() OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY "users update own delegations" ON public.approval_delegations
    FOR UPDATE TO authenticated
    USING (org_id = public.current_org_id() AND (delegator_id = auth.uid() OR public.has_role(auth.uid(), 'admin')));

-- 4. PO Change Orders (FR-5.4)
CREATE TABLE IF NOT EXISTS public.po_change_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    revision_number INT NOT NULL DEFAULT 1,
    revised_po_number TEXT NOT NULL,
    previous_total_amount NUMERIC(16,2) NOT NULL,
    new_total_amount NUMERIC(16,2) NOT NULL,
    delta_amount NUMERIC(16,2) NOT NULL,
    currency public.currency_code NOT NULL DEFAULT 'NGN',
    reason TEXT NOT NULL,
    requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    modified_items JSONB DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('pending', 'applied', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_change_orders_po ON public.po_change_orders(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_org ON public.po_change_orders(org_id);

ALTER TABLE public.po_change_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read change orders" ON public.po_change_orders
    FOR SELECT TO authenticated
    USING (org_id = public.current_org_id());

CREATE POLICY "procurement creates change orders" ON public.po_change_orders
    FOR INSERT TO authenticated
    WITH CHECK (
        org_id = public.current_org_id() AND 
        public.has_any_role(auth.uid(), ARRAY['procurement_officer', 'finance', 'admin']::public.app_role[])
    );

-- 5. Tenant Subscriptions & Dedicated Virtual Account Statements (NFR-LOC.2)
CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    invoice_reference TEXT NOT NULL UNIQUE,
    plan_tier TEXT NOT NULL DEFAULT 'GROWTH' CHECK (plan_tier IN ('STARTER', 'GROWTH', 'BUSINESS', 'ENTERPRISE')),
    billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')),
    amount_ngn NUMERIC(16,2) NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'VIRTUAL_ACCOUNT' CHECK (payment_method IN ('VIRTUAL_ACCOUNT', 'BANK_TRANSFER', 'INVOICE_BILLING')),
    virtual_account_bank TEXT,
    virtual_account_number TEXT,
    virtual_account_name TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SETTLED', 'OVERDUE')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    cleared_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_org ON public.tenant_subscriptions(org_id);

ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read subscriptions" ON public.tenant_subscriptions
    FOR SELECT TO authenticated
    USING (org_id = public.current_org_id());

CREATE POLICY "admins manage subscriptions" ON public.tenant_subscriptions
    FOR ALL TO authenticated
    USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
    WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));
