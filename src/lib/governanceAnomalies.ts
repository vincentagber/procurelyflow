/**
 * Executive Governance & Anti-Fraud Anomaly Detection Engine (FR-4.5 / FR-8.5)
 *
 * Implements real-time forensic detection for:
 * 1. Split Requisitions / Anti-Structuring (evading approval thresholds)
 * 2. Buyer-Supplier Affinity & Concentration Anomalies
 * 3. Sole-Bid & Price Premium Outliers
 */

export interface RequisitionAnomalyInput {
  id: string;
  reference: string;
  requesterId: string;
  requesterName: string;
  projectId: string;
  projectName: string;
  amount: number;
  currency: string;
  createdAt: string; // ISO 8601
}

export interface AwardAnomalyInput {
  rfqId: string;
  poId: string;
  poNumber: string;
  buyerId: string;
  buyerName: string;
  supplierId: string;
  supplierName: string;
  amount: number;
  awardedAt: string;
  isLowestQuote: boolean;
  quotesCount: number;
  justificationProvided?: string | null;
}

export interface GovernanceAnomalyFlag {
  id: string;
  category: "SPLIT_REQUISITION" | "BUYER_SUPPLIER_AFFINITY" | "SOLE_SOURCE_PREMIUM";
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  title: string;
  description: string;
  affectedEntities: { type: string; id: string; name: string }[];
  detectedAt: string;
  metrics: Record<string, unknown>;
}

/**
 * Detects potential split requisitions intended to bypass approval thresholds.
 * Flags users creating multiple requisitions near a threshold within a time window.
 */
export function detectSplitRequisitionAnomalies(
  requisitions: RequisitionAnomalyInput[],
  options?: {
    thresholdAmount?: number; // default 500,000 NGN
    windowDays?: number; // default 7 days
    minOccurrenceCount?: number; // default 2
    nearThresholdRatio?: number; // e.g. 0.7 to 1.0 (70% - 100% of threshold)
  },
): GovernanceAnomalyFlag[] {
  const threshold = options?.thresholdAmount ?? 500000;
  const windowMs = (options?.windowDays ?? 7) * 24 * 60 * 60 * 1000;
  const minCount = options?.minOccurrenceCount ?? 2;
  const lowerBound = threshold * (options?.nearThresholdRatio ?? 0.7);

  const anomalies: GovernanceAnomalyFlag[] = [];

  // Group by requester & project
  const groups = new Map<string, RequisitionAnomalyInput[]>();
  for (const r of requisitions) {
    const key = `${r.requesterId}_${r.projectId}`;
    const list = groups.get(key) || [];
    list.push(r);
    groups.set(key, list);
  }

  for (const [key, items] of groups.entries()) {
    // Sort chronologically
    items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    for (let i = 0; i < items.length; i++) {
      const baseItem = items[i];
      if (!baseItem) continue;

      const windowItems: RequisitionAnomalyInput[] = [];
      let totalAmount = 0;

      const startTime = new Date(baseItem.createdAt).getTime();

      for (let j = i; j < items.length; j++) {
        const item = items[j];
        if (!item) continue;
        const itemTime = new Date(item.createdAt).getTime();
        if (itemTime - startTime <= windowMs) {
          // Check if item is just below threshold
          if (item.amount >= lowerBound && item.amount < threshold) {
            windowItems.push(item);
            totalAmount += item.amount;
          }
        }
      }

      if (windowItems.length >= minCount && totalAmount >= threshold && windowItems[0]) {
        const first = windowItems[0];
        const requester = first.requesterName;
        const project = first.projectName;

        anomalies.push({
          id: `anomaly_split_${key}_${i}`,
          category: "SPLIT_REQUISITION",
          severity: totalAmount > threshold * 2 ? "CRITICAL" : "HIGH",
          title: `Potential Split Requisitions by ${requester}`,
          description: `${requester} raised ${windowItems.length} requisitions totaling ${totalAmount.toLocaleString()} NGN on project "${project}" within ${options?.windowDays ?? 7} days, each individually under the ${threshold.toLocaleString()} NGN threshold.`,
          affectedEntities: windowItems.map((w) => ({
            type: "requisition",
            id: w.id,
            name: `${w.reference} (${w.amount.toLocaleString()} NGN)`,
          })),
          detectedAt: new Date().toISOString(),
          metrics: {
            requesterId: first.requesterId,
            totalSplitAmount: totalAmount,
            requisitionCount: windowItems.length,
            thresholdBypassed: threshold,
          },
        });

        // Skip processed items in window to prevent duplicates
        i += windowItems.length - 1;
        break;
      }
    }
  }

  return anomalies;
}

/**
 * Detects buyer-supplier affinity where a procurement officer excessively awards
 * purchase orders to a specific supplier (especially non-lowest bids).
 */
export function detectBuyerSupplierAffinityAnomalies(
  awards: AwardAnomalyInput[],
  options?: {
    concentrationThresholdPercent?: number; // default 40% of awards
    minAwardsCount?: number; // default 3 awards
  },
): GovernanceAnomalyFlag[] {
  const minAwards = options?.minAwardsCount ?? 3;
  const maxConcentration = options?.concentrationThresholdPercent ?? 40;

  const anomalies: GovernanceAnomalyFlag[] = [];

  // Group by buyer
  const buyerGroups = new Map<string, AwardAnomalyInput[]>();
  for (const a of awards) {
    const list = buyerGroups.get(a.buyerId) || [];
    list.push(a);
    buyerGroups.set(a.buyerId, list);
  }

  for (const [buyerId, buyerAwards] of buyerGroups.entries()) {
    if (buyerAwards.length < minAwards) continue;

    const supplierCounts = new Map<
      string,
      { name: string; count: number; totalSpend: number; nonLowestCount: number }
    >();
    const totalBuyerSpend = buyerAwards.reduce((s, a) => s + a.amount, 0);

    for (const award of buyerAwards) {
      const entry = supplierCounts.get(award.supplierId) || {
        name: award.supplierName,
        count: 0,
        totalSpend: 0,
        nonLowestCount: 0,
      };
      entry.count += 1;
      entry.totalSpend += award.amount;
      if (!award.isLowestQuote) {
        entry.nonLowestCount += 1;
      }
      supplierCounts.set(award.supplierId, entry);
    }

    for (const [supplierId, data] of supplierCounts.entries()) {
      const awardRatio = (data.count / buyerAwards.length) * 100;
      const spendRatio = totalBuyerSpend > 0 ? (data.totalSpend / totalBuyerSpend) * 100 : 0;

      if (awardRatio >= maxConcentration && data.count >= minAwards) {
        const buyerName = buyerAwards[0]?.buyerName ?? "Buyer";
        const isHighRisk = data.nonLowestCount > 0 || spendRatio > 50;

        anomalies.push({
          id: `anomaly_affinity_${buyerId}_${supplierId}`,
          category: "BUYER_SUPPLIER_AFFINITY",
          severity: isHighRisk ? "HIGH" : "MEDIUM",
          title: `High Vendor Concentration: ${buyerName} → ${data.name}`,
          description: `${buyerName} awarded ${data.count} of ${buyerAwards.length} POs (${awardRatio.toFixed(0)}%) totaling ${data.totalSpend.toLocaleString()} to ${data.name}${data.nonLowestCount > 0 ? ` with ${data.nonLowestCount} non-lowest price awards` : ""}.`,
          affectedEntities: [
            { type: "buyer", id: buyerId, name: buyerName },
            { type: "supplier", id: supplierId, name: data.name },
          ],
          detectedAt: new Date().toISOString(),
          metrics: {
            buyerId,
            supplierId,
            awardCount: data.count,
            totalBuyerAwards: buyerAwards.length,
            awardRatioPercent: Math.round(awardRatio),
            totalSpend: data.totalSpend,
            nonLowestAwards: data.nonLowestCount,
          },
        });
      }
    }
  }

  return anomalies;
}

export interface PoChangeOrderVersion {
  changeOrderId: string;
  originalPoId: string;
  originalPoNumber: string;
  revisionNumber: number; // e.g. 1 for Rev-01, 2 for Rev-02
  revisedPoNumber: string; // e.g. PO-2026-0042-REV1
  reason: string;
  requestedBy: string;
  requestedAt: string;
  previousTotalAmount: number;
  newTotalAmount: number;
  deltaAmount: number;
  currency: string;
  modifiedItems: {
    itemId: string;
    description: string;
    oldQuantity: number;
    newQuantity: number;
    oldUnitPrice: number;
    newUnitPrice: number;
  }[];
}

/**
 * Creates an immutable version-controlled PO Change Order (FR-5.4)
 * Preserves the original baseline PO and tracks revision numbers and deltas.
 */
export function createPoChangeOrderRecord(params: {
  po: {
    id: string;
    po_number: string;
    total_amount: number;
    currency: string;
    revision_count?: number;
  };
  reason: string;
  requestedBy: string;
  newTotalAmount: number;
  modifiedItems: PoChangeOrderVersion["modifiedItems"];
}): PoChangeOrderVersion {
  const currentRevision = (params.po.revision_count ?? 0) + 1;
  const deltaAmount = params.newTotalAmount - params.po.total_amount;

  return {
    changeOrderId: `co_${Date.now()}_rev${currentRevision}`,
    originalPoId: params.po.id,
    originalPoNumber: params.po.po_number,
    revisionNumber: currentRevision,
    revisedPoNumber: `${params.po.po_number}-REV${currentRevision}`,
    reason: params.reason,
    requestedBy: params.requestedBy,
    requestedAt: new Date().toISOString(),
    previousTotalAmount: params.po.total_amount,
    newTotalAmount: params.newTotalAmount,
    deltaAmount,
    currency: params.po.currency,
    modifiedItems: params.modifiedItems,
  };
}

export interface ManagementDashboardKpis {
  totalSpend: number;
  spendByProject: Record<string, number>;
  spendByCategory: Record<string, number>;
  totalSavingsVsQuote: number;
  averageSupplierQualityScore: number; // 0 to 100%
  averageTurnaroundDaysReqToPo: number;
  averageDeliveryLeadDays: number;
}

/**
 * Computes executive procurement analytics and operational velocity KPIs (FR-8.1 - FR-8.4)
 */
export function calculateManagementKpis(data: {
  purchaseOrders: {
    id: string;
    totalAmount: number;
    projectName: string;
    category?: string;
    issuedAt: string;
    requisitionCreatedAt?: string;
  }[];
  inspections: {
    quantityDelivered: number;
    quantityAccepted: number;
    deliveredAt: string;
    poIssuedAt: string;
  }[];
  quotes: {
    initialQuotedPrice: number;
    finalAwardedPrice: number;
  }[];
}): ManagementDashboardKpis {
  let totalSpend = 0;
  const spendByProject: Record<string, number> = {};
  const spendByCategory: Record<string, number> = {};

  let totalReqToPoDays = 0;
  let reqToPoCount = 0;

  for (const po of data.purchaseOrders) {
    totalSpend += po.totalAmount;
    spendByProject[po.projectName] = (spendByProject[po.projectName] || 0) + po.totalAmount;
    const cat = po.category || "General Materials";
    spendByCategory[cat] = (spendByCategory[cat] || 0) + po.totalAmount;

    if (po.requisitionCreatedAt) {
      const days =
        (new Date(po.issuedAt).getTime() - new Date(po.requisitionCreatedAt).getTime()) /
        (1000 * 60 * 60 * 24);
      if (days >= 0) {
        totalReqToPoDays += days;
        reqToPoCount++;
      }
    }
  }

  let totalDelivered = 0;
  let totalAccepted = 0;
  let totalLeadDays = 0;
  let deliveryCount = 0;

  for (const insp of data.inspections) {
    totalDelivered += insp.quantityDelivered;
    totalAccepted += insp.quantityAccepted;
    const lead =
      (new Date(insp.deliveredAt).getTime() - new Date(insp.poIssuedAt).getTime()) /
      (1000 * 60 * 60 * 24);
    if (lead >= 0) {
      totalLeadDays += lead;
      deliveryCount++;
    }
  }

  let totalSavings = 0;
  for (const q of data.quotes) {
    const diff = q.initialQuotedPrice - q.finalAwardedPrice;
    if (diff > 0) totalSavings += diff;
  }

  const qualityScore = totalDelivered > 0 ? (totalAccepted / totalDelivered) * 100 : 100;
  const avgReqToPo = reqToPoCount > 0 ? totalReqToPoDays / reqToPoCount : 0;
  const avgLeadTime = deliveryCount > 0 ? totalLeadDays / deliveryCount : 0;

  return {
    totalSpend: Math.round(totalSpend * 100) / 100,
    spendByProject,
    spendByCategory,
    totalSavingsVsQuote: Math.round(totalSavings * 100) / 100,
    averageSupplierQualityScore: Math.round(qualityScore * 10) / 10,
    averageTurnaroundDaysReqToPo: Math.round(avgReqToPo * 10) / 10,
    averageDeliveryLeadDays: Math.round(avgLeadTime * 10) / 10,
  };
}
