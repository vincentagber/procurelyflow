-- ==============================================================================
-- Migration: Storage Buckets & Production Performance Indexes
-- ==============================================================================

-- 1. Storage Buckets Provisioning
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('procurement-files', 'procurement-files', false, 20971520, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('delivery-photos', 'delivery-photos', false, 15728640, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('invoices', 'invoices', false, 20971520, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Storage Bucket Security Policies (Tenant-Isolated Access)
DO $$
BEGIN
  -- View policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated org members can read their files' AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Authenticated org members can read their files"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id IN ('procurement-files', 'delivery-photos', 'invoices'));
  END IF;

  -- Upload policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated org members can upload files' AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Authenticated org members can upload files"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id IN ('procurement-files', 'delivery-photos', 'invoices'));
  END IF;

  -- Delete policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can delete their uploads' AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Authenticated users can delete their uploads"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id IN ('procurement-files', 'delivery-photos', 'invoices') AND auth.uid() = owner);
  END IF;
END $$;

-- 3. Production Performance Indexes
CREATE INDEX IF NOT EXISTS idx_requisitions_org_status ON public.requisitions(org_id, status);
CREATE INDEX IF NOT EXISTS idx_requisitions_created_by ON public.requisitions(created_by);
CREATE INDEX IF NOT EXISTS idx_requisition_items_req_id ON public.requisition_items(requisition_id);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_org_supplier ON public.purchase_orders(org_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_req_id ON public.purchase_orders(requisition_id);
CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON public.po_items(po_id);

CREATE INDEX IF NOT EXISTS idx_approval_audit_org_created ON public.approval_audit_log(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_audit_req_id ON public.approval_audit_log(requisition_id);

CREATE INDEX IF NOT EXISTS idx_rfqs_org_status ON public.rfqs(org_id, status);
CREATE INDEX IF NOT EXISTS idx_rfq_quotes_rfq_id ON public.rfq_quotes(rfq_id);

CREATE INDEX IF NOT EXISTS idx_invoices_org_status ON public.invoices(org_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_po_id ON public.invoices(po_id);

CREATE INDEX IF NOT EXISTS idx_deliveries_org_po ON public.deliveries(org_id, po_id);
CREATE INDEX IF NOT EXISTS idx_delivery_items_delivery_id ON public.delivery_items(delivery_id);

CREATE INDEX IF NOT EXISTS idx_secure_action_tokens_token_hash ON public.secure_action_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_secure_action_tokens_expires_at ON public.secure_action_tokens(expires_at);
