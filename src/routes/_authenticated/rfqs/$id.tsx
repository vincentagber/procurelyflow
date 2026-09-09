import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Award, Copy, Paperclip, Send } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  awardQuoteFn,
  getRecommendedQuote,
  quoteAttachmentUrlFn,
  rfqInvitationLinksFn,
  resendRfqInvitationFn,
} from "@/lib/procurement.functions";
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

export const Route = createFileRoute("/_authenticated/rfqs/$id")({
  head: () => ({
    meta: [
      { title: "Compare quotes — Procurely Flow" },
      {
        name: "description",
        content:
          "Compare supplier quotes side by side, see the recommended lowest compliant bid, and issue a purchase order.",
      },
      { property: "og:title", content: "Compare quotes — Procurely Flow" },
      { property: "og:description", content: "Side-by-side supplier comparison and PO issue." },
    ],
  }),
  component: RfqDetail,
});

function RfqDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
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
      navigate({ to: "/purchase-orders/$id", params: { id: result.purchaseOrderId } });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Couldn't issue the purchase order."),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading quotes…</p>;
  const rfq = data?.rfq;
  if (!rfq) return <p className="text-sm text-muted-foreground">This RFQ no longer exists.</p>;

  type Cell = { unit: number; vatRate: number; vatAmount: number; currency: "NGN" | "USD" };
  const itemRows: {
    key: string;
    description: string;
    quantity: number;
    byQuote: Record<string, Cell>;
  }[] = [];
  // Landed cost is always recomputed from itemised line VAT, never a stored manual figure.
  const landed: Record<string, { items: number; vat: number; total: number }> = {};
  for (const quote of data.quotes) {
    let items = 0;
    let vat = 0;
    for (const item of (quote.quote_items ?? []) as {
      requisition_item_id: string | null;
      description: string;
      quantity: number;
      unit_price: number;
      vat_rate: number | null;
      vat_amount: number | null;
      currency: string;
    }[]) {
      const key = item.requisition_item_id ?? item.description;
      let row = itemRows.find((r) => r.key === key);
      if (!row) {
        row = {
          key,
          description: item.description,
          quantity: Number(item.quantity),
          byQuote: {},
        };
        itemRows.push(row);
      }
      const lineValue = Number(item.quantity) * Number(item.unit_price);
      const rate = Number(item.vat_rate ?? 0);
      const lineVat = item.vat_amount != null ? Number(item.vat_amount) : (lineValue * rate) / 100;
      items += lineValue;
      vat += lineVat;
      row.byQuote[quote.id] = {
        unit: Number(item.unit_price),
        vatRate: rate,
        vatAmount: lineVat,
        currency: item.currency as "NGN" | "USD",
      };
    }
    landed[quote.id] = {
      items,
      vat,
      total: items + vat + Number(quote.delivery_charge ?? 0),
    };
  }

  const isOverride = !!recommended && !!selectedQuote && recommended.quoteId !== selectedQuote;
  const awarded = rfq.status === "awarded";

  return (
    <div className="space-y-5 pb-10">
      <PageHeader
        title={rfq.title}
        subtitle={`${rfq.reference} · closes ${shortDate(rfq.closes_at)} · ${data.quotes.length} of ${data.invites.length} suppliers responded`}
        actions={
          <Button asChild variant="outline" className="h-11">
            <Link to="/rfqs">All RFQs</Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusPill status={rfq.status} />
        <Link
          to="/requisitions/$id"
          params={{ id: (rfq.requisitions as { id: string }).id }}
          className="text-sm text-accent underline-offset-4 hover:underline"
        >
          {(rfq.requisitions as { reference: string }).reference}
        </Link>
      </div>

      {!data.quotes.length ? (
        <EmptyState
          title="No quotes in yet"
          body="Suppliers you invited haven't responded. Their links stay live until the RFQ closes — you can re-share any of them."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-surface">
              <tr className="text-left">
                <th className="px-3 py-2.5 data-label">Supplier</th>
                <th className="px-3 py-2.5 data-label">Total</th>
                <th className="px-3 py-2.5 data-label">VAT / delivery</th>
                <th className="px-3 py-2.5 data-label">Lead time</th>
                <th className="px-3 py-2.5 data-label">Valid for</th>
                <th className="px-3 py-2.5 data-label">Terms</th>
                <th className="px-3 py-2.5 data-label">Rating</th>

                <th className="px-3 py-2.5 data-label">Submitted</th>
                <th className="px-3 py-2.5 data-label">Status</th>
                {!awarded ? <th className="px-3 py-2.5 data-label">Select</th> : null}
              </tr>
            </thead>
            <tbody>
              {data.quotes.map((quote) => {
                const supplier = quote.suppliers as { name: string; is_compliant: boolean };
                const isRecommended = recommended?.quoteId === quote.id;
                return (
                  <tr
                    key={quote.id}
                    className={
                      selectedQuote === quote.id
                        ? "border-t border-border bg-accent/5"
                        : "border-t border-border"
                    }
                  >
                    <td className="px-3 py-3">
                      <span className="font-medium">{supplier.name}</span>
                      {isRecommended ? (
                        <span className="ml-2 inline-flex items-center gap-1 rounded bg-success/15 px-1.5 py-0.5 text-[11px] font-semibold uppercase text-success">
                          <Award className="h-3 w-3" /> Recommended
                        </span>
                      ) : null}
                      {!supplier.is_compliant ? (
                        <span className="ml-2 text-xs text-destructive">non-compliant</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 font-medium tabular-nums">
                      {money(landed[quote.id]?.total ?? quote.total_amount, quote.currency)}
                      <span className="block text-xs font-normal text-muted-foreground">
                        items {money(landed[quote.id]?.items ?? quote.subtotal, quote.currency)}
                      </span>
                    </td>
                    <td className="px-3 py-3 tabular-nums text-muted-foreground">
                      {money(landed[quote.id]?.vat ?? 0, quote.currency)} /{" "}
                      {money(quote.delivery_charge, quote.currency)}
                    </td>
                    <td className="px-3 py-3">
                      {quote.lead_time_days ? `${quote.lead_time_days} days` : "—"}
                    </td>
                    <td className="px-3 py-3">
                      {quote.validity_days ? `${quote.validity_days} days` : "—"}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {quote.payment_terms ?? "—"}
                      {quote.warranty_note ? (
                        <span className="block text-xs">{quote.warranty_note}</span>
                      ) : null}
                      {quote.attachment_path ? (
                        <button
                          type="button"
                          className="mt-1 flex items-center gap-1 text-xs text-accent underline-offset-4 hover:underline"
                          onClick={() =>
                            quoteAttachmentUrlFn({ data: { quoteId: quote.id } })
                              .then((r) => window.open(r.url, "_blank", "noopener"))
                              .catch(() => toast.error("Couldn't open that attachment."))
                          }
                        >
                          <Paperclip className="h-3 w-3" /> Attachment
                        </button>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {(quote.suppliers as { rating: number | null }).rating != null ? (
                        <span className="font-medium text-foreground tabular-nums">
                          {Number((quote.suppliers as { rating: number | null }).rating).toFixed(1)}
                          <span className="text-xs font-normal text-muted-foreground"> / 5</span>
                        </span>
                      ) : (
                        <span className="text-xs">not rated yet</span>
                      )}
                    </td>

                    <td className="px-3 py-3 text-muted-foreground">
                      {dateTime(quote.submitted_at)}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={quote.status} />
                    </td>
                    {!awarded ? (
                      <td className="px-3 py-3">
                        <Button
                          variant={selectedQuote === quote.id ? "default" : "outline"}
                          className="h-10"
                          onClick={() => {
                            setSelectedQuote(quote.id);
                            setSettlementCurrency(quote.currency as "NGN" | "USD");
                          }}
                        >
                          {selectedQuote === quote.id ? "Selected" : "Select"}
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data.quotes.length ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs">
          <h2 className="text-base font-semibold text-slate-900 tracking-tight">Price Per Item Comparison</h2>
          <p className="mt-1 text-xs text-slate-500">
            Same requested item, every supplier's unit price side by side. The cheapest unit price
            on each row is marked.
          </p>
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-surface">
                <tr className="text-left">
                  <th className="px-3 py-2 data-label">Item</th>
                  {data.quotes.map((quote) => (
                    <th key={quote.id} className="px-3 py-2 data-label">
                      {(quote.suppliers as { name: string }).name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {itemRows.map((row) => {
                  const prices = data.quotes.map((quote) => row.byQuote[quote.id]?.unit ?? null);
                  const valid = prices.filter((p): p is number => p != null);
                  const cheapest = valid.length ? Math.min(...valid) : null;
                  return (
                    <tr key={row.key} className="border-t border-border">
                      <td className="px-3 py-2.5">
                        <span className="font-medium">{row.description}</span>
                        <span className="block text-xs text-muted-foreground">
                          qty {row.quantity}
                        </span>
                      </td>
                      {data.quotes.map((quote) => {
                        const cell = row.byQuote[quote.id];
                        const isCheapest =
                          cell != null && cheapest != null && cell.unit === cheapest;
                        return (
                          <td
                            key={quote.id}
                            className={
                              isCheapest
                                ? "px-3 py-2.5 tabular-nums font-medium text-success"
                                : "px-3 py-2.5 tabular-nums"
                            }
                          >
                            {cell ? money(cell.unit, cell.currency) : "—"}
                            {cell ? (
                              <span className="block text-xs font-normal text-muted-foreground">
                                line {money(cell.unit * row.quantity, cell.currency)} · VAT{" "}
                                {cell.vatRate}% ({money(cell.vatAmount, cell.currency)})
                              </span>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                <tr className="border-t border-border bg-surface">
                  <td className="px-3 py-2.5 data-label">Total VAT</td>
                  {data.quotes.map((quote) => (
                    <td key={quote.id} className="px-3 py-2.5 tabular-nums text-muted-foreground">
                      {money(landed[quote.id]?.vat ?? 0, quote.currency)}
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-border bg-surface">
                  <td className="px-3 py-2.5 data-label">Total landed cost</td>
                  {data.quotes.map((quote) => (
                    <td key={quote.id} className="px-3 py-2.5 font-medium tabular-nums">
                      {money(landed[quote.id]?.total ?? quote.total_amount, quote.currency)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {selectedQuote && !awarded ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs">
          <h2 className="text-base font-semibold text-slate-900 tracking-tight">Issue Purchase Order</h2>
          <p className="mt-1 text-xs text-slate-500">
            You make the final call — nothing is auto-selected. The PO records the currency
            settlement happens in.
          </p>

          {isOverride ? (
            <div className="mt-3 rounded-md border border-warning/50 bg-warning/10 p-3">
              <p className="text-sm font-medium">
                You've picked a supplier other than the recommended lowest compliant bid.
              </p>
              <p className="text-xs text-muted-foreground">
                A short written reason is required before this PO can be issued.
              </p>
              <Textarea
                className="mt-2 bg-card"
                rows={2}
                placeholder="e.g. Recommended supplier cannot deliver before the concrete pour."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          ) : null}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Settlement currency</Label>
              <Select
                value={settlementCurrency}
                onValueChange={(v) => setSettlementCurrency(v as "NGN" | "USD")}
              >
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NGN">NGN — settle in Naira</SelectItem>
                  <SelectItem value="USD">USD — settle in Dollars</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fx">FX note (optional)</Label>
              <Input
                id="fx"
                className="h-12"
                placeholder="e.g. Converted at CBN rate on issue date"
                value={fxNote}
                onChange={(e) => setFxNote(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="address">Delivery address</Label>
              <Input
                id="address"
                className="h-12"
                placeholder="Site address for delivery"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </div>

          <Button
            className="mt-4 h-12 w-full sm:w-auto sm:px-8"
            disabled={award.isPending || (isOverride && !reason.trim())}
            onClick={() => award.mutate()}
          >
            {award.isPending ? "Issuing…" : "Issue purchase order"}
          </Button>
        </section>
      ) : null}

      <InvitedSuppliers rfqId={id} />
    </div>
  );
}

const INVITE_STATUS: Record<string, { label: string; className: string }> = {
  quote_submitted: { label: "Quote submitted", className: "bg-success/15 text-success" },
  viewed: { label: "Viewed", className: "bg-accent/15 text-accent" },
  link_sent: { label: "Link sent", className: "bg-muted text-muted-foreground" },
  no_response: { label: "No response", className: "bg-destructive/10 text-destructive" },
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
      toast.success("Supplier link copied.");
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
      toast.success(`Same link re-sent to ${r.supplierName}. Nothing they started was lost.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't resend that link.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs">
      <h2 className="text-base font-semibold text-slate-900 tracking-tight">Invited Suppliers</h2>
      <p className="mt-1 text-xs text-slate-500">
        Every supplier's private link stays available here for the life of this RFQ. Resending
        re-sends the same link, so a quote already in progress is never lost.
      </p>

      <ul className="mt-3 divide-y divide-slate-100">
        {(data?.invitations ?? []).map((invite) => {
          const key =
            invite.status === "link_sent" && invite.expired ? "no_response" : invite.status;
          const badge = INVITE_STATUS[key] ?? INVITE_STATUS["link_sent"]!;
          return (
            <li key={invite.id} className="flex flex-wrap items-center gap-2 py-3">
              <div className="min-w-40 flex-1">
                <p className="font-semibold text-xs text-slate-900">{invite.supplierName}</p>
                <p className="text-xs text-slate-500">
                  {invite.supplierEmail ?? "no email on file"} · link expires{" "}
                  <strong className="text-slate-700 font-medium">{shortDate(invite.expiresAt)}</strong>
                  {invite.openedAt ? ` · opened ${dateTime(invite.openedAt)}` : ""}
                </p>
              </div>
              <span
                className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase ${badge.className}`}
              >
                {badge.label}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="h-9 rounded-lg border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs"
                  onClick={() => copyLink(invite.token)}
                  aria-label={`Copy quote link for ${invite.supplierName}`}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Copy link
                </Button>
                <Button
                  variant="ghost"
                  className="h-9 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  disabled={busy === invite.id || !invite.supplierEmail}
                  onClick={() => resend(invite.id)}
                  aria-label={`Resend quote link to ${invite.supplierName}`}
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  {busy === invite.id ? "Sending…" : "Resend"}
                </Button>
              </div>
            </li>
          );
        })}
        {!data?.invitations.length ? (
          <li className="py-3 text-sm text-muted-foreground">No suppliers invited yet.</li>
        ) : null}
      </ul>
    </section>
  );
}
