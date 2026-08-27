ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS rating numeric;
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by_name text;