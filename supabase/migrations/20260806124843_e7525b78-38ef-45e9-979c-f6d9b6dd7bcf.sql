-- 1. rfq_invitations: hide raw tokens from ordinary org members
DROP POLICY IF EXISTS "org reads invitations" ON public.rfq_invitations;
CREATE POLICY "procurement reads invitations" ON public.rfq_invitations
  FOR SELECT TO authenticated
  USING (org_id = public.current_org_id()
         AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));

-- 2. approval_steps: let the assigned approver record a decision
CREATE POLICY "approver decides own step" ON public.approval_steps
  FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id()
         AND status = 'pending'
         AND public.has_role(auth.uid(), required_role))
  WITH CHECK (org_id = public.current_org_id()
              AND public.has_role(auth.uid(), required_role));

-- 3. purchase orders + line items: procurement/admin writes
CREATE POLICY "procurement writes pos" ON public.purchase_orders
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id()
              AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));
CREATE POLICY "procurement updates pos" ON public.purchase_orders
  FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id()
         AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]))
  WITH CHECK (org_id = public.current_org_id()
              AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));

CREATE POLICY "procurement writes po items" ON public.po_line_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_orders p
                      WHERE p.id = po_line_items.purchase_order_id
                        AND p.org_id = public.current_org_id())
              AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));
CREATE POLICY "procurement updates po items" ON public.po_line_items
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_orders p
                 WHERE p.id = po_line_items.purchase_order_id
                   AND p.org_id = public.current_org_id())
         AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_orders p
                      WHERE p.id = po_line_items.purchase_order_id
                        AND p.org_id = public.current_org_id())
              AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));

-- 4. quotes + quote items: procurement/admin writes (suppliers submit through the server, service role)
CREATE POLICY "procurement writes quotes" ON public.quotes
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id()
              AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));
CREATE POLICY "procurement updates quotes" ON public.quotes
  FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id()
         AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]))
  WITH CHECK (org_id = public.current_org_id()
              AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));

CREATE POLICY "procurement writes quote items" ON public.quote_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.quotes q
                      WHERE q.id = quote_items.quote_id
                        AND q.org_id = public.current_org_id())
              AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));
CREATE POLICY "procurement updates quote items" ON public.quote_items
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotes q
                 WHERE q.id = quote_items.quote_id
                   AND q.org_id = public.current_org_id())
         AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quotes q
                      WHERE q.id = quote_items.quote_id
                        AND q.org_id = public.current_org_id())
              AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));

-- 5. storage.objects: explicit ownership-scoped access for quote attachments
DROP POLICY IF EXISTS "org staff read quote attachments" ON storage.objects;
CREATE POLICY "org staff read quote attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'quote-attachments'
         AND EXISTS (
           SELECT 1 FROM public.quotes q
           WHERE q.attachment_path = storage.objects.name
             AND q.org_id = public.current_org_id()
             AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','finance','executive','admin']::public.app_role[])
         ));

-- 6. Remove anonymous EXECUTE on internal helper functions
REVOKE EXECUTE ON FUNCTION public.current_org_id() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_org_staff(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.block_audit_mutation() FROM anon, public, authenticated;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_staff(uuid) TO authenticated;