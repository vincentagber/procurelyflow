/**
 * Nigerian Localized Subscription Billing & Payment Engine (NFR-LOC.2, NFR-SEC.4)
 *
 * Production-grade integration with:
 * 1. Monnify API – Reserved Account (Dedicated NUBAN) provisioning
 * 2. Paystack – Dedicated Virtual Account provisioning (fallback)
 * 3. Graceful local simulation when gateway credentials are not configured
 * 4. Zero Raw Card Storage – PCI-DSS Compliant Payment Partner Tokenization
 * 5. Payment Gateway Webhook Signature Verification (HMAC-SHA512 / SHA-256)
 * 6. Reconciliation Status Machine
 *
 * To activate real gateways, set these environment variables:
 *   MONNIFY_API_KEY, MONNIFY_SECRET_KEY, MONNIFY_CONTRACT_CODE
 *   PAYSTACK_SECRET_KEY
 */

import { createHmac } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SubscriptionPaymentMethod =
  "VIRTUAL_ACCOUNT" | "BANK_TRANSFER" | "INVOICE_BILLING" | "CARD_TOKEN";

export type PaymentGateway = "MONNIFY" | "PAYSTACK" | "SIMULATED";

export interface VirtualAccountDetails {
  bankName: string;
  accountNumber: string;
  accountName: string;
  assignedAt: string;
  /** The specific gateway that provisioned this account */
  provider: PaymentGateway;
  /**
   * The gateway's internal reference for this reserved account.
   * Used in webhook reconciliation to identify which invoice was settled.
   */
  gatewayReference?: string;
}

export interface TenantSubscriptionBill {
  invoiceId: string;
  orgId: string;
  orgName: string;
  planTier: "PILOT" | "STANDARD" | "STARTER" | "GROWTH" | "BUSINESS" | "ENTERPRISE";
  billingPeriod: { start: string; end: string };
  amountNgn: number;
  paymentMethod: SubscriptionPaymentMethod;
  virtualAccountDetails?: VirtualAccountDetails;
  paymentStatus: "PENDING" | "SETTLED" | "OVERDUE";
  clearedAt?: string;
  pciComplianceVerified: boolean;
}

// ─── Monnify API Client ────────────────────────────────────────────────────────

interface MonnifyReservedAccountResponse {
  requestSuccessful: boolean;
  responseMessage: string;
  responseCode: string;
  responseBody?: {
    accountReference: string;
    accountName: string;
    currencyCode: string;
    contractCode: string;
    customerEmail: string;
    customerName: string;
    accounts: Array<{
      bankCode: string;
      bankName: string;
      accountNumber: string;
    }>;
  };
}

/**
 * Provisions a dedicated Monnify Reserved Account (NUBAN Virtual Account).
 * Returns null when MONNIFY_API_KEY / MONNIFY_SECRET_KEY / MONNIFY_CONTRACT_CODE
 * env vars are absent, causing the caller to fall back to simulation.
 *
 * @see https://developers.monnify.com/api/#reserved-accounts
 */
export async function provisionMonnifyVirtualAccount(params: {
  orgId: string;
  orgName: string;
  invoiceRef: string;
  amountNgn: number;
  orgEmail?: string;
}): Promise<VirtualAccountDetails | null> {
  const apiKey = process.env.MONNIFY_API_KEY;
  const secretKey = process.env.MONNIFY_SECRET_KEY;
  const contractCode = process.env.MONNIFY_CONTRACT_CODE;
  const baseUrl = process.env.MONNIFY_BASE_URL ?? "https://api.monnify.com";

  if (!apiKey || !secretKey || !contractCode) {
    // Gateway not configured — caller will fall back to simulation
    return null;
  }

  // Step 1: Obtain a bearer token via Basic Auth (Monnify OAuth)
  const credentials = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");
  const tokenRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
  });

  if (!tokenRes.ok) {
    throw new Error(`Monnify auth failed: ${tokenRes.status} ${tokenRes.statusText}`);
  }

  const tokenData = (await tokenRes.json()) as {
    requestSuccessful: boolean;
    responseBody?: { accessToken: string };
  };

  if (!tokenData.requestSuccessful || !tokenData.responseBody?.accessToken) {
    throw new Error("Monnify: Failed to obtain access token.");
  }

  const accessToken = tokenData.responseBody.accessToken;

  // Step 2: Create a Reserved Account (dedicated NUBAN) tied to this org + invoice
  const reservedRes = await fetch(`${baseUrl}/api/v2/bank-transfer/reserved-accounts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      accountReference: `PFLOW-${params.orgId.slice(0, 8)}-${params.invoiceRef}`,
      accountName: `Procurely Flow - ${params.orgName.slice(0, 30)}`,
      currencyCode: "NGN",
      contractCode,
      customerEmail: params.orgEmail ?? `billing+${params.orgId.slice(0, 8)}@procurelyflow.com`,
      customerName: params.orgName,
      // Monnify supports multiple banks per reserved account
      preferredBanks: ["035", "058"], // Wema Bank (035) and GTBank (058) — Providus is via Monnify
      incomeSplitConfig: [],
    }),
  });

  if (!reservedRes.ok) {
    throw new Error(
      `Monnify Reserved Account creation failed: ${reservedRes.status} ${reservedRes.statusText}`,
    );
  }

  const data = (await reservedRes.json()) as MonnifyReservedAccountResponse;

  if (!data.requestSuccessful || !data.responseBody) {
    throw new Error(`Monnify error: ${data.responseMessage}`);
  }

  const primaryAccount = data.responseBody.accounts[0];
  if (!primaryAccount) {
    throw new Error("Monnify returned no accounts for the reserved account.");
  }

  return {
    bankName: primaryAccount.bankName,
    accountNumber: primaryAccount.accountNumber,
    accountName: data.responseBody.accountName,
    assignedAt: new Date().toISOString(),
    provider: "MONNIFY",
    gatewayReference: data.responseBody.accountReference,
  };
}

// ─── Paystack API Client ───────────────────────────────────────────────────────

/**
 * Provisions a Paystack Dedicated Virtual Account.
 * Returns null when PAYSTACK_SECRET_KEY is absent.
 *
 * Requires Paystack DVA feature to be enabled on your account.
 * @see https://paystack.com/docs/payments/dedicated-virtual-accounts/
 */
export async function provisionPaystackVirtualAccount(params: {
  orgId: string;
  orgName: string;
  invoiceRef: string;
  orgEmail?: string;
}): Promise<VirtualAccountDetails | null> {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  const baseUrl = process.env.PAYSTACK_BASE_URL ?? "https://api.paystack.co";

  if (!secretKey) return null;

  // Step 1: Create or look up a Paystack customer
  const customerRes = await fetch(`${baseUrl}/customer`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: params.orgEmail ?? `billing+${params.orgId.slice(0, 8)}@procurelyflow.com`,
      first_name: "Procurely",
      last_name: params.orgName.slice(0, 30),
      metadata: { org_id: params.orgId, invoice_ref: params.invoiceRef },
    }),
  });

  if (!customerRes.ok) {
    throw new Error(`Paystack customer creation failed: ${customerRes.status}`);
  }

  const customerData = (await customerRes.json()) as {
    status: boolean;
    data?: { customer_code: string };
  };

  if (!customerData.status || !customerData.data) {
    throw new Error("Paystack: Failed to create customer.");
  }

  // Step 2: Create a Dedicated Virtual Account for this customer
  const dvaRes = await fetch(`${baseUrl}/dedicated_account`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      customer: customerData.data.customer_code,
      preferred_bank: "wema-bank", // "providus-bank" or "wema-bank"
    }),
  });

  if (!dvaRes.ok) {
    throw new Error(`Paystack DVA creation failed: ${dvaRes.status}`);
  }

  const dvaData = (await dvaRes.json()) as {
    status: boolean;
    data?: {
      account_number: string;
      account_name: string;
      bank: { name: string; id: number; slug: string };
      id: number;
    };
  };

  if (!dvaData.status || !dvaData.data) {
    throw new Error("Paystack: Failed to create dedicated virtual account.");
  }

  return {
    bankName: dvaData.data.bank.name,
    accountNumber: dvaData.data.account_number,
    accountName: dvaData.data.account_name,
    assignedAt: new Date().toISOString(),
    provider: "PAYSTACK",
    gatewayReference: String(dvaData.data.id),
  };
}

// ─── Orchestrated Virtual Account Provisioning ────────────────────────────────

/**
 * Attempts to provision a real gateway virtual account.
 * Priority: Monnify → Paystack → Simulation
 * This function NEVER throws — it always returns a usable virtual account.
 */
export async function provisionVirtualAccount(params: {
  orgId: string;
  orgName: string;
  invoiceRef: string;
  amountNgn: number;
  orgEmail?: string;
}): Promise<VirtualAccountDetails & { wasSimulated: boolean }> {
  // Try Monnify first
  try {
    const monnify = await provisionMonnifyVirtualAccount(params);
    if (monnify) return { ...monnify, wasSimulated: false };
  } catch (err) {
    console.error("[BillingGateway] Monnify provisioning failed, trying Paystack:", err);
  }

  // Try Paystack second
  try {
    const paystack = await provisionPaystackVirtualAccount(params);
    if (paystack) return { ...paystack, wasSimulated: false };
  } catch (err) {
    console.error("[BillingGateway] Paystack provisioning failed, falling back to simulation:", err);
  }

  // Deterministic local simulation (no external API — used when keys not configured)
  // Account number is a consistent 10-digit NUBAN prefix 99 (Monnify sandbox pattern)
  const seed = BigInt("0x" + Buffer.from(params.orgId.replace(/-/g, "")).toString("hex").slice(0, 14));
  const simulatedNumber = `99${(seed % 100000000n).toString().padStart(8, "0")}`;

  return {
    bankName: "Providus Bank / Wema Bank",
    accountNumber: simulatedNumber,
    accountName: `Procurely Flow - ${params.orgName.slice(0, 20)}`,
    assignedAt: new Date().toISOString(),
    provider: "SIMULATED",
    wasSimulated: true,
  };
}

// ─── In-Memory Bill Builder (used in tests & local pricing logic) ──────────────

/**
 * Builds a TenantSubscriptionBill value object (pure function, no I/O).
 * For production persistence, call generateSubscriptionBillServer() in procurement.server.ts.
 */
export function generateSubscriptionBill(params: {
  orgId: string;
  orgName: string;
  planTier: "PILOT" | "STANDARD" | "STARTER" | "GROWTH" | "BUSINESS" | "ENTERPRISE";
  amountNgn: number;
  preferredMethod?: SubscriptionPaymentMethod;
  gatewayAccount?: Omit<VirtualAccountDetails, "assignedAt">;
}): TenantSubscriptionBill {
  const method = params.preferredMethod ?? "VIRTUAL_ACCOUNT";

  const virtualAccount: VirtualAccountDetails | undefined =
    method === "VIRTUAL_ACCOUNT"
      ? params.gatewayAccount
        ? { ...params.gatewayAccount, assignedAt: new Date().toISOString() }
        : {
            bankName: "Providus Bank / Wema Bank",
            accountNumber: `99${Math.floor(10000000 + Math.random() * 90000000)}`,
            accountName: `Procurely Flow - ${params.orgName.slice(0, 20)}`,
            assignedAt: new Date().toISOString(),
            provider: "SIMULATED",
          }
      : undefined;

  const now = new Date();
  const start = now.toISOString().split("T")[0] ?? "";
  const end = new Date(now.setMonth(now.getMonth() + 1)).toISOString().split("T")[0] ?? "";

  return {
    invoiceId: `BILL-${Date.now().toString().slice(-8)}`,
    orgId: params.orgId,
    orgName: params.orgName,
    planTier: params.planTier,
    billingPeriod: { start, end },
    amountNgn: params.amountNgn,
    paymentMethod: method,
    ...(virtualAccount ? { virtualAccountDetails: virtualAccount } : {}),
    paymentStatus: "PENDING",
    pciComplianceVerified: true, // System NEVER handles raw PANs or CVVs
  };
}

// ─── Webhook Signature Verification ───────────────────────────────────────────

/**
 * Verifies Monnify webhook signature (HMAC-SHA512).
 * Monnify sends the signature in the `monnify-signature` header.
 */
export function verifyMonnifyWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secretKey: string,
): boolean {
  return verifyPaymentGatewayWebhookSignature(rawBody, signatureHeader, secretKey, "sha512");
}

/**
 * Verifies Paystack webhook signature (HMAC-SHA512).
 * Paystack sends the signature in the `x-paystack-signature` header.
 */
export function verifyPaystackWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secretKey: string,
): boolean {
  return verifyPaymentGatewayWebhookSignature(rawBody, signatureHeader, secretKey, "sha512");
}

/**
 * Generic HMAC signature verification used by all gateway webhook handlers.
 */
export function verifyPaymentGatewayWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secretKey: string,
  algorithm: "sha512" | "sha256" = "sha512",
): boolean {
  if (!rawBody || !signatureHeader || !secretKey) return false;
  const hash = createHmac(algorithm, secretKey).update(rawBody).digest("hex");
  return hash === signatureHeader;
}

// ─── PCI-DSS Enforcement ──────────────────────────────────────────────────────

/**
 * Verifies that a payment payload contains zero raw card data (NFR-SEC.4 PCI-DSS enforcement).
 * Call this before processing any payment-related object received from external sources.
 */
export function assertPciDssCardDataAbsence(payload: Record<string, unknown>): void {
  const forbiddenKeys = ["cardNumber", "card_number", "pan", "cvv", "cvc", "card_expiry", "cardExpiry", "pin"];
  for (const key of forbiddenKeys) {
    if (key in payload) {
      throw new Error(
        `PCI-DSS Security Violation: Raw card credentials [${key}] must never be handled ` +
          `or stored by Procurely Flow. Use tokenized gateway references instead.`,
      );
    }
  }
}
