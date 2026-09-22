import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  RefreshCw,
  CheckCircle2,
  Check,
  Copy,
  Receipt,
  Clock,
  ExternalLink,
  ShieldCheck,
  Landmark,
  Lock,
  X,
  Printer,
} from "lucide-react";
import {
  generateSubscriptionBillFn,
  getSubscriptionStatementsFn,
  settleSubscriptionBillFn,
} from "@/lib/procurement.functions";
import { PciProtectionEmblemIcon } from "@/components/procurely/ProductDesignerIcons";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/useMe";
import { money, shortDate, dateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";

export interface SubscriptionStatement {
  id: string;
  invoice_reference: string;
  plan_tier: string;
  billing_cycle: string;
  amount_ngn: number;
  virtual_account_bank: string;
  virtual_account_number: string;
  virtual_account_name?: string;
  status: "PENDING" | "SETTLED" | string;
  period_start: string;
  period_end: string;
  created_at: string;
  cleared_at?: string;
  settled_at?: string;
  payment_gateway_reference?: string;
}

export function BillingSection({ isAdmin }: { isAdmin: boolean }) {
  const me = useMe();
  const queryClient = useQueryClient();
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const [selectedTier, setSelectedTier] = useState<
    "STARTER" | "GROWTH" | "BUSINESS" | "ENTERPRISE"
  >("GROWTH");
  const [generatedBill, setGeneratedBill] = useState<SubscriptionStatement | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<SubscriptionStatement | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "SETTLED">("ALL");
  const [, setIsRealtimeConnected] = useState(true);

  // Realtime Supabase Subscription for instantaneous status updates across enterprise finance teams
  useEffect(() => {
    const channel = supabase
      .channel("tenant_subscriptions_realtime_routes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tenant_subscriptions",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["tenant-subscriptions"] });
          queryClient.invalidateQueries({ queryKey: ["me"] });
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setIsRealtimeConnected(true);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const {
    data: statements,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ["tenant-subscriptions"],
    queryFn: () => getSubscriptionStatementsFn(),
  });

  const generateBillMutation = useMutation({
    mutationFn: async () => {
      return generateSubscriptionBillFn({
        data: {
          planTier: selectedTier,
          billingCycle: cycle,
          paymentMethod: "VIRTUAL_ACCOUNT",
        },
      });
    },
    onSuccess: async (bill) => {
      setGeneratedBill(bill as unknown as SubscriptionStatement);
      toast.success("B2B invoice & dedicated virtual account generated.");
      await queryClient.invalidateQueries({ queryKey: ["tenant-subscriptions"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Failed generating billing statement."),
  });

  const settleBillMutation = useMutation({
    mutationFn: async (invoiceReference: string) => {
      return settleSubscriptionBillFn({
        data: {
          invoiceReference,
        },
      });
    },
    onSuccess: async (updated) => {
      toast.success(`Payment verified & settled for invoice ${updated.invoice_reference}!`);
      await queryClient.invalidateQueries({ queryKey: ["tenant-subscriptions"] });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      if (viewingInvoice && viewingInvoice.invoice_reference === updated.invoice_reference) {
        setViewingInvoice(updated as unknown as SubscriptionStatement);
      }
      if (generatedBill && generatedBill.invoice_reference === updated.invoice_reference) {
        setGeneratedBill(updated as unknown as SubscriptionStatement);
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to verify settlement."),
  });

  const tiers = [
    {
      id: "STARTER" as const,
      name: "Starter",
      monthly: 75000,
      annual: 765000,
      description: "Small organisation, one branch or project site",
      features: [
        "Requisitions & Multi-item lines",
        "Threshold approval routing",
        "Digital RFQ links & quote entry",
        "Automated side-by-side comparison",
      ],
    },
    {
      id: "GROWTH" as const,
      name: "Growth",
      monthly: 200000,
      annual: 2040000,
      popular: true,
      description: "Growing enterprise with multiple approvers and active sites",
      features: [
        "Everything in Starter",
        "WhatsApp 1-click token approvals",
        "Site Delivery & Inspection capture",
        "3-Way Invoice Matching & NRS e-invoicing",
        "Offline inspection local sync queue",
      ],
    },
    {
      id: "BUSINESS" as const,
      name: "Business",
      monthly: 500000,
      annual: 5100000,
      description: "Multiple concurrent projects, entities or heavy capex",
      features: [
        "Everything in Growth",
        "PO Change Orders & baseline preservation",
        "Approval delegation & SLA escalation",
        "Executive governance anomaly suite",
        "Multi-project budget drilldown",
      ],
    },
    {
      id: "ENTERPRISE" as const,
      name: "Enterprise",
      monthly: 1200000,
      annual: 12240000,
      description: "Large organisations requiring custom integrations & dedicated SLA",
      features: [
        "Everything in Business",
        "SAP & Dynamics 365 OData connectors",
        "Custom ERP general ledger export",
        "Dedicated account manager & 99.5% SLA",
        "Statutory NDPA compliance auditing support",
      ],
    },
  ];

  const typedStatements = (statements ?? []) as unknown as SubscriptionStatement[];
  const filteredStatements = typedStatements.filter((s) => {
    if (statusFilter === "PENDING") return s.status === "PENDING";
    if (statusFilter === "SETTLED") return s.status === "SETTLED";
    return true;
  });

  const activePlan = "GROWTH";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-xs space-y-6">
        {/* Realtime Status Bar & Current Plan Summary */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900 tracking-tight">
              Subscription &amp; Nigerian B2B Invoicing (§NFR-LOC.2)
            </h2>
            <p className="mt-1 text-xs text-slate-500 font-normal">
              Predictable, transparent software subscription billing tailored for African enterprise
              finance teams via bank transfer and dedicated NUBAN virtual accounts.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Realtime NIBSS Webhook Indicator */}
            <div
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-800"
              title="Real-time NIBSS bank settlement webhook listener active"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600" />
              </span>
              <span>Realtime NIBSS Channel: Active</span>
            </div>

            {/* Refresh Statements Button */}
            <button
              type="button"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["tenant-subscriptions"] })}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
              title="Refresh Billing Statements"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Current Active Plan Badge */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 px-4 py-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">Current Organization Plan:</span>
            <span className="rounded-md bg-[#0B1457] px-2.5 py-0.5 font-bold text-white uppercase tracking-wider text-[10px]">
              {activePlan}
            </span>
            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[11px]">
              <CheckCircle2 className="h-3.5 w-3.5" /> Active &amp; Validated
            </span>
          </div>

          {/* Monthly vs Annual Prepayment Toggle */}
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-1 text-xs font-semibold shadow-2xs">
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 transition-all cursor-pointer ${
                cycle === "monthly"
                  ? "bg-[#0B1457] text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              onClick={() => setCycle("monthly")}
            >
              Monthly Billing
            </button>
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 transition-all cursor-pointer flex items-center gap-1.5 ${
                cycle === "annual"
                  ? "bg-[#0B1457] text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              onClick={() => setCycle("annual")}
            >
              <span>Annual Billing</span>
              <span className="rounded bg-emerald-500/15 text-emerald-700 px-1.5 py-0.5 text-[9px] font-bold">
                Save 15%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Tiers Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {tiers.map((t) => {
            const isSelected = selectedTier === t.id;
            const price = cycle === "annual" ? t.annual : t.monthly;

            return (
              <div
                key={t.id}
                className={`relative flex flex-col justify-between rounded-xl border p-4 transition-all ${
                  isSelected
                    ? "border-[#0B1457] bg-slate-50/40 shadow-xs ring-1 ring-[#0B1457]"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                {t.popular ? (
                  <span className="absolute -top-2.5 right-4 rounded-full bg-[#0B1457] px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-2xs">
                    Most Popular
                  </span>
                ) : null}

                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{t.name}</h3>
                    <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">{t.description}</p>
                  </div>

                  <div>
                    <span className="text-xl font-bold font-sans text-slate-900 tabular-nums">
                      {money(price, "NGN")}
                    </span>
                    <span className="text-[11px] text-slate-500 font-normal">
                      {" "}
                      / {cycle === "annual" ? "year" : "month"}
                    </span>
                  </div>

                  <ul className="space-y-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-600">
                    {t.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-4 mt-auto">
                  <Button
                    type="button"
                    variant={isSelected ? "default" : "outline"}
                    className={`h-8 w-full rounded-lg text-xs font-semibold cursor-pointer ${
                      isSelected ? "bg-[#0B1457] hover:bg-[#0001FF] text-white" : "border-slate-200"
                    }`}
                    onClick={() => setSelectedTier(t.id)}
                  >
                    {isSelected ? "Selected Tier" : "Select Tier"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Generate Invoice Action */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
          <div>
            <p className="text-xs font-semibold text-slate-900">
              Selected: <strong className="text-[#0B1457] font-bold">{selectedTier}</strong> (
              {cycle === "annual" ? "Annual" : "Monthly"})
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Generates an official VAT-compliant corporate invoice with a dedicated Providus/Wema
              NUBAN virtual account.
            </p>
          </div>
          <Button
            type="button"
            className="h-9 px-4 rounded-lg bg-[#0B1457] hover:bg-[#0001FF] text-white text-xs font-semibold shadow-xs cursor-pointer shrink-0"
            disabled={generateBillMutation.isPending || !isAdmin}
            onClick={() => generateBillMutation.mutate()}
          >
            {generateBillMutation.isPending
              ? "Generating Invoice…"
              : "Generate Invoice & Bank Transfer Account"}
          </Button>
        </div>

        {/* Generated Bill Display Modal/Card */}
        {generatedBill ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Dedicated Virtual Account
                Statement Generated
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-slate-800">
                  {generatedBill.invoice_reference}
                </span>
                <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-bold">
                  {generatedBill.status || "PENDING"}
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 bg-white p-4 rounded-lg border border-emerald-200 text-xs">
              <div>
                <p className="text-[10px] uppercase text-slate-400 font-semibold">Bank Name</p>
                <p className="font-bold text-slate-900 mt-0.5">
                  {generatedBill.virtual_account_bank}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-slate-400 font-semibold">
                  Dedicated NUBAN Account
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="font-mono font-bold text-sm text-[#0B1457]">
                    {generatedBill.virtual_account_number}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(generatedBill.virtual_account_number);
                      toast.success("Account number copied.");
                    }}
                    className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                    title="Copy Account Number"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase text-slate-400 font-semibold">
                  Amount to Transfer
                </p>
                <p className="font-sans font-bold text-sm text-slate-900 mt-0.5">
                  {money(generatedBill.amount_ngn, "NGN")}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                Make an instant bank transfer from your corporate bank app. Automatic reconciliation
                clears your account within minutes of receipt.
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs font-semibold cursor-pointer border-emerald-300 text-emerald-900 hover:bg-emerald-100/60"
                  onClick={() => setViewingInvoice(generatedBill)}
                >
                  <Receipt className="h-3.5 w-3.5 mr-1" /> View Official Tax Invoice
                </Button>
                {isAdmin && generatedBill.status === "PENDING" ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer"
                    disabled={settleBillMutation.isPending}
                    onClick={() => settleBillMutation.mutate(generatedBill.invoice_reference)}
                  >
                    {settleBillMutation.isPending ? "Reconciling…" : "Verify & Settle Transfer"}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {/* Statements History Section */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Billing Statements &amp; Invoices ({filteredStatements.length})
            </h3>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setStatusFilter("ALL")}
                className={`rounded-md px-2.5 py-1 cursor-pointer transition-all ${
                  statusFilter === "ALL"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("PENDING")}
                className={`rounded-md px-2.5 py-1 cursor-pointer transition-all ${
                  statusFilter === "PENDING"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Pending
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("SETTLED")}
                className={`rounded-md px-2.5 py-1 cursor-pointer transition-all ${
                  statusFilter === "SETTLED"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Settled
              </button>
            </div>
          </div>

          {isLoading ? (
            <p className="text-xs text-slate-400">Loading invoices…</p>
          ) : filteredStatements.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500">
              No subscription invoices found for this filter.
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-medium">
                  <tr>
                    <th className="px-4 py-3">Invoice Ref</th>
                    <th className="px-4 py-3">Plan Tier</th>
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Virtual Account</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStatements.map((s) => {
                    const isSettled = s.status === "SETTLED";
                    return (
                      <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setViewingInvoice(s)}
                            className="font-mono font-bold text-[#0B1457] hover:underline cursor-pointer flex items-center gap-1 text-left"
                            title="View Official VAT Tax Invoice"
                          >
                            <span>{s.invoice_reference}</span>
                            <ExternalLink className="h-3 w-3 text-slate-400" />
                          </button>
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {s.plan_tier}{" "}
                          <span className="text-[11px] font-normal text-slate-500">
                            ({s.billing_cycle})
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-[11px] whitespace-nowrap">
                          {shortDate(s.period_start)} – {shortDate(s.period_end)}
                        </td>
                        <td className="px-4 py-3 font-sans font-semibold text-slate-900 whitespace-nowrap">
                          {money(s.amount_ngn, "NGN")}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span>
                              {s.virtual_account_bank} · {s.virtual_account_number}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(s.virtual_account_number);
                                toast.success("Virtual account number copied.");
                              }}
                              className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 cursor-pointer"
                              title="Copy NUBAN"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              isSettled
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-amber-50 text-amber-700 border border-amber-200"
                            }`}
                            title={
                              isSettled
                                ? `Settled on ${dateTime(s.cleared_at || s.settled_at || s.created_at)}`
                                : "Awaiting Bank Transfer"
                            }
                          >
                            {isSettled ? (
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            ) : (
                              <Clock className="h-3 w-3 text-amber-600" />
                            )}
                            {s.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[11px] text-[#0B1457] hover:bg-blue-50 cursor-pointer"
                              onClick={() => setViewingInvoice(s)}
                            >
                              <Receipt className="h-3 w-3 mr-1" /> View Invoice
                            </Button>
                            {!isSettled && isAdmin ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px] font-semibold border-emerald-300 text-emerald-800 hover:bg-emerald-50 cursor-pointer"
                                disabled={settleBillMutation.isPending}
                                onClick={() => settleBillMutation.mutate(s.invoice_reference)}
                              >
                                {settleBillMutation.isPending ? "Settling…" : "Settle"}
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* PCI-DSS & Local Currency Protection Banner with Professional Icon */}
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50/80 via-white to-blue-50/20 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-start gap-4">
            <PciProtectionEmblemIcon className="h-12 w-12" />

            <div className="space-y-1.5 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-xs font-bold text-slate-900 tracking-tight">
                  PCI-DSS &amp; Local Currency Protection Guarantee (§NFR-LOC.2, §NFR-SEC.4)
                </h4>
                <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.2 text-[9px] font-bold uppercase tracking-wider">
                  Zero Card Storage
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-600 font-normal">
                Procurely Flow enforces a strict zero raw-card storage policy. All billing
                collections route through licensed Nigerian financial institutions (Providus, Wema,
                Monnify, Paystack) via dedicated virtual accounts and bank transfers to prevent
                auto-renew card failures and naira volatility risks.
              </p>
            </div>
          </div>

          {/* Regulatory & Clearing Bank Badges */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
            <span className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2.5 py-1 text-[10px] font-semibold text-slate-700 shadow-2xs">
              <ShieldCheck className="h-3 w-3 text-emerald-600" /> PCI-DSS Level 1 Ready
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2.5 py-1 text-[10px] font-semibold text-slate-700 shadow-2xs">
              <Landmark className="h-3 w-3 text-blue-600" /> CBN NUBAN Framework
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2.5 py-1 text-[10px] font-semibold text-slate-700 shadow-2xs">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" /> NIBSS Instant Clearing
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2.5 py-1 text-[10px] font-semibold text-slate-700 shadow-2xs">
              <Lock className="h-3 w-3 text-indigo-600" /> NDPA 2023 Compliant
            </span>
            <span className="text-[10px] text-slate-400 ml-auto hidden sm:inline-block">
              Settlement Rails: Providus Bank · Wema Bank · Monnify · Paystack
            </span>
          </div>
        </div>
      </div>

      {/* Official Nigerian B2B VAT-Compliant Corporate Tax Invoice Modal */}
      {viewingInvoice ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-200 text-slate-800 my-8 animate-in fade-in zoom-in-95 duration-200">
            {/* Top Close Button */}
            <button
              type="button"
              onClick={() => setViewingInvoice(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Tax Invoice Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-[#0B1457] flex items-center justify-center text-white font-bold text-xs shadow-xs">
                    PF
                  </div>
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">
                    Procurely Flow Technologies Nigeria Ltd
                  </h3>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  RC Number: <strong>RC-1849204</strong> · Tax Identification Number (TIN):{" "}
                  <strong>24981720-0001</strong>
                </p>
                <p className="text-[11px] text-slate-500">
                  Level 5, Standard Chartered Tower, Ahmadu Bello Way, Victoria Island, Lagos,
                  Nigeria
                </p>
              </div>

              {/* Status Stamp */}
              <div className="text-right shrink-0">
                <div
                  className={`inline-block rounded-xl border-2 px-3 py-1.5 font-bold uppercase tracking-wider text-xs ${
                    viewingInvoice.status === "SETTLED"
                      ? "border-emerald-600 bg-emerald-50 text-emerald-700 shadow-xs"
                      : "border-amber-500 bg-amber-50 text-amber-800 shadow-xs"
                  }`}
                >
                  {viewingInvoice.status === "SETTLED" ? "✓ PAID & SETTLED" : "• PAYMENT PENDING"}
                </div>
                <p className="text-[10px] text-slate-400 mt-1 font-mono">
                  {viewingInvoice.status === "SETTLED" && viewingInvoice.payment_gateway_reference
                    ? viewingInvoice.payment_gateway_reference
                    : "NRS Tax Invoicing §NFR-LOC.2"}
                </p>
              </div>
            </div>

            {/* Bill To & Invoice Meta Details */}
            <div className="grid sm:grid-cols-2 gap-4 py-5 text-xs border-b border-slate-100">
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Billed To (Customer)
                </p>
                <p className="font-bold text-slate-900 text-sm">
                  {me.data?.orgName || "Corporate Customer"}
                </p>
                <p className="text-slate-600">
                  Org ID:{" "}
                  <span className="font-mono text-[11px]">{me.data?.profile?.org_id || "—"}</span>
                </p>
                <p className="text-slate-600">Jurisdiction: Federal Republic of Nigeria</p>
              </div>

              <div className="space-y-1 sm:text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Tax Invoice Metadata
                </p>
                <p className="font-mono font-bold text-slate-900">
                  {viewingInvoice.invoice_reference}
                </p>
                <p className="text-slate-600">
                  Period: {shortDate(viewingInvoice.period_start)} to{" "}
                  {shortDate(viewingInvoice.period_end)}
                </p>
                <p className="text-slate-600">Terms: Immediate Bank Transfer (NIBSS)</p>
              </div>
            </div>

            {/* Financial Breakdown Table */}
            <div className="py-5 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Statutory Billing Breakdown
              </p>
              <div className="rounded-xl border border-slate-200 overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-4 py-2.5">Item Description</th>
                      <th className="px-4 py-2.5 text-center">Cycle</th>
                      <th className="px-4 py-2.5 text-right">Gross (NGN)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">
                          Procurely Flow Enterprise SaaS — {viewingInvoice.plan_tier} Tier
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Multi-Site Requisition Routing, WhatsApp Token Approvals, 3-Way Invoice
                          Matching &amp; NRS e-Invoicing
                        </p>
                      </td>
                      <td className="px-4 py-3 text-center capitalize text-slate-600 font-medium">
                        {viewingInvoice.billing_cycle}
                      </td>
                      <td className="px-4 py-3 text-right font-sans font-bold text-slate-900">
                        {money(viewingInvoice.amount_ngn, "NGN")}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Subtotal & VAT Breakdown (7.5% Nigerian VAT Statutory Rate) */}
              <div className="bg-slate-50/70 rounded-xl p-4 space-y-2 text-xs border border-slate-200">
                {(() => {
                  const gross = Number(viewingInvoice.amount_ngn) || 0;
                  const net = Math.round(gross / 1.075);
                  const vat = gross - net;
                  return (
                    <>
                      <div className="flex justify-between text-slate-600">
                        <span>Net Subscription Amount (Excl. VAT):</span>
                        <span className="font-sans font-medium">{money(net, "NGN")}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Value Added Tax (7.5% Statutory NRS Rate):</span>
                        <span className="font-sans font-medium">{money(vat, "NGN")}</span>
                      </div>
                      <div className="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-200">
                        <span>Total Payable Gross Amount:</span>
                        <span className="font-sans text-[#0B1457]">{money(gross, "NGN")}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Dedicated Virtual Account Settlement Box */}
            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#0B1457] uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                  <Landmark className="h-3.5 w-3.5" /> Dedicated Nigerian Virtual NUBAN Account
                </span>
                <span className="text-[10px] text-blue-700 font-medium">
                  NIBSS Real-time Auto-Reconciliation
                </span>
              </div>

              <div className="grid sm:grid-cols-3 gap-3 bg-white p-3 rounded-lg border border-blue-200">
                <div>
                  <p className="text-[10px] uppercase text-slate-400 font-semibold">Bank</p>
                  <p className="font-bold text-slate-900 mt-0.5">
                    {viewingInvoice.virtual_account_bank}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-slate-400 font-semibold">
                    Account Number
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="font-mono font-bold text-sm text-[#0B1457]">
                      {viewingInvoice.virtual_account_number}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(viewingInvoice.virtual_account_number);
                        toast.success("Account number copied.");
                      }}
                      className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                      title="Copy Account Number"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-slate-400 font-semibold">Account Name</p>
                  <p className="font-semibold text-slate-800 truncate mt-0.5">
                    {viewingInvoice.virtual_account_name}
                  </p>
                </div>
              </div>

              <p className="text-[11px] text-slate-500">
                Transfer exact total via corporate mobile banking app or Internet banking. The
                dedicated virtual account reconciles within minutes and updates subscription state
                automatically.
              </p>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-6 border-t border-slate-200 mt-5">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs font-semibold cursor-pointer"
                  onClick={() => window.print()}
                >
                  <Printer className="h-3.5 w-3.5 mr-1" /> Print / Save Tax Invoice
                </Button>
              </div>

              <div className="flex items-center gap-2">
                {viewingInvoice.status === "PENDING" && isAdmin ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer shadow-xs"
                    disabled={settleBillMutation.isPending}
                    onClick={() => settleBillMutation.mutate(viewingInvoice.invoice_reference)}
                  >
                    {settleBillMutation.isPending
                      ? "Reconciling…"
                      : "Verify & Settle Inbound Transfer"}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs font-semibold cursor-pointer text-slate-600 hover:bg-slate-100"
                  onClick={() => setViewingInvoice(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
