-- Migration: 20260827130000_production_procurement_master.sql
-- Description: Production Master Schema for Item Master, Cost Codes, Budget Lines, Secure Action Tokens, Proxy Quotes, and Tamper-Evident Audit Chaining.

-- 1. Units of Measure
CREATE TABLE IF NOT EXISTS public.units_of_measure (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    code TEXT NOT NULL, -- e.g. 'BAG', 'TON', 'M3', 'PCS', 'LTR', 'HR', 'SET'
    name TEXT NOT NULL,
    symbol TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, code)
);

-- 2. Item Master Categories
CREATE TABLE IF NOT EXISTS public.item_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    code TEXT NOT NULL, -- e.g. 'CIVIL', 'ELEC', 'PLUMB', 'MECH', 'FINISH', 'EQUIP'
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, code)
);

-- 3. Item Master Catalog
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

-- 4. Sites (Independent multi-site entities under projects)
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

-- 5. Cost Codes & Budget Allocation Lines
CREATE TABLE IF NOT EXISTS public.cost_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    code TEXT NOT NULL, -- e.g. '01-FOUNDATION', '02-SUPERSTRUCTURE', '03-ELECTRICAL'
    description TEXT NOT NULL,
    allocated_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
    committed_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
    incurred_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
    currency public.currency_code NOT NULL DEFAULT 'NGN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, project_id, code)
);

-- 6. Secure Action Tokens (for 1-click WhatsApp / Email approvals and secure supplier actions)
CREATE TABLE IF NOT EXISTS public.secure_action_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE, -- SHA-256 hash of random token
    action_type TEXT NOT NULL CHECK (action_type IN ('approve_requisition', 'reject_requisition', 'submit_quote', 'acknowledge_po')),
    entity_type TEXT NOT NULL CHECK (entity_type IN ('requisition', 'approval_step', 'rfq', 'purchase_order')),
    entity_id UUID NOT NULL,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_identifier TEXT NOT NULL, -- Email or WhatsApp phone number
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Add foreign keys and new columns to existing tables
ALTER TABLE public.requisition_items
    ADD COLUMN IF NOT EXISTS item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS cost_code_id UUID REFERENCES public.cost_codes(id) ON DELETE SET NULL;

ALTER TABLE public.po_line_items
    ADD COLUMN IF NOT EXISTS item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS cost_code_id UUID REFERENCES public.cost_codes(id) ON DELETE SET NULL;

ALTER TABLE public.quotes
    ADD COLUMN IF NOT EXISTS is_proxy BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS proxy_entered_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS proxy_source TEXT CHECK (proxy_source IN ('whatsapp_message', 'phone_call', 'physical_document', 'email', 'other')),
    ADD COLUMN IF NOT EXISTS proxy_evidence_url TEXT,
    ADD COLUMN IF NOT EXISTS proxy_notes TEXT,
    ADD COLUMN IF NOT EXISTS valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS valid_until DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '14 days');

-- 8. Add Cryptographic Hash Chain columns to approval_audit_log
ALTER TABLE public.approval_audit_log
    ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'LEGACY_EVENT',
    ADD COLUMN IF NOT EXISTS entity_type TEXT NOT NULL DEFAULT 'requisition',
    ADD COLUMN IF NOT EXISTS entity_id TEXT,
    ADD COLUMN IF NOT EXISTS payload_hash TEXT,
    ADD COLUMN IF NOT EXISTS previous_hash TEXT;

-- 9. Row Level Security Policies for Master Tables
ALTER TABLE public.units_of_measure ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.secure_action_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org reads uoms" ON public.units_of_measure FOR SELECT TO authenticated USING (org_id = public.current_org_id());
CREATE POLICY "procurement manages uoms" ON public.units_of_measure FOR ALL TO authenticated
    USING (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]))
    WITH CHECK (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));

CREATE POLICY "org reads item categories" ON public.item_categories FOR SELECT TO authenticated USING (org_id = public.current_org_id());
CREATE POLICY "procurement manages item categories" ON public.item_categories FOR ALL TO authenticated
    USING (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]))
    WITH CHECK (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));

CREATE POLICY "org reads items" ON public.items FOR SELECT TO authenticated USING (org_id = public.current_org_id());
CREATE POLICY "procurement manages items" ON public.items FOR ALL TO authenticated
    USING (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]))
    WITH CHECK (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));

CREATE POLICY "org reads sites" ON public.sites FOR SELECT TO authenticated USING (org_id = public.current_org_id());
CREATE POLICY "admins manage sites" ON public.sites FOR ALL TO authenticated
    USING (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]))
    WITH CHECK (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));

CREATE POLICY "org reads cost codes" ON public.cost_codes FOR SELECT TO authenticated USING (org_id = public.current_org_id());
CREATE POLICY "finance manages cost codes" ON public.cost_codes FOR ALL TO authenticated
    USING (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['finance','admin']::public.app_role[]))
    WITH CHECK (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['finance','admin']::public.app_role[]));

-- 10. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_items_org_category ON public.items(org_id, category_id);
CREATE INDEX IF NOT EXISTS idx_cost_codes_project ON public.cost_codes(org_id, project_id);
CREATE INDEX IF NOT EXISTS idx_sites_project ON public.sites(org_id, project_id);
CREATE INDEX IF NOT EXISTS idx_action_tokens_hash ON public.secure_action_tokens(token_hash);
