/**
 * Nigeria Revenue Service (NRS / MBS) e-Invoicing & 3-Way Match Helper (FR-7)
 * Implements UBL / PEPPOL BIS 3.0 structured invoice schema validation & reconciliation logic.
 */

export interface NRSInvoicePayload {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  sellerLegalName: string;
  sellerTin?: string;
  buyerLegalName: string;
  buyerTin?: string;
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

export interface ThreeWayMatchResult {
  isMatched: boolean;
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

/** Reconciles PO, Goods-Received Receipt (Delivery), and Supplier Invoice */
export function calculateThreeWayMatch(
  po: {
    totalAmount: number;
    currency: string;
    items: { description: string; quantity: number; unitPrice: number }[];
  },
  delivery: { items: { description: string; quantityAccepted: number }[] } | null,
  invoice: NRSInvoicePayload,
): ThreeWayMatchResult {
  const discrepancies: ThreeWayMatchResult["discrepancies"] = [];

  // Price & Amount Variance check
  if (Math.abs(invoice.totalAmount - po.totalAmount) > 0.01) {
    discrepancies.push({
      field: "totalAmount",
      expected: po.totalAmount,
      actual: invoice.totalAmount,
      severity: "blocker",
      note: `Invoice total (${invoice.totalAmount}) does not match PO total (${po.totalAmount}).`,
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

  return {
    isMatched: discrepancies.filter((d) => d.severity === "blocker").length === 0,
    discrepancies,
  };
}
