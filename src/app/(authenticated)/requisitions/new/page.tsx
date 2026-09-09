"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Camera, Paperclip, X, AlertTriangle, CheckCircle2 } from "lucide-react";

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
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Each document or photo must be under 50 MB.");
      return;
    }
    const itemId = crypto.randomUUID();
    setUploadingIndex(index);
    try {
      const { signedUrl, path } = await attachmentUploadUrlFn({
        data: { itemId, filename: file.name, contentType: file.type || "application/octet-stream" },
      });
      const res = await fetch(signedUrl, { method: "PUT", body: file });
      if (!res.ok) throw new Error("Upload failed");
      updateLine(index, {
        attachments: [...lines[index]!.attachments, { path, name: file.name }],
      });
      toast.success("Document attached.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't attach document.");
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
                <Label htmlFor="needed" className="text-xs font-medium text-slate-700">When is this needed on site?</Label>
                <Input
                  id="needed"
                  type="date"
                  className="h-10 text-xs rounded-lg border-slate-200 bg-white shadow-2xs"
                  value={neededBy}
                  onChange={(e) => setNeededBy(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Currency</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as "NGN" | "USD")}>
                  <SelectTrigger className="h-10 text-xs rounded-lg border-slate-200 bg-white shadow-2xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NGN" className="text-xs">NGN (₦) — Naira</SelectItem>
                    <SelectItem value="USD" className="text-xs">USD ($) — Dollar</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5">
                <div>
                  <Label htmlFor="unbudgeted" className="cursor-pointer font-semibold text-xs text-slate-900">
                    Unbudgeted Spend
                  </Label>
                  <p className="text-[11px] text-slate-500">
                    Flags this request for an additional executive review.
                  </p>
                </div>
                <Switch id="unbudgeted" checked={unbudgeted} onCheckedChange={setUnbudgeted} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-xs font-medium text-slate-700">Notes / context for approvers (optional)</Label>
              <Textarea
                id="notes"
                rows={2}
                className="text-xs rounded-lg border-slate-200 bg-white shadow-2xs placeholder:text-slate-400 focus-visible:border-[#0B1457]"
                placeholder="e.g. Urgent — needed to keep block layers working tomorrow."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </section>

          {/* Line Items */}
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900 tracking-tight">Line Items</h2>
                <p className="text-xs text-slate-500">Add materials and estimated price breakdown.</p>
              </div>
              <span className="font-sans text-xs font-semibold tabular-nums text-slate-900">
                Total: {money(total, currency)}
              </span>
            </div>

            <div className="space-y-3">
              {lines.map((l, index) => (
                <div
                  key={index}
                  className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 shadow-2xs"
                >
                  <div className="grid gap-2 sm:grid-cols-[1fr_100px_100px_120px_40px]">
                    <Input
                      placeholder="Description"
                      className="h-9 text-xs rounded-lg border-slate-200 bg-white shadow-2xs placeholder:text-slate-400 focus-visible:border-[#0B1457]"
                      value={l.description}
                      onChange={(e) => updateLine(index, { description: e.target.value })}
                    />
                    <Input
                      placeholder="Qty"
                      type="number"
                      className="h-9 text-xs rounded-lg border-slate-200 bg-white shadow-2xs"
                      value={l.quantity}
                      onChange={(e) => updateLine(index, { quantity: e.target.value })}
                    />
                    <Input
                      placeholder="Unit"
                      className="h-9 text-xs rounded-lg border-slate-200 bg-white shadow-2xs"
                      value={l.unit}
                      onChange={(e) => updateLine(index, { unit: e.target.value })}
                    />
                    <Input
                      placeholder="Est. Price"
                      type="number"
                      className="h-9 text-xs rounded-lg border-slate-200 bg-white shadow-2xs"
                      value={l.unitPrice}
                      onChange={(e) => updateLine(index, { unitPrice: e.target.value })}
                    />
                    <button
                      type="button"
                      disabled={lines.length === 1}
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <AttachmentThumbs
                    attachments={l.attachments}
                    onRemove={(path) => removeAttachment(index, path)}
                    readOnly={false}
                  />

                  <div className="flex items-center justify-between border-t border-slate-200/60 pt-2 mt-2">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-all shadow-2xs">
                      <Paperclip className="h-3.5 w-3.5 text-[#0B1457]" />
                      {uploadingIndex === index ? "Uploading…" : "Attach document / photo"}
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.zip,.png,.jpg,.jpeg,.webp,image/*,application/*"
                        className="sr-only"
                        onChange={(e) => handleFileChange(index, e.target.files?.[0] ?? null)}
                        disabled={uploadingIndex === index}
                      />
                    </label>
                    <p className="text-right text-xs text-slate-500">
                      Subtotal{" "}
                      <span className="font-semibold text-slate-900 tabular-nums">
                        {money(
                          (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0),
                          currency,
                        )}
                      </span>
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => setLines((prev) => [...prev, { ...EMPTY_LINE }])}
              className="h-9 w-full rounded-lg border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-medium shadow-2xs"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Another Item
            </Button>
          </section>

          <div className="flex items-center justify-end gap-3">
            <Button
              variant="outline"
              className="h-9 px-4 rounded-lg border-slate-200 text-slate-700 hover:bg-slate-50 font-medium text-xs transition-colors cursor-pointer"
              disabled={save.isPending || !title.trim()}
              onClick={() => save.mutate(false)}
            >
              Save as Draft
            </Button>
            <Button
              className="h-9 px-5 rounded-lg bg-[#0B1457] hover:bg-[#0001FF] text-white font-semibold text-xs transition-colors shadow-xs cursor-pointer"
              disabled={save.isPending || !title.trim() || total <= 0}
              onClick={() => save.mutate(true)}
            >
              Submit for Approval
            </Button>
          </div>
        </div>

        {/* Sidebar: Approval Preview & Budget */}
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Sequential Sign-Off Pipeline
            </h3>
            {chain ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-semibold text-slate-900">{chain.ruleLabel}</p>
                <ul className="space-y-2 text-xs text-slate-600">
                  {chain.steps.map((s, i) => (
                    <li key={i} className="flex items-center gap-2.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0B1457] text-[10px] font-semibold text-white">
                        {s.order}
                      </span>
                      <span className="font-medium text-slate-800">{ROLE_LABELS[s.role] ?? s.role}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-400">
                Add an amount to preview the required approval stages.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
