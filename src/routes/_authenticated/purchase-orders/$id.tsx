import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Printer,
  FileEdit,
  History,
  Plus,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";

import {
  purchaseOrderDetailFn,
  createPoChangeOrderFn,
  getPoChangeOrdersFn,
} from "@/lib/procurement.functions";
import { money, shortDate, dateTime, ROLE_LABELS } from "@/lib/format";
import { StatusPill } from "@/components/procurely/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useMe, can } from "@/lib/useMe";

export const Route = createFileRoute("/_authenticated/purchase-orders/$id")({
  head: () => ({
    meta: [
      { title: "Purchase order — Procurely Flow" },
      {
        name: "description",
        content:
          "The full purchase order: supplier and buyer details, priced line items, settlement currency, delivery terms, change orders, and the approval history behind it.",
      },
      { property: "og:title", content: "Purchase order — Procurely Flow" },
      {
        property: "og:description",
        content:
          "Branded purchase order with pricing, change order revisions, terms and approval trail.",
      },
    ],
  }),
  component: PurchaseOrderDocument,
});

function PurchaseOrderDocument() {
  const { id } = Route.useParams();
  const me = useMe();
  const queryClient = useQueryClient();

  const [isChangeOrderOpen, setIsChangeOrderOpen] = useState(false);
  const [changeReason, setChangeReason] = useState("");
  const [editableLines, setEditableLines] = useState<
    Array<{
      itemId: string;
      description: string;
      quantity: number;
      unitPrice: number;
    }>
  >([]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["purchase-order", id],
    queryFn: () => purchaseOrderDetailFn({ data: { purchaseOrderId: id } }),
    retry: false,
  });

  const { data: changeOrders } = useQuery({
    queryKey: ["po-change-orders", id],
    queryFn: () => getPoChangeOrdersFn({ data: { purchaseOrderId: id } }),
    enabled: !!id,
  });

  // Sync lines to editable lines when dialog opens or data loads
  useEffect(() => {
    if (data?.lines) {
      setEditableLines(
        data.lines.map((l) => ({
          itemId: l.id,
          description: l.description,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unit_price),
        })),
      );
    }
  }, [data?.lines]);

  const canAmend = can(me.data?.roles, ["procurement_officer", "finance", "admin"]);

  // Calculate new total from editable lines
  const computedNewTotal = editableLines.reduce(
    (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0),
    0,
  );
  const currentTotal = Number(data?.po?.total_amount || 0);
  const delta = computedNewTotal - currentTotal;

  const changeOrderMutation = useMutation({
    mutationFn: async () => {
      if (!changeReason.trim()) {
        throw new Error("Documented justification is required for a PO Change Order.");
      }
      if (editableLines.length === 0) {
        throw new Error("PO must contain at least one line item.");
      }

      return createPoChangeOrderFn({
        data: {
          purchaseOrderId: id,
          reason: changeReason.trim(),
          newTotalAmount: computedNewTotal,
          modifiedItems: editableLines.map((el) => {
            const original = data?.lines.find((l) => l.id === el.itemId);
            return {
              itemId: el.itemId,
              description: el.description,
              oldQuantity: Number(original?.quantity || el.quantity),
              newQuantity: Number(el.quantity),
              oldUnitPrice: Number(original?.unit_price || el.unitPrice),
              newUnitPrice: Number(el.unitPrice),
            };
          }),
        },
      });
    },
    onSuccess: async (res) => {
      toast.success(`Change Order ${res.revisedPoNumber} successfully issued.`);
      setIsChangeOrderOpen(false);
      setChangeReason("");
      await queryClient.invalidateQueries({ queryKey: ["purchase-order", id] });
      await queryClient.invalidateQueries({ queryKey: ["po-change-orders", id] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed issuing Change Order.");
    },
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
        <div className="flex items-center gap-2">
          {canAmend &&
          (po.status as string) !== "cancelled" &&
          (po.status as string) !== "rejected" ? (
            <Button
              variant="outline"
              className="h-11 border-amber-200 bg-amber-50/60 hover:bg-amber-100 text-amber-900 font-semibold cursor-pointer"
              onClick={() => setIsChangeOrderOpen(true)}
            >
              <FileEdit className="mr-2 h-4 w-4 text-amber-700" />
              Amend PO / Change Order
            </Button>
          ) : null}
          <Button variant="outline" className="h-11" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Print / save as PDF
          </Button>
        </div>
      </div>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        {/* Branded header */}
        <header className="bg-[#0B1457] px-6 py-6 text-white sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                {buyer.name}
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-1">
                Purchase Order
              </h1>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-mono text-sm text-slate-300 tabular-nums">
                  {po.po_number}
                </span>
                {po.revision_count && po.revision_count > 0 ? (
                  <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-400/30">
                    Revision {po.revision_count}
                  </span>
                ) : null}
              </div>
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
                  {(requisition as { delivery_location?: string }).delivery_location
                    ? ` · Drop-off: ${(requisition as { delivery_location?: string }).delivery_location}`
                    : ""}
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
                <span className="font-sans text-2xl font-bold tabular-nums text-slate-900">
                  {money(po.total_amount, currency)}
                </span>
              </div>
              {po.fx_rate_note ? (
                <p className="text-xs text-muted-foreground">FX basis: {po.fx_rate_note}</p>
              ) : null}
            </div>
          </section>

          {/* Change Order & Revision History (FR-5.4) */}
          {changeOrders && changeOrders.length > 0 ? (
            <section className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-amber-700" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                    Change Order History &amp; Revisions ({changeOrders.length})
                  </h2>
                </div>
                <span className="text-[11px] font-mono text-amber-800">
                  Baseline: {po.baseline_po_number || po.po_number}
                </span>
              </div>

              <div className="space-y-2">
                {changeOrders.map((co) => (
                  <div
                    key={co.id}
                    className="rounded-lg border border-amber-200 bg-white p-3.5 text-xs shadow-2xs space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-slate-900">
                        {co.revised_po_number} (Rev {co.revision_number})
                      </span>
                      <span className="text-[11px] text-slate-500">{dateTime(co.created_at)}</span>
                    </div>
                    <p className="text-slate-700 font-medium italic">"{co.reason}"</p>
                    <div className="flex flex-wrap items-center justify-between border-t border-slate-100 pt-1.5 text-[11px] text-slate-500">
                      <span>
                        Previous: {money(co.previous_total_amount, co.currency)} → Revised:{" "}
                        <strong className="text-slate-900 font-semibold">
                          {money(co.new_total_amount, co.currency)}
                        </strong>
                      </span>
                      <span
                        className={
                          co.delta_amount >= 0
                            ? "font-semibold text-emerald-700"
                            : "font-semibold text-rose-700"
                        }
                      >
                        Delta: {co.delta_amount >= 0 ? "+" : ""}
                        {money(co.delta_amount, co.currency)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Terms */}
          <div className="grid gap-4 sm:grid-cols-2">
            <section className="rounded-lg border border-border p-4">
              <p className="data-label">Payment &amp; warranty</p>
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

      {/* Change Order Dialog (FR-5.4) */}
      <Dialog open={isChangeOrderOpen} onOpenChange={setIsChangeOrderOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <FileEdit className="h-4 w-4 text-amber-600" />
              Documented PO Change Order (FR-5.4)
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Amend purchase order quantities or unit rates. An immutable revision will be created
              while preserving baseline{" "}
              <strong className="font-mono text-slate-700">
                {po.baseline_po_number || po.po_number}
              </strong>
              .
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-slate-700">Line Items Adjustment</Label>
              <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {editableLines.map((line, idx) => (
                  <div
                    key={line.itemId}
                    className="p-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">{line.description}</p>
                    </div>
                    <div className="w-24">
                      <Label className="text-[10px] text-slate-400">Quantity</Label>
                      <Input
                        type="number"
                        min="0"
                        className="h-8 text-xs font-mono"
                        value={line.quantity}
                        onChange={(e) => {
                          const val = Number(e.target.value) || 0;
                          setEditableLines((prev) =>
                            prev.map((l, i) => (i === idx ? { ...l, quantity: val } : l)),
                          );
                        }}
                      />
                    </div>
                    <div className="w-32">
                      <Label className="text-[10px] text-slate-400">Unit Price ({currency})</Label>
                      <Input
                        type="number"
                        min="0"
                        className="h-8 text-xs font-mono"
                        value={line.unitPrice}
                        onChange={(e) => {
                          const val = Number(e.target.value) || 0;
                          setEditableLines((prev) =>
                            prev.map((l, i) => (i === idx ? { ...l, unitPrice: val } : l)),
                          );
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Delta Summary */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-1 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Baseline PO Amount:</span>
                <span className="font-mono font-medium">{money(currentTotal, currency)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-900 font-semibold">
                <span>Revised PO Amount:</span>
                <span className="font-mono font-bold text-sm text-[#0B1457]">
                  {money(computedNewTotal, currency)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 pt-1">
                <span>Change Order Delta:</span>
                <span
                  className={`font-mono font-bold ${
                    delta > 0 ? "text-rose-600" : delta < 0 ? "text-emerald-600" : "text-slate-600"
                  }`}
                >
                  {delta > 0 ? "+" : ""}
                  {money(delta, currency)}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="changeReason" className="text-xs font-semibold text-slate-700">
                Documented Reason for Change Order <span className="text-rose-500">*</span>
              </Label>
              <Textarea
                id="changeReason"
                rows={3}
                placeholder="State the commercial or site engineering rationale for amending this order (e.g. site requirement increase, supplier re-negotiation, quantity scope reduction)."
                className="text-xs resize-none"
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="text-xs"
              onClick={() => setIsChangeOrderOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#0B1457] hover:bg-[#0001FF] text-white text-xs font-semibold"
              disabled={changeOrderMutation.isPending || !changeReason.trim()}
              onClick={() => changeOrderMutation.mutate()}
            >
              {changeOrderMutation.isPending ? "Issuing Change Order…" : "Issue Change Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
