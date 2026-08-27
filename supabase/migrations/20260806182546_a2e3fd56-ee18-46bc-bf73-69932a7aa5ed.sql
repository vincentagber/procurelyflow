-- 1. Subscription plan as a fixed list, reusing organizations.plan
DO $$ BEGIN
  CREATE TYPE public.subscription_plan AS ENUM ('starter','growth','business','enterprise','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.organizations ALTER COLUMN plan DROP DEFAULT;

UPDATE public.organizations
SET plan = CASE lower(plan)
  WHEN 'starter' THEN 'starter'
  WHEN 'growth' THEN 'growth'
  WHEN 'business' THEN 'business'
  WHEN 'enterprise' THEN 'enterprise'
  ELSE 'custom'
END;

ALTER TABLE public.organizations
  ALTER COLUMN plan TYPE public.subscription_plan USING plan::public.subscription_plan;

ALTER TABLE public.organizations
  ALTER COLUMN plan SET DEFAULT 'starter'::public.subscription_plan,
  ALTER COLUMN plan SET NOT NULL;

-- 2. Billing status: trial | active | overdue | suspended
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_status_check;
UPDATE public.organizations
SET status = 'trial'
WHERE status NOT IN ('trial','active','overdue','suspended');
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_status_check
  CHECK (status IN ('trial','active','overdue','suspended'));

-- 3. Procurely -> organization subscription invoices
CREATE TABLE public.billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_number text NOT NULL UNIQUE,
  plan public.subscription_plan NOT NULL DEFAULT 'starter',
  period_start date NOT NULL,
  period_end date NOT NULL,
  description text,
  subtotal numeric(14,2) NOT NULL CHECK (subtotal >= 0),
  vat_rate numeric(5,2) NOT NULL DEFAULT 7.5 CHECK (vat_rate >= 0 AND vat_rate <= 100),
  vat_amount numeric(14,2) GENERATED ALWAYS AS (round(subtotal * vat_rate / 100, 2)) STORED,
  total_amount numeric(14,2) GENERATED ALWAYS AS (round(subtotal + (subtotal * vat_rate / 100), 2)) STORED,
  currency public.currency_code NOT NULL DEFAULT 'NGN',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','overdue')),
  issue_date date NOT NULL DEFAULT current_date,
  due_date date NOT NULL,
  paid_at timestamptz,
  payment_reference text,
  marked_paid_by uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX billing_invoices_org_idx ON public.billing_invoices (org_id, issue_date DESC);

GRANT ALL ON public.billing_invoices TO service_role;

ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform staff can read billing invoices"
ON public.billing_invoices FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid()));

CREATE TRIGGER billing_invoices_set_updated_at
BEFORE UPDATE ON public.billing_invoices
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Overdue sweep: unpaid past due -> invoice + organization flagged overdue
CREATE OR REPLACE FUNCTION public.sweep_overdue_billing()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE affected integer;
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

REVOKE ALL ON FUNCTION public.sweep_overdue_billing() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_overdue_billing() TO service_role;