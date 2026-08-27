import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeAuditHash, verifyAuditChain, GENESIS_HASH } from "./audit.ts";

describe("Tamper-Evident SHA-256 Audit Chaining", () => {
  it("computes deterministic SHA-256 hashes", () => {
    const payload = {
      orgId: "org-1",
      actorId: "user-1",
      actorName: "Vincent Agber",
      actorRole: "procurement_officer",
      eventType: "PO_ISSUED",
      entityType: "purchase_order",
      entityId: "po-123",
      timestamp: "2026-08-27T12:00:00.000Z",
      amount: 5000000,
      currency: "NGN",
      metadata: { itemsCount: 3, supplier: "Dangote Cement" },
    };

    const hash1 = computeAuditHash(payload, GENESIS_HASH);
    const hash2 = computeAuditHash(payload, GENESIS_HASH);
    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 64);
  });

  it("verifies a valid unbroken cryptographic chain", () => {
    const payload1 = {
      orgId: "org-1",
      eventType: "REQUISITION_SUBMITTED",
      entityType: "requisition",
      entityId: "req-1",
      timestamp: "2026-08-27T10:00:00.000Z",
    };
    const hash1 = computeAuditHash(payload1, GENESIS_HASH);

    const payload2 = {
      orgId: "org-1",
      eventType: "APPROVAL_APPROVED",
      entityType: "requisition",
      entityId: "req-1",
      timestamp: "2026-08-27T10:15:00.000Z",
    };
    const hash2 = computeAuditHash(payload2, hash1);

    const chain = [
      { hash: hash1, previousHash: GENESIS_HASH, payload: payload1 },
      { hash: hash2, previousHash: hash1, payload: payload2 },
    ];

    const result = verifyAuditChain(chain);
    assert.equal(result.isValid, true);
  });

  it("detects tampered payload in history", () => {
    const payload1 = {
      orgId: "org-1",
      eventType: "REQUISITION_SUBMITTED",
      entityType: "requisition",
      entityId: "req-1",
      timestamp: "2026-08-27T10:00:00.000Z",
      amount: 1000000,
    };
    const hash1 = computeAuditHash(payload1, GENESIS_HASH);

    const payload2 = {
      orgId: "org-1",
      eventType: "APPROVAL_APPROVED",
      entityType: "requisition",
      entityId: "req-1",
      timestamp: "2026-08-27T10:15:00.000Z",
      amount: 1000000,
    };
    const hash2 = computeAuditHash(payload2, hash1);

    // Attacker tampers with payload1 amount (1,000,000 -> 9,000,000)
    const tamperedPayload1 = { ...payload1, amount: 9000000 };

    const chain = [
      { hash: hash1, previousHash: GENESIS_HASH, payload: tamperedPayload1 },
      { hash: hash2, previousHash: hash1, payload: payload2 },
    ];

    const result = verifyAuditChain(chain);
    assert.equal(result.isValid, false);
    assert.match(result.error || "", /Tampered payload detected at index 0/);
  });
});
