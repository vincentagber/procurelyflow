import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Truck, Camera, WifiOff, RefreshCw } from "lucide-react";

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
import { AttachmentThumbs } from "@/components/procurely/AttachmentThumbs";
import {
  saveDeliveryToOfflineQueue,
  getQueuedDeliveries,
  registerAutoSyncListener,
  type QueuedDeliveryRecord,
} from "@/lib/offlineSyncQueue";

export const Route = createFileRoute("/_authenticated/deliveries")({
  head: () => ({
    meta: [
      { title: "Delivery & Inspection — Procurely Flow" },
      {
        name: "description",
        content:
          "Record goods received on site, inspect items, attach delivery note photos, and track partial/rejected deliveries.",
      },
      { property: "og:title", content: "Delivery & Inspection — Procurely Flow" },
      { property: "og:description", content: "Site delivery and quality inspection records." },
    ],
  }),
  component: Deliveries,
});

function Deliveries() {
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
      } catch (err) {
        console.warn("Failed fetching purchase orders for delivery:", err);
        return [];
      }
    },
  });

  const { data: receipts, isLoading } = useQuery({
    queryKey: ["deliveries"],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("delivery_receipts")
          .select("*, purchase_orders(po_number)")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return (data ?? []) as {
          id: string;
          purchase_order_id: string;
          delivery_note_ref: string | null;
          status: "accepted" | "partial" | "rejected";
          quality_observations: string | null;
          photos: { path: string; name: string }[];
          receiving_officer_name: string;
          delivered_at: string;
          created_at: string;
          purchase_orders: { po_number: string } | null;
        }[];
      } catch (err) {
        console.warn("Failed fetching delivery receipts:", err);
        return [];
      }
    },
  });

  const handlePhotoUpload = async (file: File) => {
    try {
      setIsUploadingPhoto(true);
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `deliveries/${Date.now()}_${safeName}`;
      const { data, error } = await supabase.storage
        .from("requisition-attachments")
        .upload(path, file);

      if (error) throw error;
      setPhotos((prev) => [...prev, { path: data.path, name: file.name }]);
      toast.success("Photo attached.");
    } catch (err) {
      toast.error("Failed uploading photo.");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const createReceipt = useMutation({
    mutationFn: async () => {
      if (!selectedPoId) throw new Error("Select a Purchase Order.");
      const payload = {
        purchaseOrderId: selectedPoId,
        deliveryNoteRef,
        status,
        qualityObservations: qualityObs,
        photos,
        items: [],
      };

      if (!navigator.onLine) {
        saveDeliveryToOfflineQueue(payload);
        setQueuedItems(getQueuedDeliveries());
        toast.info(
          "Offline mode: Delivery saved to local queue. Will sync automatically when connected.",
        );
        resetForm();
        return;
      }

      await createDeliveryReceiptFn({ data: payload });
    },
    onSuccess: async () => {
      if (navigator.onLine) {
        toast.success("Goods-received delivery record logged.");
        await queryClient.invalidateQueries({ queryKey: ["deliveries"] });
        resetForm();
      }
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Failed logging delivery receipt."),
  });

  function resetForm() {
    setSelectedPoId("");
    setDeliveryNoteRef("");
    setStatus("accepted");
    setQualityObs("");
    setPhotos([]);
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Delivery & Inspection"
        subtitle="Log goods received on construction sites, verify items accepted vs rejected, and capture site delivery notes."
      />

      {!isOnline && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs font-semibold text-amber-600 dark:text-amber-400">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>
            Offline Mode Active — Inspections logged will queue locally and auto-sync when network
            returns.
          </span>
        </div>
      )}

      {queuedItems.length > 0 && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="flex items-center gap-1.5 text-primary">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> {queuedItems.length} Inspection(s)
              Queued Locally
            </span>
          </div>
          <div className="divide-y divide-border/50 text-xs">
            {queuedItems.map((q) => (
              <div key={q.id} className="py-1.5 flex items-center justify-between">
                <span>
                  Ref: {q.deliveryNoteRef || "N/A"} · Status: {q.status}
                </span>
                <span className="text-muted-foreground text-[10px]">
                  {new Date(q.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          createReceipt.mutate();
        }}
        className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4 shadow-xs"
      >
        <h2 className="font-display text-xl uppercase tracking-wide flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary" /> Log Site Goods Received
        </h2>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Select Purchase Order</Label>
            <Select value={selectedPoId} onValueChange={setSelectedPoId}>
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
            <Label htmlFor="del-ref">Delivery Note / Waybill Ref</Label>
            <Input
              id="del-ref"
              className="h-12"
              placeholder="e.g. WB-99201"
              value={deliveryNoteRef}
              onChange={(e) => setDeliveryNoteRef(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Inspection Result Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as "accepted" | "partial" | "rejected")}
            >
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="accepted">Accepted (Full Quantity)</SelectItem>
                <SelectItem value="partial">Partial Acceptance</SelectItem>
                <SelectItem value="rejected">Rejected (Quality / Spec Defect)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="quality">Quality & Inspection Observations</Label>
          <Textarea
            id="quality"
            rows={2}
            placeholder="Note condition, batch numbers, moisture tests, or reasons for rejection..."
            value={qualityObs}
            onChange={(e) => setQualityObs(e.target.value)}
          />
        </div>

        {/* Site Delivery Photo Upload */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-xs font-semibold">
            <Camera className="h-3.5 w-3.5 text-primary" /> Delivery Note & Site Inspection Photo
          </Label>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-4 text-xs font-medium hover:bg-accent hover:text-accent-foreground">
              <Camera className="h-4 w-4" />
              <span>{isUploadingPhoto ? "Uploading..." : "Take / Upload Photo"}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={isUploadingPhoto}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePhotoUpload(file);
                }}
              />
            </label>
            {photos.length > 0 && <AttachmentThumbs attachments={photos} />}
          </div>
        </div>

        <Button
          type="submit"
          disabled={createReceipt.isPending || !selectedPoId}
          className="h-12 w-full sm:w-auto px-6 font-semibold"
        >
          {createReceipt.isPending ? "Logging Record..." : "Log Goods Received Record"}
        </Button>
      </form>

      {/* Receipts Log List */}
      <section className="space-y-3">
        <h2 className="font-display text-xl uppercase tracking-wide">Inspection Log History</h2>

        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading delivery records...</p>
        ) : !receipts?.length ? (
          <EmptyState
            title="No delivery records yet"
            body="When site teams receive materials against issued POs, Goods-Received inspection logs will show up here."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {receipts.map((r) => {
              const rawPo = r.purchase_orders;
              const poObj = Array.isArray(rawPo)
                ? rawPo[0]
                : (rawPo as { po_number: string } | null);
              const poNum = poObj?.po_number ?? "PO";

              return (
                <article
                  key={r.id}
                  className="rounded-lg border border-border bg-card p-4 space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-mono font-bold text-accent text-sm">{poNum}</span>
                      <p className="text-muted-foreground text-[11px]">
                        Note: {r.delivery_note_ref || "None"}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        r.status === "accepted"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : r.status === "partial"
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>
                  <p className="text-muted-foreground">
                    {r.quality_observations || "No inspection comments."}
                  </p>

                  <AttachmentThumbs attachments={r.photos} />

                  <div className="pt-2 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Received by: {r.receiving_officer_name}</span>
                    <span>{dateTime(r.delivered_at)}</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
