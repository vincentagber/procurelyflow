import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { money, dateTime } from "@/lib/format";
import { PageHeader, StatusPill, EmptyState } from "@/components/procurely/bits";
import { Button } from "@/components/ui/button";

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
    <div className="space-y-5 pb-10">
      <PageHeader
        title="Purchase orders"
        subtitle="What you've committed to, and why that supplier was chosen."
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading purchase orders…</p>
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
        <div className="space-y-3">
          {data.map((po) => {
            const isOpen = openId === po.id;
            return (
              <article key={po.id} className="rounded-lg border border-border bg-card">
                <button
                  className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-4 text-left"
                  onClick={() => setOpenId(isOpen ? null : po.id)}
                >
                  <div>
                    <p className="font-mono text-sm font-semibold">{po.po_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {(po.suppliers as { name: string } | null)?.name ?? "Supplier"} · issued{" "}
                      {dateTime(po.issued_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-display text-2xl leading-none">
                        {money(po.total_amount, po.settlement_currency)}
                      </p>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        settles in {po.settlement_currency}
                      </p>
                    </div>
                    <StatusPill status={po.status} />
                  </div>
                </button>

                {isOpen ? (
                  <div className="border-t border-border px-4 py-4">
                    {po.override_reason ? (
                      <div className="mb-3 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
                        <p className="font-medium">Recommendation overridden</p>
                        <p className="text-muted-foreground">{po.override_reason}</p>
                      </div>
                    ) : (
                      <p className="mb-3 text-sm text-muted-foreground">
                        Recommended lowest compliant bid was selected.
                      </p>
                    )}
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left">
                          <th className="py-1.5 data-label">Item</th>
                          <th className="py-1.5 data-label">Qty</th>
                          <th className="py-1.5 data-label">Unit price</th>
                          <th className="py-1.5 data-label">Line currency</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(
                          po.po_line_items as {
                            id: string;
                            description: string;
                            quantity: number;
                            unit_price: number;
                            currency: "NGN" | "USD";
                          }[]
                        ).map((line) => (
                          <tr key={line.id} className="border-t border-border">
                            <td className="py-2">{line.description}</td>
                            <td className="py-2 tabular-nums">{Number(line.quantity)}</td>
                            <td className="py-2 tabular-nums">
                              {money(line.unit_price, line.currency)}
                            </td>
                            <td className="py-2">{line.currency}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {po.delivery_address ? (
                      <p className="mt-3 text-sm text-muted-foreground">
                        Deliver to: {po.delivery_address}
                      </p>
                    ) : null}
                    {po.fx_rate_note ? (
                      <p className="text-sm text-muted-foreground">FX: {po.fx_rate_note}</p>
                    ) : null}
                    <div className="mt-3">
                      <Button asChild variant="outline" className="h-10">
                        <Link to="/purchase-orders/$id" params={{ id: po.id }}>
                          Open purchase order
                        </Link>
                      </Button>
                    </div>
                    {po.requisitions ? (
                      <Link
                        to="/requisitions/$id"
                        params={{ id: (po.requisitions as { id: string }).id }}
                        className="mt-3 inline-block text-sm text-accent underline-offset-4 hover:underline"
                      >
                        View originating request{" "}
                        {(po.requisitions as { reference: string }).reference}
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
