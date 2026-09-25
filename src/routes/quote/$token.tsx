import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, FileCheck2 } from "lucide-react";

import {
  getSupplierRfq,
  getQuoteUploadUrlFn,
  submitQuoteFn,
  supplierPoFn,
  acknowledgePoFn,
} from "@/lib/procurement.functions";
import { money, shortDate, dateTime } from "@/lib/format";
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

export const Route = createFileRoute("/quote/$token")({
  head: () => ({
    meta: [
      { title: "Submit your quote — Procurely Flow" },
      {
        name: "description",
        content:
          "Enter your prices for this request for quotation. No account or app download needed.",
      },
      { property: "og:title", content: "Submit your quote — Procurely Flow" },
      { property: "og:description", content: "Quote a construction materials request in minutes." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SupplierQuote,
});

type Line = {
  requisitionItemId: string;
  description: string;
  quantity: number;
  unitPrice: string;
  vatRate: string;
};

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function SupplierQuote() {
  const { token } = Route.useParams();
  const [lines, setLines] = useState<Line[]>([]);
  const [currency, setCurrency] = useState<"NGN" | "USD">("NGN");
  const [leadTime, setLeadTime] = useState("");
  const [terms, setTerms] = useState("");
  const [warranty, setWarranty] = useState("");

  const [delivery, setDelivery] = useState("");
  const [validity, setValidity] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [done, setDone] = useState(false);
  const [signer, setSigner] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["supplier-rfq", token],
    queryFn: () => getSupplierRfq({ data: { token } }),
    retry: false,
  });

  const po = useQuery({
    queryKey: ["supplier-po", token],
    queryFn: () => supplierPoFn({ data: { token } }),
    retry: false,
  });

  const acknowledge = useMutation({
    mutationFn: () => acknowledgePoFn({ data: { token, signerName: signer.trim() } }),
    onSuccess: async () => {
      toast.success("Thank you — the buyer has been notified.");
      await po.refetch();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Couldn't record your acknowledgement."),
  });

  useEffect(() => {
    if (data && !("error" in data)) {
      setLines(
        data.items.map((item) => ({
          requisitionItemId: item.id,
          description: item.description,
          quantity: Number(item.quantity),
          unitPrice: "",
          vatRate: "7.5",
        })),
      );
    }
  }, [data]);

  const submit = useMutation({
    mutationFn: async () => {
      let attachmentPath: string | undefined;
      let attachmentName: string | undefined;

      if (file) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          throw new Error("That file is larger than 25MB. Please attach a smaller file.");
        }

        // 1. Obtain signed upload URL authorized specifically for this RFQ, token, and supplier
        const uploadAuth = await getQuoteUploadUrlFn({
          data: {
            token,
            filename: file.name,
            contentType: file.type || "application/octet-stream",
            sizeBytes: file.size,
          },
        });

        // 2. Direct upload to Supabase Object Storage (no base64 payload over RPC)
        const uploadRes = await fetch(uploadAuth.signedUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        });

        if (!uploadRes.ok) {
          throw new Error("Failed uploading file attachment directly to storage.");
        }

        attachmentPath = uploadAuth.storagePath;
        attachmentName = file.name;
      }

      return submitQuoteFn({
        data: {
          token,
          currency,
          leadTimeDays: leadTime ? Number(leadTime) : undefined,
          paymentTerms: terms || undefined,
          warrantyNote: warranty || undefined,
          deliveryCharge: delivery ? Number(delivery) : undefined,
          validityDays: validity ? Number(validity) : undefined,
          attachmentPath,
          attachmentName,
          lines: lines.map((line) => ({
            requisitionItemId: line.requisitionItemId,
            description: line.description,
            quantity: line.quantity,
            unitPrice: Number(line.unitPrice) || 0,
            vatRate: Number(line.vatRate) || 0,
          })),
        },
      });
    },
    onSuccess: () => {
      setDone(true);
      toast.success("Quote submitted. The buyer can see it now.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't submit your quote."),
  });

  const subtotal = lines.reduce(
    (sum, line) => sum + line.quantity * (Number(line.unitPrice) || 0),
    0,
  );
  const vatTotal = lines.reduce(
    (sum, line) =>
      sum + (line.quantity * (Number(line.unitPrice) || 0) * (Number(line.vatRate) || 0)) / 100,
    0,
  );
  const total = subtotal + vatTotal + (Number(delivery) || 0);

  if (isLoading) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">Loading your quote request…</p>
      </Shell>
    );
  }

  if (!data || "error" in data) {
    return (
      <Shell>
        <h1 className="font-display text-3xl uppercase tracking-wide">Link unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {data && "error" in data ? data.error : "This quote link is not valid."}
        </p>
      </Shell>
    );
  }

  const order = po.data;
  if (order) {
    const currency = order.po.settlement_currency as "NGN" | "USD";
    return (
      <Shell>
        <p className="data-label">{order.buyer.name} · purchase order</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl uppercase tracking-wide">{order.po.po_number}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Issued to {order.supplier?.name ?? "you"} · {dateTime(order.po.issued_at)}
              {order.requisitionReference ? ` · ref ${order.requisitionReference}` : ""}
            </p>
          </div>
          <div className="text-right">
            <p className="font-display text-3xl leading-none">
              {money(order.po.total_amount, currency)}
            </p>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              settles in {currency}
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="bg-surface">
              <tr className="text-left">
                <th className="px-3 py-2 data-label">Item</th>
                <th className="px-3 py-2 data-label">Qty</th>
                <th className="px-3 py-2 data-label">Unit price</th>
                <th className="px-3 py-2 data-label">Line total</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => (
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

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border p-3">
            <p className="data-label">Payment terms</p>
            <p className="mt-1 text-sm">{order.quote?.payment_terms ?? "As agreed"}</p>
            {order.quote?.warranty_note ? (
              <p className="mt-1 text-xs text-muted-foreground">{order.quote.warranty_note}</p>
            ) : null}
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="data-label">Delivery</p>
            <p className="mt-1 text-sm">
              {order.po.delivery_address ?? "Buyer will confirm the delivery address"}
            </p>
            {order.quote?.lead_time_days ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Agreed lead time {order.quote.lead_time_days} days
              </p>
            ) : null}
          </div>
        </div>

        {order.po.fx_rate_note ? (
          <p className="mt-3 text-xs text-muted-foreground">FX basis: {order.po.fx_rate_note}</p>
        ) : null}

        {order.po.acknowledged_at ? (
          <div className="mt-5 flex items-start gap-3 rounded-lg border border-success/40 bg-success/10 p-4">
            <FileCheck2 className="mt-0.5 h-5 w-5 text-success" />
            <div>
              <p className="text-sm font-medium">Order acknowledged</p>
              <p className="text-sm text-muted-foreground">
                Signed by {order.po.acknowledged_by_name} on {dateTime(order.po.acknowledged_at)}.
              </p>
            </div>
          </div>
        ) : (
          <form
            className="mt-5 space-y-3 rounded-lg border border-border bg-surface p-4"
            onSubmit={(e) => {
              e.preventDefault();
              acknowledge.mutate();
            }}
          >
            <p className="font-display text-xl uppercase tracking-wide">Acknowledge this order</p>
            <p className="text-sm text-muted-foreground">
              Type your full name to confirm you accept this purchase order, its prices and its
              delivery terms. This is recorded as your digital acknowledgement.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="signer">Your full name</Label>
              <Input
                id="signer"
                required
                className="h-12"
                value={signer}
                onChange={(e) => setSigner(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              className="h-12 w-full"
              disabled={acknowledge.isPending || signer.trim().length < 2}
            >
              {acknowledge.isPending ? "Recording…" : "I acknowledge this purchase order"}
            </Button>
          </form>
        )}
      </Shell>
    );
  }

  if (done || data.myQuote) {
    return (
      <Shell>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-1 h-6 w-6 text-success" />
          <div>
            <h1 className="font-display text-3xl uppercase tracking-wide">Quote received</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Thank you, {data.supplierName}. {data.buyerName} has your prices for{" "}
              {data.rfq.reference} and will be in touch if you're selected.
            </p>
            {data.myQuote ? (
              <p className="mt-3 font-display text-4xl">
                {money(data.myQuote.total_amount, data.myQuote.currency as "NGN" | "USD")}
              </p>
            ) : null}
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="data-label">{data.buyerName} · request for quotation</p>
      <h1 className="mt-1 font-display text-3xl uppercase tracking-wide">{data.rfq.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {data.rfq.reference} · closes {shortDate(data.rfq.closes_at)} · quoting as{" "}
        {data.supplierName}
      </p>
      {data.rfq.instructions ? (
        <p className="mt-3 rounded-md border border-border bg-surface p-3 text-sm">
          {data.rfq.instructions}
        </p>
      ) : null}

      <form
        className="mt-5 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        <div className="space-y-3">
          {lines.map((line, index) => {
            const lineValue = line.quantity * (Number(line.unitPrice) || 0);
            const lineVat = (lineValue * (Number(line.vatRate) || 0)) / 100;
            return (
              <div key={line.requisitionItemId} className="rounded-lg border border-border p-3">
                <p className="font-medium">{line.description}</p>
                <p className="text-xs text-muted-foreground">Quantity requested: {line.quantity}</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`price-${index}`}>Your unit price</Label>
                    <Input
                      id={`price-${index}`}
                      required
                      inputMode="decimal"
                      className="h-12"
                      value={line.unitPrice}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) =>
                            i === index ? { ...l, unitPrice: e.target.value } : l,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`vat-rate-${index}`}>VAT rate (%)</Label>
                    <Input
                      id={`vat-rate-${index}`}
                      inputMode="decimal"
                      className="h-12"
                      value={line.vatRate}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) => (i === index ? { ...l, vatRate: e.target.value } : l)),
                        )
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      7.5% standard. Use 0 for zero-rated or exempt items.
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap justify-between gap-2 border-t border-border pt-2 text-sm">
                  <span className="text-muted-foreground">
                    Line value <span className="tabular-nums">{money(lineValue, currency)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    VAT on this line{" "}
                    <span className="tabular-nums text-foreground">{money(lineVat, currency)}</span>
                  </span>
                  <span className="font-medium">
                    Line total{" "}
                    <span className="tabular-nums">{money(lineValue + lineVat, currency)}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Select value={currency} onValueChange={(v) => setCurrency(v as "NGN" | "USD")}>
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NGN">NGN — Naira</SelectItem>
                <SelectItem value="USD">USD — Dollars</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lead">Lead time (days)</Label>
            <Input
              id="lead"
              inputMode="numeric"
              className="h-12"
              value={leadTime}
              onChange={(e) => setLeadTime(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="terms">Payment terms</Label>
            <Input
              id="terms"
              className="h-12"
              placeholder="e.g. 50% upfront, balance on delivery"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="validity">Quote valid for (days)</Label>
            <Input
              id="validity"
              inputMode="numeric"
              className="h-12"
              placeholder="e.g. 30"
              value={validity}
              onChange={(e) => setValidity(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Total VAT (calculated)</Label>
            <div className="flex h-12 items-center rounded-md border border-border bg-surface px-3 tabular-nums">
              {money(vatTotal, currency)}
            </div>
            <p className="text-xs text-muted-foreground">
              Derived from each line's VAT rate — nothing to type here.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="delivery">Delivery charge</Label>
            <Input
              id="delivery"
              inputMode="decimal"
              className="h-12"
              placeholder="0"
              value={delivery}
              onChange={(e) => setDelivery(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="warranty">Warranty terms / notes</Label>
            <Textarea
              id="warranty"
              rows={2}
              value={warranty}
              onChange={(e) => setWarranty(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="attachment">Attachment (optional, max 25MB)</Label>
            <Input
              id="attachment"
              type="file"
              className="h-12 pt-2.5"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.zip,.png,.jpg,.jpeg,.webp,image/*,application/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">
              Attach your formal quotation, spec sheet, catalogue, or document (PDF, Excel, Word, or
              photo up to 25 MB).
            </p>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="data-label">Items subtotal</span>
            <span className="tabular-nums">{money(subtotal, currency)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="data-label">Total VAT</span>
            <span className="tabular-nums">{money(vatTotal, currency)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="data-label">Delivery</span>
            <span className="tabular-nums">{money(Number(delivery) || 0, currency)}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-2">
            <span className="data-label">Grand total</span>
            <span className="font-display text-3xl">{money(total, currency)}</span>
          </div>
        </div>

        <Button type="submit" className="h-12 w-full" disabled={submit.isPending}>
          {submit.isPending ? "Submitting…" : "Submit quote"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Your prices are visible only to {data.buyerName}. Competing suppliers never see them.
        </p>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-10">
      <div className="rounded-xl border border-border bg-card p-5 sm:p-7">{children}</div>
      <p className="mt-4 text-center text-xs text-muted-foreground">Powered by Procurely Flow</p>
    </main>
  );
}
