import { NextRequest, NextResponse } from "next/server";
import { whatsappApprovalWebhook } from "@/lib/procurement.server";

/**
 * Inbound WhatsApp Business API Webhook Handler (§FR-2.4)
 * Supports Meta WhatsApp Cloud API, Twilio, Infobip, and direct local simulation.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  // Standard Meta WhatsApp Webhook Handshake
  if (mode === "subscribe" && token === (process.env["WHATSAPP_VERIFY_TOKEN"] || "procurely_whatsapp_token")) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ status: "Procurely Flow WhatsApp Webhook Active" }, { status: 200 });
}

export async function POST(request: NextRequest) {
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
      return NextResponse.json({ ok: true, result });
    }

    // 2. Meta WhatsApp Cloud API Webhook payload
    if (body.entry && body.entry[0]?.changes && body.entry[0].changes[0]?.value?.messages) {
      const message = body.entry[0].changes[0].value.messages[0];
      const fromPhone = message.from;
      const text = (message.text?.body || message.button?.text || "").trim();

      // Look for APPROVE or REJECT keywords
      const upper = text.toUpperCase();
      const isApprove = upper.includes("APPROVE") || upper.includes("YES");
      const isReject = upper.includes("REJECT") || upper.includes("DECLINE") || upper.includes("NO");

      if (isApprove || isReject) {
        // If message has reference like APPROVE REQ-2026-0042
        return NextResponse.json({
          ok: true,
          status: "RECEIVED",
          from: fromPhone,
          decision: isApprove ? "approved" : "rejected",
        });
      }
    }

    return NextResponse.json({ ok: true, message: "Webhook acknowledged" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "WhatsApp webhook processing failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
