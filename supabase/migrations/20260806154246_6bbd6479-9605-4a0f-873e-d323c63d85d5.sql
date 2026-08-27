DROP POLICY IF EXISTS "Users can upload requisition attachments to their org" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their org requisition attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their org requisition attachments" ON storage.objects;

CREATE POLICY "Users can upload requisition attachments to their org" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'requisition-attachments'
  AND split_part(name, '/', 1) = (SELECT p.org_id::text FROM public.profiles p WHERE p.id = auth.uid())
);

CREATE POLICY "Users can read their org requisition attachments" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'requisition-attachments'
  AND split_part(name, '/', 1) = (SELECT p.org_id::text FROM public.profiles p WHERE p.id = auth.uid())
);

CREATE POLICY "Users can delete their org requisition attachments" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'requisition-attachments'
  AND split_part(name, '/', 1) = (SELECT p.org_id::text FROM public.profiles p WHERE p.id = auth.uid())
);