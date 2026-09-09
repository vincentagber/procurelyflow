"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";

import { purchaseOrderDetailFn } from "@/lib/procurement.functions";
import { money, shortDate, dateTime, ROLE_LABELS } from "@/lib/format";
import { StatusPill } from "@/components/procurely/bits";
import { Button } from "@/components/ui/button";

export default function PurchaseOrderDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ["purchase-order", id],
    queryFn: () => purchaseOrderDetailFn({ data: { purchaseOrderId: id } }),
    retry: false,
  });

  if (isLoading) return <p className="text-sm text-[#6B7280]">Loading purchase order…</p>;
  if (error || !data)
    return <p className="text-sm text-[#6B7280]">This purchase order isn't available.</p>;

  const { po, buyer, supplier, lines, quote, requisition, project, approvals } = data;
  const currency = po.settlement_currency as "NGN" | "USD";

  return (
    <div className="space-y-4 pb-12 font-sans">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button asChild variant="outline" className="h-10">
          <Link href="/purchase-orders">All purchase orders</Link>
        </Button>
        <Button variant="outline" className="h-10" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" /> Print / Save PDF
        </Button>
      </div>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        {/* Branded Header */}
        <header className="bg-[#0B1457] px-6 py-6 text-white sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                {buyer.name}
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-1">Purchase Order</h1>
              <p className="mt-1 font-mono text-sm text-slate-300 tabular-nums">{po.po_number}</p>
            </div>
            <div className="text-right">
              <p className="font-sans text-2xl sm:text-3xl font-bold tabular-nums text-white">
                {money(po.total_amount, currency)}
              </p>
              <p className="mt-1 text-[11px] uppercase tracking-wider text-slate-300">
                Settlement Currency: {currency}
              </p>
              <p className="mt-1.5 text-xs text-slate-300">Issued {dateTime(po.issued_at)}</p>
            </div>
          </div>
        </header>

        <div className="space-y-6 px-6 py-6 sm:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill status={po.status} />
            {po.acknowledged_at ? (
              <span className="text-xs text-[#6B7280]">
                Acknowledged by {po.acknowledged_by_name} on {dateTime(po.acknowledged_at)}
              </span>
            ) : (
              <span className="text-xs text-[#6B7280]">
                Awaiting supplier digital acknowledgement
              </span>
            )}
          </div>

          {/* Parties Grid */}
          <div className="grid gap-4 sm:grid-cols-2">
            <section className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                Supplier
              </p>
              <p className="mt-1 font-bold text-sm text-[#111315]">
                {supplier?.name ?? "Supplier"}
              </p>
              <p className="text-xs text-[#6B7280]">
                {supplier?.contact_name ?? "—"}
                {supplier?.email ? ` · ${supplier.email}` : ""}
              </p>
            </section>

            <section className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                Delivery & Project
              </p>
              <p className="mt-1 font-bold text-sm text-[#111315]">
                {project?.name ?? "Active Site"}
              </p>
              <p className="text-xs text-[#6B7280]">
                {po.delivery_address || "Standard site address"}
              </p>
            </section>
          </div>

          {/* Line Items */}
          <div className="overflow-x-auto rounded-lg border border-[#E5E7EB]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F9FAFB] text-[11px] font-semibold text-[#6B7280]">
                <tr>
                  <th className="px-3 py-2.5">Item</th>
                  <th className="px-3 py-2.5">Quantity</th>
                  <th className="px-3 py-2.5">Unit Price ({currency})</th>
                  <th className="px-3 py-2.5 text-right">Line Total ({currency})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-3 font-medium text-[#111315]">{l.description}</td>
                    <td className="px-3 py-3">{l.quantity}</td>
                    <td className="px-3 py-3 tabular-nums">{money(l.unit_price, currency)}</td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums text-[#111315]">
                      {money(Number(l.quantity) * Number(l.unit_price), currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Approval Trail */}
          <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#111315]">
              Approval Audit Trail
            </h3>
            <ul className="mt-2 space-y-1.5 text-xs text-[#6B7280]">
              {approvals.map((a, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="font-bold text-[#111315]">
                    {ROLE_LABELS[a.required_role] ?? a.required_role}:
                  </span>
                  <span>{a.status}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </article>
    </div>
  );
}
