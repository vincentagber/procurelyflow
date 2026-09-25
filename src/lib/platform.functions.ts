import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { planSchema } from "@/lib/billing";

export const amIPlatformAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isPlatformAdmin } = await import("@/lib/platform.server");
    const email = (context.claims.email as string | undefined) ?? "";
    return { isPlatformAdmin: await isPlatformAdmin(context.userId, email) };
  });

export const platformOrgsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listOrganizations } = await import("@/lib/platform.server");
    return listOrganizations(context.userId, (context.claims.email as string | undefined) ?? "");
  });

export const platformOrgDetailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ orgId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { organizationDetail } = await import("@/lib/platform.server");
    return organizationDetail(
      context.userId,
      data.orgId,
      (context.claims.email as string | undefined) ?? "",
    );
  });

export const provisionOrgFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        orgName: z.string().min(2).max(120),
        plan: planSchema,
        status: z.enum(["trial", "active"]),
        adminEmail: z.string().email(),
        adminFullName: z.string().min(2).max(120),
        adminPassword: z.string().min(10).max(200),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { provisionOrganization } = await import("@/lib/platform.server");
    return provisionOrganization(
      context.userId,
      data,
      (context.claims.email as string | undefined) ?? "",
    );
  });

export const setOrgStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        status: z.enum(["trial", "active", "suspended"]),
        reason: z.string().max(300).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { setOrganizationStatus } = await import("@/lib/platform.server");
    return setOrganizationStatus(
      context.userId,
      data,
      (context.claims.email as string | undefined) ?? "",
    );
  });

export const setOrgPlanFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ orgId: z.string().uuid(), plan: planSchema }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { setOrganizationPlan } = await import("@/lib/platform.server");
    return setOrganizationPlan(
      context.userId,
      data,
      (context.claims.email as string | undefined) ?? "",
    );
  });

export const myOrgAccessFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { organizationAccessState } = await import("@/lib/platform.server");
    return organizationAccessState(context.userId);
  });

export const billingInvoicesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ orgId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { listBillingInvoices } = await import("@/lib/platform.server");
    return listBillingInvoices(
      context.userId,
      data.orgId,
      (context.claims.email as string | undefined) ?? "",
    );
  });

export const createBillingInvoiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        subtotal: z.number().nonnegative().max(1_000_000_000),
        vatRate: z.number().min(0).max(100),
        description: z.string().max(300).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { createBillingInvoice } = await import("@/lib/platform.server");
    return createBillingInvoice(
      context.userId,
      data,
      (context.claims.email as string | undefined) ?? "",
    );
  });

export const markBillingInvoicePaidFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({ invoiceId: z.string().uuid(), paymentReference: z.string().max(120).optional() })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { markBillingInvoicePaid } = await import("@/lib/platform.server");
    return markBillingInvoicePaid(
      context.userId,
      data,
      (context.claims.email as string | undefined) ?? "",
    );
  });

export const adminSettleSubscriptionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        invoiceReference: z.string().min(1),
        paymentReference: z.string().min(4),
        verificationSource: z.string().optional(),
        reason: z.string().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { adminSettleSubscription } = await import("@/lib/platform.server");
    return adminSettleSubscription(
      context.userId,
      data,
      (context.claims.email as string | undefined) ?? "",
    );
  });
