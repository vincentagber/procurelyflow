-- Migration: 20260920140000_performance_security_indexes.sql
-- Description: Database & Performance Scaling (Phase 3)
--   1. Optimize RLS policies across all tables using (SELECT ...) subqueries for scalar caching.
--   2. Index missing foreign keys on high-churn tables to prevent full-table scans on JOIN/DELETE CASCADE.
--   3. Concurrency-safe sequential PO numbering with org_po_sequences table, RPC, and UNIQUE constraint.
--   4. Trigger-based atomic audit hash chaining with pg_advisory_xact_lock to prevent ledger forks under concurrent writes.

-- ==============================================================================
-- 1. FOREIGN KEY INDEXES ON HIGH-CHURN TABLES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_requisition_items_requisition_id ON public.requisition_items(requisition_id);
CREATE INDEX IF NOT EXISTS idx_po_line_items_po_id ON public.po_line_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_receipt_items_receipt_id ON public.delivery_receipt_items(delivery_receipt_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote_id ON public.quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_quotes_rfq_id ON public.quotes(rfq_id);
CREATE INDEX IF NOT EXISTS idx_quotes_supplier_id ON public.quotes(supplier_id);
CREATE INDEX IF NOT EXISTS idx_rfq_invitations_rfq_id ON public.rfq_invitations(rfq_id);
CREATE INDEX IF NOT EXISTS idx_approval_audit_log_requisition_id ON public.approval_audit_log(requisition_id);
CREATE INDEX IF NOT EXISTS idx_approval_steps_requisition_id ON public.approval_steps(requisition_id);
CREATE INDEX IF NOT EXISTS idx_invoices_purchase_order_id ON public.invoices(purchase_order_id);

-- ==============================================================================
-- 2. CONCURRENCY-SAFE PO NUMBERING ENGINE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.org_po_sequences (
    org_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    last_sequence_number BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backfill sequences from existing purchase orders
INSERT INTO public.org_po_sequences (org_id, last_sequence_number, updated_at)
SELECT org_id, count(*), NOW()
FROM public.purchase_orders
GROUP BY org_id
ON CONFLICT (org_id) DO UPDATE
SET last_sequence_number = GREATEST(org_po_sequences.last_sequence_number, EXCLUDED.last_sequence_number);

-- Enforce uniqueness of PO numbers per organization
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_purchase_orders_org_po'
    ) THEN
        ALTER TABLE public.purchase_orders ADD CONSTRAINT uq_purchase_orders_org_po UNIQUE (org_id, po_number);
    END IF;
END;
$$;

-- Atomic PO sequence generator with row-level locking
CREATE OR REPLACE FUNCTION public.next_po_number(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_seq BIGINT;
    v_year TEXT := to_char(NOW(), 'YYYY');
BEGIN
    INSERT INTO public.org_po_sequences (org_id, last_sequence_number, updated_at)
    VALUES (p_org_id, 1, NOW())
    ON CONFLICT (org_id) DO UPDATE
    SET last_sequence_number = org_po_sequences.last_sequence_number + 1,
        updated_at = NOW()
    RETURNING last_sequence_number INTO v_seq;

    RETURN 'PO-' || v_year || '-' || lpad(v_seq::text, 6, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_po_number(UUID) TO authenticated, service_role;

-- ==============================================================================
-- 3. ATOMIC AUDIT HASH CHAINING TRIGGER (ADVISORY LOCKING)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.fn_audit_log_hash_chain()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_prev_hash TEXT;
    v_chain_payload TEXT;
BEGIN
    -- Advisory transaction lock prevents concurrent hash forks per tenant org
    PERFORM pg_advisory_xact_lock(hashtext('audit_log_' || NEW.org_id::text));

    -- Select the latest hash for this tenant org
    SELECT payload_hash INTO v_prev_hash
    FROM public.approval_audit_log
    WHERE org_id = NEW.org_id
    ORDER BY created_at DESC, id DESC
    LIMIT 1;

    IF v_prev_hash IS NULL THEN
        v_prev_hash := '0000000000000000000000000000000000000000000000000000000000000000';
    END IF;

    NEW.previous_hash := v_prev_hash;

    -- Build cryptographic hash over event payload and unbroken parent hash
    v_chain_payload := coalesce(NEW.org_id::text, '') || '|' ||
                       coalesce(NEW.actor_id::text, '') || '|' ||
                       coalesce(NEW.actor_name, '') || '|' ||
                       coalesce(NEW.event_type, '') || '|' ||
                       coalesce(NEW.entity_type, '') || '|' ||
                       coalesce(NEW.entity_id::text, '') || '|' ||
                       coalesce(NEW.amount::text, '0') || '|' ||
                       v_prev_hash;

    NEW.payload_hash := encode(sha256(v_chain_payload::bytea), 'hex');

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_log_hash_chain ON public.approval_audit_log;
CREATE TRIGGER trg_audit_log_hash_chain
    BEFORE INSERT ON public.approval_audit_log
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_audit_log_hash_chain();

-- ==============================================================================
-- 4. OPTIMIZE ROW-LEVEL SECURITY (RLS) POLICIES FOR HIGH QUERY PERFORMANCE
--    Wrap current_org_id() and auth.uid() in (SELECT ...) for InitPlan scalar caching.
-- ==============================================================================

-- Organizations
DROP POLICY IF EXISTS "org members read own org" ON public.organizations;
CREATE POLICY "org members read own org" ON public.organizations
    FOR SELECT TO authenticated
    USING (id = (SELECT public.current_org_id()) OR public.is_platform_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "admins update own org" ON public.organizations;
CREATE POLICY "admins update own org" ON public.organizations
    FOR UPDATE TO authenticated
    USING (id = (SELECT public.current_org_id()) AND public.has_role((SELECT auth.uid()), 'admin'));

-- Profiles
DROP POLICY IF EXISTS "read profiles in org" ON public.profiles;
CREATE POLICY "read profiles in org" ON public.profiles
    FOR SELECT TO authenticated
    USING (id = (SELECT auth.uid()) OR org_id = (SELECT public.current_org_id()) OR public.is_platform_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "insert own profile" ON public.profiles;
CREATE POLICY "insert own profile" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "update own profile" ON public.profiles;
CREATE POLICY "update own profile" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = (SELECT auth.uid()));

-- User Roles
DROP POLICY IF EXISTS "read roles in org" ON public.user_roles;
CREATE POLICY "read roles in org" ON public.user_roles
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()) OR org_id = (SELECT public.current_org_id()) OR public.is_platform_admin((SELECT auth.uid())));

-- Platform Admins
DROP POLICY IF EXISTS "Users can see their own platform admin record" ON public.platform_admins;
CREATE POLICY "Users can see their own platform admin record" ON public.platform_admins
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()) OR public.is_platform_admin((SELECT auth.uid())));

-- Org Invitations
DROP POLICY IF EXISTS "Org staff can view invitations" ON public.org_invitations;
CREATE POLICY "Org staff can view invitations" ON public.org_invitations
    FOR SELECT TO authenticated
    USING (org_id = (SELECT public.current_org_id()));

DROP POLICY IF EXISTS "Admins can create invitations" ON public.org_invitations;
CREATE POLICY "Admins can create invitations" ON public.org_invitations
    FOR INSERT TO authenticated
    WITH CHECK (org_id = (SELECT public.current_org_id()) AND public.has_role((SELECT auth.uid()), 'admin'));

DROP POLICY IF EXISTS "Admins can update invitations" ON public.org_invitations;
CREATE POLICY "Admins can update invitations" ON public.org_invitations
    FOR UPDATE TO authenticated
    USING (org_id = (SELECT public.current_org_id()) AND public.has_role((SELECT auth.uid()), 'admin'))
    WITH CHECK (org_id = (SELECT public.current_org_id()) AND public.has_role((SELECT auth.uid()), 'admin'));

DROP POLICY IF EXISTS "Admins can delete invitations" ON public.org_invitations;
CREATE POLICY "Admins can delete invitations" ON public.org_invitations
    FOR DELETE TO authenticated
    USING (org_id = (SELECT public.current_org_id()) AND public.has_role((SELECT auth.uid()), 'admin'));

-- Projects
DROP POLICY IF EXISTS "org reads projects" ON public.projects;
CREATE POLICY "org reads projects" ON public.projects
    FOR SELECT TO authenticated
    USING (org_id = (SELECT public.current_org_id()));

DROP POLICY IF EXISTS "admins manage projects" ON public.projects;
CREATE POLICY "admins manage projects" ON public.projects
    FOR ALL TO authenticated
    USING (org_id = (SELECT public.current_org_id()) AND public.has_any_role((SELECT auth.uid()), ARRAY['admin','procurement_officer']::public.app_role[]))
    WITH CHECK (org_id = (SELECT public.current_org_id()) AND public.has_any_role((SELECT auth.uid()), ARRAY['admin','procurement_officer']::public.app_role[]));

-- Units of Measure
DROP POLICY IF EXISTS "org reads uoms" ON public.units_of_measure;
CREATE POLICY "org reads uoms" ON public.units_of_measure
    FOR SELECT TO authenticated
    USING (org_id = (SELECT public.current_org_id()));

DROP POLICY IF EXISTS "procurement manages uoms" ON public.units_of_measure;
CREATE POLICY "procurement manages uoms" ON public.units_of_measure
    FOR ALL TO authenticated
    USING (org_id = (SELECT public.current_org_id()) AND public.has_any_role((SELECT auth.uid()), ARRAY['procurement_officer','admin']::public.app_role[]))
    WITH CHECK (org_id = (SELECT public.current_org_id()) AND public.has_any_role((SELECT auth.uid()), ARRAY['procurement_officer','admin']::public.app_role[]));

-- Item Categories
DROP POLICY IF EXISTS "org reads item categories" ON public.item_categories;
CREATE POLICY "org reads item categories" ON public.item_categories
    FOR SELECT TO authenticated
    USING (org_id = (SELECT public.current_org_id()));

DROP POLICY IF EXISTS "procurement manages item categories" ON public.item_categories;
CREATE POLICY "procurement manages item categories" ON public.item_categories
    FOR ALL TO authenticated
    USING (org_id = (SELECT public.current_org_id()) AND public.has_any_role((SELECT auth.uid()), ARRAY['procurement_officer','admin']::public.app_role[]))
    WITH CHECK (org_id = (SELECT public.current_org_id()) AND public.has_any_role((SELECT auth.uid()), ARRAY['procurement_officer','admin']::public.app_role[]));

-- Items Master
DROP POLICY IF EXISTS "org reads items" ON public.items;
CREATE POLICY "org reads items" ON public.items
    FOR SELECT TO authenticated
    USING (org_id = (SELECT public.current_org_id()));

DROP POLICY IF EXISTS "procurement manages items" ON public.items;
CREATE POLICY "procurement manages items" ON public.items
    FOR ALL TO authenticated
    USING (org_id = (SELECT public.current_org_id()) AND public.has_any_role((SELECT auth.uid()), ARRAY['procurement_officer','admin']::public.app_role[]))
    WITH CHECK (org_id = (SELECT public.current_org_id()) AND public.has_any_role((SELECT auth.uid()), ARRAY['procurement_officer','admin']::public.app_role[]));

-- Sites
DROP POLICY IF EXISTS "org reads sites" ON public.sites;
CREATE POLICY "org reads sites" ON public.sites
    FOR SELECT TO authenticated
    USING (org_id = (SELECT public.current_org_id()));

DROP POLICY IF EXISTS "admins manage sites" ON public.sites;
CREATE POLICY "admins manage sites" ON public.sites
    FOR ALL TO authenticated
    USING (org_id = (SELECT public.current_org_id()) AND public.has_any_role((SELECT auth.uid()), ARRAY['procurement_officer','admin']::public.app_role[]))
    WITH CHECK (org_id = (SELECT public.current_org_id()) AND public.has_any_role((SELECT auth.uid()), ARRAY['procurement_officer','admin']::public.app_role[]));

-- Cost Codes
DROP POLICY IF EXISTS "org reads cost codes" ON public.cost_codes;
CREATE POLICY "org reads cost codes" ON public.cost_codes
    FOR SELECT TO authenticated
    USING (org_id = (SELECT public.current_org_id()));

DROP POLICY IF EXISTS "finance manages cost codes" ON public.cost_codes;
CREATE POLICY "finance manages cost codes" ON public.cost_codes
    FOR ALL TO authenticated
    USING (org_id = (SELECT public.current_org_id()) AND public.has_any_role((SELECT auth.uid()), ARRAY['finance','admin']::public.app_role[]))
    WITH CHECK (org_id = (SELECT public.current_org_id()) AND public.has_any_role((SELECT auth.uid()), ARRAY['finance','admin']::public.app_role[]));

-- Approval Rules
DROP POLICY IF EXISTS "org reads rules" ON public.approval_rules;
CREATE POLICY "org reads rules" ON public.approval_rules
    FOR SELECT TO authenticated
    USING (org_id = (SELECT public.current_org_id()));

DROP POLICY IF EXISTS "admins manage rules" ON public.approval_rules;
CREATE POLICY "admins manage rules" ON public.approval_rules
    FOR ALL TO authenticated
    USING (org_id = (SELECT public.current_org_id()) AND public.has_role((SELECT auth.uid()),'admin'))
    WITH CHECK (org_id = (SELECT public.current_org_id()) AND public.has_role((SELECT auth.uid()),'admin'));

-- Requisitions
DROP POLICY IF EXISTS "read requisitions" ON public.requisitions;
CREATE POLICY "read requisitions" ON public.requisitions
    FOR SELECT TO authenticated
    USING ((org_id = (SELECT public.current_org_id()) AND (requester_id = (SELECT auth.uid()) OR public.is_org_staff((SELECT auth.uid())))) OR public.is_platform_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "create own requisition" ON public.requisitions;
CREATE POLICY "create own requisition" ON public.requisitions
    FOR INSERT TO authenticated
    WITH CHECK (org_id = (SELECT public.current_org_id()) AND requester_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "update own draft requisition" ON public.requisitions;
CREATE POLICY "update own draft requisition" ON public.requisitions
    FOR UPDATE TO authenticated
    USING (org_id = (SELECT public.current_org_id()) AND (requester_id = (SELECT auth.uid()) OR public.has_any_role((SELECT auth.uid()), ARRAY['procurement_officer','admin']::public.app_role[])));

DROP POLICY IF EXISTS "delete own draft requisition" ON public.requisitions;
CREATE POLICY "delete own draft requisition" ON public.requisitions
    FOR DELETE TO authenticated
    USING (org_id = (SELECT public.current_org_id()) AND requester_id = (SELECT auth.uid()) AND status = 'draft');

-- Requisition Items
DROP POLICY IF EXISTS "read req items" ON public.requisition_items;
CREATE POLICY "read req items" ON public.requisition_items
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.requisitions r WHERE r.id = requisition_id AND r.org_id = (SELECT public.current_org_id()) AND (r.requester_id = (SELECT auth.uid()) OR public.is_org_staff((SELECT auth.uid())))));

DROP POLICY IF EXISTS "manage own req items" ON public.requisition_items;
CREATE POLICY "manage own req items" ON public.requisition_items
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.requisitions r WHERE r.id = requisition_id AND r.org_id = (SELECT public.current_org_id()) AND r.requester_id = (SELECT auth.uid())))
    WITH CHECK (EXISTS (SELECT 1 FROM public.requisitions r WHERE r.id = requisition_id AND r.org_id = (SELECT public.current_org_id()) AND r.requester_id = (SELECT auth.uid())));

-- Approval Steps
DROP POLICY IF EXISTS "read approval steps" ON public.approval_steps;
CREATE POLICY "read approval steps" ON public.approval_steps
    FOR SELECT TO authenticated
    USING (org_id = (SELECT public.current_org_id()) AND (public.is_org_staff((SELECT auth.uid())) OR EXISTS (SELECT 1 FROM public.requisitions r WHERE r.id = requisition_id AND r.requester_id = (SELECT auth.uid()))));

DROP POLICY IF EXISTS "approver decides own step" ON public.approval_steps;
CREATE POLICY "approver decides own step" ON public.approval_steps
    FOR UPDATE TO authenticated
    USING (org_id = (SELECT public.current_org_id()) AND status = 'pending' AND public.has_role((SELECT auth.uid()), required_role))
    WITH CHECK (org_id = (SELECT public.current_org_id()) AND public.has_role((SELECT auth.uid()), required_role));

-- Audit Log
DROP POLICY IF EXISTS "org reads audit log" ON public.approval_audit_log;
CREATE POLICY "org reads audit log" ON public.approval_audit_log
    FOR SELECT TO authenticated
    USING (org_id = (SELECT public.current_org_id()) OR public.is_platform_admin((SELECT auth.uid())));

-- Suppliers
DROP POLICY IF EXISTS "org reads suppliers" ON public.suppliers;
CREATE POLICY "org reads suppliers" ON public.suppliers
    FOR SELECT TO authenticated
    USING (org_id = (SELECT public.current_org_id()));

DROP POLICY IF EXISTS "procurement manages suppliers" ON public.suppliers;
CREATE POLICY "procurement manages suppliers" ON public.suppliers
    FOR ALL TO authenticated
    USING (org_id = (SELECT public.current_org_id()) AND public.has_any_role((SELECT auth.uid()), ARRAY['procurement_officer','admin']::public.app_role[]))
    WITH CHECK (org_id = (SELECT public.current_org_id()) AND public.has_any_role((SELECT auth.uid()), ARRAY['procurement_officer','admin']::public.app_role[]));

-- RFQs
DROP POLICY IF EXISTS "org reads rfqs" ON public.rfqs;
CREATE POLICY "org reads rfqs" ON public.rfqs
    FOR SELECT TO authenticated
    USING (org_id = (SELECT public.current_org_id()) OR public.is_platform_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "procurement manages rfqs" ON public.rfqs;
CREATE POLICY "procurement manages rfqs" ON public.rfqs
    FOR ALL TO authenticated
    USING (org_id = (SELECT public.current_org_id()) AND public.has_any_role((SELECT auth.uid()), ARRAY['procurement_officer','admin']::public.app_role[]))
    WITH CHECK (org_id = (SELECT public.current_org_id()) AND public.has_any_role((SELECT auth.uid()), ARRAY['procurement_officer','admin']::public.app_role[]));

-- RFQ Invitations
DROP POLICY IF EXISTS "procurement reads invitations" ON public.rfq_invitations;
CREATE POLICY "procurement reads invitations" ON public.rfq_invitations
    FOR SELECT TO authenticated
    USING (org_id = (SELECT public.current_org_id()) AND public.has_any_role((SELECT auth.uid()), ARRAY['procurement_officer','admin']::public.app_role[]));

DROP POLICY IF EXISTS "procurement manages invitations" ON public.rfq_invitations;
CREATE POLICY "procurement manages invitations" ON public.rfq_invitations
    FOR ALL TO authenticated
    USING (org_id = (SELECT public.current_org_id()) AND public.has_any_role((SELECT auth.uid()), ARRAY['procurement_officer','admin']::public.app_role[]))
    WITH CHECK (org_id = (SELECT public.current_org_id()) AND public.has_any_role((SELECT auth.uid()), ARRAY['procurement_officer','admin']::public.app_role[]));

-- Quotes & Items
DROP POLICY IF EXISTS "org reads quotes" ON public.quotes;
CREATE POLICY "org reads quotes" ON public.quotes
    FOR SELECT TO authenticated
    USING (org_id = (SELECT public.current_org_id()));

DROP POLICY IF EXISTS "procurement writes quotes" ON public.quotes;
CREATE POLICY "procurement writes quotes" ON public.quotes
    FOR INSERT TO authenticated
    WITH CHECK (org_id = (SELECT public.current_org_id()) AND public.has_any_role((SELECT auth.uid()), ARRAY['procurement_officer','admin']::public.app_role[]));

DROP POLICY IF EXISTS "procurement updates quotes" ON public.quotes;
CREATE POLICY "procurement updates quotes" ON public.quotes
    FOR UPDATE TO authenticated
    USING (org_id = (SELECT public.current_org_id()) AND public.has_any_role((SELECT auth.uid()), ARRAY['procurement_officer','admin']::public.app_role[]))
    WITH CHECK (org_id = (SELECT public.current_org_id()) AND public.has_any_role((SELECT auth.uid()), ARRAY['procurement_officer','admin']::public.app_role[]));

DROP POLICY IF EXISTS "org reads quote items" ON public.quote_items;
CREATE POLICY "org reads quote items" ON public.quote_items
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND q.org_id = (SELECT public.current_org_id())));

DROP POLICY IF EXISTS "procurement writes quote items" ON public.quote_items;
CREATE POLICY "procurement writes quote items" ON public.quote_items
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id AND q.org_id = (SELECT public.current_org_id())) AND public.has_any_role((SELECT auth.uid()), ARRAY['procurement_officer','admin']::public.app_role[]));

DROP POLICY IF EXISTS "procurement updates quote items" ON public.quote_items;
CREATE POLICY "procurement updates quote items" ON public.quote_items
    FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id AND q.org_id = (SELECT public.current_org_id())) AND public.has_any_role((SELECT auth.uid()), ARRAY['procurement_officer','admin']::public.app_role[]))
    WITH CHECK (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id AND q.org_id = (SELECT public.current_org_id())) AND public.has_any_role((SELECT auth.uid()), ARRAY['procurement_officer','admin']::public.app_role[]));

-- Purchase Orders & Items
DROP POLICY IF EXISTS "org reads pos" ON public.purchase_orders;
CREATE POLICY "org reads pos" ON public.purchase_orders
    FOR SELECT TO authenticated
    USING (org_id = (SELECT public.current_org_id()));

DROP POLICY IF EXISTS "procurement writes pos" ON public.purchase_orders;
CREATE POLICY "procurement writes pos" ON public.purchase_orders
    FOR INSERT TO authenticated
    WITH CHECK (org_id = (SELECT public.current_org_id()) AND public.has_any_role((SELECT auth.uid()), ARRAY['procurement_officer','admin']::public.app_role[]));

DROP POLICY IF EXISTS "procurement updates pos" ON public.purchase_orders;
CREATE POLICY "procurement updates pos" ON public.purchase_orders
    FOR UPDATE TO authenticated
    USING (org_id = (SELECT public.current_org_id()) AND public.has_any_role((SELECT auth.uid()), ARRAY['procurement_officer','admin']::public.app_role[]))
    WITH CHECK (org_id = (SELECT public.current_org_id()) AND public.has_any_role((SELECT auth.uid()), ARRAY['procurement_officer','admin']::public.app_role[]));

DROP POLICY IF EXISTS "org reads po items" ON public.po_line_items;
CREATE POLICY "org reads po items" ON public.po_line_items
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = purchase_order_id AND p.org_id = (SELECT public.current_org_id())));

DROP POLICY IF EXISTS "procurement writes po items" ON public.po_line_items;
CREATE POLICY "procurement writes po items" ON public.po_line_items
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = po_line_items.purchase_order_id AND p.org_id = (SELECT public.current_org_id())) AND public.has_any_role((SELECT auth.uid()), ARRAY['procurement_officer','admin']::public.app_role[]));

DROP POLICY IF EXISTS "procurement updates po items" ON public.po_line_items;
CREATE POLICY "procurement updates po items" ON public.po_line_items
    FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = po_line_items.purchase_order_id AND p.org_id = (SELECT public.current_org_id())) AND public.has_any_role((SELECT auth.uid()), ARRAY['procurement_officer','admin']::public.app_role[]))
    WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = po_line_items.purchase_order_id AND p.org_id = (SELECT public.current_org_id())) AND public.has_any_role((SELECT auth.uid()), ARRAY['procurement_officer','admin']::public.app_role[]));

-- Delivery Receipts
DROP POLICY IF EXISTS "Users can access org delivery_receipts" ON public.delivery_receipts;
CREATE POLICY "Users can access org delivery_receipts" ON public.delivery_receipts
    FOR ALL TO authenticated
    USING (org_id = (SELECT public.current_org_id()))
    WITH CHECK (org_id = (SELECT public.current_org_id()));

DROP POLICY IF EXISTS "Users can access org delivery_receipt_items" ON public.delivery_receipt_items;
CREATE POLICY "Users can access org delivery_receipt_items" ON public.delivery_receipt_items
    FOR ALL TO authenticated
    USING (delivery_receipt_id IN (SELECT id FROM public.delivery_receipts WHERE org_id = (SELECT public.current_org_id())))
    WITH CHECK (delivery_receipt_id IN (SELECT id FROM public.delivery_receipts WHERE org_id = (SELECT public.current_org_id())));

-- Invoices & Invoice Items
DROP POLICY IF EXISTS "Users can access org invoices" ON public.invoices;
CREATE POLICY "Users can access org invoices" ON public.invoices
    FOR ALL TO authenticated
    USING (org_id = (SELECT public.current_org_id()))
    WITH CHECK (org_id = (SELECT public.current_org_id()));

DROP POLICY IF EXISTS "Users can access org invoice_items" ON public.invoice_items;
CREATE POLICY "Users can access org invoice_items" ON public.invoice_items
    FOR ALL TO authenticated
    USING (invoice_id IN (SELECT id FROM public.invoices WHERE org_id = (SELECT public.current_org_id())))
    WITH CHECK (invoice_id IN (SELECT id FROM public.invoices WHERE org_id = (SELECT public.current_org_id())));

-- Payments
DROP POLICY IF EXISTS "Users can access org payments" ON public.payments;
CREATE POLICY "Users can access org payments" ON public.payments
    FOR ALL TO authenticated
    USING (org_id = (SELECT public.current_org_id()))
    WITH CHECK (org_id = (SELECT public.current_org_id()));

-- Notifications
DROP POLICY IF EXISTS "Users read their own notifications" ON public.notifications;
CREATE POLICY "Users read their own notifications" ON public.notifications
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users mark their own notifications read" ON public.notifications;
CREATE POLICY "Users mark their own notifications read" ON public.notifications
    FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

-- NDPA Consent Logs
DROP POLICY IF EXISTS "Users can access org ndpa_consent_logs" ON public.ndpa_consent_logs;
CREATE POLICY "Users can access org ndpa_consent_logs" ON public.ndpa_consent_logs
    FOR ALL TO authenticated
    USING (org_id = (SELECT public.current_org_id()))
    WITH CHECK (org_id = (SELECT public.current_org_id()));

-- Secure Action Tokens
DROP POLICY IF EXISTS "org reads action tokens" ON public.secure_action_tokens;
CREATE POLICY "org reads action tokens" ON public.secure_action_tokens
    FOR SELECT TO authenticated
    USING (org_id = (SELECT public.current_org_id()));
