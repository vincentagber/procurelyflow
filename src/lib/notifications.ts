/**
 * Outbound Transactional Notification Engine (Email & WhatsApp)
 *
 * Implements multi-channel notification dispatchers with:
 * 1. Resend / Transactional HTTP Email Driver
 * 2. Termii / WhatsApp Direct 1-Click Action Messaging
 * 3. Safe Development Console Mode Fallback
 */

export interface NotificationDispatchResult {
  success: boolean;
  channel: "EMAIL" | "WHATSAPP" | "SMS" | "CONSOLE";
  messageId?: string;
  recipient: string;
  error?: string;
}

export interface ApprovalNotificationParams {
  recipientEmail: string;
  recipientName: string;
  recipientPhone?: string | null;
  approverRole: string;
  requisitionTitle: string;
  requisitionNumber: string;
  totalAmountNgn: number;
  requesterName: string;
  actionToken: string;
  baseUrl?: string;
}

export interface PoNotificationParams {
  recipientEmail: string;
  recipientPhone?: string | null;
  supplierName: string;
  poNumber: string;
  totalAmount: number;
  currency: string;
  actionToken: string;
  baseUrl?: string;
}

/**
 * Dispatches an outbound SMS or WhatsApp message via Termii API
 */
export async function dispatchTermiiMessage(input: {
  to: string;
  message: string;
  channel?: "whatsapp" | "generic" | "dnd";
}): Promise<NotificationDispatchResult> {
  const termiiApiKey = process.env["TERMII_API_KEY"];
  const whatsappDriver = process.env["WHATSAPP_DRIVER"] || "console";
  const cleanPhone = input.to.replace(/[^0-9+]/g, "");

  if (whatsappDriver !== "console" && termiiApiKey) {
    try {
      const response = await fetch("https://api.ng.termii.com/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: cleanPhone,
          from: "Procurely",
          sms: input.message,
          type: "plain",
          channel: input.channel || "whatsapp",
          api_key: termiiApiKey,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Notification] Termii API Error:", errorText);
        return {
          success: false,
          channel: "WHATSAPP",
          recipient: cleanPhone,
          error: errorText,
        };
      }

      const resData = await response.json();
      return {
        success: true,
        channel: "WHATSAPP",
        messageId: resData.message_id || `termii_${Date.now()}`,
        recipient: cleanPhone,
      };
    } catch (err) {
      console.error("[Notification] Termii dispatch failed:", err);
      return {
        success: false,
        channel: "WHATSAPP",
        recipient: cleanPhone,
        error: String(err),
      };
    }
  }

  // Development Console Fallback
  console.log(`\n================== [NOTIFICATIONS DISPATCH: WHATSAPP / SMS] ==================`);
  console.log(`To: ${cleanPhone}`);
  console.log(`Channel: ${whatsappDriver.toUpperCase()}`);
  console.log(`Message:\n${input.message}`);
  console.log(`==============================================================================\n`);

  return {
    success: true,
    channel: "CONSOLE",
    recipient: cleanPhone,
    messageId: `mock_wa_${Date.now()}`,
  };
}

/**
 * Dispatches an automated approval request email & WhatsApp notification with 1-click token
 */
export async function dispatchApprovalNotification(
  params: ApprovalNotificationParams,
): Promise<NotificationDispatchResult> {
  const baseUrl = params.baseUrl || process.env["APP_BASE_URL"] || "http://localhost:3000";
  const approveUrl = `${baseUrl}/approve/${params.actionToken}?decision=approved`;
  const rejectUrl = `${baseUrl}/approve/${params.actionToken}?decision=rejected`;
  const viewUrl = `${baseUrl}/approve/${params.actionToken}`;

  const resendApiKey = process.env["RESEND_API_KEY"];
  const emailDriver = process.env["EMAIL_DRIVER"] || "console";
  const fromEmail = process.env["EMAIL_FROM"] || "Procurely Flow <notifications@procurely.app>";

  // Dispatch WhatsApp alert if phone number is provided
  if (params.recipientPhone) {
    const waText =
      `Procurely Flow: Spend Requisition ${params.requisitionNumber} needs your approval as ${params.approverRole}.\n\n` +
      `Title: ${params.requisitionTitle}\n` +
      `Amount: ₦${params.totalAmountNgn.toLocaleString("en-NG", { minimumFractionDigits: 2 })}\n` +
      `Requested by: ${params.requesterName}\n\n` +
      `Tap below to review & approve:\n${viewUrl}\n\n` +
      `Direct Approve: ${approveUrl}\n` +
      `Direct Reject: ${rejectUrl}`;

    // Dispatched asynchronously so email dispatch is not blocked
    dispatchTermiiMessage({
      to: params.recipientPhone,
      message: waText,
      channel: "whatsapp",
    }).catch((e) => console.error("[Notification] Outbound WhatsApp background error:", e));
  }

  // If Resend API Key is configured in production, send via Resend
  if (emailDriver !== "console" && resendApiKey && resendApiKey.startsWith("re_")) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: params.recipientEmail,
          subject: `Action Required: Approval Needed for Requisition ${params.requisitionNumber}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #E2E8F0; border-radius: 12px;">
              <h2 style="color: #0B1457; margin-bottom: 8px;">Requisition Approval Required</h2>
              <p style="color: #4B556D; font-size: 14px;">Hello ${params.recipientName}, a new spend requisition requires your approval clearance as <strong>${params.approverRole}</strong>.</p>
              
              <div style="background-color: #F8FAFC; padding: 16px; border-radius: 8px; margin: 20px 0; border: 1px solid #E2E8F0;">
                <p style="margin: 4px 0; font-size: 13px;"><strong>Requisition:</strong> ${params.requisitionTitle} (${params.requisitionNumber})</p>
                <p style="margin: 4px 0; font-size: 13px;"><strong>Requested By:</strong> ${params.requesterName}</p>
                <p style="margin: 4px 0; font-size: 14px; color: #0B1457;"><strong>Total Commitment:</strong> ₦${params.totalAmountNgn.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</p>
              </div>

              <div style="margin: 24px 0; display: flex; gap: 12px;">
                <a href="${approveUrl}" style="background-color: #0001FF; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 13px; display: inline-block;">Approve Immediately</a>
                <a href="${rejectUrl}" style="background-color: #EF4444; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 13px; display: inline-block; margin-left: 8px;">Reject</a>
              </div>

              <p style="font-size: 12px; color: #94A3B8; margin-top: 24px;">This single-use link expires in 24 hours. Alternatively, log in to view details: <a href="${viewUrl}" style="color: #0001FF;">View in Dashboard</a>.</p>
            </div>
          `,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("[Notification] Resend API Error:", errText);
        return {
          success: false,
          channel: "EMAIL",
          recipient: params.recipientEmail,
          error: errText,
        };
      }

      const resData = await response.json();
      return {
        success: true,
        channel: "EMAIL",
        messageId: resData.id,
        recipient: params.recipientEmail,
      };
    } catch (e) {
      console.error("[Notification] Outbound dispatch failed:", e);
      return {
        success: false,
        channel: "EMAIL",
        recipient: params.recipientEmail,
        error: String(e),
      };
    }
  }

  // Development / Test Fallback: Clean console log
  console.log(`\n================== [NOTIFICATIONS DISPATCH: APPROVAL] ==================`);
  console.log(`To: ${params.recipientName} <${params.recipientEmail}>`);
  console.log(`Subject: Action Required: Approval for Requisition ${params.requisitionNumber}`);
  console.log(`1-Click Approve Link: ${approveUrl}`);
  console.log(`1-Click Reject Link:  ${rejectUrl}`);
  console.log(`========================================================================\n`);

  return {
    success: true,
    channel: "CONSOLE",
    recipient: params.recipientEmail,
    messageId: `mock_${Date.now()}`,
  };
}

/**
 * Dispatches an automated Purchase Order award notification to a supplier
 */
export async function dispatchPoAwardNotification(
  params: PoNotificationParams,
): Promise<NotificationDispatchResult> {
  const baseUrl = params.baseUrl || process.env["APP_BASE_URL"] || "http://localhost:3000";
  // The supplier review and electronic acknowledgment portal is /quote/$token
  const ackUrl = `${baseUrl}/quote/${params.actionToken}`;

  const resendApiKey = process.env["RESEND_API_KEY"];
  const emailDriver = process.env["EMAIL_DRIVER"] || "console";
  const fromEmail = process.env["EMAIL_FROM"] || "Procurely Flow <notifications@procurely.app>";

  // Optional WhatsApp alert to supplier contact
  if (params.recipientPhone) {
    const waText =
      `Procurely Flow: Purchase Order Awarded!\n\n` +
      `Order: ${params.poNumber}\n` +
      `Total: ${params.currency} ${params.totalAmount.toLocaleString()}\n\n` +
      `Please review order specifications and submit delivery confirmation here:\n${ackUrl}`;

    dispatchTermiiMessage({
      to: params.recipientPhone,
      message: waText,
      channel: "whatsapp",
    }).catch((e) => console.error("[Notification] Outbound PO WhatsApp error:", e));
  }

  if (emailDriver !== "console" && resendApiKey && resendApiKey.startsWith("re_")) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: params.recipientEmail,
          subject: `Purchase Order Awarded: ${params.poNumber}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #E2E8F0; border-radius: 12px;">
              <h2 style="color: #0B1457; margin-bottom: 8px;">Purchase Order Award Notification</h2>
              <p style="color: #4B556D; font-size: 14px;">Hello ${params.supplierName}, you have been officially awarded Purchase Order <strong>${params.poNumber}</strong>.</p>
              
              <div style="background-color: #F8FAFC; padding: 16px; border-radius: 8px; margin: 20px 0; border: 1px solid #E2E8F0;">
                <p style="margin: 4px 0; font-size: 13px;"><strong>PO Number:</strong> ${params.poNumber}</p>
                <p style="margin: 4px 0; font-size: 14px; color: #0B1457;"><strong>Total Order Value:</strong> ${params.currency} ${params.totalAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</p>
              </div>

              <div style="margin: 24px 0;">
                <a href="${ackUrl}" style="background-color: #0001FF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block;">Review & Acknowledge Purchase Order</a>
              </div>

              <p style="font-size: 12px; color: #94A3B8; margin-top: 24px;">Please review the order specifications and confirm delivery timeline. No account registration is required.</p>
            </div>
          `,
        }),
      });

      if (response.ok) {
        const resData = await response.json();
        return {
          success: true,
          channel: "EMAIL",
          messageId: resData.id,
          recipient: params.recipientEmail,
        };
      }
    } catch (e) {
      console.error("[Notification] Resend PO dispatch error:", e);
    }
  }

  console.log(`\n================== [NOTIFICATIONS DISPATCH: PO AWARD] ==================`);
  console.log(`Supplier: ${params.supplierName} <${params.recipientEmail}>`);
  console.log(
    `PO Number: ${params.poNumber} (${params.currency} ${params.totalAmount.toLocaleString()})`,
  );
  console.log(`Supplier Acknowledgment URL: ${ackUrl}`);
  console.log(`========================================================================\n`);

  return {
    success: true,
    channel: "CONSOLE",
    recipient: params.recipientEmail,
    messageId: `po_ack_${Date.now()}`,
  };
}
