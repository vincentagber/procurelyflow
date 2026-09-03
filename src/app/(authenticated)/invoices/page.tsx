"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export default function InvoicesPage() {
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
      } catch {
        return [];
      }
    },
  });

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, purchase_orders(po_number)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as InvoiceRecord[]) ?? [];
    },
  });

  const createInvoice = useMutation({
    mutationFn: () =>
      createInvoiceFn({
        data: {
          purchaseOrderId: selectedPoId || undefined,
          invoiceNumber,
          dueDate,
          currency,
          totalAmount: Number(amount),
          sellerLegalName: sellerName,
          sellerTin: sellerTin || undefined,
          buyerLegalName: buyerName || "Buyer Org",
          buyerTin: buyerTin || undefined,
          lineItems: [
            {
              description: "Goods / Materials",
              quantity: 1,
              unitPrice: Number(amount),
              vatRate: 0.075,
            },
          ],
        },
      }),
    onSuccess: async (res) => {
      toast.success(
        (res as any)?.isMatched
          ? "Invoice passed 3-way match. Qualified for payment release."
          : "Invoice recorded successfully.",
      );
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setInvoiceNumber("");
      setAmount("");
      setSelectedPoId("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't record invoice."),
  });

  const recordPayment = useMutation({
    mutationFn: () =>
      recordPaymentFn({
        data: {
          invoiceId: selectedInvoiceForPayment!.id,
          amount: selectedInvoiceForPayment!.total_amount,
          currency: selectedInvoiceForPayment!.currency,
          paymentMethod: payMethod,
          paymentReference: payRef,
        },
      }),
    onSuccess: async () => {
      toast.success("Payment recorded.");
      setSelectedInvoiceForPayment(null);
      setPayRef("");
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't record payment."),
  });

  return (
    <div className="space-y-6 pb-12 font-sans">
      <PageHeader
        title="Invoices & 3-Way Match"
        subtitle="Match supplier invoices against POs and GRN delivery receipts before releasing payment."
      />

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        {/* Record Invoice Form */}
        <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-xs">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#111315]">
            Record Supplier Invoice
          </h2>

          <div className="mt-4 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Purchase Order Link</Label>
              <Select
                value={selectedPoId}
                onValueChange={(id) => {
                  setSelectedPoId(id);
                  const p = (pos ?? []).find((item) => item.id === id);
                  if (p) {
                    setAmount(String(p.total_amount));
                    setCurrency(p.settlement_currency as "NGN" | "USD");
                    const supp = p.suppliers as { name?: string; tin_number?: string } | null;
                    if (supp?.name) setSellerName(supp.name);
                    if (supp?.tin_number) setSellerTin(supp.tin_number);
                  }
                }}
              >
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue placeholder="Select issued PO" />
                </SelectTrigger>
                <SelectContent>
                  {(pos ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.po_number} ({money(p.total_amount, p.settlement_currency as "NGN" | "USD")}
                      )
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Invoice Number</Label>
              <Input
                placeholder="e.g. INV-9902"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="h-10 text-xs"
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Amount</Label>
                <Input
                  type="number"
                  placeholder="Total Amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-10 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Due Date</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-10 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Seller Name</Label>
              <Input
                placeholder="Supplier Legal Name"
                value={sellerName}
                onChange={(e) => setSellerName(e.target.value)}
                className="h-10 text-xs"
              />
            </div>

            <Button
              disabled={!invoiceNumber || !amount || createInvoice.isPending}
              onClick={() => createInvoice.mutate()}
              className="mt-2 w-full bg-[#111315] text-xs font-semibold text-white hover:bg-[#202428]"
            >
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Run 3-Way Match & Save
            </Button>
          </div>
        </section>

        {/* Invoices List */}
        <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-xs">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#111315]">
            Invoices & Payment Queue ({invoices?.length ?? 0})
          </h2>

          <div className="mt-3 overflow-x-auto rounded-lg border border-[#E5E7EB]">
            {isLoading ? (
              <p className="p-5 text-xs text-[#6B7280]">Loading invoices…</p>
            ) : !invoices?.length ? (
              <EmptyState
                title="No invoices recorded yet"
                body="Record supplier invoices to trigger automated 3-way matching and payment verification."
              />
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F9FAFB] text-[11px] font-semibold text-[#6B7280]">
                  <tr>
                    <th className="px-3 py-2.5">Invoice #</th>
                    <th className="px-3 py-2.5">PO #</th>
                    <th className="px-3 py-2.5">Seller</th>
                    <th className="px-3 py-2.5">Amount</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="px-3 py-3 font-mono font-bold text-[#111315]">
                        {inv.invoice_number}
                      </td>
                      <td className="px-3 py-3 font-mono text-[#6B7280]">
                        {(inv.purchase_orders as { po_number?: string })?.po_number ?? "—"}
                      </td>
                      <td className="px-3 py-3 font-medium text-[#111315]">
                        {inv.seller_legal_name}
                      </td>
                      <td className="px-3 py-3 font-bold tabular-nums text-[#111315]">
                        {money(inv.total_amount, inv.currency)}
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill status={inv.status} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        {inv.status !== "paid" ? (
                          <Button
                            onClick={() => setSelectedInvoiceForPayment(inv)}
                            variant="outline"
                            className="h-8 text-[11px] font-semibold"
                          >
                            <CreditCard className="mr-1 h-3 w-3" /> Pay
                          </Button>
                        ) : (
                          <span className="text-[11px] font-medium text-emerald-600">Settled</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      {/* Payment Dialog */}
      <Dialog
        open={!!selectedInvoiceForPayment}
        onOpenChange={(o) => !o && setSelectedInvoiceForPayment(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Release Payment</DialogTitle>
            <DialogDescription>
              Record bank transfer or settlement for {selectedInvoiceForPayment?.invoice_number} (
              {selectedInvoiceForPayment &&
                money(selectedInvoiceForPayment.total_amount, selectedInvoiceForPayment.currency)}
              )
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Payment Method</Label>
              <Select
                value={payMethod}
                onValueChange={(v) =>
                  setPayMethod(
                    v as "bank_transfer" | "virtual_account" | "invoice_billing" | "card",
                  )
                }
              >
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Direct Bank Transfer</SelectItem>
                  <SelectItem value="virtual_account">Dedicated Virtual Account</SelectItem>
                  <SelectItem value="invoice_billing">Corporate Invoice Billing</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Payment Reference / Txn Hash</Label>
              <Input
                placeholder="e.g. NIBSS-TX-998822"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                className="h-10 text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedInvoiceForPayment(null)}>
              Cancel
            </Button>
            <Button
              disabled={recordPayment.isPending}
              onClick={() => recordPayment.mutate()}
              className="bg-[#111315] text-white"
            >
              Confirm Payment Release
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
