import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { money, dateTime } from "@/lib/format";
import { EmptyState } from "@/components/procurely/bits";

export function AuditLogSection() {
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
            Cryptographic ledger tracking requisition movements, approval clearances, and policy
            updates.
          </p>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
          <Lock className="h-3.5 w-3.5 text-slate-500" />
          <span>SHA-256 Chained</span>
        </div>
      </div>

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
