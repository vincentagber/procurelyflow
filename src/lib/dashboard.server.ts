import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadActor } from "@/lib/procurement.server";

export interface DashboardRequisitionRow {
  id: string;
  reference: string;
  title: string;
  status: string;
  total_amount: number;
  currency: string;
  created_at: string;
  needed_by: string | null;
  project_id: string | null;
  projects: {
    id: string;
    name: string;
    location: string | null;
    budget_amount: number | null;
  } | null;
}

export interface DashboardStepRow {
  id: string;
  required_role: string;
  status: string;
  step_order: number | null;
  requisitions: {
    id: string;
    title: string;
    reference: string;
    total_amount: number;
    currency: string;
  } | null;
}

export interface DashboardPORow {
  id: string;
  po_number: string;
  total_amount: number;
  settlement_currency: string;
  status: string;
  issued_at: string | null;
  supplier_id: string | null;
  suppliers: { id: string; name: string } | null;
  requisition_id: string | null;
  requisitions: {
    id: string;
    reference: string;
    title: string;
    created_at: string;
    project_id: string | null;
    projects: {
      id: string;
      name: string;
      location: string | null;
      budget_amount: number | null;
    } | null;
  } | null;
  issued_by: string | null;
  rfq_id: string | null;
  quote_id: string | null;
  recommended_quote_id: string | null;
  override_reason: string | null;
}

export interface DashboardProjectRow {
  id: string;
  name: string;
  location: string | null;
  budget_amount: number | null;
  created_at: string;
}

export interface DashboardItemRow {
  id: string;
  description: string;
  quantity: number;
  estimated_unit_price: number;
  unit: string | null;
  requisition_id: string;
}

export interface DashboardReceiptRow {
  id: string;
  delivered_at: string | null;
  purchase_order_id: string | null;
  purchase_orders: { issued_at: string | null } | null;
  delivery_receipt_items: Array<{
    quantity_delivered: number | null;
    quantity_accepted: number | null;
  }> | null;
}

export interface DashboardQuoteRow {
  id: string;
  rfq_id: string;
  supplier_id: string;
  total_amount: number;
  status: string;
}

export interface DashboardMetricsPayload {
  requisitions: DashboardRequisitionRow[];
  steps: DashboardStepRow[];
  purchaseOrders: DashboardPORow[];
  projectsList: DashboardProjectRow[];
  projectCount: number;
  supplierCount: number;
  memberCount: number;
  requisitionItems: DashboardItemRow[];
  deliveryReceipts: DashboardReceiptRow[];
  quotes: DashboardQuoteRow[];
  committedNGN: number;
  committedUSD: number;
  hasMultipleCommittedCurrencies: boolean;
  committed: number;
}

/**
 * Server-side high performance dashboard aggregation engine.
 * Consolidates 9 separate REST roundtrips into a single server-side step.
 */
export async function getOrganizationDashboardMetrics(
  userId: string,
): Promise<DashboardMetricsPayload> {
  const actor = await loadActor(userId);

  const [
    reqsRes,
    stepsRes,
    posRes,
    projectsRes,
    suppliersRes,
    membersRes,
    itemsRes,
    receiptsRes,
    quotesRes,
  ] = await Promise.all([
    supabaseAdmin
      .from("requisitions")
      .select(
        "id, reference, title, status, total_amount, currency, created_at, needed_by, project_id, projects(id, name, location, budget_amount)",
      )
      .eq("org_id", actor.orgId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("approval_steps")
      .select(
        "id, required_role, status, step_order, requisitions(id, title, reference, total_amount, currency)",
      )
      .eq("org_id", actor.orgId)
      .eq("status", "pending"),
    supabaseAdmin
      .from("purchase_orders")
      .select(
        "id, po_number, total_amount, settlement_currency, status, issued_at, supplier_id, suppliers(id, name), requisition_id, requisitions(id, reference, title, created_at, project_id, projects(id, name, location, budget_amount)), issued_by, rfq_id, quote_id, recommended_quote_id, override_reason",
      )
      .eq("org_id", actor.orgId)
      .order("issued_at", { ascending: false })
      .limit(200),
    supabaseAdmin
      .from("projects")
      .select("id, name, location, budget_amount, created_at")
      .eq("org_id", actor.orgId)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("suppliers")
      .select("id", { count: "exact", head: true })
      .eq("org_id", actor.orgId),
    supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("org_id", actor.orgId),
    supabaseAdmin
      .from("requisition_items")
      .select(
        "id, description, quantity, estimated_unit_price, unit, requisition_id, sort_order, requisitions!inner(org_id)",
      )
      .eq("requisitions.org_id", actor.orgId)
      .order("sort_order", { ascending: true })
      .limit(200),
    supabaseAdmin
      .from("delivery_receipts")
      .select(
        "id, delivered_at, purchase_order_id, purchase_orders(issued_at), delivery_receipt_items(quantity_delivered, quantity_accepted)",
      )
      .eq("org_id", actor.orgId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("quotes")
      .select("id, rfq_id, supplier_id, total_amount, status")
      .eq("org_id", actor.orgId)
      .limit(100),
  ]);

  const purchaseOrders = (posRes.data ?? []) as unknown as DashboardPORow[];

  // Group spend by currency
  const committedByCurrency = purchaseOrders.reduce(
    (acc: Record<string, number>, p: DashboardPORow) => {
      const curr = (p.settlement_currency || "NGN").toUpperCase();
      acc[curr] = (acc[curr] || 0) + Number(p.total_amount || 0);
      return acc;
    },
    {},
  );

  const committedNGN = committedByCurrency["NGN"] || 0;
  const committedUSD = committedByCurrency["USD"] || 0;
  const hasMultipleCommittedCurrencies = Object.keys(committedByCurrency).length > 1;
  const committed = purchaseOrders.reduce(
    (sum: number, p: DashboardPORow) => sum + Number(p.total_amount || 0),
    0,
  );

  return {
    requisitions: (reqsRes.data ?? []) as unknown as DashboardRequisitionRow[],
    steps: (stepsRes.data ?? []) as unknown as DashboardStepRow[],
    purchaseOrders,
    projectsList: (projectsRes.data ?? []) as unknown as DashboardProjectRow[],
    projectCount: projectsRes.data?.length ?? 0,
    supplierCount: suppliersRes.count ?? 0,
    memberCount: membersRes.count ?? 0,
    requisitionItems: ((itemsRes.data ?? []) as any[]).map((it) => ({
      id: it.id,
      description: it.description,
      quantity: Number(it.quantity || 0),
      estimated_unit_price: Number(it.estimated_unit_price || 0),
      unit: it.unit ?? null,
      requisition_id: it.requisition_id,
    })),
    deliveryReceipts: (receiptsRes.data ?? []) as unknown as DashboardReceiptRow[],
    quotes: (quotesRes.data ?? []) as unknown as DashboardQuoteRow[],
    committedNGN,
    committedUSD,
    hasMultipleCommittedCurrencies,
    committed,
  };
}
