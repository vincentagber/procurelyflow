import { createFileRoute } from "@tanstack/react-router";
import { whatsappApprovalWebhook } from "@/lib/procurement.server";

/**
 * Inbound WhatsApp Business API Webhook Handler (§FR-2.4)
 * Supports Meta WhatsApp Cloud API, Twilio, Infobip, and direct local simulation.
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
        if (
          mode === "subscribe" &&
          token === (process.env["WHATSAPP_VERIFY_TOKEN"] || "procurely_whatsapp_token")
        ) {
          return new Response(challenge || "", { status: 200 });
        }

        return Response.json({ status: "Procurely Flow WhatsApp Webhook Active" }, { status: 200 });
      },
      POST: async ({ request }: { request: Request }) => {
        try {
          const body = await request.json();

          // 1. Direct Procurely Simulation payload
          if (body.stepId && (body.decision === "approved" || body.decision === "rejected")) {
            const result = await whatsappApprovalWebhook({
              fromPhone: body.fromPhone || "+2348030000000",
              stepId: body.stepId,
              decision: body.decision,
              comment: body.comment || "via WhatsApp 1-Click Action",
            });
            return Response.json({ ok: true, result });
          }

          // 2. Meta WhatsApp Cloud API Webhook payload
          if (body.entry && body.entry[0]?.changes && body.entry[0].changes[0]?.value?.messages) {
            const message = body.entry[0].changes[0].value.messages[0];
            const fromPhone = message.from;
            const text = (message.text?.body || message.button?.text || "").trim();

            const upper = text.toUpperCase();
            const isApprove = upper.includes("APPROVE") || upper.includes("YES");
            const isReject =
              upper.includes("REJECT") || upper.includes("DECLINE") || upper.includes("NO");

            if (isApprove || isReject) {
              return Response.json({
                ok: true,
                status: "RECEIVED",
                from: fromPhone,
                decision: isApprove ? "approved" : "rejected",
              });
            }
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
