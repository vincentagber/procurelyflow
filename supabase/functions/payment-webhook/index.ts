/**
 * Supabase Edge Function: payment-webhook
 *
 * Receives inbound payment settlement notifications from Monnify and Paystack.
 * Validates the HMAC-SHA512 webhook signature, identifies the tenant subscription
 * by gateway reference, and calls the `settle_subscription_by_gateway_ref` Postgres RPC
 * to mark the invoice as SETTLED — which triggers a Supabase Realtime push to all
 * subscribed clients showing the live status change.
 *
 * Deployment:
 *   supabase functions deploy payment-webhook --no-verify-jwt
 *
 * Configure webhook URLs in your gateway dashboard:
 *   Monnify:  https://<project>.supabase.co/functions/v1/payment-webhook?gateway=monnify
 *   Paystack: https://<project>.supabase.co/functions/v1/payment-webhook?gateway=paystack
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { createHmac } from "node:crypto";

// ─── Constants ─────────────────────────────────────────────────────────────────

const ALLOWED_GATEWAYS = ["monnify", "paystack"] as const;
type GatewaySlug = (typeof ALLOWED_GATEWAYS)[number];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function hmacSha512(body: string, secret: string): string {
  return createHmac("sha512", secret).update(body).digest("hex");
}

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  if (!rawBody || !signature || !secret) return false;
  const expected = hmacSha512(rawBody, secret);
  // Constant-time comparison to prevent timing attacks
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Extracts the gateway reference (reserved account / DVA reference) from
 * the Monnify or Paystack webhook payload.
 */
function extractGatewayReference(payload: Record<string, unknown>, gateway: GatewaySlug): string | null {
  if (gateway === "monnify") {
    // Monnify SUCCESSFUL_TRANSACTION event
    const body = payload as {
      eventData?: { product?: { reference?: string } };
    };
    return body.eventData?.product?.reference ?? null;
  }

  if (gateway === "paystack") {
    // Paystack charge.success event for dedicated virtual accounts
    const body = payload as {
      data?: { authorization?: { receiver_bank_account_number?: string; dedicated_account?: { id?: number | string } } };
    };
    const dvaId = body.data?.authorization?.dedicated_account?.id;
    return dvaId ? String(dvaId) : null;
  }

  return null;
}

/**
 * Returns true only when the webhook event type indicates a successful settlement.
 */
function isSettlementEvent(payload: Record<string, unknown>, gateway: GatewaySlug): boolean {
  if (gateway === "monnify") {
    return (payload as { eventType?: string }).eventType === "SUCCESSFUL_TRANSACTION";
  }
  if (gateway === "paystack") {
    return (payload as { event?: string }).event === "charge.success";
  }
  return false;
}

// ─── Edge Function Handler ─────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Identify which gateway is sending this webhook
  const url = new URL(req.url);
  const gatewayParam = url.searchParams.get("gateway")?.toLowerCase();

  if (!gatewayParam || !ALLOWED_GATEWAYS.includes(gatewayParam as GatewaySlug)) {
    return new Response(
      JSON.stringify({ error: "Missing or unsupported ?gateway= parameter. Use 'monnify' or 'paystack'." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const gateway = gatewayParam as GatewaySlug;

  // Read raw body (needed for HMAC verification)
  const rawBody = await req.text();

  // ─── Signature Verification ───────────────────────────────────────────────
  let signatureValid = false;

  if (gateway === "monnify") {
    const monnifySecret = Deno.env.get("MONNIFY_SECRET_KEY") ?? "";
    const signature = req.headers.get("monnify-signature") ?? "";
    signatureValid = monnifySecret ? verifySignature(rawBody, signature, monnifySecret) : false;

    if (!monnifySecret) {
      // If secret not set, log a warning and proceed (dev/staging only)
      console.warn("[payment-webhook] MONNIFY_SECRET_KEY not set — skipping signature check (dev mode)");
      signatureValid = true;
    }
  } else if (gateway === "paystack") {
    const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";
    const signature = req.headers.get("x-paystack-signature") ?? "";
    signatureValid = paystackSecret ? verifySignature(rawBody, signature, paystackSecret) : false;

    if (!paystackSecret) {
      console.warn("[payment-webhook] PAYSTACK_SECRET_KEY not set — skipping signature check (dev mode)");
      signatureValid = true;
    }
  }

  if (!signatureValid) {
    console.error(`[payment-webhook] Invalid ${gateway} webhook signature — rejecting.`);
    return new Response(JSON.stringify({ error: "Invalid webhook signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ─── Parse and Process Payload ────────────────────────────────────────────
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Only process settlement events — ignore refunds, reversals etc.
  if (!isSettlementEvent(payload, gateway)) {
    console.log(`[payment-webhook] Non-settlement event from ${gateway} — acknowledged but not processed.`);
    return new Response(JSON.stringify({ ok: true, action: "ignored" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const gatewayReference = extractGatewayReference(payload, gateway);
  if (!gatewayReference) {
    console.error(`[payment-webhook] Could not extract gateway reference from ${gateway} payload.`);
    return new Response(JSON.stringify({ error: "Could not identify gateway reference in payload" }), {
      status: 422,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ─── Update Subscription Status via Postgres RPC ──────────────────────────
  // Use the service role client so this bypasses RLS (webhook is server-to-server)
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const { data: settled, error } = await supabase.rpc("settle_subscription_by_gateway_ref", {
    p_gateway_reference: gatewayReference,
    p_gateway: gateway.toUpperCase(),
  });

  if (error) {
    // If no matching record found, return 200 to prevent gateway retries for unrelated transactions
    if (error.message.includes("No pending subscription found")) {
      console.warn(`[payment-webhook] No pending subscription for gateway ref: ${gatewayReference}`);
      return new Response(JSON.stringify({ ok: true, action: "no_match" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.error("[payment-webhook] RPC error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(
    `[payment-webhook] Subscription ${(settled as { invoice_reference?: string })?.invoice_reference} SETTLED via ${gateway.toUpperCase()}.`,
  );

  // Return 200 — Supabase Realtime will push the UPDATE to all subscribed clients automatically
  return new Response(
    JSON.stringify({
      ok: true,
      action: "settled",
      invoiceReference: (settled as { invoice_reference?: string })?.invoice_reference,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
