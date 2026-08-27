ALTER TABLE public.platform_admins ALTER COLUMN user_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS platform_admins_email_key ON public.platform_admins (lower(email));

INSERT INTO public.platform_admins (user_id, email, note)
SELECT u.id, 'bosjatech@gmail.com', 'Founding platform admin'
FROM (SELECT id FROM auth.users WHERE lower(email) = 'bosjatech@gmail.com' LIMIT 1) u
ON CONFLICT (lower(email)) DO NOTHING;

INSERT INTO public.platform_admins (user_id, email, note)
SELECT NULL, 'bosjatech@gmail.com', 'Founding platform admin (pre-authorized)'
WHERE NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE lower(email) = 'bosjatech@gmail.com');