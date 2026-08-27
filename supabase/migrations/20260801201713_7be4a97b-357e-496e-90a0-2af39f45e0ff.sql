-- ENUMS
CREATE TYPE public.app_role AS ENUM ('requester','approver','procurement_officer','finance','executive','admin');
CREATE TYPE public.requisition_status AS ENUM ('draft','pending_approval','approved','rejected','rfq_issued','po_issued','cancelled');
CREATE TYPE public.approval_status AS ENUM ('pending','approved','rejected','skipped');
CREATE TYPE public.rfq_status AS ENUM ('open','closed','awarded','cancelled');
CREATE TYPE public.quote_status AS ENUM ('invited','submitted','shortlisted','awarded','rejected');
CREATE TYPE public.po_status AS ENUM ('draft','issued','acknowledged','cancelled');
CREATE TYPE public.currency_code AS ENUM ('NGN','USD');

-- ORGANIZATIONS
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  base_currency public.currency_code NOT NULL DEFAULT 'NGN',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  department text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- HELPERS
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles))
$$;

CREATE OR REPLACE FUNCTION public.is_org_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_any_role(_user_id, ARRAY['approver','procurement_officer','finance','executive','admin']::public.app_role[])
$$;

CREATE POLICY "org members read own org" ON public.organizations FOR SELECT TO authenticated USING (id = public.current_org_id());
CREATE POLICY "admins update own org" ON public.organizations FOR UPDATE TO authenticated USING (id = public.current_org_id() AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "any user creates org" ON public.organizations FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "read profiles in org" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR org_id = public.current_org_id());
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

CREATE POLICY "read roles in org" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR org_id = public.current_org_id());

-- PROJECTS
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  location text,
  budget_amount numeric(16,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org reads projects" ON public.projects FOR SELECT TO authenticated USING (org_id = public.current_org_id());
CREATE POLICY "admins manage projects" ON public.projects FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['admin','procurement_officer']::public.app_role[]))
  WITH CHECK (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['admin','procurement_officer']::public.app_role[]));

-- APPROVAL RULES (data-driven routing)
CREATE TABLE public.approval_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label text NOT NULL,
  min_amount numeric(16,2) NOT NULL DEFAULT 0,
  max_amount numeric(16,2),
  required_roles public.app_role[] NOT NULL DEFAULT '{}',
  extra_role_if_unbudgeted public.app_role,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_rules TO authenticated;
GRANT ALL ON public.approval_rules TO service_role;
ALTER TABLE public.approval_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org reads rules" ON public.approval_rules FOR SELECT TO authenticated USING (org_id = public.current_org_id());
CREATE POLICY "admins manage rules" ON public.approval_rules FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(),'admin'));

-- REQUISITIONS
CREATE TABLE public.requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  requester_id uuid NOT NULL,
  reference text NOT NULL DEFAULT concat('REQ-', to_char(now(),'YYMMDD'), '-', upper(substr(md5(random()::text),1,5))),
  title text NOT NULL,
  notes text,
  needed_by date,
  currency public.currency_code NOT NULL DEFAULT 'NGN',
  total_amount numeric(16,2) NOT NULL DEFAULT 0,
  is_unbudgeted boolean NOT NULL DEFAULT false,
  status public.requisition_status NOT NULL DEFAULT 'draft',
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.requisitions TO authenticated;
GRANT ALL ON public.requisitions TO service_role;
ALTER TABLE public.requisitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read requisitions" ON public.requisitions FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() AND (requester_id = auth.uid() OR public.is_org_staff(auth.uid())));
CREATE POLICY "create own requisition" ON public.requisitions FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND requester_id = auth.uid());
CREATE POLICY "update own draft requisition" ON public.requisitions FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND (requester_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[])));
CREATE POLICY "delete own draft requisition" ON public.requisitions FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND requester_id = auth.uid() AND status = 'draft');

CREATE TABLE public.requisition_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid NOT NULL REFERENCES public.requisitions(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(14,3) NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'unit',
  estimated_unit_price numeric(16,2) NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.requisition_items TO authenticated;
GRANT ALL ON public.requisition_items TO service_role;
ALTER TABLE public.requisition_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read req items" ON public.requisition_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.requisitions r WHERE r.id = requisition_id AND r.org_id = public.current_org_id() AND (r.requester_id = auth.uid() OR public.is_org_staff(auth.uid()))));
CREATE POLICY "manage own req items" ON public.requisition_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.requisitions r WHERE r.id = requisition_id AND r.org_id = public.current_org_id() AND r.requester_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.requisitions r WHERE r.id = requisition_id AND r.org_id = public.current_org_id() AND r.requester_id = auth.uid()));

-- APPROVAL STEPS
CREATE TABLE public.approval_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requisition_id uuid NOT NULL REFERENCES public.requisitions(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  required_role public.app_role NOT NULL,
  reason text,
  status public.approval_status NOT NULL DEFAULT 'pending',
  decided_by uuid,
  decided_at timestamptz,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.approval_steps TO authenticated;
GRANT ALL ON public.approval_steps TO service_role;
ALTER TABLE public.approval_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read approval steps" ON public.approval_steps FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() AND (public.is_org_staff(auth.uid()) OR EXISTS (SELECT 1 FROM public.requisitions r WHERE r.id = requisition_id AND r.requester_id = auth.uid())));

-- IMMUTABLE AUDIT LOG
CREATE TABLE public.approval_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requisition_id uuid,
  actor_id uuid,
  actor_name text,
  actor_role public.app_role,
  action text NOT NULL,
  detail text,
  amount numeric(16,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.approval_audit_log TO authenticated;
GRANT SELECT, INSERT ON public.approval_audit_log TO service_role;
ALTER TABLE public.approval_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org reads audit log" ON public.approval_audit_log FOR SELECT TO authenticated USING (org_id = public.current_org_id());

CREATE OR REPLACE FUNCTION public.block_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'approval_audit_log is append-only and cannot be modified or deleted';
END;
$$;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON public.approval_audit_log FOR EACH ROW EXECUTE FUNCTION public.block_audit_mutation();
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON public.approval_audit_log FOR EACH ROW EXECUTE FUNCTION public.block_audit_mutation();

-- SUPPLIERS
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  tax_id text,
  is_compliant boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org reads suppliers" ON public.suppliers FOR SELECT TO authenticated USING (org_id = public.current_org_id());
CREATE POLICY "procurement manages suppliers" ON public.suppliers FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]))
  WITH CHECK (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));

-- RFQ
CREATE TABLE public.rfqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requisition_id uuid NOT NULL REFERENCES public.requisitions(id) ON DELETE CASCADE,
  reference text NOT NULL DEFAULT concat('RFQ-', to_char(now(),'YYMMDD'), '-', upper(substr(md5(random()::text),1,5))),
  title text NOT NULL,
  instructions text,
  closes_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  status public.rfq_status NOT NULL DEFAULT 'open',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.rfqs TO authenticated;
GRANT ALL ON public.rfqs TO service_role;
ALTER TABLE public.rfqs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org reads rfqs" ON public.rfqs FOR SELECT TO authenticated USING (org_id = public.current_org_id());
CREATE POLICY "procurement manages rfqs" ON public.rfqs FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]))
  WITH CHECK (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));

CREATE TABLE public.rfq_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  rfq_id uuid NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24),'hex'),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  opened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rfq_id, supplier_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rfq_invitations TO authenticated;
GRANT ALL ON public.rfq_invitations TO service_role;
ALTER TABLE public.rfq_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org reads invitations" ON public.rfq_invitations FOR SELECT TO authenticated USING (org_id = public.current_org_id());
CREATE POLICY "procurement manages invitations" ON public.rfq_invitations FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]))
  WITH CHECK (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['procurement_officer','admin']::public.app_role[]));

CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  rfq_id uuid NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  currency public.currency_code NOT NULL DEFAULT 'NGN',
  total_amount numeric(16,2) NOT NULL DEFAULT 0,
  lead_time_days int,
  payment_terms text,
  warranty_note text,
  status public.quote_status NOT NULL DEFAULT 'submitted',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rfq_id, supplier_id)
);
GRANT SELECT, UPDATE ON public.quotes TO authenticated;
GRANT ALL ON public.quotes TO service_role;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org reads quotes" ON public.quotes FOR SELECT TO authenticated USING (org_id = public.current_org_id());

CREATE TABLE public.quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  requisition_item_id uuid REFERENCES public.requisition_items(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity numeric(14,3) NOT NULL DEFAULT 1,
  unit_price numeric(16,2) NOT NULL DEFAULT 0,
  currency public.currency_code NOT NULL DEFAULT 'NGN',
  sort_order int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.quote_items TO authenticated;
GRANT ALL ON public.quote_items TO service_role;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org reads quote items" ON public.quote_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND q.org_id = public.current_org_id()));

-- PURCHASE ORDERS
CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  po_number text NOT NULL DEFAULT concat('PO-', to_char(now(),'YYMMDD'), '-', upper(substr(md5(random()::text),1,5))),
  requisition_id uuid REFERENCES public.requisitions(id) ON DELETE SET NULL,
  rfq_id uuid REFERENCES public.rfqs(id) ON DELETE SET NULL,
  quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  settlement_currency public.currency_code NOT NULL DEFAULT 'NGN',
  total_amount numeric(16,2) NOT NULL DEFAULT 0,
  fx_rate_note text,
  delivery_address text,
  status public.po_status NOT NULL DEFAULT 'issued',
  override_reason text,
  recommended_quote_id uuid,
  issued_by uuid NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org reads pos" ON public.purchase_orders FOR SELECT TO authenticated USING (org_id = public.current_org_id());

CREATE TABLE public.po_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(14,3) NOT NULL DEFAULT 1,
  unit_price numeric(16,2) NOT NULL DEFAULT 0,
  currency public.currency_code NOT NULL DEFAULT 'NGN',
  sort_order int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.po_line_items TO authenticated;
GRANT ALL ON public.po_line_items TO service_role;
ALTER TABLE public.po_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org reads po items" ON public.po_line_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = purchase_order_id AND p.org_id = public.current_org_id()));

-- INVOICES (phase 2 placeholder, no UI)
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  invoice_number text,
  seller_tax_id text,
  buyer_tax_id text,
  line_items jsonb NOT NULL DEFAULT '[]',
  subtotal numeric(16,2) NOT NULL DEFAULT 0,
  vat_amount numeric(16,2) NOT NULL DEFAULT 0,
  total_amount numeric(16,2) NOT NULL DEFAULT 0,
  currency public.currency_code NOT NULL DEFAULT 'NGN',
  clearance_reference text,
  clearance_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance reads invoices" ON public.invoices FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['finance','admin','executive']::public.app_role[]));
