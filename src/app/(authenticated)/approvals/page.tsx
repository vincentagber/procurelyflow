"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, XCircle, AlertCircle, ChevronRight } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/useMe";
import { decideApprovalFn } from "@/lib/procurement.functions";
import { money, shortDate, ROLE_LABELS } from "@/lib/format";
import { PageHeader, EmptyState, StatusPill } from "@/components/procurely/bits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AttachmentThumbs } from "@/components/procurely/AttachmentThumbs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export default function ApprovalsPage() {
  const me = useMe();
  const queryClient = useQueryClient();
  const [comments, setComments] = useState<Record<string, string>>({});
  const [rejectModalStepId, setRejectModalStepId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["approval-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("approval_steps")
        .select(
          "id, step_order, required_role, reason, status, requisition_id, requisitions(id, reference, title, total_amount, currency, is_unbudgeted, needed_by, status, requisition_items(id, description, quantity, unit, estimated_unit_price, attachments))",
        )
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const decide = useMutation({
    mutationFn: (input: { stepId: string; decision: "approved" | "rejected" }) =>
      decideApprovalFn({
        data: {
          stepId: input.stepId,
          decision: input.decision,
          comment: comments[input.stepId] || undefined,
        },
      }),
    onSuccess: async (_result, input) => {
      toast.success(
        input.decision === "approved"
          ? "Approved. The next approver has been queued."
          : "Rejected. The requester can see your reason.",
      );
      setRejectModalStepId(null);
      await queryClient.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't record that decision."),
  });

  const steps = data ?? [];

  const liveOrder = new Map<string, number>();
  for (const s of steps) {
    if (s.status !== "pending" || !s.requisition_id) continue;
    const current = liveOrder.get(s.requisition_id);
    if (current === undefined || s.step_order < current) {
      liveOrder.set(s.requisition_id, s.step_order);
    }
  }

  const mineAll = steps.filter(
    (s) => s.status === "pending" && me.data?.roles.includes(s.required_role as never),
  );
  const mine = mineAll.filter((s) => liveOrder.get(s.requisition_id ?? "") === s.step_order);
  const upcoming = mineAll.filter((s) => liveOrder.get(s.requisition_id ?? "") !== s.step_order);
  const decided = steps.filter((s) => s.status !== "pending").slice(0, 12);

  return (
    <div className="space-y-6 pb-12 font-sans">
      <PageHeader
        title="Approvals"
        subtitle="Requests routed to your role by your organization's threshold rules."
      />

      {isLoading ? (
        <div className="space-y-3">
          <div className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white/60" />
          <div className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white/60" />
        </div>
      ) : !mine.length ? (
        <EmptyState
          title="You're all caught up"
          body="Nothing is waiting on your decision right now. New requests will land here the moment they're routed to you."
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <span className="flex h-2 w-2 rounded-full bg-[#0001FF] animate-pulse" />
              Waiting on your decision ({mine.length})
            </h2>
            <span className="text-xs text-slate-400 font-normal">Immediate clearance required</span>
          </div>

          {mine.map((step) => {
            const req = step.requisitions as unknown as {
              id: string;
              reference: string;
              title: string;
              total_amount: number;
              currency: "NGN" | "USD";
              is_unbudgeted: boolean;
              needed_by: string | null;
              requisition_items: {
                id: string;
                description: string;
                quantity: number;
                unit: string;
                estimated_unit_price: number;
                attachments: unknown;
              }[];
            };

            const allAttachments = (req.requisition_items ?? []).flatMap(
              (item) => (item.attachments as { path: string; name: string }[] | null) ?? [],
            );

            return (
              <article
                key={step.id}
                id={`approval-${step.id}`}
                className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs hover:border-slate-300 hover:shadow-2xs transition-all space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-md bg-slate-100 border border-slate-200/80 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-700">
                        {req.reference}
                      </span>
                      {req.is_unbudgeted && <StatusPill status="pending" label="Unbudgeted" />}
                    </div>
                    <Link
                      href={`/requisitions/${req.id}`}
                      className="group inline-flex items-center gap-1 text-base sm:text-lg font-semibold text-slate-900 hover:text-[#0001FF] tracking-tight transition-colors"
                    >
                      <span>{req.title}</span>
                      <ChevronRight className="h-4 w-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                    <p className="text-xs text-slate-500 font-normal">
                      Needed by{" "}
                      <span className="font-medium text-slate-700">
                        {shortDate(req.needed_by)}
                      </span>{" "}
                      · Step{" "}
                      <span className="font-semibold text-slate-900">{step.step_order}</span> as{" "}
                      <span className="font-semibold text-slate-900">
                        {ROLE_LABELS[step.required_role] ?? step.required_role}
                      </span>
                    </p>
                  </div>
                  <div className="text-right sm:text-right shrink-0">
                    <p className="font-sans text-xl sm:text-2xl font-semibold tabular-nums text-slate-900 tracking-tight">
                      {money(req.total_amount, req.currency)}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{step.reason}</p>
                  </div>
                </div>

                {/* Line items summary */}
                {req.requisition_items?.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-500 font-medium text-[11px]">
                      <span>Items ({req.requisition_items.length})</span>
                    </div>
                    <div className="space-y-1.5 divide-y divide-slate-200/60">
                      {req.requisition_items.map((item) => (
                        <div
                          key={item.id}
                          className="pt-1.5 first:pt-0 flex items-center justify-between text-slate-700"
                        >
                          <span className="font-medium truncate max-w-[200px] sm:max-w-[360px]">
                            {item.quantity} {item.unit} × {item.description}
                          </span>
                          <span className="tabular-nums font-semibold text-slate-900">
                            {money(item.quantity * item.estimated_unit_price, req.currency)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {allAttachments.length > 0 && (
                      <div className="pt-2 border-t border-slate-200/60">
                        <p className="text-[11px] font-medium text-slate-500 mb-1">
                          Site Photos ({allAttachments.length})
                        </p>
                        <AttachmentThumbs attachments={allAttachments} readOnly />
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2.5 pt-1">
                  <Textarea
                    rows={2}
                    className="text-xs bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:border-[#0B1457] rounded-lg"
                    placeholder="Add an optional review note or sign-off comment for the audit ledger…"
                    value={comments[step.id] ?? ""}
                    onChange={(e) =>
                      setComments((prev) => ({ ...prev, [step.id]: e.target.value }))
                    }
                  />

                  <div className="flex items-center justify-end gap-2.5">
                    <Button
                      variant="outline"
                      className="h-9 px-4 rounded-lg border-slate-200 text-slate-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 font-medium text-xs transition-colors cursor-pointer"
                      disabled={decide.isPending}
                      onClick={() => {
                        if (!comments[step.id]?.trim()) {
                          setRejectModalStepId(step.id);
                        } else {
                          decide.mutate({ stepId: step.id, decision: "rejected" });
                        }
                      }}
                    >
                      <XCircle className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                      Reject Request
                    </Button>
                    <Button
                      className="h-9 px-5 rounded-lg bg-[#0B1457] hover:bg-[#0001FF] text-white font-semibold text-xs transition-colors shadow-xs cursor-pointer"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ stepId: step.id, decision: "approved" })}
                    >
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                      Approve &amp; Sign Off
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {upcoming.length ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 tracking-tight">Upcoming Pipeline</h2>
            <p className="text-xs text-slate-500 font-normal">
              Routed to your role but currently queued behind earlier sequential clearance stages.
            </p>
          </div>
          <ul className="space-y-2">
            {upcoming.map((step) => {
              const req = step.requisitions as unknown as {
                id: string;
                reference: string;
                title: string;
                total_amount: number;
                currency: "NGN" | "USD";
              };
              return (
                <li
                  key={step.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-2xs hover:border-slate-300 transition-all"
                >
                  <span className="text-xs">
                    <Link href={`/requisitions/${req.id}`} className="text-[#0B1457] hover:text-[#0001FF] font-semibold tabular-nums">
                      {req.reference}
                    </Link>{" "}
                    <span className="text-slate-600 ml-1.5">{req.title}</span>
                  </span>
                  <span className="text-xs tabular-nums text-slate-500 font-medium">
                    {money(req.total_amount, req.currency)} · Step {step.step_order} as{" "}
                    <strong className="text-slate-700 font-semibold">{ROLE_LABELS[step.required_role] ?? step.required_role}</strong>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {decided.length ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 tracking-tight">Recently Decided</h2>
            <p className="text-xs text-slate-500 font-normal">
              Historical record of your role sign-offs and rejections.
            </p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
            <table className="w-full min-w-[520px] text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-medium">
                <tr className="text-left">
                  <th className="px-4 py-2.5">Request Reference &amp; Title</th>
                  <th className="px-4 py-2.5">Authority Role</th>
                  <th className="px-4 py-2.5">Committed Value</th>
                  <th className="px-4 py-2.5">Clearance Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {decided.map((step) => {
                  const req = step.requisitions as unknown as {
                    id: string;
                    reference: string;
                    title: string;
                    total_amount: number;
                    currency: "NGN" | "USD";
                  };
                  return (
                    <tr key={step.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          href={`/requisitions/${req.id}`}
                          className="text-[#0B1457] hover:text-[#0001FF] font-semibold tabular-nums"
                        >
                          {req.reference}
                        </Link>{" "}
                        <span className="text-slate-600 ml-1.5">{req.title}</span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">
                        {ROLE_LABELS[step.required_role] ?? step.required_role}
                      </td>
                      <td className="px-4 py-3 tabular-nums font-semibold text-slate-900">
                        {money(req.total_amount, req.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={step.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Rejection Reason Modal */}
      <Dialog
        open={!!rejectModalStepId}
        onOpenChange={(open) => !open && setRejectModalStepId(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600 font-semibold text-base">
              <AlertCircle className="h-4 w-4" /> Reason Required for Rejection
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Please enter a brief note explaining why this procurement request is being rejected so
              the requester can amend or cancel it.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              rows={3}
              className="text-xs bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:border-[#0B1457] rounded-lg"
              placeholder="e.g. Price exceeds current quota for this material, please obtain a secondary quote."
              value={rejectModalStepId ? (comments[rejectModalStepId] ?? "") : ""}
              onChange={(e) => {
                if (rejectModalStepId) {
                  const val = e.target.value;
                  setComments((prev) => ({ ...prev, [rejectModalStepId]: val }));
                }
              }}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="h-9 text-xs" onClick={() => setRejectModalStepId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="h-9 text-xs bg-rose-600 hover:bg-rose-700 text-white"
              disabled={
                !rejectModalStepId || !comments[rejectModalStepId]?.trim() || decide.isPending
              }
              onClick={() => {
                if (rejectModalStepId) {
                  decide.mutate({ stepId: rejectModalStepId, decision: "rejected" });
                }
              }}
            >
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
