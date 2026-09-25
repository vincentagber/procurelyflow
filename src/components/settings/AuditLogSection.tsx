import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Lock, ShieldCheck, ShieldAlert, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { money, dateTime } from "@/lib/format";
import { EmptyState } from "@/components/procurely/bits";
import { Button } from "@/components/ui/button";
import { verifyAuditLedgerFn } from "@/lib/procurement.functions";

export function AuditLogSection() {
  const [verifyResult, setVerifyResult] = useState<{
    isValid: boolean;
    verifiedCount: number;
    brokenAtIndex?: number;
    error?: string;
    totalEntries: number;
    verifiedAt: string;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("approval_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      return verifyAuditLedgerFn();
    },
    onSuccess: (res) => {
      setVerifyResult(res as any);
      if (res.isValid) {
        toast.success(`Ledger verified: ${res.verifiedCount} sequential audit blocks unbroken.`);
      } else {
        toast.error(`Cryptographic breach detected: ${res.error}`);
      }
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Failed verifying audit ledger integrity."),
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-base sm:text-lg font-semibold tracking-tight text-slate-900">
              Audit Ledger
            </h2>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 border border-slate-200/80">
              {data?.length ?? 0} Records
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 font-normal">
            Cryptographic ledger tracking requisition movements, approval clearances, and financial
            milestones.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={verifyMutation.isPending}
            className="h-8 text-xs font-semibold border-slate-200 text-slate-800 hover:bg-slate-50 cursor-pointer shadow-2xs"
            onClick={() => verifyMutation.mutate()}
          >
            <ShieldCheck className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
            {verifyMutation.isPending ? "Verifying Hashes…" : "Verify Ledger Integrity"}
          </Button>

          <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
            <Lock className="h-3.5 w-3.5 text-slate-500" />
            <span>SHA-256 Chained</span>
          </div>
        </div>
      </div>

      {verifyResult ? (
        <div
          className={`rounded-xl p-3.5 border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            verifyResult.isValid
              ? "bg-emerald-50/90 border-emerald-200 text-emerald-950"
              : "bg-rose-50 border-rose-200 text-rose-950"
          }`}
        >
          <div className="flex items-start sm:items-center gap-2.5">
            {verifyResult.isValid ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-rose-600 shrink-0 mt-0.5 sm:mt-0" />
            )}
            <div>
              <p className="font-semibold text-xs">
                {verifyResult.isValid
                  ? "Cryptographic Ledger Verified (Canonical SHA-256)"
                  : "Ledger Tampering / Fork Detected"}
              </p>
              <p className="text-[11px] opacity-85 mt-0.5">
                {verifyResult.isValid
                  ? `Verified ${verifyResult.verifiedCount} sequential audit entries against the immutable genesis block. Hash chain unbroken.`
                  : `Integrity compromised at record ${verifyResult.brokenAtIndex}: ${verifyResult.error}`}
              </p>
            </div>
          </div>
          <span className="text-[10px] tabular-nums font-mono opacity-70 shrink-0">
            {dateTime(verifyResult.verifiedAt)}
          </span>
        </div>
      ) : null}

      {isLoading ? (
        <div className="py-16 text-center text-xs text-slate-400 animate-pulse">
          Loading audit ledger…
        </div>
      ) : !data?.length ? (
        <EmptyState
          title="Audit Ledger Initialized"
          body="All future requisition movements and approval routing events will appear here in high-precision audit format."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-medium text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Timestamp</th>
                <th className="px-4 py-2.5">Actor</th>
                <th className="px-4 py-2.5">Event Action</th>
                <th className="px-4 py-2.5">Audit Details</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-500 font-sans tabular-nums text-xs">
                    {dateTime(entry.created_at)}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{entry.actor_name}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-md bg-slate-100 border border-slate-200/60 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                      {entry.action.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                    {entry.detail ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-sans font-semibold text-slate-900 tabular-nums">
                    {entry.amount === null ? "—" : money(entry.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
