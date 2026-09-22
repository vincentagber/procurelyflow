import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Receipt,
  FileText,
  CheckCircle2,
  AlertCircle,
  Building2,
  CreditCard,
  Plus,
  Search,
  ExternalLink,
  X,
  Clock,
  ArrowRight,
  Check,
  Info,
  ShieldCheck,
  FileSpreadsheet,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/useMe";
import {
  createInvoiceFn,
  recordPaymentFn,
  exportAccountingLedgerFn,
} from "@/lib/procurement.functions";
import { validateNrsVatInputCreditEligibility, generateUblPeppolJson } from "@/lib/nrsEInvoice";
import { money, shortDate } from "@/lib/format";
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/invoices")({
  head: () => ({
    meta: [
      { title: "Invoices & Three-Way Matching — Procurely Flow" },
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
  component: InvoicesPage,
});

interface DeliveryReceiptSummary {
  id: string;
  status: string;
  delivery_note_ref: string | null;
  delivered_at: string | null;
}

interface PurchaseOrderSummary {
  id: string;
  po_number: string;
  total_amount: number;
  settlement_currency: string;
  status: string;
  delivery_receipts?: DeliveryReceiptSummary[] | DeliveryReceiptSummary | null;
}

interface InvoiceRecord {
  id: string;
  invoice_number: string;
  total_amount: number;
  currency: "NGN" | "USD";
  purchase_order_id: string | null;
  seller_legal_name: string;
  seller_tin: string | null;
  buyer_legal_name?: string | null;
  buyer_tin?: string | null;
  issue_date?: string | null;
  due_date: string;
  vat_amount: number;
  irn: string | null;
  three_way_match_status?:
    "matched" | "discrepancy_flagged" | "pending" | "partial_receipt" | string | null;
  created_at?: string;
  purchase_orders?: PurchaseOrderSummary[] | PurchaseOrderSummary | null;
}

function normalizePo(raw: unknown): PurchaseOrderSummary | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return (raw[0] as PurchaseOrderSummary) ?? null;
  return raw as PurchaseOrderSummary;
}

function normalizeReceipts(po: PurchaseOrderSummary | null): DeliveryReceiptSummary[] {
  if (!po?.delivery_receipts) return [];
  if (Array.isArray(po.delivery_receipts)) return po.delivery_receipts;
  return [po.delivery_receipts];
}

function InvoicesPage() {
  const me = useMe();
  const queryClient = useQueryClient();

  // Intake Modal & Inspection Modal States
  const [isIntakeOpen, setIsIntakeOpen] = useState(false);
  const [inspectingInvoice, setInspectingInvoice] = useState<InvoiceRecord | null>(null);

  // Form State
  const [selectedPoId, setSelectedPoId] = useState<string>("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [currency, setCurrency] = useState<"NGN" | "USD">("NGN");
  const [amount, setAmount] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [sellerTin, setSellerTin] = useState("");
  const [buyerName, setBuyerName] = useState("Buyer Organisation Ltd");
  const [buyerTin, setBuyerTin] = useState("87654321-0001");

  // Payment Settlement Dialog State
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<InvoiceRecord | null>(
    null,
  );
  const [payMethod, setPayMethod] = useState<
    "bank_transfer" | "virtual_account" | "invoice_billing" | "card"
  >("bank_transfer");
  const [payRef, setPayRef] = useState("");

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "matched" | "variance" | "pending_delivery" | "paid"
  >("all");
  const [isExportingLedger, setIsExportingLedger] = useState(false);

  // Query Purchase Orders
  const { data: pos } = useQuery({
    queryKey: ["approved-pos-invoices"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("purchase_orders")
          .select(
            "id, po_number, total_amount, settlement_currency, supplier_id, suppliers(name, tax_id), delivery_receipts(id, status, delivery_note_ref, delivered_at)",
          )
          .order("issued_at", { ascending: false });
        if (error) throw error;
        return data ?? [];
      } catch (err) {
        console.warn("Failed fetching POs for invoice linkage:", err);
        return [];
      }
    },
  });

  // Query Invoices
  const { data: invoices, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("invoices")
          .select(
            "*, purchase_orders(id, po_number, total_amount, settlement_currency, status, delivery_receipts(id, status, delivery_note_ref, delivered_at))",
          )
          .order("created_at", { ascending: false });
        if (error) throw error;
        return (data as unknown as InvoiceRecord[]) ?? [];
      } catch (err) {
        console.warn("Failed fetching invoices:", err);
        return [];
      }
    },
  });

  // Create Invoice Mutation
  const createInvoice = useMutation({
    mutationFn: async () => {
      if (!invoiceNumber.trim() || !amount) {
        throw new Error("Invoice number and total amount are required.");
      }
      const totalNum = Number(amount) || 0;
      const vatNum = totalNum * 0.075;
      const subtotalNum = totalNum - vatNum;

      await createInvoiceFn({
        data: {
          purchaseOrderId: selectedPoId || undefined,
          invoiceNumber: invoiceNumber.trim(),
          dueDate: dueDate || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
          currency,
          subtotal: subtotalNum,
          vatAmount: vatNum,
          totalAmount: totalNum,
          sellerLegalName: sellerName.trim() || "Supplier Company Ltd",
          sellerTin: sellerTin.trim() || undefined,
          buyerLegalName: buyerName.trim() || "Buyer Organisation Ltd",
          buyerTin: buyerTin.trim() || undefined,
          items: [
            {
              description: `Invoice item ${invoiceNumber.trim()}`,
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
      toast.success("Invoice recorded successfully.");
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      resetForm();
      setIsIntakeOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed logging invoice."),
  });

  // Record Payment Mutation
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
      toast.success("Payment recorded and marked settled.");
      setSelectedInvoiceForPayment(null);
      setPayRef("");
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed recording settlement."),
  });

  async function handleExportLedger() {
    try {
      setIsExportingLedger(true);
      const res = await exportAccountingLedgerFn();
      const blob = new Blob([res.csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        res.filename || `procurely-accounting-ledger-${new Date().toISOString().slice(0, 10)}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(
        `Exported ${res.recordCount} accounting lines. SHA-256: ${res.checksum.slice(0, 10)}…`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to export accounting ledger.");
    } finally {
      setIsExportingLedger(false);
    }
  }

  function resetForm() {
    setSelectedPoId("");
    setInvoiceNumber("");
    setDueDate("");
    setAmount("");
    setSellerName("");
    setSellerTin("");
    setBuyerName("Buyer Organisation Ltd");
    setBuyerTin("87654321-0001");
  }

  function handlePoChange(val: string) {
    setSelectedPoId(val);
    const po = pos?.find((p) => p.id === val);
    if (po) {
      setAmount(String(po.total_amount));
      setCurrency((po.settlement_currency as "NGN" | "USD") || "NGN");
      const rawSupp = po.suppliers;
      const supp = Array.isArray(rawSupp)
        ? rawSupp[0]
        : (rawSupp as { name?: string; tax_id?: string } | null);
      if (supp?.name) setSellerName(supp.name);
      if (supp?.tax_id) setSellerTin(supp.tax_id);
    }
  }

  function loadScenario(type: "matched" | "variance") {
    setIsIntakeOpen(true);
    const firstPo = pos && pos.length > 0 ? pos[0] : null;
    if (type === "matched") {
      setInvoiceNumber("INV-2026-088");
      setAmount("4850000");
      setCurrency("NGN");
      setSellerName("Atlantic Turbines & Spares Ltd");
      setSellerTin("10982341-0001");
      setDueDate(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
      if (firstPo) {
        setSelectedPoId(firstPo.id);
      }
      toast.info("Populated standard 3-way matched scenario.");
    } else {
      setInvoiceNumber("INV-2026-092");
      setAmount("5200000");
      setCurrency("NGN");
      setSellerName("Atlantic Turbines & Spares Ltd");
      setSellerTin("10982341-0001");
      setDueDate(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
      if (firstPo) {
        setSelectedPoId(firstPo.id);
      }
      toast.info("Populated price variance exception scenario.");
    }
  }

  // Dynamic calculations for current draft
  const draftGross = Number(amount) || 0;
  const draftVat = draftGross * 0.075;
  const draftNet = draftGross - draftVat;
  const draftWht = draftNet * 0.02;
  const draftPayable = draftGross - draftWht;

  const linkedPo = pos?.find((p) => p.id === selectedPoId);
  const poTotal = linkedPo ? Number(linkedPo.total_amount) || 0 : 0;
  const draftVariance = linkedPo && draftGross > 0 ? draftGross - poTotal : 0;
  const isDraftMatch = linkedPo && draftGross > 0 && Math.abs(draftVariance) < 0.05;

  // Filter invoices
  const filteredInvoices = useMemo(() => {
    const list = invoices ?? [];
    const q = searchQuery.toLowerCase().trim();

    return list.filter((inv) => {
      const po = normalizePo(inv.purchase_orders);
      const receipts = normalizeReceipts(po);
      const pAmt = po ? Number(po.total_amount) || 0 : 0;
      const isPriceMatch = po ? Math.abs(inv.total_amount - pAmt) < 0.05 : false;
      const hasAcceptedGrn = receipts.some(
        (r) => r.status === "accepted" || r.status === "partially_accepted",
      );

      const isMatched =
        inv.three_way_match_status === "matched" || (po && isPriceMatch && hasAcceptedGrn);
      const isDiscrepancy =
        inv.three_way_match_status === "discrepancy_flagged" || (po && !isPriceMatch);
      const isPendingDelivery =
        inv.three_way_match_status === "pending" || (po && isPriceMatch && !hasAcceptedGrn);

      const matchesSearch =
        !q ||
        inv.invoice_number.toLowerCase().includes(q) ||
        (inv.seller_legal_name || "").toLowerCase().includes(q) ||
        (inv.seller_tin || "").toLowerCase().includes(q) ||
        (po?.po_number || "").toLowerCase().includes(q);

      if (!matchesSearch) return false;

      if (statusFilter === "all") return true;
      if (statusFilter === "paid") return inv.status === "paid";
      if (statusFilter === "matched") return isMatched;
      if (statusFilter === "variance") return isDiscrepancy;
      if (statusFilter === "pending_delivery") return isPendingDelivery;

      return true;
    });
  }, [invoices, searchQuery, statusFilter]);

  return (
    <div className="space-y-6 pb-16 max-w-7xl mx-auto">
      {/* 1. Clean, High-Trust Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
            Invoices &amp; Three-Way Matching
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Reconcile purchase orders, warehouse delivery receipts (GRN), and supplier invoices
            before payment authorization.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            variant="outline"
            disabled={isExportingLedger}
            onClick={handleExportLedger}
            className="h-9 px-3.5 rounded-lg text-xs font-semibold border-slate-200 text-slate-700 hover:bg-slate-50 shadow-2xs gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            <span>{isExportingLedger ? "Generating Ledger…" : "Export Accounting CSV"}</span>
          </Button>

          <Button
            onClick={() => {
              resetForm();
              setIsIntakeOpen(true);
            }}
            className="h-9 px-4 rounded-lg text-xs font-medium bg-[#0B1457] hover:bg-[#0001FF] text-white shadow-xs transition-colors gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Open Intake Workbench</span>
          </Button>
        </div>
      </div>

      {/* 2. Tripartite Matching Overview Strip */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 font-semibold text-xs">
              01
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-900">Purchase Order</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Approved line-item quantity and contracted unit rate.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 border-t sm:border-t-0 sm:border-l border-slate-100 pt-3 sm:pt-0 sm:pl-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 font-semibold text-xs">
              02
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-900">Delivery Receipt (GRN)</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Warehouse receiving confirmation and inspection sign-off.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 border-t sm:border-t-0 sm:border-l border-slate-100 pt-3 sm:pt-0 sm:pl-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 font-semibold text-xs">
              03
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-900">Supplier Invoice</p>
              <p className="text-xs text-slate-500 mt-0.5">
                NRS TIN validation, 7.5% VAT, and 2% statutory WHT.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Accounts Payable Reconciliation Register */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs space-y-5">
        {/* Table Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Invoice Register</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
              {filteredInvoices.length}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative w-full sm:w-60">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                type="text"
                placeholder="Search invoices…"
                className="h-10 rounded-lg border-slate-200 bg-white pl-8 text-xs shadow-2xs placeholder:text-slate-400 focus-visible:border-[#0B1457]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <Select
              value={statusFilter}
              onValueChange={(val) =>
                setStatusFilter(val as "all" | "matched" | "variance" | "pending_delivery" | "paid")
              }
            >
              <SelectTrigger className="h-10 rounded-lg border-slate-200 bg-white text-xs shadow-2xs w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="matched">3-Way Matched</SelectItem>
                <SelectItem value="variance">Price Variances</SelectItem>
                <SelectItem value="pending_delivery">Pending Delivery</SelectItem>
                <SelectItem value="paid">Settled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Invoices Table */}
        {isLoading ? (
          <div className="py-12 text-center text-xs text-slate-500">Loading invoices…</div>
        ) : !filteredInvoices.length ? (
          <div className="py-14 text-center space-y-3">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-900">No invoices recorded</p>
              <p className="text-xs text-slate-500 mt-0.5 max-w-sm mx-auto">
                Supplier invoices logged against authorized purchase orders will appear here for
                automated 3-way matching.
              </p>
            </div>
            <Button
              onClick={() => {
                resetForm();
                setIsIntakeOpen(true);
              }}
              variant="outline"
              size="sm"
              className="h-8 rounded-lg border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Open Intake Workbench
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-medium text-xs">
                <tr>
                  <th className="px-4 py-3">Invoice Ref</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Linked PO</th>
                  <th className="px-4 py-3">3-Way Reconciliation</th>
                  <th className="px-4 py-3 text-right">Total (Billed)</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.map((inv) => {
                  const po = normalizePo(inv.purchase_orders);
                  const receipts = normalizeReceipts(po);
                  const poAmt = po ? Number(po.total_amount) || 0 : 0;
                  const isPriceMatch = po ? Math.abs(inv.total_amount - poAmt) < 0.05 : false;
                  const hasAcceptedGrn = receipts.some(
                    (r) => r.status === "accepted" || r.status === "partially_accepted",
                  );
                  const isFullyMatched = po && isPriceMatch && hasAcceptedGrn;

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setInspectingInvoice(inv)}
                          className="font-mono font-bold text-[#0B1457] hover:underline tabular-nums"
                        >
                          {inv.invoice_number}
                        </button>
                        <p className="text-[11px] text-slate-500 tabular-nums">
                          Due: {shortDate(inv.due_date)}
                        </p>
                      </td>

                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900 truncate max-w-[170px]">
                          {inv.seller_legal_name}
                        </p>
                        <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                          TIN: {inv.seller_tin || "N/A"}
                        </p>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        {po ? (
                          <div>
                            <p className="font-mono font-semibold text-slate-900 tabular-nums">
                              {po.po_number}
                            </p>
                            <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                              {money(po.total_amount, po.settlement_currency as "NGN" | "USD")}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-xs">Unlinked</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {inv.three_way_match_status === "matched" || isFullyMatched ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                            <Check className="h-3 w-3" /> 3-Way Matched
                          </span>
                        ) : inv.three_way_match_status === "discrepancy_flagged" ||
                          (po && !isPriceMatch) ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-semibold text-rose-700 border border-rose-200">
                            <AlertCircle className="h-3 w-3" /> Discrepancy Flagged
                          </span>
                        ) : po && !hasAcceptedGrn ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                            <Clock className="h-3 w-3" /> Pending Delivery
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-200">
                            Unlinked
                          </span>
                        )}
                        <div className="mt-1">
                          {inv.irn &&
                          inv.irn.length >= 8 &&
                          inv.seller_tin &&
                          inv.seller_tin !== "UNREGISTERED" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-700 border border-emerald-200">
                              <ShieldCheck className="h-2.5 w-2.5" /> VAT Credit Eligible
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-semibold text-amber-800 border border-amber-200">
                              <AlertCircle className="h-2.5 w-2.5 text-amber-600" /> VAT Ineligible
                              (No IRN)
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap font-mono font-bold text-[#0B1457] tabular-nums">
                        {money(inv.total_amount, inv.currency)}
                      </td>

                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {inv.status === "paid" ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                            Settled
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-200">
                            Pending
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setInspectingInvoice(inv)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                            title="Inspect Details"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </button>

                          {inv.status !== "paid" && (
                            <Button
                              size="sm"
                              onClick={() => setSelectedInvoiceForPayment(inv)}
                              className="h-7 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-medium px-2.5 shadow-2xs transition-colors"
                            >
                              Settle
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Responsive Intake Workbench Modal */}
      <Dialog open={isIntakeOpen} onOpenChange={setIsIntakeOpen}>
        <DialogContent className="w-[95vw] sm:max-w-3xl lg:max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden font-sans">
          {/* Dialog Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 sm:p-6 border-b border-slate-200/80 bg-slate-50/60 shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-base sm:text-lg font-semibold tracking-tight text-slate-900">
                  Supplier Invoice Intake &amp; Match Workbench
                </DialogTitle>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-200/60 text-slate-700">
                  AP Form 3-Way
                </span>
              </div>
              <DialogDescription className="text-xs text-slate-500 mt-1 font-normal leading-normal">
                Record verified supplier invoices and run automated 3-way parity checks against
                authorized purchase orders.
              </DialogDescription>
            </div>

            <div className="flex items-center gap-1.5 self-start sm:self-auto bg-slate-100/90 p-1 rounded-lg border border-slate-200/70">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-1.5 hidden sm:inline select-none">
                Quick Demo:
              </span>
              <button
                type="button"
                onClick={() => loadScenario("matched")}
                className="rounded-md bg-white hover:bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-2xs border border-slate-200/80 transition-all hover:text-slate-950 cursor-pointer"
              >
                Matched Demo
              </button>
              <button
                type="button"
                onClick={() => loadScenario("variance")}
                className="rounded-md bg-white hover:bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-2xs border border-slate-200/80 transition-all hover:text-slate-950 cursor-pointer"
              >
                Variance Demo
              </button>
            </div>
          </div>

          {/* Dialog Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6">
            <div className="grid gap-6 lg:grid-cols-12">
              <form
                id="intake-invoice-form-route"
                onSubmit={(e) => {
                  e.preventDefault();
                  createInvoice.mutate();
                }}
                className="space-y-4 lg:col-span-7"
              >
                {/* PO Link */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-slate-700">
                      Link Purchase Order
                    </Label>
                    <span className="text-[11px] text-slate-400 font-normal">
                      Commitment Reference
                    </span>
                  </div>
                  <Select value={selectedPoId} onValueChange={handlePoChange}>
                    <SelectTrigger className="h-10 rounded-lg border-slate-200 bg-white text-xs font-medium text-slate-800 shadow-2xs hover:border-slate-300 focus:border-[#0B1457] focus:ring-1 focus:ring-[#0B1457]/20">
                      <SelectValue placeholder="Select PO to auto-populate terms…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {pos?.length ? (
                        pos.map((po) => (
                          <SelectItem key={po.id} value={po.id} className="text-xs font-medium">
                            <span className="font-semibold text-slate-900">{po.po_number}</span>
                            <span className="text-slate-500 mx-1.5">—</span>
                            <span className="tabular-nums font-medium text-slate-700">
                              {money(po.total_amount, po.settlement_currency as "NGN" | "USD")}
                            </span>
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="unlinked" disabled className="text-xs text-slate-400">
                          No purchase orders currently on file
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Invoice Number & Due Date */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="inv-num-route-modal"
                      className="text-xs font-medium text-slate-700"
                    >
                      Supplier Invoice Number
                    </Label>
                    <Input
                      id="inv-num-route-modal"
                      required
                      placeholder="e.g. INV-2026-081"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      className="h-10 rounded-lg border-slate-200 bg-white text-xs font-medium tracking-wide text-slate-900 shadow-2xs placeholder:text-slate-400 focus-visible:border-[#0B1457] focus-visible:ring-1 focus-visible:ring-[#0B1457]/20"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="inv-due-route-modal"
                      className="text-xs font-medium text-slate-700"
                    >
                      Due Date for Settlement
                    </Label>
                    <Input
                      id="inv-due-route-modal"
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="h-10 rounded-lg border-slate-200 bg-white text-xs font-medium text-slate-800 shadow-2xs focus-visible:border-[#0B1457] focus-visible:ring-1 focus-visible:ring-[#0B1457]/20"
                    />
                  </div>
                </div>

                {/* Amount & Currency */}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label
                      htmlFor="inv-amt-route-modal"
                      className="text-xs font-medium text-slate-700"
                    >
                      Gross Billed Amount
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 select-none">
                        {currency === "NGN" ? "₦" : "$"}
                      </span>
                      <Input
                        id="inv-amt-route-modal"
                        type="number"
                        step="0.01"
                        required
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="h-10 rounded-lg border-slate-200 bg-white pl-7 text-sm font-semibold tracking-tight tabular-nums text-slate-900 shadow-2xs placeholder:text-slate-400 focus-visible:border-[#0B1457] focus-visible:ring-1 focus-visible:ring-[#0B1457]/20"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-700">Currency</Label>
                    <div className="flex h-10 rounded-lg border border-slate-200 p-1 bg-slate-100/70">
                      <button
                        type="button"
                        onClick={() => setCurrency("NGN")}
                        className={cn(
                          "flex-1 rounded-md text-xs font-semibold transition-all flex items-center justify-center gap-1 cursor-pointer",
                          currency === "NGN"
                            ? "bg-white text-slate-900 shadow-2xs font-bold"
                            : "text-slate-500 hover:text-slate-800",
                        )}
                      >
                        <span>NGN</span>
                        <span className="text-[10px] text-slate-400">(₦)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrency("USD")}
                        className={cn(
                          "flex-1 rounded-md text-xs font-semibold transition-all flex items-center justify-center gap-1 cursor-pointer",
                          currency === "USD"
                            ? "bg-white text-slate-900 shadow-2xs font-bold"
                            : "text-slate-500 hover:text-slate-800",
                        )}
                      >
                        <span>USD</span>
                        <span className="text-[10px] text-slate-400">($)</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Seller Legal Entity & TIN */}
                <div className="grid gap-3 sm:grid-cols-2 pt-1">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="s-name-route-modal"
                      className="text-xs font-medium text-slate-700"
                    >
                      Seller Legal Entity
                    </Label>
                    <Input
                      id="s-name-route-modal"
                      placeholder="Supplier Company Ltd"
                      value={sellerName}
                      onChange={(e) => setSellerName(e.target.value)}
                      className="h-10 rounded-lg border-slate-200 bg-white text-xs font-medium text-slate-800 shadow-2xs placeholder:text-slate-400 focus-visible:border-[#0B1457] focus-visible:ring-1 focus-visible:ring-[#0B1457]/20"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="s-tin-route-modal"
                      className="text-xs font-medium text-slate-700"
                    >
                      Seller Tax ID (TIN)
                    </Label>
                    <Input
                      id="s-tin-route-modal"
                      placeholder="12345678-0001"
                      value={sellerTin}
                      onChange={(e) => setSellerTin(e.target.value)}
                      className="h-10 rounded-lg border-slate-200 bg-white text-xs font-mono font-medium tracking-wide text-slate-800 shadow-2xs placeholder:text-slate-400 focus-visible:border-[#0B1457] focus-visible:ring-1 focus-visible:ring-[#0B1457]/20"
                    />
                  </div>
                </div>
              </form>

              {/* Right: Live Parity & Deduction Ledger Card */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5 lg:col-span-5 flex flex-col justify-between space-y-4">
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-200/80">
                    <div>
                      <span className="text-xs font-semibold text-slate-800 tracking-wide uppercase">
                        Parity &amp; Deduction Ledger
                      </span>
                      <p className="text-[11px] text-slate-500 font-normal">
                        Real-time 3-way reconciliation &amp; statutory tax audit
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 tracking-wider shrink-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      LIVE AUDIT
                    </span>
                  </div>

                  {linkedPo ? (
                    <div
                      className={cn(
                        "rounded-lg p-3 border text-xs flex items-start gap-2.5 shadow-2xs",
                        isDraftMatch
                          ? "bg-emerald-50/80 border-emerald-200 text-emerald-900"
                          : "bg-amber-50/80 border-amber-200 text-amber-900",
                      )}
                    >
                      {isDraftMatch ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold">
                          {isDraftMatch
                            ? "Zero Variance: Aligns with authorized PO commitment."
                            : `Variance Flagged: Differs by ${money(Math.abs(draftVariance), currency)} from PO.`}
                        </p>
                        <p className="text-[11px] opacity-80 mt-0.5 tabular-nums">
                          Linked PO: <span className="font-medium">{linkedPo.po_number}</span> (
                          {money(poTotal, currency)})
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg p-3 border border-slate-200 bg-white text-xs text-slate-500 flex items-center gap-2.5 shadow-2xs">
                      <Info className="h-4 w-4 text-slate-400 shrink-0" />
                      <span>
                        Select an authorized PO to verify price variance and GRN receipts.
                      </span>
                    </div>
                  )}

                  {/* Financial Accounting Breakdown Table */}
                  <div className="space-y-2 pt-1 text-xs">
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="font-medium text-slate-600">Gross Billed Total</span>
                      <span className="tabular-nums font-semibold text-slate-900 tracking-tight">
                        {money(draftGross, currency)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-500">
                      <span>Net Goods (Pre-Tax)</span>
                      <span className="tabular-nums font-medium text-slate-700">
                        {money(draftNet, currency)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <span>Standard VAT</span>
                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-200/60 px-1 py-0.2 rounded">
                          7.5%
                        </span>
                      </span>
                      <span className="tabular-nums font-medium text-slate-800">
                        +{money(draftVat, currency)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <span>Statutory WHT</span>
                        <span className="text-[10px] font-semibold text-amber-700 bg-amber-100/60 px-1 py-0.2 rounded">
                          2%
                        </span>
                      </span>
                      <span className="tabular-nums font-medium text-rose-600">
                        -{money(draftWht, currency)}
                      </span>
                    </div>

                    {/* Final Settlement Box */}
                    <div className="rounded-lg border border-slate-200 bg-white p-3 mt-3 shadow-2xs">
                      <div className="flex items-baseline justify-between gap-2">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Net Cash Payable to Vendor
                          </p>
                          <p className="text-[10px] text-slate-400 font-normal">
                            Post-WHT authorized release
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-base sm:text-lg font-bold tabular-nums tracking-tight text-[#0B1457]">
                            {money(draftPayable, currency)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2 pt-2.5 border-t border-slate-200/80 text-[11px] text-slate-500 leading-relaxed">
                  <ShieldCheck className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <p>
                    Automated 2% WHT credit certificates are generated on payment confirmation for
                    FIRS remittance.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Dialog Fixed Footer */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-5 border-t border-slate-200/80 bg-slate-50/50 shrink-0">
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
              <span>NRS e-Invoicing UBL/PEPPOL BIS 3.0 &amp; CAMA 2020 §375 compliant.</span>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsIntakeOpen(false)}
                className="h-9 px-4 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="intake-invoice-form-route"
                disabled={createInvoice.isPending || !invoiceNumber.trim() || !amount}
                className="h-9 px-5 rounded-lg bg-[#0B1457] hover:bg-[#0001FF] text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {createInvoice.isPending ? "Logging Invoice…" : "Log & Reconcile Invoice"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 5. Inspection Modal */}
      <Dialog
        open={!!inspectingInvoice}
        onOpenChange={(open) => !open && setInspectingInvoice(null)}
      >
        <DialogContent className="w-[95vw] max-w-xl p-5 sm:p-6 rounded-2xl border border-slate-200 bg-white shadow-xl">
          <DialogHeader className="border-b border-slate-100 pb-3 text-left">
            <DialogTitle className="text-base font-semibold text-slate-900">
              Invoice Details: {inspectingInvoice?.invoice_number}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-0.5">
              Three-way reconciliation parity breakdown against purchase order and site receipts.
            </DialogDescription>
          </DialogHeader>

          {inspectingInvoice && (
            <div className="space-y-4 py-2 text-xs">
              <div className="grid gap-2.5 sm:grid-cols-3">
                {/* 1. PO */}
                {(() => {
                  const po = normalizePo(inspectingInvoice.purchase_orders);
                  return (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-1">
                      <p className="text-[10px] font-semibold uppercase text-slate-500">
                        Purchase Order
                      </p>
                      <p className="font-semibold text-slate-900 truncate">
                        {po?.po_number || "Unlinked"}
                      </p>
                      <p className="font-mono font-bold text-xs text-[#0B1457] tabular-nums">
                        {po ? money(po.total_amount, po.settlement_currency as "NGN" | "USD") : "—"}
                      </p>
                    </div>
                  );
                })()}

                {/* 2. GRN */}
                {(() => {
                  const po = normalizePo(inspectingInvoice.purchase_orders);
                  const receipts = normalizeReceipts(po);
                  const latestReceipt = receipts[0];
                  const isAccepted =
                    latestReceipt?.status === "accepted" ||
                    latestReceipt?.status === "partially_accepted";

                  return (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-1">
                      <p className="text-[10px] font-semibold uppercase text-slate-500">
                        Delivery Receipt
                      </p>
                      <p className="font-semibold text-slate-900 truncate">
                        {latestReceipt?.delivery_note_ref || "GRN Receipt"}
                      </p>
                      <p
                        className={cn(
                          "font-medium text-xs",
                          isAccepted ? "text-emerald-700" : "text-amber-700",
                        )}
                      >
                        {isAccepted ? "Accepted" : "Pending Inspection"}
                      </p>
                    </div>
                  );
                })()}

                {/* 3. Invoice */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-1">
                  <p className="text-[10px] font-semibold uppercase text-slate-500">
                    Invoice Billed
                  </p>
                  <p className="font-semibold text-slate-900 truncate">
                    {inspectingInvoice.invoice_number}
                  </p>
                  <p className="font-mono font-bold text-xs text-[#0B1457] tabular-nums">
                    {money(inspectingInvoice.total_amount, inspectingInvoice.currency)}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-3 space-y-2 text-xs bg-white">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Seller:</span>
                  <span className="font-semibold text-slate-900">
                    {inspectingInvoice.seller_legal_name}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">TIN:</span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {inspectingInvoice.seller_tin || "N/A"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">VAT (7.5%):</span>
                  <span className="font-mono font-semibold text-[#0B1457] tabular-nums">
                    {money(inspectingInvoice.vat_amount, inspectingInvoice.currency)}
                  </span>
                </div>
              </div>

              {/* Statutory NRS e-Invoicing Compliance Panel (FR-7.4 & FR-7.5) */}
              {(() => {
                const assessment = validateNrsVatInputCreditEligibility({
                  irn: inspectingInvoice.irn,
                  vatAmount: inspectingInvoice.vat_amount,
                  sellerTin: inspectingInvoice.seller_tin,
                });

                return (
                  <div
                    className={`rounded-xl border p-3.5 space-y-2 text-xs ${
                      assessment.isEligibleForVatInputCredit
                        ? "border-emerald-200 bg-emerald-50/50"
                        : "border-amber-200 bg-amber-50/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold">
                        {assessment.isEligibleForVatInputCredit ? (
                          <>
                            <ShieldCheck className="h-4 w-4 text-emerald-600" />
                            <span className="text-emerald-900">NRS MBS Clearance Stamp: VALID</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="h-4 w-4 text-amber-600" />
                            <span className="text-amber-900">
                              NRS MBS Clearance: PENDING / UNVALIDATED
                            </span>
                          </>
                        )}
                      </div>
                      <span className="font-mono text-[11px] font-semibold text-slate-700">
                        IRN: {inspectingInvoice.irn || "None"}
                      </span>
                    </div>

                    <p
                      className={`text-[11px] leading-relaxed ${
                        assessment.isEligibleForVatInputCredit
                          ? "text-emerald-800"
                          : "text-amber-800"
                      }`}
                    >
                      {assessment.warningMessage ||
                        "Invoice verified through PEPPOL BIS 3.0 UBL clearance. Statutory VAT input-tax credit is eligible for reclaim on corporate filings."}
                    </p>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[10px] text-slate-600">
                      <span>
                        PEPPOL BIS 3.0 Customization ID: urn:peppol:pint:billing-1@nrs-mbs-1
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px] font-semibold text-[#0B1457] hover:bg-slate-200/60"
                        onClick={() => {
                          const json = generateUblPeppolJson({
                            invoiceNumber: inspectingInvoice.invoice_number,
                            issueDate:
                              inspectingInvoice.issue_date ||
                              new Date().toISOString().split("T")[0]!,
                            dueDate: inspectingInvoice.due_date,
                            sellerLegalName: inspectingInvoice.seller_legal_name,
                            ...(inspectingInvoice.seller_tin
                              ? { sellerTin: inspectingInvoice.seller_tin }
                              : {}),
                            buyerLegalName:
                              inspectingInvoice.buyer_legal_name || "Buyer Organisation",
                            ...(inspectingInvoice.buyer_tin
                              ? { buyerTin: inspectingInvoice.buyer_tin }
                              : {}),
                            currency: inspectingInvoice.currency,
                            subtotal: inspectingInvoice.total_amount - inspectingInvoice.vat_amount,
                            vatAmount: inspectingInvoice.vat_amount,
                            totalAmount: inspectingInvoice.total_amount,
                            items: [
                              {
                                description: `Materials/Services for ${inspectingInvoice.invoice_number}`,
                                quantity: 1,
                                unitPrice:
                                  inspectingInvoice.total_amount - inspectingInvoice.vat_amount,
                                vatRate: 7.5,
                                lineTotal:
                                  inspectingInvoice.total_amount - inspectingInvoice.vat_amount,
                              },
                            ],
                          });
                          navigator.clipboard?.writeText(json);
                          toast.success("PEPPOL BIS 3.0 UBL JSON copied to clipboard.");
                        }}
                      >
                        Export UBL JSON
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <DialogFooter className="border-t border-slate-100 pt-3 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setInspectingInvoice(null)}
              className="h-9 px-4 rounded-lg border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs"
            >
              Close
            </Button>
            {inspectingInvoice && inspectingInvoice.status !== "paid" && (
              <Button
                className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium shadow-xs transition-colors"
                onClick={() => {
                  const inv = inspectingInvoice;
                  setInspectingInvoice(null);
                  setSelectedInvoiceForPayment(inv);
                }}
              >
                Record Settlement
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 6. Settlement Modal */}
      <Dialog
        open={!!selectedInvoiceForPayment}
        onOpenChange={(open) => !open && setSelectedInvoiceForPayment(null)}
      >
        <DialogContent className="w-[95vw] max-w-md p-5 sm:p-6 rounded-2xl border border-slate-200 bg-white shadow-xl">
          <DialogHeader className="border-b border-slate-100 pb-3 text-left">
            <DialogTitle className="text-base font-semibold text-slate-900">
              Record Settlement Payment
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-0.5">
              Invoice {selectedInvoiceForPayment?.invoice_number} (
              {money(
                selectedInvoiceForPayment?.total_amount ?? 0,
                selectedInvoiceForPayment?.currency,
              )}
              ).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Payment Method</Label>
              <Select
                value={payMethod}
                onValueChange={(v) =>
                  setPayMethod(
                    v as "bank_transfer" | "virtual_account" | "invoice_billing" | "card",
                  )
                }
              >
                <SelectTrigger className="h-10 rounded-lg border-slate-200 bg-white text-xs shadow-2xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Commercial Bank Transfer (NIP)</SelectItem>
                  <SelectItem value="virtual_account">Dedicated Virtual Account</SelectItem>
                  <SelectItem value="invoice_billing">Vendor Clearing Account</SelectItem>
                  <SelectItem value="card">Corporate Purchasing Card</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pay-ref-input-final" className="text-xs font-semibold text-slate-700">
                Transaction Reference
              </Label>
              <Input
                id="pay-ref-input-final"
                className="h-10 rounded-lg border-slate-200 bg-white font-mono text-xs shadow-2xs placeholder:text-slate-400 focus-visible:border-[#0B1457]"
                placeholder="e.g. NIP-TXN-8819203"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="border-t border-slate-100 pt-3 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedInvoiceForPayment(null)}
              className="h-9 px-4 rounded-lg border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs"
            >
              Cancel
            </Button>
            <Button
              className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-xs transition-colors"
              disabled={recordPay.isPending}
              onClick={() => recordPay.mutate()}
            >
              {recordPay.isPending ? "Recording…" : "Confirm Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
