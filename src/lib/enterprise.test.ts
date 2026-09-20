import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  convertCurrency,
  calculateTotalCostOfOwnership,
  toMinorUnits,
  fromMinorUnits,
  type FxRateSnapshot,
  type Money,
} from "./money.ts";
import {
  calculateThreeWayMatch,
  validateNrsVatInputCreditEligibility,
  type NRSInvoicePayload,
  type ThreeWayMatchToleranceConfig,
} from "./nrsEInvoice.ts";
import { assertSegregationOfDuties, hasPermission, requirePermission } from "./permissions.ts";
import {
  generateSapS4HanaJournalPayload,
  generateDynamics365PurchaseJournal,
  createEnterpriseWebhookEnvelope,
  verifyEnterpriseWebhookSignature,
} from "./erpConnectors.ts";
import {
  detectSplitRequisitionAnomalies,
  detectBuyerSupplierAffinityAnomalies,
  createPoChangeOrderRecord,
  calculateManagementKpis,
} from "./governanceAnomalies.ts";
import {
  maskPersonalIdentifiableInfo,
  generateDsarExport,
  checkRetentionPolicy,
} from "./dataProtectionCompliance.ts";
import { generateSubscriptionBill, assertPciDssCardDataAbsence } from "./paymentBillingChannels.ts";

describe("Enterprise Multi-Currency FX Engine & TCO Landed Cost", () => {
  const usdToNgnSnapshot: FxRateSnapshot = {
    baseCurrency: "USD",
    targetCurrency: "NGN",
    rate: 1550.75,
    asOf: "2026-08-31T12:00:00Z",
    source: "CENTRAL_BANK",
  };

  it("converts USD to NGN using central bank rate snapshot with exact minor unit rounding", () => {
    const usdAmount: Money = { amount: 1000.0, currency: "USD" };
    const result = convertCurrency(usdAmount, "NGN", usdToNgnSnapshot);

    assert.equal(result.currency, "NGN");
    assert.equal(result.amount, 1550750.0);
    assert.equal(result.fxRateUsed, 1550.75);
    assert.equal(result.convertedFrom.amount, 1000.0);
  });

  it("returns original amount when converting between the same currency", () => {
    const ngnAmount: Money = { amount: 500000.0, currency: "NGN" };
    const result = convertCurrency(ngnAmount, "NGN", usdToNgnSnapshot);

    assert.equal(result.amount, 500000.0);
    assert.equal(result.currency, "NGN");
    assert.equal(result.fxRateUsed, 1.0);
  });

  it("throws error when FX rate snapshot currency pair does not match conversion target", () => {
    const eurAmount: Money = { amount: 250.0, currency: "EUR" };
    assert.throws(() => {
      convertCurrency(eurAmount, "NGN", usdToNgnSnapshot);
    }, /FX Rate Mismatch/);
  });

  it("calculates comprehensive Total Cost of Ownership (TCO) with freight, customs, VAT and prompt cash discount", () => {
    // ₦10,000,000 base + ₦500,000 freight + 10% customs tariff + 7.5% VAT - 2% Net-10 prompt cash discount
    const tco = calculateTotalCostOfOwnership({
      basePrice: 10000000,
      currency: "NGN",
      freightCost: 500000,
      customsTariffPercent: 10, // 10% of (10m + 500k) = 1,050,000
      vatRate: 7.5, // 7.5% of (10m + 500k + 1.05m = 11.55m) = 866,250
      paymentTermDiscountPercent: 2, // 2% of 10m = 200,000
    });

    assert.equal(tco.basePrice, 10000000);
    assert.equal(tco.freightCost, 500000);
    assert.equal(tco.customsTariffAmount, 1050000);
    assert.equal(tco.vatAmount, 866250);
    assert.equal(tco.cashDiscountAmount, 200000);
    // Total Landed = 11,550,000 + 866,250 - 200,000 = 12,216,250
    assert.equal(tco.totalLandedCost, 12216250);
  });
});

describe("Enterprise Segregation of Duties (SoD) & Privilege Enforcement", () => {
  it("strictly blocks requisition creator from self-approving their own requisition", () => {
    assert.throws(() => {
      assertSegregationOfDuties({
        action: "APPROVE_REQUISITION",
        actorId: "user-site-engineer-101",
        creatorId: "user-site-engineer-101",
      });
    }, /SoD Violation: Requisition creator cannot self-approve/);
  });

  it("allows distinct authorized approver to approve requisition", () => {
    assert.doesNotThrow(() => {
      assertSegregationOfDuties({
        action: "APPROVE_REQUISITION",
        actorId: "user-project-manager-202",
        creatorId: "user-site-engineer-101",
      });
    });
  });

  it("strictly blocks PO approver from performing 3-way invoice match on the same order", () => {
    assert.throws(() => {
      assertSegregationOfDuties({
        action: "MATCH_INVOICE",
        actorId: "user-finance-lead-303",
        approverId: "user-finance-lead-303",
      });
    }, /SoD Violation: The officer who approved the purchase order cannot independently perform 3-way invoice reconciliation/);
  });

  it("verifies enterprise governance permission checks", () => {
    assert.equal(hasPermission(["admin"], "governance.view_anomalies"), true);
    assert.equal(hasPermission(["executive"], "governance.view_anomalies"), true);
    assert.equal(hasPermission(["requester"], "governance.view_anomalies"), false);
  });
});

describe("Enterprise 3-Way Match Tolerances & Straight-Through Processing (STP)", () => {
  const samplePo = {
    totalAmount: 1000000,
    currency: "NGN",
    items: [{ description: "Portland Cement (Grade 42.5N)", quantity: 100, unitPrice: 10000 }],
  };

  const sampleDelivery = {
    items: [{ description: "Portland Cement (Grade 42.5N)", quantityAccepted: 100 }],
  };

  const sampleInvoice: NRSInvoicePayload = {
    invoiceNumber: "INV-2026-0891",
    issueDate: "2026-08-31",
    dueDate: "2026-09-30",
    sellerLegalName: "Dangote Cement Plc",
    sellerTin: "10293847-0001",
    buyerLegalName: "Edala Development Ltd",
    buyerTin: "99887766-0001",
    currency: "NGN",
    subtotal: 1000000,
    vatAmount: 75000,
    totalAmount: 1000000, // Matching PO total
    items: [
      {
        description: "Portland Cement (Grade 42.5N)",
        quantity: 100,
        unitPrice: 10000,
        vatRate: 7.5,
        lineTotal: 1000000,
      },
    ],
  };

  it("qualifies clean 3-way match for Straight-Through Processing (STP)", () => {
    const result = calculateThreeWayMatch(samplePo, sampleDelivery, sampleInvoice);
    assert.equal(result.isMatched, true);
    assert.equal(result.isStpQualified, true);
    assert.equal(result.discrepancies.length, 0);
  });

  it("accepts small variance within configured percentage tolerance as non-blocking warning", () => {
    const slightlyHigherInvoice: NRSInvoicePayload = {
      ...sampleInvoice,
      totalAmount: 1005000, // +0.5% variance (e.g. weighbridge variance)
    };

    const tolerances: ThreeWayMatchToleranceConfig = {
      maxPriceVariancePercent: 1.0, // 1% allowable
    };

    const result = calculateThreeWayMatch(
      samplePo,
      sampleDelivery,
      slightlyHigherInvoice,
      tolerances,
    );
    assert.equal(result.isMatched, true); // Non-blocking
    assert.equal(result.isStpQualified, false); // Requires review flag, not auto-cleared STP
    assert.equal(result.discrepancies.length, 1);
    assert.equal(result.discrepancies[0]?.severity, "warning");
  });

  it("blocks invoice match when variance exceeds configured tolerance", () => {
    const excessiveInvoice: NRSInvoicePayload = {
      ...sampleInvoice,
      totalAmount: 1030000, // +3.0% variance
    };

    const tolerances: ThreeWayMatchToleranceConfig = {
      maxPriceVariancePercent: 1.0,
    };

    const result = calculateThreeWayMatch(samplePo, sampleDelivery, excessiveInvoice, tolerances);
    assert.equal(result.isMatched, false);
    assert.equal(result.discrepancies[0]?.severity, "blocker");
  });
});

describe("Enterprise ERP Connectors (SAP S/4HANA, Dynamics 365, Webhook Signatures)", () => {
  const sampleRecords = [
    {
      paymentId: "pmt_123456789",
      invoiceId: "inv_987654321",
      invoiceNumber: "INV-2026-001",
      poNumber: "PO-2026-0042",
      projectName: "Lagos Victoria Island Tower",
      costCode: "STRUCTURAL_STEEL",
      supplierName: "Apex Steel Ltd",
      supplierTaxId: "12345678-0001",
      supplierBankName: "Access Bank Plc",
      supplierAccountNumber: "0123456789",
      currency: "NGN" as const,
      subtotal: 5000000,
      vatAmount: 375000,
      whtAmount: 250000,
      netPayable: 5125000,
      approvedAt: "2026-08-31T14:30:00Z",
      approvedBy: "Finance Lead",
    },
  ];

  it("generates SAP S/4HANA compliant Journal Entry OData payload", () => {
    const sapPayloads = generateSapS4HanaJournalPayload("1000", sampleRecords, {
      apGlAccount: "211000",
      clearingGlAccount: "111000",
    });

    assert.equal(sapPayloads.length, 1);
    const p = sapPayloads[0]!;
    assert.equal(p.Header.CompanyCode, "1000");
    assert.equal(p.Header.AccountingDocumentType, "KZ");
    assert.equal(p.Items.length, 2);
    // Debit item
    assert.equal(p.Items[0]?.DebitCreditCode, "S");
    assert.equal(p.Items[0]?.AmountInTransactionCurrency, 5125000);
    // Credit item
    assert.equal(p.Items[1]?.DebitCreditCode, "H");
    assert.equal(p.Items[1]?.AmountInTransactionCurrency, -5125000);
  });

  it("generates Microsoft Dynamics 365 Business Central General Journal Batch payload", () => {
    const d365Payload = generateDynamics365PurchaseJournal("BATCH_AUG26", sampleRecords);

    assert.equal(d365Payload.journalBatchName, "BATCH_AUG26");
    assert.equal(d365Payload.lines.length, 1);
    const line = d365Payload.lines[0]!;
    assert.equal(line.documentType, "Payment");
    assert.equal(line.accountType, "Vendor");
    assert.equal(line.amount, -5125000);
    assert.equal(line.balAccountType, "Bank Account");
  });

  it("creates and verifies HMAC-SHA256 signed enterprise webhook envelopes", () => {
    const secret = "enterprise_super_secret_webhook_key_2026";
    const envelope = createEnterpriseWebhookEnvelope(
      "org_edala_01",
      "PAYMENT.APPROVED",
      { paymentId: "pmt_123456789", amount: 5125000 },
      secret,
    );

    assert.equal(envelope.eventType, "PAYMENT.APPROVED");
    assert.equal(verifyEnterpriseWebhookSignature(envelope, secret), true);
    assert.equal(verifyEnterpriseWebhookSignature(envelope, "wrong_secret"), false);
  });
});

describe("Executive Governance & Anti-Fraud Anomaly Detection Engine (§FR-4.5, §FR-8.5)", () => {
  it("detects split requisitions raised by a requester just below approval threshold within time window", () => {
    const sampleRequisitions = [
      {
        id: "req-1",
        reference: "REQ-001",
        requesterId: "user-field-eng-1",
        requesterName: "Field Engineer",
        projectId: "proj-site-a",
        projectName: "Victoria Island Tower",
        amount: 480000, // Just below ₦500k threshold
        currency: "NGN",
        createdAt: "2026-08-25T08:00:00Z",
      },
      {
        id: "req-2",
        reference: "REQ-002",
        requesterId: "user-field-eng-1",
        requesterName: "Field Engineer",
        projectId: "proj-site-a",
        projectName: "Victoria Island Tower",
        amount: 490000, // Just below ₦500k threshold
        currency: "NGN",
        createdAt: "2026-08-26T09:00:00Z",
      },
    ];

    const anomalies = detectSplitRequisitionAnomalies(sampleRequisitions, {
      thresholdAmount: 500000,
      windowDays: 7,
      minOccurrenceCount: 2,
    });

    assert.equal(anomalies.length, 1);
    assert.equal(anomalies[0]?.category, "SPLIT_REQUISITION");
    assert.equal(anomalies[0]?.affectedEntities.length, 2);
  });

  it("detects high vendor concentration and buyer-supplier affinity", () => {
    const awards = [
      {
        rfqId: "rfq-1",
        poId: "po-1",
        poNumber: "PO-001",
        buyerId: "buyer-officer-1",
        buyerName: "Procurement Officer John",
        supplierId: "supp-favored-1",
        supplierName: "Favored Cement Ltd",
        amount: 10000000,
        awardedAt: "2026-08-01",
        isLowestQuote: false, // Non-lowest bid
        quotesCount: 3,
      },
      {
        rfqId: "rfq-2",
        poId: "po-2",
        poNumber: "PO-002",
        buyerId: "buyer-officer-1",
        buyerName: "Procurement Officer John",
        supplierId: "supp-favored-1",
        supplierName: "Favored Cement Ltd",
        amount: 15000000,
        awardedAt: "2026-08-10",
        isLowestQuote: false,
        quotesCount: 3,
      },
      {
        rfqId: "rfq-3",
        poId: "po-3",
        poNumber: "PO-003",
        buyerId: "buyer-officer-1",
        buyerName: "Procurement Officer John",
        supplierId: "supp-favored-1",
        supplierName: "Favored Cement Ltd",
        amount: 12000000,
        awardedAt: "2026-08-20",
        isLowestQuote: true,
        quotesCount: 3,
      },
    ];

    const anomalies = detectBuyerSupplierAffinityAnomalies(awards, {
      concentrationThresholdPercent: 40,
      minAwardsCount: 3,
    });

    assert.equal(anomalies.length, 1);
    assert.equal(anomalies[0]?.category, "BUYER_SUPPLIER_AFFINITY");
    assert.equal(anomalies[0]?.severity, "HIGH");
  });
});

describe("FR-5: Purchase Orders — Change Order Versioning & Baseline Preservation", () => {
  it("creates an immutable version-controlled PO Change Order and computes delta", () => {
    const originalPo = {
      id: "po-100",
      po_number: "PO-2026-0042",
      total_amount: 5000000,
      currency: "NGN",
      revision_count: 0,
    };

    const changeOrder = createPoChangeOrderRecord({
      po: originalPo,
      reason: "Scope expansion: +50 tons of 16mm rebar requested by site engineer",
      requestedBy: "Procurement Lead",
      newTotalAmount: 6200000,
      modifiedItems: [
        {
          itemId: "item-1",
          description: "16mm High-Yield Rebar",
          oldQuantity: 100,
          newQuantity: 150,
          oldUnitPrice: 50000,
          newUnitPrice: 50000,
        },
      ],
    });

    assert.equal(changeOrder.originalPoNumber, "PO-2026-0042");
    assert.equal(changeOrder.revisionNumber, 1);
    assert.equal(changeOrder.revisedPoNumber, "PO-2026-0042-REV1");
    assert.equal(changeOrder.previousTotalAmount, 5000000);
    assert.equal(changeOrder.newTotalAmount, 6200000);
    assert.equal(changeOrder.deltaAmount, 1200000);
  });
});

describe("FR-7: Invoice & NRS e-Invoicing — Statutory VAT Input-Credit Assessment", () => {
  it("blocks VAT input credit and issues a compliance warning when IRN is missing", () => {
    const unvalidatedInvoice = {
      irn: null,
      vatAmount: 375000,
      sellerTin: "10293847-0001",
    };

    const assessment = validateNrsVatInputCreditEligibility(unvalidatedInvoice);
    assert.equal(assessment.isEligibleForVatInputCredit, false);
    assert.equal(assessment.taxClearanceStatus, "UNVALIDATED");
    assert.equal(assessment.claimableVatAmount, 0);
    assert.match(assessment.warningMessage || "", /CRITICAL COMPLIANCE NOTICE/);
  });

  it("qualifies invoice for VAT input credit when valid IRN and seller TIN are present", () => {
    const clearedInvoice = {
      irn: "NRS-IRN-2026-998877665544",
      vatAmount: 375000,
      sellerTin: "10293847-0001",
    };

    const assessment = validateNrsVatInputCreditEligibility(clearedInvoice);
    assert.equal(assessment.isEligibleForVatInputCredit, true);
    assert.equal(assessment.taxClearanceStatus, "CLEARED");
    assert.equal(assessment.claimableVatAmount, 375000);
  });
});

describe("FR-8: Management Dashboard — Executive Spend Analytics & Operational Velocity", () => {
  it("calculates total spend, project breakdown, supplier quality, and turnaround lead times", () => {
    const sampleData = {
      purchaseOrders: [
        {
          id: "po-1",
          totalAmount: 10000000,
          projectName: "Eko Atlantic Phase 2",
          category: "Structural",
          issuedAt: "2026-08-10T10:00:00Z",
          requisitionCreatedAt: "2026-08-08T10:00:00Z", // 2 days turnaround
        },
        {
          id: "po-2",
          totalAmount: 5000000,
          projectName: "Victoria Island Tower",
          category: "MEP",
          issuedAt: "2026-08-15T10:00:00Z",
          requisitionCreatedAt: "2026-08-11T10:00:00Z", // 4 days turnaround
        },
      ],
      inspections: [
        {
          quantityDelivered: 100,
          quantityAccepted: 95, // 95% quality rate
          deliveredAt: "2026-08-20T10:00:00Z",
          poIssuedAt: "2026-08-10T10:00:00Z", // 10 days lead time
        },
      ],
      quotes: [
        {
          initialQuotedPrice: 12000000,
          finalAwardedPrice: 10000000, // 2m savings
        },
      ],
    };

    const kpis = calculateManagementKpis(sampleData);

    assert.equal(kpis.totalSpend, 15000000);
    assert.equal(kpis.spendByProject["Eko Atlantic Phase 2"], 10000000);
    assert.equal(kpis.spendByProject["Victoria Island Tower"], 5000000);
    assert.equal(kpis.spendByCategory["Structural"], 10000000);
    assert.equal(kpis.totalSavingsVsQuote, 2000000);
    assert.equal(kpis.averageSupplierQualityScore, 95.0);
    assert.equal(kpis.averageTurnaroundDaysReqToPo, 3.0); // (2 + 4) / 2
    assert.equal(kpis.averageDeliveryLeadDays, 10.0);
  });
});

describe("NFR-DP: Nigeria Data Protection Act (NDPA 2023) Compliance & DSAR", () => {
  it("masks sensitive personal and banking information for data minimisation", () => {
    assert.equal(maskPersonalIdentifiableInfo("0123456789", "BANK_ACCOUNT"), "*******789");
    assert.equal(maskPersonalIdentifiableInfo("+2348012345678", "PHONE"), "+234********78");
    assert.equal(maskPersonalIdentifiableInfo("10293847-0001", "TAX_ID"), "102********01");
    assert.equal(maskPersonalIdentifiableInfo("john.doe@edala.com", "EMAIL"), "j******e@edala.com");
  });

  it("generates structured Data-Subject Access Request (DSAR) export with compliance notice", () => {
    const profile = {
      userId: "user-123",
      orgId: "org-456",
      fullName: "Adeola Balogun",
      email: "adeola@edala.com",
      whatsappNumber: "+2348031234567",
      role: "site_engineer",
      createdAt: "2026-01-15T08:00:00Z",
    };

    const dsar = generateDsarExport(profile, {
      requisitionsCount: 14,
      approvalsCount: 0,
      grnCount: 8,
      auditEventsCount: 22,
    });

    assert.equal(dsar.dataSubject.fullName, "Adeola Balogun");
    assert.equal(dsar.requisitionsCreated, 14);
    assert.equal(dsar.grnInspectionsHandled, 8);
    assert.match(dsar.ndpaComplianceNotice, /Section 24 of the Nigeria Data Protection Act 2023/);
  });

  it("enforces statutory audit record retention of 7 years while allowing old draft purging", () => {
    // 3000 days (> 7 years) audit log
    const auditRetention = checkRetentionPolicy("AUDIT_LOG", 3000);
    assert.equal(auditRetention.action, "RETAIN_IMMUTABLE");

    // 120 days (> 90 days) inactive draft
    const draftRetention = checkRetentionPolicy("DRAFT_REQUISITION", 120);
    assert.equal(draftRetention.action, "PURGE_ELIGIBLE");
  });
});

describe("NFR-LOC & NFR-SEC: Localized Subscription Billing & PCI-DSS Enforcement", () => {
  it("generates dedicated Nigerian virtual account for reliable bank transfer billing", () => {
    const bill = generateSubscriptionBill({
      orgId: "org-edala",
      orgName: "Edala Development Ltd",
      planTier: "ENTERPRISE",
      amountNgn: 400000,
      preferredMethod: "VIRTUAL_ACCOUNT",
    });

    assert.equal(bill.paymentMethod, "VIRTUAL_ACCOUNT");
    assert.equal(bill.amountNgn, 400000);
    assert.ok(bill.virtualAccountDetails);
    assert.match(bill.virtualAccountDetails.accountNumber, /^99\d{8}$/);
    assert.equal(bill.pciComplianceVerified, true);
  });

  it("strictly prohibits raw payment card data handling per PCI-DSS requirements", () => {
    const tokenizedPayload = {
      gatewayReference: "pstk_ref_998877",
      provider: "paystack",
      amount: 400000,
    };
    assert.doesNotThrow(() => assertPciDssCardDataAbsence(tokenizedPayload));

    const invalidPayloadWithPan = {
      cardNumber: "4111111111111111",
      cvv: "123",
      amount: 400000,
    };
    assert.throws(
      () => assertPciDssCardDataAbsence(invalidPayloadWithPan),
      /PCI-DSS Security Violation/,
    );
  });
});
