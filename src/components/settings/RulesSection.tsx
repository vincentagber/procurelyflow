import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trash2,
  SlidersHorizontal,
  ArrowRight,
  Plus,
  Sparkles,
  GitCommitHorizontal,
  GitFork,
  UserCheck,
  ArrowUp,
  ArrowDown,
  X,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, type AppRole } from "@/lib/useMe";
import { money, ROLE_LABELS } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ALL_ROLES, ROLE_CONFIG } from "./roleConfig";

function sanitizePolicyLabel(label: string): string {
  // Strip out duplicate parenthetical amount text like "(₦1,000,000 - ₦10,000,000)" or "(> ₦10,000,000)"
  const cleaned = label.replace(/\s*\([₦$><=0-9,\s\-.]+\)/gi, "").trim();
  return cleaned || label;
}

export function RulesSection({
  isAdmin,
  showBuilder,
  setShowBuilder,
}: {
  isAdmin: boolean;
  showBuilder: boolean;
  setShowBuilder: (val: boolean | ((prev: boolean) => boolean)) => void;
}) {
  const me = useMe();
  const queryClient = useQueryClient();

  // Builder Draft State
  const [draft, setDraft] = useState({
    label: "",
    min_amount: "",
    max_amount: "",
    stages: ["approver", "procurement_officer", "finance"] as AppRole[],
    extra: "none" as AppRole | "none",
    mode: "sequential" as "sequential" | "parallel",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["approval-rules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("approval_rules").select("*").order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Deduplicate identical rules for clean UI presentation
  const rulesList = data ?? [];
  const uniqueRules: typeof rulesList = rulesList.reduce((acc: typeof rulesList, r) => {
    const isDup = acc.some(
      (item) =>
        item.label === r.label &&
        item.min_amount === r.min_amount &&
        item.max_amount === r.max_amount &&
        JSON.stringify(item.required_roles) === JSON.stringify(r.required_roles) &&
        item.approval_mode === r.approval_mode,
    );
    if (!isDup) acc.push(r);
    return acc;
  }, []);

  const create = useMutation({
    mutationFn: async () => {
      if (!draft.label.trim()) throw new Error("Please enter a policy title.");
      if (!draft.stages.length) throw new Error("At least one clearance stage role is required.");

      const { error } = await supabase.from("approval_rules").insert({
        org_id: me.data!.profile!.org_id!,
        label: draft.label.trim(),
        min_amount: Number(draft.min_amount) || 0,
        max_amount: draft.max_amount ? Number(draft.max_amount) : null,
        required_roles: draft.stages,
        approval_mode: draft.mode,
        extra_role_if_unbudgeted: draft.extra === "none" ? null : draft.extra,
        sort_order: (data?.length ?? 0) + 1,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Spend threshold policy deployed successfully.");
      setDraft({
        label: "",
        min_amount: "",
        max_amount: "",
        stages: ["approver", "procurement_officer", "finance"],
        extra: "none",
        mode: "sequential",
      });
      setShowBuilder(false);
      await queryClient.invalidateQueries({ queryKey: ["approval-rules"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save threshold rule."),
  });

  const remove = useMutation({
    mutationFn: async (rule: (typeof rulesList)[number]) => {
      const idsToDelete = (data ?? [])
        .filter((r) => r.label === rule.label && r.min_amount === rule.min_amount)
        .map((r) => r.id);

      const { error } = await supabase
        .from("approval_rules")
        .delete()
        .in("id", idsToDelete.length ? idsToDelete : [rule.id]);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Threshold tier removed. Active requisitions retain their initial chain.");
      await queryClient.invalidateQueries({ queryKey: ["approval-rules"] });
    },
  });

  const deployStandardTiers = useMutation({
    mutationFn: async () => {
      const orgId = me.data?.profile?.org_id;
      if (!orgId) throw new Error("Organization ID not found.");

      // Clear existing rules for this org
      await supabase.from("approval_rules").delete().eq("org_id", orgId);

      // Deploy standard Nigerian Enterprise spend limits
      const standardTiers = [
        {
          org_id: orgId,
          label: "Tier 1: Operational Spend (Below ₦500k)",
          min_amount: 0,
          max_amount: 500000,
          required_roles: ["approver"] as AppRole[],
          approval_mode: "sequential" as const,
          extra_role_if_unbudgeted: "executive" as const,
          sort_order: 1,
        },
        {
          org_id: orgId,
          label: "Tier 2: Mid-Range Spend (₦500k – ₦5m)",
          min_amount: 500000,
          max_amount: 5000000,
          required_roles: ["approver", "finance"] as AppRole[],
          approval_mode: "sequential" as const,
          extra_role_if_unbudgeted: "executive" as const,
          sort_order: 2,
        },
        {
          org_id: orgId,
          label: "Tier 3: Major CapEx (> ₦5m)",
          min_amount: 5000000,
          max_amount: null,
          required_roles: ["finance", "executive"] as AppRole[],
          approval_mode: "sequential" as const,
          extra_role_if_unbudgeted: "admin" as const,
          sort_order: 3,
        },
      ];

      const { error } = await supabase.from("approval_rules").insert(standardTiers);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(
        "Nigerian Enterprise Standards deployed: Below ₦500k (Dept Head) · ₦500k–₦5m (Dept + Finance) · >₦5m (Finance + CEO).",
      );
      await queryClient.invalidateQueries({ queryKey: ["approval-rules"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to deploy standard tiers.");
    },
  });

  // Stage Manipulation Helpers
  const addStage = (role: AppRole) => {
    setDraft((p) => ({ ...p, stages: [...p.stages, role] }));
  };

  const removeStage = (idx: number) => {
    setDraft((p) => ({
      ...p,
      stages: p.stages.filter((_, i) => i !== idx),
    }));
  };

  const moveStage = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= draft.stages.length) return;
    setDraft((p) => {
      const arr = [...p.stages];
      const [item] = arr.splice(fromIdx, 1);
      if (!item) return p;
      arr.splice(toIdx, 0, item);
      return { ...p, stages: arr };
    });
  };

  const applyTemplate = (template: "standard3" | "executive4" | "direct2") => {
    if (template === "standard3") {
      setDraft((p) => ({
        ...p,
        label: p.label || "Mid-Cap Operational Spend",
        stages: ["approver", "procurement_officer", "finance"],
        mode: "sequential",
      }));
    } else if (template === "executive4") {
      setDraft((p) => ({
        ...p,
        label: p.label || "Major Capital Expenditure (CapEx)",
        stages: ["approver", "procurement_officer", "finance", "executive"],
        mode: "sequential",
      }));
    } else {
      setDraft((p) => ({
        ...p,
        label: p.label || "Direct Departmental Spend",
        stages: ["approver", "finance"],
        mode: "sequential",
      }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Interactive Expandable Policy Designer */}
      <AnimatePresence>
        {showBuilder && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-xs relative">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                    <SlidersHorizontal className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 tracking-tight">
                      Configure Threshold Policy Tier
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5 font-normal">
                      Define the spend band parameters, routing architecture, and sequential
                      clearance stages.
                    </p>
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-[11px] font-medium text-slate-400 mr-1">Presets:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft({
                        label: "Tier 1: Operational Spend (Below ₦500k)",
                        min_amount: "0",
                        max_amount: "500000",
                        stages: ["approver"],
                        extra: "executive",
                        mode: "sequential",
                      });
                    }}
                    className="rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer"
                  >
                    &lt; ₦500k (Dept Head)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft({
                        label: "Tier 2: Mid-Range Spend (₦500k – ₦5m)",
                        min_amount: "500000",
                        max_amount: "5000000",
                        stages: ["approver", "finance"],
                        extra: "executive",
                        mode: "sequential",
                      });
                    }}
                    className="rounded-md bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer"
                  >
                    ₦500k–₦5m (Dept + Finance)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft({
                        label: "Tier 3: Major CapEx (> ₦5m)",
                        min_amount: "5000000",
                        max_amount: "",
                        stages: ["finance", "executive"],
                        extra: "admin",
                        mode: "sequential",
                      });
                    }}
                    className="rounded-md bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer"
                  >
                    &gt; ₦5m (Finance + CEO)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTemplate("standard3")}
                    className="rounded-md bg-slate-100 hover:bg-slate-200/80 px-2 py-1 text-[11px] font-medium text-slate-700 transition-colors cursor-pointer"
                  >
                    3-Stage Standard
                  </button>
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  create.mutate();
                }}
                className="space-y-5 pt-5"
              >
                {/* 1. Policy Name & Range */}
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-1.5 md:col-span-1">
                    <Label htmlFor="policy-title" className="text-xs font-medium text-slate-700">
                      Policy Title
                    </Label>
                    <Input
                      id="policy-title"
                      required
                      placeholder="e.g. Major Capex Purchases"
                      value={draft.label}
                      onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))}
                      className="h-10 rounded-lg border-slate-200 bg-white text-xs font-medium text-slate-900 shadow-2xs focus-visible:border-[#0B1457] focus-visible:ring-1 focus-visible:ring-[#0B1457]/20"
                    />
                    <p className="text-[11px] text-slate-400">
                      Descriptive name for internal governance audit.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="policy-min" className="text-xs font-medium text-slate-700">
                      From Band (₦)
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 select-none">
                        ₦
                      </span>
                      <Input
                        id="policy-min"
                        type="number"
                        placeholder="0"
                        value={draft.min_amount}
                        onChange={(e) => setDraft((p) => ({ ...p, min_amount: e.target.value }))}
                        className="h-10 rounded-lg border-slate-200 bg-white pl-7 text-xs font-semibold tabular-nums text-slate-900 shadow-2xs focus-visible:border-[#0B1457] focus-visible:ring-1 focus-visible:ring-[#0B1457]/20"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400">Threshold lower trigger bound.</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="policy-max" className="text-xs font-medium text-slate-700">
                      To Band (₦)
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 select-none">
                        ₦
                      </span>
                      <Input
                        id="policy-max"
                        type="number"
                        placeholder="Leave blank for Uncapped"
                        value={draft.max_amount}
                        onChange={(e) => setDraft((p) => ({ ...p, max_amount: e.target.value }))}
                        className="h-10 rounded-lg border-slate-200 bg-white pl-7 text-xs font-semibold tabular-nums text-slate-900 shadow-2xs focus-visible:border-[#0B1457] focus-visible:ring-1 focus-visible:ring-[#0B1457]/20"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400">Empty indicates no upper limit.</p>
                  </div>
                </div>

                {/* 2. Routing Mode Radio Cards */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-700">
                    Sign-off Routing Architecture
                  </Label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setDraft((p) => ({ ...p, mode: "sequential" }))}
                      className={cn(
                        "flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all cursor-pointer",
                        draft.mode === "sequential"
                          ? "border-[#0B1457] bg-slate-50/80 text-slate-900 ring-1 ring-[#0B1457]/20 shadow-2xs"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                      )}
                    >
                      <div
                        className={cn(
                          "p-1.5 rounded-lg shrink-0",
                          draft.mode === "sequential"
                            ? "bg-[#0B1457] text-white"
                            : "bg-slate-100 text-slate-500",
                        )}
                      >
                        <GitCommitHorizontal className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-900">
                          Sequential Flow (Recommended)
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                          Requisitions advance step-by-step in order. Each stage role must sign off
                          before the subsequent stage is triggered.
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDraft((p) => ({ ...p, mode: "parallel" }))}
                      className={cn(
                        "flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all cursor-pointer",
                        draft.mode === "parallel"
                          ? "border-[#0B1457] bg-slate-50/80 text-slate-900 ring-1 ring-[#0B1457]/20 shadow-2xs"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                      )}
                    >
                      <div
                        className={cn(
                          "p-1.5 rounded-lg shrink-0",
                          draft.mode === "parallel"
                            ? "bg-[#0B1457] text-white"
                            : "bg-slate-100 text-slate-500",
                        )}
                      >
                        <GitFork className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-900">Parallel Sign-off</p>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                          Broadcasts clearance notifications simultaneously to all configured roles.
                          Requisition clears when all have approved.
                        </p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* 3. Stage-by-Stage Sequence Builder */}
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <Label className="text-xs font-semibold text-slate-900">
                        Required Clearance Sequence ({draft.stages.length} Stages)
                      </Label>
                      <p className="text-[11px] text-slate-500">
                        Order matters for sequential flow. Use directional arrows to reorder
                        clearance sequence.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Select onValueChange={(val) => addStage(val as AppRole)}>
                        <SelectTrigger className="h-8 rounded-lg border-slate-200 text-xs font-medium text-slate-800 bg-white w-40 cursor-pointer">
                          <Plus className="h-3.5 w-3.5 mr-1 text-slate-500" />
                          <span>Add Stage Role</span>
                        </SelectTrigger>
                        <SelectContent>
                          {ALL_ROLES.filter((r) => r !== "requester").map((role) => (
                            <SelectItem key={role} value={role} className="text-xs font-medium">
                              {ROLE_CONFIG[role].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Stage Order List */}
                  <div className="space-y-2 pt-1">
                    {draft.stages.map((stageRole, idx) => {
                      const meta = ROLE_CONFIG[stageRole];
                      const Icon = meta.icon;

                      return (
                        <div
                          key={`${stageRole}-${idx}`}
                          className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-white border border-slate-200 shadow-2xs"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0B1457] text-white text-[10px] font-bold">
                              {idx + 1}
                            </span>
                            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-700">
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-slate-900">{meta.label}</p>
                              <p className="text-[10px] text-slate-500">{meta.roleDescription}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => moveStage(idx, idx - 1)}
                              disabled={idx === 0}
                              aria-label="Move stage up"
                              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveStage(idx, idx + 1)}
                              disabled={idx === draft.stages.length - 1}
                              aria-label="Move stage down"
                              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                            {draft.stages.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeStage(idx)}
                                aria-label="Remove stage"
                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 4. Unbudgeted Clause Selector */}
                <div className="space-y-1.5 max-w-md">
                  <Label className="text-xs font-medium text-slate-700">
                    Unbudgeted Spending Escalation Rule
                  </Label>
                  <Select
                    value={draft.extra}
                    onValueChange={(v) => setDraft((p) => ({ ...p, extra: v as AppRole | "none" }))}
                  >
                    <SelectTrigger className="h-10 rounded-lg border-slate-200 bg-white text-xs font-medium text-slate-800 shadow-2xs cursor-pointer">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No extra escalation step</SelectItem>
                      {ALL_ROLES.filter((r) => r !== "requester").map((role) => (
                        <SelectItem key={role} value={role}>
                          Append mandatory sign-off from: {ROLE_CONFIG[role].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-slate-400">
                    If a requisition is flagged as unbudgeted, it automatically appends this role to
                    the chain.
                  </p>
                </div>

                {/* 5. Live Simulation Preview */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3.5 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
                    <span>Live Policy Preview</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    A requisition between{" "}
                    <strong className="text-slate-900 tabular-nums font-semibold">
                      {draft.min_amount ? money(Number(draft.min_amount)) : "₦0.00"}
                    </strong>{" "}
                    and{" "}
                    <strong className="text-slate-900 tabular-nums font-semibold">
                      {draft.max_amount ? money(Number(draft.max_amount)) : "Uncapped"}
                    </strong>{" "}
                    will route in{" "}
                    <strong className="text-slate-900 font-semibold">{draft.mode} mode</strong> via:{" "}
                    {draft.stages.map((st, i) => (
                      <span key={i} className="font-semibold text-[#0B1457]">
                        {ROLE_CONFIG[st]?.shortLabel || st}
                        {i < draft.stages.length - 1 ? " → " : ""}
                      </span>
                    ))}
                    {draft.extra !== "none" && (
                      <span className="text-amber-800 font-semibold">
                        {" "}
                        (+ {ROLE_CONFIG[draft.extra]?.shortLabel} if unbudgeted)
                      </span>
                    )}
                    .
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2.5 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowBuilder(false)}
                    className="h-9 px-4 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={create.isPending || !draft.label.trim() || !draft.stages.length}
                    className="h-9 px-5 rounded-lg bg-[#0B1457] hover:bg-[#0001FF] text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {create.isPending ? "Deploying Policy…" : "Deploy Threshold Policy"}
                  </Button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spend Approval Tiers List */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/80">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base sm:text-lg font-semibold tracking-tight text-slate-900">
                Spend Approval Tiers
              </h2>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 border border-slate-200/80">
                {uniqueRules.length} {uniqueRules.length === 1 ? "Active Tier" : "Active Tiers"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 font-normal">
              Requisitions automatically route through sequential clearance stages based on
              committed purchase order thresholds.
            </p>
          </div>

          {!showBuilder && isAdmin ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={deployStandardTiers.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      "Deploy standard Nigerian Enterprise approval tiers?\n\n• Below ₦500k: Department Head\n• ₦500k–₦5m: Department Head and Finance\n• Above ₦5m: Finance and CEO\n• Unbudgeted: Executive Management sign-off\n\nThis will configure all 3 tiers sequentially.",
                    )
                  ) {
                    deployStandardTiers.mutate();
                  }
                }}
                className="rounded-lg border-emerald-300 bg-emerald-50/60 hover:bg-emerald-100 text-xs font-semibold text-emerald-900 gap-1.5 h-9 cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                <span>Apply Nigerian Enterprise Standards</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBuilder(true)}
                className="rounded-lg border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 gap-1.5 h-9 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Tier</span>
              </Button>
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-xs text-slate-400 animate-pulse">
            Loading spend governance policies…
          </div>
        ) : !uniqueRules.length ? (
          <div className="py-16 text-center space-y-3">
            <p className="text-xs text-slate-500">
              No spend thresholds configured yet. Create a policy above to set up automated routing.
            </p>
            {isAdmin && (
              <Button
                onClick={() => setShowBuilder(true)}
                className="h-9 px-4 rounded-lg bg-[#0B1457] hover:bg-[#0001FF] text-xs font-semibold text-white cursor-pointer"
              >
                Configure First Tier
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {uniqueRules.map((rule, idx) => {
              const rolesList = rule.required_roles as AppRole[];
              const cleanTitle = sanitizePolicyLabel(rule.label);

              return (
                <div
                  key={rule.id}
                  className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 transition-all hover:border-slate-300 hover:shadow-2xs space-y-4"
                >
                  {/* Top Bar: Tier Index, Policy Title, Amount Band, Mode, Actions */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div className="flex flex-wrap items-baseline gap-2.5">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Tier {idx + 1}
                      </span>
                      <span className="text-slate-300">·</span>
                      <h3 className="text-sm font-semibold text-slate-900">{cleanTitle}</h3>
                      <span className="text-slate-300 hidden sm:inline">·</span>
                      <span className="text-xs font-semibold tabular-nums text-slate-700 font-sans">
                        {money(rule.min_amount)}
                        {" → "}
                        {rule.max_amount === null
                          ? "No Upper Limit (Uncapped)"
                          : money(rule.max_amount)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-[11px] font-medium border border-slate-200 bg-slate-50 text-slate-700">
                        {rule.approval_mode === "parallel" ? (
                          <>
                            <GitFork className="h-3 w-3 text-slate-500" />
                            <span>Parallel Review</span>
                          </>
                        ) : (
                          <>
                            <GitCommitHorizontal className="h-3 w-3 text-slate-500" />
                            <span>Sequential Flow ({rolesList.length} Stages)</span>
                          </>
                        )}
                      </span>

                      {isAdmin && (
                        <button
                          aria-label="Delete rule"
                          title="Delete policy tier"
                          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
                          onClick={() => remove.mutate(rule)}
                          disabled={remove.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Visual Clearance Pipeline Stepper */}
                  <div className="pt-1">
                    <div className="flex items-center justify-between text-[11px] font-medium text-slate-400 mb-2.5">
                      <span>Required Clearance Pipeline</span>
                      <span>{rolesList.length} Sign-off Steps</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {rolesList.map((role, rIdx) => {
                        const config = ROLE_CONFIG[role] ?? {
                          label: role,
                          shortLabel: role,
                          roleDescription: "Sign-off authority",
                          icon: UserCheck,
                        };
                        const Icon = config.icon;

                        return (
                          <div key={rIdx} className="flex items-center gap-2">
                            <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-800 shadow-2xs">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0B1457] text-white text-[10px] font-bold">
                                {rIdx + 1}
                              </span>
                              <Icon className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                              <span className="font-medium text-slate-900">{config.label}</span>
                            </div>

                            {rIdx < rolesList.length - 1 && (
                              <ArrowRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                            )}
                          </div>
                        );
                      })}

                      {/* Unbudgeted Escalation Clause Badge */}
                      {rule.extra_role_if_unbudgeted && (
                        <div className="inline-flex items-center gap-1.5 ml-1 text-xs text-amber-900 bg-amber-50/90 border border-amber-200/80 rounded-lg px-2.5 py-1.5">
                          <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                          <span className="font-medium">
                            Unbudgeted clause: +
                            {ROLE_CONFIG[rule.extra_role_if_unbudgeted]?.label ||
                              ROLE_LABELS[rule.extra_role_if_unbudgeted]}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
