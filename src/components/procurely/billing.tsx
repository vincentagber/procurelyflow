import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Banknote, Plus, ReceiptText } from "lucide-react";

import {
  billingInvoicesFn,
  createBillingInvoiceFn,
  markBillingInvoicePaidFn,
} from "@/lib/platform.functions";
import { DEFAULT_VAT_RATE, PLAN_LABELS, PROCURELY_BANK_DETAILS } from "@/lib/billing";
import { money, shortDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const INVOICE_STATUS_STYLES: Record<string, string> = {
  pending: "bg-accent/10 text-accent",
  paid: "bg-primary/10 text-primary",
  overdue: "bg-signal/15 text-signal",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function BillingSection({ orgId }: { orgId: string }) {
  const invoices = useQuery({
    queryKey: ["billing-invoices", orgId],
    queryFn: () => billingInvoicesFn({ data: { orgId } }),
  });
  const [openInvoice, setOpenInvoice] = useState<string | null>(null);
  const [payRef, setPayRef] = useState("");
  const [busy, setBusy] = useState(false);

  async function markPaid(invoiceId: string) {
    setBusy(true);
    try {
      await markBillingInvoicePaidFn({
        data: { invoiceId, ...(payRef.trim() ? { paymentReference: payRef.trim() } : {}) },
      });
      toast.success("Invoice marked paid.");
      setPayRef("");
      await invoices.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't mark that invoice paid.");
    } finally {
      setBusy(false);
    }
  }

  const rows = invoices.data ?? [];

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl uppercase tracking-wide text-foreground">
          Subscription billing
        </h2>
        <NewInvoiceDialog orgId={orgId} onDone={() => invoices.refetch()} />
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        Procurely invoices this organization for their subscription. Payment is by bank transfer — a
        platform admin marks an invoice paid once the transfer is confirmed.
      </p>

      {invoices.isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading invoices…</p>
      ) : !rows.length ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No billing invoices issued yet for this organization.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((inv) => {
            const expanded = openInvoice === inv.id;
            return (
              <li key={inv.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-lg uppercase tracking-wide text-foreground">
                        {inv.invoiceNumber}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                          INVOICE_STATUS_STYLES[inv.status] ?? "bg-muted text-muted-foreground",
                        )}
                      >
                        {inv.status}
                      </span>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {PLAN_LABELS[inv.plan] ?? inv.plan}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Period {shortDate(inv.periodStart)} – {shortDate(inv.periodEnd)} · issued{" "}
                      {shortDate(inv.issueDate)} · due {shortDate(inv.dueDate)}
                    </p>
                    {inv.description ? (
                      <p className="mt-1 text-sm text-foreground">{inv.description}</p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="font-display text-xl text-foreground">
                      {money(inv.totalAmount, "NGN")}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setOpenInvoice(expanded ? null : inv.id)}
                    >
                      <ReceiptText className="mr-2 h-4 w-4" aria-hidden />
                      {expanded ? "Hide invoice" : "View invoice"}
                    </Button>
                  </div>
                </div>

                {expanded ? (
                  <div className="mt-3 border-t border-border pt-3">
                    <dl className="max-w-sm space-y-1 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Subtotal</dt>
                        <dd className="text-foreground">{money(inv.subtotal, "NGN")}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">VAT @ {inv.vatRate}%</dt>
                        <dd className="text-foreground">{money(inv.vatAmount, "NGN")}</dd>
                      </div>
                      <div className="flex justify-between border-t border-border pt-1 font-semibold">
                        <dt className="text-foreground">Total due</dt>
                        <dd className="text-foreground">{money(inv.totalAmount, "NGN")}</dd>
                      </div>
                    </dl>

                    <div className="mt-3 rounded-md bg-muted p-3 text-xs text-muted-foreground">
                      <p className="flex items-center gap-2 font-semibold text-foreground">
                        <Banknote className="h-4 w-4" aria-hidden /> Pay by bank transfer
                      </p>
                      <p className="mt-1">
                        {PROCURELY_BANK_DETAILS.accountName} · {PROCURELY_BANK_DETAILS.bankName} ·{" "}
                        {PROCURELY_BANK_DETAILS.accountNumber} ({PROCURELY_BANK_DETAILS.currency})
                      </p>
                      <p className="mt-1">{PROCURELY_BANK_DETAILS.note}</p>
                    </div>

                    {inv.status === "paid" ? (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Paid {shortDate(inv.paidAt)}
                        {inv.paymentReference ? ` · ref ${inv.paymentReference}` : ""}
                      </p>
                    ) : (
                      <div className="mt-3 flex flex-wrap items-end gap-2">
                        <div className="w-56">
                          <Label htmlFor={`ref-${inv.id}`}>Transfer reference (optional)</Label>
                          <Input
                            id={`ref-${inv.id}`}
                            value={payRef}
                            onChange={(e) => setPayRef(e.target.value)}
                            placeholder="e.g. GTB/2026/0043"
                            className="mt-1.5"
                          />
                        </div>
                        <Button disabled={busy} onClick={() => markPaid(inv.id)}>
                          {busy ? "Saving…" : "Mark paid"}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function NewInvoiceDialog({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const range = monthRange();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [periodStart, setPeriodStart] = useState(range.start);
  const [periodEnd, setPeriodEnd] = useState(range.end);
  const [dueDate, setDueDate] = useState(addDays(14));
  const [subtotal, setSubtotal] = useState("");
  const [vatRate, setVatRate] = useState(String(DEFAULT_VAT_RATE));
  const [description, setDescription] = useState("");

  const subtotalValue = Number(subtotal) || 0;
  const rateValue = Number(vatRate) || 0;
  const vatAmount = Math.round(((subtotalValue * rateValue) / 100) * 100) / 100;
  const total = Math.round((subtotalValue + vatAmount) * 100) / 100;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await createBillingInvoiceFn({
        data: {
          orgId,
          periodStart,
          periodEnd,
          dueDate,
          subtotal: subtotalValue,
          vatRate: rateValue,
          ...(description.trim() ? { description: description.trim() } : {}),
        },
      });
      toast.success("Billing invoice generated.");
      setOpen(false);
      setSubtotal("");
      setDescription("");
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't generate that invoice.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" aria-hidden /> Generate invoice
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate a billing invoice</DialogTitle>
          <DialogDescription>
            VAT is calculated from the subtotal at the rate you set — it is never typed in directly.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="period-start">Period start</Label>
              <Input
                id="period-start"
                type="date"
                required
                value={periodStart}
                max={periodEnd}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="period-end">Period end</Label>
              <Input
                id="period-end"
                type="date"
                required
                value={periodEnd}
                min={periodStart}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="subtotal">Subtotal (NGN)</Label>
              <Input
                id="subtotal"
                type="number"
                min={0}
                step="0.01"
                required
                value={subtotal}
                onChange={(e) => setSubtotal(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="vat-rate">VAT rate (%)</Label>
              <Input
                id="vat-rate"
                type="number"
                min={0}
                max={100}
                step="0.1"
                required
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="due-date">Due date</Label>
              <Input
                id="due-date"
                type="date"
                required
                min={today()}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="invoice-note">Description (optional)</Label>
            <Textarea
              id="invoice-note"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Growth plan — 12 users"
              className="mt-1.5"
            />
          </div>

          <dl className="rounded-md bg-muted p-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="text-foreground">{money(subtotalValue, "NGN")}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">VAT @ {rateValue}%</dt>
              <dd className="text-foreground">{money(vatAmount, "NGN")}</dd>
            </div>
            <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold">
              <dt className="text-foreground">Total</dt>
              <dd className="text-foreground">{money(total, "NGN")}</dd>
            </div>
          </dl>

          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Generating…" : "Generate invoice"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
