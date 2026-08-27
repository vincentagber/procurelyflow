ALTER TABLE public.invoices
  ADD COLUMN wht_applicable boolean NOT NULL DEFAULT false,
  ADD COLUMN wht_rate numeric NOT NULL DEFAULT 2.0,
  ADD COLUMN wht_amount numeric GENERATED ALWAYS AS (
    CASE
      WHEN wht_applicable THEN ROUND(subtotal * (wht_rate / 100), 2)
      ELSE 0
    END
  ) STORED,
  ADD COLUMN wht_credit_note_received boolean NOT NULL DEFAULT false,
  ADD COLUMN wht_credit_note_reference text;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_wht_rate_range CHECK (wht_rate >= 0 AND wht_rate <= 100);

CREATE OR REPLACE FUNCTION public.validate_wht_credit_note_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.wht_credit_note_reference IS NOT NULL AND NEW.wht_credit_note_received IS NOT TRUE THEN
    RAISE EXCEPTION 'WHT credit note reference can only be set when wht_credit_note_received is true';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoices_wht_credit_note_reference_check
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_wht_credit_note_reference();