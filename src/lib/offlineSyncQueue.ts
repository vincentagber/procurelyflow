/**
 * Offline Sync Queue Utility (NFR-PERF.2)
 * Manages local storage / IndexedDB queue for mobile delivery & inspection records
 * captured on site during network outages or low-bandwidth 3G connections.
 */

export interface QueuedDeliveryPhoto {
  path: string;
  name: string;
  compressedBase64?: string;
  sizeBytes?: number;
  mimeType?: string;
}

export interface QueuedDeliveryRecord {
  id: string;
  purchaseOrderId: string;
  projectId?: string;
  deliveryNoteRef?: string;
  qualityObservations?: string;
  status: "accepted" | "partial" | "rejected";
  items: {
    poItemId?: string;
    description: string;
    quantityDelivered: number;
    quantityAccepted: number;
    quantityRejected: number;
    rejectionReason?: string;
  }[];
  photos: QueuedDeliveryPhoto[];
  gpsCoordinates?: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
  };
  timestamp: number;
  synced: boolean;
  retryCount?: number;
  lastError?: string;
}

const QUEUE_STORAGE_KEY = "procurely_offline_delivery_queue_v1";

export function getQueuedDeliveries(): QueuedDeliveryRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveDeliveryToOfflineQueue(
  record: Omit<QueuedDeliveryRecord, "id" | "timestamp" | "synced" | "retryCount">,
): QueuedDeliveryRecord {
  const queue = getQueuedDeliveries();
  const newRecord: QueuedDeliveryRecord = {
    ...record,
    id: `queued_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    timestamp: Date.now(),
    synced: false,
    retryCount: 0,
  };
  queue.push(newRecord);
  if (typeof window !== "undefined") {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  }
  return newRecord;
}

export function removeQueuedDelivery(id: string): void {
  const queue = getQueuedDeliveries().filter((item) => item.id !== id);
  if (typeof window !== "undefined") {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  }
}

export function updateQueuedDelivery(id: string, updates: Partial<QueuedDeliveryRecord>): void {
  const queue = getQueuedDeliveries().map((item) =>
    item.id === id ? { ...item, ...updates } : item,
  );
  if (typeof window !== "undefined") {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  }
}

export function clearSyncedDeliveries(): void {
  const pending = getQueuedDeliveries().filter((item) => !item.synced);
  if (typeof window !== "undefined") {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(pending));
  }
}

/** Batch syncs all pending offline deliveries to server */
export async function syncOfflineDeliveriesBatch(
  syncHandler: (record: QueuedDeliveryRecord) => Promise<{ success: boolean; error?: string }>,
): Promise<{ total: number; succeeded: number; failed: number }> {
  const queue = getQueuedDeliveries().filter((item) => !item.synced);
  let succeeded = 0;
  let failed = 0;

  for (const record of queue) {
    try {
      const result = await syncHandler(record);
      if (result.success) {
        removeQueuedDelivery(record.id);
        succeeded++;
      } else {
        updateQueuedDelivery(record.id, {
          retryCount: (record.retryCount ?? 0) + 1,
          lastError: result.error || "Sync rejected by server",
        });
        failed++;
      }
    } catch (err) {
      updateQueuedDelivery(record.id, {
        retryCount: (record.retryCount ?? 0) + 1,
        lastError: err instanceof Error ? err.message : String(err),
      });
      failed++;
    }
  }

  return { total: queue.length, succeeded, failed };
}

/** Registers window online event listener to trigger auto-sync */
export function registerAutoSyncListener(
  onSync: (record: QueuedDeliveryRecord) => Promise<boolean>,
): () => void {
  if (typeof window === "undefined") return () => {};

  const handleOnline = async () => {
    await syncOfflineDeliveriesBatch(async (record) => {
      const success = await onSync(record);
      return { success };
    });
  };

  window.addEventListener("online", handleOnline);
  return () => window.removeEventListener("online", handleOnline);
}
