import { z } from "zod";

import type { Database } from "@/integrations/supabase/types";

export type SubscriptionPlan = Database["public"]["Enums"]["subscription_plan"];

export const SUBSCRIPTION_PLANS: { value: SubscriptionPlan; label: string }[] = [
  { value: "starter", label: "Starter" },
  { value: "growth", label: "Growth" },
  { value: "business", label: "Business" },
  { value: "enterprise", label: "Enterprise" },
  { value: "custom", label: "Custom" },
];

export const PLAN_LABELS: Record<string, string> = Object.fromEntries(
  SUBSCRIPTION_PLANS.map((p) => [p.value, p.label]),
);

export const BILLING_STATUS_LABELS: Record<string, string> = {
  trial: "Trial",
  active: "Active",
  overdue: "Overdue",
  suspended: "Suspended",
};

/** Nigerian standard rate. VAT amount is always subtotal x this rate, never typed in. */
export const DEFAULT_VAT_RATE = 7.5;

/**
 * Recurring card billing is unreliable in Nigeria, so subscription invoices are
 * settled by bank transfer and confirmed manually by platform staff.
 */
export const PROCURELY_BANK_DETAILS = {
  accountName: "Procurely Technologies Ltd",
  bankName: "Guaranty Trust Bank (GTBank)",
  accountNumber: "0123456789",
  currency: "NGN",
  note: "Use the invoice number as the transfer narration, then email proof of payment to billing@procurely.app.",
};

export const planSchema = z.enum(["starter", "growth", "business", "enterprise", "custom"]);
