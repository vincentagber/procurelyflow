import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Camera, X, AlertTriangle, CheckCircle2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/useMe";
import { AttachmentThumbs } from "@/components/procurely/AttachmentThumbs";
import {
  previewApprovalChain,
  submitRequisitionFn,
  projectBudgetStatusFn,
  attachmentUploadUrlFn,
} from "@/lib/procurement.functions";
import { money, ROLE_LABELS } from "@/lib/format";
import { PageHeader } from "@/components/procurely/bits";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/requisitions/new")({
  head: () => ({
    meta: [
      { title: "New requisition — Procurely Flow" },
      {
        name: "description",
        content:
          "Raise a material request from site in under a minute and see who must approve it.",
      },
      { property: "og:title", content: "New requisition — Procurely Flow" },
      { property: "og:description", content: "Fast, mobile-first material requests." },
    ],
  }),
  component: NewRequisition,
});

type Attachment = { path: string; name: string };
type Line = {
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  attachments: Attachment[];
};

const EMPTY_LINE: Line = {
  description: "",
  quantity: "1",
  unit: "unit",
  unitPrice: "",
  attachments: [],
};

function NewRequisition() {
  const me = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [neededBy, setNeededBy] = useState("");
  const [currency, setCurrency] = useState<"NGN" | "USD">("NGN");
  const [unbudgeted, setUnbudgeted] = useState(false);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ ...EMPTY_LINE }]);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [chain, setChain] = useState<{
    ruleLabel: string;
    mode: "sequential" | "parallel";
    steps: { role: string; order: number; reason: string }[];
  } | null>(null);

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("id, name, budget_amount")
        .order("name");
      return data ?? [];
    },
  });

  const { data: budget } = useQuery({
    queryKey: ["project-budget", projectId],
    queryFn: () => projectBudgetStatusFn({ data: { projectId } }),
    enabled: !!projectId,
  });

  const total = lines.reduce(
    (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0),
    0,
  );

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await previewApprovalChain({
          data: { amount: total, isUnbudgeted: unbudgeted },
        });
        if (!cancelled) setChain(result);
      } catch {
        /* preview is advisory only */
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [total, unbudgeted]);

  const save = useMutation({
    mutationFn: async (submitNow: boolean) => {
      const cleanLines = lines.filter((l) => l.description.trim());
      if (!cleanLines.length) throw new Error("Add at least one item to this request.");

      const { data: req, error } = await supabase
        .from("requisitions")
        .insert({
          org_id: me.data!.profile!.org_id!,
          requester_id: me.data!.userId,
          project_id: projectId || null,
          title,
          notes: notes || null,
          needed_by: neededBy || null,
          currency,
          is_unbudgeted: unbudgeted,
          total_amount: total,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: itemError } = await supabase.from("requisition_items").insert(
        cleanLines.map((l, index) => ({
          requisition_id: req.id,
          description: l.description.trim(),
          quantity: Number(l.quantity) || 1,
          unit: l.unit || "unit",
          estimated_unit_price: Number(l.unitPrice) || 0,
          sort_order: index,
          attachments: l.attachments.length ? l.attachments : null,
        })),
      );
      if (itemError) throw itemError;

      if (submitNow) {
        await submitRequisitionFn({ data: { requisitionId: req.id } });
      }
      return req.id;
    },
    onSuccess: async (id, submitNow) => {
      await queryClient.invalidateQueries();
      toast.success(
        submitNow
          ? "Request submitted for approval."
          : "Saved as a draft. Submit when you're ready.",
      );
      navigate({ to: "/requisitions/$id", params: { id } });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "We couldn't save this request."),
  });

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  async function handleFileChange(index: number, file: File | null) {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Each photo must be under 4 MB.");
      return;
    }
    const itemId = crypto.randomUUID();
    setUploadingIndex(index);
    try {
      const { signedUrl, path } = await attachmentUploadUrlFn({
        data: { itemId, filename: file.name, contentType: file.type },
      });
      const res = await fetch(signedUrl, { method: "PUT", body: file });
      if (!res.ok) throw new Error("Upload failed");
      updateLine(index, {
        attachments: [...lines[index]!.attachments, { path, name: file.name }],
      });
      toast.success("Photo attached.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't attach photo.");
    } finally {
      setUploadingIndex(null);
    }
  }

  function removeAttachment(index: number, path: string) {
    updateLine(index, {
      attachments: lines[index]!.attachments.filter((a) => a.path !== path),
    });
  }

  const selectedProject = projects?.find((p) => p.id === projectId);
  const overBudget = !!budget && budget.budget > 0 && total > budget.remaining;

  return (
    <div className="space-y-5 pb-10">
      <PageHeader
        title="New requisition"
        subtitle="Keep it short — describe what site needs, how much, and when."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs">
            <div className="space-y-1.5">
              <Label htmlFor="title" className="text-xs font-medium text-slate-700">What do you need?</Label>
              <Input
                id="title"
                required
                className="h-10 text-xs rounded-lg border-slate-200 bg-white shadow-2xs placeholder:text-slate-400 focus-visible:border-[#0B1457]"
                placeholder="e.g. 200 bags of cement for block work"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Project / cost center</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger className="h-10 text-xs rounded-lg border-slate-200 bg-white shadow-2xs">
                    <SelectValue placeholder="Select a project or cost center" />
                  </SelectTrigger>
                  <SelectContent>
                    {(projects ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="needed" className="text-xs font-medium text-slate-700">Needed by</Label>
                <Input
                  id="needed"
                  type="date"
                  className="h-10 text-xs rounded-lg border-slate-200 bg-white shadow-2xs"
                  value={neededBy}
                  onChange={(e) => setNeededBy(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Currency</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as "NGN" | "USD")}>
                  <SelectTrigger className="h-10 text-xs rounded-lg border-slate-200 bg-white shadow-2xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NGN" className="text-xs">NGN — Naira (₦)</SelectItem>
                    <SelectItem value="USD" className="text-xs">USD — Dollar ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5">
                <div>
                  <p className="text-xs font-semibold text-slate-900">Unbudgeted Request</p>
                  <p className="text-[11px] text-slate-500">Adds an additional sign-off stage</p>
                </div>
                <Switch checked={unbudgeted} onCheckedChange={setUnbudgeted} />
              </div>
            </div>
          </section>

          {selectedProject?.budget_amount ? (
            <div
              className={cn(
                "rounded-xl border p-4 text-xs",
                overBudget
                  ? "border-rose-200 bg-rose-50/70 text-rose-800"
                  : "border-slate-200 bg-slate-50/70 text-slate-600",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">{selectedProject.name} Budget</span>
                <span className="tabular-nums font-semibold">
                  {money(budget?.remaining ?? 0, currency)} remaining
                </span>
              </div>
              {overBudget ? (
                <p className="mt-1 text-rose-700">
                  This request exceeds the remaining project / cost center budget. Mark it as
                  unbudgeted or split it into a separate request.
                </p>
              ) : (
                <p className="mt-1 text-slate-500">Estimated total is within the remaining budget.</p>
              )}
            </div>
          ) : null}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900 tracking-tight">Line Items</h2>
                <p className="text-xs text-slate-500">Add materials, specifications, and estimated unit rates.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-9 px-3 rounded-lg border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setLines((prev) => [...prev, { ...EMPTY_LINE }])}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Add item
              </Button>
            </div>

            <div className="mt-3 space-y-3">
              {lines.map((line, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 shadow-2xs space-y-3"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-1">
                      <Label className="text-[11px] text-slate-500 sm:hidden">Description</Label>
                      <Input
                        className="h-9 text-xs rounded-lg border-slate-200 bg-white shadow-2xs placeholder:text-slate-400 focus-visible:border-[#0B1457]"
                        placeholder="Item description (e.g. 10mm reinforcement bars)"
                        value={line.description}
                        onChange={(e) => updateLine(index, { description: e.target.value })}
                      />
                    </div>
                    {lines.length > 1 ? (
                      <button
                        type="button"
                        aria-label="Remove item"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                        onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[11px] text-slate-500 sm:hidden">Qty</Label>
                      <Input
                        className="h-9 text-xs rounded-lg border-slate-200 bg-white shadow-2xs"
                        inputMode="decimal"
                        placeholder="Qty"
                        value={line.quantity}
                        onChange={(e) => updateLine(index, { quantity: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-slate-500 sm:hidden">Unit</Label>
                      <Input
                        className="h-9 text-xs rounded-lg border-slate-200 bg-white shadow-2xs"
                        placeholder="Unit"
                        value={line.unit}
                        onChange={(e) => updateLine(index, { unit: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-slate-500 sm:hidden">Price</Label>
                      <Input
                        className="h-9 text-xs rounded-lg border-slate-200 bg-white shadow-2xs"
                        inputMode="decimal"
                        placeholder="Est. price"
                        value={line.unitPrice}
                        onChange={(e) => updateLine(index, { unitPrice: e.target.value })}
                      />
                    </div>
                  </div>

                  <AttachmentThumbs
                    attachments={line.attachments}
                    onRemove={(path) => removeAttachment(index, path)}
                    readOnly={false}
                  />

                  <div className="flex items-center justify-between border-t border-slate-200/60 pt-2">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-all shadow-2xs">
                      <Camera className="h-3.5 w-3.5 text-[#0B1457]" />
                      {uploadingIndex === index ? "Uploading…" : "Snap photo"}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="sr-only"
                        onChange={(e) => handleFileChange(index, e.target.files?.[0] ?? null)}
                        disabled={uploadingIndex === index}
                      />
                    </label>
                    <p className="text-right text-xs text-slate-500">
                      Subtotal{" "}
                      <span className="font-semibold text-slate-900 tabular-nums">
                        {money(
                          (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0),
                          currency,
                        )}
                      </span>
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 pt-2">
              <Label htmlFor="notes" className="text-xs font-medium text-slate-700">Notes / context for approvers (optional)</Label>
              <Textarea
                id="notes"
                rows={3}
                className="text-xs rounded-lg border-slate-200 bg-white shadow-2xs placeholder:text-slate-400 focus-visible:border-[#0B1457]"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything the approver should know — site conditions, urgency, supplier context."
              />
            </div>
          </section>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <p className="text-xs font-medium text-slate-500">Estimated Total</p>
            <p className="mt-1 font-sans text-2xl font-bold tabular-nums text-slate-900">{money(total, currency)}</p>
            {selectedProject?.budget_amount ? (
              <div className="mt-2 flex items-center gap-1.5 text-xs">
                {overBudget ? (
                  <span className="inline-flex items-center gap-1 font-medium text-rose-600">
                    <AlertTriangle className="h-3.5 w-3.5" /> Exceeds project budget
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Within budget (
                    {money(budget?.remaining ?? 0, currency)} left)
                  </span>
                )}
              </div>
            ) : null}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <p className="text-xs font-medium text-slate-500">Sequential Sign-Off Pipeline</p>
            {chain?.steps.length ? (
              <>
                <p className="mt-1 text-xs text-slate-500">
                  Policy: <span className="font-semibold text-slate-700">{chain.ruleLabel}</span> ·{" "}
                  <span className={chain.mode === "parallel" ? "text-amber-600" : "text-[#0B1457] font-semibold"}>
                    {chain.mode === "parallel"
                      ? "parallel clearance"
                      : "sequential clearance"}
                  </span>
                </p>
                <ol className="mt-3 space-y-2">
                  {chain.steps.map((step, index) => (
                    <li key={index} className="flex items-start gap-2.5 text-xs">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0B1457] text-[10px] font-semibold text-white">
                        {step.order}
                      </span>

                      <div>
                        <span className="font-semibold text-slate-900">{ROLE_LABELS[step.role] ?? step.role}</span>
                        <span className="block text-[11px] text-slate-500">{step.reason}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="mt-2 text-xs text-slate-400">
                Enter item amounts to preview the required clearance sequence.
              </p>
            )}
          </div>

          <div className="hidden space-y-2 lg:block">
            <Button
              className="h-9 w-full rounded-lg bg-[#0B1457] hover:bg-[#0001FF] text-white font-semibold text-xs shadow-xs transition-colors cursor-pointer"
              disabled={!title.trim() || save.isPending}
              onClick={() => save.mutate(true)}
            >
              {save.isPending ? "Submitting…" : "Submit for Approval"}
            </Button>
            <Button
              variant="outline"
              className="h-9 w-full rounded-lg border-slate-200 text-slate-700 hover:bg-slate-50 font-medium text-xs transition-colors cursor-pointer"
              disabled={!title.trim() || save.isPending}
              onClick={() => save.mutate(false)}
            >
              Save as Draft
            </Button>
          </div>
        </aside>
      </div>

      {/* Sticky Bottom Action Bar for Mobile (390px screens) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between border-t border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-md lg:hidden">
        <div className="min-w-0 pr-2">
          <p className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">
            Total
          </p>
          <p className="truncate font-sans text-lg font-bold tabular-nums text-slate-900">
            {money(total, currency)}
          </p>
          {overBudget ? (
            <p className="truncate text-[10px] font-semibold text-rose-600 flex items-center gap-0.5">
              <AlertTriangle className="h-3 w-3 inline shrink-0" /> Over budget
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 px-3 text-xs rounded-lg border-slate-200"
            onClick={() => setLines((prev) => [...prev, { ...EMPTY_LINE }])}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Item
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-9 px-4 text-xs font-semibold rounded-lg bg-[#0B1457] hover:bg-[#0001FF] text-white"
            disabled={!title.trim() || save.isPending}
            onClick={() => save.mutate(true)}
          >
            {save.isPending ? "…" : "Submit"}
          </Button>
        </div>
      </div>
    </div>
  );
}
