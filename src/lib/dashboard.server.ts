import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadActor } from "@/lib/procurement.server";

export interface DashboardMetricsPayload {
  requisitions: Record<string, unknown>[];
  steps: Record<string, unknown>[];
  purchaseOrders: Record<string, unknown>[];
  projectsList: Record<string, unknown>[];
  projectCount: number;
  supplierCount: number;
  memberCount: number;
  requisitionItems: Record<string, unknown>[];
  deliveryReceipts: Record<string, unknown>[];
  quotes: Record<string, unknown>[];
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
      .select("id, description, quantity, estimated_unit_price, unit, requisition_id")
      .order("created_at", { ascending: false })
      .limit(200),
    supabaseAdmin
      .from("delivery_receipts")
      .select(
        "id, delivered_at, purchase_order_id, purchase_orders(issued_at), delivery_receipt_items(quantity_delivered, quantity_accepted)",
      )
      .eq("org_id", actor.orgId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabaseAdmin.from("quotes").select("id, rfq_id, supplier_id, total_amount, status").limit(100),
  ]);

  const purchaseOrders = posRes.data ?? [];

  // Group spend by currency
  const committedByCurrency = (
    purchaseOrders as Array<{ settlement_currency?: string | null; total_amount?: number | null }>
  ).reduce((acc: Record<string, number>, p) => {
    const curr = (p.settlement_currency || "NGN").toUpperCase();
    acc[curr] = (acc[curr] || 0) + Number(p.total_amount || 0);
    return acc;
  }, {});

  const committedNGN = committedByCurrency["NGN"] || 0;
  const committedUSD = committedByCurrency["USD"] || 0;
  const hasMultipleCommittedCurrencies = Object.keys(committedByCurrency).length > 1;
  const committed = (purchaseOrders as Array<{ total_amount?: number | null }>).reduce(
    (sum: number, p) => sum + Number(p.total_amount || 0),
    0,
  );

  return {
    requisitions: (reqsRes.data ?? []) as unknown as Record<string, unknown>[],
    steps: (stepsRes.data ?? []) as unknown as Record<string, unknown>[],
    purchaseOrders: purchaseOrders as unknown as Record<string, unknown>[],
    projectsList: (projectsRes.data ?? []) as unknown as Record<string, unknown>[],
    projectCount: projectsRes.data?.length ?? 0,
    supplierCount: suppliersRes.count ?? 0,
    memberCount: membersRes.count ?? 0,
    requisitionItems: (itemsRes.data ?? []) as unknown as Record<string, unknown>[],
    deliveryReceipts: (receiptsRes.data ?? []) as unknown as Record<string, unknown>[],
    quotes: (quotesRes.data ?? []) as unknown as Record<string, unknown>[],
    committedNGN,
    committedUSD,
    hasMultipleCommittedCurrencies,
    committed,
  };
}
