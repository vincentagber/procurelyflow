/**
 * Central Financial & Currency Abstraction for Procurely Flow
 *
 * Requirements:
 * - Zero JavaScript floating-point errors on currency/tax calculations.
 * - Integer minor units or exact decimal precision.
 * - Single-currency PO enforcement.
 * - Explicit tax and withholding tax (WHT) math.
 */

export type CurrencyCode = "NGN" | "USD" | "EUR" | "GBP" | "ZAR" | "KES" | "AED" | "CAD" | "CNY";

export interface Money {
  amount: number; // Stored in major units with 2 decimal precision (e.g. 50000.50)
  currency: CurrencyCode;
}

export interface FxRateSnapshot {
  baseCurrency: CurrencyCode;
  targetCurrency: CurrencyCode;
  rate: number; // 1 Base = rate Target
  asOf: string; // ISO 8601 timestamp
  source: "CENTRAL_BANK" | "TREASURY_SPOT" | "FORWARD_CONTRACT" | "MANUAL_OVERRIDE";
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

/** Converts money from one currency to another using an explicit FX rate snapshot */
export function convertCurrency(
  money: Money,
  targetCurrency: CurrencyCode,
  fxSnapshot: FxRateSnapshot,
): Money & { convertedFrom: Money; fxRateUsed: number } {
  if (money.currency === targetCurrency) {
    return {
      amount: money.amount,
      currency: targetCurrency,
      convertedFrom: money,
      fxRateUsed: 1.0,
    };
  }

  if (fxSnapshot.baseCurrency !== money.currency || fxSnapshot.targetCurrency !== targetCurrency) {
    throw new Error(
      `FX Rate Mismatch: Provided snapshot is for ${fxSnapshot.baseCurrency}->${fxSnapshot.targetCurrency}, but conversion requires ${money.currency}->${targetCurrency}.`,
    );
  }

  // Calculate with high precision then round half-up to minor units
  const convertedAmount = fromMinorUnits(Math.round(toMinorUnits(money.amount) * fxSnapshot.rate));

  return {
    amount: convertedAmount,
    currency: targetCurrency,
    convertedFrom: money,
    fxRateUsed: fxSnapshot.rate,
  };
}

/** Multiplies quantity by unit price safely */
export function multiplyQuantityPrice(
  quantity: number,
  unitPrice: number,
  currency: CurrencyCode,
): Money {
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

export interface LandedTcoParameters {
  basePrice: number;
  currency: CurrencyCode;
  freightCost?: number;
  customsTariffPercent?: number; // e.g., 10 for 10% import tariff
  vatRate?: number; // e.g., 7.5
  paymentTermDiscountPercent?: number; // e.g. 2 for 2% Net-10 prompt payment cash discount
}

export interface TotalCostOfOwnershipResult {
  basePrice: number;
  freightCost: number;
  customsTariffAmount: number;
  vatAmount: number;
  cashDiscountAmount: number;
  totalLandedCost: number;
  currency: CurrencyCode;
}

/**
 * Calculates enterprise Total Cost of Ownership (TCO) and landed cost
 * for normalized supplier quotation evaluations.
 */
export function calculateTotalCostOfOwnership(
  params: LandedTcoParameters,
): TotalCostOfOwnershipResult {
  const baseMinor = toMinorUnits(params.basePrice);
  const freightMinor = toMinorUnits(params.freightCost ?? 0);
  const tariffPercent = params.customsTariffPercent ?? 0;
  const tariffMinor = Math.round((baseMinor + freightMinor) * (tariffPercent / 100));

  const vatRate = params.vatRate ?? 7.5;
  const taxableBaseMinor = baseMinor + freightMinor + tariffMinor;
  const vatMinor = Math.round(taxableBaseMinor * (vatRate / 100));

  const discountPercent = params.paymentTermDiscountPercent ?? 0;
  const discountMinor = Math.round(baseMinor * (discountPercent / 100));

  const totalLandedMinor = taxableBaseMinor + vatMinor - discountMinor;

  return {
    basePrice: fromMinorUnits(baseMinor),
    freightCost: fromMinorUnits(freightMinor),
    customsTariffAmount: fromMinorUnits(tariffMinor),
    vatAmount: fromMinorUnits(vatMinor),
    cashDiscountAmount: fromMinorUnits(discountMinor),
    totalLandedCost: fromMinorUnits(totalLandedMinor),
    currency: params.currency,
  };
}

/**
 * Validates that all items in a purchase order match the designated PO currency.
 * Enforces: ONE CURRENCY PER PURCHASE ORDER.
 */
export function assertSingleCurrencyPo(
  items: { currency: string }[],
  poCurrency: CurrencyCode,
): void {
  for (const item of items) {
    if (item.currency !== poCurrency) {
      throw new Error(
        `PO Policy Violation: All line items must match the PO settlement currency (${poCurrency}). Found line item in ${item.currency}. Mixed currency POs are prohibited.`,
      );
    }
  }
}
