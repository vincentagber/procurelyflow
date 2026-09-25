-- Migration: 20260925170000_enterprise_security_remediation.sql
-- Description: Production hardening & security remediation:
--   1. Tenant subscriptions manual transfer verification columns & status constraint
--   2. Audit hash canonicalization (V2) & hash_version tracking
--   3. Webhook idempotency ledger
--   4. RFQ and Requisition unique constraints for concurrency atomicity
--   5. Supabase Realtime publication configuration

-- 1. Extend tenant_subscriptions status check and add manual transfer verification fields
ALTER TABLE public.tenant_subscriptions
    DROP CONSTRAINT IF EXISTS tenant_subscriptions_status_check;

ALTER TABLE public.tenant_subscriptions
    ADD CONSTRAINT tenant_subscriptions_status_check
        CHECK (status IN ('PENDING', 'AWAITING_VERIFICATION', 'SETTLED', 'FAILED', 'OVERDUE', 'CANCELLED'));

ALTER TABLE public.tenant_subscriptions
    ADD COLUMN IF NOT EXISTS transfer_reference TEXT,
    ADD COLUMN IF NOT EXISTS transfer_bank_name TEXT,
    ADD COLUMN IF NOT EXISTS transfer_notes TEXT,
    ADD COLUMN IF NOT EXISTS transfer_submitted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS settled_by_user_id UUID,
    ADD COLUMN IF NOT EXISTS settlement_source TEXT DEFAULT 'UNSPECIFIED';

CREATE INDEX IF NOT EXISTS idx_tenant_subs_transfer_ref
    ON public.tenant_subscriptions(transfer_reference)
    WHERE transfer_reference IS NOT NULL;

-- 2. Audit Hash Canonicalization & Versioning
ALTER TABLE public.approval_audit_log
    ADD COLUMN IF NOT EXISTS hash_version INT DEFAULT 1,
    ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'NGN';

-- Update audit log hash chain trigger to Canonical V2
CREATE OR REPLACE FUNCTION public.fn_audit_log_hash_chain()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_prev_hash TEXT;
    v_chain_payload TEXT;
    v_amount_text TEXT;
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
    NEW.hash_version := 2;

    -- Canonical amount representation: 2 fixed decimals or empty
    IF NEW.amount IS NOT NULL THEN
        v_amount_text := to_char(round(NEW.amount, 2), 'FM999999999999990.00');
    ELSE
        v_amount_text := '';
    END IF;

    -- Canonical V2 Payload format:
    -- v2|prev_hash|org_id|actor_id|actor_name|event_type|entity_type|entity_id|amount|currency|detail
    v_chain_payload := 'v2|' ||
                       v_prev_hash || '|' ||
                       coalesce(NEW.org_id::text, '') || '|' ||
                       coalesce(NEW.actor_id::text, '') || '|' ||
                       coalesce(NEW.actor_name, '') || '|' ||
                       coalesce(NEW.event_type, upper(coalesce(NEW.action, ''))) || '|' ||
                       coalesce(NEW.entity_type, 'requisition') || '|' ||
                       coalesce(NEW.entity_id::text, coalesce(NEW.requisition_id::text, '')) || '|' ||
                       v_amount_text || '|' ||
                       coalesce(NEW.currency, 'NGN') || '|' ||
                       coalesce(NEW.detail, '');

    NEW.payload_hash := encode(sha256(v_chain_payload::bytea), 'hex');

    RETURN NEW;
END;
$$;

-- 3. Webhook Idempotency Table
CREATE TABLE IF NOT EXISTS public.processed_webhook_events (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    event_type TEXT,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;

-- 4. Concurrency Invariants & Unique Indexes
-- Enforce at most 1 PO created per awarded RFQ
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_orders_rfq_unique
    ON public.purchase_orders(rfq_id)
    WHERE rfq_id IS NOT NULL;

-- Enforce no duplicate step order per requisition
CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_steps_req_step_order
    ON public.approval_steps(requisition_id, step_order);

-- 5. Realtime Publication configuration for tenant-isolated procurement tables
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'requisitions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.requisitions;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'purchase_orders'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_orders;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'approval_steps'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.approval_steps;
    END IF;
END $$;
