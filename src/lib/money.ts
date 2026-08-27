/**
 * Central Financial & Currency Abstraction for Procurely Flow
 *
 * Requirements:
 * - Zero JavaScript floating-point errors on currency/tax calculations.
 * - Integer minor units or exact decimal precision.
 * - Single-currency PO enforcement.
 * - Explicit tax and withholding tax (WHT) math.
 */

export type CurrencyCode = "NGN" | "USD";

export interface Money {
  amount: number; // Stored in major units with 2 decimal precision (e.g. 50000.50)
  currency: CurrencyCode;
}

/** Converts major unit amount to integer minor units (kobo / cents) */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

/** Converts integer minor units (kobo / cents) back to major unit float rounded to 2 decimals */
export function fromMinorUnits(minor: number): number {
  return Math.round(minor) / 100;
}

/** Adds multiple amounts in the same currency safely using integer minor units */
export function addMoney(items: Money[], targetCurrency: CurrencyCode): Money {
  let totalMinor = 0;
  for (const item of items) {
    if (item.currency !== targetCurrency) {
      throw new Error(
        `Currency mismatch: cannot add ${item.currency} to ${targetCurrency} without explicit FX snapshot.`,
      );
    }
    totalMinor += toMinorUnits(item.amount);
  }
  return {
    amount: fromMinorUnits(totalMinor),
    currency: targetCurrency,
  };
}

/** Multiplies quantity by unit price safely */
export function multiplyQuantityPrice(quantity: number, unitPrice: number, currency: CurrencyCode): Money {
  const qMinor = Math.round(quantity * 1000); // 3 decimals for fractional quantities
  const pMinor = Math.round(unitPrice * 100); // 2 decimals for unit price
  const totalMinor = Math.round((qMinor * pMinor) / 1000);
  return {
    amount: fromMinorUnits(totalMinor),
    currency,
  };
}

export interface TaxCalculationResult {
  subtotal: number;
  vatRate: number; // e.g. 7.5 for Nigeria VAT
  vatAmount: number;
  grossAmount: number; // Subtotal + VAT
  whtRate: number; // e.g. 5 for Goods (5%), 10 for Construction (10%), 0 if exempt
  whtAmount: number; // Deducted at source
  netPayable: number; // grossAmount - whtAmount
  currency: CurrencyCode;
}

/**
 * Calculates Nigerian statutory VAT (7.5%) and Withholding Tax (WHT).
 * Standard construction formula:
 * Gross Invoice = Subtotal + VAT
 * WHT is deducted from Subtotal (or statutory base)
 * Net Payable = Gross Invoice - WHT
 */
export function calculateNigerianTaxes(
  subtotal: number,
  currency: CurrencyCode = "NGN",
  options?: {
    vatRate?: number; // defaults to 7.5
    whtRate?: number; // defaults to 5.0 (goods) or 10.0 (contracts)
    isVatExempt?: boolean;
    isWhtExempt?: boolean;
  },
): TaxCalculationResult {
  const vatRate = options?.isVatExempt ? 0 : (options?.vatRate ?? 7.5);
  const whtRate = options?.isWhtExempt ? 0 : (options?.whtRate ?? 0);

  const subMinor = toMinorUnits(subtotal);
  const vatMinor = Math.round(subMinor * (vatRate / 100));
  const grossMinor = subMinor + vatMinor;
  const whtMinor = Math.round(subMinor * (whtRate / 100));
  const payableMinor = grossMinor - whtMinor;

  return {
    subtotal: fromMinorUnits(subMinor),
    vatRate,
    vatAmount: fromMinorUnits(vatMinor),
    grossAmount: fromMinorUnits(grossMinor),
    whtRate,
    whtAmount: fromMinorUnits(whtMinor),
    netPayable: fromMinorUnits(payableMinor),
    currency,
  };
}

/**
 * Validates that all items in a purchase order match the designated PO currency.
 * Enforces: ONE CURRENCY PER PURCHASE ORDER (NGN or USD).
 */
export function assertSingleCurrencyPo(items: { currency: string }[], poCurrency: CurrencyCode): void {
  for (const item of items) {
    if (item.currency !== poCurrency) {
      throw new Error(
        `PO Policy Violation: All line items must match the PO settlement currency (${poCurrency}). Found line item in ${item.currency}. Mixed currency POs are prohibited.`,
      );
    }
  }
}
