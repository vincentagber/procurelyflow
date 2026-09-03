/**
 * Role-Based Access Control (RBAC) & Capability Authorization Engine
 *
 * Implements fine-grained capability checks across all modules.
 * Prevents horizontal and vertical privilege escalation.
 */

export type AppRole =
  "requester" | "approver" | "procurement_officer" | "finance" | "executive" | "admin";

export type Permission =
  // Requisitions (FR-1)
  | "requisition.create"
  | "requisition.view_own"
  | "requisition.view_all"
  | "requisition.edit_draft"
  | "requisition.submit"
  | "requisition.cancel"
  | "requisition.duplicate"
  // Approvals (FR-2)
  | "approval.decide"
  | "approval.delegate"
  | "approval.override"
  | "approval_rules.manage"
  // RFQs & Quotes (FR-3, FR-4)
  | "rfq.create"
  | "rfq.manage"
  | "rfq.view"
  | "quote.submit"
  | "quote.enter_proxy"
  | "quote.compare"
  | "quote.award"
  // Purchase Orders (FR-5)
  | "purchase_order.create"
  | "purchase_order.view"
  | "purchase_order.manage"
  | "purchase_order.acknowledge"
  // Deliveries / GRN (FR-6)
  | "delivery.create"
  | "delivery.view"
  | "delivery.inspect"
  // Invoices & 3-Way Matching (FR-7)
  | "invoice.create"
  | "invoice.view"
  | "invoice.match"
  | "invoice.approve_payment"
  | "payment.record"
  // Accounting & Exports
  | "accounting.export"
  // Reports & Audits (FR-8)
  | "reports.view"
  | "audit.view"
  | "governance.view_anomalies"
  // Enterprise Sourcing & Tolerances
  | "rfq.open_sealed"
  | "tolerance.configure"
  // Tenant & System Administration
  | "organization.manage"
  | "members.manage"
  | "projects.manage"
  | "item_master.manage";

/** Role to Permissions Mapping */
const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  admin: [
    "requisition.create",
    "requisition.view_own",
    "requisition.view_all",
    "requisition.edit_draft",
    "requisition.submit",
    "requisition.cancel",
    "requisition.duplicate",
    "approval.decide",
    "approval.delegate",
    "approval.override",
    "approval_rules.manage",
    "rfq.create",
    "rfq.manage",
    "rfq.view",
    "rfq.open_sealed",
    "quote.submit",
    "quote.enter_proxy",
    "quote.compare",
    "quote.award",
    "purchase_order.create",
    "purchase_order.view",
    "purchase_order.manage",
    "purchase_order.acknowledge",
    "delivery.create",
    "delivery.view",
    "delivery.inspect",
    "invoice.create",
    "invoice.view",
    "invoice.match",
    "invoice.approve_payment",
    "payment.record",
    "accounting.export",
    "reports.view",
    "audit.view",
    "governance.view_anomalies",
    "tolerance.configure",
    "organization.manage",
    "members.manage",
    "projects.manage",
    "item_master.manage",
  ],
  executive: [
    "requisition.view_all",
    "approval.decide",
    "rfq.view",
    "quote.compare",
    "purchase_order.view",
    "delivery.view",
    "invoice.view",
    "reports.view",
    "audit.view",
    "governance.view_anomalies",
  ],
  finance: [
    "requisition.view_all",
    "approval.decide",
    "rfq.view",
    "quote.compare",
    "purchase_order.view",
    "delivery.view",
    "invoice.create",
    "invoice.view",
    "invoice.match",
    "invoice.approve_payment",
    "payment.record",
    "accounting.export",
    "reports.view",
    "audit.view",
    "tolerance.configure",
  ],
  procurement_officer: [
    "requisition.view_all",
    "requisition.create",
    "requisition.submit",
    "rfq.create",
    "rfq.manage",
    "rfq.view",
    "quote.enter_proxy",
    "quote.compare",
    "quote.award",
    "purchase_order.create",
    "purchase_order.view",
    "purchase_order.manage",
    "delivery.view",
    "item_master.manage",
    "projects.manage",
  ],
  approver: [
    "requisition.view_all",
    "approval.decide",
    "approval.delegate",
    "purchase_order.view",
    "reports.view",
  ],
  requester: [
    "requisition.create",
    "requisition.view_own",
    "requisition.edit_draft",
    "requisition.submit",
    "requisition.cancel",
    "requisition.duplicate",
    "delivery.create",
    "delivery.view",
  ],
};

/** Checks if a list of user roles grants a specific permission */
export function hasPermission(roles: AppRole[], permission: Permission): boolean {
  return roles.some((role) => ROLE_PERMISSIONS[role]?.includes(permission));
}

/** Asserts that a user has a required permission, throwing a descriptive 403 error otherwise */
export function requirePermission(roles: AppRole[], permission: Permission): void {
  if (!hasPermission(roles, permission)) {
    throw new Error(
      `Forbidden: You do not have the required permission [${permission}] to perform this action.`,
    );
  }
}

/**
 * Enterprise Segregation of Duties (SoD) Enforcer
 * Prevents conflicts of interest and fraudulent self-approval/self-reconciliation loops.
 */
export function assertSegregationOfDuties(params: {
  action: "APPROVE_REQUISITION" | "MATCH_INVOICE" | "RELEASE_PAYMENT";
  actorId: string;
  creatorId?: string;
  approverId?: string;
}): void {
  if (
    params.action === "APPROVE_REQUISITION" &&
    params.creatorId &&
    params.actorId === params.creatorId
  ) {
    throw new Error(
      "SoD Violation: Requisition creator cannot self-approve their own requisition. A distinct authorized approver is required.",
    );
  }

  if (
    params.action === "MATCH_INVOICE" &&
    params.approverId &&
    params.actorId === params.approverId
  ) {
    throw new Error(
      "SoD Violation: The officer who approved the purchase order cannot independently perform 3-way invoice reconciliation for that same order.",
    );
  }
}
