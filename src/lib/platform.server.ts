import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

export type SubscriptionPlan = Database["public"]["Enums"]["subscription_plan"];
export type BillingStatus = "trial" | "active" | "overdue" | "suspended";

export type PlatformActor = { userId: string; email: string; fullName: string };

/**
 * Platform staff only. Deliberately separate from any per-organization role.
 * Staff can be pre-authorized by email before they sign up; the row is linked
 * to the real account the first time they use the console.
 */
async function findPlatformAdminRow(userId: string, email: string) {
  const { data: byUser, error } = await supabaseAdmin
    .from("platform_admins")
    .select("id, user_id, email")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (byUser) return byUser;

  if (!email) return null;
  const { data: byEmail } = await supabaseAdmin
    .from("platform_admins")
    .select("id, user_id, email")
    .ilike("email", email)
    .maybeSingle();
  if (!byEmail) return null;

  if (!byEmail.user_id) {
    await supabaseAdmin.from("platform_admins").update({ user_id: userId }).eq("id", byEmail.id);
  } else if (byEmail.user_id !== userId) {
    return null;
  }
  return byEmail;
}

export async function requirePlatformAdmin(userId: string, email = ""): Promise<PlatformActor> {
  const row = await findPlatformAdminRow(userId, email);
  if (!row) throw new Error("This area is restricted to Procurely platform staff.");

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();

  return {
    userId,
    email: row.email,
    fullName: profile?.full_name || row.email,
  };
}

export async function isPlatformAdmin(userId: string, email = "") {
  return !!(await findPlatformAdminRow(userId, email));
}

/**
 * Platform actions land in the same permanent audit log as approvals, but with a
 * `platform.` action prefix and no org role, so it is always clear the action
 * came from Procurely staff rather than the organization itself.
 */
async function logPlatformAction(entry: {
  orgId: string;
  actor: PlatformActor;
  action: string;
  detail?: string | null;
}) {
  await supabaseAdmin.from("approval_audit_log").insert({
    org_id: entry.orgId,
    actor_id: entry.actor.userId,
    actor_name: `${entry.actor.fullName} (Procurely platform)`,
    actor_role: null,
    action: `platform.${entry.action}`,
    detail: entry.detail ?? null,
  });
}

function monthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function listOrganizations(userId: string, email = "") {
  await requirePlatformAdmin(userId, email);
  const since = monthStart();

  // Keeps overdue flags honest without a cron: any unpaid invoice past its due
  // date marks both the invoice and its organization overdue.
  await supabaseAdmin.rpc("sweep_overdue_billing");

  const { data: orgs, error } = await supabaseAdmin
    .from("organizations")
    .select(
      "id, name, plan, status, primary_contact_email, created_at, suspended_at, suspension_reason",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const [{ data: profiles }, { data: reqs }, { data: rfqs }, { data: admins }, { data: bills }] =
    await Promise.all([
      supabaseAdmin.from("profiles").select("id, org_id, email, full_name, created_at"),
      supabaseAdmin.from("requisitions").select("id, org_id").gte("created_at", since),
      supabaseAdmin.from("rfqs").select("id, org_id").gte("created_at", since),
      supabaseAdmin.from("user_roles").select("user_id, org_id").eq("role", "admin"),
      supabaseAdmin
        .from("billing_invoices")
        .select("org_id, status, total_amount, due_date")
        .neq("status", "paid"),
    ]);

  const count = (rows: { org_id: string }[] | null, orgId: string) =>
    (rows ?? []).filter((r) => r.org_id === orgId).length;

  return (orgs ?? []).map((org) => {
    const orgProfiles = (profiles ?? []).filter((p) => p.org_id === org.id);
    const adminId = (admins ?? []).find((a) => a.org_id === org.id)?.user_id;
    const contact =
      orgProfiles.find((p) => p.id === adminId) ??
      orgProfiles.slice().sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    return {
      id: org.id,
      name: org.name,
      plan: org.plan,
      status: org.status as BillingStatus,
      createdAt: org.created_at,
      suspendedAt: org.suspended_at,
      suspensionReason: org.suspension_reason,
      contactName: contact?.full_name ?? null,
      contactEmail: org.primary_contact_email ?? contact?.email ?? null,
      users: orgProfiles.length,
      requisitionsThisMonth: count(reqs, org.id),
      rfqsThisMonth: count(rfqs, org.id),
      openInvoices: (bills ?? []).filter((b) => b.org_id === org.id).length,
      overdueInvoices: (bills ?? []).filter((b) => b.org_id === org.id && b.status === "overdue")
        .length,
      outstandingAmount: (bills ?? [])
        .filter((b) => b.org_id === org.id)
        .reduce((sum, b) => sum + Number(b.total_amount ?? 0), 0),
    };
  });
}

export async function organizationDetail(userId: string, orgId: string, email = "") {
  const actor = await requirePlatformAdmin(userId, email);

  const { data: org, error } = await supabaseAdmin
    .from("organizations")
    .select(
      "id, name, plan, status, base_currency, primary_contact_email, created_at, suspended_at, suspension_reason",
    )
    .eq("id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!org) throw new Error("Organization not found.");

  const [{ data: members }, { data: roles }, { data: reqs }, { data: rfqs }, { data: audit }] =
    await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, full_name, email, department, created_at")
        .eq("org_id", orgId)
        .order("created_at"),
      supabaseAdmin.from("user_roles").select("user_id, role").eq("org_id", orgId),
      supabaseAdmin
        .from("requisitions")
        .select("id, reference, title, status, total_amount, currency, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("rfqs")
        .select("id, reference, title, status, closes_at, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("approval_audit_log")
        .select("id, action, actor_name, detail, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(25),
    ]);

  // Viewing another organization's data is itself an auditable platform action.
  await logPlatformAction({
    orgId,
    actor,
    action: "org_viewed",
    detail: `Read-only review of ${org.name}`,
  });

  return {
    org: {
      id: org.id,
      name: org.name,
      plan: org.plan,
      status: org.status as BillingStatus,
      baseCurrency: org.base_currency,
      createdAt: org.created_at,
      suspendedAt: org.suspended_at,
      suspensionReason: org.suspension_reason,
      contactEmail: org.primary_contact_email,
    },
    members: (members ?? []).map((m) => ({
      id: m.id,
      fullName: m.full_name,
      email: m.email,
      department: m.department,
      roles: (roles ?? []).filter((r) => r.user_id === m.id).map((r) => r.role as string),
    })),
    requisitions: (reqs ?? []).map((r) => ({
      id: r.id,
      reference: r.reference,
      title: r.title,
      status: r.status as string,
      totalAmount: Number(r.total_amount),
      currency: r.currency as string,
      createdAt: r.created_at,
    })),
    rfqs: (rfqs ?? []).map((r) => ({
      id: r.id,
      reference: r.reference,
      title: r.title,
      status: r.status as string,
      closesAt: r.closes_at,
      createdAt: r.created_at,
    })),
    audit: (audit ?? []).map((a) => ({
      id: a.id,
      action: a.action,
      actorName: a.actor_name,
      detail: a.detail,
      createdAt: a.created_at,
      isPlatform: a.action.startsWith("platform."),
    })),
  };
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

/** Provisions a brand-new customer organization plus its first Admin user. */
export async function provisionOrganization(
  userId: string,
  input: {
    orgName: string;
    plan: SubscriptionPlan;
    status: "trial" | "active";
    adminEmail: string;
    adminFullName: string;
    adminPassword: string;
  },
  email = "",
) {
  const actor = await requirePlatformAdmin(userId, email);

  const { data: org, error: orgError } = await supabaseAdmin
    .from("organizations")
    .insert({
      name: input.orgName,
      plan: input.plan,
      status: input.status,
      primary_contact_email: input.adminEmail,
    })
    .select("id, name")
    .single();
  if (orgError) throw new Error(orgError.message);

  const created = await supabaseAdmin.auth.admin.createUser({
    email: input.adminEmail,
    password: input.adminPassword,
    email_confirm: true,
  });

  let adminUserId = created.data.user?.id;
  if (!adminUserId) {
    // Existing account: link it to the new organization instead of failing.
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id, org_id")
      .eq("email", input.adminEmail)
      .maybeSingle();
    if (!existing) {
      await supabaseAdmin.from("organizations").delete().eq("id", org.id);
      throw new Error(created.error?.message ?? "Couldn't create the admin user.");
    }
    if (existing.org_id) {
      await supabaseAdmin.from("organizations").delete().eq("id", org.id);
      throw new Error("That email already belongs to another organization.");
    }
    adminUserId = existing.id;
  }

  await supabaseAdmin.from("profiles").upsert({
    id: adminUserId,
    org_id: org.id,
    full_name: input.adminFullName,
    email: input.adminEmail,
  });

  const allRoles = [
    "requester",
    "approver",
    "procurement_officer",
    "finance",
    "executive",
    "admin",
  ] as const;
  await supabaseAdmin
    .from("user_roles")
    .insert(allRoles.map((role) => ({ user_id: adminUserId!, org_id: org.id, role })));

  await supabaseAdmin
    .from("approval_rules")
    .insert(DEFAULT_RULES.map((r) => ({ ...r, org_id: org.id })) as never);

  await supabaseAdmin
    .from("projects")
    .insert({ org_id: org.id, name: "General / unassigned", location: null });

  await logPlatformAction({
    orgId: org.id,
    actor,
    action: "org_provisioned",
    detail: `${org.name} created on the ${input.plan} plan (${input.status}); first admin ${input.adminEmail}`,
  });

  return { orgId: org.id, adminUserId };
}

export async function setOrganizationStatus(
  userId: string,
  input: { orgId: string; status: "trial" | "active" | "suspended"; reason?: string | undefined },
  email = "",
) {
  const actor = await requirePlatformAdmin(userId, email);
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("id, name, status")
    .eq("id", input.orgId)
    .maybeSingle();
  if (!org) throw new Error("Organization not found.");

  const suspending = input.status === "suspended";
  const { error } = await supabaseAdmin
    .from("organizations")
    .update({
      status: input.status,
      suspended_at: suspending ? new Date().toISOString() : null,
      suspension_reason: suspending ? (input.reason ?? null) : null,
    })
    .eq("id", input.orgId);
  if (error) throw new Error(error.message);

  await logPlatformAction({
    orgId: input.orgId,
    actor,
    action: suspending ? "org_suspended" : "org_reactivated",
    detail: `${org.name}: ${org.status} → ${input.status}${input.reason ? ` — ${input.reason}` : ""}`,
  });

  return { ok: true, status: input.status };
}

export async function setOrganizationPlan(
  userId: string,
  input: { orgId: string; plan: SubscriptionPlan },
  email = "",
) {
  const actor = await requirePlatformAdmin(userId, email);
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("id, name, plan")
    .eq("id", input.orgId)
    .maybeSingle();
  if (!org) throw new Error("Organization not found.");

  const { error } = await supabaseAdmin
    .from("organizations")
    .update({ plan: input.plan })
    .eq("id", input.orgId);
  if (error) throw new Error(error.message);

  await logPlatformAction({
    orgId: input.orgId,
    actor,
    action: "org_plan_changed",
    detail: `${org.name}: ${org.plan} → ${input.plan}`,
  });
  return { ok: true };
}

/** Used by the app shell so suspended organizations lose access but keep data. */
export async function organizationAccessState(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("org_id")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.org_id) return { suspended: false, orgName: null as string | null };

  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("name, status")
    .eq("id", profile.org_id)
    .maybeSingle();
  return { suspended: org?.status === "suspended", orgName: org?.name ?? null };
}

/* ------------------------------------------------------------------ *
 * Subscription billing (Procurely -> customer organization)
 * Distinct from `invoices`, which holds SUPPLIER invoices against a PO
 * for the future three-way match / NRS e-invoicing work.
 * ------------------------------------------------------------------ */

export type BillingInvoice = {
  id: string;
  invoiceNumber: string;
  orgId: string;
  orgName: string;
  plan: SubscriptionPlan;
  periodStart: string;
  periodEnd: string;
  description: string | null;
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  totalAmount: number;
  currency: string;
  status: "pending" | "paid" | "overdue";
  issueDate: string;
  dueDate: string;
  paidAt: string | null;
  paymentReference: string | null;
  notes: string | null;
};

function mapInvoice(
  row: {
    id: string;
    invoice_number: string;
    org_id: string;
    plan: SubscriptionPlan;
    period_start: string;
    period_end: string;
    description: string | null;
    subtotal: number | string;
    vat_rate: number | string;
    vat_amount: number | string | null;
    total_amount: number | string | null;
    currency: string;
    status: string;
    issue_date: string;
    due_date: string;
    paid_at: string | null;
    payment_reference: string | null;
    notes: string | null;
  },
  orgName: string,
): BillingInvoice {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    orgId: row.org_id,
    orgName,
    plan: row.plan,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    description: row.description,
    subtotal: Number(row.subtotal),
    vatRate: Number(row.vat_rate),
    vatAmount: Number(row.vat_amount ?? 0),
    totalAmount: Number(row.total_amount ?? 0),
    currency: row.currency,
    status: row.status as "pending" | "paid" | "overdue",
    issueDate: row.issue_date,
    dueDate: row.due_date,
    paidAt: row.paid_at,
    paymentReference: row.payment_reference,
    notes: row.notes,
  };
}

const INVOICE_COLUMNS =
  "id, invoice_number, org_id, plan, period_start, period_end, description, subtotal, vat_rate, vat_amount, total_amount, currency, status, issue_date, due_date, paid_at, payment_reference, notes";

async function nextInvoiceNumber() {
  const now = new Date();
  const prefix = `PB-${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const { data } = await supabaseAdmin
    .from("billing_invoices")
    .select("invoice_number")
    .like("invoice_number", `${prefix}%`)
    .order("invoice_number", { ascending: false })
    .limit(1);
  const last = data?.[0]?.invoice_number ?? "";
  const seq = Number(last.split("-")[2] ?? 0) + 1;
  return `${prefix}-${String(Number.isFinite(seq) ? seq : 1).padStart(4, "0")}`;
}

export async function listBillingInvoices(userId: string, orgId: string, email = "") {
  await requirePlatformAdmin(userId, email);
  await supabaseAdmin.rpc("sweep_overdue_billing");

  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .maybeSingle();

  const { data, error } = await supabaseAdmin
    .from("billing_invoices")
    .select(INVOICE_COLUMNS)
    .eq("org_id", orgId)
    .order("issue_date", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => mapInvoice(row, org?.name ?? "Organization"));
}

export async function createBillingInvoice(
  userId: string,
  input: {
    orgId: string;
    periodStart: string;
    periodEnd: string;
    subtotal: number;
    vatRate: number;
    dueDate: string;
    description?: string | undefined;
  },
  email = "",
) {
  const actor = await requirePlatformAdmin(userId, email);

  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("id, name, plan")
    .eq("id", input.orgId)
    .maybeSingle();
  if (!org) throw new Error("Organization not found.");
  if (new Date(input.periodEnd) < new Date(input.periodStart)) {
    throw new Error("The billing period ends before it starts.");
  }

  // VAT and total are generated columns in the database: subtotal x rate.
  // They are never accepted from the client.
  const { data, error } = await supabaseAdmin
    .from("billing_invoices")
    .insert({
      org_id: org.id,
      invoice_number: await nextInvoiceNumber(),
      plan: org.plan,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      subtotal: input.subtotal,
      vat_rate: input.vatRate,
      due_date: input.dueDate,
      description: input.description ?? null,
      created_by: userId,
    })
    .select(INVOICE_COLUMNS)
    .single();
  if (error) throw new Error(error.message);

  await logPlatformAction({
    orgId: org.id,
    actor,
    action: "billing_invoice_issued",
    detail: `${data.invoice_number} for ${input.periodStart} → ${input.periodEnd}: subtotal ${input.subtotal}, VAT ${input.vatRate}% = ${Number(data.vat_amount)}, total ${Number(data.total_amount)}`,
  });

  await supabaseAdmin.rpc("sweep_overdue_billing");
  return mapInvoice(data, org.name);
}

export async function markBillingInvoicePaid(
  userId: string,
  input: { invoiceId: string; paymentReference?: string | undefined },
  email = "",
) {
  const actor = await requirePlatformAdmin(userId, email);

  const { data: invoice } = await supabaseAdmin
    .from("billing_invoices")
    .select("id, org_id, invoice_number, total_amount, status")
    .eq("id", input.invoiceId)
    .maybeSingle();
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.status === "paid") throw new Error("That invoice is already marked paid.");

  const { error } = await supabaseAdmin
    .from("billing_invoices")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      payment_reference: input.paymentReference ?? null,
      marked_paid_by: userId,
    })
    .eq("id", invoice.id);
  if (error) throw new Error(error.message);

  await logPlatformAction({
    orgId: invoice.org_id,
    actor,
    action: "billing_invoice_paid",
    detail: `${invoice.invoice_number} confirmed paid (${Number(invoice.total_amount)})${input.paymentReference ? ` — ref ${input.paymentReference}` : ""}`,
  });

  // Bank transfer confirmed: clear the overdue flag unless another invoice is still late.
  const { data: stillOverdue } = await supabaseAdmin
    .from("billing_invoices")
    .select("id")
    .eq("org_id", invoice.org_id)
    .eq("status", "overdue")
    .limit(1);

  if (!stillOverdue?.length) {
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("status")
      .eq("id", invoice.org_id)
      .maybeSingle();
    if (org?.status === "overdue") {
      await supabaseAdmin
        .from("organizations")
        .update({ status: "active" })
        .eq("id", invoice.org_id);
    }
  }

  return { ok: true };
}
