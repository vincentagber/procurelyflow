import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateUblPeppolJson, calculateThreeWayMatch, NRSInvoicePayload } from "./nrsEInvoice.ts";

describe("NRS e-Invoicing (PEPPOL BIS 3.0) & 3-Way Matching Engine", () => {
  const sampleInvoice: NRSInvoicePayload = {
    invoiceNumber: "INV-2026-9081",
    issueDate: "2026-08-27",
    dueDate: "2026-09-27",
    sellerLegalName: "Dangote Cement Plc",
    sellerTin: "10012345-0001",
    buyerLegalName: "Edala Development Ltd",
    buyerTin: "20098765-0001",
    currency: "NGN",
    subtotal: 5000000,
    vatAmount: 375000,
    totalAmount: 5375000,
    items: [
      {
        description: "50kg Dangote 42.5R Cement",
        quantity: 1000,
        unitPrice: 5000,
        vatRate: 7.5,
        lineTotal: 5000000,
      },
    ],
  };

  it("generates structured UBL/PEPPOL BIS 3.0 JSON with required schema fields", () => {
    const jsonStr = generateUblPeppolJson(sampleInvoice);
    const parsed = JSON.parse(jsonStr);

    assert.equal(parsed.profileID, "urn:peppol:bis:billing:3.0");
    assert.equal(parsed.id, "INV-2026-9081");
    assert.equal(parsed.accountingSupplierParty.partyName, "Dangote Cement Plc");
    assert.equal(parsed.accountingSupplierParty.taxScheme.taxID, "10012345-0001");
    assert.equal(parsed.accountingCustomerParty.partyName, "Edala Development Ltd");
    assert.equal(parsed.taxTotal.taxAmount, 375000);
    assert.equal(parsed.legalMonetaryTotal.payableAmount, 5375000);
    assert.equal(parsed.invoiceLine.length, 1);
  });

  it("matches successfully when PO, GRN delivery, and Invoice are in agreement", () => {
    const po = {
      totalAmount: 5375000,
      currency: "NGN",
      items: [{ description: "50kg Dangote 42.5R Cement", quantity: 1000, unitPrice: 5000 }],
    };

    const delivery = {
      items: [{ description: "50kg Dangote 42.5R Cement", quantityAccepted: 1000 }],
    };

    const match = calculateThreeWayMatch(po, delivery, sampleInvoice);
    assert.equal(match.isMatched, true);
    assert.equal(match.discrepancies.length, 0);
  });

  it("flags a blocker discrepancy when invoice total differs from PO total", () => {
    const po = {
      totalAmount: 4500000, // PO was 4.5m, invoice is 5.375m
      currency: "NGN",
      items: [{ description: "50kg Dangote 42.5R Cement", quantity: 1000, unitPrice: 4500 }],
    };

    const delivery = {
      items: [{ description: "50kg Dangote 42.5R Cement", quantityAccepted: 1000 }],
    };

    const match = calculateThreeWayMatch(po, delivery, sampleInvoice);
    assert.equal(match.isMatched, false);
    assert.equal(
      match.discrepancies.some((d) => d.field === "totalAmount" && d.severity === "blocker"),
      true,
    );
  });

  it("flags a blocker discrepancy when billed quantity exceeds accepted delivery quantity", () => {
    const po = {
      totalAmount: 5375000,
      currency: "NGN",
      items: [{ description: "50kg Dangote 42.5R Cement", quantity: 1000, unitPrice: 5000 }],
    };

    // Only 800 bags accepted on site (200 damaged/rejected)
    const delivery = {
      items: [{ description: "50kg Dangote 42.5R Cement", quantityAccepted: 800 }],
    };

    const match = calculateThreeWayMatch(po, delivery, sampleInvoice);
    assert.equal(match.isMatched, false);
    assert.equal(
      match.discrepancies.some((d) => d.field === "itemQuantity" && d.severity === "blocker"),
      true,
    );
  });
});
