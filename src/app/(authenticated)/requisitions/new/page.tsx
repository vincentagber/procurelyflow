"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export default function NewRequisitionPage() {
  const me = useMe();
  const router = useRouter();
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
      router.push(`/requisitions/${id}`);
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
                <Label htmlFor="needed">When is this needed on site?</Label>
                <Input
                  id="needed"
                  type="date"
                  className="h-12"
                  value={neededBy}
                  onChange={(e) => setNeededBy(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as "NGN" | "USD")}>
                  <SelectTrigger className="h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NGN">NGN (₦) — Naira</SelectItem>
                    <SelectItem value="USD">USD ($) — Dollar</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border bg-surface p-3">
                <div>
                  <Label htmlFor="unbudgeted" className="cursor-pointer font-medium">
                    Unbudgeted spend
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Flags this request for an additional executive review.
                  </p>
                </div>
                <Switch id="unbudgeted" checked={unbudgeted} onCheckedChange={setUnbudgeted} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes / context for approvers (optional)</Label>
              <Textarea
                id="notes"
                rows={2}
                placeholder="e.g. Urgent — needed to keep block layers working tomorrow."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </section>

          {/* Line Items */}
          <section className="space-y-4 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg uppercase tracking-wide text-foreground">
                Line Items
              </h2>
              <span className="font-mono text-xs text-muted-foreground">
                Total: {money(total, currency)}
              </span>
            </div>

            <div className="space-y-3">
              {lines.map((l, index) => (
                <div
                  key={index}
                  className="space-y-3 rounded-md border border-border bg-surface p-3"
                >
                  <div className="grid gap-2 sm:grid-cols-[1fr_100px_100px_120px_40px]">
                    <Input
                      placeholder="Description"
                      className="h-10"
                      value={l.description}
                      onChange={(e) => updateLine(index, { description: e.target.value })}
                    />
                    <Input
                      placeholder="Qty"
                      type="number"
                      className="h-10"
                      value={l.quantity}
                      onChange={(e) => updateLine(index, { quantity: e.target.value })}
                    />
                    <Input
                      placeholder="Unit"
                      className="h-10"
                      value={l.unit}
                      onChange={(e) => updateLine(index, { unit: e.target.value })}
                    />
                    <Input
                      placeholder="Est. Price"
                      type="number"
                      className="h-10"
                      value={l.unitPrice}
                      onChange={(e) => updateLine(index, { unitPrice: e.target.value })}
                    />
                    <button
                      type="button"
                      disabled={lines.length === 1}
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                      className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-destructive disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => setLines((prev) => [...prev, { ...EMPTY_LINE }])}
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" /> Add Another Item
            </Button>
          </section>

          <div className="flex items-center justify-end gap-3">
            <Button
              variant="outline"
              disabled={save.isPending || !title.trim()}
              onClick={() => save.mutate(false)}
            >
              Save Draft
            </Button>
            <Button
              disabled={save.isPending || !title.trim() || total <= 0}
              onClick={() => save.mutate(true)}
            >
              Submit for Approval
            </Button>
          </div>
        </div>

        {/* Sidebar: Approval Preview & Budget */}
        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Approval Chain Preview
            </h3>
            {chain ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-semibold text-foreground">{chain.ruleLabel}</p>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  {chain.steps.map((s, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                        {s.order}
                      </span>
                      <span>{ROLE_LABELS[s.role] ?? s.role}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Add an amount to preview the required approval stages.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
