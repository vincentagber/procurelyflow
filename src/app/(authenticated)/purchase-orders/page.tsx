"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";

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
        title="Purchase orders"
        subtitle="Legally binding orders issued to verified suppliers."
      />

      {isLoading ? (
        <p className="text-xs text-[#6B7280]">Loading purchase orders…</p>
      ) : !data?.length ? (
        <EmptyState
          title="No purchase orders yet"
          body="Award a supplier quote and the purchase order is created here automatically, with its line items and settlement currency."
          action={
            <Button asChild className="h-10 bg-[#111315] text-xs font-semibold text-white">
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
                className="rounded-xl border border-[#E5E7EB] bg-white shadow-xs"
              >
                <div className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <Link
                      href={`/purchase-orders/${po.id}`}
                      className="font-mono text-sm font-bold text-[#111315] hover:underline"
                    >
                      {po.po_number}
                    </Link>
                    <p className="text-xs text-[#6B7280]">
                      {(po.suppliers as { name: string } | null)?.name ?? "Supplier"} · issued{" "}
                      {dateTime(po.issued_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-sans text-lg font-extrabold text-[#111315]">
                        {money(po.total_amount, po.settlement_currency)}
                      </p>
                      <p className="text-[10px] uppercase tracking-wide text-[#9CA3AF]">
                        settles in {po.settlement_currency}
                      </p>
                    </div>
                    <StatusPill status={po.status} />
                    <Button asChild variant="outline" className="h-9 px-3 text-xs font-semibold">
                      <Link href={`/purchase-orders/${po.id}`}>
                        <Eye className="mr-1 h-3.5 w-3.5" /> View Branded PO
                      </Link>
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
