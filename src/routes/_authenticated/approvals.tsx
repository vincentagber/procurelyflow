import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, XCircle, AlertCircle, FileText, ChevronRight } from "lucide-react";

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

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({
    meta: [
      { title: "Approvals — Procurely Flow" },
      {
        name: "description",
        content:
          "Approve or reject the requests routed to your role, with a permanent decision log.",
      },
      { property: "og:title", content: "Approvals — Procurely Flow" },
      { property: "og:description", content: "Requests waiting on your decision." },
    ],
  }),
  component: Approvals,
});

function Approvals() {
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
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Approvals"
        subtitle="Requests routed to your role by your organization's threshold rules."
      />

      {isLoading ? (
        <div className="space-y-3">
          <div className="h-32 animate-pulse rounded-lg border border-border bg-card/60" />
          <div className="h-32 animate-pulse rounded-lg border border-border bg-card/60" />
        </div>
      ) : !mine.length ? (
        <EmptyState
          title="You're all caught up"
          body="Nothing is waiting on your decision right now. New requests will land here the moment they're routed to you."
        />
      ) : (
        <div className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <span className="flex h-2 w-2 rounded-full bg-signal animate-pulse" />
            Waiting on your decision ({mine.length})
          </h2>

          {mine.map((step) => {
            const req = step.requisitions as {
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
                className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs hover:border-border/80 transition-all space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-md bg-surface px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground border border-border">
                        {req.reference}
                      </span>
                      {req.is_unbudgeted && <StatusPill status="pending" label="Unbudgeted" />}
                    </div>
                    <Link
                      to="/requisitions/$id"
                      params={{ id: req.id }}
                      className="group inline-flex items-center gap-1 text-lg sm:text-xl font-bold font-display uppercase tracking-wide text-foreground hover:text-accent transition-colors"
                    >
                      <span>{req.title}</span>
                      <ChevronRight className="h-4 w-4 opacity-50 group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      Needed by{" "}
                      <span className="font-medium text-foreground">
                        {shortDate(req.needed_by)}
                      </span>{" "}
                      · Step{" "}
                      <span className="font-semibold text-foreground">{step.step_order}</span> as{" "}
                      <span className="font-semibold text-foreground">
                        {ROLE_LABELS[step.required_role] ?? step.required_role}
                      </span>
                    </p>
                  </div>
                  <div className="text-right sm:text-right shrink-0">
                    <p className="font-display text-2xl font-bold tracking-tight">
                      {money(req.total_amount, req.currency)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{step.reason}</p>
                  </div>
                </div>

                {/* Line items summary */}
                {req.requisition_items?.length > 0 && (
                  <div className="rounded-lg border border-border/70 bg-surface/60 p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-muted-foreground font-semibold text-[11px] uppercase tracking-wider">
                      <span>Items ({req.requisition_items.length})</span>
                    </div>
                    <div className="space-y-1.5 divide-y divide-border/40">
                      {req.requisition_items.map((item) => (
                        <div
                          key={item.id}
                          className="pt-1.5 first:pt-0 flex items-center justify-between"
                        >
                          <span className="font-medium text-foreground truncate max-w-[200px] sm:max-w-[360px]">
                            {item.quantity} {item.unit} × {item.description}
                          </span>
                          <span className="tabular-nums text-muted-foreground font-medium">
                            {money(item.quantity * item.estimated_unit_price, req.currency)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {allAttachments.length > 0 && (
                      <div className="pt-2 border-t border-border/50">
                        <p className="text-[11px] font-semibold text-muted-foreground mb-1">
                          Site Photos ({allAttachments.length})
                        </p>
                        <AttachmentThumbs attachments={allAttachments} readOnly />
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Textarea
                    rows={2}
                    className="text-sm bg-background/50"
                    placeholder="Add a comment or note for the record…"
                    value={comments[step.id] ?? ""}
                    onChange={(e) =>
                      setComments((prev) => ({ ...prev, [step.id]: e.target.value }))
                    }
                  />

                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <Button
                      variant="outline"
                      className="h-12 border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground font-semibold text-sm transition-colors"
                      disabled={decide.isPending}
                      onClick={() => {
                        if (!comments[step.id]?.trim()) {
                          setRejectModalStepId(step.id);
                        } else {
                          decide.mutate({ stepId: step.id, decision: "rejected" });
                        }
                      }}
                    >
                      <XCircle className="mr-1.5 h-4 w-4 shrink-0" />
                      Reject
                    </Button>
                    <Button
                      className="h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors shadow-xs"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ stepId: step.id, decision: "approved" })}
                    >
                      <CheckCircle2 className="mr-1.5 h-4 w-4 shrink-0" />
                      Approve
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {upcoming.length ? (
        <section>
          <h2 className="font-display text-xl uppercase tracking-wide">Coming to you</h2>
          <p className="text-xs text-muted-foreground">
            Routed to your role but still queued behind an earlier approval.
          </p>
          <ul className="mt-3 space-y-2">
            {upcoming.map((step) => {
              const req = step.requisitions as {
                id: string;
                reference: string;
                title: string;
                total_amount: number;
                currency: "NGN" | "USD";
              };
              return (
                <li
                  key={step.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2.5"
                >
                  <span className="text-sm">
                    <Link to="/requisitions/$id" params={{ id: req.id }} className="text-accent">
                      {req.reference}
                    </Link>{" "}
                    <span className="text-muted-foreground">{req.title}</span>
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {money(req.total_amount, req.currency)} · step {step.step_order} as{" "}
                    {ROLE_LABELS[step.required_role] ?? step.required_role}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {decided.length ? (
        <section>
          <h2 className="font-display text-xl uppercase tracking-wide">Recently decided</h2>
          <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-surface">
                <tr className="text-left">
                  <th className="px-3 py-2.5 data-label">Request</th>
                  <th className="px-3 py-2.5 data-label">Role</th>
                  <th className="px-3 py-2.5 data-label">Value</th>
                  <th className="px-3 py-2.5 data-label">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {decided.map((step) => {
                  const req = step.requisitions as {
                    id: string;
                    reference: string;
                    title: string;
                    total_amount: number;
                    currency: "NGN" | "USD";
                  };
                  return (
                    <tr key={step.id} className="border-t border-border">
                      <td className="px-3 py-3">
                        <Link
                          to="/requisitions/$id"
                          params={{ id: req.id }}
                          className="text-accent"
                        >
                          {req.reference}
                        </Link>{" "}
                        <span className="text-muted-foreground">{req.title}</span>
                      </td>
                      <td className="px-3 py-3">
                        {ROLE_LABELS[step.required_role] ?? step.required_role}
                      </td>
                      <td className="px-3 py-3 tabular-nums">
                        {money(req.total_amount, req.currency)}
                      </td>
                      <td className="px-3 py-3">
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
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" /> Reason Required for Rejection
            </DialogTitle>
            <DialogDescription>
              Please enter a brief note explaining why this procurement request is being rejected so
              the requester can amend or cancel it.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              rows={3}
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
            <Button variant="outline" onClick={() => setRejectModalStepId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
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
