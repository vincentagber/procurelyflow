import React from "react";
import { ShieldCheck, Scale, ShieldAlert, CheckCircle2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface IconProps {
  className?: string;
  size?: number;
}

/**
 * PciProtectionEmblemIcon
 * Authentic Lucide font family icon container for PCI-DSS & Local Currency Protection Guarantee.
 */
export function PciProtectionEmblemIcon({ className = "h-10 w-10" }: IconProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-xl bg-slate-100 text-slate-800 border border-slate-200 shadow-2xs shrink-0",
        className
      )}
    >
      <ShieldCheck className="h-5 w-5 text-emerald-600" />
    </div>
  );
}

/**
 * ForensicGovernanceEmblemIcon
 * Authentic Lucide font family icon container for Governance & Forensic Audit Module (§FR-4.5, §FR-8.5).
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
          ? "bg-amber-50 text-amber-800 border-amber-200"
          : "bg-slate-100 text-slate-800 border-slate-200",
        className
      )}
    >
      {hasAnomalies ? (
        <ShieldAlert className="h-5 w-5 text-amber-600" />
      ) : (
        <Scale className="h-5 w-5 text-slate-700" />
      )}
    </div>
  );
}

/**
 * GovernanceVerifiedBadgeIcon
 * Authentic Lucide font family icon container for Corporate Governance Integrity Verified status.
 */
export function GovernanceVerifiedBadgeIcon({ className = "h-10 w-10" }: IconProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs shrink-0",
        className
      )}
    >
      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
    </div>
  );
}
