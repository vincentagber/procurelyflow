import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  Truck,
  Camera,
  WifiOff,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  XCircle,
  FileText,
  Building2,
  Calendar,
  User,
  ExternalLink,
  X,
  Check,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { createDeliveryReceiptFn } from "@/lib/procurement.functions";
import { money, dateTime, shortDate } from "@/lib/format";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { AttachmentThumbs } from "@/components/procurely/AttachmentThumbs";
import {
  saveDeliveryToOfflineQueue,
  getQueuedDeliveries,
  registerAutoSyncListener,
  type QueuedDeliveryRecord,
} from "@/lib/offlineSyncQueue";
import { cn } from "@/lib/utils";

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

interface DeliveryReceiptRecord {
  id: string;
  purchase_order_id: string;
  delivery_note_ref: string | null;
  status: "accepted" | "partial" | "rejected";
  quality_observations: string | null;
  photos: { path: string; name: string }[];
  receiving_officer_name: string;
  delivered_at: string;
  created_at: string;
  purchase_orders?: {
    po_number: string;
    total_amount?: number;
    settlement_currency?: string;
    suppliers?: { name?: string } | { name?: string }[] | null;
  } | null;
}

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

  // Search & Filter state for history
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "accepted" | "partial" | "rejected">("all");

  // Inspection Detail Modal state
  const [inspectingReceipt, setInspectingReceipt] = useState<DeliveryReceiptRecord | null>(null);

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
    queryKey: ["approved-pos-delivery"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("purchase_orders")
          .select(
            "id, po_number, total_amount, settlement_currency, supplier_id, suppliers(name), requisition_id",
          )
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
        const { data, error } = await supabase
          .from("delivery_receipts")
          .select("*, purchase_orders(po_number, total_amount, settlement_currency, suppliers(name))")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return (data ?? []) as unknown as DeliveryReceiptRecord[];
      } catch (err) {
        console.warn("Failed fetching delivery receipts:", err);
        return [];
      }
    },
  });

  const selectedPo = pos?.find((p) => p.id === selectedPoId);

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
      toast.success("Delivery note photo attached.");
    } catch {
      toast.error("Failed uploading photo.");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const createReceipt = useMutation({
    mutationFn: async () => {
      if (!selectedPoId) throw new Error("Select an authorized Purchase Order.");
      if (!deliveryNoteRef.trim()) throw new Error("Provide a Delivery Note or Waybill reference.");

      const payload = {
        purchaseOrderId: selectedPoId,
        deliveryNoteRef: deliveryNoteRef.trim(),
        status,
        qualityObservations: qualityObs.trim(),
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
        toast.success("Goods received inspection record successfully logged.");
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

  // Filtered receipts
  const filteredReceipts = useMemo(() => {
    const list = receipts ?? [];
    const q = searchQuery.toLowerCase().trim();

    return list.filter((r) => {
      const rawPo = r.purchase_orders;
      const poObj = Array.isArray(rawPo) ? rawPo[0] : rawPo;
      const poNum = poObj?.po_number ?? "";
      const rawSupp = poObj?.suppliers;
      const suppName = Array.isArray(rawSupp)
        ? rawSupp[0]?.name ?? ""
        : rawSupp?.name ?? "";

      const matchesSearch =
        !q ||
        poNum.toLowerCase().includes(q) ||
        (r.delivery_note_ref || "").toLowerCase().includes(q) ||
        suppName.toLowerCase().includes(q) ||
        (r.receiving_officer_name || "").toLowerCase().includes(q);

      if (!matchesSearch) return false;
      if (statusFilter === "all") return true;
      return r.status === statusFilter;
    });
  }, [receipts, searchQuery, statusFilter]);

  // Statistics
  const stats = useMemo(() => {
    const list = receipts ?? [];
    return {
      total: list.length,
      accepted: list.filter((r) => r.status === "accepted").length,
      exceptions: list.filter((r) => r.status === "partial" || r.status === "rejected").length,
    };
  }, [receipts]);

  return (
    <div className="space-y-6 pb-16 max-w-7xl mx-auto">
      {/* 1. High-Trust Executive Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
            Delivery &amp; Inspection
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Log goods received on construction sites, verify items accepted vs rejected, and capture site delivery notes.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-600">
            {stats.total} Total Receipts
          </span>
          <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700 border border-emerald-200">
            {stats.accepted} Accepted
          </span>
          {stats.exceptions > 0 && (
            <span className="rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-700 border border-amber-200">
              {stats.exceptions} Exceptions
            </span>
          )}
        </div>
      </div>

      {/* Offline Status Alert */}
      {!isOnline && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs font-medium text-amber-900">
          <WifiOff className="h-4 w-4 shrink-0 text-amber-600" />
          <span>
            Offline Mode Active — Site inspections will queue securely on this device and auto-sync to the cloud once network connectivity resumes.
          </span>
        </div>
      )}

      {/* Local Queue Banner */}
      {queuedItems.length > 0 && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-[#0B1457]">
            <span className="flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#0001FF]" />
              {queuedItems.length} Inspection Record(s) Queued Locally
            </span>
            <span className="text-xs text-slate-500">Syncing on connection</span>
          </div>
          <div className="divide-y divide-blue-100 text-xs">
            {queuedItems.map((q) => (
              <div key={q.id} className="py-1.5 flex items-center justify-between text-slate-700">
                <span>
                  Ref: <strong className="font-mono">{q.deliveryNoteRef || "N/A"}</strong> · Status: {q.status}
                </span>
                <span className="text-slate-500 text-[11px]">
                  {new Date(q.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Log Site Goods Received Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          createReceipt.mutate();
        }}
        className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7 shadow-xs space-y-5"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-[#0B1457]">
              <Truck className="h-4.5 w-4.5 text-[#0B1457]" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-semibold text-slate-900">
                Log Site Goods Received
              </h2>
              <p className="text-xs text-slate-500">
                Document warehouse and site receiving receipts for three-way commercial reconciliation.
              </p>
            </div>
          </div>
        </div>

        {/* Inputs Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Purchase Order Selection */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">
              Select Purchase Order <span className="text-rose-500">*</span>
            </Label>
            <Select value={selectedPoId} onValueChange={setSelectedPoId}>
              <SelectTrigger className="h-10 rounded-lg border-slate-200 bg-white text-xs shadow-2xs">
                <SelectValue placeholder="Choose PO..." />
              </SelectTrigger>
              <SelectContent>
                {(pos ?? []).length ? (
                  pos!.map((po) => {
                    const rawSupp = po.suppliers;
                    const suppName = Array.isArray(rawSupp)
                      ? rawSupp[0]?.name
                      : (rawSupp as { name?: string } | null)?.name;
                    return (
                      <SelectItem key={po.id} value={po.id} className="text-xs font-medium">
                        {po.po_number} — {money(po.total_amount, po.settlement_currency as "NGN" | "USD")}{" "}
                        {suppName ? `(${suppName})` : ""}
                      </SelectItem>
                    );
                  })
                ) : (
                  <SelectItem value="unlinked" disabled>
                    No approved purchase orders on file
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Delivery Note Ref */}
          <div className="space-y-1.5">
            <Label htmlFor="del-ref" className="text-xs font-semibold text-slate-700">
              Delivery Note / Waybill Ref <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="del-ref"
              required
              className="h-10 rounded-lg border-slate-200 bg-white font-mono text-xs shadow-2xs placeholder:text-slate-400 focus-visible:border-[#0B1457]"
              placeholder="e.g. WB-99201"
              value={deliveryNoteRef}
              onChange={(e) => setDeliveryNoteRef(e.target.value)}
            />
          </div>

          {/* Inspection Result Status */}
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
            <Label className="text-xs font-semibold text-slate-700">
              Inspection Result Status
            </Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as "accepted" | "partial" | "rejected")}
            >
              <SelectTrigger className="h-10 rounded-lg border-slate-200 bg-white text-xs font-medium shadow-2xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="accepted" className="text-xs">
                  <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Accepted (Full Quantity)
                  </span>
                </SelectItem>
                <SelectItem value="partial" className="text-xs">
                  <span className="flex items-center gap-1.5 text-amber-700 font-semibold">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    Partial Acceptance
                  </span>
                </SelectItem>
                <SelectItem value="rejected" className="text-xs">
                  <span className="flex items-center gap-1.5 text-rose-700 font-semibold">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    Rejected (Quality / Spec Defect)
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Selected PO Context Feedback Banner */}
        {selectedPo && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-[#0B1457]">{selectedPo.po_number}</span>
              <span className="text-slate-400">·</span>
              <span className="font-medium text-slate-700">
                {(selectedPo.suppliers as { name?: string } | null)?.name || "Authorized Vendor"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Committed Value:</span>
              <span className="font-mono font-bold text-[#0B1457]">
                {money(selectedPo.total_amount, selectedPo.settlement_currency as "NGN" | "USD")}
              </span>
            </div>
          </div>
        )}

        {/* Quality & Inspection Observations */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="quality" className="text-xs font-semibold text-slate-700">
              Quality &amp; Inspection Observations
            </Label>
            <span className="text-xs text-slate-500">
              {status === "rejected" ? (
                <span className="text-rose-600 font-semibold">Defect description required</span>
              ) : (
                "Batch numbers, moisture tests, packaging"
              )}
            </span>
          </div>
          <Textarea
            id="quality"
            rows={2}
            className="rounded-lg border-slate-200 bg-white text-xs leading-relaxed shadow-2xs placeholder:text-slate-400 focus-visible:border-[#0B1457]"
            placeholder="Note condition, batch numbers, moisture tests, or reasons for rejection..."
            value={qualityObs}
            onChange={(e) => setQualityObs(e.target.value)}
          />
        </div>

        {/* Site Delivery Photo Upload */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <Camera className="h-4 w-4 text-slate-500" />
            <span>Delivery Note &amp; Site Inspection Photo</span>
          </Label>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:border-slate-400 transition-colors shadow-2xs">
              <Camera className="h-4 w-4 text-slate-500" />
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

            <span className="text-xs text-slate-500">
              Attach picture of signed waybill or physical delivery receipt.
            </span>
          </div>

          {photos.length > 0 && (
            <div className="pt-2">
              <AttachmentThumbs
                attachments={photos}
                readOnly={false}
                onRemove={(path) => setPhotos((prev) => prev.filter((p) => p.path !== path))}
              />
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-emerald-600" />
            <span>Goods-received verification enables 3-way matching in Accounts Payable.</span>
          </div>

          <div className="flex items-center gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={resetForm}
              className="h-9 px-4 rounded-lg border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs"
            >
              Reset
            </Button>
            <Button
              type="submit"
              disabled={createReceipt.isPending || !selectedPoId || !deliveryNoteRef.trim()}
              className="h-9 px-5 rounded-lg bg-[#0B1457] hover:bg-[#0001FF] text-white text-xs font-medium shadow-xs transition-colors gap-1.5"
            >
              <Truck className="h-4 w-4" />
              <span>{createReceipt.isPending ? "Logging Record…" : "Log Goods Received Record"}</span>
            </Button>
          </div>
        </div>
      </form>

      {/* 3. Receipts Log List & Register */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Inspection Log History</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
              {filteredReceipts.length}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative w-full sm:w-60">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                type="text"
                placeholder="Search PO, waybill, supplier…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 rounded-lg border-slate-200 bg-white pl-8 text-xs shadow-2xs placeholder:text-slate-400 focus-visible:border-[#0B1457]"
              />
            </div>

            <Select
              value={statusFilter}
              onValueChange={(val) =>
                setStatusFilter(val as "all" | "accepted" | "partial" | "rejected")
              }
            >
              <SelectTrigger className="h-10 rounded-lg border-slate-200 bg-white text-xs shadow-2xs w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Verdicts</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <p className="py-12 text-center text-xs text-slate-500 animate-pulse">
            Loading delivery records…
          </p>
        ) : !filteredReceipts.length ? (
          <div className="py-14 text-center space-y-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <p className="text-xs font-semibold text-slate-900">
              {searchQuery || statusFilter !== "all"
                ? "No delivery records match your criteria."
                : "No delivery records logged yet."}
            </p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              When site teams log materials received against issued POs, physical Goods-Received Notes (GRN) will appear here.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredReceipts.map((r) => {
              const rawPo = r.purchase_orders;
              const poObj = Array.isArray(rawPo) ? rawPo[0] : rawPo;
              const poNum = poObj?.po_number ?? "PO";
              const rawSupp = poObj?.suppliers;
              const suppName = Array.isArray(rawSupp)
                ? rawSupp[0]?.name ?? "Vendor"
                : rawSupp?.name ?? "Vendor";

              return (
                <article
                  key={r.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 text-xs shadow-xs hover:border-slate-300 transition-colors flex flex-col justify-between"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono font-bold text-[#0B1457] text-sm tabular-nums">{poNum}</span>
                        <p className="text-slate-600 text-xs font-medium truncate max-w-[170px]">
                          {suppName}
                        </p>
                      </div>

                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold border",
                          r.status === "accepted"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : r.status === "partial"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-rose-50 text-rose-700 border-rose-200",
                        )}
                      >
                        {r.status === "accepted" ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        ) : r.status === "partial" ? (
                          <AlertCircle className="h-3 w-3 text-amber-600" />
                        ) : (
                          <XCircle className="h-3 w-3 text-rose-600" />
                        )}
                        {r.status === "accepted" ? "Accepted" : r.status === "partial" ? "Partial" : "Rejected"}
                      </span>
                    </div>

                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">Waybill Ref:</span>
                        <span className="font-mono font-semibold text-slate-900 tabular-nums">
                          {r.delivery_note_ref || "None"}
                        </span>
                      </div>
                      <p className="text-slate-600 text-xs line-clamp-2 italic pt-0.5">
                        "{r.quality_observations || "No inspection comments recorded."}"
                      </p>
                    </div>

                    {r.photos?.length > 0 && (
                      <div className="pt-1">
                        <AttachmentThumbs attachments={r.photos} />
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span className="truncate max-w-[140px]" title={r.receiving_officer_name}>
                      Recv: <span className="text-slate-700 font-medium">{r.receiving_officer_name || "Site Officer"}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setInspectingReceipt(r)}
                      className="text-[#0001FF] hover:underline font-medium flex items-center gap-1"
                    >
                      <span>Details</span>
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Inspection Detail Modal */}
      <Dialog
        open={!!inspectingReceipt}
        onOpenChange={(open) => !open && setInspectingReceipt(null)}
      >
        <DialogContent className="w-[95vw] sm:max-w-lg p-5 sm:p-6 rounded-2xl border border-slate-200 bg-white shadow-xl">
          <DialogHeader className="border-b border-slate-100 pb-3 text-left">
            <DialogTitle className="text-base font-semibold text-slate-900">
              Site Delivery &amp; Inspection Record
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-0.5">
              Goods Received Note (GRN) receiving evidence and quality sign-off.
            </DialogDescription>
          </DialogHeader>

          {inspectingReceipt && (
            <div className="space-y-4 py-2 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-1">
                  <span className="text-[10px] font-semibold uppercase text-slate-500">
                    Purchase Order
                  </span>
                  <p className="font-mono font-bold text-sm text-[#0B1457] tabular-nums">
                    {inspectingReceipt.purchase_orders?.po_number || "Unlinked PO"}
                  </p>
                  <p className="text-xs text-slate-600">
                    {(inspectingReceipt.purchase_orders?.suppliers as { name?: string })?.name || "Vendor"}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-1">
                  <span className="text-[10px] font-semibold uppercase text-slate-500">
                    Waybill Reference
                  </span>
                  <p className="font-mono font-semibold text-sm text-slate-900 tabular-nums">
                    {inspectingReceipt.delivery_note_ref || "N/A"}
                  </p>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border",
                      inspectingReceipt.status === "accepted"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : inspectingReceipt.status === "partial"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-rose-50 text-rose-700 border-rose-200",
                    )}
                  >
                    Status: {inspectingReceipt.status}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-3.5 space-y-1.5 bg-white">
                <span className="text-[10px] font-semibold uppercase text-slate-500">
                  Quality &amp; Inspection Observations
                </span>
                <p className="text-slate-800 leading-relaxed text-xs">
                  {inspectingReceipt.quality_observations || "No QA observations logged."}
                </p>
              </div>

              {inspectingReceipt.photos?.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-semibold uppercase text-slate-500">
                    Attached Delivery Note &amp; Waybill Evidence
                  </span>
                  <AttachmentThumbs attachments={inspectingReceipt.photos} />
                </div>
              )}

              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-xs text-slate-600 space-y-1">
                <div className="flex items-center justify-between">
                  <span>Receiving Officer:</span>
                  <strong className="text-slate-900 font-semibold">{inspectingReceipt.receiving_officer_name}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Site Delivery Date:</span>
                  <span className="tabular-nums">{dateTime(inspectingReceipt.delivered_at)}</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="border-t border-slate-100 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setInspectingReceipt(null)}
              className="h-9 px-4 rounded-lg border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
