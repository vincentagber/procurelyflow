"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Copy,
  Printer,
  Send,
  Plus,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Smartphone,
  Sparkles,
  Check,
  Clock,
  X,
} from "lucide-react";

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

export default function RequisitionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  const me = useMe();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [rfqOpen, setRfqOpen] = useState(false);

  // Multi-channel approval clearance states
  const [whatsappModalStep, setWhatsappModalStep] = useState<string | null>(null);
  const [generatedLinks, setGeneratedLinks] = useState<{
    stepId: string;
    requisitionRef: string;
    approverPhone?: string | null;
    whatsappMessage: string;
    whatsappDirectUrl: string;
    webApprovalUrl: string;
  } | null>(null);
  const [isGeneratingLinks, setIsGeneratingLinks] = useState(false);
  const [rejectModalStepId, setRejectModalStepId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");

  const decide = useMutation({
    mutationFn: (vars: { stepId: string; decision: "approved" | "rejected"; comment?: string }) =>
      decideApprovalFn({ data: vars }),
    onSuccess: async (_, vars) => {
      toast.success(vars.decision === "approved" ? "Requisition cleared successfully." : "Requisition rejected.");
      setRejectModalStepId(null);
      setRejectComment("");
      await queryClient.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to record approval decision."),
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

  const duplicate = useMutation({
    mutationFn: () => duplicateRequisitionFn({ data: { requisitionId: id } }),
    onSuccess: (res) => {
      toast.success("Requisition duplicated as a new draft.");
      router.push(`/requisitions/${res.newRequisitionId}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't duplicate request."),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading request…</p>;
  const req = data?.requisition;
  if (!req) return <p className="text-sm text-muted-foreground">This request no longer exists.</p>;

  const isOwner = req.requester_id === me.data?.userId;
  const canBuy = can(me.data?.roles, ["procurement_officer", "admin"]);

  return (
    <div className="space-y-5 pb-10 font-sans">
      <PageHeader
        title={req.title}
        subtitle={`${req.reference} · raised ${shortDate(req.created_at)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {req.status === "draft" && isOwner ? (
              <Button onClick={() => submit.mutate()} disabled={submit.isPending} className="h-10">
                Submit for Approval
              </Button>
            ) : null}
            {req.status === "approved" && canBuy ? (
              <Button
                onClick={() => setRfqOpen((v) => !v)}
                className="h-10 bg-[#111315] text-xs font-semibold text-white"
              >
                {rfqOpen ? "Close RFQ Panel" : "Request Supplier Quotes"}
              </Button>
            ) : null}
            <Button
              variant="outline"
              onClick={() => duplicate.mutate()}
              disabled={duplicate.isPending}
              className="h-10"
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Duplicate
            </Button>
            <Button variant="outline" onClick={() => window.print()} className="h-10">
              <Printer className="mr-1.5 h-3.5 w-3.5" /> Print
            </Button>
          </div>
        }
      />

      {rfqOpen ? <RfqComposer requisitionId={id} onDone={() => setRfqOpen(false)} /> : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {/* Summary Banner */}
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-xs">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                  Project / Cost Center
                </span>
                <p className="mt-1 text-sm font-semibold text-[#111315]">
                  {(req.projects as { name?: string })?.name ?? "—"}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                  Total Value
                </span>
                <p className="mt-1 text-sm font-bold text-[#111315]">
                  {money(req.total_amount, req.currency)}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                  Status
                </span>
                <div className="mt-1">
                  <StatusPill status={req.status} label={STATUS_LABELS[req.status]} />
                </div>
              </div>
            </div>
            {(req as { delivery_location?: string | null }).delivery_location ? (
              <div className="mt-4 border-t border-[#F3F4F6] pt-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                  Site Delivery Location / Drop-off Point (FR-1.1)
                </span>
                <p className="mt-1 text-xs font-semibold text-[#111315]">
                  {(req as { delivery_location?: string | null }).delivery_location}
                </p>
              </div>
            ) : null}
            {req.notes ? (
              <div className="mt-4 border-t border-[#F3F4F6] pt-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                  Notes from Site
                </span>
                <p className="mt-1 text-xs text-[#374151]">{req.notes}</p>
              </div>
            ) : null}
          </div>

          {/* Items Table */}
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-xs">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#111315]">
              Line Items ({data?.items.length})
            </h2>
            <div className="mt-3 overflow-x-auto rounded-lg border border-[#E5E7EB]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F9FAFB] text-[11px] font-semibold text-[#6B7280]">
                  <tr>
                    <th className="px-3 py-2.5">#</th>
                    <th className="px-3 py-2.5">Description</th>
                    <th className="px-3 py-2.5">Quantity</th>
                    <th className="px-3 py-2.5">Est. Unit Price</th>
                    <th className="px-3 py-2.5 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {data?.items.map((item, index) => (
                    <tr key={item.id} className="hover:bg-[#F9FAFB]/70">
                      <td className="px-3 py-3 text-[#9CA3AF] font-mono">{index + 1}</td>
                      <td className="px-3 py-3 font-medium text-[#111315]">
                        {item.description}
                        {Array.isArray(item.attachments) && item.attachments.length ? (
                          <div className="mt-1.5">
                            <AttachmentThumbs
                              attachments={item.attachments as unknown as { path: string; name: string }[]}
                            />
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        {item.quantity} {item.unit}
                      </td>
                      <td className="px-3 py-3 tabular-nums">
                        {money(item.estimated_unit_price, req.currency)}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-[#111315]">
                        {money(
                          Number(item.quantity) * Number(item.estimated_unit_price),
                          req.currency,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Sidebar: Approval Chain & Real-time Clearance */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Approval Chain
              </h3>
              {req.status === "submitted" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Active Routing
                </span>
              )}
            </div>

            <ul className="mt-3.5 space-y-3">
              {data?.steps.map((s) => {
                const isPending = s.status === "pending";
                const canDecide = isPending && can(me.data?.roles, [s.required_role, "admin"]);

                return (
                  <li
                    key={s.id}
                    className={cn(
                      "rounded-xl border p-3.5 space-y-2 transition-all",
                      isPending
                        ? "border-amber-200 bg-amber-50/20"
                        : s.status === "approved"
                        ? "border-emerald-200 bg-emerald-50/20"
                        : s.status === "rejected"
                        ? "border-rose-200 bg-rose-50/20"
                        : "border-slate-200 bg-slate-50/50"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                        {s.status === "approved" ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        ) : s.status === "pending" ? (
                          <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                        ) : s.status === "rejected" ? (
                          <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
                        ) : (
                          <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                        )}
                        <span>
                          Stage {s.step_order}: {ROLE_LABELS[s.required_role] ?? s.required_role}
                        </span>
                      </span>
                      <StatusPill status={s.status} />
                    </div>
                    <p className="text-[11px] text-slate-500">{s.reason}</p>
                    {s.decided_at ? (
                      <p className="text-[11px] text-slate-500">
                        {dateTime(s.decided_at)}
                        {s.comment ? ` — "${s.comment}"` : ""}
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
                              onClick={() => decide.mutate({ stepId: s.id, decision: "approved" })}
                            >
                              <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                              <span>Approve</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-3 border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold gap-1.5 cursor-pointer"
                              disabled={decide.isPending}
                              onClick={() => setRejectModalStepId(s.id)}
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
                          onClick={() => handleOpenWhatsAppModal(s.id)}
                        >
                          <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
                          <span>WhatsApp 1-Click</span>
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
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
            <DialogTitle className="text-base font-bold text-slate-900">Rejection Justification</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Please enter an explicit reason for declining this spend request. This reason is permanently recorded in the audit trail.
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
                  decide.mutate({ stepId: rejectModalStepId, decision: "rejected", comment: rejectComment });
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
              <MessageSquare className="h-5 w-5 text-emerald-600" />
              WhatsApp &amp; Mobile Clearance Channel
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Procurely Flow meets site directors and executives on WhatsApp. Send a tokenized, single-use approval prompt that lets them clear requests with one tap without password friction.
            </DialogDescription>
          </DialogHeader>

          {isGeneratingLinks ? (
            <div className="py-8 flex flex-col items-center justify-center gap-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
              <p className="text-xs text-slate-500 font-medium">Generating single-use cryptographic tokens…</p>
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
                  className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer shadow-xs"
                  onClick={() => {
                    window.open(generatedLinks.whatsappDirectUrl, "_blank", "noopener,noreferrer");
                  }}
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" />
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
  const [closesAt, setClosesAt] = useState("");
  const [instructions, setInstructions] = useState("");
  const [links, setLinks] = useState<{ supplierName: string; url: string }[] | null>(null);

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, is_compliant")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: () =>
      createRfqFn({
        data: {
          requisitionId,
          supplierIds: selected,
          closesAt: closesAt ? new Date(closesAt).toISOString() : undefined,
          instructions: instructions || undefined,
        },
      }),
    onSuccess: async (res) => {
      toast.success("RFQ created and invitations generated.");
      setLinks(
        (res.invitations as any[]).map((inv) => ({
          supplierName: suppliers?.find((s) => s.id === inv.supplier_id)?.name ?? "Supplier",
          url: `${window.location.origin}/quote/${inv.token}`,
        })),
      );
      await queryClient.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't send RFQ."),
  });

  if (links) {
    return (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <h3 className="text-sm font-bold text-emerald-950">Supplier Quoting Links Generated</h3>
        <p className="mt-1 text-xs text-emerald-800">
          Share these individual links with each invited supplier via WhatsApp or Email:
        </p>
        <ul className="mt-3 space-y-2">
          {links.map((link, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-white p-3 text-xs"
            >
              <div>
                <span className="font-bold text-[#111315]">{link.supplierName}</span>
                <p className="font-mono text-[11px] text-[#6B7280] truncate max-w-md">{link.url}</p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(link.url);
                  toast.success(`Copied quoting link for ${link.supplierName}`);
                }}
                className="h-8 text-xs font-semibold"
              >
                <Copy className="mr-1 h-3.5 w-3.5" /> Copy Link
              </Button>
            </li>
          ))}
        </ul>
        <Button onClick={onDone} className="mt-4 bg-[#111315] text-xs text-white">
          Done
        </Button>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-xs">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[#111315]">
        Issue Digital RFQ to Suppliers
      </h3>
      <p className="mt-1 text-xs text-[#6B7280]">
        Select approved suppliers to receive sealed quotation requests.
      </p>

      <div className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Select Suppliers</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {suppliers?.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-2 rounded-lg border border-[#E5E7EB] p-2.5 text-xs"
              >
                <Checkbox
                  checked={selected.includes(s.id)}
                  onCheckedChange={(checked) => {
                    if (checked) setSelected([...selected, s.id]);
                    else setSelected(selected.filter((item) => item !== s.id));
                  }}
                />
                <span className="font-medium text-[#111315]">{s.name}</span>
                {s.is_compliant ? (
                  <span className="ml-auto text-[10px] text-emerald-600 font-bold">Compliant</span>
                ) : null}
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Quotation Deadline</Label>
            <Input
              type="date"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
              className="h-10 text-xs"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Special Instructions to Suppliers</Label>
          <Textarea
            rows={2}
            placeholder="e.g. Specify site delivery timeline and warranty terms."
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            className="text-xs"
          />
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            disabled={!selected.length || create.isPending}
            onClick={() => create.mutate()}
            className="bg-[#111315] text-xs font-semibold text-white hover:bg-[#202428]"
          >
            <Send className="mr-1.5 h-3.5 w-3.5" /> Dispatch RFQ Links
          </Button>
          <Button variant="outline" onClick={onDone} className="text-xs">
            Cancel
          </Button>
        </div>
      </div>
    </section>
  );
}
