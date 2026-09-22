import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/useMe";
import { shortDate } from "@/lib/format";
import {
  createApprovalDelegationFn,
  getActiveDelegationsFn,
  revokeApprovalDelegationFn,
} from "@/lib/procurement.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DelegationRecord {
  id: string;
  delegator_id: string;
  substitute_id: string;
  start_date: string;
  end_date: string;
  status: "active" | "revoked";
  reason?: string | null;
  delegator?: { full_name?: string | null } | null;
  substitute?: { full_name?: string | null } | null;
}

export function DelegationsSection({ isAdmin }: { isAdmin: boolean }) {
  const me = useMe();
  const queryClient = useQueryClient();

  const [substituteId, setSubstituteId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const { data: teamMembers } = useQuery({
    queryKey: ["team-members-delegation"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, department")
        .order("full_name");
      return (data ?? []).filter((p) => p.id !== me.data?.userId);
    },
  });

  const { data: delegations, isLoading } = useQuery({
    queryKey: ["approval-delegations"],
    queryFn: () => getActiveDelegationsFn(),
  });

  const createDelegationMutation = useMutation({
    mutationFn: async () => {
      if (!substituteId) throw new Error("Select a substitute approver.");
      if (!startDate || !endDate) throw new Error("Select start and end dates.");
      if (startDate > endDate) throw new Error("Start date cannot be after end date.");

      return createApprovalDelegationFn({
        data: {
          substituteId,
          startDate,
          endDate,
          reason: reason.trim() || undefined,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Approval authority delegation successfully activated.");
      setSubstituteId("");
      setStartDate("");
      setEndDate("");
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["approval-delegations"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed creating delegation."),
  });

  const revokeDelegationMutation = useMutation({
    mutationFn: async (delegationId: string) => {
      return revokeApprovalDelegationFn({ data: { delegationId } });
    },
    onSuccess: async () => {
      toast.success("Delegation revoked.");
      await queryClient.invalidateQueries({ queryKey: ["approval-delegations"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed revoking delegation."),
  });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-xs space-y-6">
        <div>
          <h2 className="text-base font-semibold text-slate-900 tracking-tight">
            Approval Authority Delegation (FR-2.6)
          </h2>
          <p className="mt-1 text-xs text-slate-500 leading-relaxed font-normal">
            Temporarily delegate your financial signing authority to a named colleague while away on
            annual leave, site inspection, or travel. The substitute can approve on your behalf, and
            all actions are cryptographically tagged in the SHA-256 audit ledger.
          </p>
        </div>

        {/* Create Delegation Form */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Set Up New Delegation
          </h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label className="text-xs font-medium text-slate-700">Substitute Approver</Label>
              <Select value={substituteId} onValueChange={setSubstituteId}>
                <SelectTrigger className="h-10 rounded-lg border-slate-200 bg-white text-xs shadow-2xs">
                  <SelectValue placeholder="Choose colleague…" />
                </SelectTrigger>
                <SelectContent>
                  {(teamMembers ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">
                      {m.full_name || m.email} {m.department ? `(${m.department})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="del-start" className="text-xs font-medium text-slate-700">
                Effective From
              </Label>
              <Input
                id="del-start"
                type="date"
                className="h-10 rounded-lg border-slate-200 bg-white text-xs shadow-2xs"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="del-end" className="text-xs font-medium text-slate-700">
                Effective Until
              </Label>
              <Input
                id="del-end"
                type="date"
                className="h-10 rounded-lg border-slate-200 bg-white text-xs shadow-2xs"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="del-reason" className="text-xs font-medium text-slate-700">
              Reason / Context (Optional)
            </Label>
            <Input
              id="del-reason"
              placeholder="e.g. Annual leave, site travel to Epe coastal highway, conference"
              className="h-10 rounded-lg border-slate-200 bg-white text-xs shadow-2xs"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="flex justify-end">
            <Button
              className="h-9 px-4 rounded-lg bg-[#0B1457] hover:bg-[#0001FF] text-white text-xs font-semibold shadow-xs cursor-pointer"
              disabled={
                createDelegationMutation.isPending || !substituteId || !startDate || !endDate
              }
              onClick={() => createDelegationMutation.mutate()}
            >
              {createDelegationMutation.isPending
                ? "Activating Delegation…"
                : "Activate Delegation Authority"}
            </Button>
          </div>
        </div>

        {/* Delegations List */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Recorded Delegations ({delegations?.length || 0})
          </h3>

          {isLoading ? (
            <p className="text-xs text-slate-400">Loading delegation records…</p>
          ) : !delegations || delegations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500">
              No active or past approval delegations recorded.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
              {((delegations as unknown as DelegationRecord[]) ?? []).map((d) => {
                const isDelegator = d.delegator_id === me.data?.userId;
                const isSubstitute = d.substitute_id === me.data?.userId;
                const canRevoke = (isDelegator || isAdmin) && d.status === "active";

                return (
                  <div
                    key={d.id}
                    className="p-4 bg-white hover:bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">
                          {d.delegator?.full_name || "Approver"} →{" "}
                          {d.substitute?.full_name || "Substitute"}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            d.status === "active"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}
                        >
                          {d.status === "active" ? "Active" : "Revoked"}
                        </span>
                        {isSubstitute ? (
                          <span className="rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 text-[10px] font-medium">
                            Delegated to You
                          </span>
                        ) : null}
                      </div>
                      <p className="text-slate-500 text-[11px]">
                        Validity:{" "}
                        <strong className="font-mono text-slate-700">
                          {shortDate(d.start_date)}
                        </strong>{" "}
                        to{" "}
                        <strong className="font-mono text-slate-700">
                          {shortDate(d.end_date)}
                        </strong>
                        {d.reason ? ` · "${d.reason}"` : ""}
                      </p>
                    </div>

                    {canRevoke ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold cursor-pointer shrink-0"
                        disabled={revokeDelegationMutation.isPending}
                        onClick={() => revokeDelegationMutation.mutate(d.id)}
                      >
                        Revoke Authority
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
