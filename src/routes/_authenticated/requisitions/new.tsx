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
          <section className="space-y-4 rounded-lg border border-border bg-card p-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">What do you need?</Label>
              <Input
                id="title"
                required
                className="h-12"
                placeholder="e.g. 200 bags of cement for block work"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Project / cost center</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Select a project or cost center" />
                  </SelectTrigger>
                  <SelectContent>
                    {(projects ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="needed">Needed by</Label>
                <Input
                  id="needed"
                  type="date"
                  className="h-12"
                  value={neededBy}
                  onChange={(e) => setNeededBy(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as "NGN" | "USD")}>
                  <SelectTrigger className="h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NGN">NGN — Naira</SelectItem>
                    <SelectItem value="USD">USD — Dollar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">Unbudgeted</p>
                  <p className="text-xs text-muted-foreground">Adds one extra approval</p>
                </div>
                <Switch checked={unbudgeted} onCheckedChange={setUnbudgeted} />
              </div>
            </div>
          </section>

          {selectedProject?.budget_amount ? (
            <div
              className={cn(
                "rounded-lg border p-4 text-sm",
                overBudget
                  ? "border-signal/30 bg-signal/10 text-signal"
                  : "border-border bg-card text-muted-foreground",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{selectedProject.name} budget</span>
                <span className="tabular-nums">
                  {money(budget?.remaining ?? 0, currency)} remaining
                </span>
              </div>
              {overBudget ? (
                <p className="mt-1">
                  This request exceeds the remaining project / cost center budget. Mark it as
                  unbudgeted or split it into a separate request.
                </p>
              ) : (
                <p className="mt-1">Estimated total is within the remaining budget.</p>
              )}
            </div>
          ) : null}

          <section className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl uppercase tracking-wide">Items</h2>
              <Button
                type="button"
                variant="outline"
                className="h-10"
                onClick={() => setLines((prev) => [...prev, { ...EMPTY_LINE }])}
              >
                <Plus className="mr-1 h-4 w-4" /> Add item
              </Button>
            </div>

            <div className="mt-3 space-y-4">
              {lines.map((line, index) => (
                <div
                  key={index}
                  className="rounded-md border border-border bg-card p-3.5 shadow-xs"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs text-muted-foreground sm:hidden">Description</Label>
                      <Input
                        className="h-12 text-base sm:text-sm"
                        placeholder="Item description (e.g. 10mm reinforcement bars)"
                        value={line.description}
                        onChange={(e) => updateLine(index, { description: e.target.value })}
                      />
                    </div>
                    {lines.length > 1 ? (
                      <button
                        type="button"
                        aria-label="Remove item"
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface hover:text-destructive"
                        onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground sm:hidden">Qty</Label>
                      <Input
                        className="h-12 text-base sm:text-sm"
                        inputMode="decimal"
                        placeholder="Qty"
                        value={line.quantity}
                        onChange={(e) => updateLine(index, { quantity: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground sm:hidden">Unit</Label>
                      <Input
                        className="h-12 text-base sm:text-sm"
                        placeholder="Unit"
                        value={line.unit}
                        onChange={(e) => updateLine(index, { unit: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground sm:hidden">Price</Label>
                      <Input
                        className="h-12 text-base sm:text-sm"
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

                  <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2.5">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-surface active:scale-95 transition-all">
                      <Camera className="h-4 w-4 text-primary" />
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
                    <p className="text-right text-xs text-muted-foreground">
                      Subtotal{" "}
                      <span className="font-semibold text-foreground tabular-nums text-sm">
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

            <div className="mt-4 space-y-1.5">
              <Label htmlFor="notes">Notes for approvers (optional)</Label>
              <Textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything the approver should know — site conditions, urgency, supplier context."
              />
            </div>
          </section>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="data-label">Estimated value</p>
            <p className="mt-1 font-display text-3xl leading-none">{money(total, currency)}</p>
            {selectedProject?.budget_amount ? (
              <div className="mt-2 flex items-center gap-1.5 text-xs">
                {overBudget ? (
                  <span className="inline-flex items-center gap-1 font-medium text-signal">
                    <AlertTriangle className="h-3.5 w-3.5" /> Exceeds project budget
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Within budget (
                    {money(budget?.remaining ?? 0, currency)} left)
                  </span>
                )}
              </div>
            ) : null}
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="data-label">Approval route</p>
            {chain?.steps.length ? (
              <>
                <p className="mt-1 text-xs text-muted-foreground">
                  Rule: {chain.ruleLabel} ·{" "}
                  <span className={chain.mode === "parallel" ? "text-signal" : "text-primary"}>
                    {chain.mode === "parallel"
                      ? "all approvers in parallel"
                      : "one approver at a time"}
                  </span>
                </p>
                <ol className="mt-3 space-y-2">
                  {chain.steps.map((step, index) => (
                    <li key={index} className="flex gap-2 text-sm">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                        {step.order}
                      </span>

                      <span>
                        <span className="font-medium">{ROLE_LABELS[step.role] ?? step.role}</span>
                        <span className="block text-xs text-muted-foreground">{step.reason}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Add values and we'll show exactly who has to approve.
              </p>
            )}
          </div>

          <div className="hidden space-y-2 lg:block">
            <Button
              className="h-12 w-full text-base font-medium"
              disabled={!title.trim() || save.isPending}
              onClick={() => save.mutate(true)}
            >
              {save.isPending ? "Submitting…" : "Submit for approval"}
            </Button>
            <Button
              variant="outline"
              className="h-12 w-full"
              disabled={!title.trim() || save.isPending}
              onClick={() => save.mutate(false)}
            >
              Save as draft
            </Button>
          </div>
        </aside>
      </div>

      {/* Sticky Bottom Action Bar for Mobile (390px screens) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between border-t border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur-md lg:hidden">
        <div className="min-w-0 pr-2">
          <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
            Total
          </p>
          <p className="truncate font-display text-lg font-bold leading-tight">
            {money(total, currency)}
          </p>
          {overBudget ? (
            <p className="truncate text-[10px] font-semibold text-signal flex items-center gap-0.5">
              <AlertTriangle className="h-3 w-3 inline shrink-0" /> Over budget
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 px-3 text-xs"
            onClick={() => setLines((prev) => [...prev, { ...EMPTY_LINE }])}
          >
            <Plus className="mr-1 h-4 w-4" /> Item
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-11 px-4 text-xs font-semibold"
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
