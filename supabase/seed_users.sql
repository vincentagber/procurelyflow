-- ==============================================================================
-- PROCURELY FLOW - DEMO USERS & INITIAL SEED DATA
-- ==============================================================================
-- Password for all accounts: Procurely@2026!
-- ==============================================================================

SET search_path = public, extensions, auth;

DO $$
DECLARE
    v_org_id UUID := '11111111-1111-1111-1111-111111111111';
    
    v_admin_id UUID := 'a1111111-1111-1111-1111-111111111111';
    v_requester_id UUID := 'a2222222-2222-2222-2222-222222222222';
    v_approver_id UUID := 'a3333333-3333-3333-3333-333333333333';
    v_procurement_id UUID := 'a4444444-4444-4444-4444-444444444444';
    v_finance_id UUID := 'a5555555-5555-5555-5555-555555555555';
    v_executive_id UUID := 'a6666666-6666-6666-6666-666666666666';

    v_encrypted_pw TEXT := extensions.crypt('Procurely@2026!', extensions.gen_salt('bf'));

    v_project_id UUID := '22222222-2222-2222-2222-222222222222';
    v_supplier_id UUID := '33333333-3333-3333-3333-333333333333';
    v_uom_bag UUID := '44444444-4444-4444-4444-444444444444';
    v_uom_ton UUID := '44444444-4444-4444-4444-444444444445';
    v_cat_civil UUID := '55555555-5555-5555-5555-555555555555';
BEGIN
    -- 1. Create Organization
    INSERT INTO public.organizations (id, name, base_currency, plan, status, primary_contact_email)
    VALUES (v_org_id, 'Acme Infrastructure Ltd', 'NGN', 'business', 'active', 'admin@procurely.com')
    ON CONFLICT (id) DO UPDATE 
    SET name = EXCLUDED.name, status = EXCLUDED.status;

    -- 2. Create Auth Users in auth.users
    -- Admin
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user, created_at, updated_at
    ) VALUES (
        v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'admin@procurely.com', v_encrypted_pw, NOW(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Chidi Admin"}'::jsonb, false, false, NOW(), NOW()
    ) ON CONFLICT (id) DO UPDATE 
    SET encrypted_password = EXCLUDED.encrypted_password, email_confirmed_at = NOW();

    -- Requester
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user, created_at, updated_at
    ) VALUES (
        v_requester_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'requester@procurely.com', v_encrypted_pw, NOW(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Tunde Requester"}'::jsonb, false, false, NOW(), NOW()
    ) ON CONFLICT (id) DO UPDATE 
    SET encrypted_password = EXCLUDED.encrypted_password, email_confirmed_at = NOW();

    -- Approver
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user, created_at, updated_at
    ) VALUES (
        v_approver_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'approver@procurely.com', v_encrypted_pw, NOW(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Ngozi Approver"}'::jsonb, false, false, NOW(), NOW()
    ) ON CONFLICT (id) DO UPDATE 
    SET encrypted_password = EXCLUDED.encrypted_password, email_confirmed_at = NOW();

    -- Procurement Officer
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user, created_at, updated_at
    ) VALUES (
        v_procurement_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'procurement@procurely.com', v_encrypted_pw, NOW(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Emeka Procurement"}'::jsonb, false, false, NOW(), NOW()
    ) ON CONFLICT (id) DO UPDATE 
    SET encrypted_password = EXCLUDED.encrypted_password, email_confirmed_at = NOW();

    -- Finance
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user, created_at, updated_at
    ) VALUES (
        v_finance_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'finance@procurely.com', v_encrypted_pw, NOW(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Amina Finance"}'::jsonb, false, false, NOW(), NOW()
    ) ON CONFLICT (id) DO UPDATE 
    SET encrypted_password = EXCLUDED.encrypted_password, email_confirmed_at = NOW();

    -- Executive
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user, created_at, updated_at
    ) VALUES (
        v_executive_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'executive@procurely.com', v_encrypted_pw, NOW(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Folake Executive"}'::jsonb, false, false, NOW(), NOW()
    ) ON CONFLICT (id) DO UPDATE 
    SET encrypted_password = EXCLUDED.encrypted_password, email_confirmed_at = NOW();

    -- 3. Create Corresponding Identities in auth.identities (Required by Supabase Auth UI)
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES
        (v_admin_id, v_admin_id, jsonb_build_object('sub', v_admin_id::text, 'email', 'admin@procurely.com'), 'email', v_admin_id::text, NOW(), NOW(), NOW()),
        (v_requester_id, v_requester_id, jsonb_build_object('sub', v_requester_id::text, 'email', 'requester@procurely.com'), 'email', v_requester_id::text, NOW(), NOW(), NOW()),
        (v_approver_id, v_approver_id, jsonb_build_object('sub', v_approver_id::text, 'email', 'approver@procurely.com'), 'email', v_approver_id::text, NOW(), NOW(), NOW()),
        (v_procurement_id, v_procurement_id, jsonb_build_object('sub', v_procurement_id::text, 'email', 'procurement@procurely.com'), 'email', v_procurement_id::text, NOW(), NOW(), NOW()),
        (v_finance_id, v_finance_id, jsonb_build_object('sub', v_finance_id::text, 'email', 'finance@procurely.com'), 'email', v_finance_id::text, NOW(), NOW(), NOW()),
        (v_executive_id, v_executive_id, jsonb_build_object('sub', v_executive_id::text, 'email', 'executive@procurely.com'), 'email', v_executive_id::text, NOW(), NOW(), NOW())
    ON CONFLICT (provider, provider_id) DO NOTHING;

    -- 4. Create Public Profiles
    INSERT INTO public.profiles (id, org_id, full_name, email, department) VALUES
        (v_admin_id, v_org_id, 'Chidi Admin', 'admin@procurely.com', 'Operations & IT'),
        (v_requester_id, v_org_id, 'Tunde Requester', 'requester@procurely.com', 'Engineering & Construction'),
        (v_approver_id, v_org_id, 'Ngozi Approver', 'approver@procurely.com', 'Project Management'),
        (v_procurement_id, v_org_id, 'Emeka Procurement', 'procurement@procurely.com', 'Supply Chain'),
        (v_finance_id, v_org_id, 'Amina Finance', 'finance@procurely.com', 'Finance & Accounts'),
        (v_executive_id, v_org_id, 'Folake Executive', 'executive@procurely.com', 'Executive Office')
    ON CONFLICT (id) DO UPDATE 
    SET org_id = EXCLUDED.org_id, full_name = EXCLUDED.full_name, department = EXCLUDED.department;

    -- 5. Assign User Roles
    DELETE FROM public.user_roles WHERE org_id = v_org_id;
    INSERT INTO public.user_roles (user_id, org_id, role) VALUES
        (v_admin_id, v_org_id, 'admin'),
        (v_admin_id, v_org_id, 'executive'),
        (v_requester_id, v_org_id, 'requester'),
        (v_approver_id, v_org_id, 'approver'),
        (v_procurement_id, v_org_id, 'procurement_officer'),
        (v_finance_id, v_org_id, 'finance'),
        (v_executive_id, v_org_id, 'executive');

    -- 6. Seed Demo Project & Cost Codes
    INSERT INTO public.projects (id, org_id, name, location, budget_amount)
    VALUES (v_project_id, v_org_id, 'Lekki Coastal Highway Tower A', 'Lekki Phase 1, Lagos', 150000000.00)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.cost_codes (org_id, project_id, code, description, allocated_amount, committed_amount, incurred_amount, currency)
    VALUES 
        (v_org_id, v_project_id, '01-FOUNDATION', 'Substructure, piling and foundation works', 45000000.00, 0, 0, 'NGN'),
        (v_org_id, v_project_id, '02-SUPERSTRUCTURE', 'Reinforced concrete, columns and beams', 65000000.00, 0, 0, 'NGN'),
        (v_org_id, v_project_id, '03-ELECTRICAL', 'Conduits, wiring, panels and switchgear', 20000000.00, 0, 0, 'NGN'),
        (v_org_id, v_project_id, '04-PLUMBING', 'Piping, pumps and sanitary fittings', 20000000.00, 0, 0, 'NGN')
    ON CONFLICT (org_id, project_id, code) DO NOTHING;

    -- 7. Seed Units of Measure & Item Categories
    INSERT INTO public.units_of_measure (id, org_id, code, name, symbol)
    VALUES 
        (v_uom_bag, v_org_id, 'BAG', '50kg Bag', 'bag'),
        (v_uom_ton, v_org_id, 'TON', 'Metric Ton', 'ton')
    ON CONFLICT (org_id, code) DO NOTHING;

    INSERT INTO public.item_categories (id, org_id, code, name, description)
    VALUES 
        (v_cat_civil, v_org_id, 'CIVIL', 'Civil & Structural Works', 'Cement, rebar, aggregates and blockwork')
    ON CONFLICT (org_id, code) DO NOTHING;

    -- 8. Seed Supplier
    INSERT INTO public.suppliers (id, org_id, name, contact_name, email, phone, tax_id, is_compliant, rating)
    VALUES (
        v_supplier_id, v_org_id, 'Dangote Cement & Building Supplies Plc',
        'Alhaji Musa Ibrahim', 'musa@dangotesupplies.com', '+2348031234567', 'TIN-23490812', true, 4.8
    ) ON CONFLICT (id) DO NOTHING;

    -- 9. Seed Catalog Item
    INSERT INTO public.items (org_id, category_id, uom_id, sku, name, description, estimated_unit_price, currency, preferred_supplier_id, is_active)
    VALUES (
        v_org_id, v_cat_civil, v_uom_bag, 'MAT-CEM-001', 'Dangote Portland Cement 42.5R (50kg)',
        'Grade 42.5R high early strength cement for structural concrete', 8500.00, 'NGN', v_supplier_id, true
    ) ON CONFLICT DO NOTHING;

    -- 10. Seed Standard Approval Rules (Tiered routing)
    INSERT INTO public.approval_rules (org_id, label, min_amount, max_amount, required_roles, approval_mode, sort_order, is_active)
    VALUES
        (v_org_id, 'Standard Requisition (< ₦1,000,000)', 0, 1000000, ARRAY['approver']::public.app_role[], 'sequential', 1, true),
        (v_org_id, 'Major Requisition (₦1,000,000 - ₦10,000,000)', 1000000, 10000000, ARRAY['approver','procurement_officer','finance']::public.app_role[], 'sequential', 2, true),
        (v_org_id, 'Executive Threshold (> ₦10,000,000)', 10000000, NULL, ARRAY['approver','procurement_officer','finance','executive']::public.app_role[], 'sequential', 3, true)
    ON CONFLICT DO NOTHING;

END $$;
