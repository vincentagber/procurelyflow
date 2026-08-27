/**
 * Offline Sync Queue Utility (NFR-PERF.2)
 * Manages local storage / IndexedDB queue for mobile delivery & inspection records
 * captured on site during network outages or low-bandwidth 3G connections.
 */

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
  photos: { path: string; name: string }[];
  timestamp: number;
  synced: boolean;
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
  record: Omit<QueuedDeliveryRecord, "id" | "timestamp" | "synced">,
): QueuedDeliveryRecord {
  const queue = getQueuedDeliveries();
  const newRecord: QueuedDeliveryRecord = {
    ...record,
    id: `queued_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    timestamp: Date.now(),
    synced: false,
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

export function clearSyncedDeliveries(): void {
  const pending = getQueuedDeliveries().filter((item) => !item.synced);
  if (typeof window !== "undefined") {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(pending));
  }
}

/** Registers window online event listener to trigger auto-sync */
export function registerAutoSyncListener(
  onSync: (record: QueuedDeliveryRecord) => Promise<boolean>,
): () => void {
  if (typeof window === "undefined") return () => {};

  const handleOnline = async () => {
    const queue = getQueuedDeliveries().filter((item) => !item.synced);
    for (const record of queue) {
      try {
        const success = await onSync(record);
        if (success) {
          removeQueuedDelivery(record.id);
        }
      } catch {
        /* keep in queue if sync fails */
      }
    }
  };

  window.addEventListener("online", handleOnline);
  return () => window.removeEventListener("online", handleOnline);
}
