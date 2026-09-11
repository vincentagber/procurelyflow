"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Award,
  Copy,
  Paperclip,
  Send,
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  TrendingDown,
  Clock,
  Star,
  Landmark,
  FileText,
  Check,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  Building2,
  Calendar,
  Layers,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  awardQuoteFn,
  quoteAttachmentUrlFn,
  rfqInvitationLinksFn,
  resendRfqInvitationFn,
} from "@/lib/procurement.functions";
import {
  analyzeSupplierQuotes,
  SideBySideBidAnalysis,
} from "@/lib/quotationComparison";
import { money, shortDate, dateTime } from "@/lib/format";
import { PageHeader, StatusPill, EmptyState } from "@/components/procurely/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion, AnimatePresence } from "@/components/ui/animated";

export default function RfqDetailPage() {
  const params = useParams();
  const id = params?.["id"] as string;
  const router = useRouter();
  const queryClient = useQueryClient();

  const [selectedQuote, setSelectedQuote] = useState<string>("");
  const [settlementCurrency, setSettlementCurrency] = useState<"NGN" | "USD">("NGN");
  const [reason, setReason] = useState("");
  const [address, setAddress] = useState("");
  const [fxNote, setFxNote] = useState("");
  const [comparisonTab, setComparisonTab] = useState<"OVERVIEW" | "LINE_ITEMS" | "DISTRIBUTION">("OVERVIEW");

  const { data, isLoading } = useQuery({
    queryKey: ["rfq", id],
    queryFn: async () => {
      const [rfq, quotes, invites] = await Promise.all([
        supabase
          .from("rfqs")
          .select("*, requisitions(id, reference, title, needed_by, project_id, projects(name, location))")
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("quotes")
          .select(
            "*, suppliers(id, name, is_compliant, rating, tax_id, phone, email), quote_items(id, requisition_item_id, description, quantity, unit_price, vat_rate, vat_amount, currency)",
          )
          .eq("rfq_id", id)
          .order("total_amount", { ascending: true }),
        supabase
          .from("rfq_invitations")
          .select("id, expires_at, opened_at, suppliers(name, email, phone)")
          .eq("rfq_id", id),
      ]);

      const reqId = (rfq.data?.requisitions as any)?.id;
      let items: any[] = [];
      if (reqId) {
        const { data: itemRows } = await supabase
          .from("requisition_items")
          .select("id, description, quantity, unit, estimated_unit_price")
          .eq("requisition_id", reqId);
        items = itemRows ?? [];
      }

      return {
        rfq: rfq.data,
        quotes: quotes.data ?? [],
        invites: invites.data ?? [],
        items,
      };
    },
    enabled: !!id,
  });

  const rfq = data?.rfq;
  const quotesList = data?.quotes ?? [];
  const invitesList = data?.invites ?? [];

  // Automated Quotation Comparison Engine Analysis
  const analysis: SideBySideBidAnalysis = analyzeSupplierQuotes({
    rfqId: id,
    rfqReference: rfq?.reference || "RFQ",
    requisitionTitle: rfq?.title || "Requisition",
    siteProjectName: (rfq?.requisitions as any)?.projects?.name || "General Capex Site",
    neededByDate: (rfq?.requisitions as any)?.needed_by || null,
    closesAt: rfq?.closes_at || new Date().toISOString(),
    totalInvitedCount: invitesList.length,
    rawQuotes: quotesList.map((q: any) => ({
      id: q.id,
      rfqId: q.rfq_id,
      supplierId: q.supplier_id,
      currency: q.currency,
      subtotal: Number(q.subtotal || 0),
      vatAmount: Number(q.vat_amount || 0),
      deliveryCharge: Number(q.delivery_charge || 0),
      totalAmount: Number(q.total_amount || 0),
      leadTimeDays: q.lead_time_days,
      paymentTerms: q.payment_terms,
      warrantyNote: q.warranty_note,
      validityDays: q.validity_days,
      attachmentPath: q.attachment_path,
      submittedAt: q.submitted_at,
      status: q.status,
      supplier: {
        id: q.suppliers?.id || q.supplier_id,
        name: q.suppliers?.name || "Supplier",
        email: q.suppliers?.email,
        phone: q.suppliers?.phone,
        isCompliant: q.suppliers?.is_compliant !== false,
        taxId: q.suppliers?.tax_id,
        rating: q.suppliers?.rating,
      },
      items: (q.quote_items || []).map((qi: any) => ({
        id: qi.id,
        requisitionItemId: qi.requisition_item_id,
        description: qi.description,
        quantity: Number(qi.quantity),
        unitPrice: Number(qi.unit_price),
        vatRate: Number(qi.vat_rate ?? 7.5),
        vatAmount: qi.vat_amount != null ? Number(qi.vat_amount) : undefined,
        currency: qi.currency,
      })),
    })),
    requisitionItems: data?.items || [],
  });

  // Auto-select recommended quote by default if nothing is selected yet
  useEffect(() => {
    if (analysis.recommendedQuoteId && !selectedQuote) {
      setSelectedQuote(analysis.recommendedQuoteId);
      const q = quotesList.find((item: any) => item.id === analysis.recommendedQuoteId);
      if (q) setSettlementCurrency(q.currency as "NGN" | "USD");
    }
  }, [analysis.recommendedQuoteId, selectedQuote, quotesList]);

  const isOverride =
    !!analysis.recommendedQuoteId &&
    !!selectedQuote &&
    analysis.recommendedQuoteId !== selectedQuote;

  const awarded = rfq?.status === "awarded";

  const award = useMutation({
    mutationFn: () =>
      awardQuoteFn({
        data: {
          rfqId: id,
          quoteId: selectedQuote,
          settlementCurrency,
          overrideReason: reason || undefined,
          deliveryAddress: address || undefined,
          fxRateNote: fxNote || undefined,
        },
      }),
    onSuccess: async (result) => {
      toast.success(`${result.poNumber} successfully issued to the supplier.`);
      await queryClient.invalidateQueries();
      router.push(`/purchase-orders/${result.purchaseOrderId}`);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Couldn't issue the purchase order."),
  });

  if (isLoading) {
    return (
      <div className="py-12 text-center space-y-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#0B1457] border-t-transparent mx-auto" />
        <p className="text-xs font-semibold text-slate-500">Computing automated bid analysis &amp; landed costs…</p>
      </div>
    );
  }

  if (!rfq) return <p className="text-sm text-muted-foreground">This RFQ no longer exists.</p>;

  const reqData = rfq.requisitions as any;
  const projectName = reqData?.projects?.name || "General Capex Site";
  const projectLocation = reqData?.projects?.location || "Site Location Unassigned";

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <PageHeader
        title={rfq.title}
        subtitle={`${rfq.reference} · Project Site: ${projectName} (${projectLocation}) · Closes ${shortDate(rfq.closes_at)}`}
        actions={
          <Button asChild variant="outline" className="h-10 text-xs font-semibold">
            <Link href="/rfqs">All RFQs</Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <StatusPill status={rfq.status} />
          {reqData?.reference ? (
            <Link
              href={`/requisitions/${reqData.id}`}
              className="text-xs font-bold text-[#0B1457] hover:text-[#0001FF] hover:underline flex items-center gap-1"
            >
              <span>Linked to {reqData.reference}</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          ) : null}
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 border border-slate-200 bg-white p-1 rounded-xl text-xs font-semibold shadow-2xs">
          <button
            type="button"
            onClick={() => setComparisonTab("OVERVIEW")}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              comparisonTab === "OVERVIEW"
                ? "bg-[#0B1457] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Side-by-Side Analysis ({analysis.quotes.length})
          </button>
          <button
            type="button"
            onClick={() => setComparisonTab("LINE_ITEMS")}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              comparisonTab === "LINE_ITEMS"
                ? "bg-[#0B1457] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Price Per Item ({analysis.lineItems.length})
          </button>
          <button
            type="button"
            onClick={() => setComparisonTab("DISTRIBUTION")}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              comparisonTab === "DISTRIBUTION"
                ? "bg-[#0B1457] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Supplier Links ({invitesList.length})
          </button>
        </div>
      </div>

      {!quotesList.length ? (
        <EmptyState
          title="No quotes in yet"
          body="Suppliers you invited haven't submitted quotes yet. Their secure links stay live until the RFQ closes — you can view or re-share them from the Supplier Links tab."
        />
      ) : (
        <>
          {/* Executive KPIs Banner */}
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Recommended Award
              </span>
              <p className="text-lg font-black text-[#0B1457] truncate">
                {analysis.recommendedSupplierName || "Pending Review"}
              </p>
              <p className="text-xs font-semibold text-emerald-700">
                {analysis.recommendedQuoteAmount ? money(analysis.recommendedQuoteAmount, "NGN") : "—"}
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                <TrendingDown className="h-3 w-3" />
                Est. Cost Avoidance
              </span>
              <p className="text-lg font-black text-emerald-950">
                {money(analysis.totalPotentialCostAvoidance, "NGN")}
              </p>
              <p className="text-[11px] text-emerald-800">
                Savings achieved vs higher peer quotes
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Supplier Response Velocity
              </span>
              <p className="text-lg font-black text-slate-900">
                {analysis.totalQuotesReceived} of {analysis.totalInvitedSuppliers} responded
              </p>
              <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1 overflow-hidden">
                <div
                  className="bg-emerald-600 h-1.5 rounded-full"
                  style={{ width: `${analysis.responseRatePercent}%` }}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Compliance &amp; Lead Time
              </span>
              <p className="text-lg font-black text-slate-900 flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-slate-500" />
                {Math.min(...analysis.quotes.map((q) => q.leadTimeDays))} Days Fastest
              </p>
              <p className="text-[11px] text-slate-500">
                {analysis.hasNonCompliantBids ? "⚠️ Non-compliant bid flagged" : "✅ 100% Tax Compliant Bids"}
              </p>
            </div>
          </section>

          {/* Signature Recommended Award Callout Banner */}
          {analysis.recommendedQuoteId && (
            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50/90 via-blue-50/50 to-white p-5 sm:p-6 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
                    <Award className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-emerald-700 text-white px-2 py-0.5 text-[9px] font-black uppercase tracking-wider">
                        Platform Signature Recommendation
                      </span>
                      <span className="text-xs font-bold text-slate-900">
                        {analysis.recommendedSupplierName}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed font-normal">
                      {analysis.recommendationRationale}
                    </p>
                  </div>
                </div>

                {!awarded && selectedQuote !== analysis.recommendedQuoteId && (
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 px-4 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white shrink-0 cursor-pointer shadow-xs"
                    onClick={() => {
                      if (analysis.recommendedQuoteId) {
                        setSelectedQuote(analysis.recommendedQuoteId);
                        const q = quotesList.find((item: any) => item.id === analysis.recommendedQuoteId);
                        if (q) setSettlementCurrency(q.currency as "NGN" | "USD");
                        toast.success(`Selected recommended quote from ${analysis.recommendedSupplierName}.`);
                      }
                    }}
                  >
                    Select Recommended Bid
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Tab Content 1: Side-by-Side Comparative Matrix */}
          {comparisonTab === "OVERVIEW" && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                    Side-by-Side Bid Analysis Matrix (§FR-3, §FR-4)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Multi-criteria evaluation comparing landed costs, delivery timelines, credit terms, and supplier track records.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[850px] text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4 text-left font-bold uppercase text-[10px] tracking-wider w-48">
                        Evaluation Dimension
                      </th>
                      {analysis.quotes.map((q) => (
                        <th
                          key={q.id}
                          className={`py-3 px-4 text-left font-bold text-slate-900 min-w-[200px] ${
                            selectedQuote === q.id ? "bg-blue-50/60 border-x border-[#0B1457]/20" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate text-xs font-bold">{q.supplierName}</span>
                            {q.isRecommended && (
                              <span className="rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.5 text-[9px] font-black uppercase">
                                Recommended
                              </span>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {/* Row: Supplier Credentials & Rating */}
                    <tr>
                      <td className="py-3 px-4 font-bold text-slate-500 bg-slate-50/40">
                        Supplier Standing &amp; Rating
                      </td>
                      {analysis.quotes.map((q) => (
                        <td
                          key={q.id}
                          className={`py-3 px-4 ${selectedQuote === q.id ? "bg-blue-50/30 border-x border-[#0B1457]/10" : ""}`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900 flex items-center gap-0.5">
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                              {q.supplierRating.toFixed(1)}
                            </span>
                            <span className="text-[10px] text-slate-400">/ 5.0</span>
                            {q.isCompliant ? (
                              <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">
                                <Check className="h-2.5 w-2.5" /> Tax Compliant
                              </span>
                            ) : (
                              <span className="ml-1 text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded">
                                Non-Compliant TIN
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1">
                            {q.historicalOnTimeRate}% On-Time Delivery · {q.totalFulfilledOrders} past orders
                          </p>
                        </td>
                      ))}
                    </tr>

                    {/* Row: Total Landed Cost */}
                    <tr className="bg-slate-50/20">
                      <td className="py-3 px-4 font-bold text-slate-900 bg-slate-50/60">
                        Total Landed Cost
                      </td>
                      {analysis.quotes.map((q) => (
                        <td
                          key={q.id}
                          className={`py-3 px-4 ${selectedQuote === q.id ? "bg-blue-50/40 border-x border-[#0B1457]/10" : ""}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black tabular-nums text-[#0B1457]">
                              {money(q.totalLandedCost, q.currency)}
                            </span>
                            {q.isLowestLandedCost ? (
                              <span className="rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.5 text-[9px] font-bold uppercase">
                                Lowest Cost
                              </span>
                            ) : (
                              <span className="rounded bg-slate-100 text-slate-600 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums">
                                +{money(q.landedCostVarianceVsLowest, q.currency)}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Items {money(q.itemsSubtotal, q.currency)} · VAT {money(q.vatAmount, q.currency)} · Delivery {money(q.deliveryCharge, q.currency)}
                          </p>
                        </td>
                      ))}
                    </tr>

                    {/* Row: Delivery Timelines */}
                    <tr>
                      <td className="py-3 px-4 font-bold text-slate-500 bg-slate-50/40">
                        Delivery Timelines
                      </td>
                      {analysis.quotes.map((q) => (
                        <td
                          key={q.id}
                          className={`py-3 px-4 ${selectedQuote === q.id ? "bg-blue-50/30 border-x border-[#0B1457]/10" : ""}`}
                        >
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3 w-3 text-slate-400" />
                            <span className="font-semibold text-slate-900">
                              {q.leadTimeDays} business days
                            </span>
                            <span className="text-[10px] font-medium text-slate-500">
                              ({shortDate(q.projectedDeliveryDate)})
                            </span>
                          </div>
                          {q.isDeliveryDelayedVsNeededBy ? (
                            <p className="text-[10px] text-rose-600 font-medium mt-1 flex items-center gap-1">
                              <AlertTriangle className="h-2.5 w-2.5" /> Exceeds site need date
                            </p>
                          ) : (
                            <p className="text-[10px] text-emerald-700 font-medium mt-0.5">
                              Arrives on schedule for site pour
                            </p>
                          )}
                        </td>
                      ))}
                    </tr>

                    {/* Row: Credit & Commercial Terms */}
                    <tr>
                      <td className="py-3 px-4 font-bold text-slate-500 bg-slate-50/40">
                        Credit Terms &amp; Warranty
                      </td>
                      {analysis.quotes.map((q) => (
                        <td
                          key={q.id}
                          className={`py-3 px-4 ${selectedQuote === q.id ? "bg-blue-50/30 border-x border-[#0B1457]/10" : ""}`}
                        >
                          <p className="font-semibold text-slate-900">{q.paymentTerms}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            {q.warrantyNote || "Standard Manufacturer Warranty"} · Valid {q.validityDays} days
                          </p>
                          {q.attachmentPath && (
                            <button
                              type="button"
                              className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-[#0B1457] hover:underline cursor-pointer"
                              onClick={() =>
                                quoteAttachmentUrlFn({ data: { quoteId: q.id } })
                                  .then((r) => window.open(r.url, "_blank", "noopener"))
                                  .catch(() => toast.error("Couldn't open that quotation document."))
                              }
                            >
                              <Paperclip className="h-3 w-3" /> Supporting Quotation PDF
                            </button>
                          )}
                        </td>
                      ))}
                    </tr>

                    {/* Row: Composite Commercial Score */}
                    <tr className="bg-slate-50/30">
                      <td className="py-3 px-4 font-bold text-slate-700 bg-slate-50/60">
                        Commercial Bid Score
                      </td>
                      {analysis.quotes.map((q) => (
                        <td
                          key={q.id}
                          className={`py-3 px-4 ${selectedQuote === q.id ? "bg-blue-50/40 border-x border-[#0B1457]/10" : ""}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-black text-slate-900">
                              {q.commercialScore}
                            </span>
                            <span className="text-[10px] text-slate-400">/ 100</span>
                            <div className="w-16 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-[#0B1457] h-1.5 rounded-full"
                                style={{ width: `${q.commercialScore}%` }}
                              />
                            </div>
                          </div>
                          <p className="text-[9px] text-slate-400 mt-1">
                            Cost {q.scoreBreakdown.landedCostScore}/50 · Speed {q.scoreBreakdown.deliverySpeedScore}/20 · Quality {q.scoreBreakdown.qualityRatingScore}/20 · Terms {q.scoreBreakdown.creditTermsScore}/10
                          </p>
                        </td>
                      ))}
                    </tr>

                    {/* Row: Final Selection Action */}
                    {!awarded && (
                      <tr>
                        <td className="py-3 px-4 font-bold text-slate-500 bg-slate-50/40">
                          Buyer Action
                        </td>
                        {analysis.quotes.map((q) => (
                          <td
                            key={q.id}
                            className={`py-3 px-4 ${selectedQuote === q.id ? "bg-blue-50/30 border-x border-[#0B1457]/10" : ""}`}
                          >
                            <Button
                              type="button"
                              size="sm"
                              variant={selectedQuote === q.id ? "default" : "outline"}
                              className={`h-8 text-xs font-semibold cursor-pointer w-full ${
                                selectedQuote === q.id
                                  ? "bg-[#0B1457] hover:bg-[#0001FF] text-white"
                                  : "border-slate-200 text-slate-700 hover:bg-slate-50"
                              }`}
                              onClick={() => {
                                setSelectedQuote(q.id);
                                setSettlementCurrency(q.currency);
                              }}
                            >
                              {selectedQuote === q.id ? (
                                <>
                                  <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-400" />
                                  Selected
                                </>
                              ) : (
                                "Select Quote"
                              )}
                            </Button>
                          </td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Tab Content 2: Price Per Item Breakdown */}
          {comparisonTab === "LINE_ITEMS" && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  Line-Item Unit Price Comparison
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  The lowest unit price for each requested item across all competing suppliers is visually flagged with the lowest price badge.
                </p>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[750px] text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3.5 text-left font-bold uppercase text-[10px] tracking-wider">
                        Requisition Line Item
                      </th>
                      {analysis.quotes.map((q) => (
                        <th key={q.id} className="py-2.5 px-3.5 text-left font-bold text-slate-900">
                          {q.supplierName}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analysis.lineItems.map((row) => (
                      <tr key={row.key} className="hover:bg-slate-50/50">
                        <td className="py-3 px-3.5">
                          <p className="font-semibold text-slate-900">{row.description}</p>
                          <p className="text-[10px] text-slate-400">
                            Quantity: {row.quantity} {row.unit}
                          </p>
                        </td>
                        {analysis.quotes.map((q) => {
                          const cell = row.byQuote[q.id];
                          if (!cell) {
                            return (
                              <td key={q.id} className="py-3 px-3.5 text-slate-400 italic">
                                Not quoted
                              </td>
                            );
                          }
                          return (
                            <td key={q.id} className="py-3 px-3.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold tabular-nums text-slate-900">
                                  {money(cell.unitPrice, cell.currency)}
                                </span>
                                {cell.isLowestPrice && (
                                  <span className="rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.2 text-[9px] font-black uppercase">
                                    Lowest
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                Line Total: {money(cell.extendedPrice, cell.currency)} · VAT {cell.vatRate}%
                              </p>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {/* Summary Row */}
                    <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
                      <td className="py-3 px-3.5 uppercase text-[10px] tracking-wider text-slate-500">
                        Total Landed Cost (Subtotal + VAT + Delivery)
                      </td>
                      {analysis.quotes.map((q) => (
                        <td key={q.id} className="py-3 px-3.5 text-sm font-black tabular-nums text-[#0B1457]">
                          {money(q.totalLandedCost, q.currency)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Buyer Final Award & PO Issuance Console */}
          {selectedQuote && !awarded && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  Buyer Award Selection &amp; Purchase Order Generation
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  The system highlights the best commercial option, but the buyer makes the final selection. The PO records the currency and delivery site address.
                </p>
              </div>

              {/* Mandatory Override Justification when picking non-recommended quote */}
              {isOverride && (
                <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-amber-950">
                        Commercial Override: Written Justification Required (§FR-4.5, §FR-8.5)
                      </p>
                      <p className="text-[11px] text-amber-800 leading-relaxed mt-0.5">
                        You have selected a quote other than the algorithmically recommended best bid (<strong>{analysis.recommendedSupplierName}</strong>). A permanent written justification is required for the corporate governance and forensic audit log before a PO can be issued.
                      </p>
                    </div>
                  </div>
                  <Textarea
                    className="bg-white text-xs border-amber-300 placeholder:text-slate-400 resize-none mt-1"
                    rows={2}
                    placeholder="e.g. Chosen supplier has crane offloading equipment required for Lekki Tower A, whereas recommended bid requires manual labor."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-3 text-xs">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    Settlement Currency
                  </Label>
                  <Select
                    value={settlementCurrency}
                    onValueChange={(v) => setSettlementCurrency(v as "NGN" | "USD")}
                  >
                    <SelectTrigger className="h-10 text-xs bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NGN">NGN — Settle in Naira</SelectItem>
                      <SelectItem value="USD">USD — Settle in Dollars</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="fx" className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    FX Note (Optional)
                  </Label>
                  <Input
                    id="fx"
                    className="h-10 text-xs bg-white"
                    placeholder="e.g. Settle at CBN official window rate"
                    value={fxNote}
                    onChange={(e) => setFxNote(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="address" className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    Site Delivery Address
                  </Label>
                  <Input
                    id="address"
                    className="h-10 text-xs bg-white"
                    placeholder={`e.g. ${projectLocation}`}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  Selected Supplier: <strong className="text-slate-900">{analysis.quotes.find((q) => q.id === selectedQuote)?.supplierName}</strong>
                </p>
                <Button
                  type="button"
                  size="lg"
                  className="h-11 px-6 bg-[#0B1457] hover:bg-[#0001FF] text-white font-bold text-xs cursor-pointer shadow-xs"
                  disabled={award.isPending || (isOverride && !reason.trim())}
                  onClick={() => award.mutate()}
                >
                  {award.isPending ? "Generating Official PO…" : "Issue Official Purchase Order"}
                </Button>
              </div>
            </section>
          )}
        </>
      )}

      {/* Tab Content 3: Digital RFQ Distribution Console */}
      <InvitedSuppliers rfqId={id} />
    </div>
  );
}

const INVITE_STATUS: Record<string, { label: string; className: string }> = {
  quote_submitted: { label: "Quote Submitted", className: "bg-emerald-100 text-emerald-800" },
  viewed: { label: "Link Viewed", className: "bg-blue-100 text-blue-800" },
  link_sent: { label: "Link Dispatched", className: "bg-slate-100 text-slate-700" },
  no_response: { label: "No Response", className: "bg-rose-100 text-rose-800" },
};

/** Invited suppliers with their live status and a link they can always re-share. */
function InvitedSuppliers({ rfqId }: { rfqId: string }) {
  const { data } = useQuery({
    queryKey: ["rfq-invitations", rfqId],
    queryFn: () => rfqInvitationLinksFn({ data: { rfqId } }),
  });

  const [busy, setBusy] = useState<string | null>(null);

  async function copyLink(token: string) {
    const url = `${window.location.origin}/quote/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Secure quote link copied to clipboard.");
    } catch {
      window.prompt("Copy this supplier link", url);
    }
  }

  async function resend(invitationId: string) {
    setBusy(invitationId);
    try {
      const r = await resendRfqInvitationFn({
        data: { invitationId, baseUrl: window.location.origin },
      });
      window.location.href = `mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent(
        r.subject,
      )}&body=${encodeURIComponent(r.body)}`;
      toast.success(`Invitation re-dispatched to ${r.supplierName}. Prior entered data preserved.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't resend that link.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900 tracking-tight">
            Digital RFQ Supplier Distribution (§FR-3)
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 font-normal">
            Suppliers do not need a paid account or password. They receive a secure link to submit unit prices, 7.5% VAT, delivery charges, timelines, payment terms, and warranty files.
          </p>
        </div>
      </div>

      <ul className="divide-y divide-slate-100 border-t border-slate-100">
        {(data?.invitations ?? []).map((invite) => {
          const key =
            invite.status === "link_sent" && invite.expired ? "no_response" : invite.status;
          const badge = INVITE_STATUS[key] ?? INVITE_STATUS["link_sent"]!;
          return (
            <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
              <div className="min-w-40 flex-1">
                <p className="font-bold text-slate-900">{invite.supplierName}</p>
                <p className="text-slate-500 mt-0.5 text-[11px]">
                  {invite.supplierEmail ?? "no email on file"} · link expires{" "}
                  <strong className="text-slate-700 font-medium">{shortDate(invite.expiresAt)}</strong>
                  {invite.openedAt ? ` · opened ${dateTime(invite.openedAt)}` : ""}
                </p>
              </div>
              <span
                className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${badge.className}`}
              >
                {badge.label}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  onClick={() => copyLink(invite.token)}
                  aria-label={`Copy quote link for ${invite.supplierName}`}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Copy Secure Link
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-lg text-xs font-semibold text-[#0B1457] hover:bg-blue-50 cursor-pointer"
                  disabled={busy === invite.id || !invite.supplierEmail}
                  onClick={() => resend(invite.id)}
                  aria-label={`Resend quote link to ${invite.supplierName}`}
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  {busy === invite.id ? "Sending…" : "Email Supplier"}
                </Button>
              </div>
            </li>
          );
        })}
        {!data?.invitations.length ? (
          <li className="py-4 text-xs text-slate-400 text-center">No suppliers invited to this RFQ yet.</li>
        ) : null}
      </ul>
    </section>
  );
}
