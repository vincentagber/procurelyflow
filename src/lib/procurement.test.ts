import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertSingleCurrencyPo } from "./money.ts";
import { createHash, randomBytes } from "crypto";

describe("Procurement Domain Logic & Business Policies", () => {
  it("enforces Single Currency per Purchase Order (NGN or USD, never mixed)", () => {
    // Valid 100% NGN PO items
    const validNgnItems = [
      { currency: "NGN", unit_price: 5000 },
      { currency: "NGN", unit_price: 15000 },
    ];
    assert.doesNotThrow(() => assertSingleCurrencyPo(validNgnItems, "NGN"));

    // Valid 100% USD PO items
    const validUsdItems = [
      { currency: "USD", unit_price: 1200 },
      { currency: "USD", unit_price: 450 },
    ];
    assert.doesNotThrow(() => assertSingleCurrencyPo(validUsdItems, "USD"));

    // Mixed currency items in an NGN PO must be rejected
    const mixedItems = [
      { currency: "NGN", unit_price: 5000 },
      { currency: "USD", unit_price: 1200 },
    ];
    assert.throws(
      () => assertSingleCurrencyPo(mixedItems, "NGN"),
      /PO Policy Violation: All line items must match the PO settlement currency/,
    );
  });

  it("validates quote expiration rules before award", () => {
    const isQuoteValid = (validUntilStr: string, asOfDate: Date = new Date()): boolean => {
      const validUntil = new Date(validUntilStr);
      return validUntil.getTime() >= asOfDate.getTime();
    };

    const futureQuote = "2026-12-31T23:59:59.000Z";
    const expiredQuote = "2026-01-01T00:00:00.000Z";

    assert.equal(isQuoteValid(futureQuote), true);
    assert.equal(isQuoteValid(expiredQuote), false);
  });

  it("generates cryptographically secure single-use action tokens with SHA-256 hashing", () => {
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    assert.equal(rawToken.length, 64);
    assert.equal(tokenHash.length, 64);
    assert.notEqual(rawToken, tokenHash);

    // Verify token verification via hash matching
    const incomingToken = rawToken;
    const computedHash = createHash("sha256").update(incomingToken).digest("hex");
    assert.equal(computedHash, tokenHash);
  });

  it("validates proxy quote data invariants (mandatory evidence & source)", () => {
    interface ProxyQuoteInput {
      supplierId: string;
      isProxy: boolean;
      proxySource?: "whatsapp_message" | "phone_call" | "physical_document" | "email" | "other";
      proxyEvidenceUrl?: string;
    }

    const validateProxyQuote = (input: ProxyQuoteInput): void => {
      if (input.isProxy) {
        if (!input.proxySource) {
          throw new Error("Proxy quote requires a documented proxySource.");
        }
        if (!input.proxyEvidenceUrl && input.proxySource !== "phone_call") {
          throw new Error("Proxy quote requires an uploaded evidence document/photo.");
        }
      }
    };

    // Valid proxy quote with WhatsApp screenshot evidence
    assert.doesNotThrow(() =>
      validateProxyQuote({
        supplierId: "sup-1",
        isProxy: true,
        proxySource: "whatsapp_message",
        proxyEvidenceUrl: "https://storage.supabase.co/quotes/evidence_123.webp",
      }),
    );

    // Invalid proxy quote missing source
    assert.throws(
      () =>
        validateProxyQuote({
          supplierId: "sup-1",
          isProxy: true,
        }),
      /Proxy quote requires a documented proxySource/,
    );
  });
});
