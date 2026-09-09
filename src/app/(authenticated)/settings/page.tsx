"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trash2,
  ShieldCheck,
  Lock,
  Fingerprint,
  EyeOff,
  CheckCircle2,
  Check,
  BadgeCheck,
  Users,
  UserPlus,
  SlidersHorizontal,
  History,
  Search,
  Mail,
  ArrowRight,
  Plus,
  Sparkles,
  GitCommitHorizontal,
  GitFork,
  Landmark,
  Briefcase,
  UserCheck,
  Award,
  Key,
  ArrowUp,
  ArrowDown,
  X,
  AlertCircle,
} from "lucide-react";
import { logNdpaConsentFn } from "@/lib/procurement.functions";

import { supabase } from "@/integrations/supabase/client";
import { useMe, can, type AppRole } from "@/lib/useMe";
import {
  updateMemberRoles,
  inviteTeammateFn,
  cancelInvitationFn,
} from "@/lib/procurement.functions";
import { money, dateTime, ROLE_LABELS } from "@/lib/format";
import { EmptyState } from "@/components/procurely/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ALL_ROLES: AppRole[] = [
  "requester",
  "approver",
  "procurement_officer",
  "finance",
  "executive",
  "admin",
];

interface RoleMeta {
  label: string;
  shortLabel: string;
  roleDescription: string;
  icon: typeof UserCheck;
  themeColor: string;
  badgeBg: string;
  badgeText: string;
  pillBorder: string;
}

const ROLE_CONFIG: Record<AppRole, RoleMeta> = {
  approver: {
    label: "Department Approver",
    shortLabel: "Approver",
    roleDescription: "Initial departmental budget validation",
    icon: UserCheck,
    themeColor: "text-emerald-700",
    badgeBg: "bg-emerald-50 text-emerald-800 border-emerald-200/80",
    badgeText: "text-emerald-700",
    pillBorder: "border-emerald-200",
  },
  procurement_officer: {
    label: "Procurement Officer",
    shortLabel: "Procurement",
    roleDescription: "Commercial sourcing & vendor contract review",
    icon: Briefcase,
    themeColor: "text-blue-700",
    badgeBg: "bg-blue-50 text-blue-800 border-blue-200/80",
    badgeText: "text-blue-700",
    pillBorder: "border-blue-200",
  },
  finance: {
    label: "Finance Controller",
    shortLabel: "Finance",
    roleDescription: "Fiscal allocation & disbursement sign-off",
    icon: Landmark,
    themeColor: "text-amber-700",
    badgeBg: "bg-amber-50 text-amber-800 border-amber-200/80",
    badgeText: "text-amber-700",
    pillBorder: "border-amber-200",
  },
  executive: {
    label: "Executive Board",
    shortLabel: "Executive",
    roleDescription: "High-value enterprise authorization (C-Suite)",
    icon: Award,
    themeColor: "text-indigo-700",
    badgeBg: "bg-indigo-50 text-indigo-800 border-indigo-200/80",
    badgeText: "text-indigo-700",
    pillBorder: "border-indigo-200",
  },
  admin: {
    label: "System Admin",
    shortLabel: "Admin",
    roleDescription: "Organizational policy & governance override",
    icon: Key,
    themeColor: "text-purple-700",
    badgeBg: "bg-purple-50 text-purple-800 border-purple-200/80",
    badgeText: "text-purple-700",
    pillBorder: "border-purple-200",
  },
  requester: {
    label: "Requisitioner",
    shortLabel: "Requester",
    roleDescription: "Purchase order and demand initiator",
    icon: Users,
    themeColor: "text-slate-700",
    badgeBg: "bg-slate-100 text-slate-800 border-slate-200",
    badgeText: "text-slate-700",
    pillBorder: "border-slate-200",
  },
};

function sanitizePolicyLabel(label: string): string {
  const cleaned = label.replace(/\s*\([₦$><=0-9,\s\-.]+\)/gi, "").trim();
  return cleaned || label;
}

export default function SettingsPage() {
  const me = useMe();
  const isAdmin = can(me.data?.roles, ["admin"]);
  const [showBuilder, setShowBuilder] = useState(false);

  return (
    <div className="space-y-8 pb-16 max-w-7xl mx-auto">
      {/* 1. Executive Master Header */}
      <header className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
              Organization Settings
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-normal leading-normal">
              Manage financial spend approval thresholds, team member role assignments, and governance audit records.
            </p>
          </div>

          {isAdmin && (
            <div className="flex items-center gap-2.5 shrink-0">
              <Button
                onClick={() => setShowBuilder((prev) => !prev)}
                className={cn(
                  "h-9 px-4 rounded-lg text-xs font-semibold transition-all shadow-xs gap-1.5 cursor-pointer",
                  showBuilder
                    ? "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                    : "bg-[#0B1457] hover:bg-[#0001FF] text-white"
                )}
              >
                {showBuilder ? (
                  <>
                    <X className="h-3.5 w-3.5" />
                    <span>Close Designer</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    <span>Create Policy Tier</span>
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* 2. Sleek Segmented Tabs Navigation */}
      <Tabs defaultValue="rules" className="space-y-6">
        <div className="border-b border-slate-200/80 pb-1">
          <TabsList className="h-10 bg-slate-100/80 p-1 rounded-lg gap-1 border border-slate-200/60">
            <TabsTrigger
              value="rules"
              className="flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:font-semibold transition-all shadow-none data-[state=active]:shadow-2xs cursor-pointer"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
              <span>Approval Rules</span>
            </TabsTrigger>
            <TabsTrigger
              value="team"
              className="flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:font-semibold transition-all shadow-none data-[state=active]:shadow-2xs cursor-pointer"
            >
              <Users className="h-3.5 w-3.5 text-slate-500" />
              <span>Team &amp; Permissions</span>
            </TabsTrigger>
            <TabsTrigger
              value="audit"
              className="flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:font-semibold transition-all shadow-none data-[state=active]:shadow-2xs cursor-pointer"
            >
              <History className="h-3.5 w-3.5 text-slate-500" />
              <span>Audit Log</span>
            </TabsTrigger>
            <TabsTrigger
              value="ndpa"
              className="flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:font-semibold transition-all shadow-none data-[state=active]:shadow-2xs cursor-pointer"
            >
              <BadgeCheck className="h-3.5 w-3.5 text-slate-500" />
              <span>NDPA Compliance</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Approval Rules */}
        <TabsContent value="rules" className="mt-0 space-y-6">
          <RulesSection
            isAdmin={isAdmin}
            showBuilder={showBuilder}
            setShowBuilder={setShowBuilder}
          />
        </TabsContent>

        {/* Tab 2: Team & Permissions */}
        <TabsContent value="team" className="mt-0">
          <TeamSection isAdmin={isAdmin} />
        </TabsContent>

        {/* Tab 3: Cryptographic Audit Log */}
        <TabsContent value="audit" className="mt-0">
          <AuditLogSection />
        </TabsContent>

        {/* Tab 4: NDPA Compliance & Regulatory Trust */}
        <TabsContent value="ndpa" className="mt-0">
          <NdpaComplianceSection isAdmin={isAdmin} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RulesSection({
  isAdmin,
  showBuilder,
  setShowBuilder,
}: {
  isAdmin: boolean;
  showBuilder: boolean;
  setShowBuilder: (val: boolean) => void;
}) {
  const me = useMe();
  const queryClient = useQueryClient();

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
                      Define the spend band parameters, routing architecture, and sequential clearance stages.
                    </p>
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-[11px] font-medium text-slate-400 mr-1">Presets:</span>
                  <button
                    type="button"
                    onClick={() => applyTemplate("direct2")}
                    className="rounded-md bg-slate-100 hover:bg-slate-200/80 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition-colors cursor-pointer"
                  >
                    2-Stage (Direct)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTemplate("standard3")}
                    className="rounded-md bg-slate-100 hover:bg-slate-200/80 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition-colors cursor-pointer"
                  >
                    3-Stage (Standard)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTemplate("executive4")}
                    className="rounded-md bg-slate-100 hover:bg-slate-200/80 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition-colors cursor-pointer"
                  >
                    4-Stage (Executive)
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
                    <Label htmlFor="policy-title-page" className="text-xs font-medium text-slate-700">
                      Policy Title
                    </Label>
                    <Input
                      id="policy-title-page"
                      required
                      placeholder="e.g. Major Capex Purchases"
                      value={draft.label}
                      onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))}
                      className="h-10 rounded-lg border-slate-200 bg-white text-xs font-medium text-slate-900 shadow-2xs focus-visible:border-[#0B1457] focus-visible:ring-1 focus-visible:ring-[#0B1457]/20"
                    />
                    <p className="text-[11px] text-slate-400">Descriptive name for internal governance audit.</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="policy-min-page" className="text-xs font-medium text-slate-700">
                      From Band (₦)
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 select-none">
                        ₦
                      </span>
                      <Input
                        id="policy-min-page"
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
                    <Label htmlFor="policy-max-page" className="text-xs font-medium text-slate-700">
                      To Band (₦)
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 select-none">
                        ₦
                      </span>
                      <Input
                        id="policy-max-page"
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
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      )}
                    >
                      <div className={cn("p-1.5 rounded-lg shrink-0", draft.mode === "sequential" ? "bg-[#0B1457] text-white" : "bg-slate-100 text-slate-500")}>
                        <GitCommitHorizontal className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-900">Sequential Flow (Recommended)</p>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                          Requisitions advance step-by-step in order. Each stage role must sign off before the subsequent stage is triggered.
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
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      )}
                    >
                      <div className={cn("p-1.5 rounded-lg shrink-0", draft.mode === "parallel" ? "bg-[#0B1457] text-white" : "bg-slate-100 text-slate-500")}>
                        <GitFork className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-900">Parallel Sign-off</p>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                          Broadcasts clearance notifications simultaneously to all configured roles. Requisition clears when all have approved.
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
                        Order matters for sequential flow. Use directional arrows to reorder clearance sequence.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Select
                        onValueChange={(val) => addStage(val as AppRole)}
                      >
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
                    If a requisition is flagged as unbudgeted, it automatically appends this role to the chain.
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
                    will route in <strong className="text-slate-900 font-semibold">{draft.mode} mode</strong> via:{" "}
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
              Requisitions automatically route through sequential clearance stages based on committed purchase order thresholds.
            </p>
          </div>

          {!showBuilder && isAdmin ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBuilder(true)}
              className="rounded-lg border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 gap-1.5 h-9 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Tier</span>
            </Button>
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
                        {rule.max_amount === null ? "No Upper Limit (Uncapped)" : money(rule.max_amount)}
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
                            Unbudgeted clause: +{ROLE_CONFIG[rule.extra_role_if_unbudgeted]?.label || ROLE_LABELS[rule.extra_role_if_unbudgeted]}
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

function TeamSection({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["team"],
    queryFn: async () => {
      const [profiles, roles] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, department").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      return {
        members: profiles.data ?? [],
        roles: roles.data ?? [],
      };
    },
  });

  const save = useMutation({
    mutationFn: (input: { targetUserId: string; roles: AppRole[] }) =>
      updateMemberRoles({ data: input }),
    onSuccess: async () => {
      toast.success("Member role authorizations updated.");
      await queryClient.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't update roles."),
  });

  const filteredMembers = (data?.members ?? []).filter((m) => {
    const q = search.toLowerCase();
    const matchesSearch =
      (m.full_name || "").toLowerCase().includes(q) ||
      (m.email || "").toLowerCase().includes(q) ||
      (m.department || "").toLowerCase().includes(q);

    if (!matchesSearch) return false;
    if (roleFilter === "all") return true;

    const userRoles = (data?.roles ?? [])
      .filter((r) => r.user_id === m.id)
      .map((r) => r.role as string);
    return userRoles.includes(roleFilter);
  });

  return (
    <div className="space-y-6">
      {isAdmin && <InviteTeammateCard />}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base sm:text-lg font-semibold tracking-tight text-slate-900">
                Team Directory &amp; Role Permissions
              </h2>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 border border-slate-200/80">
                {data?.members.length ?? 0} Teammates
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 font-normal">
              Manage teammate role capabilities. Click any role badge to grant or revoke authorization.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative w-full sm:w-60">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                type="text"
                placeholder="Search teammates…"
                className="h-9 rounded-lg border-slate-200 bg-white pl-8 text-xs font-medium text-slate-900 shadow-2xs focus-visible:border-[#0B1457] focus-visible:ring-1 focus-visible:ring-[#0B1457]/20"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-9 rounded-lg border-slate-200 bg-white text-xs font-medium text-slate-800 shadow-2xs w-36 cursor-pointer">
                <SelectValue placeholder="All Roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs font-medium">All Roles</SelectItem>
                {ALL_ROLES.map((r) => (
                  <SelectItem key={r} value={r} className="text-xs font-medium">
                    {ROLE_CONFIG[r].shortLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-xs text-slate-400 animate-pulse">Loading directory…</div>
        ) : !filteredMembers.length ? (
          <div className="py-16 text-center text-xs text-slate-500">
            No teammates found matching your search.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filteredMembers.map((member) => {
              const currentRoles = (data?.roles ?? [])
                .filter((r) => r.user_id === member.id)
                .map((r) => r.role as AppRole);

              return (
                <div
                  key={member.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 sm:p-4.5 space-y-3.5 hover:border-slate-300 hover:shadow-2xs transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold uppercase border border-slate-200/60">
                      {member.full_name?.slice(0, 2) || member.email.slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-xs font-semibold text-slate-900">
                          {member.full_name || member.email}
                        </p>
                        {member.department && (
                          <span className="truncate rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200/60">
                            {member.department}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-[11px] text-slate-500 mt-0.5">{member.email}</p>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-3">
                    <div className="flex items-center justify-between text-[11px] font-medium text-slate-400 mb-2">
                      <span>Assigned Capabilities</span>
                      <span>{currentRoles.length} Active</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_ROLES.map((role) => {
                        const active = currentRoles.includes(role);
                        const meta = ROLE_CONFIG[role];

                        return (
                          <button
                            key={role}
                            type="button"
                            disabled={!isAdmin || save.isPending}
                            title={isAdmin ? `Toggle ${meta.label}` : undefined}
                            onClick={() =>
                              save.mutate({
                                targetUserId: member.id,
                                roles: active
                                  ? currentRoles.filter((r) => r !== role)
                                  : [...currentRoles, role],
                              })
                            }
                            className={cn(
                              "flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-all border cursor-pointer",
                              active
                                ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                                : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900 disabled:opacity-40"
                            )}
                          >
                            {active ? <Check className="h-3 w-3 text-slate-300" /> : null}
                            <span>{meta.shortLabel}</span>
                          </button>
                        );
                      })}
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

function InviteTeammateCard() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<AppRole[]>(["requester"]);

  const invites = useQuery({
    queryKey: ["invitations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_invitations")
        .select("id, email, roles, status, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const send = useMutation({
    mutationFn: () => inviteTeammateFn({ data: { email: email.trim(), roles } }),
    onSuccess: async (result) => {
      toast.success(
        result.mode === "roles_updated"
          ? "Teammate already in organization — roles updated."
          : "Invitation dispatched successfully."
      );
      setEmail("");
      setRoles(["requester"]);
      await queryClient.invalidateQueries({ queryKey: ["invitations"] });
      await queryClient.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed sending invite."),
  });

  const cancel = useMutation({
    mutationFn: (invitationId: string) => cancelInvitationFn({ data: { invitationId } }),
    onSuccess: async () => {
      toast.success("Invitation revoked.");
      await queryClient.invalidateQueries({ queryKey: ["invitations"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed revoking invite."),
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-xs space-y-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
          <UserPlus className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900 tracking-tight">Invite Teammate &amp; Assign Roles</h2>
          <p className="mt-0.5 text-xs text-slate-500 font-normal">
            Enter an organizational work email. Assigned capabilities take effect the first time they sign in.
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate();
        }}
        className="space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email" className="text-xs font-medium text-slate-700">
              Work Email Address
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                id="invite-email"
                type="email"
                required
                className="h-10 rounded-lg border-slate-200 bg-white pl-9 text-xs font-medium text-slate-900 shadow-2xs focus-visible:border-[#0B1457] focus-visible:ring-1 focus-visible:ring-[#0B1457]/20"
                placeholder="colleague@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <p className="text-[11px] text-slate-400">Teammate will receive an organizational invitation.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700">Pre-assigned Roles</Label>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {ALL_ROLES.map((role) => {
                const active = roles.includes(role);
                return (
                  <button
                    type="button"
                    key={role}
                    onClick={() =>
                      setRoles(active ? roles.filter((r) => r !== role) : [...roles, role])
                    }
                    className={cn(
                      "flex items-center gap-1.5 h-8 rounded-lg px-2.5 text-xs font-medium transition-all border cursor-pointer",
                      active
                        ? "bg-[#0B1457] text-white border-[#0B1457] shadow-2xs"
                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900"
                    )}
                  >
                    {active && <Check className="h-3 w-3" />}
                    <span>{ROLE_CONFIG[role].shortLabel}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400">Multiple roles can be granted simultaneously.</p>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <Button
            type="submit"
            disabled={send.isPending || !email.trim()}
            className="h-9 px-5 rounded-lg bg-[#0B1457] hover:bg-[#0001FF] text-xs font-semibold text-white transition-colors shadow-xs cursor-pointer disabled:opacity-50"
          >
            {send.isPending ? "Sending…" : "Dispatch Invitation"}
          </Button>
        </div>
      </form>

      {/* Pending Invites List */}
      {invites.data?.length ? (
        <div className="border-t border-slate-100 pt-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600">
            <span>Pending Invitations ({invites.data.length})</span>
          </div>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden bg-white">
            {invites.data.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold uppercase border border-slate-200/60">
                    {invite.email.slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900">{invite.email}</p>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {(invite.roles ?? []).map((r: AppRole) => (
                        <span
                          key={r}
                          className="rounded-md bg-slate-100 border border-slate-200/60 px-1.5 py-0.5 text-[10px] font-medium text-slate-700"
                        >
                          {ROLE_CONFIG[r]?.shortLabel ?? r}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => cancel.mutate(invite.id)}
                  disabled={cancel.isPending}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" /> Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* =========================================================================
   3. CRYPTOGRAPHIC AUDIT LOG
   ========================================================================= */

function AuditLogSection() {
  const { data, isLoading } = useQuery({
    queryKey: ["audit-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("approval_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-base sm:text-lg font-semibold tracking-tight text-slate-900">
              Audit Ledger
            </h2>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 border border-slate-200/80">
              {data?.length ?? 0} Records
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 font-normal">
            Cryptographic ledger tracking requisition movements, approval clearances, and policy updates.
          </p>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
          <Lock className="h-3.5 w-3.5 text-slate-500" />
          <span>SHA-256 Chained</span>
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-xs text-slate-400 animate-pulse">Loading audit ledger…</div>
      ) : !data?.length ? (
        <EmptyState
          title="Audit Ledger Initialized"
          body="All future requisition movements and approval routing events will appear here in high-precision audit format."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-medium text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Timestamp</th>
                <th className="px-4 py-2.5">Actor</th>
                <th className="px-4 py-2.5">Event Action</th>
                <th className="px-4 py-2.5">Audit Details</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-500 font-sans tabular-nums text-xs">
                    {dateTime(entry.created_at)}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{entry.actor_name}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-md bg-slate-100 border border-slate-200/60 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                      {entry.action.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                    {entry.detail ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-sans font-semibold text-slate-900 tabular-nums">
                    {entry.amount === null ? "—" : money(entry.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   4. NDPA 2023 COMPLIANCE & SECURITY CENTER
   ========================================================================= */

function NdpaComplianceSection({ isAdmin }: { isAdmin: boolean }) {
  const [retentionYears, setRetentionYears] = useState("7");
  const logConsent = useMutation({
    mutationFn: () =>
      logNdpaConsentFn({
        data: {
          consentType: "NDPA 2023 Employee & Vendor Data Processing",
          granted: true,
          details:
            "Consented to multi-tenant data isolation and audit logging per NDPC regulatory standards.",
        },
      }),
    onSuccess: () => toast.success("NDPA consent record logged successfully."),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed logging consent."),
  });

  return (
    <div className="space-y-6">
      {/* 1. Header & Architecture Overview */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h2 className="text-base sm:text-lg font-semibold tracking-tight text-slate-900">
                Data Protection &amp; Statutory Compliance
              </h2>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Active NDPA 2023
              </span>
            </div>
            <p className="text-xs text-slate-500 font-normal leading-relaxed">
              Procurely Flow enforces strict multi-tenant isolation, cryptographic audit trails, and automatic PII minimization under Nigeria Data Protection Commission (NDPC) regulations.
            </p>
          </div>
        </div>

        {/* 3 Pillars Grid */}
        <div className="grid gap-3.5 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-700 shadow-2xs">
                <Lock className="h-4 w-4" />
              </div>
              <span className="rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                PostgreSQL RLS
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-900">Row-Level Security</p>
            <p className="text-[11px] text-slate-500 leading-relaxed font-normal">
              Database queries are enforced via PostgreSQL RLS policies strictly scoped to your tenant organization ID.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-700 shadow-2xs">
                <Fingerprint className="h-4 w-4" />
              </div>
              <span className="rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                SHA-256 Ledger
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-900">Immutable Audit Chain</p>
            <p className="text-[11px] text-slate-500 leading-relaxed font-normal">
              Requisitions, clearances, and payout actions generate sequentially chained cryptographic hash records.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-700 shadow-2xs">
                <EyeOff className="h-4 w-4" />
              </div>
              <span className="rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                NDPA §24
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-900">PII &amp; Banking Masking</p>
            <p className="text-[11px] text-slate-500 leading-relaxed font-normal">
              Vendor bank accounts and tax IDs are masked at rest in public views and outbound transaction exports.
            </p>
          </div>
        </div>
      </div>

      {/* 2. Statutory Retention & Consent Governance */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-xs space-y-5">
        <div>
          <h3 className="text-base font-semibold text-slate-900 tracking-tight">
            Data Retention &amp; Regulatory Consent
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 font-normal">
            Configure financial record retention horizons and log formal organizational consent under NDPC regulations.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Retention Input */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="retention" className="text-xs font-medium text-slate-700">
                Statutory Financial Audit Retention (Years)
              </Label>
              <div className="relative">
                <Input
                  id="retention"
                  type="number"
                  min={7}
                  max={20}
                  className="h-10 rounded-lg border-slate-200 bg-white font-sans text-xs font-semibold tabular-nums text-slate-900 shadow-2xs pr-14 focus-visible:border-[#0B1457] focus-visible:ring-1 focus-visible:ring-[#0B1457]/20"
                  value={retentionYears}
                  onChange={(e) => setRetentionYears(e.target.value)}
                  disabled={!isAdmin}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 select-none">
                  Years
                </span>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed font-normal">
              Mandatory minimum 7 years per Section 375 of the Companies and Allied Matters Act (CAMA 2020) and FIRS financial audit guidelines.
            </p>
          </div>

          {/* Consent Action */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5 space-y-3">
            <div>
              <p className="text-xs font-semibold text-slate-900">Regulatory Consent Logging</p>
              <p className="mt-1 text-[11px] text-slate-500 leading-relaxed font-normal">
                Records timestamped compliance agreement with NDPC data processing terms for your organization.
              </p>
            </div>

            <Button
              className="h-9 w-full rounded-lg bg-[#0B1457] hover:bg-[#0001FF] text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
              onClick={() => logConsent.mutate()}
              disabled={logConsent.isPending}
            >
              {logConsent.isPending ? (
                "Logging Consent Record…"
              ) : (
                <span className="flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" /> Log NDPA Consent Record
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
