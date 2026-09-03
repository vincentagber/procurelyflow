"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Truck, Camera, WifiOff, RefreshCw, CheckCircle2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { createDeliveryReceiptFn } from "@/lib/procurement.functions";
import { money, dateTime } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/procurely/bits";
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
import {
  saveDeliveryToOfflineQueue,
  getQueuedDeliveries,
  registerAutoSyncListener,
  type QueuedDeliveryRecord,
} from "@/lib/offlineSyncQueue";

export default function DeliveriesPage() {
  const queryClient = useQueryClient();
  const [selectedPoId, setSelectedPoId] = useState<string>("");
  const [deliveryNoteRef, setDeliveryNoteRef] = useState("");
  const [status, setStatus] = useState<"accepted" | "partial" | "rejected">("accepted");
  const [qualityObs, setQualityObs] = useState("");
  const [photos, setPhotos] = useState<{ path: string; name: string }[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [queuedItems, setQueuedItems] = useState<QueuedDeliveryRecord[]>([]);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    setQueuedItems(getQueuedDeliveries());
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    const cleanupSync = registerAutoSyncListener(async (record) => {
      await createDeliveryReceiptFn({
        data: {
          purchaseOrderId: record.purchaseOrderId,
          deliveryNoteRef: record.deliveryNoteRef,
          status: record.status,
          qualityObservations: record.qualityObservations,
          photos: record.photos,
          items: record.items,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      toast.success("Queued delivery synced to cloud.");
      return true;
    });

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
      cleanupSync();
    };
  }, [queryClient]);

  const { data: pos } = useQuery({
    queryKey: ["approved-pos"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("purchase_orders")
          .select("id, po_number, total_amount, settlement_currency, requisition_id")
          .order("issued_at", { ascending: false });
        if (error) throw error;
        return data ?? [];
      } catch {
        return [];
      }
    },
  });

  const { data: receipts, isLoading } = useQuery({
    queryKey: ["deliveries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_receipts")
        .select("*, purchase_orders(po_number, suppliers(name))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const createReceipt = useMutation({
    mutationFn: async () => {
      if (!isOnline) {
        saveDeliveryToOfflineQueue({
          purchaseOrderId: selectedPoId,
          deliveryNoteRef,
          status,
          qualityObservations: qualityObs,
          photos,
          items: [],
        });
        setQueuedItems(getQueuedDeliveries());
        toast.info("No connection. Inspection saved to offline queue and will sync automatically.");
        return;
      }

      await createDeliveryReceiptFn({
        data: {
          purchaseOrderId: selectedPoId,
          deliveryNoteRef,
          status,
          qualityObservations: qualityObs,
          photos,
          items: [],
        },
      });
    },
    onSuccess: async () => {
      if (isOnline) {
        toast.success("Goods receipt note (GRN) created.");
        await queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      }
      setSelectedPoId("");
      setDeliveryNoteRef("");
      setQualityObs("");
      setPhotos([]);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't record delivery."),
  });

  return (
    <div className="space-y-6 pb-12 font-sans">
      <PageHeader
        title="Delivery & Inspection"
        subtitle="Record site goods receipts and quality inspections with offline sync."
      />

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        {/* Record Inspection Form */}
        <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-xs">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#111315]">
            Record Goods Received (GRN)
          </h2>

          <div className="mt-4 space-y-3.5">
            <div className="space-y-1">
              <Label className="text-xs">Purchase Order</Label>
              <Select value={selectedPoId} onValueChange={setSelectedPoId}>
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue placeholder="Select an issued PO" />
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
              <Label className="text-xs">Waybill / Delivery Note Ref</Label>
              <Input
                placeholder="e.g. WB-99201"
                value={deliveryNoteRef}
                onChange={(e) => setDeliveryNoteRef(e.target.value)}
                className="h-10 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Inspection Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as "accepted" | "partial" | "rejected")}
              >
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="accepted">Accepted (100% Passed Quality)</SelectItem>
                  <SelectItem value="partial">Partial Acceptance</SelectItem>
                  <SelectItem value="rejected">Rejected (Damaged / Non-Compliant)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Quality Observations</Label>
              <Textarea
                rows={2}
                placeholder="Observed condition, packaging, batch tags..."
                value={qualityObs}
                onChange={(e) => setQualityObs(e.target.value)}
                className="text-xs"
              />
            </div>

            <Button
              disabled={!selectedPoId || createReceipt.isPending}
              onClick={() => createReceipt.mutate()}
              className="w-full bg-[#111315] text-xs font-semibold text-white hover:bg-[#202428]"
            >
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Log Delivery Receipt
            </Button>
          </div>
        </section>

        {/* Deliveries List */}
        <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-xs">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#111315]">
            Delivery History ({receipts?.length ?? 0})
          </h2>

          <div className="mt-3 overflow-x-auto rounded-lg border border-[#E5E7EB]">
            {isLoading ? (
              <p className="p-5 text-xs text-[#6B7280]">Loading delivery records…</p>
            ) : !receipts?.length ? (
              <EmptyState
                title="No deliveries recorded yet"
                body="When receiving officers inspect deliveries on site, all GRNs appear here."
              />
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F9FAFB] text-[11px] font-semibold text-[#6B7280]">
                  <tr>
                    <th className="px-3 py-2.5">GRN #</th>
                    <th className="px-3 py-2.5">PO Number</th>
                    <th className="px-3 py-2.5">Supplier</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Received Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {receipts.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-3 font-mono font-bold text-[#111315]">
                        {(r as any).grn_number || r.id.slice(0, 8)}
                      </td>
                      <td className="px-3 py-3 font-mono text-[#6B7280]">
                        {(r.purchase_orders as { po_number?: string })?.po_number ?? "—"}
                      </td>
                      <td className="px-3 py-3 font-medium text-[#111315]">
                        {(r.purchase_orders as { suppliers?: { name?: string } })?.suppliers
                          ?.name ?? "Supplier"}
                      </td>
                      <td className="px-3 py-3">
                        <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 uppercase">
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-[#6B7280]">{dateTime(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
