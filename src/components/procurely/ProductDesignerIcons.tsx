import React from "react";
import { MdPolicy, MdSecurity, MdVerifiedUser } from "react-icons/md";
import { cn } from "@/lib/utils";

interface IconProps {
  className?: string;
  size?: number;
}

/**
 * PciProtectionEmblemIcon
 * Authentic Google Fonts icon container for PCI-DSS & Local Currency Protection Guarantee.
 */
export function PciProtectionEmblemIcon({ className = "h-10 w-10" }: IconProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-xl bg-slate-100 text-slate-800 border border-slate-200 shadow-2xs shrink-0",
        className,
      )}
    >
      <MdSecurity className="h-5 w-5 text-emerald-600" />
    </div>
  );
}

/**
 * ForensicGovernanceEmblemIcon
 * Authentic Google Fonts icon container for Governance & Forensic Audit Module (§FR-4.5, §FR-8.5).
 */
export function ForensicGovernanceEmblemIcon({
  className = "h-10 w-10",
  hasAnomalies = false,
}: IconProps & { hasAnomalies?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-xl border shadow-2xs transition-colors shrink-0",
        hasAnomalies
          ? "bg-rose-50 text-rose-800 border-rose-200"
          : "bg-slate-100 text-[#0B1457] border-slate-200",
        className,
      )}
    >
      {hasAnomalies ? (
        <MdSecurity className="h-5 w-5 text-rose-600" />
      ) : (
        <MdPolicy className="h-5 w-5 text-[#0B1457]" />
      )}
    </div>
  );
}

/**
 * GovernanceVerifiedBadgeIcon
 * Authentic Google Fonts icon container for Corporate Governance Integrity Verified status.
 */
export function GovernanceVerifiedBadgeIcon({ className = "h-10 w-10" }: IconProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs shrink-0",
        className,
      )}
    >
      <MdVerifiedUser className="h-6 w-6 text-emerald-600" />
    </div>
  );
}
