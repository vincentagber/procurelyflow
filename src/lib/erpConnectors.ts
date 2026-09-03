/**
 * Enterprise ERP Connector Adapters
 *
 * Provides bidirectional payload transformations for:
 * 1. SAP S/4HANA (API_JOURNALENTRYIN / OData v2/v4 Accounting Document)
 * 2. Microsoft Dynamics 365 Business Central / Finance & Operations (Purchase Journals)
 * 3. Enterprise Event Webhook Dispatcher with HMAC-SHA256 Signatures
 */

import { createHmac, createHash } from "crypto";
import type { ApprovedPaymentRecord } from "./export.ts";

export interface SapJournalEntryPayload {
  Header: {
    CompanyCode: string;
    DocumentDate: string;
    PostingDate: string;
    AccountingDocumentType: "KR" | "KZ"; // Vendor Invoice or Payment
    DocumentHeaderText: string;
    Reference1IDByBusinessPartner: string; // PO / Invoice Ref
    CreatedByUser: string;
  };
  Items: {
    ReferenceDocumentItem: string;
    GLAccount: string;
    AmountInTransactionCurrency: number;
    TransactionCurrency: string;
    DebitCreditCode: "S" | "H"; // Debit (S) or Credit (H)
    CostCenter?: string;
    WBSElement?: string;
    TaxCode?: string;
    TaxJurisdictionCode?: string;
    ItemText?: string;
  }[];
}

export interface Dynamics365PurchaseJournalPayload {
  journalTemplateName: string;
  journalBatchName: string;
  lines: {
    postingDate: string;
    documentType: "Invoice" | "Payment" | "Refund";
    documentNumber: string;
    accountType: "Vendor" | "G/L Account";
    accountNumber: string;
    description: string;
    currencyCode: string;
    amount: number; // Positive = Debit, Negative = Credit
    balAccountType: "Bank Account" | "G/L Account";
    balAccountNumber?: string;
    externalDocumentNumber: string;
    dimensionSet: { dimensionCode: string; dimensionValueCode: string }[];
  }[];
}

export interface EnterpriseWebhookEnvelope {
  id: string;
  eventType: "PAYMENT.APPROVED" | "INVOICE.MATCHED" | "PO.AWARDED" | "DELIVERY.INSPECTED";
  timestamp: string;
  orgId: string;
  payload: Record<string, unknown>;
  signature: string; // HMAC-SHA256 hex string
}

/**
 * Generates an SAP S/4HANA compliant Journal Entry OData payload
 */
export function generateSapS4HanaJournalPayload(
  companyCode: string,
  records: ApprovedPaymentRecord[],
  options?: {
    apGlAccount?: string; // Accounts Payable Reconciliation GL (default "211000")
    clearingGlAccount?: string; // Bank Clearing GL (default "111000")
    fiscalYear?: number;
  },
): SapJournalEntryPayload[] {
  const apGl = options?.apGlAccount ?? "211000";
  const clearingGl = options?.clearingGlAccount ?? "111000";
  const today = new Date().toISOString().split("T")[0] ?? "";

  return records.map((record, index) => {
    return {
      Header: {
        CompanyCode: companyCode,
        DocumentDate: record.approvedAt.split("T")[0] || today,
        PostingDate: today,
        AccountingDocumentType: "KZ", // Payment disbursement
        DocumentHeaderText: `Procurely Pay ${record.paymentId.slice(0, 10)}`,
        Reference1IDByBusinessPartner: record.invoiceNumber,
        CreatedByUser: record.approvedBy,
      },
      Items: [
        // Debit: Clear AP Liability (Subtotal + VAT - WHT)
        {
          ReferenceDocumentItem: "001",
          GLAccount: apGl,
          AmountInTransactionCurrency: record.netPayable,
          TransactionCurrency: record.currency,
          DebitCreditCode: "S",
          ...(record.costCode ? { CostCenter: record.costCode } : {}),
          ItemText: `AP Clearance for ${record.supplierName}`,
        },
        // Credit: Cash / Bank Clearing Account
        {
          ReferenceDocumentItem: "002",
          GLAccount: clearingGl,
          AmountInTransactionCurrency: -record.netPayable,
          TransactionCurrency: record.currency,
          DebitCreditCode: "H",
          ItemText: `Bank Outflow - ${record.supplierBankName || "Bank"} (${record.supplierAccountNumber || "N/A"})`,
        },
      ],
    };
  });
}

/**
 * Generates Microsoft Dynamics 365 Business Central General Journal Batch payload
 */
export function generateDynamics365PurchaseJournal(
  batchName: string,
  records: ApprovedPaymentRecord[],
): Dynamics365PurchaseJournalPayload {
  const today = new Date().toISOString().split("T")[0] ?? "";

  return {
    journalTemplateName: "PAYMENTS",
    journalBatchName: batchName,
    lines: records.map((r, i) => ({
      postingDate: r.approvedAt.split("T")[0] || today,
      documentType: "Payment",
      documentNumber: `PMT-${r.paymentId.slice(0, 8).toUpperCase()}`,
      accountType: "Vendor",
      accountNumber: r.supplierTaxId || r.supplierName.replace(/\s+/g, "_").toUpperCase(),
      description: `Payment for PO ${r.poNumber} / Inv ${r.invoiceNumber}`,
      currencyCode: r.currency,
      amount: -r.netPayable, // Negative credits the vendor ledger
      balAccountType: "Bank Account",
      balAccountNumber: r.supplierBankName || "BANK_OPERATING",
      externalDocumentNumber: r.invoiceNumber,
      dimensionSet: [
        {
          dimensionCode: "PROJECT",
          dimensionValueCode: r.projectName.replace(/\s+/g, "_").toUpperCase(),
        },
        { dimensionCode: "COSTCENTER", dimensionValueCode: r.costCode || "GENERAL" },
      ],
    })),
  };
}

/**
 * Signs and packages enterprise webhook event for downstream ERP integration queues
 */
export function createEnterpriseWebhookEnvelope(
  orgId: string,
  eventType: EnterpriseWebhookEnvelope["eventType"],
  payload: Record<string, unknown>,
  webhookSecret: string,
): EnterpriseWebhookEnvelope {
  const id = `evt_${Date.now()}_${createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 8)}`;
  const timestamp = new Date().toISOString();

  const dataToSign = `${id}.${timestamp}.${orgId}.${JSON.stringify(payload)}`;
  const signature = createHmac("sha256", webhookSecret).update(dataToSign).digest("hex");

  return {
    id,
    eventType,
    timestamp,
    orgId,
    payload,
    signature,
  };
}

/**
 * Verifies the cryptographic signature of an inbound or outbound enterprise webhook
 */
export function verifyEnterpriseWebhookSignature(
  envelope: EnterpriseWebhookEnvelope,
  webhookSecret: string,
): boolean {
  const dataToSign = `${envelope.id}.${envelope.timestamp}.${envelope.orgId}.${JSON.stringify(envelope.payload)}`;
  const expectedSignature = createHmac("sha256", webhookSecret).update(dataToSign).digest("hex");
  return envelope.signature === expectedSignature;
}
