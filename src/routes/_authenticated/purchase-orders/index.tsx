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
                whileHover={{ y: -2 }}
                transition={{ duration: 0.18 }}
                className="rounded-xl border border-border bg-card shadow-xs hover:border-border/80 transition-shadow overflow-hidden"
              >
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left cursor-pointer"
                  onClick={() => setOpenId(isOpen ? null : po.id)}
                >
                  <div>
                    <p className="font-mono text-sm font-bold text-accent">{po.po_number}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {(po.suppliers as { name: string } | null)?.name ?? "Supplier"} · issued{" "}
                      {dateTime(po.issued_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-display text-2xl font-bold tracking-tight">
                        {money(po.total_amount, po.settlement_currency)}
                      </p>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        settles in {po.settlement_currency}
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
                      className="border-t border-border px-5 py-4 bg-surface/40 overflow-hidden"
                    >
                      {po.override_reason ? (
                        <div className="mb-3 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">
                          <p className="font-semibold text-warning-foreground">Recommendation overridden</p>
                          <p className="text-muted-foreground mt-0.5">{po.override_reason}</p>
                        </div>
                      ) : (
                        <p className="mb-3 text-xs text-muted-foreground">
                          Awarded to lowest compliant quote per selection recommendation.
                        </p>
                      )}

                      <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-card">
                        <table className="w-full text-xs">
                          <thead className="bg-surface">
                            <tr className="text-left font-semibold text-muted-foreground">
                              <th className="px-3 py-2">Item</th>
                              <th className="px-3 py-2 text-right">Qty</th>
                              <th className="px-3 py-2 text-right">Unit price</th>
                              <th className="px-3 py-2 text-right">Line total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
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
                              <tr key={line.id} className="hover:bg-surface/50">
                                <td className="px-3 py-2.5 font-medium">{line.description}</td>
                                <td className="px-3 py-2.5 text-right font-mono tabular-nums">{line.quantity}</td>
                                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                                  {money(line.unit_price, line.currency as "NGN" | "USD")}
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums">
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
                        <Button asChild size="sm" className="text-xs">
                          <Link to="/purchase-orders/$id" params={{ id: po.id }}>
                            Open purchase order
                          </Link>
                        </Button>
                        {po.requisitions ? (
                          <Button asChild size="sm" variant="outline" className="text-xs">
                            <Link
                              to="/requisitions/$id"
                              params={{
                                id: (po.requisitions as { id: string }).id,
                              }}
                            >
                              View request {(po.requisitions as { reference: string }).reference} →
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
