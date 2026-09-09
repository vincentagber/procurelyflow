import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { money, dateTime } from "@/lib/format";
import { PageHeader, StatusPill, EmptyState } from "@/components/procurely/bits";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence, itemFadeIn, staggerContainer } from "@/components/ui/animated";

export const Route = createFileRoute("/_authenticated/purchase-orders/")({
  head: () => ({
    meta: [
      { title: "Purchase orders — Procurely Flow" },
      {
        name: "description",
        content:
          "Every issued purchase order with its supplier, settlement currency and selection reasoning.",
      },
      { property: "og:title", content: "Purchase orders — Procurely Flow" },
      { property: "og:description", content: "Issued POs and their audit context." },
    ],
  }),
  component: PurchaseOrders,
});

function PurchaseOrders() {
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
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="space-y-6 pb-12"
    >
      <motion.div variants={itemFadeIn}>
        <PageHeader
          title="Purchase orders"
          subtitle="What you've committed to, and why that supplier was chosen."
        />
      </motion.div>

      {isLoading ? (
        <p className="p-5 text-sm text-muted-foreground">Loading purchase orders…</p>
      ) : !data?.length ? (
        <EmptyState
          title="No purchase orders yet"
          body="Award a supplier quote and the purchase order is created here automatically, with its line items and settlement currency."
          action={
            <Button asChild className="h-11">
              <Link to="/rfqs">Go to RFQs</Link>
            </Button>
          }
        />
      ) : (
        <motion.div variants={staggerContainer} className="space-y-3">
          {data.map((po) => {
            const isOpen = openId === po.id;
            return (
              <motion.article
                key={po.id}
                variants={itemFadeIn}
                whileHover={{ y: -1 }}
                transition={{ duration: 0.18 }}
                className="rounded-2xl border border-slate-200 bg-white shadow-xs hover:border-slate-300 transition-all overflow-hidden"
              >
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left cursor-pointer"
                  onClick={() => setOpenId(isOpen ? null : po.id)}
                >
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
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-sans text-xl font-semibold tabular-nums text-slate-900 tracking-tight">
                        {money(po.total_amount, po.settlement_currency)}
                      </p>
                      <p className="text-[11px] text-slate-400 font-normal">
                        Settles in {po.settlement_currency}
                      </p>
                    </div>
                    <StatusPill status={po.status} />
                  </div>
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                      className="border-t border-slate-200 px-5 py-4 bg-slate-50/60 overflow-hidden"
                    >
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
                          <Link to="/purchase-orders/$id" params={{ id: po.id }}>
                            Open Purchase Order
                          </Link>
                        </Button>
                        {po.requisitions ? (
                          <Button asChild variant="outline" className="h-9 px-4 rounded-lg border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50">
                            <Link
                              to="/requisitions/$id"
                              params={{
                                id: (po.requisitions as { id: string }).id,
                              }}
                            >
                              View Request {(po.requisitions as { reference: string }).reference} →
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.article>
            );
          })}
        </motion.div>
      )}
    </motion.div>
  );
}
