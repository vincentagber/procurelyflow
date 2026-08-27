-- Migration: 20260825080000_srs_core_entities.sql
-- Description: SRS Core Entities for Delivery Receipts, Invoices (NRS e-Invoicing UBL/PEPPOL BIS 3.0), Payments, NDPA Logs, and Performance Indexes

-- 1. Delivery Receipts & Inspection Records (FR-6)
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

CREATE TABLE IF NOT EXISTS public.delivery_receipt_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_receipt_id UUID NOT NULL REFERENCES public.delivery_receipts(id) ON DELETE CASCADE,
    po_item_id UUID REFERENCES public.purchase_order_items(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    quantity_delivered NUMERIC NOT NULL DEFAULT 0,
    quantity_accepted NUMERIC NOT NULL DEFAULT 0,
    quantity_rejected NUMERIC NOT NULL DEFAULT 0,
    rejection_reason TEXT
);

-- 2. Invoices & Three-Way Matching (FR-7 & NRS e-Invoicing compliance)
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
    -- NRS Merchant Buyer Solution (UBL / PEPPOL BIS 3.0) Fields
    seller_legal_name TEXT NOT NULL,
    seller_tin TEXT,
    buyer_legal_name TEXT NOT NULL,
    buyer_tin TEXT,
    irn TEXT,
    irn_clearance_status TEXT NOT NULL DEFAULT 'pending' CHECK (irn_clearance_status IN ('pending', 'cleared', 'flagged')),
    irn_cleared_at TIMESTAMPTZ,
    -- Three-Way Matching Status
    three_way_match_status TEXT NOT NULL DEFAULT 'pending' CHECK (three_way_match_status IN ('pending', 'matched', 'discrepancy_flagged')),
    match_discrepancies JSONB DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('draft', 'pending_approval', 'approved_for_payment', 'paid', 'rejected')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    po_item_id UUID REFERENCES public.purchase_order_items(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    quantity NUMERIC NOT NULL DEFAULT 1,
    unit_price NUMERIC NOT NULL DEFAULT 0,
    vat_rate NUMERIC NOT NULL DEFAULT 7.5,
    total_amount NUMERIC NOT NULL DEFAULT 0
);

-- 3. Payments (PO & Invoice Settlements)
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

-- 4. NDPA 2023 Compliance Consent & Audit Logs
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

-- 5. Performance Indexing for Common Tenant Queries (NFR-PERF.1)
CREATE INDEX IF NOT EXISTS idx_requisitions_org_status ON public.requisitions(org_id, status);
CREATE INDEX IF NOT EXISTS idx_requisitions_project ON public.requisitions(project_id);
CREATE INDEX IF NOT EXISTS idx_approval_steps_req_status ON public.approval_steps(requisition_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_org_status ON public.purchase_orders(org_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_project ON public.purchase_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_delivery_receipts_org_po ON public.delivery_receipts(org_id, purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org_po ON public.invoices(org_id, purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_org_invoice ON public.payments(org_id, invoice_id);

-- 6. Row Level Security (RLS) Policies
ALTER TABLE public.delivery_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ndpa_consent_logs ENABLE ROW LEVEL SECURITY;

-- Helper policies matching org_id access
CREATE POLICY "Users can access org delivery_receipts" ON public.delivery_receipts
    FOR ALL USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can access org delivery_receipt_items" ON public.delivery_receipt_items
    FOR ALL USING (delivery_receipt_id IN (SELECT id FROM public.delivery_receipts WHERE org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())));

CREATE POLICY "Users can access org invoices" ON public.invoices
    FOR ALL USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can access org invoice_items" ON public.invoice_items
    FOR ALL USING (invoice_id IN (SELECT id FROM public.invoices WHERE org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())));

CREATE POLICY "Users can access org payments" ON public.payments
    FOR ALL USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can access org ndpa_consent_logs" ON public.ndpa_consent_logs
    FOR ALL USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
