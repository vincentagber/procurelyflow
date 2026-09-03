"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Award, Copy, Paperclip, Send } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { awardQuoteFn, getRecommendedQuote } from "@/lib/procurement.functions";
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

export default function RfqDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  const router = useRouter();
  const queryClient = useQueryClient();

  const [selectedQuote, setSelectedQuote] = useState<string>("");
  const [settlementCurrency, setSettlementCurrency] = useState<"NGN" | "USD">("NGN");
  const [reason, setReason] = useState("");
  const [address, setAddress] = useState("");
  const [fxNote, setFxNote] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["rfq", id],
    queryFn: async () => {
      const [rfq, quotes, invites] = await Promise.all([
        supabase
          .from("rfqs")
          .select("*, requisitions(id, reference, title)")
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("quotes")
          .select(
            "*, suppliers(id, name, is_compliant, rating), quote_items(id, requisition_item_id, description, quantity, unit_price, vat_rate, vat_amount, currency)",
          )
          .eq("rfq_id", id)
          .order("total_amount", { ascending: true }),
        supabase
          .from("rfq_invitations")
          .select("id, expires_at, opened_at, suppliers(name)")
          .eq("rfq_id", id),
      ]);
      return { rfq: rfq.data, quotes: quotes.data ?? [], invites: invites.data ?? [] };
    },
  });

  const { data: recommended } = useQuery({
    queryKey: ["recommendation", id],
    queryFn: () => getRecommendedQuote({ data: { rfqId: id } }),
  });

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
      toast.success(`${result.poNumber} issued to the supplier.`);
      await queryClient.invalidateQueries();
      router.push(`/purchase-orders/${(result as any).purchaseOrderId || (result as any).poId}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't award this quote."),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading comparison…</p>;
  const rfq = data?.rfq;
  if (!rfq) return <p className="text-sm text-muted-foreground">This RFQ doesn't exist.</p>;

  const quotes = data?.quotes ?? [];

  return (
    <div className="space-y-5 pb-12 font-sans">
      <PageHeader
        title={rfq.title}
        subtitle={`${rfq.reference} · Closes ${shortDate(rfq.closes_at)}`}
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" className="h-10">
              <Link href={`/requisitions/${rfq.requisition_id}`}>View Requisition</Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {/* Quotes Side-by-Side Matrix */}
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-xs">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#111315]">
              Supplier Quotes Received ({quotes.length})
            </h2>

            {!quotes.length ? (
              <p className="mt-3 text-xs text-[#6B7280]">
                No quotes have been submitted yet. Suppliers access their private links via WhatsApp
                or email.
              </p>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {quotes.map((q) => {
                  const isRec = (recommended as any)?.quoteId === q.id || (recommended as any)?.recommendedQuoteId === q.id;
                  const isSelected = selectedQuote === q.id;
                  return (
                    <div
                      key={q.id}
                      onClick={() => setSelectedQuote(q.id)}
                      className={`cursor-pointer rounded-xl border p-4 transition-all ${
                        isSelected
                          ? "border-[#111315] bg-[#F9FAFB] ring-1 ring-[#111315]"
                          : "border-[#E5E7EB] bg-white hover:border-[#9CA3AF]"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-bold text-xs text-[#111315]">
                            {(q.suppliers as { name?: string })?.name ?? "Supplier"}
                          </p>
                          <p className="mt-1 font-mono text-base font-extrabold text-[#111315]">
                            {money(q.total_amount, q.currency)}
                          </p>
                        </div>
                        {isRec ? (
                          <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 uppercase">
                            Recommended
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 border-t border-[#F3F4F6] pt-2 text-[11px] text-[#6B7280]">
                        <p>Lead time: {q.lead_time_days ?? "—"} days</p>
                        <p>Valid until: {shortDate((q as any).validity_date || (q as any).valid_until)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* PO Award Form */}
        <div className="space-y-4">
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#111315]">
              Award Purchase Order
            </h3>
            <p className="mt-1 text-xs text-[#6B7280]">
              Select a quote from the left to issue a legally binding PO.
            </p>

            <div className="mt-4 space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Settlement Currency</Label>
                <Select
                  value={settlementCurrency}
                  onValueChange={(v) => setSettlementCurrency(v as "NGN" | "USD")}
                >
                  <SelectTrigger className="h-10 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NGN">NGN (₦)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Delivery Address</Label>
                <Input
                  placeholder="Site delivery address..."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="h-10 text-xs"
                />
              </div>

              <Button
                disabled={!selectedQuote || award.isPending}
                onClick={() => award.mutate()}
                className="mt-2 w-full bg-[#111315] text-xs font-semibold text-white hover:bg-[#202428]"
              >
                <Award className="mr-1.5 h-3.5 w-3.5" /> Issue Purchase Order
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
