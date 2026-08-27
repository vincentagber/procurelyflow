ALTER TABLE public.quote_items
  ADD COLUMN vat_rate numeric NOT NULL DEFAULT 7.5,
  ADD COLUMN vat_amount numeric NOT NULL DEFAULT 0;

UPDATE public.quote_items SET vat_rate = 0, vat_amount = 0;