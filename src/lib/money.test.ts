import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  toMinorUnits,
  fromMinorUnits,
  addMoney,
  multiplyQuantityPrice,
  calculateNigerianTaxes,
  assertSingleCurrencyPo,
} from "./money.ts";

describe("Money & Financial Calculation Engine", () => {
  it("converts major units to integer minor units without precision loss", () => {
    assert.equal(toMinorUnits(100.55), 10055);
    assert.equal(toMinorUnits(0.01), 1);
    assert.equal(toMinorUnits(1500000.75), 150000075);
  });

  it("converts minor units back to major units correctly", () => {
    assert.equal(fromMinorUnits(10055), 100.55);
    assert.equal(fromMinorUnits(1), 0.01);
  });

  it("safely adds multiple money items in the same currency", () => {
    const items = [
      { amount: 100.2, currency: "NGN" as const },
      { amount: 200.1, currency: "NGN" as const },
      { amount: 300.7, currency: "NGN" as const },
    ];
    const total = addMoney(items, "NGN");
    assert.equal(total.amount, 601.0);
    assert.equal(total.currency, "NGN");
  });

  it("throws error when trying to add mismatched currencies", () => {
    const items = [
      { amount: 100, currency: "NGN" as const },
      { amount: 50, currency: "USD" as const },
    ];
    assert.throws(() => addMoney(items, "NGN"), /Currency mismatch/);
  });

  it("multiplies quantity and unit price accurately with fractional quantities", () => {
    // 33.333 tons of granite @ 15,450.00 / ton
    const result = multiplyQuantityPrice(33.333, 15450, "NGN");
    assert.equal(result.amount, 514994.85);
    assert.equal(result.currency, "NGN");
  });

  it("calculates Nigerian VAT (7.5%) and Withholding Tax (5%) on standard goods", () => {
    const subtotal = 10000000; // 10,000,000 NGN
    const tax = calculateNigerianTaxes(subtotal, "NGN", { vatRate: 7.5, whtRate: 5.0 });

    assert.equal(tax.subtotal, 10000000);
    assert.equal(tax.vatAmount, 750000); // 7.5% of 10m
    assert.equal(tax.grossAmount, 10750000); // 10m + 750k
    assert.equal(tax.whtAmount, 500000); // 5% of 10m deducted at source
    assert.equal(tax.netPayable, 10250000); // 10,750,000 - 500,000
  });

  it("enforces Single-Currency PO policy", () => {
    assert.doesNotThrow(() => {
      assertSingleCurrencyPo([{ currency: "NGN" }, { currency: "NGN" }], "NGN");
    });

    assert.throws(() => {
      assertSingleCurrencyPo([{ currency: "NGN" }, { currency: "USD" }], "NGN");
    }, /PO Policy Violation/);
  });
});
