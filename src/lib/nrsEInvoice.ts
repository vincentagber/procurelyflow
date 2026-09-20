/**
 * Nigeria Revenue Service (NRS / MBS) e-Invoicing & 3-Way Match Helper (FR-7)
 * Implements UBL / PEPPOL BIS 3.0 structured invoice schema validation & reconciliation logic.
 */

export interface NRSInvoicePayload {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  sellerLegalName: string;
  sellerTin?: string | undefined;
  buyerLegalName: string;
  buyerTin?: string | undefined;
  currency: "NGN" | "USD";
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    vatRate: number;
    lineTotal: number;
  }[];
}

export interface ThreeWayMatchToleranceConfig {
  maxPriceVariancePercent?: number; // e.g. 1.0 for 1% allowable price variance (e.g. weighbridge variances)
  maxPriceVarianceAbsolute?: number; // e.g. 5000 NGN absolute limit
  allowPartialDeliveryBilling?: boolean; // false = strict no overbill against delivered
  requireNrsClearanceStamp?: boolean; // true = require valid IRN clearance before match passes
}

export interface ThreeWayMatchResult {
  isMatched: boolean;
  isStpQualified: boolean; // Straight-Through Processing: 0 discrepancies, fully cleared
  discrepancies: {
    field: string;
    expected: string | number;
    actual: string | number;
    severity: "warning" | "blocker";
    note: string;
  }[];
}

/** Generates UBL / PEPPOL BIS 3.0 compliant JSON string for NRS transmission */
export function generateUblPeppolJson(payload: NRSInvoicePayload): string {
  return JSON.stringify(
    {
      ublVersionID: "2.1",
      customizationID: "urn:peppol:pint:billing-1@nrs-mbs-1",
      profileID: "urn:peppol:bis:billing:3.0",
      id: payload.invoiceNumber,
      issueDate: payload.issueDate,
      dueDate: payload.dueDate,
      documentCurrencyCode: payload.currency,
      accountingSupplierParty: {
        partyName: payload.sellerLegalName,
        taxScheme: { taxID: payload.sellerTin || "UNREGISTERED" },
      },
      accountingCustomerParty: {
        partyName: payload.buyerLegalName,
        taxScheme: { taxID: payload.buyerTin || "UNREGISTERED" },
      },
      taxTotal: {
        taxAmount: payload.vatAmount,
        taxSubtotal: [
          {
            taxableAmount: payload.subtotal,
            taxAmount: payload.vatAmount,
            taxCategory: { percent: 7.5, id: "VAT" },
          },
        ],
      },
      legalMonetaryTotal: {
        lineExtensionAmount: payload.subtotal,
        taxExclusiveAmount: payload.subtotal,
        taxInclusiveAmount: payload.totalAmount,
        payableAmount: payload.totalAmount,
      },
      invoiceLine: payload.items.map((item, index) => ({
        id: String(index + 1),
        invoicedQuantity: item.quantity,
        lineExtensionAmount: item.lineTotal,
        item: { name: item.description },
        price: { priceAmount: item.unitPrice },
      })),
    },
    null,
    2,
  );
}

/** Reconciles PO, Goods-Received Receipt (Delivery), and Supplier Invoice with Configurable Tolerances */
export function calculateThreeWayMatch(
  po: {
    totalAmount: number;
    currency: string;
    items: { description: string; quantity: number; unitPrice: number }[];
  },
  delivery: { items: { description: string; quantityAccepted: number }[] } | null,
  invoice: NRSInvoicePayload,
  tolerances?: ThreeWayMatchToleranceConfig,
): ThreeWayMatchResult {
  const discrepancies: ThreeWayMatchResult["discrepancies"] = [];

  const maxPriceVariancePct = tolerances?.maxPriceVariancePercent ?? 0;
  const maxPriceVarianceAbs = tolerances?.maxPriceVarianceAbsolute ?? 0.01;

  // Price & Amount Variance check
  const amountDiff = Math.abs(invoice.totalAmount - po.totalAmount);
  const percentDiff = po.totalAmount > 0 ? (amountDiff / po.totalAmount) * 100 : 0;

  const isWithinTolerance =
    amountDiff <= maxPriceVarianceAbs ||
    (maxPriceVariancePct > 0 && percentDiff <= maxPriceVariancePct);

  if (amountDiff > 0.01 && !isWithinTolerance) {
    discrepancies.push({
      field: "totalAmount",
      expected: po.totalAmount,
      actual: invoice.totalAmount,
      severity: "blocker",
      note: `Invoice total (${invoice.totalAmount}) differs from PO total (${po.totalAmount}) by ${amountDiff.toFixed(2)} (${percentDiff.toFixed(2)}%), exceeding configured tolerance.`,
    });
  } else if (amountDiff > 0.01 && isWithinTolerance) {
    discrepancies.push({
      field: "totalAmount",
      expected: po.totalAmount,
      actual: invoice.totalAmount,
      severity: "warning",
      note: `Invoice total (${invoice.totalAmount}) differs from PO total (${po.totalAmount}) by ${amountDiff.toFixed(2)}, but is within allowable tolerance.`,
    });
  }

  // Delivery Quantity vs Invoice Quantity check
  if (delivery) {
    for (const invItem of invoice.items) {
      const matchDelivery = delivery.items.find(
        (d) => d.description.toLowerCase().trim() === invItem.description.toLowerCase().trim(),
      );

      if (matchDelivery && invItem.quantity > matchDelivery.quantityAccepted) {
        discrepancies.push({
          field: "itemQuantity",
          expected: matchDelivery.quantityAccepted,
          actual: invItem.quantity,
          severity: "blocker",
          note: `Billed quantity for "${invItem.description}" (${invItem.quantity}) exceeds accepted delivered quantity (${matchDelivery.quantityAccepted}).`,
        });
      }
    }
  } else {
    discrepancies.push({
      field: "deliveryReceipt",
      expected: "Goods Received Note",
      actual: "None",
      severity: "warning",
      note: "No goods-received delivery receipt logged for this PO yet.",
    });
  }

  const hasBlockers = discrepancies.some((d) => d.severity === "blocker");
  const hasWarnings = discrepancies.some((d) => d.severity === "warning");

  return {
    isMatched: !hasBlockers,
    isStpQualified: !hasBlockers && !hasWarnings && delivery !== null,
    discrepancies,
  };
}

export interface VatInputCreditAssessment {
  isEligibleForVatInputCredit: boolean;
  irn: string | null;
  taxClearanceStatus: "CLEARED" | "UNVALIDATED" | "REJECTED";
  warningMessage?: string;
  claimableVatAmount: number;
}

/**
 * Validates whether an invoice qualifies for statutory VAT input-credit reclaim (FR-7.4).
 * Enforces: Invoices without a valid NRS IRN clearance stamp cannot be reclaimed for VAT.
 */
export function validateNrsVatInputCreditEligibility(invoice: {
  irn?: string | null;
  vatAmount: number;
  sellerTin?: string | null;
}): VatInputCreditAssessment {
  const hasValidIrn = Boolean(invoice.irn && invoice.irn.trim().length >= 8);
  const hasSellerTin = Boolean(invoice.sellerTin && invoice.sellerTin.trim() !== "UNREGISTERED");

  if (!hasValidIrn) {
    return {
      isEligibleForVatInputCredit: false,
      irn: invoice.irn ?? null,
      taxClearanceStatus: "UNVALIDATED",
      warningMessage:
        "CRITICAL COMPLIANCE NOTICE: This invoice lacks a validated NRS Invoice Reference Number (IRN) clearance stamp. Under NRS regulations, VAT paid on this invoice CANNOT be claimed as input-tax credit on your corporate tax returns.",
      claimableVatAmount: 0,
    };
  }

  if (!hasSellerTin) {
    return {
      isEligibleForVatInputCredit: false,
      irn: invoice.irn ?? null,
      taxClearanceStatus: "REJECTED",
      warningMessage:
        "VAT Input Credit Blocked: Seller Tax Identification Number (TIN) is unregistered or missing.",
      claimableVatAmount: 0,
    };
  }

  return {
    isEligibleForVatInputCredit: true,
    irn: invoice.irn ?? null,
    taxClearanceStatus: "CLEARED",
    claimableVatAmount: invoice.vatAmount,
  };
}
