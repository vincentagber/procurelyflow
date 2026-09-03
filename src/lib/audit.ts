/**
 * Tamper-Evident Cryptographic Audit Logging Engine (Prompt §34, §35)
 *
 * Implements SHA-256 Hash Chaining:
 * Hash_n = SHA-256(Hash_{n-1} + "|" + orgId + "|" + eventType + "|" + entityId + "|" + timestamp + "|" + canonicalPayload)
 *
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
  entityType: string; // e.g. 'requisition', 'purchase_order', 'invoice', 'delivery'
  entityId: string;
  timestamp: string; // ISO 8601
  detail?: string | null;
  amount?: number | null;
  currency?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Canonical stringifier to guarantee deterministic hashing regardless of key order */
function canonicalizeJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalizeJson).join(",") + "]";
  }
  const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = sortedKeys.map(
    (k) => `${JSON.stringify(k)}:${canonicalizeJson((obj as Record<string, unknown>)[k])}`,
  );
  return "{" + pairs.join(",") + "}";
}

/** Computes SHA-256 hash for an audit record linked to the previous block hash */
export function computeAuditHash(
  payload: AuditEventPayload,
  previousHash: string = GENESIS_HASH,
): string {
  const message = [
    previousHash,
    payload.orgId,
    payload.eventType,
    payload.entityType,
    payload.entityId,
    payload.timestamp,
    payload.amount ?? "",
    payload.currency ?? "",
    canonicalizeJson(payload.metadata ?? {}),
  ].join("|");

  return createHash("sha256").update(message, "utf8").digest("hex");
}

/** Verifies the integrity of an ordered sequence of audit log entries */
export function verifyAuditChain(
  entries: {
    hash: string;
    previousHash: string;
    payload: AuditEventPayload;
  }[],
): { isValid: boolean; brokenAtIndex?: number; error?: string } {
  let expectedPrevHash = GENESIS_HASH;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    if (entry.previousHash !== expectedPrevHash) {
      return {
        isValid: false,
        brokenAtIndex: i,
        error: `Broken chain link at index ${i}: expected previousHash ${expectedPrevHash}, got ${entry.previousHash}`,
      };
    }

    const calculatedHash = computeAuditHash(entry.payload, entry.previousHash);
    if (calculatedHash !== entry.hash) {
      return {
        isValid: false,
        brokenAtIndex: i,
        error: `Tampered payload detected at index ${i}: hash mismatch (expected ${calculatedHash}, stored ${entry.hash})`,
      };
    }

    expectedPrevHash = entry.hash;
  }

  return { isValid: true };
}
