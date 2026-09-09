"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  Building2,
  FolderKanban,
  User,
  AlertTriangle,
  FileText,
} from "lucide-react";

import {
  getApprovalTokenDetailsFn,
  decideApprovalByTokenFn,
} from "@/lib/procurement.functions";
import { money, shortDate, dateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export default function TokenApprovalPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = params?.token as string;
  const decisionParam = searchParams?.get("decision");

  const [comment, setComment] = useState("");
  const [isDecided, setIsDecided] = useState(false);
  const [decisionOutcome, setDecisionOutcome] = useState<"approved" | "rejected" | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["token-approval", token],
    queryFn: () => getApprovalTokenDetailsFn({ data: { token } }),
    enabled: !!token,
    retry: false,
  });

  const decide = useMutation({
    mutationFn: (decision: "approved" | "rejected") =>
      decideApprovalByTokenFn({
        data: {
          token,
          decision,
          comment: comment.trim() || undefined,
        },
      }),
    onSuccess: (_result, decision) => {
      setIsDecided(true);
      setDecisionOutcome(decision);
      toast.success(
        decision === "approved"
          ? "Requisition successfully approved! Next clearance step or PO generation dispatched."
          : "Requisition rejected. Requisition initiator notified.",
      );
      refetch();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Failed to record approval decision."),
  });

  // Auto-execute if direct query param ?decision=approved or ?decision=rejected is passed
  useEffect(() => {
    if (data && data.status === "VALID" && decisionParam && !isDecided && !decide.isPending) {
      if (decisionParam === "approved" || decisionParam === "rejected") {
        decide.mutate(decisionParam);
      }
    }
  }, [data, decisionParam]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#0B1457] border-t-transparent" />
          <p className="text-xs font-semibold text-slate-600">Verifying secure authorization link…</p>
        </div>
      </div>
    );
  }

  if (!data || data.status !== "VALID") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 sm:p-8 shadow-md border border-slate-200 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 border border-amber-200 text-amber-600">
            <Clock className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            {data?.status === "ALREADY_USED" ? "Decision Already Recorded" : "Invalid or Expired Link"}
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed font-normal">
            {data?.error || "This authorization link has already been consumed or has expired."}
          </p>
          <p className="text-[11px] text-slate-400">
            For audit compliance, single-use action links are deactivated upon decision or expiration.
          </p>
        </div>
      </div>
    );
  }

  const { requisition, step } = data;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Brand Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-[#0B1457] flex items-center justify-center text-white font-black text-sm shadow-xs">
              PF
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 tracking-tight">Procurely Flow</h1>
              <p className="text-[10px] text-slate-400 font-medium">Multi-Channel Executive Clearance</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[10px] font-bold text-emerald-800">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            Verified Secure Token
          </div>
        </div>

        {isDecided || requisition.status !== "pending" ? (
          <div className="rounded-2xl border border-emerald-200 bg-white p-6 sm:p-8 text-center space-y-3 shadow-xs">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              {decisionOutcome === "rejected" ? "Requisition Decision: Rejected" : "Requisition Cleared Successfully"}
            </h3>
            <p className="text-xs text-slate-600">
              Your decision for requisition <strong>{requisition.reference}</strong> has been logged to the permanent forensic audit trail.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-6">
            {/* Requisition Hero */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md">
                  {requisition.reference}
                </span>
                <span className="text-[11px] text-slate-400">
                  Created {shortDate(requisition.createdAt)}
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                {requisition.title}
              </h2>
              <div className="flex items-center gap-2 pt-1">
                <span className="text-2xl font-black tabular-nums text-[#0B1457]">
                  {money(requisition.totalAmount, requisition.currency)}
                </span>
                {requisition.isUnbudgeted ? (
                  <span className="rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-amber-600" />
                    Unbudgeted Capex
                  </span>
                ) : (
                  <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    Budgeted Milestone
                  </span>
                )}
              </div>
            </div>

            {/* Context Grid */}
            <div className="grid sm:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Project Site</p>
                <div className="flex items-center gap-1.5 mt-1 font-semibold text-slate-800">
                  <FolderKanban className="h-3.5 w-3.5 text-slate-400" />
                  <span>{requisition.projectName}</span>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Initiating Engineer</p>
                <div className="flex items-center gap-1.5 mt-1 font-semibold text-slate-800">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  <span>{requisition.requesterName} ({requisition.requesterDepartment})</span>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Date Needed On Site</p>
                <div className="flex items-center gap-1.5 mt-1 font-semibold text-slate-800">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  <span>{requisition.neededBy ? shortDate(requisition.neededBy) : "Urgent / Immediately"}</span>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Clearance Authority</p>
                <div className="flex items-center gap-1.5 mt-1 font-semibold text-[#0B1457]">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" />
                  <span>{step?.reason || `${step?.requiredRole} Approval`}</span>
                </div>
              </div>
            </div>

            {/* Requested Line Items Table */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Itemised Bill of Quantities ({requisition.items.length})
              </h3>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 text-left">
                    <tr>
                      <th className="py-2 px-3 font-semibold">Description</th>
                      <th className="py-2 px-3 font-semibold text-right">Qty</th>
                      <th className="py-2 px-3 font-semibold text-right">Unit Price</th>
                      <th className="py-2 px-3 font-semibold text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {requisition.items.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-medium text-slate-900">{item.description}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-slate-600">
                          {item.quantity} {item.unit}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-slate-600">
                          {money(item.estimatedUnitPrice, requisition.currency)}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-slate-900">
                          {money(item.totalPrice, requisition.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Optional Comment Input */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Approval Notes / Rejection Reason (Optional)
              </label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add compliance condition, delivery instructions, or rejection note…"
                rows={2}
                className="text-xs resize-none"
              />
            </div>

            {/* Primary Action Buttons */}
            <div className="grid sm:grid-cols-2 gap-3 pt-2">
              <Button
                type="button"
                size="lg"
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer shadow-sm transition-all"
                disabled={decide.isPending}
                onClick={() => decide.mutate("approved")}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {decide.isPending ? "Recording Decision…" : "Approve Requisition"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full h-11 border-rose-200 text-rose-700 hover:bg-rose-50 font-bold text-xs cursor-pointer"
                disabled={decide.isPending}
                onClick={() => decide.mutate("rejected")}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject Requisition
              </Button>
            </div>

            <div className="text-center pt-2">
              <p className="text-[11px] text-slate-400">
                Authorized via Procurely Flow Single-Use Token · Audited per NDPA 2023
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
