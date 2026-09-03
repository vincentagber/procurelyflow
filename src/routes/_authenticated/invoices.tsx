import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ReceiptText, AlertTriangle, ShieldCheck, CreditCard } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/useMe";
import { createInvoiceFn, recordPaymentFn } from "@/lib/procurement.functions";
import { money, shortDate } from "@/lib/format";
import { PageHeader, EmptyState, StatusPill } from "@/components/procurely/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/invoices")({
  head: () => ({
    meta: [
      { title: "Supplier Invoices & 3-Way Match — Procurely Flow" },
      {
        name: "description",
        content:
          "NRS e-Invoicing compliant 3-way matching of POs, goods-received records, and supplier invoices before payment release.",
      },
      { property: "og:title", content: "Invoices & 3-Way Match — Procurely Flow" },
      {
        property: "og:description",
        content: "NRS e-Invoicing UBL/PEPPOL BIS 3.0 matching & payments.",
      },
    ],
  }),
  component: Invoices,
});

type InvoiceRecord = {
  id: string;
  invoice_number: string;
  total_amount: number;
  currency: "NGN" | "USD";
  purchase_order_id: string | null;
  seller_legal_name: string;
  seller_tin: string | null;
  due_date: string;
  status: string;
  vat_amount: number;
  irn: string | null;
  purchase_orders?: unknown;
};

function Invoices() {
  const me = useMe();
  const queryClient = useQueryClient();
  const [selectedPoId, setSelectedPoId] = useState<string>("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [currency, setCurrency] = useState<"NGN" | "USD">("NGN");
  const [amount, setAmount] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [sellerTin, setSellerTin] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerTin, setBuyerTin] = useState("");
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<InvoiceRecord | null>(
    null,
  );
  const [payMethod, setPayMethod] = useState<
    "bank_transfer" | "virtual_account" | "invoice_billing" | "card"
  >("bank_transfer");
  const [payRef, setPayRef] = useState("");

  const { data: pos } = useQuery({
    queryKey: ["approved-pos-invoices"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("purchase_orders")
          .select(
            "id, po_number, total_amount, settlement_currency, supplier_id, suppliers(name, tin_number)",
          )
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data ?? [];
      } catch (err) {
        console.warn("Failed fetching POs for invoice link:", err);
        return [];
      }
    },
  });

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("invoices")
          .select("*, purchase_orders(po_number, total_amount, settlement_currency)")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return (data as unknown as InvoiceRecord[]) ?? [];
      } catch (err) {
        console.warn("Failed fetching invoices:", err);
        return [];
      }
    },
  });

  const createInvoice = useMutation({
    mutationFn: async () => {
      if (!invoiceNumber.trim() || !amount)
        throw new Error("Invoice number and total amount are required.");
      const totalNum = Number(amount) || 0;
      const vatNum = totalNum * 0.075;
      const subtotalNum = totalNum - vatNum;

      await createInvoiceFn({
        data: {
          purchaseOrderId: selectedPoId || undefined,
          invoiceNumber: invoiceNumber.trim(),
          dueDate: dueDate || new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
          currency,
          subtotal: subtotalNum,
          vatAmount: vatNum,
          totalAmount: totalNum,
          sellerLegalName: sellerName.trim() || "Supplier Company Ltd",
          sellerTin: sellerTin.trim() || undefined,
          buyerLegalName: buyerName.trim() || "Buyer Entity Ltd",
          buyerTin: buyerTin.trim() || undefined,
          items: [
            {
              description: `Invoice ${invoiceNumber}`,
              quantity: 1,
              unitPrice: subtotalNum,
              vatRate: 7.5,
              totalAmount: totalNum,
            },
          ],
        },
      });
    },
    onSuccess: async () => {
      toast.success("Supplier invoice logged & queued for 3-way matching.");
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      resetForm();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed logging invoice."),
  });

  const recordPay = useMutation({
    mutationFn: async () => {
      if (!selectedInvoiceForPayment) return;
      await recordPaymentFn({
        data: {
          invoiceId: selectedInvoiceForPayment.id,
          purchaseOrderId: selectedInvoiceForPayment.purchase_order_id || undefined,
          amount: selectedInvoiceForPayment.total_amount,
          currency: selectedInvoiceForPayment.currency,
          paymentMethod: payMethod,
          paymentReference: payRef.trim() || undefined,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Payment recorded & invoice marked paid.");
      setSelectedInvoiceForPayment(null);
      setPayRef("");
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed recording payment."),
  });

  function resetForm() {
    setSelectedPoId("");
    setInvoiceNumber("");
    setDueDate("");
    setAmount("");
    setSellerName("");
    setSellerTin("");
    setBuyerName("");
    setBuyerTin("");
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Invoices & Three-Way Matching"
        subtitle="Match Purchase Orders, Goods-Received Notes, and Supplier Invoices with NRS e-invoicing compliance (UBL/PEPPOL BIS 3.0)."
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          createInvoice.mutate();
        }}
        className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4 shadow-xs"
      >
        <h2 className="font-display text-xl uppercase tracking-wide flex items-center gap-2">
          <ReceiptText className="h-5 w-5 text-primary" /> Capture Supplier Invoice
        </h2>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="inv-num">Invoice Number</Label>
            <Input
              id="inv-num"
              required
              className="h-12"
              placeholder="e.g. INV-2026-081"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Link Purchase Order</Label>
            <Select
              value={selectedPoId}
              onValueChange={(val) => {
                setSelectedPoId(val);
                const po = pos?.find((p) => p.id === val);
                if (po) {
                  setAmount(String(po.total_amount));
                  setCurrency(po.settlement_currency as "NGN" | "USD");
                  const rawSupp = po.suppliers;
                  const supp = Array.isArray(rawSupp)
                    ? rawSupp[0]
                    : (rawSupp as { name?: string; tin_number?: string } | null);
                  setSellerName(supp?.name ?? "");
                  setSellerTin(supp?.tin_number ?? "");
                }
              }}
            >
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Choose PO..." />
              </SelectTrigger>
              <SelectContent>
                {(pos ?? []).map((po) => (
                  <SelectItem key={po.id} value={po.id}>
                    {po.po_number} (
                    {money(po.total_amount, po.settlement_currency as "NGN" | "USD")})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-amt">Total Amount</Label>
            <Input
              id="inv-amt"
              type="number"
              required
              className="h-12"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="due-date">Due Date</Label>
            <Input
              id="due-date"
              type="date"
              className="h-12"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="s-name">Seller Legal Name</Label>
            <Input
              id="s-name"
              className="h-12"
              placeholder="Supplier Company Ltd"
              value={sellerName}
              onChange={(e) => setSellerName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-tin">Seller NRS TIN</Label>
            <Input
              id="s-tin"
              className="h-12"
              placeholder="12345678-0001"
              value={sellerTin}
              onChange={(e) => setSellerTin(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-name">Buyer Legal Name</Label>
            <Input
              id="b-name"
              className="h-12"
              placeholder="Buyer Organisation Ltd"
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-tin">Buyer NRS TIN</Label>
            <Input
              id="b-tin"
              className="h-12"
              placeholder="87654321-0001"
              value={buyerTin}
              onChange={(e) => setBuyerTin(e.target.value)}
            />
          </div>
        </div>

        <Button
          type="submit"
          disabled={createInvoice.isPending || !invoiceNumber}
          className="h-12 w-full sm:w-auto px-6 font-semibold"
        >
          {createInvoice.isPending ? "Logging Invoice..." : "Log & Reconcile Invoice"}
        </Button>
      </form>

      {/* Invoice Records & 3-Way Match Status List */}
      <section className="space-y-3">
        <h2 className="font-display text-xl uppercase tracking-wide">
          Invoices & Reconciliation Queue
        </h2>

        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading invoices...</p>
        ) : !invoices?.length ? (
          <EmptyState
            title="No invoices logged yet"
            body="Log supplier invoices above to run automated 3-way matching against issued POs and goods-received receipts."
          />
        ) : (
          <div className="space-y-3">
            {invoices.map((inv) => {
              const rawPo = inv.purchase_orders;
              const po = Array.isArray(rawPo)
                ? rawPo[0]
                : (rawPo as { po_number: string; total_amount: number } | null);
              const poAmount = po?.total_amount ?? 0;
              const isMatched = Math.abs(inv.total_amount - poAmount) < 0.01;

              return (
                <article
                  key={inv.id}
                  className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-3 shadow-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-display text-xl font-bold uppercase">
                          {inv.invoice_number}
                        </span>
                        <StatusPill status={inv.status} label={inv.status.replace("_", " ")} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Seller:{" "}
                        <span className="font-medium text-foreground">{inv.seller_legal_name}</span>{" "}
                        (TIN: {inv.seller_tin || "N/A"}) · Due: {shortDate(inv.due_date)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-2xl font-bold tabular-nums">
                        {money(inv.total_amount, inv.currency)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        VAT (7.5%): {money(inv.vat_amount, inv.currency)}
                      </p>
                    </div>
                  </div>

                  {/* 3-Way Match Banner */}
                  <div
                    className={`rounded-lg border p-3 text-xs flex items-center justify-between ${
                      isMatched
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "border-destructive/30 bg-destructive/10 text-destructive"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isMatched ? (
                        <ShieldCheck className="h-4 w-4 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                      )}
                      <span>
                        {isMatched
                          ? "3-Way Match Passed: Invoice amount aligns with PO total."
                          : `3-Way Match Discrepancy: Invoice (${money(inv.total_amount)}) differs from PO (${money(poAmount)})`}
                      </span>
                    </div>

                    <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold">
                      NRS IRN: {inv.irn || "Pending clearance"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-t border-border/50 pt-2 text-xs">
                    <span className="text-muted-foreground">
                      PO Link: {po?.po_number || "Unlinked"}
                    </span>
                    {inv.status !== "paid" && (
                      <Button
                        size="sm"
                        className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                        onClick={() => setSelectedInvoiceForPayment(inv)}
                      >
                        <CreditCard className="mr-1.5 h-3.5 w-3.5" /> Record Settlement Payment
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Payment Settlement Modal */}
      <Dialog
        open={!!selectedInvoiceForPayment}
        onOpenChange={(open) => !open && setSelectedInvoiceForPayment(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-emerald-600" /> Record Invoice Payment
            </DialogTitle>
            <DialogDescription>
              Record settlement payment for invoice {selectedInvoiceForPayment?.invoice_number} (
              {money(
                selectedInvoiceForPayment?.total_amount ?? 0,
                selectedInvoiceForPayment?.currency,
              )}
              ).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label>Payment Collection Method</Label>
              <Select
                value={payMethod}
                onValueChange={(v) =>
                  setPayMethod(
                    v as "bank_transfer" | "virtual_account" | "invoice_billing" | "card",
                  )
                }
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Direct Bank Transfer</SelectItem>
                  <SelectItem value="virtual_account">Dedicated Virtual Account</SelectItem>
                  <SelectItem value="invoice_billing">Vendor Invoice Billing</SelectItem>
                  <SelectItem value="card">PCI-DSS Gateway Card</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="pay-ref">Bank Reference / Transaction ID</Label>
              <Input
                id="pay-ref"
                className="h-11"
                placeholder="e.g. NIP-TXN-8819203"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedInvoiceForPayment(null)}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              disabled={recordPay.isPending}
              onClick={() => recordPay.mutate()}
            >
              {recordPay.isPending ? "Recording..." : "Confirm Settlement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
