/**
 * Accounting Ledger & Bank Payment Handoff Export Engine (Prompt §33)
 *
 * Generates standardized CSV / TSV payment schedules for Nigerian ERPs (Sage, QuickBooks, SAP)
 * and commercial bank bulk payment platforms.
 */

import { createHash } from "crypto";

export interface ApprovedPaymentRecord {
  paymentId: string;
  invoiceId: string;
  invoiceNumber: string;
  poNumber: string;
  projectName: string;
  costCode?: string | null;
  supplierName: string;
  supplierTaxId?: string | null;
  supplierBankName?: string | null;
  supplierAccountNumber?: string | null;
  currency: "NGN" | "USD";
  subtotal: number;
  vatAmount: number;
  whtAmount: number;
  netPayable: number;
  approvedAt: string;
  approvedBy: string;
}

export interface ExportResult {
  filename: string;
  csvContent: string;
  recordCount: number;
  totalNetPayable: number;
  currency: "NGN" | "USD";
  checksum: string; // SHA-256 of the CSV content for audit verification
  generatedAt: string;
}

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Generates a standardized, auditable accounting CSV for approved payments.
 */
export function generateAccountingCsv(
  orgName: string,
  records: ApprovedPaymentRecord[],
  currency: "NGN" | "USD" = "NGN",
): ExportResult {
  const headers = [
    "Payment Reference",
    "Invoice Number",
    "PO Number",
    "Project",
    "Cost Code",
    "Supplier Legal Name",
    "Supplier TIN",
    "Bank Name",
    "Account Number",
    "Currency",
    "Subtotal",
    "VAT (7.5%)",
    "WHT Deducted",
    "Net Payable Amount",
    "Approved At",
    "Approved By",
  ];

  const rows = records.map((r) => [
    escapeCsv(r.paymentId),
    escapeCsv(r.invoiceNumber),
    escapeCsv(r.poNumber),
    escapeCsv(r.projectName),
    escapeCsv(r.costCode || "GENERAL"),
    escapeCsv(r.supplierName),
    escapeCsv(r.supplierTaxId || "UNREGISTERED"),
    escapeCsv(r.supplierBankName || "N/A"),
    escapeCsv(r.supplierAccountNumber || "N/A"),
    escapeCsv(r.currency),
    r.subtotal.toFixed(2),
    r.vatAmount.toFixed(2),
    r.whtAmount.toFixed(2),
    r.netPayable.toFixed(2),
    escapeCsv(r.approvedAt),
    escapeCsv(r.approvedBy),
  ]);

  const totalNetPayable = records.reduce((sum, r) => sum + r.netPayable, 0);
  const csvContent = [headers.map(escapeCsv).join(","), ...rows.map((row) => row.join(","))].join(
    "\r\n",
  );
  const checksum = createHash("sha256").update(csvContent, "utf8").digest("hex");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `Payment_Export_${orgName.replace(/[^a-zA-Z0-9]/g, "_")}_${currency}_${timestamp}.csv`;

  return {
    filename,
    csvContent,
    recordCount: records.length,
    totalNetPayable: Math.round(totalNetPayable * 100) / 100,
    currency,
    checksum,
    generatedAt: new Date().toISOString(),
  };
}

export {
  generateSapS4HanaJournalPayload,
  generateDynamics365PurchaseJournal,
  createEnterpriseWebhookEnvelope,
  verifyEnterpriseWebhookSignature,
  type SapJournalEntryPayload,
  type Dynamics365PurchaseJournalPayload,
  type EnterpriseWebhookEnvelope,
} from "./erpConnectors.ts";
