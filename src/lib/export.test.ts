import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateAccountingCsv } from "./export.ts";

describe("Accounting Ledger CSV Export Engine", () => {
  it("generates structured, escaped CSV with totals and SHA-256 batch checksum", () => {
    const records = [
      {
        paymentId: "pay-001",
        invoiceId: "inv-100",
        invoiceNumber: "INV-2026-001",
        poNumber: "PO-2026-0001",
        projectName: "Edala Lekki Phase 1",
        costCode: "01-FOUNDATION",
        supplierName: "Dangote Cement Plc",
        supplierTaxId: "10023456-0001",
        supplierBankName: "Zenith Bank",
        supplierAccountNumber: "1012345678",
        currency: "NGN" as const,
        subtotal: 10000000,
        vatAmount: 750000,
        whtAmount: 500000,
        netPayable: 10250000,
        approvedAt: "2026-08-27T10:00:00.000Z",
        approvedBy: "CFO Jane Doe",
      },
      {
        paymentId: "pay-002",
        invoiceId: "inv-101",
        invoiceNumber: "INV-2026-002",
        poNumber: "PO-2026-0002",
        projectName: "Edala Lekki Phase 1",
        costCode: "02-SUPERSTRUCTURE",
        supplierName: "Apex Steel Ltd",
        supplierTaxId: "20034567-0001",
        supplierBankName: "GTBank",
        supplierAccountNumber: "0123456789",
        currency: "NGN" as const,
        subtotal: 5000000,
        vatAmount: 375000,
        whtAmount: 250000,
        netPayable: 5125000,
        approvedAt: "2026-08-27T11:00:00.000Z",
        approvedBy: "CFO Jane Doe",
      },
    ];

    const result = generateAccountingCsv("Edala Development", records, "NGN");

    assert.equal(result.recordCount, 2);
    assert.equal(result.totalNetPayable, 15375000);
    assert.equal(result.currency, "NGN");
    assert.equal(result.checksum.length, 64);
    assert.match(result.filename, /^Payment_Export_Edala_Development_NGN_/);

    // Verify CSV Content headers and rows
    assert.match(result.csvContent, /"Payment Reference","Invoice Number","PO Number"/);
    assert.match(result.csvContent, /"INV-2026-001"/);
    assert.match(result.csvContent, /"Dangote Cement Plc"/);
    assert.match(result.csvContent, /10250000.00/);
    assert.match(result.csvContent, /"Apex Steel Ltd"/);
  });
});
