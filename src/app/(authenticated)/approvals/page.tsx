"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, XCircle, AlertCircle, FileText, ChevronRight } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/useMe";
import { decideApprovalFn } from "@/lib/procurement.functions";
import { money, shortDate, ROLE_LABELS } from "@/lib/format";
import { PageHeader, EmptyState, StatusPill } from "@/components/procurely/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      <PageHeader title="Approvals" subtitle="Approve or reject requests routed to your role." />

      {/* Main Queue: Action Required Right Now */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#111315]">
            Action Required Right Now ({mine.length})
          </h2>
          <span className="text-xs text-[#6B7280]">1-Click Sign-Off</span>
        </div>

        {isLoading ? (
          <p className="rounded-xl border border-[#E5E7EB] bg-white p-5 text-xs text-[#6B7280]">
            Loading approval queue…
          </p>
        ) : !mine.length ? (
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-xs">
            <EmptyState
              title="Your approval queue is clear"
              body="When a site request matches your role and approval threshold, it appears here for 1-click sign-off."
            />
          </div>
        ) : (
          <div className="grid gap-4">
            {mine.map((s) => {
              const req =
                (s.requisitions as unknown as {
                  id: string;
                  reference: string;
                  title: string;
                  total_amount: number;
                  currency: "NGN" | "USD";
                  is_unbudgeted: boolean;
                  needed_by: string;
                  requisition_items: {
                    id: string;
                    description: string;
                    quantity: number;
                    unit: string;
                    estimated_unit_price: number;
                    attachments?: { path: string; name: string }[];
                  }[];
                }) ?? null;

              return (
                <div
                  key={s.id}
                  className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-xs"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[#111315]">
                          {req?.reference}
                        </span>
                        <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 uppercase">
                          {ROLE_LABELS[s.required_role] ?? s.required_role}
                        </span>
                      </div>
                      <h3 className="mt-1 text-base font-bold text-[#111315]">{req?.title}</h3>
                      <p className="mt-1 font-mono text-sm font-extrabold text-[#111315]">
                        {money(req?.total_amount ?? 0, req?.currency ?? "NGN")}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setRejectModalStepId(s.id)}
                        disabled={decide.isPending}
                        className="h-10 border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        <XCircle className="mr-1.5 h-3.5 w-3.5" /> Reject
                      </Button>
                      <Button
                        onClick={() => decide.mutate({ stepId: s.id, decision: "approved" })}
                        disabled={decide.isPending}
                        className="h-10 bg-[#111315] text-xs font-semibold text-white hover:bg-[#202428]"
                      >
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Approve Request
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3">
                    <Input
                      placeholder="Add an optional review note or sign-off comment..."
                      value={comments[s.id] || ""}
                      onChange={(e) => setComments({ ...comments, [s.id]: e.target.value })}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Rejection Modal */}
      <Dialog
        open={!!rejectModalStepId}
        onOpenChange={(open) => !open && setRejectModalStepId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reason for rejection</DialogTitle>
            <DialogDescription>
              Explain why this request is being returned to the requester.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="e.g. Please verify unit prices or specify needed site dates."
            value={rejectModalStepId ? comments[rejectModalStepId] || "" : ""}
            onChange={(e) =>
              rejectModalStepId && setComments({ ...comments, [rejectModalStepId]: e.target.value })
            }
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectModalStepId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                rejectModalStepId &&
                decide.mutate({ stepId: rejectModalStepId, decision: "rejected" })
              }
            >
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
