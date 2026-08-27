import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { money } from "@/lib/format";

type Role = "requester" | "approver" | "procurement_officer" | "finance" | "executive" | "admin";

export type Actor = {
  userId: string;
  orgId: string;
  fullName: string;
  email: string;
  roles: Role[];
};

/** Loads the caller's org + roles. Never trusts client-supplied identity. */
export async function loadActor(userId: string): Promise<Actor> {
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("id, org_id, full_name, email")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!profile?.org_id) throw new Error("Your account is not linked to an organization yet.");

  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", profile.org_id);

  return {
    userId,
    orgId: profile.org_id,
    fullName: profile.full_name || profile.email,
    email: profile.email,
    roles: (roles ?? []).map((r) => r.role as Role),
  };
}

function requireRole(actor: Actor, allowed: Role[]) {
  if (!actor.roles.some((r) => allowed.includes(r))) {
    throw new Error("You do not have permission to do this.");
  }
}

async function logAudit(entry: {
  orgId: string;
  requisitionId?: string | null;
  actor?: Actor | null;
  actorRole?: Role | null;
  action: string;
  detail?: string | null;
  amount?: number | null;
}) {
  await supabaseAdmin.from("approval_audit_log").insert({
    org_id: entry.orgId,
    requisition_id: entry.requisitionId ?? null,
    actor_id: entry.actor?.userId ?? null,
    actor_name: entry.actor?.fullName ?? "Supplier (external)",
    actor_role: entry.actorRole ?? null,
    action: entry.action,
    detail: entry.detail ?? null,
    amount: entry.amount ?? null,
  });
}

export async function projectBudgetStatus(projectId: string) {
  const { data, error } = await supabaseAdmin
    .rpc("project_budget_status", { _project_id: projectId })
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    budget: Number(data?.budget_amount ?? 0),
    committed: Number(data?.committed ?? 0),
    issued: Number(data?.issued ?? 0),
    remaining: Number(data?.remaining ?? 0),
  };
}

export async function attachmentUploadUrl(
  userId: string,
  input: { itemId: string; filename: string; contentType: string },
) {
  const actor = await loadActor(userId);
  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  let path: string;

  if (input.itemId) {
    const { data: item } = await supabaseAdmin
      .from("requisition_items")
      .select("id, requisition_id, requisitions!inner(org_id)")
      .eq("id", input.itemId)
      .maybeSingle();

    if (item && (item.requisitions as { org_id: string }).org_id === actor.orgId) {
      path = `${actor.orgId}/${item.requisition_id}/${item.id}/${Date.now()}_${safeName}`;
    } else {
      path = `${actor.orgId}/drafts/${input.itemId}/${Date.now()}_${safeName}`;
    }
  } else {
    path = `${actor.orgId}/drafts/${Date.now()}_${safeName}`;
  }

  const { data, error } = await supabaseAdmin.storage
    .from("requisition-attachments")
    .createSignedUploadUrl(path);

  if (error || !data) {
    // If bucket signed upload URL creation fails, try upload fallback or throw descriptive message
    throw new Error("Couldn't create upload link: " + (error?.message ?? "Storage error"));
  }
  return { path, signedUrl: data.signedUrl, token: data.token };
}

const DEFAULT_RULES = [
  {
    label: "Small spend",
    min_amount: 0,
    max_amount: 500000,
    required_roles: ["approver"],
    extra_role_if_unbudgeted: "finance",
    sort_order: 1,
  },
  {
    label: "Mid spend",
    min_amount: 500000,
    max_amount: 5000000,
    required_roles: ["approver", "finance"],
    extra_role_if_unbudgeted: "admin",
    sort_order: 2,
  },
  {
    label: "High value spend",
    min_amount: 5000000,
    max_amount: null,
    required_roles: ["finance", "admin"],
    extra_role_if_unbudgeted: "executive",
    sort_order: 3,
  },
];

export async function bootstrapOrganization(
  userId: string,
  email: string,
  input: { orgName: string; fullName: string; department?: string | undefined },
) {
  const existing = await supabaseAdmin
    .from("profiles")
    .select("org_id")
    .eq("id", userId)
    .maybeSingle();
  if (existing.data?.org_id) return { orgId: existing.data.org_id };

  const { data: org, error: orgError } = await supabaseAdmin
    .from("organizations")
    .insert({ name: input.orgName })
    .select("id")
    .single();
  if (orgError) throw new Error(orgError.message);

  const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
    id: userId,
    org_id: org.id,
    full_name: input.fullName,
    email,
    department: input.department ?? null,
  });
  if (profileError) throw new Error(profileError.message);

  // The first member of a new organization gets every role so they can
  // configure rules and walk the whole flow; they can narrow this later.
  const allRoles: Role[] = [
    "requester",
    "approver",
    "procurement_officer",
    "finance",
    "executive",
    "admin",
  ];
  await supabaseAdmin
    .from("user_roles")
    .insert(allRoles.map((role) => ({ user_id: userId, org_id: org.id, role })));

  await supabaseAdmin
    .from("approval_rules")
    .insert(DEFAULT_RULES.map((r) => ({ ...r, org_id: org.id })) as never);

  await supabaseAdmin
    .from("projects")
    .insert({ org_id: org.id, name: "General / unassigned", location: null });

  return { orgId: org.id };
}

export async function setMemberRoles(
  actorUserId: string,
  input: { targetUserId: string; roles: Role[] },
) {
  const actor = await loadActor(actorUserId);
  requireRole(actor, ["admin"]);
  const target = await supabaseAdmin
    .from("profiles")
    .select("id, org_id, full_name")
    .eq("id", input.targetUserId)
    .maybeSingle();
  if (!target.data || target.data.org_id !== actor.orgId) {
    throw new Error("That teammate is not in your organization.");
  }
  await supabaseAdmin
    .from("user_roles")
    .delete()
    .eq("user_id", input.targetUserId)
    .eq("org_id", actor.orgId);
  if (input.roles.length) {
    await supabaseAdmin.from("user_roles").insert(
      input.roles.map((role) => ({
        user_id: input.targetUserId,
        org_id: actor.orgId,
        role,
      })),
    );
  }
  await logAudit({
    orgId: actor.orgId,
    actor,
    action: "roles_updated",
    detail: `${target.data.full_name}: ${input.roles.join(", ") || "no roles"}`,
  });
  return { ok: true };
}

/**
 * Threshold routing engine.
 *
 * This deliberately lives in server code, not in an RLS policy: the chain is a
 * function of org-editable rule rows plus the requisition amount and budget
 * flag, and it has to produce ordered steps. RLS still guards every read/write.
 */
export async function computeApprovalChain(orgId: string, amount: number, isUnbudgeted: boolean) {
  const { data: rules, error } = await supabaseAdmin
    .from("approval_rules")
    .select("*")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);

  const rule = (rules ?? []).find((r) => {
    const min = Number(r.min_amount ?? 0);
    const max = r.max_amount === null ? Infinity : Number(r.max_amount);
    return amount >= min && amount < max;
  });

  if (!rule) {
    return {
      ruleLabel: "Fallback",
      mode: "sequential" as const,
      steps: [
        {
          role: "admin" as Role,
          order: 1,
          reason: "No matching threshold rule — routed to Admin",
        },
      ],
    };
  }

  const mode = (rule.approval_mode ?? "sequential") as "sequential" | "parallel";
  const roles = rule.required_roles as Role[];

  // Sequential: one step per role, each unlocked only when the earlier one clears.
  // Parallel: every required role shares step 1, so they can decide independently.
  const steps = roles.map((role, index) => ({
    role,
    order: mode === "parallel" ? 1 : index + 1,
    reason:
      mode === "parallel"
        ? `${rule.label} threshold — parallel approval`
        : `${rule.label} threshold — step ${index + 1} of ${roles.length}`,
  }));

  if (isUnbudgeted && rule.extra_role_if_unbudgeted) {
    // The unbudgeted gate always lands last, after the band's own approvals.
    const lastOrder = steps.reduce((max, s) => Math.max(max, s.order), 0);
    steps.push({
      role: rule.extra_role_if_unbudgeted as Role,
      order: lastOrder + 1,
      reason: "Extra approval required: flagged unbudgeted",
    });
  }

  return { ruleLabel: rule.label, mode, steps };
}

export async function previewChain(
  userId: string,
  input: { amount: number; isUnbudgeted: boolean },
) {
  const actor = await loadActor(userId);
  return computeApprovalChain(actor.orgId, input.amount, input.isUnbudgeted);
}

export async function submitRequisition(userId: string, requisitionId: string) {
  const actor = await loadActor(userId);
  const { data: req, error } = await supabaseAdmin
    .from("requisitions")
    .select("*")
    .eq("id", requisitionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!req || req.org_id !== actor.orgId) throw new Error("Requisition not found.");
  if (req.requester_id !== userId && !actor.roles.includes("admin")) {
    throw new Error("Only the requester can submit this request.");
  }
  if (req.status !== "draft") throw new Error("This request has already been submitted.");

  const { data: items } = await supabaseAdmin
    .from("requisition_items")
    .select("quantity, estimated_unit_price")
    .eq("requisition_id", requisitionId);
  const total = (items ?? []).reduce(
    (sum, i) => sum + Number(i.quantity) * Number(i.estimated_unit_price),
    0,
  );

  const chain = await computeApprovalChain(actor.orgId, total, req.is_unbudgeted);

  await supabaseAdmin.from("approval_steps").insert(
    chain.steps.map((step) => ({
      org_id: actor.orgId,
      requisition_id: requisitionId,
      step_order: step.order,
      required_role: step.role,
      reason: step.reason,
    })),
  );

  await supabaseAdmin
    .from("requisitions")
    .update({
      status: "pending_approval",
      total_amount: total,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", requisitionId);

  await logAudit({
    orgId: actor.orgId,
    requisitionId,
    actor,
    action: "submitted",
    detail: `Routed by "${chain.ruleLabel}" (${chain.mode}) to ${chain.steps
      .map((s) => s.role)
      .join(chain.mode === "parallel" ? " + " : " → ")}`,

    amount: total,
  });

  const firstRoles =
    chain.mode === "parallel"
      ? chain.steps.map((s) => s.role)
      : chain.steps[0]
        ? [chain.steps[0].role]
        : [];
  await notifyApprovers(actor.orgId, requisitionId, firstRoles, {
    kind: "approval_needed",
    title: `Approval needed: ${req!.title}`,
    body: `${actor.fullName} submitted a ${money(total, req!.currency as "NGN" | "USD")} request.`,
  });

  return { total, chain };
}

export async function decideApproval(
  userId: string,
  input: { stepId: string; decision: "approved" | "rejected"; comment?: string | undefined },
) {
  const actor = await loadActor(userId);
  const { data: step } = await supabaseAdmin
    .from("approval_steps")
    .select("*")
    .eq("id", input.stepId)
    .maybeSingle();
  if (!step || step.org_id !== actor.orgId) throw new Error("Approval step not found.");
  if (step.status !== "pending") throw new Error("This step has already been decided.");
  if (!actor.roles.includes(step.required_role as Role)) {
    throw new Error("This approval is routed to a different role.");
  }

  const { data: siblings } = await supabaseAdmin
    .from("approval_steps")
    .select("id, step_order, status, required_role")
    .eq("requisition_id", step.requisition_id)
    .order("step_order", { ascending: true });

  const earlierPending = (siblings ?? []).some(
    (s) => s.step_order < step.step_order && s.status === "pending",
  );
  if (earlierPending) throw new Error("An earlier approval is still outstanding.");

  await supabaseAdmin
    .from("approval_steps")
    .update({
      status: input.decision,
      decided_by: userId,
      decided_at: new Date().toISOString(),
      comment: input.comment ?? null,
    })
    .eq("id", input.stepId);

  const remaining = (siblings ?? []).filter(
    (s) => s.id !== input.stepId && s.status === "pending",
  ).length;

  let newStatus: string | null = null;
  if (input.decision === "rejected") {
    newStatus = "rejected";
    // A rejection ends the chain: nothing else can still be waiting on someone.
    await supabaseAdmin
      .from("approval_steps")
      .update({ status: "skipped", decided_at: new Date().toISOString() })
      .eq("requisition_id", step.requisition_id)
      .eq("status", "pending");
  } else if (remaining === 0) {
    newStatus = "approved";
  }

  if (newStatus) {
    await supabaseAdmin
      .from("requisitions")
      .update({ status: newStatus as never, updated_at: new Date().toISOString() })
      .eq("id", step.requisition_id);
  }

  await logAudit({
    orgId: actor.orgId,
    requisitionId: step.requisition_id,
    actor,
    actorRole: step.required_role as Role,
    action: input.decision === "approved" ? "approval_granted" : "approval_rejected",
    detail: input.comment ?? null,
  });

  const { data: req } = await supabaseAdmin
    .from("requisitions")
    .select("title, currency, requester_id")
    .eq("id", step.requisition_id)
    .maybeSingle();
  if (req) {
    if (input.decision === "rejected") {
      await notify(actor.orgId, [req.requester_id], {
        kind: "requisition_rejected",
        title: `Requisition rejected: ${req.title}`,
        body: `${actor.fullName} rejected the request.`,
        requisitionId: step.requisition_id,
      });
    } else if (remaining === 0) {
      await notify(actor.orgId, [req.requester_id], {
        kind: "requisition_approved",
        title: `Requisition approved: ${req.title}`,
        body: `All required approvals are in.`,
        requisitionId: step.requisition_id,
      });
      const procurement = await approverUserIds(actor.orgId, ["procurement_officer", "admin"]);
      await notify(actor.orgId, procurement, {
        kind: "rfq_ready",
        title: `Ready for RFQ: ${req.title}`,
        body: `The requisition is fully approved and ready for quotes.`,
        requisitionId: step.requisition_id,
      });
    } else {
      const nextStep = (siblings ?? []).find(
        (s) => s.id !== input.stepId && s.status === "pending" && s.step_order > step.step_order,
      );
      if (nextStep) {
        await notifyApprovers(actor.orgId, step.requisition_id, [nextStep.required_role as Role], {
          kind: "approval_needed",
          title: `Approval needed: ${req.title}`,
          body: `${actor.fullName} approved the previous step.`,
        });
      }
    }
  }

  return { requisitionStatus: newStatus, remaining };
}

export async function createRfq(
  userId: string,
  input: {
    requisitionId: string;
    supplierIds: string[];
    instructions?: string | undefined;
    closesAt: string;
  },
) {
  const actor = await loadActor(userId);
  requireRole(actor, ["procurement_officer", "admin"]);
  if (!input.supplierIds.length) throw new Error("Invite at least one supplier.");

  const { data: req } = await supabaseAdmin
    .from("requisitions")
    .select("*")
    .eq("id", input.requisitionId)
    .maybeSingle();
  if (!req || req.org_id !== actor.orgId) throw new Error("Requisition not found.");
  if (req.status !== "approved") throw new Error("Only approved requests can go out for quotes.");

  const { data: rfq, error } = await supabaseAdmin
    .from("rfqs")
    .insert({
      org_id: actor.orgId,
      requisition_id: input.requisitionId,
      title: req.title,
      instructions: input.instructions ?? null,
      closes_at: input.closesAt,
      created_by: userId,
    })
    .select("id, reference")
    .single();
  if (error) throw new Error(error.message);

  const { data: invitations } = await supabaseAdmin
    .from("rfq_invitations")
    .insert(
      input.supplierIds.map((supplierId) => ({
        org_id: actor.orgId,
        rfq_id: rfq.id,
        supplier_id: supplierId,
        expires_at: input.closesAt,
      })),
    )
    .select("token, supplier_id");

  await supabaseAdmin
    .from("requisitions")
    .update({ status: "rfq_issued", updated_at: new Date().toISOString() })
    .eq("id", input.requisitionId);

  await logAudit({
    orgId: actor.orgId,
    requisitionId: input.requisitionId,
    actor,
    action: "rfq_issued",
    detail: `${rfq.reference} sent to ${input.supplierIds.length} supplier(s)`,
  });

  return { rfqId: rfq.id, reference: rfq.reference, invitations: invitations ?? [] };
}

export async function recommendation(rfqId: string) {
  const { data: quotes } = await supabaseAdmin
    .from("quotes")
    .select("id, total_amount, currency, supplier_id, suppliers(name, is_compliant)")
    .eq("rfq_id", rfqId)
    .eq("status", "submitted");
  const compliant = (quotes ?? []).filter(
    (q) => (q.suppliers as { is_compliant: boolean } | null)?.is_compliant !== false,
  );
  if (!compliant.length) return null;
  return compliant.reduce((best, q) =>
    Number(q.total_amount) < Number(best.total_amount) ? q : best,
  );
}

// Org-scoped wrapper: never let a caller read another organization's bid data.
export async function recommendationForUser(userId: string, rfqId: string) {
  const actor = await loadActor(userId);
  const { data: rfq } = await supabaseAdmin
    .from("rfqs")
    .select("id, org_id")
    .eq("id", rfqId)
    .maybeSingle();
  if (!rfq || rfq.org_id !== actor.orgId) throw new Error("RFQ not found.");
  return recommendation(rfqId);
}

export async function awardQuote(
  userId: string,
  input: {
    rfqId: string;
    quoteId: string;
    settlementCurrency: "NGN" | "USD";
    overrideReason?: string | undefined;
    deliveryAddress?: string | undefined;
    fxRateNote?: string | undefined;
  },
) {
  const actor = await loadActor(userId);
  requireRole(actor, ["procurement_officer", "admin"]);

  const { data: rfq } = await supabaseAdmin
    .from("rfqs")
    .select("*")
    .eq("id", input.rfqId)
    .maybeSingle();
  if (!rfq || rfq.org_id !== actor.orgId) throw new Error("RFQ not found.");
  if (rfq.status === "awarded") throw new Error("This RFQ has already been awarded.");

  const { data: quote } = await supabaseAdmin
    .from("quotes")
    .select("*")
    .eq("id", input.quoteId)
    .maybeSingle();
  if (!quote || quote.rfq_id !== input.rfqId) throw new Error("Quote not found.");

  const recommended = await recommendation(input.rfqId);
  const isOverride = !!recommended && recommended.id !== input.quoteId;
  if (isOverride && !input.overrideReason?.trim()) {
    throw new Error(
      "A written reason is required when you pick a supplier other than the recommended lowest compliant bid.",
    );
  }

  const { data: quoteItems } = await supabaseAdmin
    .from("quote_items")
    .select("description, quantity, unit_price, currency, sort_order")
    .eq("quote_id", input.quoteId)
    .order("sort_order", { ascending: true });

  const { data: po, error } = await supabaseAdmin
    .from("purchase_orders")
    .insert({
      org_id: actor.orgId,
      requisition_id: rfq.requisition_id,
      rfq_id: input.rfqId,
      quote_id: input.quoteId,
      supplier_id: quote.supplier_id,
      settlement_currency: input.settlementCurrency,
      total_amount: quote.total_amount,
      delivery_address: input.deliveryAddress ?? null,
      fx_rate_note: input.fxRateNote ?? null,
      override_reason: isOverride ? input.overrideReason!.trim() : null,
      recommended_quote_id: recommended?.id ?? null,
      issued_by: userId,
    })
    .select("id, po_number")
    .single();
  if (error) throw new Error(error.message);

  if (quoteItems?.length) {
    await supabaseAdmin
      .from("po_line_items")
      .insert(quoteItems.map((i) => ({ ...i, purchase_order_id: po.id })));
  }

  await supabaseAdmin.from("quotes").update({ status: "awarded" }).eq("id", input.quoteId);
  await supabaseAdmin
    .from("quotes")
    .update({ status: "rejected" })
    .eq("rfq_id", input.rfqId)
    .neq("id", input.quoteId);
  await supabaseAdmin.from("rfqs").update({ status: "awarded" }).eq("id", input.rfqId);
  await supabaseAdmin
    .from("requisitions")
    .update({ status: "po_issued", updated_at: new Date().toISOString() })
    .eq("id", rfq.requisition_id);

  await logAudit({
    orgId: actor.orgId,
    requisitionId: rfq.requisition_id,
    actor,
    action: "po_issued",
    detail: isOverride
      ? `${po.po_number} — recommendation overridden: ${input.overrideReason!.trim()}`
      : `${po.po_number} — recommended supplier selected`,
    amount: Number(quote.total_amount),
  });

  const { data: req } = await supabaseAdmin
    .from("requisitions")
    .select("title, requester_id")
    .eq("id", rfq.requisition_id)
    .maybeSingle();
  if (req) {
    await notify(actor.orgId, [req.requester_id], {
      kind: "po_issued",
      title: `Purchase order issued: ${req.title}`,
      body: `${po.po_number} has been created and sent to the supplier.`,
      requisitionId: rfq.requisition_id,
    });
  }

  return { purchaseOrderId: po.id, poNumber: po.po_number, wasOverride: isOverride };
}

/* ---------- Supplier portal (token access, no login) ---------- */

export async function supplierRfqByToken(token: string) {
  const { data: invite } = await supabaseAdmin
    .from("rfq_invitations")
    .select("id, rfq_id, supplier_id, expires_at, org_id")
    .eq("token", token)
    .maybeSingle();
  if (!invite) return { error: "This quote link is not valid." as const };
  if (new Date(invite.expires_at) < new Date()) {
    return { error: "This quote link has expired. Ask the buyer for a fresh link." as const };
  }

  const [{ data: rfq }, { data: supplier }, { data: quote }] = await Promise.all([
    supabaseAdmin
      .from("rfqs")
      .select("id, reference, title, instructions, closes_at, status, requisition_id")
      .eq("id", invite.rfq_id)
      .single(),
    supabaseAdmin.from("suppliers").select("id, name").eq("id", invite.supplier_id).single(),
    supabaseAdmin
      .from("quotes")
      .select("id, total_amount, currency, lead_time_days, status, submitted_at")
      .eq("rfq_id", invite.rfq_id)
      .eq("supplier_id", invite.supplier_id)
      .maybeSingle(),
  ]);

  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("name")
    .eq("id", invite.org_id)
    .single();

  const { data: items } = await supabaseAdmin
    .from("requisition_items")
    .select("id, description, quantity, unit")
    .eq("requisition_id", rfq!.requisition_id)
    .order("sort_order", { ascending: true });

  await supabaseAdmin
    .from("rfq_invitations")
    .update({ opened_at: new Date().toISOString() })
    .eq("id", invite.id)
    .is("opened_at", null);

  // Only this supplier's own quote is ever returned — never a competitor's.
  return {
    buyerName: org?.name ?? "Buyer",
    supplierName: supplier?.name ?? "Supplier",
    rfq: rfq!,
    items: items ?? [],
    myQuote: quote ?? null,
  };
}

/** Everyone in the org who should hear about supplier activity on an RFQ. */
async function rfqWatchers(orgId: string, createdBy?: string | null) {
  const { data: roleRows } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, role")
    .eq("org_id", orgId)
    .in("role", ["procurement_officer", "admin"]);
  const ids = new Set((roleRows ?? []).map((r) => r.user_id));
  if (createdBy) ids.add(createdBy);
  return [...ids];
}

async function notify(
  orgId: string,
  userIds: string[],
  payload: {
    kind: string;
    title: string;
    body?: string | null;
    rfqId?: string | null;
    requisitionId?: string | null;
  },
) {
  if (!userIds.length) return;
  await supabaseAdmin.from("notifications").insert(
    userIds.map((userId) => ({
      org_id: orgId,
      user_id: userId,
      kind: payload.kind,
      title: payload.title,
      body: payload.body ?? null,
      rfq_id: payload.rfqId ?? null,
      requisition_id: payload.requisitionId ?? null,
    })),
  );
}

async function approverUserIds(orgId: string, roles: Role[]) {
  const { data } = await supabaseAdmin.rpc("org_users_with_roles", {
    _org_id: orgId,
    _roles: roles,
  });
  return (data ?? []).map((u: { user_id: string }) => u.user_id);
}

async function notifyApprovers(
  orgId: string,
  requisitionId: string,
  roles: Role[],
  payload: { kind: string; title: string; body?: string | null },
) {
  const ids = await approverUserIds(orgId, roles);
  await notify(orgId, ids, { ...payload, requisitionId });
}

export async function submitSupplierQuote(input: {
  token: string;
  currency: "NGN" | "USD";
  leadTimeDays?: number | undefined;
  paymentTerms?: string | undefined;
  warrantyNote?: string | undefined;
  deliveryCharge?: number | undefined;
  validityDays?: number | undefined;
  attachment?: { name: string; contentType: string; dataBase64: string } | undefined;
  lines: {
    requisitionItemId: string;
    description: string;
    quantity: number;
    unitPrice: number;
    vatRate?: number | undefined;
  }[];
}) {
  const { data: invite } = await supabaseAdmin
    .from("rfq_invitations")
    .select("id, rfq_id, supplier_id, org_id, expires_at")
    .eq("token", input.token)
    .maybeSingle();
  if (!invite) throw new Error("This quote link is not valid.");
  if (new Date(invite.expires_at) < new Date()) throw new Error("This quote link has expired.");

  const { data: rfq } = await supabaseAdmin
    .from("rfqs")
    .select("id, status, requisition_id, reference, created_by")
    .eq("id", invite.rfq_id)
    .single();
  if (!rfq || rfq.status !== "open") throw new Error("This RFQ is closed for new quotes.");

  const existing = await supabaseAdmin
    .from("quotes")
    .select("id")
    .eq("rfq_id", invite.rfq_id)
    .eq("supplier_id", invite.supplier_id)
    .maybeSingle();
  if (existing.data) throw new Error("You have already submitted a quote for this request.");

  const round2 = (n: number) => Math.round(n * 100) / 100;
  // VAT is always derived server-side: line value × line rate. Suppliers never type an amount.
  const computedLines = input.lines.map((l) => {
    const lineValue = l.quantity * l.unitPrice;
    const rate = Math.min(Math.max(l.vatRate ?? 7.5, 0), 100);
    return { ...l, lineValue, vatRate: rate, vatAmount: round2((lineValue * rate) / 100) };
  });
  const subtotal = round2(computedLines.reduce((sum, l) => sum + l.lineValue, 0));
  const vat = round2(computedLines.reduce((sum, l) => sum + l.vatAmount, 0));
  const delivery = input.deliveryCharge ?? 0;
  const total = round2(subtotal + vat + delivery);

  let attachmentPath: string | null = null;
  if (input.attachment) {
    const safeName = input.attachment.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const path = `${invite.org_id}/${invite.rfq_id}/${invite.supplier_id}-${Date.now()}-${safeName}`;
    const bytes = Uint8Array.from(atob(input.attachment.dataBase64), (c) => c.charCodeAt(0));
    const upload = await supabaseAdmin.storage
      .from("quote-attachments")
      .upload(path, bytes, { contentType: input.attachment.contentType, upsert: false });
    if (upload.error) throw new Error("Couldn't upload your attachment. Try a smaller file.");
    attachmentPath = path;
  }

  const { data: quote, error } = await supabaseAdmin
    .from("quotes")
    .insert({
      org_id: invite.org_id,
      rfq_id: invite.rfq_id,
      supplier_id: invite.supplier_id,
      currency: input.currency,
      subtotal,
      vat_amount: vat,
      delivery_charge: delivery,
      total_amount: total,
      lead_time_days: input.leadTimeDays ?? null,
      validity_days: input.validityDays ?? null,
      payment_terms: input.paymentTerms ?? null,
      warranty_note: input.warrantyNote ?? null,
      attachment_path: attachmentPath,
      status: "submitted",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await supabaseAdmin.from("quote_items").insert(
    computedLines.map((l, index) => ({
      quote_id: quote.id,
      requisition_item_id: l.requisitionItemId,
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unitPrice,
      vat_rate: l.vatRate,
      vat_amount: l.vatAmount,
      currency: input.currency,
      sort_order: index,
    })),
  );

  await supabaseAdmin
    .from("rfq_invitations")
    .update({ responded_at: new Date().toISOString() })
    .eq("id", invite.id);

  const { data: supplier } = await supabaseAdmin
    .from("suppliers")
    .select("name")
    .eq("id", invite.supplier_id)
    .maybeSingle();

  const watchers = await rfqWatchers(invite.org_id, rfq.created_by);
  await notify(invite.org_id, watchers, {
    kind: "quote_received",
    title: `Quote in from ${supplier?.name ?? "a supplier"}`,
    body: `${rfq.reference} — ${new Intl.NumberFormat("en-NG", { style: "currency", currency: input.currency }).format(total)}`,
    rfqId: rfq.id,
    requisitionId: rfq.requisition_id,
  });

  // All invited suppliers in? Tell procurement once.
  const [{ count: inviteCount }, { count: quoteCount }] = await Promise.all([
    supabaseAdmin
      .from("rfq_invitations")
      .select("id", { count: "exact", head: true })
      .eq("rfq_id", rfq.id),
    supabaseAdmin.from("quotes").select("id", { count: "exact", head: true }).eq("rfq_id", rfq.id),
  ]);
  if (inviteCount && quoteCount && quoteCount >= inviteCount) {
    const { data: fresh } = await supabaseAdmin
      .from("rfqs")
      .select("all_responded_notified_at")
      .eq("id", rfq.id)
      .maybeSingle();
    if (!fresh?.all_responded_notified_at) {
      await supabaseAdmin
        .from("rfqs")
        .update({ all_responded_notified_at: new Date().toISOString() })
        .eq("id", rfq.id);
      await notify(invite.org_id, watchers, {
        kind: "all_quotes_in",
        title: `All ${inviteCount} suppliers have quoted`,
        body: `${rfq.reference} is ready to compare and award.`,
        rfqId: rfq.id,
        requisitionId: rfq.requisition_id,
      });
    }
  }

  await logAudit({
    orgId: invite.org_id,
    requisitionId: rfq.requisition_id,
    action: "quote_submitted",
    detail: `${rfq.reference}: quote received from ${supplier?.name ?? "supplier"}`,
    amount: total,
  });

  return { ok: true, total };
}

/** Closes RFQs whose deadline has passed and notifies procurement once each. */
export async function sweepRfqDeadlines(userId: string) {
  const actor = await loadActor(userId);
  const now = new Date().toISOString();
  const { data: due } = await supabaseAdmin
    .from("rfqs")
    .select("id, reference, requisition_id, created_by, closes_at")
    .eq("org_id", actor.orgId)
    .eq("status", "open")
    .lt("closes_at", now)
    .is("closed_notified_at", null);

  for (const rfq of due ?? []) {
    await supabaseAdmin
      .from("rfqs")
      .update({ status: "closed", closed_notified_at: now })
      .eq("id", rfq.id);
    const { count } = await supabaseAdmin
      .from("quotes")
      .select("id", { count: "exact", head: true })
      .eq("rfq_id", rfq.id);
    await notify(actor.orgId, await rfqWatchers(actor.orgId, rfq.created_by), {
      kind: "rfq_deadline_passed",
      title: `Quote deadline passed on ${rfq.reference}`,
      body: `${count ?? 0} quote(s) received. Compare what came in and award.`,
      rfqId: rfq.id,
      requisitionId: rfq.requisition_id,
    });
  }

  return { closed: (due ?? []).length };
}

/** Short-lived download link for a supplier's quote attachment. */
export async function quoteAttachmentUrl(userId: string, quoteId: string) {
  const actor = await loadActor(userId);
  requireRole(actor, ["procurement_officer", "finance", "executive", "admin"]);
  const { data: quote } = await supabaseAdmin
    .from("quotes")
    .select("id, org_id, attachment_path")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote || quote.org_id !== actor.orgId || !quote.attachment_path) {
    throw new Error("No attachment on this quote.");
  }
  const { data, error } = await supabaseAdmin.storage
    .from("quote-attachments")
    .createSignedUrl(quote.attachment_path, 300);
  if (error || !data) throw new Error("Couldn't create a download link.");
  return { url: data.signedUrl };
}

/**
 * Every supplier invited to an RFQ, with their live status and their original
 * (unchanged) token so procurement can copy or re-share the link at any time.
 */
export async function rfqInvitationLinks(userId: string, rfqId: string) {
  const actor = await loadActor(userId);
  requireRole(actor, ["procurement_officer", "finance", "executive", "admin"]);

  const { data: rfq } = await supabaseAdmin
    .from("rfqs")
    .select("id, org_id, reference, title, closes_at, status")
    .eq("id", rfqId)
    .maybeSingle();
  if (!rfq || rfq.org_id !== actor.orgId) throw new Error("RFQ not found.");

  const [{ data: invites }, { data: quotes }] = await Promise.all([
    supabaseAdmin
      .from("rfq_invitations")
      .select(
        "id, token, supplier_id, expires_at, opened_at, responded_at, created_at, suppliers(name, email, contact_name)",
      )
      .eq("rfq_id", rfqId)
      .order("created_at", { ascending: true }),
    supabaseAdmin.from("quotes").select("id, supplier_id, status").eq("rfq_id", rfqId),
  ]);

  const quoted = new Set((quotes ?? []).map((q) => q.supplier_id));

  return {
    rfq: {
      reference: rfq.reference,
      title: rfq.title,
      closesAt: rfq.closes_at,
      status: rfq.status,
    },
    invitations: (invites ?? []).map((i) => {
      const supplier = i.suppliers as {
        name: string;
        email: string | null;
        contact_name: string | null;
      } | null;
      const status = quoted.has(i.supplier_id)
        ? "quote_submitted"
        : i.opened_at
          ? "viewed"
          : "link_sent";
      return {
        id: i.id,
        token: i.token,
        supplierId: i.supplier_id,
        supplierName: supplier?.name ?? "Supplier",
        supplierEmail: supplier?.email ?? null,
        contactName: supplier?.contact_name ?? null,
        expiresAt: i.expires_at,
        openedAt: i.opened_at,
        respondedAt: i.responded_at,
        expired: new Date(i.expires_at).getTime() < Date.now(),
        status,
      };
    }),
  };
}

/**
 * Re-share the SAME invitation link with a supplier. The token is never
 * regenerated, so a draft quote the supplier already started stays valid.
 */
export async function resendRfqInvitation(
  userId: string,
  input: { invitationId: string; baseUrl: string },
) {
  const actor = await loadActor(userId);
  requireRole(actor, ["procurement_officer", "admin"]);

  const { data: invite } = await supabaseAdmin
    .from("rfq_invitations")
    .select(
      "id, org_id, token, expires_at, rfqs(reference, title, closes_at, instructions), suppliers(name, email, contact_name)",
    )
    .eq("id", input.invitationId)
    .maybeSingle();
  if (!invite || invite.org_id !== actor.orgId) throw new Error("Invitation not found.");

  const supplier = invite.suppliers as {
    name: string;
    email: string | null;
    contact_name: string | null;
  } | null;
  const rfq = invite.rfqs as {
    reference: string;
    title: string;
    closes_at: string;
    instructions: string | null;
  } | null;
  if (!supplier?.email) {
    throw new Error(`${supplier?.name ?? "This supplier"} has no email address on file.`);
  }

  const url = `${input.baseUrl.replace(/\/$/, "")}/quote/${invite.token}`;
  const closes = new Date(rfq?.closes_at ?? invite.expires_at).toLocaleString("en-NG");
  const subject = `Reminder: quote request ${rfq?.reference ?? ""} — ${rfq?.title ?? ""}`.trim();
  const body = [
    `Hello ${supplier.contact_name ?? supplier.name},`,
    "",
    `This is the same private link we sent for ${rfq?.reference ?? "our quote request"} (${rfq?.title ?? ""}).`,
    "It has not changed, so anything you already started is still there.",
    "",
    url,
    "",
    `Quotes close: ${closes}`,
    rfq?.instructions ? `\nNotes: ${rfq.instructions}` : "",
    "",
    actor.fullName ?? "",
  ]
    .filter((l) => l !== undefined)
    .join("\n");

  return { email: supplier.email, supplierName: supplier.name, url, subject, body };
}

/* ---------- Foundations: team invitations & projects ---------- */

export async function inviteTeammate(actorUserId: string, input: { email: string; roles: Role[] }) {
  const actor = await loadActor(actorUserId);
  requireRole(actor, ["admin"]);
  const email = input.email.trim().toLowerCase();
  const roles = input.roles.length ? input.roles : (["requester"] as Role[]);

  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("id, org_id")
    .ilike("email", email)
    .maybeSingle();

  if (existingProfile?.org_id && existingProfile.org_id !== actor.orgId) {
    throw new Error("That person already belongs to another organization.");
  }

  // Already a teammate: just set their roles.
  if (existingProfile?.org_id === actor.orgId) {
    await setMemberRoles(actorUserId, { targetUserId: existingProfile.id, roles });
    return { ok: true, mode: "roles_updated" as const };
  }

  await supabaseAdmin
    .from("org_invitations")
    .delete()
    .eq("org_id", actor.orgId)
    .eq("status", "pending")
    .ilike("email", email);

  const { error } = await supabaseAdmin.from("org_invitations").insert({
    org_id: actor.orgId,
    email,
    roles,
    status: "pending",
    invited_by: actor.userId,
  });
  if (error) throw new Error(error.message);

  await logAudit({
    orgId: actor.orgId,
    actor,
    action: "teammate_invited",
    detail: `${email}: ${roles.join(", ")}`,
  });
  return { ok: true, mode: "invited" as const };
}

export async function cancelInvitation(actorUserId: string, invitationId: string) {
  const actor = await loadActor(actorUserId);
  requireRole(actor, ["admin"]);
  const { error } = await supabaseAdmin
    .from("org_invitations")
    .delete()
    .eq("id", invitationId)
    .eq("org_id", actor.orgId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function pendingInviteForEmail(email: string) {
  if (!email) return null;
  const { data } = await supabaseAdmin
    .from("org_invitations")
    .select("id, org_id, roles, email")
    .ilike("email", email.trim().toLowerCase())
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("name")
    .eq("id", data.org_id)
    .maybeSingle();
  return {
    invitationId: data.id,
    orgId: data.org_id,
    orgName: org?.name ?? "your organization",
    roles: (data.roles ?? []) as Role[],
  };
}

export async function acceptInvite(
  userId: string,
  email: string,
  input: { fullName: string; department?: string | undefined },
) {
  const invite = await pendingInviteForEmail(email);
  if (!invite) throw new Error("We couldn't find a pending invitation for your email.");

  const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
    id: userId,
    org_id: invite.orgId,
    full_name: input.fullName,
    email,
    department: input.department ?? null,
  });
  if (profileError) throw new Error(profileError.message);

  await supabaseAdmin.from("user_roles").delete().eq("user_id", userId).eq("org_id", invite.orgId);
  const roles = invite.roles.length ? invite.roles : (["requester"] as Role[]);
  await supabaseAdmin
    .from("user_roles")
    .insert(roles.map((role) => ({ user_id: userId, org_id: invite.orgId, role })));

  await supabaseAdmin
    .from("org_invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", invite.invitationId);

  await logAudit({
    orgId: invite.orgId,
    action: "invitation_accepted",
    detail: `${input.fullName} (${email}) joined as ${roles.join(", ")}`,
  });

  return { orgId: invite.orgId };
}

export async function createProject(
  actorUserId: string,
  input: { name: string; location?: string | undefined; budgetAmount?: number | undefined },
) {
  const actor = await loadActor(actorUserId);
  requireRole(actor, ["admin", "procurement_officer", "finance", "executive"]);
  const { data, error } = await supabaseAdmin
    .from("projects")
    .insert({
      org_id: actor.orgId,
      name: input.name.trim(),
      location: input.location?.trim() || null,
      budget_amount: input.budgetAmount ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await logAudit({
    orgId: actor.orgId,
    actor,
    action: "project_created",
    detail: input.name.trim(),
    amount: input.budgetAmount ?? null,
  });
  return { projectId: data.id };
}

/* ---------- Purchase order packet (branded PO + acknowledgement) ---------- */

/** Everything a branded purchase order document needs, in one shape. */
async function buildPoPacket(poId: string) {
  const { data: po } = await supabaseAdmin
    .from("purchase_orders")
    .select("*")
    .eq("id", poId)
    .maybeSingle();
  if (!po) throw new Error("Purchase order not found.");

  const [{ data: org }, { data: supplier }, { data: lines }, { data: quote }] = await Promise.all([
    supabaseAdmin.from("organizations").select("name, base_currency").eq("id", po.org_id).single(),
    supabaseAdmin
      .from("suppliers")
      .select("name, contact_name, email, phone, tax_id, is_compliant, rating")
      .eq("id", po.supplier_id ?? "")
      .maybeSingle(),
    supabaseAdmin
      .from("po_line_items")
      .select("id, description, quantity, unit_price, currency, sort_order")
      .eq("purchase_order_id", po.id)
      .order("sort_order", { ascending: true }),
    po.quote_id
      ? supabaseAdmin
          .from("quotes")
          .select(
            "id, currency, subtotal, vat_amount, delivery_charge, total_amount, lead_time_days, payment_terms, warranty_note, validity_days",
          )
          .eq("id", po.quote_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const { data: requisition } = po.requisition_id
    ? await supabaseAdmin
        .from("requisitions")
        .select(
          "id, reference, title, total_amount, currency, is_unbudgeted, needed_by, requester_id, project_id",
        )
        .eq("id", po.requisition_id)
        .maybeSingle()
    : { data: null };

  const [{ data: steps }, { data: audit }] = await Promise.all([
    po.requisition_id
      ? supabaseAdmin
          .from("approval_steps")
          .select("id, step_order, required_role, status, decided_at, comment, decided_by, reason")
          .eq("requisition_id", po.requisition_id)
          .order("step_order", { ascending: true })
      : Promise.resolve({ data: [] }),
    po.requisition_id
      ? supabaseAdmin
          .from("approval_audit_log")
          .select("id, action, detail, actor_name, actor_role, amount, created_at")
          .eq("requisition_id", po.requisition_id)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  const deciderIds = [
    ...new Set((steps ?? []).map((s) => s.decided_by).filter(Boolean)),
  ] as string[];
  const requesterIds = requisition?.requester_id ? [requisition.requester_id] : [];
  const { data: people } =
    deciderIds.length || requesterIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, full_name, email")
          .in("id", [...deciderIds, ...requesterIds])
      : { data: [] };
  const nameOf = (id: string | null) => (people ?? []).find((p) => p.id === id)?.full_name ?? null;

  const { data: project } = requisition?.project_id
    ? await supabaseAdmin
        .from("projects")
        .select("name, location")
        .eq("id", requisition.project_id)
        .maybeSingle()
    : { data: null };

  return {
    po,
    buyer: { name: org?.name ?? "Buyer", baseCurrency: org?.base_currency ?? "NGN" },
    supplier,
    lines: lines ?? [],
    quote: quote ?? null,
    requisition: requisition
      ? { ...requisition, requesterName: nameOf(requisition.requester_id) }
      : null,
    project: project ?? null,
    approvals: (steps ?? []).map((s) => ({ ...s, deciderName: nameOf(s.decided_by) })),
    audit: audit ?? [],
  };
}

/** Internal view of a purchase order, scoped to the caller's organization. */
export async function purchaseOrderDetail(userId: string, poId: string) {
  const actor = await loadActor(userId);
  const packet = await buildPoPacket(poId);
  if (packet.po.org_id !== actor.orgId) throw new Error("Purchase order not found.");
  return packet;
}

/** The supplier's own PO, reached through the same quoting link. Null until awarded. */
export async function supplierPoByToken(token: string) {
  const { data: invite } = await supabaseAdmin
    .from("rfq_invitations")
    .select("id, rfq_id, supplier_id")
    .eq("token", token)
    .maybeSingle();
  if (!invite) return null;

  const { data: po } = await supabaseAdmin
    .from("purchase_orders")
    .select("id")
    .eq("rfq_id", invite.rfq_id)
    .eq("supplier_id", invite.supplier_id)
    .maybeSingle();
  if (!po) return null;

  const packet = await buildPoPacket(po.id);
  // Suppliers never see internal comparison data — only their own order.
  return {
    po: packet.po,
    buyer: packet.buyer,
    supplier: packet.supplier,
    lines: packet.lines,
    quote: packet.quote,
    requisitionReference: packet.requisition?.reference ?? null,
    approvals: packet.approvals.map((a) => ({
      step_order: a.step_order,
      required_role: a.required_role,
      status: a.status,
      decided_at: a.decided_at,
    })),
  };
}

/** Supplier digitally acknowledges the PO from their link. */
export async function acknowledgePoByToken(input: { token: string; signerName: string }) {
  const { data: invite } = await supabaseAdmin
    .from("rfq_invitations")
    .select("id, rfq_id, supplier_id, org_id")
    .eq("token", input.token)
    .maybeSingle();
  if (!invite) throw new Error("This link is not valid.");

  const { data: po } = await supabaseAdmin
    .from("purchase_orders")
    .select("id, po_number, status, requisition_id, acknowledged_at, rfq_id")
    .eq("rfq_id", invite.rfq_id)
    .eq("supplier_id", invite.supplier_id)
    .maybeSingle();
  if (!po) throw new Error("There is no purchase order on this link yet.");
  if (po.acknowledged_at) return { ok: true as const, alreadyAcknowledged: true as const };

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("purchase_orders")
    .update({
      status: "acknowledged",
      acknowledged_at: now,
      acknowledged_by_name: input.signerName.trim(),
    })
    .eq("id", po.id);

  const { data: supplier } = await supabaseAdmin
    .from("suppliers")
    .select("name")
    .eq("id", invite.supplier_id)
    .maybeSingle();

  await logAudit({
    orgId: invite.org_id,
    requisitionId: po.requisition_id,
    action: "po_acknowledged",
    detail: `${po.po_number} acknowledged by ${input.signerName.trim()} (${supplier?.name ?? "supplier"})`,
  });

  await notify(invite.org_id, await rfqWatchers(invite.org_id), {
    kind: "po_acknowledged",
    title: `${supplier?.name ?? "Supplier"} acknowledged ${po.po_number}`,
    body: `Signed off by ${input.signerName.trim()}.`,
    rfqId: po.rfq_id,
    requisitionId: po.requisition_id,
  });

  return { ok: true as const, alreadyAcknowledged: false as const };
}

/* ---------- SRS Core Extensions: Duplication, Deliveries, Invoices & Payments ---------- */

export async function duplicateRequisition(userId: string, requisitionId: string) {
  const actor = await loadActor(userId);
  const { data: sourceReq } = await supabaseAdmin
    .from("requisitions")
    .select("*, requisition_items(*)")
    .eq("id", requisitionId)
    .eq("org_id", actor.orgId)
    .maybeSingle();

  if (!sourceReq) throw new Error("Requisition not found.");

  const { data: newReq, error: reqErr } = await supabaseAdmin
    .from("requisitions")
    .insert({
      org_id: actor.orgId,
      requester_id: actor.userId,
      project_id: sourceReq.project_id,
      title: `${sourceReq.title} (Copy)`,
      notes: sourceReq.notes,
      needed_by: sourceReq.needed_by,
      currency: sourceReq.currency,
      is_unbudgeted: sourceReq.is_unbudgeted,
      total_amount: sourceReq.total_amount,
      status: "draft",
    })
    .select("id")
    .single();

  if (reqErr || !newReq) throw new Error(reqErr?.message ?? "Failed copying requisition.");

  const sourceItems =
    (
      sourceReq as unknown as {
        requisition_items: Array<{
          description: string;
          quantity: number;
          unit: string;
          estimated_unit_price: number;
          sort_order: number;
          attachments: unknown;
        }>;
      }
    ).requisition_items ?? [];
  if (sourceItems.length) {
    await supabaseAdmin.from("requisition_items").insert(
      sourceItems.map((item) => ({
        requisition_id: newReq.id,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        estimated_unit_price: item.estimated_unit_price,
        sort_order: item.sort_order,
        attachments: item.attachments as import("@/integrations/supabase/types").Json,
      })),
    );
  }

  await logAudit({
    orgId: actor.orgId,
    requisitionId: newReq.id,
    actor,
    action: "requisition_duplicated",
    detail: `Duplicated from ${sourceReq.reference}`,
  });

  return { newRequisitionId: newReq.id };
}

export async function whatsappApprovalWebhook(input: {
  fromPhone: string;
  stepId: string;
  decision: "approved" | "rejected";
  comment?: string;
}) {
  const { data: step } = await supabaseAdmin
    .from("approval_steps")
    .select("id, org_id, requisition_id")
    .eq("id", input.stepId)
    .maybeSingle();

  if (!step) throw new Error("Approval step not found.");

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email")
    .eq("org_id", step.org_id)
    .maybeSingle();

  const userId = profile?.id ?? "whatsapp_system";
  return decideApproval(userId, {
    stepId: input.stepId,
    decision: input.decision,
    comment: `${input.comment ? input.comment + " " : ""}(via WhatsApp: ${input.fromPhone})`,
  });
}

export async function createDeliveryReceipt(
  userId: string,
  input: {
    purchaseOrderId: string;
    projectId?: string;
    deliveryNoteRef?: string;
    deliveredAt?: string;
    status: "accepted" | "partial" | "rejected";
    qualityObservations?: string;
    photos?: { path: string; name: string }[];
    items: {
      poItemId?: string;
      description: string;
      quantityDelivered: number;
      quantityAccepted: number;
      quantityRejected: number;
      rejectionReason?: string;
    }[];
  },
) {
  const actor = await loadActor(userId);
  const { data: po } = await supabaseAdmin
    .from("purchase_orders")
    .select("id, po_number, requisition_id, requisitions(project_id)")
    .eq("id", input.purchaseOrderId)
    .eq("org_id", actor.orgId)
    .maybeSingle();

  if (!po) throw new Error("Purchase order not found.");

  const rawReq = po.requisitions;
  const reqObj = Array.isArray(rawReq)
    ? rawReq[0]
    : (rawReq as { project_id: string | null } | null);
  const derivedProjectId = input.projectId || reqObj?.project_id || null;

  const { data: receipt, error } = await (supabaseAdmin as any)
    .from("delivery_receipts")
    .insert({
      org_id: actor.orgId,
      purchase_order_id: po.id,
      project_id: derivedProjectId,
      receiving_officer_id: actor.userId,
      receiving_officer_name: actor.fullName,
      delivery_note_ref: input.deliveryNoteRef || null,
      delivered_at: input.deliveredAt || new Date().toISOString(),
      status: input.status,
      quality_observations: input.qualityObservations || null,
      photos: input.photos || [],
    })
    .select("id")
    .single();

  if (error || !receipt) throw new Error(error?.message ?? "Failed creating delivery receipt.");

  if (input.items.length) {
    await (supabaseAdmin as any).from("delivery_receipt_items").insert(
      input.items.map((item) => ({
        delivery_receipt_id: receipt.id,
        po_item_id: item.poItemId || null,
        description: item.description,
        quantity_delivered: item.quantityDelivered,
        quantity_accepted: item.quantityAccepted,
        quantity_rejected: item.quantityRejected,
        rejection_reason: item.rejectionReason || null,
      })),
    );
  }

  await logAudit({
    orgId: actor.orgId,
    requisitionId: po.requisition_id,
    actor,
    action: "goods_received",
    detail: `Delivery receipt created for ${po.po_number} (Status: ${input.status})`,
  });

  return { deliveryReceiptId: receipt.id };
}

export async function createInvoice(
  userId: string,
  input: {
    purchaseOrderId?: string;
    supplierId?: string;
    invoiceNumber: string;
    issueDate?: string;
    dueDate: string;
    currency: "NGN" | "USD";
    subtotal: number;
    vatAmount: number;
    totalAmount: number;
    sellerLegalName: string;
    sellerTin?: string;
    buyerLegalName: string;
    buyerTin?: string;
    notes?: string;
    items: {
      poItemId?: string;
      description: string;
      quantity: number;
      unitPrice: number;
      vatRate?: number;
      totalAmount: number;
    }[];
  },
) {
  const actor = await loadActor(userId);

  const { data: inv, error } = await (supabaseAdmin as any)
    .from("invoices")
    .insert({
      org_id: actor.orgId,
      purchase_order_id: input.purchaseOrderId || null,
      supplier_id: input.supplierId || null,
      invoice_number: input.invoiceNumber,
      issue_date: input.issueDate || new Date().toISOString().split("T")[0],
      due_date: input.dueDate,
      currency: input.currency,
      subtotal: input.subtotal,
      vat_amount: input.vatAmount,
      total_amount: input.totalAmount,
      seller_legal_name: input.sellerLegalName,
      seller_tin: input.sellerTin || null,
      buyer_legal_name: input.buyerLegalName,
      buyer_tin: input.buyerTin || null,
      irn_clearance_status: "pending",
      three_way_match_status: "pending",
      status: "pending_approval",
      notes: input.notes || null,
    })
    .select("id")
    .single();

  if (error || !inv) throw new Error(error?.message ?? "Failed creating supplier invoice.");

  if (input.items.length) {
    await (supabaseAdmin as any).from("invoice_items").insert(
      input.items.map((item) => ({
        invoice_id: inv.id,
        po_item_id: item.poItemId || null,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        vat_rate: item.vatRate ?? 7.5,
        total_amount: item.totalAmount,
      })),
    );
  }

  await logAudit({
    orgId: actor.orgId,
    actor,
    action: "invoice_created",
    detail: `Supplier invoice ${input.invoiceNumber} created (${money(input.totalAmount, input.currency)})`,
  });

  return { invoiceId: inv.id };
}

export async function recordPayment(
  userId: string,
  input: {
    invoiceId?: string;
    purchaseOrderId?: string;
    amount: number;
    currency: "NGN" | "USD";
    paymentMethod: "bank_transfer" | "virtual_account" | "invoice_billing" | "card";
    paymentReference?: string;
    notes?: string;
  },
) {
  const actor = await loadActor(userId);

  const { data: pay, error } = await (supabaseAdmin as any)
    .from("payments")
    .insert({
      org_id: actor.orgId,
      invoice_id: input.invoiceId || null,
      purchase_order_id: input.purchaseOrderId || null,
      amount: input.amount,
      currency: input.currency,
      payment_method: input.paymentMethod,
      payment_reference: input.paymentReference || null,
      status: "completed",
      notes: input.notes || null,
    })
    .select("id")
    .single();

  if (error || !pay) throw new Error(error?.message ?? "Failed recording payment.");

  if (input.invoiceId) {
    await (supabaseAdmin as any).from("invoices").update({ status: "paid" }).eq("id", input.invoiceId);
  }

  await logAudit({
    orgId: actor.orgId,
    actor,
    action: "payment_recorded",
    detail: `Payment recorded (${money(input.amount, input.currency)} via ${input.paymentMethod})`,
  });

  return { paymentId: pay.id };
}

export async function logNdpaConsent(
  userId: string,
  input: { consentType: string; granted: boolean; details?: string },
) {
  const actor = await loadActor(userId);
  await (supabaseAdmin as any).from("ndpa_consent_logs").insert({
    org_id: actor.orgId,
    user_id: actor.userId,
    consent_type: input.consentType,
    granted: input.granted,
    details: input.details || null,
  });
  return { ok: true as const };
}
