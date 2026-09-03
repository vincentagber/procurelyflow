-- ==============================================================================
-- FIX SUPABASE AUTH: "Database error querying schema"
-- ==============================================================================
-- Run this in the Supabase SQL Editor.
-- It fixes NULL values in auth.users that cause GoTrue auth scan errors upon login.
-- ==============================================================================

-- 1. Fix NULL token and string columns in auth.users
UPDATE auth.users
SET 
    confirmation_token = COALESCE(confirmation_token, ''),
    recovery_token = COALESCE(recovery_token, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    email_change_token_current = COALESCE(email_change_token_current, ''),
    email_change = COALESCE(email_change, ''),
    reauthentication_token = COALESCE(reauthentication_token, ''),
    phone_change = COALESCE(phone_change, ''),
    phone_change_token = COALESCE(phone_change_token, '');

-- 2. Grant permissions on schema public to Supabase Auth Admin & Service Role
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, supabase_auth_admin, postgres;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role, supabase_auth_admin, postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role, supabase_auth_admin, postgres;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role, supabase_auth_admin, postgres;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO supabase_auth_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO supabase_auth_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO supabase_auth_admin;

-- 3. Verification query
SELECT id, email, created_at, email_confirmed_at 
FROM auth.users;
