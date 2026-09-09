"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, ChevronDown, ChevronUp } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { money, dateTime } from "@/lib/format";
import { PageHeader, StatusPill, EmptyState } from "@/components/procurely/bits";
import { Button } from "@/components/ui/button";

export default function PurchaseOrdersPage() {
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(
          "*, suppliers(name), requisitions(id, reference), po_line_items(id, description, quantity, unit_price, currency)",
        )
        .order("issued_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-5 pb-10 font-sans">
      <PageHeader
        title="Purchase Orders"
        subtitle="Legally binding orders issued to verified suppliers."
      />

      {isLoading ? (
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white/60" />
          <div className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white/60" />
        </div>
      ) : !data?.length ? (
        <EmptyState
          title="No purchase orders yet"
          body="Award a supplier quote and the purchase order is created here automatically, with its line items and settlement currency."
          action={
            <Button asChild className="h-9 px-4 rounded-lg bg-[#0B1457] hover:bg-[#0001FF] text-white font-medium text-xs shadow-xs">
              <Link href="/rfqs">Go to RFQs</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {data.map((po) => {
            const isOpen = openId === po.id;
            return (
              <article
                key={po.id}
                className="rounded-2xl border border-slate-200 bg-white shadow-xs hover:border-slate-300 transition-all overflow-hidden"
              >
                <div className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="space-y-1">
                    <span className="inline-flex items-center rounded-md bg-slate-100 border border-slate-200/80 px-2 py-0.5 text-xs font-semibold tabular-nums text-[#0B1457]">
                      {po.po_number}
                    </span>
                    <p className="text-xs text-slate-500 font-normal">
                      <strong className="font-semibold text-slate-800">
                        {(po.suppliers as { name: string } | null)?.name ?? "Supplier"}
                      </strong>{" "}
                      · Issued {dateTime(po.issued_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-sans text-xl font-semibold tabular-nums text-slate-900 tracking-tight">
                        {money(po.total_amount, po.settlement_currency)}
                      </p>
                      <p className="text-[11px] text-slate-400 font-normal">
                        Settles in {po.settlement_currency}
                      </p>
                    </div>
                    <StatusPill status={po.status} />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600"
                      onClick={() => setOpenId(isOpen ? null : po.id)}
                    >
                      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                    <Button asChild className="h-9 px-3.5 rounded-lg bg-[#0B1457] hover:bg-[#0001FF] text-white font-medium text-xs shadow-xs">
                      <Link href={`/purchase-orders/${po.id}`}>
                        <Eye className="mr-1.5 h-3.5 w-3.5" /> View Branded PO
                      </Link>
                    </Button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-slate-200 px-5 py-4 bg-slate-50/60 overflow-hidden">
                    {po.override_reason ? (
                      <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs">
                        <p className="font-semibold text-amber-900">Recommendation Overridden</p>
                        <p className="text-amber-700 mt-0.5">{po.override_reason}</p>
                      </div>
                    ) : (
                      <p className="mb-3 text-xs text-slate-500">
                        Awarded to lowest compliant quote per selection recommendation.
                      </p>
                    )}

                    <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-medium">
                          <tr className="text-left">
                            <th className="px-4 py-2.5">Item</th>
                            <th className="px-4 py-2.5 text-right">Qty</th>
                            <th className="px-4 py-2.5 text-right">Unit Price</th>
                            <th className="px-4 py-2.5 text-right">Line Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(
                            (po.po_line_items as
                              | Array<{
                                  id: string;
                                  description: string;
                                  quantity: number;
                                  unit_price: number;
                                  currency: string;
                                }>
                              | undefined) ?? []
                          ).map((line) => (
                            <tr key={line.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-3 font-medium text-slate-800">{line.description}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-slate-600">{line.quantity}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                                {money(line.unit_price, line.currency as "NGN" | "USD")}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                                {money(
                                  line.quantity * line.unit_price,
                                  line.currency as "NGN" | "USD",
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <Button asChild className="h-9 px-4 rounded-lg bg-[#0B1457] hover:bg-[#0001FF] text-white font-medium text-xs shadow-xs">
                        <Link href={`/purchase-orders/${po.id}`}>
                          Open Purchase Order
                        </Link>
                      </Button>
                      {po.requisitions ? (
                        <Button asChild variant="outline" className="h-9 px-4 rounded-lg border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50">
                          <Link
                            href={`/requisitions/${(po.requisitions as { id: string }).id}`}
                          >
                            View Request {(po.requisitions as { reference: string }).reference} →
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
