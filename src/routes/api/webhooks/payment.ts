import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import {
  verifyPaymentGatewayWebhookSignature,
  assertPciDssCardDataAbsence,
} from "@/lib/paymentBillingChannels";

/**
 * Enterprise Payment Gateway Webhook Endpoint (NFR-LOC.2, NFR-SEC.4)
 * Receives inbound bank transfer settlement events from Providus, Wema, Monnify, and Paystack.
 * Validates HMAC-SHA512 webhook signature, checks payment amount & currency,
 * verifies payment reference uniqueness, and prevents replay attacks.
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

          // In production, signature checks must fail closed
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

          // Extract unique transaction / gateway event ID for idempotency
          const settlementRef = String(
            payload.data?.id ||
              payload.eventData?.transactionReference ||
              payload.transactionReference ||
              payload.reference ||
              `NIP-WH-${Date.now()}`,
          );

          // Webhook Idempotency Check
          const { data: alreadyProcessed } = await supabaseAdmin
            .from("processed_webhook_events")
            .select("id")
            .eq("id", settlementRef)
            .maybeSingle();

          if (alreadyProcessed) {
            return Response.json({
              success: true,
              message: "Webhook event already processed",
              settlementRef,
            });
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

          // If already settled, record event and return idempotent success
          if (sub.status === "SETTLED") {
            await supabaseAdmin.from("processed_webhook_events").insert({
              event_id: settlementRef,
              provider: (payload.provider as string) || "payment_gateway",
              event_type: "duplicate_settled_notification",
            });

            return Response.json({
              success: true,
              message: `Subscription invoice ${sub.invoice_reference} is already settled.`,
              settlementRef,
            });
          }

          // Verify Paid Amount and Currency
          // Paystack amounts are in kobo; Monnify/Providus/standard are in Naira
          let paidAmountNgn: number | null = null;
          if (payload.data?.amount && payload.data?.currency === "NGN") {
            paidAmountNgn = Number(payload.data.amount) / 100;
          } else if (payload.eventData?.amountPaid != null) {
            paidAmountNgn = Number(payload.eventData.amountPaid);
          } else if (payload.amount != null) {
            paidAmountNgn = Number(payload.amount);
          }

          const expectedAmount = Number(sub.amount_ngn);
          if (paidAmountNgn != null && paidAmountNgn < expectedAmount - 0.01) {
            return Response.json(
              {
                error: `Payment amount underpaid: expected NGN ${expectedAmount}, received NGN ${paidAmountNgn}`,
              },
              { status: 400 },
            );
          }

          // Verify currency if provided
          const payloadCurrency = payload.data?.currency || payload.currency || "NGN";
          if (payloadCurrency.toUpperCase() !== "NGN") {
            return Response.json(
              { error: `Invalid currency: expected NGN, received ${payloadCurrency}` },
              { status: 400 },
            );
          }

          // Verify payment reference has not been consumed by another subscription
          const { data: existingConsumed } = await supabaseAdmin
            .from("tenant_subscriptions")
            .select("id, invoice_reference")
            .eq("payment_gateway_reference", settlementRef)
            .neq("id", sub.id)
            .maybeSingle();

          if (existingConsumed) {
            return Response.json(
              {
                error: `Payment reference ${settlementRef} was already consumed by subscription ${existingConsumed.invoice_reference}`,
              },
              { status: 400 },
            );
          }

          const now = new Date().toISOString();
          const providerName = (
            payload.provider ||
            (payload.data?.channel ? `PAYSTACK_${payload.data.channel}` : "GATEWAY_WEBHOOK")
          ).toUpperCase();

          // Settle subscription atomically
          const { error: updateSubErr } = await supabaseAdmin
            .from("tenant_subscriptions")
            .update({
              status: "SETTLED",
              cleared_at: now,
              settled_at: now,
              payment_gateway: providerName.includes("PAYSTACK")
                ? "PAYSTACK"
                : providerName.includes("MONNIFY")
                  ? "MONNIFY"
                  : "SIMULATED",
              payment_gateway_reference: settlementRef,
              payment_method: "BANK_TRANSFER",
              settlement_source: "GATEWAY_WEBHOOK",
            })
            .eq("id", sub.id);

          if (updateSubErr) {
            throw new Error(`Failed to update subscription settlement: ${updateSubErr.message}`);
          }

          // Update organization active plan
          const planTier = (
            sub.plan_tier?.toLowerCase() === "enterprise"
              ? "enterprise"
              : sub.plan_tier?.toLowerCase() === "scale"
                ? "scale"
                : sub.plan_tier?.toLowerCase() === "business"
                  ? "business"
                  : sub.plan_tier?.toLowerCase() === "starter"
                    ? "starter"
                    : "growth"
          ) as Database["public"]["Enums"]["subscription_plan"];

          await supabaseAdmin
            .from("organizations")
            .update({
              plan: planTier,
            })
            .eq("id", sub.org_id);

          // Record processed webhook event for idempotency
          await supabaseAdmin.from("processed_webhook_events").insert({
            event_id: settlementRef,
            provider: providerName,
            event_type: "subscription_settlement",
          });

          // Record audit log
          await supabaseAdmin.from("approval_audit_log").insert({
            org_id: sub.org_id,
            action: "subscription_payment_settled",
            event_type: "SUBSCRIPTION_PAYMENT_SETTLED",
            entity_type: "tenant_subscription",
            entity_id: sub.id,
            amount: sub.amount_ngn,
            currency: "NGN",
            detail: `Subscription payment settled via ${providerName} webhook for invoice ${sub.invoice_reference}. Ref: ${settlementRef}`,
          });

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
