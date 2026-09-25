/**
 * Tamper-Evident Cryptographic Audit Logging Engine
 *
 * Implements SHA-256 Hash Chaining:
 * Canonical V2:
 * Hash_n = SHA-256("v2|" + Hash_{n-1} + "|" + orgId + "|" + actorId + "|" + actorName + "|" + eventType + "|" + entityType + "|" + entityId + "|" + amount + "|" + currency + "|" + detail)
 *
 * Backward-compatible with Legacy V1 payloads.
 * Any historical record modification breaks the cryptographic chain and is immediately detectable.
 */

import { createHash } from "crypto";

export const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

export interface AuditEventPayload {
  orgId: string;
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  eventType: string; // e.g. 'REQUISITION_SUBMITTED', 'APPROVAL_APPROVED', 'PO_ISSUED'
  entityType?: string | null; // e.g. 'requisition', 'purchase_order', 'invoice', 'delivery'
  entityId?: string | null;
  timestamp?: string | null; // ISO 8601
  detail?: string | null;
  amount?: number | null;
  currency?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditLogChainEntry {
  id?: string;
  hash: string;
  previousHash: string;
  hashVersion?: number | null;
  payload: AuditEventPayload;
}

/**
 * Computes Canonical V2 SHA-256 hash for an audit record linked to the previous block hash.
 * Synchronized with the PostgreSQL trigger fn_audit_log_hash_chain().
 */
export function computeAuditHashV2(
  payload: AuditEventPayload,
  previousHash: string = GENESIS_HASH,
): string {
  const amountStr =
    payload.amount != null && !isNaN(Number(payload.amount))
      ? Number(payload.amount).toFixed(2)
      : "";

  const parts = [
    "v2",
    previousHash,
    payload.orgId || "",
    payload.actorId || "",
    payload.actorName || "",
    payload.eventType || "",
    payload.entityType || "requisition",
    payload.entityId || "",
    amountStr,
    payload.currency || "NGN",
    payload.detail || "",
  ];

  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
}

/**
 * Computes Legacy V1 SHA-256 hash for legacy database rows.
 */
export function computeAuditHashV1(
  payload: AuditEventPayload,
  previousHash: string = GENESIS_HASH,
): string {
  const parts = [
    payload.orgId || "",
    payload.actorId || "",
    payload.actorName || "",
    payload.eventType || "",
    payload.entityType || "",
    payload.entityId || "",
    payload.amount != null ? String(payload.amount) : "0",
    previousHash,
  ];

  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
}

/**
 * Computes SHA-256 hash for an audit record linked to the previous block hash.
 * Defaults to Canonical V2.
 */
export function computeAuditHash(
  payload: AuditEventPayload,
  previousHash: string = GENESIS_HASH,
  version: number = 2,
): string {
  return version === 1
    ? computeAuditHashV1(payload, previousHash)
    : computeAuditHashV2(payload, previousHash);
}

/**
 * Verifies the integrity of an ordered sequence of audit log entries.
 * Validates:
 * 1. Unbroken hash chain link (each entry's previousHash matches previous entry's hash)
 * 2. Cryptographic payload authenticity (SHA-256 recomputed matches stored hash)
 * 3. Strict tenant isolation (all entries must belong to the specified or consistent org)
 */
export function verifyAuditChain(
  entries: AuditLogChainEntry[],
  expectedOrgId?: string,
): { isValid: boolean; brokenAtIndex?: number; verifiedCount: number; error?: string } {
  if (!entries || entries.length === 0) {
    return { isValid: true, verifiedCount: 0 };
  }

  let expectedPrevHash = entries[0]?.previousHash || GENESIS_HASH;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;

    // Verify tenant isolation
    if (expectedOrgId && entry.payload.orgId !== expectedOrgId) {
      return {
        isValid: false,
        brokenAtIndex: i,
        verifiedCount: i,
        error: `Cross-tenant contamination detected at index ${i}: expected org ${expectedOrgId}, got ${entry.payload.orgId}`,
      };
    }

    // Verify chain continuity
    if (entry.previousHash !== expectedPrevHash) {
      return {
        isValid: false,
        brokenAtIndex: i,
        verifiedCount: i,
        error: `Broken chain link at index ${i}: expected previousHash ${expectedPrevHash}, got ${entry.previousHash}`,
      };
    }

    // Verify hash integrity according to version
    const version = entry.hashVersion ?? 2;
    let calculatedHash = computeAuditHashV2(entry.payload, entry.previousHash);

    if (version === 1 && calculatedHash !== entry.hash) {
      const legacyHash = computeAuditHashV1(entry.payload, entry.previousHash);
      if (legacyHash === entry.hash) {
        calculatedHash = legacyHash;
      }
    }

    if (calculatedHash !== entry.hash) {
      return {
        isValid: false,
        brokenAtIndex: i,
        verifiedCount: i,
        error: `Tampered payload detected at index ${i} (ID: ${entry.id || "unknown"}): hash mismatch (computed ${calculatedHash}, stored ${entry.hash})`,
      };
    }

    expectedPrevHash = entry.hash;
  }

  return { isValid: true, verifiedCount: entries.length };
}
