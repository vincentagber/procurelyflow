import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { whatsappApprovalWebhook } from "@/lib/procurement.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Inbound WhatsApp Business API Webhook Handler (§FR-2.4)
 * Supports Meta WhatsApp Cloud API and authenticated internal simulation.
 * Enforces fail-closed cryptographic HMAC-SHA256 verification, phone authorization,
 * and webhook event deduplication.
 */
export const Route = createFileRoute("/api/webhooks/whatsapp")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");

        // Standard Meta WhatsApp Webhook Handshake
        const expectedToken =
          process.env["WHATSAPP_VERIFY_TOKEN"] ||
          (process.env["NODE_ENV"] !== "production" ? "procurely_whatsapp_token" : "");

        if (mode === "subscribe" && expectedToken && token === expectedToken) {
          return new Response(challenge || "", { status: 200 });
        }

        return Response.json({ status: "Procurely Flow WhatsApp Webhook Active" }, { status: 200 });
      },
      POST: async ({ request }: { request: Request }) => {
        try {
          const rawBody = await request.text();
          const isProduction = process.env["NODE_ENV"] === "production";
          const appSecret = process.env["WHATSAPP_APP_SECRET"];
          const signatureHeader = request.headers.get("x-hub-signature-256") || "";

          // FAIL-CLOSED: Production requests MUST have WHATSAPP_APP_SECRET and valid signature
          if (isProduction) {
            if (!appSecret) {
              console.error("Critical: WHATSAPP_APP_SECRET is not configured in production");
              return Response.json(
                { error: "WhatsApp webhook verification unconfigured" },
                { status: 500 },
              );
            }

            if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
              return Response.json(
                { error: "Missing or malformed x-hub-signature-256 header" },
                { status: 401 },
              );
            }

            const expectedSignature = createHmac("sha256", appSecret).update(rawBody).digest("hex");
            const providedSignature = signatureHeader.slice(7);

            const expectedBuf = Buffer.from(expectedSignature, "hex");
            const providedBuf = Buffer.from(providedSignature, "hex");

            if (
              expectedBuf.length !== providedBuf.length ||
              !timingSafeEqual(expectedBuf, providedBuf)
            ) {
              return Response.json(
                { error: "Invalid webhook cryptographic signature" },
                { status: 401 },
              );
            }
          } else if (appSecret || signatureHeader) {
            // In dev/test: if secret or signature is supplied, enforce valid signature
            if (!appSecret || !signatureHeader.startsWith("sha256=")) {
              return Response.json(
                { error: "Missing or malformed x-hub-signature-256 header" },
                { status: 401 },
              );
            }

            const expectedSignature = createHmac("sha256", appSecret).update(rawBody).digest("hex");
            const providedSignature = signatureHeader.slice(7);
            const expectedBuf = Buffer.from(expectedSignature, "hex");
            const providedBuf = Buffer.from(providedSignature, "hex");

            if (
              expectedBuf.length !== providedBuf.length ||
              !timingSafeEqual(expectedBuf, providedBuf)
            ) {
              return Response.json(
                { error: "Invalid webhook cryptographic signature" },
                { status: 401 },
              );
            }
          }

          const body = JSON.parse(rawBody || "{}");

          // 1. Direct Procurely simulation payload (disallowed in production without internal secret key)
          if (body.stepId && (body.decision === "approved" || body.decision === "rejected")) {
            const internalKey = request.headers.get("x-procurely-internal-key");
            const expectedInternalKey = process.env["INTERNAL_API_KEY"];

            if (isProduction && (!expectedInternalKey || internalKey !== expectedInternalKey)) {
              return Response.json(
                { error: "Direct simulation payload is prohibited in production" },
                { status: 403 },
              );
            }

            const result = await whatsappApprovalWebhook({
              fromPhone: body.fromPhone || "",
              stepId: body.stepId,
              decision: body.decision,
              comment: body.comment || "via WhatsApp 1-Click Action",
            });
            return Response.json({ ok: true, result });
          }

          // 2. Meta WhatsApp Cloud API Webhook payload
          if (body.entry && body.entry[0]?.changes && body.entry[0].changes[0]?.value?.messages) {
            const message = body.entry[0].changes[0].value.messages[0];
            const messageId = String(message.id || "");
            const fromPhone = String(message.from || "");
            const text = (
              message.text?.body ||
              message.button?.text ||
              message.interactive?.button_reply?.id ||
              ""
            ).trim();

            // Webhook Idempotency: prevent replay attacks and duplicate approvals
            if (messageId) {
              const { data: existingEvent } = await supabaseAdmin
                .from("processed_webhook_events")
                .select("id")
                .eq("id", messageId)
                .maybeSingle();

              if (existingEvent) {
                return Response.json({
                  ok: true,
                  status: "ALREADY_PROCESSED",
                  messageId,
                });
              }

              // Record message event
              await supabaseAdmin.from("processed_webhook_events").insert({
                event_id: messageId,
                provider: "whatsapp",
                event_type: "meta_message",
              });
            }

            const upper = text.toUpperCase();
            const isApprove = upper.includes("APPROVE") || upper.includes("YES");
            const isReject =
              upper.includes("REJECT") || upper.includes("DECLINE") || upper.includes("NO");

            // Extract step ID if attached to interactive reply or text (e.g. "APPROVE step_<uuid>")
            const stepIdMatch = text.match(
              /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
            );
            const stepId = stepIdMatch ? stepIdMatch[0] : null;

            if (stepId && (isApprove || isReject)) {
              const result = await whatsappApprovalWebhook({
                fromPhone,
                stepId,
                decision: isApprove ? "approved" : "rejected",
                comment: "via WhatsApp Cloud Interactive Reply",
              });
              return Response.json({ ok: true, result });
            }

            return Response.json({
              ok: true,
              status: "RECEIVED",
              from: fromPhone,
              decision: isApprove ? "approved" : isReject ? "rejected" : "unrecognized",
            });
          }

          return Response.json({ ok: true, message: "Webhook acknowledged" });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "WhatsApp webhook processing failed";
          return Response.json({ ok: false, error: message }, { status: 400 });
        }
      },
    },
  },
});
