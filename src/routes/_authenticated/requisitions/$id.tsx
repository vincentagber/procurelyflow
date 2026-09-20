import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Copy,
  Printer,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Smartphone,
  Send,
  Sparkles,
  Check,
  Clock,
  X,
} from "lucide-react";
import { FaWhatsapp } from "react-icons/fa6";

import { supabase } from "@/integrations/supabase/client";
import { useMe, can } from "@/lib/useMe";
import {
  createRfqFn,
  submitRequisitionFn,
  duplicateRequisitionFn,
  decideApprovalFn,
  generateStepApprovalLinksFn,
  simulateWhatsAppApprovalFn,
} from "@/lib/procurement.functions";
import { money, shortDate, dateTime, ROLE_LABELS, STATUS_LABELS } from "@/lib/format";
import { PageHeader, StatusPill } from "@/components/procurely/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AttachmentThumbs } from "@/components/procurely/AttachmentThumbs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/requisitions/$id")({
  head: () => ({
    meta: [
      { title: "Requisition detail — Procurely Flow" },
      {
        name: "description",
        content: "Items, approval chain and permanent audit trail for a single material request.",
      },
      { property: "og:title", content: "Requisition detail — Procurely Flow" },
      { property: "og:description", content: "Full history of one procurement request." },
    ],
  }),
  component: RequisitionDetail,
});

function RequisitionDetail() {
  const { id } = Route.useParams();
  const me = useMe();
  const queryClient = useQueryClient();
  const [rfqOpen, setRfqOpen] = useState(false);

  // Approval clearance states
  const [whatsappModalStep, setWhatsappModalStep] = useState<string | null>(null);
  const [generatedLinks, setGeneratedLinks] = useState<{
    stepId: string;
    requisitionReference: string;
    approveToken?: string;
    webReviewUrl: string;
    webApproveUrl: string;
    webRejectUrl: string;
    whatsappMessage: string;
    whatsappDirectUrl: string;
    approverPhone: string | null;
    approverEmail?: string | null;
  } | null>(null);
  const [isGeneratingLinks, setIsGeneratingLinks] = useState(false);
  const [rejectModalStepId, setRejectModalStepId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");

  const decide = useMutation({
    mutationFn: (vars: { stepId: string; decision: "approved" | "rejected"; comment?: string }) =>
      decideApprovalFn({ data: vars }),
    onSuccess: async (_, vars) => {
      toast.success(
        vars.decision === "approved"
          ? "Requisition cleared successfully."
          : "Requisition rejected.",
      );
      setRejectModalStepId(null);
      setRejectComment("");
      await queryClient.invalidateQueries();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Failed to record approval decision."),
  });

  const handleOpenWhatsAppModal = async (stepId: string) => {
    setWhatsappModalStep(stepId);
    setIsGeneratingLinks(true);
    try {
      const res = await generateStepApprovalLinksFn({ data: { stepId } });
      setGeneratedLinks(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate clearance tokens.");
      setWhatsappModalStep(null);
    } finally {
      setIsGeneratingLinks(false);
    }
  };

  const simulateWhatsApp = useMutation({
    mutationFn: (stepId: string) => simulateWhatsAppApprovalFn({ data: { stepId } }),
    onSuccess: async () => {
      toast.success("Inbound WhatsApp approval verified and cleared!");
      setWhatsappModalStep(null);
      setGeneratedLinks(null);
      await queryClient.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "WhatsApp simulation failed."),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["requisition", id],
    queryFn: async () => {
      const [req, items, steps, audit] = await Promise.all([
        supabase.from("requisitions").select("*, projects(name)").eq("id", id).maybeSingle(),
        supabase.from("requisition_items").select("*").eq("requisition_id", id).order("sort_order"),
        supabase.from("approval_steps").select("*").eq("requisition_id", id).order("step_order"),
        supabase
          .from("approval_audit_log")
          .select("*")
          .eq("requisition_id", id)
          .order("created_at", { ascending: false }),
      ]);
      return {
        requisition: req.data,
        items: items.data ?? [],
        steps: steps.data ?? [],
        audit: audit.data ?? [],
      };
    },
  });

  const submit = useMutation({
    mutationFn: () => submitRequisitionFn({ data: { requisitionId: id } }),
    onSuccess: async () => {
      toast.success("Submitted. The approval chain has been notified.");
      await queryClient.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't submit this request."),
  });

  const navigate = useNavigate();

  const duplicate = useMutation({
    mutationFn: () => duplicateRequisitionFn({ data: { requisitionId: id } }),
    onSuccess: (res) => {
      toast.success("Requisition duplicated as a new draft.");
      navigate({ to: "/requisitions/$id", params: { id: res.newRequisitionId } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't duplicate request."),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading request…</p>;
  const req = data?.requisition;
  if (!req) return <p className="text-sm text-muted-foreground">This request no longer exists.</p>;

  const isOwner = req.requester_id === me.data?.userId;
  const canBuy = can(me.data?.roles, ["procurement_officer", "admin"]);

  return (
    <div className="space-y-5 pb-10">
      <PageHeader
        title={req.title}
        subtitle={`${req.reference} · raised ${shortDate(req.created_at)}`}
        actions={
          <>
            {req.status === "draft" && isOwner ? (
              <Button className="h-11" disabled={submit.isPending} onClick={() => submit.mutate()}>
                Submit for approval
              </Button>
            ) : null}
            {req.status === "approved" && canBuy ? (
              <Button className="h-11" onClick={() => setRfqOpen((v) => !v)}>
                {rfqOpen ? "Close" : "Request quotes"}
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="h-11"
              disabled={duplicate.isPending}
              onClick={() => duplicate.mutate()}
            >
              <Copy className="mr-1.5 h-4 w-4" /> Duplicate
            </Button>
            <Button
              variant="outline"
              className="h-9 px-4 rounded-lg border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => window.print()}
            >
              <Printer className="mr-1.5 h-3.5 w-3.5" /> Export PDF
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-9 px-4 rounded-lg border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 print:hidden"
            >
              <Link to="/requisitions">All requisitions</Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusPill status={req.status} label={STATUS_LABELS[req.status]} />
        {req.is_unbudgeted ? <StatusPill status="pending" label="Unbudgeted" /> : null}
        <span className="text-xs text-slate-500">
          Project / cost center:{" "}
          <strong className="font-semibold text-slate-700">
            {(req.projects as { name: string } | null)?.name ?? "—"}
          </strong>
        </span>
        <span className="text-xs text-slate-500">
          Needed by{" "}
          <strong className="font-semibold text-slate-700">{shortDate(req.needed_by)}</strong>
        </span>
        {(req as { delivery_location?: string | null }).delivery_location ? (
          <span className="text-xs text-slate-500">
            Site Location:{" "}
            <strong className="font-semibold text-slate-700">
              {(req as { delivery_location?: string | null }).delivery_location}
            </strong>
          </span>
        ) : null}
        <span className="ml-auto font-sans text-2xl font-bold tabular-nums text-slate-900">
          {money(req.total_amount, req.currency)}
        </span>
      </div>

      {rfqOpen ? <RfqComposer requisitionId={id} onDone={() => setRfqOpen(false)} /> : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-surface">
              <tr className="text-left">
                <th className="px-3 py-2.5 data-label">Item</th>
                <th className="px-3 py-2.5 data-label">Qty</th>
                <th className="px-3 py-2.5 data-label">Est. unit</th>
                <th className="px-3 py-2.5 data-label">Line total</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id} className="border-t border-border">
                  <td className="px-3 py-3">
                    <p>{item.description}</p>
                    <AttachmentThumbs attachments={item.attachments} />
                  </td>
                  <td className="px-3 py-3 tabular-nums">
                    {Number(item.quantity)} {item.unit}
                  </td>
                  <td className="px-3 py-3 tabular-nums">
                    {money(item.estimated_unit_price, req.currency)}
                  </td>
                  <td className="px-3 py-3 tabular-nums">
                    {money(Number(item.quantity) * Number(item.estimated_unit_price), req.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {req.notes ? (
            <p className="border-t border-border px-3 py-3 text-sm text-muted-foreground">
              {req.notes}
            </p>
          ) : null}
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900 tracking-tight">
                Approval Chain
              </h2>
              {req.status === "pending_approval" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Active Routing
                </span>
              )}
            </div>
            {data.steps.length ? (
              <ol className="mt-3.5 space-y-3">
                {data.steps.map((step) => {
                  const isPending = step.status === "pending";
                  const canDecide = isPending && can(me.data?.roles, [step.required_role, "admin"]);

                  return (
                    <li
                      key={step.id}
                      className={cn(
                        "rounded-xl border p-3.5 space-y-2 transition-all",
                        isPending
                          ? "border-amber-200 bg-amber-50/20"
                          : step.status === "approved"
                            ? "border-emerald-200 bg-emerald-50/20"
                            : step.status === "rejected"
                              ? "border-rose-200 bg-rose-50/20"
                              : "border-slate-200 bg-slate-50/50",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                          {step.status === "approved" ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          ) : step.status === "pending" ? (
                            <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                          ) : step.status === "rejected" ? (
                            <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
                          ) : (
                            <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                          )}
                          <span>
                            Stage {step.step_order}:{" "}
                            {ROLE_LABELS[step.required_role] ?? step.required_role}
                          </span>
                        </span>
                        <StatusPill status={step.status} />
                      </div>
                      <p className="text-[11px] text-slate-500">{step.reason}</p>
                      {step.decided_at ? (
                        <p className="text-[11px] text-slate-500">
                          {dateTime(step.decided_at)}
                          {step.comment ? ` — "${step.comment}"` : ""}
                        </p>
                      ) : null}

                      {/* Real-time Multi-channel Clearance Actions */}
                      {isPending && (
                        <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center gap-2">
                          {canDecide && (
                            <>
                              <Button
                                size="sm"
                                className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold gap-1.5 cursor-pointer shadow-2xs"
                                disabled={decide.isPending}
                                onClick={() =>
                                  decide.mutate({ stepId: step.id, decision: "approved" })
                                }
                              >
                                <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                                <span>Approve</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-3 border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold gap-1.5 cursor-pointer"
                                disabled={decide.isPending}
                                onClick={() => setRejectModalStepId(step.id)}
                              >
                                <X className="h-3.5 w-3.5 stroke-[2.5]" />
                                <span>Reject</span>
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-3 border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold gap-1.5 cursor-pointer shadow-2xs"
                            onClick={() => handleOpenWhatsAppModal(step.id)}
                          >
                            <FaWhatsapp className="h-4 w-4 text-[#25D366] shrink-0" />
                            <span>WhatsApp 1-Click</span>
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                Not submitted yet — the chain is generated from your organization's threshold rules
                the moment this is sent for approval.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="data-label">Audit trail</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Permanent record. Entries can never be edited or removed.
            </p>
            <ul className="mt-3 space-y-3">
              {data.audit.length ? (
                data.audit.map((entry) => (
                  <li key={entry.id} className="text-sm">
                    <span className="font-medium">{entry.action.replace(/_/g, " ")}</span>
                    <span className="block text-xs text-muted-foreground">
                      {entry.actor_name} · {dateTime(entry.created_at)}
                    </span>
                    {entry.detail ? (
                      <span className="block text-xs text-muted-foreground">{entry.detail}</span>
                    ) : null}
                  </li>
                ))
              ) : (
                <li className="text-sm text-muted-foreground">Nothing logged yet.</li>
              )}
            </ul>
          </div>
        </aside>
      </div>

      {/* Rejection Reason Modal */}
      <Dialog
        open={!!rejectModalStepId}
        onOpenChange={(open) => {
          if (!open) {
            setRejectModalStepId(null);
            setRejectComment("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              Rejection Justification
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Please enter an explicit reason for declining this spend request. This reason is
              permanently recorded in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              rows={3}
              placeholder="e.g. Price exceeds current budget quota or material specification requires update."
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              className="text-xs"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setRejectModalStepId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!rejectModalStepId || !rejectComment.trim() || decide.isPending}
              onClick={() => {
                if (rejectModalStepId) {
                  decide.mutate({
                    stepId: rejectModalStepId,
                    decision: "rejected",
                    comment: rejectComment,
                  });
                }
              }}
            >
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp 1-Click Clearance Dispatch Dialog */}
      <Dialog
        open={!!whatsappModalStep}
        onOpenChange={(open) => {
          if (!open) {
            setWhatsappModalStep(null);
            setGeneratedLinks(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-900 font-bold text-base">
              <FaWhatsapp className="h-5 w-5 text-[#25D366] shrink-0" />
              WhatsApp &amp; Mobile Clearance Channel
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Procurely Flow meets site directors and executives on WhatsApp. Send a tokenized,
              single-use approval prompt that lets them clear requests with one tap without password
              friction.
            </DialogDescription>
          </DialogHeader>

          {isGeneratingLinks ? (
            <div className="py-8 flex flex-col items-center justify-center gap-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
              <p className="text-xs text-slate-500 font-medium">
                Generating single-use cryptographic tokens…
              </p>
            </div>
          ) : generatedLinks ? (
            <div className="space-y-4 py-2 text-xs">
              <div className="flex items-center justify-between bg-emerald-50/80 border border-emerald-200 p-2.5 rounded-lg">
                <span className="font-semibold text-emerald-950 flex items-center gap-1.5">
                  <Smartphone className="h-4 w-4 text-emerald-700" />
                  Target Approver Phone:
                </span>
                <span className="font-mono font-bold text-emerald-800">
                  {generatedLinks.approverPhone || "+234 (Registered Approver)"}
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Formatted WhatsApp Message Template
                </label>
                <div className="p-3 bg-slate-900 text-slate-100 rounded-xl font-mono text-[11px] whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto border border-slate-800 selection:bg-emerald-600">
                  {generatedLinks.whatsappMessage}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-2 pt-1">
                <Button
                  type="button"
                  className="h-10 bg-[#25D366] hover:bg-[#1EBE5D] text-white font-bold text-xs cursor-pointer shadow-xs gap-1.5"
                  onClick={() => {
                    window.open(generatedLinks.whatsappDirectUrl, "_blank", "noopener,noreferrer");
                  }}
                >
                  <FaWhatsapp className="h-4 w-4 shrink-0" />
                  Launch WhatsApp
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs cursor-pointer"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(generatedLinks.whatsappMessage);
                      toast.success("WhatsApp approval message copied to clipboard!");
                    } catch {
                      window.prompt("Copy WhatsApp message", generatedLinks.whatsappMessage);
                    }
                  }}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Copy Message
                </Button>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[10px] text-slate-400">
                  Live simulation of WhatsApp carrier webhook:
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs font-semibold text-[#0B1457] hover:bg-blue-50 cursor-pointer"
                  disabled={simulateWhatsApp.isPending}
                  onClick={() => simulateWhatsApp.mutate(generatedLinks.stepId)}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1.5 text-amber-500" />
                  {simulateWhatsApp.isPending ? "Simulating…" : "Simulate WhatsApp Approval"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RfqComposer({ requisitionId, onDone }: { requisitionId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [instructions, setInstructions] = useState("");
  const [closesAt, setClosesAt] = useState(
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  );
  const [links, setLinks] = useState<{ name: string; url: string }[]>([]);

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("suppliers")
        .select("id, name, email, is_compliant")
        .order("name");
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () =>
      createRfqFn({
        data: {
          requisitionId,
          supplierIds: selected,
          instructions: instructions || undefined,
          closesAt: new Date(`${closesAt}T23:59:00`).toISOString(),
        },
      }),
    onSuccess: async (result) => {
      const byId = new Map((suppliers ?? []).map((s) => [s.id, s.name]));
      setLinks(
        result.invitations.map((i) => ({
          name: byId.get(i.supplier_id) ?? "Supplier",
          url: `${window.location.origin}/quote/${i.token}`,
        })),
      );
      toast.success(`${result.reference} created. Share each private link with its supplier.`);
      await queryClient.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't create this RFQ."),
  });

  if (links.length) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <h2 className="text-base font-semibold text-slate-900 tracking-tight">
          Private Supplier Links
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Each link is unique and expires with the RFQ. A supplier can only ever see their own
          quote.
        </p>
        <ul className="mt-3 space-y-2">
          {links.map((link) => (
            <li key={link.url} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <p className="text-xs font-semibold text-slate-900">{link.name}</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-white border border-slate-200 px-2 py-1.5 text-xs text-slate-700">
                  {link.url}
                </code>
                <Button
                  variant="outline"
                  aria-label="Copy link"
                  className="h-9 shrink-0 rounded-lg border-slate-200 text-xs text-slate-700"
                  onClick={() => {
                    navigator.clipboard.writeText(link.url);
                    toast.success("Link copied.");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <Button
          className="mt-4 h-9 px-4 rounded-lg bg-[#0B1457] hover:bg-[#0001FF] text-white font-medium text-xs shadow-xs"
          onClick={onDone}
        >
          Done
        </Button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <h2 className="text-base font-semibold text-slate-900 tracking-tight">Request Quotes</h2>
      {!suppliers?.length ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Add suppliers first, then you can invite them to quote.{" "}
          <Link to="/suppliers" className="text-accent underline">
            Go to suppliers
          </Link>
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick who to invite. Each supplier gets their own expiring link — no login needed.
          </p>
          <div className="mt-3 space-y-2">
            {suppliers.map((s) => (
              <label
                key={s.id}
                className="tap-row flex items-center gap-3 rounded-md border border-border px-3"
              >
                <Checkbox
                  checked={selected.includes(s.id)}
                  onCheckedChange={(checked) =>
                    setSelected((prev) =>
                      checked ? [...prev, s.id] : prev.filter((x) => x !== s.id),
                    )
                  }
                />
                <span className="text-sm">
                  {s.name}
                  {!s.is_compliant ? (
                    <span className="ml-2 text-xs text-destructive">non-compliant</span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="closes">Quotes close</Label>
              <Input
                id="closes"
                type="date"
                className="h-12"
                value={closesAt}
                onChange={(e) => setClosesAt(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <Label htmlFor="instructions">Instructions to suppliers (optional)</Label>
            <Textarea
              id="instructions"
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Delivery location, quality expectations, payment terms you can accept."
            />
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              className="h-11"
              disabled={!selected.length || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? "Creating…" : "Send RFQ"}
            </Button>
            <Button variant="outline" className="h-11" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
