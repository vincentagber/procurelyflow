import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  verifyPaymentGatewayWebhookSignature,
  assertPciDssCardDataAbsence,
} from "@/lib/paymentBillingChannels";

/**
 * Enterprise Payment Gateway Webhook Endpoint (NFR-LOC.2, NFR-SEC.4)
 * Receives inbound bank transfer settlement events from Providus, Wema, Monnify, and Paystack.
 * Validates HMAC-SHA512 webhook signature and enforces PCI-DSS zero raw-card presence.
 */
export const Route = createFileRoute("/api/webhooks/payment")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const rawBody = await request.text();
          const signature =
            request.headers.get("x-paystack-signature") ||
            request.headers.get("monnify-signature") ||
            request.headers.get("x-providus-signature") ||
            "";

          const webhookSecret = process.env["PAYMENT_WEBHOOK_SECRET"];

          // In production, signature checks must fail closed (Issue 1.1 & 1.5)
          if (!webhookSecret) {
            console.error("Missing PAYMENT_WEBHOOK_SECRET environment variable.");
            return Response.json(
              { error: "Webhook signature secret unconfigured on server" },
              { status: 401 },
            );
          }

          if (!signature) {
            return Response.json({ error: "Missing webhook signature header" }, { status: 401 });
          }

          const isValid = verifyPaymentGatewayWebhookSignature(
            rawBody,
            signature,
            webhookSecret,
            "sha512",
          );
          if (!isValid) {
            return Response.json({ error: "Invalid webhook signature" }, { status: 401 });
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
            return Response.json(
              { error: "No invoice reference found in payload" },
              { status: 400 },
            );
          }

          // Find subscription by invoice reference
          const { data: sub, error: findErr } = await supabaseAdmin
            .from("tenant_subscriptions")
            .select("*")
            .eq("invoice_reference", invoiceRef)
            .maybeSingle();

          if (findErr || !sub) {
            return Response.json({ error: "Subscription record not found" }, { status: 404 });
          }

          const now = new Date().toISOString();
          const settlementRef =
            payload.data?.id?.toString() ||
            payload.transactionReference ||
            `NIP-WH-${Date.now().toString().slice(-8)}`;

          await (supabaseAdmin.from("tenant_subscriptions") as any)
            .update({
              status: "SETTLED",
              cleared_at: now,
              payment_method: payload.provider || "PROVIDUS_WEMA_NIP",
            })
            .eq("id", sub.id);

          // Update organization active plan
          await (supabaseAdmin.from("organizations") as any)
            .update({
              plan: (sub.plan_tier.toLowerCase() || "growth") as any,
            })
            .eq("id", sub.org_id);

          return Response.json({
            success: true,
            message: `Subscription invoice ${sub.invoice_reference} settled successfully.`,
            settlementRef,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Webhook processing error";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
