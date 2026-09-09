import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";

import { purchaseOrderDetailFn } from "@/lib/procurement.functions";
import { money, shortDate, dateTime, ROLE_LABELS } from "@/lib/format";
import { StatusPill } from "@/components/procurely/bits";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/purchase-orders/$id")({
  head: () => ({
    meta: [
      { title: "Purchase order — Procurely Flow" },
      {
        name: "description",
        content:
          "The full purchase order: supplier and buyer details, priced line items, settlement currency, delivery terms and the approval history behind it.",
      },
      { property: "og:title", content: "Purchase order — Procurely Flow" },
      {
        property: "og:description",
        content: "Branded purchase order with pricing, terms and approval trail.",
      },
    ],
  }),
  component: PurchaseOrderDocument,
});

function PurchaseOrderDocument() {
  const { id } = Route.useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ["purchase-order", id],
    queryFn: () => purchaseOrderDetailFn({ data: { purchaseOrderId: id } }),
    retry: false,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading purchase order…</p>;
  if (error || !data)
    return <p className="text-sm text-muted-foreground">This purchase order isn't available.</p>;

  const { po, buyer, supplier, lines, quote, requisition, project, approvals } = data;
  const currency = po.settlement_currency as "NGN" | "USD";

  return (
    <div className="space-y-4 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button asChild variant="outline" className="h-11">
          <Link to="/purchase-orders">All purchase orders</Link>
        </Button>
        <Button variant="outline" className="h-11" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" /> Print / save as PDF
        </Button>
      </div>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        {/* Branded header */}
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
              <span className="text-xs text-slate-500">
                Acknowledged by {po.acknowledged_by_name} on {dateTime(po.acknowledged_at)}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                Awaiting supplier acknowledgement on their quoting link
              </span>
            )}
          </div>

          {/* Parties */}
          <div className="grid gap-4 sm:grid-cols-2">
            <section className="rounded-lg border border-border p-4">
              <p className="data-label">Supplier</p>
              <p className="mt-1 font-medium">{supplier?.name ?? "Supplier"}</p>
              <p className="text-sm text-muted-foreground">
                {supplier?.contact_name ?? "—"}
                {supplier?.email ? ` · ${supplier.email}` : ""}
                {supplier?.phone ? ` · ${supplier.phone}` : ""}
              </p>
              {supplier?.tax_id ? (
                <p className="text-xs text-muted-foreground">TIN {supplier.tax_id}</p>
              ) : null}
            </section>
            <section className="rounded-lg border border-border p-4">
              <p className="data-label">Buyer</p>
              <p className="mt-1 font-medium">{buyer.name}</p>
              {project ? (
                <p className="text-sm text-muted-foreground">
                  Project / cost center: {project.name}
                  {project.location ? ` — ${project.location}` : ""}
                </p>
              ) : null}
              {requisition ? (
                <p className="text-xs text-muted-foreground">
                  Raised by {requisition.requesterName ?? "requester"} · needed by{" "}
                  {shortDate(requisition.needed_by)}
                </p>
              ) : null}
            </section>
          </div>

          {/* Line items */}
          <section>
            <p className="data-label">Line items</p>
            <div className="mt-2 overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-surface">
                  <tr className="text-left">
                    <th className="px-3 py-2 data-label">Description</th>
                    <th className="px-3 py-2 data-label">Qty</th>
                    <th className="px-3 py-2 data-label">Unit price</th>
                    <th className="px-3 py-2 data-label">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id} className="border-t border-border">
                      <td className="px-3 py-2.5">{line.description}</td>
                      <td className="px-3 py-2.5 tabular-nums">{Number(line.quantity)}</td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {money(line.unit_price, line.currency as "NGN" | "USD")}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {money(
                          Number(line.quantity) * Number(line.unit_price),
                          line.currency as "NGN" | "USD",
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 space-y-1.5 rounded-lg border border-border bg-surface p-4 text-sm">
              {quote ? (
                <>
                  <Row
                    label="Items subtotal"
                    value={money(quote.subtotal, quote.currency as "NGN" | "USD")}
                  />
                  <Row
                    label="VAT"
                    value={money(quote.vat_amount, quote.currency as "NGN" | "USD")}
                  />
                  <Row
                    label="Delivery"
                    value={money(quote.delivery_charge, quote.currency as "NGN" | "USD")}
                  />
                </>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
                <span className="data-label">Total payable ({currency})</span>
                <span className="font-sans text-2xl font-bold tabular-nums text-slate-900">{money(po.total_amount, currency)}</span>
              </div>
              {po.fx_rate_note ? (
                <p className="text-xs text-muted-foreground">FX basis: {po.fx_rate_note}</p>
              ) : null}
            </div>
          </section>

          {/* Terms */}
          <div className="grid gap-4 sm:grid-cols-2">
            <section className="rounded-lg border border-border p-4">
              <p className="data-label">Payment & warranty</p>
              <p className="mt-1 text-sm">{quote?.payment_terms ?? "As agreed"}</p>
              {quote?.warranty_note ? (
                <p className="mt-1 text-sm text-muted-foreground">{quote.warranty_note}</p>
              ) : null}
              {quote?.validity_days ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Quoted price valid {quote.validity_days} days
                </p>
              ) : null}
            </section>
            <section className="rounded-lg border border-border p-4">
              <p className="data-label">Delivery</p>
              <p className="mt-1 text-sm">{po.delivery_address ?? "To be confirmed with buyer"}</p>
              {quote?.lead_time_days ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Lead time {quote.lead_time_days} days from acknowledgement
                </p>
              ) : null}
            </section>
          </div>

          {po.override_reason ? (
            <section className="rounded-lg border border-warning/50 bg-warning/10 p-4">
              <p className="text-sm font-medium">Recommendation overridden</p>
              <p className="text-sm text-muted-foreground">{po.override_reason}</p>
            </section>
          ) : null}

          {/* Approval history */}
          <section>
            <p className="data-label">
              Approval history{requisition ? ` — ${requisition.reference}` : ""}
            </p>
            <ol className="mt-2 space-y-2">
              {approvals.map((step) => (
                <li
                  key={step.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5 text-sm"
                >
                  <span>
                    <span className="font-medium">
                      {ROLE_LABELS[step.required_role] ?? step.required_role}
                    </span>
                    {step.deciderName ? (
                      <span className="text-muted-foreground"> · {step.deciderName}</span>
                    ) : null}
                    {step.comment ? (
                      <span className="block text-xs text-muted-foreground">"{step.comment}"</span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {step.decided_at ? dateTime(step.decided_at) : "—"}
                    </span>
                    <StatusPill status={step.status} />
                  </span>
                </li>
              ))}
              {!approvals.length ? (
                <li className="text-sm text-muted-foreground">No approval steps recorded.</li>
              ) : null}
            </ol>
          </section>

          {/* Acknowledgement block */}
          <section className="rounded-lg border border-dashed border-border p-4">
            <p className="data-label">Supplier acknowledgement</p>
            {po.acknowledged_at ? (
              <p className="mt-1 text-sm">
                Digitally acknowledged by{" "}
                <span className="font-medium">{po.acknowledged_by_name}</span> on{" "}
                {dateTime(po.acknowledged_at)}.
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                The supplier acknowledges this order on the same quoting link they used to bid — no
                login, no paperwork. It will be timestamped here.
              </p>
            )}
          </section>
        </div>
      </article>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="data-label">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
