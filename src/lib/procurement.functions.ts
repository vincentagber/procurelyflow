import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const roleEnum = z.enum([
  "requester",
  "approver",
  "procurement_officer",
  "finance",
  "executive",
  "admin",
]);
const currencyEnum = z.enum(["NGN", "USD"]);

export const bootstrapOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        orgName: z.string().min(2),
        fullName: z.string().min(2),
        department: z.string().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { bootstrapOrganization } = await import("@/lib/procurement.server");
    const email = (context.claims.email as string | undefined) ?? "";
    return bootstrapOrganization(context.userId, email, data);
  });

export const updateMemberRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ targetUserId: z.string().uuid(), roles: z.array(roleEnum) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { setMemberRoles } = await import("@/lib/procurement.server");
    return setMemberRoles(context.userId, data);
  });

export const previewApprovalChain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ amount: z.number().nonnegative(), isUnbudgeted: z.boolean() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { previewChain } = await import("@/lib/procurement.server");
    return previewChain(context.userId, data);
  });

export const submitRequisitionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ requisitionId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { submitRequisition } = await import("@/lib/procurement.server");
    return submitRequisition(context.userId, data.requisitionId);
  });

export const decideApprovalFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        stepId: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        comment: z.string().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { decideApproval } = await import("@/lib/procurement.server");
    return decideApproval(context.userId, data);
  });

export const createRfqFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        requisitionId: z.string().uuid(),
        supplierIds: z.array(z.string().uuid()).min(1),
        instructions: z.string().optional(),
        closesAt: z.string(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { createRfq } = await import("@/lib/procurement.server");
    return createRfq(context.userId, data);
  });

export const getRecommendedQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ rfqId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { recommendationForUser } = await import("@/lib/procurement.server");
    const best = await recommendationForUser(context.userId, data.rfqId);
    return best ? { quoteId: best.id, totalAmount: Number(best.total_amount) } : null;
  });

export const awardQuoteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        rfqId: z.string().uuid(),
        quoteId: z.string().uuid(),
        settlementCurrency: currencyEnum,
        overrideReason: z.string().optional(),
        deliveryAddress: z.string().optional(),
        fxRateNote: z.string().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { awardQuote } = await import("@/lib/procurement.server");
    return awardQuote(context.userId, data);
  });

/* Supplier portal — token authenticated, deliberately public. */

export const getSupplierRfq = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => z.object({ token: z.string().min(10) }).parse(raw))
  .handler(async ({ data }) => {
    const { supplierRfqByToken } = await import("@/lib/procurement.server");
    return supplierRfqByToken(data.token);
  });

export const submitQuoteFn = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        token: z.string().min(10),
        currency: currencyEnum,
        leadTimeDays: z.number().int().nonnegative().optional(),
        paymentTerms: z.string().max(300).optional(),
        warrantyNote: z.string().max(600).optional(),

        deliveryCharge: z.number().nonnegative().optional(),
        validityDays: z.number().int().positive().max(365).optional(),
        attachment: z
          .object({
            name: z.string().min(1).max(120),
            contentType: z.string().min(3).max(120),
            dataBase64: z.string().min(1).max(7_000_000),
          })
          .optional(),
        lines: z
          .array(
            z.object({
              requisitionItemId: z.string().uuid(),
              description: z.string().min(1),
              quantity: z.number().positive(),
              unitPrice: z.number().nonnegative(),
              vatRate: z.number().min(0).max(100).optional(),
            }),
          )
          .min(1),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const { submitSupplierQuote } = await import("@/lib/procurement.server");
    return submitSupplierQuote(data);
  });

export const sweepRfqDeadlinesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { sweepRfqDeadlines } = await import("@/lib/procurement.server");
    return sweepRfqDeadlines(context.userId);
  });

export const quoteAttachmentUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ quoteId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { quoteAttachmentUrl } = await import("@/lib/procurement.server");
    return quoteAttachmentUrl(context.userId, data.quoteId);
  });

/* ---------- Foundations: invitations & projects ---------- */

export const inviteTeammateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ email: z.string().email(), roles: z.array(roleEnum) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { inviteTeammate } = await import("@/lib/procurement.server");
    return inviteTeammate(context.userId, data);
  });

export const cancelInvitationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ invitationId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { cancelInvitation } = await import("@/lib/procurement.server");
    return cancelInvitation(context.userId, data.invitationId);
  });

export const myPendingInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { pendingInviteForEmail } = await import("@/lib/procurement.server");
    return pendingInviteForEmail((context.claims.email as string | undefined) ?? "");
  });

export const acceptInviteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ fullName: z.string().min(2), department: z.string().optional() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { acceptInvite } = await import("@/lib/procurement.server");
    const email = (context.claims.email as string | undefined) ?? "";
    return acceptInvite(context.userId, email, data);
  });

export const createProjectFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        name: z.string().min(2),
        location: z.string().optional(),
        budgetAmount: z.number().nonnegative().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { createProject } = await import("@/lib/procurement.server");
    return createProject(context.userId, data);
  });

export const projectBudgetStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().min(1) }).parse(raw))
  .handler(async ({ data, context }) => {
    const { projectBudgetStatus } = await import("@/lib/procurement.server");
    return projectBudgetStatus(data.projectId);
  });

export const attachmentUploadUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        itemId: z.string().uuid(),
        filename: z.string().min(1),
        contentType: z.string().min(3),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { attachmentUploadUrl } = await import("@/lib/procurement.server");
    return attachmentUploadUrl(context.userId, data);
  });

/* ---------- Purchase order document & supplier acknowledgement ---------- */

export const purchaseOrderDetailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ purchaseOrderId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { purchaseOrderDetail } = await import("@/lib/procurement.server");
    return purchaseOrderDetail(context.userId, data.purchaseOrderId);
  });

export const supplierPoFn = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => z.object({ token: z.string().min(10) }).parse(raw))
  .handler(async ({ data }) => {
    const { supplierPoByToken } = await import("@/lib/procurement.server");
    return supplierPoByToken(data.token);
  });

export const acknowledgePoFn = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z.object({ token: z.string().min(10), signerName: z.string().min(2).max(120) }).parse(raw),
  )
  .handler(async ({ data }) => {
    const { acknowledgePoByToken } = await import("@/lib/procurement.server");
    return acknowledgePoByToken(data);
  });

/* ---------- Persistent supplier RFQ links ---------- */

export const rfqInvitationLinksFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ rfqId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { rfqInvitationLinks } = await import("@/lib/procurement.server");
    return rfqInvitationLinks(context.userId, data.rfqId);
  });

export const resendRfqInvitationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ invitationId: z.string().min(1), baseUrl: z.string().url() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { resendRfqInvitation } = await import("@/lib/procurement.server");
    return resendRfqInvitation(context.userId, data);
  });

/* ---------- SRS Extensions: Requisition Duplication, Deliveries, Invoices, Payments ---------- */

export const duplicateRequisitionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ requisitionId: z.string().min(1) }).parse(raw))
  .handler(async ({ data, context }) => {
    const { duplicateRequisition } = await import("@/lib/procurement.server");
    return duplicateRequisition(context.userId, data.requisitionId);
  });

export const createDeliveryReceiptFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        purchaseOrderId: z.string().min(1),
        projectId: z.string().min(1).optional(),
        deliveryNoteRef: z.string().optional(),
        deliveredAt: z.string().optional(),
        status: z.enum(["accepted", "partial", "rejected"]),
        qualityObservations: z.string().optional(),
        photos: z.array(z.object({ path: z.string(), name: z.string() })).optional(),
        items: z.array(
          z.object({
            poItemId: z.string().min(1).optional(),
            description: z.string().min(1),
            quantityDelivered: z.number().nonnegative(),
            quantityAccepted: z.number().nonnegative(),
            quantityRejected: z.number().nonnegative(),
            rejectionReason: z.string().optional(),
          }),
        ),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { createDeliveryReceipt } = await import("@/lib/procurement.server");
    return createDeliveryReceipt(context.userId, data);
  });

export const createInvoiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        purchaseOrderId: z.string().min(1).optional(),
        supplierId: z.string().min(1).optional(),
        invoiceNumber: z.string().min(1),
        issueDate: z.string().optional(),
        dueDate: z.string(),
        currency: currencyEnum,
        subtotal: z.number().nonnegative(),
        vatAmount: z.number().nonnegative(),
        totalAmount: z.number().nonnegative(),
        sellerLegalName: z.string().min(2),
        sellerTin: z.string().optional(),
        buyerLegalName: z.string().min(2),
        buyerTin: z.string().optional(),
        notes: z.string().optional(),
        items: z.array(
          z.object({
            poItemId: z.string().min(1).optional(),
            description: z.string().min(1),
            quantity: z.number().positive(),
            unitPrice: z.number().nonnegative(),
            vatRate: z.number().optional(),
            totalAmount: z.number().nonnegative(),
          }),
        ),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { createInvoice } = await import("@/lib/procurement.server");
    return createInvoice(context.userId, data);
  });

export const recordPaymentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        invoiceId: z.string().min(1).optional(),
        purchaseOrderId: z.string().min(1).optional(),
        amount: z.number().positive(),
        currency: currencyEnum,
        paymentMethod: z.enum(["bank_transfer", "virtual_account", "invoice_billing", "card"]),
        paymentReference: z.string().optional(),
        notes: z.string().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { recordPayment } = await import("@/lib/procurement.server");
    return recordPayment(context.userId, data);
  });

export const logNdpaConsentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        consentType: z.string().min(2),
        granted: z.boolean(),
        details: z.string().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { logNdpaConsent } = await import("@/lib/procurement.server");
    return logNdpaConsent(context.userId, data);
  });

/* ---------- FR-2.6 Approval Delegation Functions ---------- */

export const createApprovalDelegationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        substituteId: z.string().uuid(),
        startDate: z.string().min(10),
        endDate: z.string().min(10),
        reason: z.string().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { createApprovalDelegation } = await import("@/lib/procurement.server");
    return createApprovalDelegation(context.userId, data);
  });

export const getActiveDelegationsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getActiveDelegations } = await import("@/lib/procurement.server");
    return getActiveDelegations(context.userId);
  });

export const revokeApprovalDelegationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ delegationId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { revokeApprovalDelegation } = await import("@/lib/procurement.server");
    return revokeApprovalDelegation(context.userId, data.delegationId);
  });

/* ---------- FR-5.4 PO Change Order Functions ---------- */

export const createPoChangeOrderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        purchaseOrderId: z.string().uuid(),
        reason: z.string().min(3),
        newTotalAmount: z.number().positive(),
        modifiedItems: z.array(
          z.object({
            itemId: z.string(),
            description: z.string(),
            oldQuantity: z.number(),
            newQuantity: z.number(),
            oldUnitPrice: z.number(),
            newUnitPrice: z.number(),
          }),
        ),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { createPoChangeOrder } = await import("@/lib/procurement.server");
    return createPoChangeOrder(context.userId, data);
  });

export const getPoChangeOrdersFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ purchaseOrderId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { getPoChangeOrders } = await import("@/lib/procurement.server");
    return getPoChangeOrders(context.userId, data.purchaseOrderId);
  });

/* ---------- NFR-LOC.2 B2B Subscription Billing Functions ---------- */

export const generateSubscriptionBillFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        planTier: z.enum(["STARTER", "GROWTH", "BUSINESS", "ENTERPRISE"]),
        billingCycle: z.enum(["monthly", "annual"]),
        paymentMethod: z.enum(["VIRTUAL_ACCOUNT", "BANK_TRANSFER", "INVOICE_BILLING"]).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { generateSubscriptionBillServer } = await import("@/lib/procurement.server");
    const { paymentMethod, ...rest } = data;
    return generateSubscriptionBillServer(
      context.userId,
      paymentMethod !== undefined ? { ...rest, paymentMethod } : rest,
    );
  });

export const getSubscriptionStatementsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getSubscriptionStatements } = await import("@/lib/procurement.server");
    return getSubscriptionStatements(context.userId);
  });

export const settleSubscriptionBillFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        invoiceReference: z.string().min(1),
        transactionRef: z.string().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { settleSubscriptionBillServer } = await import("@/lib/procurement.server");
    return settleSubscriptionBillServer(context.userId, data.invoiceReference, data.transactionRef);
  });

/* ---------- Multi-Channel Approval (Web, Email, WhatsApp) Functions ---------- */

export const getApprovalTokenDetailsFn = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => z.object({ token: z.string().min(10) }).parse(raw))
  .handler(async ({ data }) => {
    const { getApprovalTokenDetails } = await import("@/lib/procurement.server");
    return getApprovalTokenDetails(data.token);
  });

export const decideApprovalByTokenFn = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        token: z.string().min(10),
        decision: z.enum(["approved", "rejected"]),
        comment: z.string().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const { decideApprovalByToken } = await import("@/lib/procurement.server");
    return decideApprovalByToken(data.token, data.decision, data.comment);
  });

export const generateStepApprovalLinksFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        stepId: z.string().uuid(),
        originUrl: z.string().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const { generateStepApprovalLinks } = await import("@/lib/procurement.server");
    return generateStepApprovalLinks(data.stepId, data.originUrl);
  });

export const simulateWhatsAppApprovalFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        fromPhone: z.string().min(5),
        stepId: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        comment: z.string().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const { whatsappApprovalWebhook } = await import("@/lib/procurement.server");
    return whatsappApprovalWebhook(data);
  });


