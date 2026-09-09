import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "crypto";
import {
  createPoChangeOrderRecord,
  detectSplitRequisitionAnomalies,
  detectBuyerSupplierAffinityAnomalies,
  calculateManagementKpis,
} from "./governanceAnomalies.ts";
import {
  validateNrsVatInputCreditEligibility,
  generateUblPeppolJson,
  type NRSInvoicePayload,
} from "./nrsEInvoice.ts";
import {
  generateSubscriptionBill,
  assertPciDssCardDataAbsence,
  verifyPaymentGatewayWebhookSignature,
} from "./paymentBillingChannels.ts";

describe("FR-2.6: Approval Authority Delegation Engine", () => {
  interface Delegation {
    id: string;
    delegatorId: string;
    substituteId: string;
    startDate: string; // YYYY-MM-DD
    endDate: string; // YYYY-MM-DD
    status: "active" | "revoked";
  }

  function isAuthorizedApprover(
    actorId: string,
    requiredApproverId: string,
    delegations: Delegation[],
    targetDate: string = new Date().toISOString().slice(0, 10),
  ): { authorized: boolean; asDelegate: boolean; delegatorId?: string } {
    if (actorId === requiredApproverId) {
      return { authorized: true, asDelegate: false };
    }

    const activeDelegation = delegations.find(
      (d) =>
        d.delegatorId === requiredApproverId &&
        d.substituteId === actorId &&
        d.status === "active" &&
        targetDate >= d.startDate &&
        targetDate <= d.endDate,
    );

    if (activeDelegation) {
      return { authorized: true, asDelegate: true, delegatorId: activeDelegation.delegatorId };
    }

    return { authorized: false, asDelegate: false };
  }

  const sampleDelegations: Delegation[] = [
    {
      id: "del-01",
      delegatorId: "user-director-wale",
      substituteId: "user-manager-chidi",
      startDate: "2026-09-01",
      endDate: "2026-09-15",
      status: "active",
    },
    {
      id: "del-02",
      delegatorId: "user-coo-babatunde",
      substituteId: "user-lead-aminat",
      startDate: "2026-08-01",
      endDate: "2026-08-10",
      status: "active", // expired date window
    },
    {
      id: "del-03",
      delegatorId: "user-cfo-ngozi",
      substituteId: "user-manager-chidi",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      status: "revoked", // explicitly revoked
    },
  ];

  it("authorizes original assigned approver directly without delegation", () => {
    const check = isAuthorizedApprover("user-director-wale", "user-director-wale", sampleDelegations, "2026-09-05");
    assert.equal(check.authorized, true);
    assert.equal(check.asDelegate, false);
  });

  it("authorizes designated substitute approver within valid active delegation window", () => {
    const check = isAuthorizedApprover("user-manager-chidi", "user-director-wale", sampleDelegations, "2026-09-05");
    assert.equal(check.authorized, true);
    assert.equal(check.asDelegate, true);
    assert.equal(check.delegatorId, "user-director-wale");
  });

  it("rejects substitute approver when delegation window has expired", () => {
    const check = isAuthorizedApprover("user-lead-aminat", "user-coo-babatunde", sampleDelegations, "2026-09-05");
    assert.equal(check.authorized, false);
    assert.equal(check.asDelegate, false);
  });

  it("rejects substitute approver when delegation was revoked by delegator or admin", () => {
    const check = isAuthorizedApprover("user-manager-chidi", "user-cfo-ngozi", sampleDelegations, "2026-09-05");
    assert.equal(check.authorized, false);
    assert.equal(check.asDelegate, false);
  });

  it("rejects arbitrary unauthorized users trying to act as approver", () => {
    const check = isAuthorizedApprover("user-unauthorized-random", "user-director-wale", sampleDelegations, "2026-09-05");
    assert.equal(check.authorized, false);
    assert.equal(check.asDelegate, false);
  });
});

describe("FR-5.4: Purchase Orders — Change Order & Baseline Preservation Engine", () => {
  it("increments revision sequence and computes monetary delta against baseline", () => {
    const baselinePo = {
      id: "po-lekki-400",
      po_number: "PO-260901-A1B2C",
      total_amount: 45000000,
      currency: "NGN",
      revision_count: 0,
    };

    const changeOrder = createPoChangeOrderRecord({
      po: baselinePo,
      reason: "Structural engineer requested additional 20mm rebar and fast-setting cement for coastal foundation",
      requestedBy: "Procurement Officer Aminat",
      newTotalAmount: 52500000,
      modifiedItems: [
        {
          itemId: "item-rebar-20",
          description: "20mm High-Yield Deformed Rebar",
          oldQuantity: 300,
          newQuantity: 400,
          oldUnitPrice: 75000,
          newUnitPrice: 75000,
        },
      ],
    });

    assert.equal(changeOrder.originalPoNumber, "PO-260901-A1B2C");
    assert.equal(changeOrder.revisionNumber, 1);
    assert.equal(changeOrder.revisedPoNumber, "PO-260901-A1B2C-REV1");
    assert.equal(changeOrder.previousTotalAmount, 45000000);
    assert.equal(changeOrder.newTotalAmount, 52500000);
    assert.equal(changeOrder.deltaAmount, 7500000);
    assert.equal(changeOrder.currency, "NGN");
    assert.equal(changeOrder.modifiedItems.length, 1);
  });

  it("handles subsequent revisions (Rev-2) and correctly tracks previous total", () => {
    const rev1Po = {
      id: "po-lekki-400",
      po_number: "PO-260901-A1B2C",
      total_amount: 52500000,
      currency: "NGN",
      revision_count: 1,
    };

    const secondChangeOrder = createPoChangeOrderRecord({
      po: rev1Po,
      reason: "Negotiated 5% volume rebate with supplier on bulk cement dispatch",
      requestedBy: "Procurement Lead",
      newTotalAmount: 50000000,
      modifiedItems: [
        {
          itemId: "item-cement-50",
          description: "Dangote 42.5R Cement 50kg Bags",
          oldQuantity: 2000,
          newQuantity: 2000,
          oldUnitPrice: 8500,
          newUnitPrice: 8075,
        },
      ],
    });

    assert.equal(secondChangeOrder.revisionNumber, 2);
    assert.equal(secondChangeOrder.revisedPoNumber, "PO-260901-A1B2C-REV2");
    assert.equal(secondChangeOrder.previousTotalAmount, 52500000);
    assert.equal(secondChangeOrder.newTotalAmount, 50000000);
    assert.equal(secondChangeOrder.deltaAmount, -2500000); // Negative delta / savings
  });
});

describe("FR-1.1: Requisitions — Site Delivery Location Verification", () => {
  interface RequisitionPayload {
    title: string;
    projectId: string;
    deliveryLocation: string;
    items: { description: string; quantity: number; estimatedUnitPrice: number }[];
  }

  function validateRequisitionSubmission(payload: RequisitionPayload): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!payload.title || payload.title.trim().length === 0) {
      errors.push("Title is required.");
    }
    if (!payload.projectId || payload.projectId.trim().length === 0) {
      errors.push("Project assignment is required.");
    }
    if (!payload.deliveryLocation || payload.deliveryLocation.trim().length === 0) {
      errors.push("Site delivery location / drop-off address is required.");
    }
    if (!payload.items || payload.items.length === 0) {
      errors.push("At least one line item is required.");
    }
    return { valid: errors.length === 0, errors };
  }

  it("accepts requisition with explicit site delivery location", () => {
    const validReq: RequisitionPayload = {
      title: "Lekki Tower Reinforcement Steels",
      projectId: "proj-lekki-01",
      deliveryLocation: "Gate 3, Lekki Coastal Highway Tower A, Lekki Phase 1, Lagos",
      items: [{ description: "16mm Rebar", quantity: 50, estimatedUnitPrice: 45000 }],
    };

    const res = validateRequisitionSubmission(validReq);
    assert.equal(res.valid, true);
    assert.equal(res.errors.length, 0);
  });

  it("rejects requisition when site delivery location is omitted", () => {
    const invalidReq: RequisitionPayload = {
      title: "Lekki Tower Reinforcement Steels",
      projectId: "proj-lekki-01",
      deliveryLocation: "",
      items: [{ description: "16mm Rebar", quantity: 50, estimatedUnitPrice: 45000 }],
    };

    const res = validateRequisitionSubmission(invalidReq);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("Site delivery location")));
  });
});

describe("FR-7.4 & FR-7.5: NRS E-Invoicing Statutory Compliance & PEPPOL BIS 3.0", () => {
  it("enforces statutory VAT input-credit disqualification when IRN is unvalidated", () => {
    const unvalidatedInvoice = {
      irn: "",
      vatAmount: 750000,
      sellerTin: "10928374-0001",
    };

    const assessment = validateNrsVatInputCreditEligibility(unvalidatedInvoice);
    assert.equal(assessment.isEligibleForVatInputCredit, false);
    assert.equal(assessment.taxClearanceStatus, "UNVALIDATED");
    assert.equal(assessment.claimableVatAmount, 0);
    assert.match(assessment.warningMessage || "", /CRITICAL COMPLIANCE NOTICE/);
  });

  it("approves statutory VAT input-credit when cleared by NRS with IRN", () => {
    const clearedInvoice = {
      irn: "NRS-IRN-2026-0909-4455667788",
      vatAmount: 750000,
      sellerTin: "10928374-0001",
    };

    const assessment = validateNrsVatInputCreditEligibility(clearedInvoice);
    assert.equal(assessment.isEligibleForVatInputCredit, true);
    assert.equal(assessment.taxClearanceStatus, "CLEARED");
    assert.equal(assessment.claimableVatAmount, 750000);
  });

  it("builds compliant PEPPOL BIS 3.0 UBL JSON with statutory NRS extensions", () => {
    const payload: NRSInvoicePayload = {
      invoiceNumber: "INV-2026-9001",
      issueDate: "2026-09-09",
      dueDate: "2026-10-09",
      currency: "NGN",
      sellerTin: "10928374-0001",
      sellerLegalName: "Coastal Steels & Aggregates Ltd",
      buyerTin: "20495867-0001",
      buyerLegalName: "Edala Construction Infrastructure Plc",
      subtotal: 10000000,
      vatAmount: 750000,
      totalAmount: 10750000,
      items: [
        {
          description: "16mm Rebar Bundles",
          quantity: 200,
          unitPrice: 50000,
          vatRate: 7.5,
          lineTotal: 10000000,
        },
      ],
    };

    const peppolJson = generateUblPeppolJson(payload);
    const parsed = JSON.parse(peppolJson);
    assert.equal(parsed.ublVersionID, "2.1");
    assert.equal(parsed.profileID, "urn:peppol:bis:billing:3.0");
    assert.equal(parsed.id, "INV-2026-9001");
    assert.equal(parsed.accountingSupplierParty.taxScheme.taxID, "10928374-0001");
    assert.equal(parsed.legalMonetaryTotal.taxInclusiveAmount, 10750000);
    assert.equal(parsed.legalMonetaryTotal.payableAmount, 10750000);
    assert.equal(parsed.invoiceLine.length, 1);
    assert.equal(parsed.invoiceLine[0].lineExtensionAmount, 10000000);
  });
});

describe("NFR-LOC.2 & NFR-SEC.4: Localized B2B Subscription Billing & PCI-DSS Enforcement", () => {
  it("generates dedicated Nigerian NUBAN virtual account with bank transfer details", () => {
    const bill = generateSubscriptionBill({
      orgId: "org-coastal-infra",
      orgName: "Coastal Infra Plc",
      planTier: "GROWTH",
      amountNgn: 200000,
      preferredMethod: "VIRTUAL_ACCOUNT",
    });

    assert.equal(bill.paymentMethod, "VIRTUAL_ACCOUNT");
    assert.equal(bill.amountNgn, 200000);
    assert.ok(bill.virtualAccountDetails);
    assert.equal(bill.virtualAccountDetails.bankName, "Providus Bank / Wema Bank");
    assert.match(bill.virtualAccountDetails.accountNumber, /^99\d{8}$/);
    assert.equal(bill.pciComplianceVerified, true);
  });

  it("strictly prohibits raw card storage and throws security violation on PAN exposure", () => {
    const invalidCardPayload = {
      cardholderName: "Babatunde Adeleke",
      cardNumber: "5399837462518493",
      cvv: "889",
      expiry: "12/28",
      amountNgn: 200000,
    };

    assert.throws(
      () => assertPciDssCardDataAbsence(invalidCardPayload),
      /PCI-DSS Security Violation/,
    );
  });

  it("verifies payment gateway webhook signature HMAC-SHA512", () => {
    const secret = "test_secret_key_991823";
    const body = JSON.stringify({
      event: "charge.success",
      data: { reference: "BILL-42599910", amount: 200000 },
    });
    const validSignature = createHmac("sha512", secret).update(body).digest("hex");

    assert.equal(
      verifyPaymentGatewayWebhookSignature(body, validSignature, secret, "sha512"),
      true,
    );
    assert.equal(
      verifyPaymentGatewayWebhookSignature(body, "invalid_signature", secret, "sha512"),
      false,
    );
  });
});

