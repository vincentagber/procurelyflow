import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, Fingerprint, EyeOff, CheckCircle2 } from "lucide-react";
import { logNdpaConsentFn } from "@/lib/procurement.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NdpaComplianceSection({ isAdmin }: { isAdmin: boolean }) {
  const [retentionYears, setRetentionYears] = useState("7");
  const logConsent = useMutation({
    mutationFn: () =>
      logNdpaConsentFn({
        data: {
          consentType: "NDPA 2023 Employee & Vendor Data Processing",
          granted: true,
          details:
            "Consented to multi-tenant data isolation and audit logging per NDPC regulatory standards.",
        },
      }),
    onSuccess: () => toast.success("NDPA consent record logged successfully."),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed logging consent."),
  });

  return (
    <div className="space-y-6">
      {/* 1. Header & Architecture Overview */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h2 className="text-base sm:text-lg font-semibold tracking-tight text-slate-900">
                Data Protection &amp; Statutory Compliance
              </h2>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Active NDPA 2023
              </span>
            </div>
            <p className="text-xs text-slate-500 font-normal leading-relaxed">
              Procurely Flow enforces strict multi-tenant isolation, cryptographic audit trails, and
              automatic PII minimization under Nigeria Data Protection Commission (NDPC)
              regulations.
            </p>
          </div>
        </div>

        {/* 3 Pillars Grid */}
        <div className="grid gap-3.5 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-700 shadow-2xs">
                <Lock className="h-4 w-4" />
              </div>
              <span className="rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                PostgreSQL RLS
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-900">Row-Level Security</p>
            <p className="text-[11px] text-slate-500 leading-relaxed font-normal">
              Database queries are enforced via PostgreSQL RLS policies strictly scoped to your
              tenant organization ID.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-700 shadow-2xs">
                <Fingerprint className="h-4 w-4" />
              </div>
              <span className="rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                SHA-256 Ledger
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-900">Immutable Audit Chain</p>
            <p className="text-[11px] text-slate-500 leading-relaxed font-normal">
              Requisitions, clearances, and payout actions generate sequentially chained
              cryptographic hash records.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-700 shadow-2xs">
                <EyeOff className="h-4 w-4" />
              </div>
              <span className="rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                NDPA §24
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-900">PII &amp; Banking Masking</p>
            <p className="text-[11px] text-slate-500 leading-relaxed font-normal">
              Vendor bank accounts and tax IDs are masked at rest in public views and outbound
              transaction exports.
            </p>
          </div>
        </div>
      </div>

      {/* 2. Statutory Retention & Consent Governance */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-xs space-y-5">
        <div>
          <h3 className="text-base font-semibold text-slate-900 tracking-tight">
            Data Retention &amp; Regulatory Consent
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 font-normal">
            Configure financial record retention horizons and log formal organizational consent
            under NDPC regulations.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Retention Input */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="retention" className="text-xs font-medium text-slate-700">
                Statutory Financial Audit Retention (Years)
              </Label>
              <div className="relative">
                <Input
                  id="retention"
                  type="number"
                  min={7}
                  max={20}
                  className="h-10 rounded-lg border-slate-200 bg-white font-sans text-xs font-semibold tabular-nums text-slate-900 shadow-2xs pr-14 focus-visible:border-[#0B1457] focus-visible:ring-1 focus-visible:ring-[#0B1457]/20"
                  value={retentionYears}
                  onChange={(e) => setRetentionYears(e.target.value)}
                  disabled={!isAdmin}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 select-none">
                  Years
                </span>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed font-normal">
              Mandatory minimum 7 years per Section 375 of the Companies and Allied Matters Act
              (CAMA 2020) and FIRS financial audit guidelines.
            </p>
          </div>

          {/* Consent Action */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5 space-y-3">
            <div>
              <p className="text-xs font-semibold text-slate-900">Regulatory Consent Logging</p>
              <p className="mt-1 text-[11px] text-slate-500 leading-relaxed font-normal">
                Records timestamped compliance agreement with NDPC data processing terms for your
                organization.
              </p>
            </div>

            <Button
              className="h-9 w-full rounded-lg bg-[#0B1457] hover:bg-[#0001FF] text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
              onClick={() => logConsent.mutate()}
              disabled={logConsent.isPending}
            >
              {logConsent.isPending ? (
                "Logging Consent Record…"
              ) : (
                <span className="flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" /> Log NDPA Consent Record
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
