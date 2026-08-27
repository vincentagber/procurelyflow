ALTER TABLE public.requisition_items ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.project_budget_status(_project_id uuid)
RETURNS TABLE (
  budget_amount numeric,
  committed numeric,
  issued numeric,
  remaining numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.budget_amount,
    COALESCE(SUM(CASE WHEN r.status IN ('approved', 'pending_approval', 'rfq_issued', 'po_issued') THEN r.total_amount ELSE 0 END), 0)::numeric as committed,
    COALESCE(SUM(CASE WHEN r.status = 'po_issued' THEN r.total_amount ELSE 0 END), 0)::numeric as issued,
    (COALESCE(p.budget_amount, 0) - COALESCE(SUM(CASE WHEN r.status IN ('approved', 'pending_approval', 'rfq_issued', 'po_issued') THEN r.total_amount ELSE 0 END), 0))::numeric as remaining
  FROM public.projects p
  LEFT JOIN public.requisitions r ON r.project_id = p.id
  WHERE p.id = _project_id
  GROUP BY p.id, p.budget_amount;
$$;

CREATE OR REPLACE FUNCTION public.org_users_with_roles(_org_id uuid, _roles app_role[])
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  roles app_role[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id as user_id,
    p.email,
    p.full_name,
    ARRAY_AGG(ur.role)::app_role[] as roles
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE p.org_id = _org_id
  AND ur.role = ANY(_roles)
  GROUP BY p.id, p.email, p.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.project_budget_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_users_with_roles(uuid, app_role[]) TO authenticated;
GRANT ALL ON FUNCTION public.project_budget_status(uuid) TO service_role;
GRANT ALL ON FUNCTION public.org_users_with_roles(uuid, app_role[]) TO service_role;