export type Currency = "NGN" | "USD";

export function money(amount: number | string | null | undefined, currency: Currency = "NGN") {
  const value = typeof amount === "string" ? Number(amount) : (amount ?? 0);
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function shortDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-NG", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const ROLE_LABELS: Record<string, string> = {
  requester: "Requester",
  approver: "Approver",
  procurement_officer: "Procurement Officer",
  finance: "Finance",
  executive: "Executive",
  admin: "Admin",
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Awaiting approval",
  approved: "Approved",
  rejected: "Rejected",
  rfq_issued: "Out for quotes",
  po_issued: "PO issued",
  cancelled: "Cancelled",
};
