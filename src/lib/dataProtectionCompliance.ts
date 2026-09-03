/**
 * Nigeria Data Protection Act (NDPA 2023) Compliance & Data Governance Engine (NFR-DP.1, NFR-DP.2)
 *
 * Implements:
 * 1. Data-Subject Access Requests (DSAR) - Export & Correction
 * 2. Data Minimisation & PII Masking
 * 3. Immutable Retention Period Enforcer
 */

export interface DataSubjectProfile {
  userId: string;
  orgId: string;
  fullName: string;
  email: string;
  whatsappNumber?: string | null;
  role: string;
  createdAt: string;
}

export interface DsarExportPayload {
  dataSubject: DataSubjectProfile;
  requisitionsCreated: number;
  approvalsLogged: number;
  grnInspectionsHandled: number;
  auditTrailEventsCount: number;
  generatedAt: string;
  ndpaComplianceNotice: string;
}

export interface PiiMaskingConfig {
  maskBankAccounts?: boolean;
  maskPhoneNumbers?: boolean;
  maskTaxIds?: boolean;
}

/**
 * Masks PII according to NDPA data minimisation principles (NFR-DP.1)
 */
export function maskPersonalIdentifiableInfo(
  text: string,
  type: "BANK_ACCOUNT" | "PHONE" | "TAX_ID" | "EMAIL",
): string {
  if (!text) return "—";
  const str = text.trim();

  switch (type) {
    case "BANK_ACCOUNT":
      // Show only last 3 digits: e.g. *******789
      return str.length > 3 ? "*".repeat(str.length - 3) + str.slice(-3) : "***";
    case "PHONE":
      // Show only prefix and last 2 digits: e.g. +234*****89
      return str.length > 5 ? str.slice(0, 4) + "*".repeat(str.length - 6) + str.slice(-2) : str;
    case "TAX_ID":
      // Show first 3 and last 2: e.g. 102****01
      return str.length > 5 ? str.slice(0, 3) + "*".repeat(str.length - 5) + str.slice(-2) : str;
    case "EMAIL": {
      const [name = "", domain = ""] = str.split("@");
      if (!domain || !name) return "***@***";
      const maskedName =
        name.length > 2 ? name[0] + "*".repeat(name.length - 2) + name.slice(-1) : "**";
      return `${maskedName}@${domain}`;
    }
  }
}

/**
 * Handles statutory Data-Subject Access Requests (DSAR) under NDPA 2023 §24 (NFR-DP.2)
 */
export function generateDsarExport(
  subject: DataSubjectProfile,
  activityCounts: {
    requisitionsCount: number;
    approvalsCount: number;
    grnCount: number;
    auditEventsCount: number;
  },
): DsarExportPayload {
  return {
    dataSubject: {
      ...subject,
      email: maskPersonalIdentifiableInfo(subject.email, "EMAIL"),
      whatsappNumber: subject.whatsappNumber
        ? maskPersonalIdentifiableInfo(subject.whatsappNumber, "PHONE")
        : null,
    },
    requisitionsCreated: activityCounts.requisitionsCount,
    approvalsLogged: activityCounts.approvalsCount,
    grnInspectionsHandled: activityCounts.grnCount,
    auditTrailEventsCount: activityCounts.auditEventsCount,
    generatedAt: new Date().toISOString(),
    ndpaComplianceNotice:
      "This export is provided in compliance with Section 24 of the Nigeria Data Protection Act 2023 (Right of Access). Procurement audit log records are retained in tamper-evident form as mandated by statutory financial record-keeping laws.",
  };
}

/**
 * Validates data retention periods for operational vs audit records (NFR-DP.1)
 */
export function checkRetentionPolicy(
  recordType: "AUDIT_LOG" | "SUPPLIER_QUOTE" | "DRAFT_REQUISITION",
  ageInDays: number,
): { isExpired: boolean; action: "RETAIN_IMMUTABLE" | "PURGE_ELIGIBLE" } {
  switch (recordType) {
    case "AUDIT_LOG":
      // Statutory financial audit records retained for minimum 7 years (2555 days)
      return { isExpired: ageInDays > 2555, action: "RETAIN_IMMUTABLE" };
    case "DRAFT_REQUISITION":
      // Inactive drafts older than 90 days are eligible for purge
      return { isExpired: ageInDays > 90, action: "PURGE_ELIGIBLE" };
    case "SUPPLIER_QUOTE":
      // Historical quotes retained for multi-year compliance analysis
      return { isExpired: ageInDays > 1825, action: "RETAIN_IMMUTABLE" };
  }
}
