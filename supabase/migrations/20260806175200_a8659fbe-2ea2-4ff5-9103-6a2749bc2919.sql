CREATE TABLE public.security_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event text NOT NULL,
  email text,
  ip_address text,
  user_agent text,
  detail text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.security_events TO authenticated;
GRANT ALL ON public.security_events TO service_role;

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can read security events"
ON public.security_events FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid()));

CREATE TRIGGER security_events_no_update BEFORE UPDATE ON public.security_events
FOR EACH ROW EXECUTE FUNCTION public.block_audit_mutation();

CREATE TRIGGER security_events_no_delete BEFORE DELETE ON public.security_events
FOR EACH ROW EXECUTE FUNCTION public.block_audit_mutation();

CREATE INDEX security_events_created_at_idx ON public.security_events (created_at DESC);