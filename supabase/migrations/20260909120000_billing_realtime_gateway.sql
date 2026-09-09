-- Migration: 20260909120000_billing_realtime_gateway.sql
-- Description: Production billing upgrades — gateway reference tracking, real-time publication,
--              and webhook reconciliation RPC for Monnify / Paystack virtual account settlement.

-- 1. Extend tenant_subscriptions with gateway tracking columns
ALTER TABLE public.tenant_subscriptions
    ADD COLUMN IF NOT EXISTS payment_gateway TEXT DEFAULT 'SIMULATED'
        CHECK (payment_gateway IN ('MONNIFY', 'PAYSTACK', 'SIMULATED')),
    ADD COLUMN IF NOT EXISTS payment_gateway_reference TEXT,
    ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

-- 2. Index on gateway reference for O(1) webhook lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_subs_gateway_ref
    ON public.tenant_subscriptions(payment_gateway_reference)
    WHERE payment_gateway_reference IS NOT NULL;

-- 3. Enable Supabase Realtime for the billing table so the UI receives live status pushes
-- (Publication must be owned by postgres superuser or the supabase_admin role)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND tablename = 'tenant_subscriptions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.tenant_subscriptions;
    END IF;
END;
$$;

-- 4. Server-side RPC called by the Edge Function webhook handler.
--    Updates status to SETTLED and stamps settled_at; returns the updated row.
CREATE OR REPLACE FUNCTION public.settle_subscription_by_gateway_ref(
    p_gateway_reference TEXT,
    p_gateway            TEXT
)
RETURNS public.tenant_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER          -- runs as postgres owner; bypasses RLS for the webhook service role
SET search_path = public
AS $$
DECLARE
    v_row public.tenant_subscriptions;
BEGIN
    UPDATE public.tenant_subscriptions
    SET
        status     = 'SETTLED',
        settled_at = NOW(),
        payment_gateway = p_gateway
    WHERE payment_gateway_reference = p_gateway_reference
      AND status = 'PENDING'
    RETURNING * INTO v_row;

    IF v_row.id IS NULL THEN
        RAISE EXCEPTION 'No pending subscription found for gateway reference %', p_gateway_reference;
    END IF;

    RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.settle_subscription_by_gateway_ref(TEXT, TEXT)
    TO service_role;   -- only the service role (Edge Function / webhook) may call this
