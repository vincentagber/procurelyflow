"use client";

import { use, useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, FileCheck2 } from "lucide-react";

import {
  getSupplierRfq,
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

type Line = {
  requisitionItemId: string;
  description: string;
  quantity: number;
  unitPrice: string;
  vatRate: string;
};

export default function SupplierQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const resolvedParams = use(params);
  const token = resolvedParams.token;

  const [lines, setLines] = useState<Line[]>([]);
  const [currency, setCurrency] = useState<"NGN" | "USD">("NGN");
  const [leadTime, setLeadTime] = useState("");
  const [terms, setTerms] = useState("");
  const [validity, setValidity] = useState("");
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
    if (data && !("error" in data) && (data.rfq as any)?.items) {
      setLines(
        (data.rfq as any).items.map((it: { id: string; description: string; quantity: number }) => ({
          requisitionItemId: it.id,
          description: it.description,
          quantity: it.quantity,
          unitPrice: "",
          vatRate: "0.075",
        })),
      );
    }
  }, [data]);

  const submit = useMutation({
    mutationFn: () =>
      submitQuoteFn({
        data: {
          token,
          currency,
          leadTimeDays: Number(leadTime) || 7,
          paymentTerms: terms || "Payment upon delivery and inspection",
          validityDate: validity || new Date(Date.now() + 14 * 86400000).toISOString(),
          items: lines.map((l) => ({
            requisitionItemId: l.requisitionItemId,
            unitPrice: Number(l.unitPrice) || 0,
            vatRate: Number(l.vatRate) || 0.075,
          })),
        },
      }),
    onSuccess: () => {
      toast.success("Your quote has been submitted securely.");
      setDone(true);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't submit quote."),
  });

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#111315] p-5 text-white">
        <p className="text-xs text-white/60">Verifying secure token…</p>
      </main>
    );
  }

  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F8F9FB] p-5">
        <div className="w-full max-w-md rounded-xl border border-[#E5E7EB] bg-white p-6 text-center shadow-xs">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
          <h1 className="mt-3 text-lg font-bold text-[#111315]">Quote Received</h1>
          <p className="mt-1 text-xs text-[#6B7280]">
            Your quotation has been encrypted and recorded. The buyer will review your submission
            after the closing window.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8F9FB] px-4 py-8 font-sans">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#F3F4F6] pb-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                Procurely Flow · Secure Supplier Portal
              </span>
              <h1 className="mt-1 text-lg font-bold text-[#111315]">Submit Your Quotation</h1>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Currency</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as "NGN" | "USD")}>
                  <SelectTrigger className="h-10 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NGN">NGN (₦)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Delivery Lead Time (Days)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 5"
                  value={leadTime}
                  onChange={(e) => setLeadTime(e.target.value)}
                  className="h-10 text-xs"
                />
              </div>
            </div>

            {/* Line Items Pricing */}
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-[#6B7280]">
                Item Pricing
              </Label>
              {lines.map((l, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-2 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-xs font-bold text-[#111315]">{l.description}</p>
                    <p className="text-[11px] text-[#6B7280]">Quantity: {l.quantity}</p>
                  </div>
                  <div className="w-full sm:w-40">
                    <Input
                      type="number"
                      placeholder={`Unit Price (${currency})`}
                      value={l.unitPrice}
                      onChange={(e) => {
                        const val = e.target.value;
                        setLines((prev) =>
                          prev.map((item, i) => (i === index ? { ...item, unitPrice: val } : item)),
                        );
                      }}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>

            <Button
              disabled={submit.isPending}
              onClick={() => submit.mutate()}
              className="mt-4 w-full bg-[#111315] text-xs font-semibold text-white hover:bg-[#202428]"
            >
              Submit Sealed Quotation
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
