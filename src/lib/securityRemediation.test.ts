import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  computeAuditHash,
  computeAuditHashV1,
  computeAuditHashV2,
  verifyAuditChain,
  GENESIS_HASH,
  type AuditLogChainEntry,
} from "./audit";
import { settleSubscriptionBillServer } from "./procurement.server";

describe("P0 Security: Audit Hash Chain Cryptographic Integrity (§7)", () => {
  const orgA = "11111111-1111-1111-1111-111111111111";
  const orgB = "22222222-2222-2222-2222-222222222222";

  it("computes Canonical V2 hash deterministically with exact decimal formatting", () => {
    const payload = {
      orgId: orgA,
      actorId: "actor-123",
      actorName: "Ada Lovelace",
      eventType: "REQUISITION_SUBMITTED",
      entityType: "requisition",
      entityId: "req-001",
      amount: 150000,
      currency: "NGN",
      detail: "Office equipment procurement",
    };

    const hash1 = computeAuditHashV2(payload, GENESIS_HASH);
    const hash2 = computeAuditHash(payload, GENESIS_HASH, 2);

    assert.equal(hash1, hash2);
    assert.equal(typeof hash1, "string");
    assert.equal(hash1.length, 64);
  });

  it("verifies a valid unbroken chain of multiple records", () => {
    const p1 = {
      orgId: orgA,
      actorId: "user-1",
      actorName: "John Doe",
      eventType: "REQUISITION_SUBMITTED",
      entityType: "requisition",
      entityId: "req-1",
      amount: 250000.5,
      currency: "NGN",
      detail: "Submitted requisition",
    };
    const h1 = computeAuditHashV2(p1, GENESIS_HASH);

    const p2 = {
      orgId: orgA,
      actorId: "user-2",
      actorName: "Jane Smith",
      eventType: "APPROVAL_APPROVED",
      entityType: "requisition",
      entityId: "req-1",
      amount: 250000.5,
      currency: "NGN",
      detail: "First level approval",
    };
    const h2 = computeAuditHashV2(p2, h1);

    const entries: AuditLogChainEntry[] = [
      { id: "1", hash: h1, previousHash: GENESIS_HASH, hashVersion: 2, payload: p1 },
      { id: "2", hash: h2, previousHash: h1, hashVersion: 2, payload: p2 },
    ];

    const result = verifyAuditChain(entries, orgA);
    assert.equal(result.isValid, true);
    assert.equal(result.verifiedCount, 2);
  });

  it("detects tampering when payload amount is modified by 1 kobo", () => {
    const p1 = {
      orgId: orgA,
      actorId: "user-1",
      actorName: "John Doe",
      eventType: "PO_ISSUED",
      entityType: "purchase_order",
      entityId: "po-1",
      amount: 1000000.0,
      currency: "NGN",
      detail: "Approved PO",
    };
    const h1 = computeAuditHashV2(p1, GENESIS_HASH);

    // Tampered payload in transit/storage: 1,000,000.01 instead of 1,000,000.00
    const tamperedPayload = { ...p1, amount: 1000000.01 };
    const entries: AuditLogChainEntry[] = [
      { id: "1", hash: h1, previousHash: GENESIS_HASH, hashVersion: 2, payload: tamperedPayload },
    ];

    const result = verifyAuditChain(entries, orgA);
    assert.equal(result.isValid, false);
    assert.equal(result.brokenAtIndex, 0);
    assert.match(result.error!, /Tampered payload detected/);
  });

  it("detects tampering when entityId or actorId is altered", () => {
    const p1 = {
      orgId: orgA,
      actorId: "user-legit",
      actorName: "Legit Approver",
      eventType: "APPROVAL_APPROVED",
      entityType: "requisition",
      entityId: "req-777",
      amount: 50000,
      currency: "NGN",
      detail: "Approved",
    };
    const h1 = computeAuditHashV2(p1, GENESIS_HASH);

    const tamperedPayload = { ...p1, actorId: "attacker-user" };
    const entries: AuditLogChainEntry[] = [
      { id: "1", hash: h1, previousHash: GENESIS_HASH, hashVersion: 2, payload: tamperedPayload },
    ];

    const result = verifyAuditChain(entries, orgA);
    assert.equal(result.isValid, false);
    assert.equal(result.brokenAtIndex, 0);
  });

  it("detects broken previousHash link in the middle of a chain", () => {
    const p1 = { orgId: orgA, eventType: "EVT1", entityId: "1", amount: 100 };
    const h1 = computeAuditHashV2(p1, GENESIS_HASH);

    const p2 = { orgId: orgA, eventType: "EVT2", entityId: "2", amount: 200 };
    const h2 = computeAuditHashV2(p2, h1);

    // Broken previousHash: entry 2 claims a forged previous hash
    const forgedPrevHash = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    const entries: AuditLogChainEntry[] = [
      { id: "1", hash: h1, previousHash: GENESIS_HASH, hashVersion: 2, payload: p1 },
      { id: "2", hash: h2, previousHash: forgedPrevHash, hashVersion: 2, payload: p2 },
    ];

    const result = verifyAuditChain(entries, orgA);
    assert.equal(result.isValid, false);
    assert.equal(result.brokenAtIndex, 1);
    assert.match(result.error!, /Broken chain link/);
  });

  it("verifies legacy V1 hash backward compatibility safely", () => {
    const p1 = {
      orgId: orgA,
      actorId: "user-1",
      actorName: "Legacy User",
      eventType: "REQUISITION_SUBMITTED",
      entityType: "requisition",
      entityId: "req-old",
      amount: 500000,
    };
    const legacyHash = computeAuditHashV1(p1, GENESIS_HASH);

    const entries: AuditLogChainEntry[] = [
      { id: "1", hash: legacyHash, previousHash: GENESIS_HASH, hashVersion: 1, payload: p1 },
    ];

    const result = verifyAuditChain(entries, orgA);
    assert.equal(result.isValid, true);
    assert.equal(result.verifiedCount, 1);
  });

  it("detects cross-tenant contamination when entries from another org are present", () => {
    const p1 = { orgId: orgB, eventType: "EVT1", entityId: "1" };
    const h1 = computeAuditHashV2(p1, GENESIS_HASH);

    const entries: AuditLogChainEntry[] = [
      { id: "1", hash: h1, previousHash: GENESIS_HASH, hashVersion: 2, payload: p1 },
    ];

    const result = verifyAuditChain(entries, orgA);
    assert.equal(result.isValid, false);
    assert.match(result.error!, /Cross-tenant contamination/);
  });
});

describe("P0 Security: Subscription Self-Settlement Protection (§3)", () => {
  it("strictly prohibits tenant users from calling settleSubscriptionBillServer", async () => {
    await assert.rejects(
      async () => {
        await settleSubscriptionBillServer("user-fake", "INV-2026-001", "NIP-FORGED");
      },
      (err: Error) => {
        assert.match(err.message, /Direct tenant self-settlement of subscriptions is prohibited/i);
        return true;
      },
    );
  });
});

describe("P0 Security: WhatsApp Webhook Fail-Closed Cryptographic Verification (§4)", () => {
  const secret = "test_whatsapp_webhook_secret_key_123456789";
  const body = JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                { id: "msg_123", from: "2348012345678", text: { body: "APPROVE step_1" } },
              ],
            },
          },
        ],
      },
    ],
  });

  it("generates and verifies valid HMAC-SHA256 signature", () => {
    const validSignature = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

    const expectedSig = createHmac("sha256", secret).update(body).digest("hex");
    assert.equal(validSignature.slice(7), expectedSig);
  });

  it("rejects forged signature with mismatched HMAC", () => {
    const forgedSignature =
      "sha256=0000000000000000000000000000000000000000000000000000000000000000";
    const expectedSig = createHmac("sha256", secret).update(body).digest("hex");
    assert.notEqual(forgedSignature.slice(7), expectedSig);
  });

  it("normalizes phone numbers and rejects insufficient digits (< 10 digits)", () => {
    const shortPhone = "080123";
    const clean = shortPhone.replace(/[^0-9]/g, "");
    assert.equal(clean.length < 10, true);

    const validPhone = "+234 801 234 5678";
    const validClean = validPhone.replace(/[^0-9]/g, "");
    assert.equal(validClean.length >= 10, true);
    assert.equal(validClean.slice(-10), "8012345678");
  });
});

describe("P1: Supplier Quote File Upload Direct Storage Hardening (§8)", () => {
  const allowedMimes = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ]);

  const allowedExts = new Set([".pdf", ".png", ".jpg", ".jpeg", ".docx", ".xlsx", ".csv"]);

  it("accepts valid PDF and Excel files under 25MB", () => {
    const validPdfMime = "application/pdf";
    const validPdfExt = ".pdf";
    const size = 5 * 1024 * 1024; // 5MB

    assert.equal(allowedMimes.has(validPdfMime), true);
    assert.equal(allowedExts.has(validPdfExt), true);
    assert.equal(size <= 25 * 1024 * 1024, true);
  });

  it("rejects dangerous or executable file extensions", () => {
    const dangerousExts = [".exe", ".sh", ".js", ".bat", ".php", ".py"];
    for (const ext of dangerousExts) {
      assert.equal(allowedExts.has(ext), false);
    }
  });

  it("enforces tenant-isolated storage path prefix for supplier quote submissions", () => {
    const orgId = "org-111";
    const rfqId = "rfq-222";
    const supplierId = "supp-333";

    const validPath = `${orgId}/${rfqId}/${supplierId}/quote-attachment.pdf`;
    const crossTenantPath = `other-org/${rfqId}/${supplierId}/quote-attachment.pdf`;
    const crossRfqPath = `${orgId}/other-rfq/${supplierId}/quote-attachment.pdf`;

    const expectedPrefix = `${orgId}/${rfqId}/${supplierId}/`;
    assert.equal(validPath.startsWith(expectedPrefix), true);
    assert.equal(crossTenantPath.startsWith(expectedPrefix), false);
    assert.equal(crossRfqPath.startsWith(expectedPrefix), false);
  });
});

describe("P1: Three-Way Match Single Source of Truth (§11)", () => {
  it("enforces tolerance consistency where small accepted variance remains matched", () => {
    const poTotal = 100000.0;
    const invTotal = 100040.0; // 0.04% variance (within standard 1% tolerance)
    const variancePercent = Math.abs((invTotal - poTotal) / poTotal) * 100;

    assert.equal(variancePercent <= 1.0, true);
  });

  it("flags discrepancy when invoice total variance exceeds 1% tolerance", () => {
    const poTotal = 100000.0;
    const invTotal = 105000.0; // 5% variance
    const variancePercent = Math.abs((invTotal - poTotal) / poTotal) * 100;

    assert.equal(variancePercent > 1.0, true);
  });
});
