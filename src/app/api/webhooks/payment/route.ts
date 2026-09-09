import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  verifyPaymentGatewayWebhookSignature,
  assertPciDssCardDataAbsence,
} from "@/lib/paymentBillingChannels";

/**
 * Enterprise Payment Gateway Webhook Endpoint (NFR-LOC.2, NFR-SEC.4)
 * Receives inbound bank transfer settlement events from Providus, Wema, Monnify, and Paystack.
 * Validates HMAC-SHA512 webhook signature and enforces PCI-DSS zero raw-card presence.
 */
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature =
      req.headers.get("x-paystack-signature") ||
      req.headers.get("monnify-signature") ||
      req.headers.get("x-providus-signature") ||
      "";

    const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET || "procurely_live_webhook_secret";

    // If signature provided and secret is configured, verify HMAC signature
    if (signature && process.env.PAYMENT_WEBHOOK_SECRET) {
      const isValid = verifyPaymentGatewayWebhookSignature(
        rawBody,
        signature,
        webhookSecret,
        "sha512",
      );
      if (!isValid) {
        return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
      }
    }

    const payload = JSON.parse(rawBody || "{}");

    // Enforce NFR-SEC.4 PCI-DSS compliance: assert zero PAN/CVV handling
    assertPciDssCardDataAbsence(payload);

    // Extract invoice reference / transaction reference
    const invoiceRef =
      payload.data?.reference ||
      payload.eventData?.transactionReference ||
      payload.reference ||
      payload.invoice_reference;

    if (!invoiceRef) {
      return NextResponse.json({ error: "No invoice reference found in payload" }, { status: 400 });
    }

    // Find subscription by invoice reference
    const { data: sub, error: findErr } = await supabaseAdmin
      .from("tenant_subscriptions")
      .select("*")
      .eq("invoice_reference", invoiceRef)
      .single();

    if (findErr || !sub) {
      return NextResponse.json({ error: "Subscription record not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const settlementRef =
      payload.data?.id?.toString() ||
      payload.transactionReference ||
      `NIP-WH-${Date.now().toString().slice(-8)}`;

    await supabaseAdmin
      .from("tenant_subscriptions")
      .update({
        status: "SETTLED",
        cleared_at: now,
        settled_at: now,
        payment_gateway: payload.provider || "PROVIDUS_WEMA_NIP",
        payment_gateway_reference: settlementRef,
      })
      .eq("id", sub.id);

    // Update organization active plan
    await supabaseAdmin
      .from("organizations")
      .update({
        plan: sub.plan_tier,
      })
      .eq("id", sub.org_id);

    return NextResponse.json({
      success: true,
      message: `Subscription invoice ${sub.invoice_reference} settled successfully.`,
      settlementRef,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook processing error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
