import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trash2,
  ShieldCheck,
  Lock,
  FileText,
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
  Building2,
  ArrowRight,
  Plus,
  Sparkles,
  GitCommitHorizontal,
  GitFork,
  Layers,
  Landmark,
  Briefcase,
  UserCheck,
  Award,
  Key,
  ShieldAlert,
  ArrowUp,
  ArrowDown,
  X,
  ChevronRight,
  Info,
  Clock,
  AlertCircle,
  User,
  Loader2,
  CreditCard,
  Receipt,
  Copy,
  Camera,
} from "lucide-react";
import {
  logNdpaConsentFn,
  createApprovalDelegationFn,
  getActiveDelegationsFn,
  revokeApprovalDelegationFn,
  generateSubscriptionBillFn,
  getSubscriptionStatementsFn,
} from "@/lib/procurement.functions";

import { supabase } from "@/integrations/supabase/client";
import { useMe, useUpdateProfile, can, type AppRole } from "@/lib/useMe";
import { UserAvatar } from "@/components/procurely/UserAvatar";
import {
  updateMemberRoles,
  inviteTeammateFn,
  cancelInvitationFn,
} from "@/lib/procurement.functions";
import { money, dateTime, shortDate, ROLE_LABELS } from "@/lib/format";
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

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Organization Settings — Procurely Flow" },
      {
        name: "description",
        content:
          "Edit approval thresholds, manage teammate roles and read the permanent approval audit log.",
      },
      { property: "og:title", content: "Settings — Procurely Flow" },
      { property: "og:description", content: "Configure approval routing for your organization." },
    ],
  }),
  component: Settings,
});

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
  // Strip out duplicate parenthetical amount text like "(₦1,000,000 - ₦10,000,000)" or "(> ₦10,000,000)"
  const cleaned = label.replace(/\s*\([₦$><=0-9,\s\-.]+\)/gi, "").trim();
  return cleaned || label;
}

function Settings() {
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
              value="delegations"
              className="flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:font-semibold transition-all shadow-none data-[state=active]:shadow-2xs cursor-pointer"
            >
              <UserCheck className="h-3.5 w-3.5 text-slate-500" />
              <span>Delegations (FR-2.6)</span>
            </TabsTrigger>
            <TabsTrigger
              value="billing"
              className="flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:font-semibold transition-all shadow-none data-[state=active]:shadow-2xs cursor-pointer"
            >
              <CreditCard className="h-3.5 w-3.5 text-slate-500" />
              <span>Subscription &amp; Billing</span>
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
            <TabsTrigger
              value="profile"
              className="flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:font-semibold transition-all shadow-none data-[state=active]:shadow-2xs cursor-pointer"
            >
              <User className="h-3.5 w-3.5 text-slate-500" />
              <span>My Profile</span>
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

        {/* Tab 3: Approval Authority Delegation (FR-2.6) */}
        <TabsContent value="delegations" className="mt-0">
          <DelegationsSection isAdmin={isAdmin} />
        </TabsContent>

        {/* Tab 4: Subscription & Virtual Account Billing (NFR-LOC.2) */}
        <TabsContent value="billing" className="mt-0">
          <BillingSection isAdmin={isAdmin} />
        </TabsContent>

        {/* Tab 5: Cryptographic Audit Log */}
        <TabsContent value="audit" className="mt-0">
          <AuditLogSection />
        </TabsContent>

        {/* Tab 6: NDPA Compliance & Regulatory Trust */}
        <TabsContent value="ndpa" className="mt-0">
          <NdpaComplianceSection isAdmin={isAdmin} />
        </TabsContent>

        {/* Tab 7: My Profile & Avatar */}
        <TabsContent value="profile" className="mt-0">
          <ProfileSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* =========================================================================
   1. APPROVAL RULES & THRESHOLD TIERS (The Hero Section)
   ========================================================================= */

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
                    <p className="text-[11px] text-slate-400">Descriptive name for internal governance audit.</p>
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

/* =========================================================================
   2. TEAM DIRECTORY & PERMISSIONS
   ========================================================================= */

function TeamSection({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["team"],
    queryFn: async () => {
      const [profiles, roles] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, department, avatar_url").order("full_name"),
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
                    <UserAvatar
                      name={member.full_name}
                      email={member.email}
                      avatarUrl={member.avatar_url}
                      size="md"
                      className="h-9 w-9 rounded-lg"
                    />
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

/* =========================================================================
   4b. APPROVAL DELEGATIONS SECTION (FR-2.6)
   ========================================================================= */

function DelegationsSection({ isAdmin }: { isAdmin: boolean }) {
  const me = useMe();
  const queryClient = useQueryClient();

  const [substituteId, setSubstituteId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const { data: teamMembers } = useQuery({
    queryKey: ["team-members-delegation"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, department")
        .order("full_name");
      return (data ?? []).filter((p) => p.id !== me.data?.userId);
    },
  });

  const { data: delegations, isLoading } = useQuery({
    queryKey: ["approval-delegations"],
    queryFn: () => getActiveDelegationsFn(),
  });

  const createDelegationMutation = useMutation({
    mutationFn: async () => {
      if (!substituteId) throw new Error("Select a substitute approver.");
      if (!startDate || !endDate) throw new Error("Select start and end dates.");
      if (startDate > endDate) throw new Error("Start date cannot be after end date.");

      return createApprovalDelegationFn({
        data: {
          substituteId,
          startDate,
          endDate,
          reason: reason.trim() || undefined,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Approval authority delegation successfully activated.");
      setSubstituteId("");
      setStartDate("");
      setEndDate("");
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["approval-delegations"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed creating delegation."),
  });

  const revokeDelegationMutation = useMutation({
    mutationFn: async (delegationId: string) => {
      return revokeApprovalDelegationFn({ data: { delegationId } });
    },
    onSuccess: async () => {
      toast.success("Delegation revoked.");
      await queryClient.invalidateQueries({ queryKey: ["approval-delegations"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed revoking delegation."),
  });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-xs space-y-6">
        <div>
          <h2 className="text-base font-semibold text-slate-900 tracking-tight">
            Approval Authority Delegation (FR-2.6)
          </h2>
          <p className="mt-1 text-xs text-slate-500 leading-relaxed font-normal">
            Temporarily delegate your financial signing authority to a named colleague while away on annual leave, site inspection, or travel. The substitute can approve on your behalf, and all actions are cryptographically tagged in the SHA-256 audit ledger.
          </p>
        </div>

        {/* Create Delegation Form */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Set Up New Delegation
          </h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label className="text-xs font-medium text-slate-700">Substitute Approver</Label>
              <Select value={substituteId} onValueChange={setSubstituteId}>
                <SelectTrigger className="h-10 rounded-lg border-slate-200 bg-white text-xs shadow-2xs">
                  <SelectValue placeholder="Choose colleague…" />
                </SelectTrigger>
                <SelectContent>
                  {(teamMembers ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">
                      {m.full_name || m.email} {m.department ? `(${m.department})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="del-start" className="text-xs font-medium text-slate-700">
                Effective From
              </Label>
              <Input
                id="del-start"
                type="date"
                className="h-10 rounded-lg border-slate-200 bg-white text-xs shadow-2xs"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="del-end" className="text-xs font-medium text-slate-700">
                Effective Until
              </Label>
              <Input
                id="del-end"
                type="date"
                className="h-10 rounded-lg border-slate-200 bg-white text-xs shadow-2xs"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="del-reason" className="text-xs font-medium text-slate-700">
              Reason / Context (Optional)
            </Label>
            <Input
              id="del-reason"
              placeholder="e.g. Annual leave, site travel to Epe coastal highway, conference"
              className="h-10 rounded-lg border-slate-200 bg-white text-xs shadow-2xs"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="flex justify-end">
            <Button
              className="h-9 px-4 rounded-lg bg-[#0B1457] hover:bg-[#0001FF] text-white text-xs font-semibold shadow-xs cursor-pointer"
              disabled={createDelegationMutation.isPending || !substituteId || !startDate || !endDate}
              onClick={() => createDelegationMutation.mutate()}
            >
              {createDelegationMutation.isPending ? "Activating Delegation…" : "Activate Delegation Authority"}
            </Button>
          </div>
        </div>

        {/* Delegations List */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Recorded Delegations ({delegations?.length || 0})
          </h3>

          {isLoading ? (
            <p className="text-xs text-slate-400">Loading delegation records…</p>
          ) : !delegations || delegations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500">
              No active or past approval delegations recorded.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
              {delegations.map((d: any) => {
                const isDelegator = d.delegator_id === me.data?.userId;
                const isSubstitute = d.substitute_id === me.data?.userId;
                const canRevoke = (isDelegator || isAdmin) && d.status === "active";

                return (
                  <div key={d.id} className="p-4 bg-white hover:bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">
                          {d.delegator?.full_name || "Approver"} → {d.substitute?.full_name || "Substitute"}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            d.status === "active"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}
                        >
                          {d.status === "active" ? "Active" : "Revoked"}
                        </span>
                        {isSubstitute ? (
                          <span className="rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 text-[10px] font-medium">
                            Delegated to You
                          </span>
                        ) : null}
                      </div>
                      <p className="text-slate-500 text-[11px]">
                        Validity: <strong className="font-mono text-slate-700">{shortDate(d.start_date)}</strong> to{" "}
                        <strong className="font-mono text-slate-700">{shortDate(d.end_date)}</strong>
                        {d.reason ? ` · "${d.reason}"` : ""}
                      </p>
                    </div>

                    {canRevoke ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold cursor-pointer shrink-0"
                        disabled={revokeDelegationMutation.isPending}
                        onClick={() => revokeDelegationMutation.mutate(d.id)}
                      >
                        Revoke Authority
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   4c. LOCALIZED B2B SUBSCRIPTION & VIRTUAL ACCOUNTS (NFR-LOC.2)
   ========================================================================= */

function BillingSection({ isAdmin }: { isAdmin: boolean }) {
  const me = useMe();
  const queryClient = useQueryClient();
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const [selectedTier, setSelectedTier] = useState<"STARTER" | "GROWTH" | "BUSINESS" | "ENTERPRISE">("GROWTH");
  const [generatedBill, setGeneratedBill] = useState<any>(null);

  const { data: statements, isLoading } = useQuery({
    queryKey: ["tenant-subscriptions"],
    queryFn: () => getSubscriptionStatementsFn(),
  });

  const generateBillMutation = useMutation({
    mutationFn: async () => {
      return generateSubscriptionBillFn({
        data: {
          planTier: selectedTier,
          billingCycle: cycle,
          paymentMethod: "VIRTUAL_ACCOUNT",
        },
      });
    },
    onSuccess: async (bill) => {
      setGeneratedBill(bill);
      toast.success("B2B invoice & dedicated virtual account generated.");
      await queryClient.invalidateQueries({ queryKey: ["tenant-subscriptions"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed generating billing statement."),
  });

  const tiers = [
    {
      id: "STARTER" as const,
      name: "Starter",
      monthly: 75000,
      annual: 765000,
      description: "Small organisation, one branch or project site",
      features: [
        "Requisitions & Multi-item lines",
        "Threshold approval routing",
        "Digital RFQ links & quote entry",
        "Automated side-by-side comparison",
      ],
    },
    {
      id: "GROWTH" as const,
      name: "Growth",
      monthly: 200000,
      annual: 2040000,
      popular: true,
      description: "Growing enterprise with multiple approvers and active sites",
      features: [
        "Everything in Starter",
        "WhatsApp 1-click token approvals",
        "Site Delivery & Inspection capture",
        "3-Way Invoice Matching & NRS e-invoicing",
        "Offline inspection local sync queue",
      ],
    },
    {
      id: "BUSINESS" as const,
      name: "Business",
      monthly: 500000,
      annual: 5100000,
      description: "Multiple concurrent projects, entities or heavy capex",
      features: [
        "Everything in Growth",
        "PO Change Orders & baseline preservation",
        "Approval delegation & SLA escalation",
        "Executive governance anomaly suite",
        "Multi-project budget drilldown",
      ],
    },
    {
      id: "ENTERPRISE" as const,
      name: "Enterprise",
      monthly: 1200000,
      annual: 12240000,
      description: "Large organisations requiring custom integrations & dedicated SLA",
      features: [
        "Everything in Business",
        "SAP & Dynamics 365 OData connectors",
        "Custom ERP general ledger export",
        "Dedicated account manager & 99.5% SLA",
        "Statutory NDPA compliance auditing support",
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 tracking-tight">
              Subscription &amp; Nigerian B2B Invoicing (§NFR-LOC.2)
            </h2>
            <p className="mt-1 text-xs text-slate-500 font-normal">
              Predictable, transparent software subscription billing tailored for African enterprise finance teams via bank transfer and dedicated NUBAN virtual accounts.
            </p>
          </div>

          {/* Monthly vs Annual Toggle */}
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-1 text-xs font-semibold shrink-0">
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 transition-all cursor-pointer ${
                cycle === "monthly" ? "bg-[#0B1457] text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
              onClick={() => setCycle("monthly")}
            >
              Monthly Billing
            </button>
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 transition-all cursor-pointer flex items-center gap-1.5 ${
                cycle === "annual" ? "bg-[#0B1457] text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
              onClick={() => setCycle("annual")}
            >
              <span>Annual Billing</span>
              <span className="rounded bg-emerald-400/20 text-emerald-700 px-1 py-0.2 text-[9px] font-bold">
                Save 15%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Tiers Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {tiers.map((t) => {
            const isSelected = selectedTier === t.id;
            const price = cycle === "annual" ? t.annual : t.monthly;

            return (
              <div
                key={t.id}
                className={`relative flex flex-col justify-between rounded-xl border p-4 transition-all ${
                  isSelected
                    ? "border-[#0B1457] bg-slate-50/40 shadow-xs ring-1 ring-[#0B1457]"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                {t.popular ? (
                  <span className="absolute -top-2.5 right-4 rounded-full bg-[#0B1457] px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-2xs">
                    Most Popular
                  </span>
                ) : null}

                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{t.name}</h3>
                    <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">{t.description}</p>
                  </div>

                  <div>
                    <span className="text-xl font-bold font-sans text-slate-900 tabular-nums">
                      {money(price, "NGN")}
                    </span>
                    <span className="text-[11px] text-slate-500 font-normal"> / {cycle === "annual" ? "year" : "month"}</span>
                  </div>

                  <ul className="space-y-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-600">
                    {t.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-4 mt-auto">
                  <Button
                    type="button"
                    variant={isSelected ? "default" : "outline"}
                    className={`h-8 w-full rounded-lg text-xs font-semibold cursor-pointer ${
                      isSelected ? "bg-[#0B1457] hover:bg-[#0001FF] text-white" : "border-slate-200"
                    }`}
                    onClick={() => setSelectedTier(t.id)}
                  >
                    {isSelected ? "Selected Tier" : "Select Tier"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Generate Invoice Action */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
          <div>
            <p className="text-xs font-semibold text-slate-900">
              Selected: <strong className="text-[#0B1457] font-bold">{selectedTier}</strong> ({cycle === "annual" ? "Annual" : "Monthly"})
            </p>
            <p className="text-[11px] text-slate-500">
              Generates an official VAT-compliant corporate invoice with a dedicated Providus/Wema NUBAN virtual account.
            </p>
          </div>
          <Button
            type="button"
            className="h-9 px-4 rounded-lg bg-[#0B1457] hover:bg-[#0001FF] text-white text-xs font-semibold shadow-xs cursor-pointer shrink-0"
            disabled={generateBillMutation.isPending || !isAdmin}
            onClick={() => generateBillMutation.mutate()}
          >
            {generateBillMutation.isPending ? "Generating Invoice…" : "Generate Invoice & Bank Transfer Account"}
          </Button>
        </div>

        {/* Generated Bill Display Modal/Card */}
        {generatedBill ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Dedicated Virtual Account Statement Generated
              </span>
              <span className="font-mono text-xs font-bold text-slate-800">{generatedBill.invoice_reference}</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 bg-white p-4 rounded-lg border border-emerald-200 text-xs">
              <div>
                <p className="text-[10px] uppercase text-slate-400 font-semibold">Bank Name</p>
                <p className="font-bold text-slate-900 mt-0.5">{generatedBill.virtual_account_bank}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-slate-400 font-semibold">Dedicated NUBAN Account</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="font-mono font-bold text-sm text-[#0B1457]">{generatedBill.virtual_account_number}</p>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(generatedBill.virtual_account_number);
                      toast.success("Account number copied.");
                    }}
                    className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                    title="Copy Account Number"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase text-slate-400 font-semibold">Amount to Transfer</p>
                <p className="font-sans font-bold text-sm text-slate-900 mt-0.5">{money(generatedBill.amount_ngn, "NGN")}</p>
              </div>
            </div>

            <p className="text-[11px] text-emerald-800 leading-relaxed">
              Make an instant bank transfer from your corporate bank app. Automatic reconciliation clears your account within minutes of receipt.
            </p>
          </div>
        ) : null}

        {/* Statements History Table */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Billing Statements &amp; Invoices ({statements?.length || 0})
          </h3>

          {isLoading ? (
            <p className="text-xs text-slate-400">Loading invoices…</p>
          ) : !statements || statements.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500">
              No subscription invoices issued yet.
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-medium">
                  <tr>
                    <th className="px-4 py-3">Invoice Ref</th>
                    <th className="px-4 py-3">Plan Tier</th>
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Virtual Account</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {statements.map((s: any) => (
                    <tr key={s.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-mono font-bold text-[#0B1457]">{s.invoice_reference}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{s.plan_tier} ({s.billing_cycle})</td>
                      <td className="px-4 py-3 text-slate-500 text-[11px]">{shortDate(s.period_start)} – {shortDate(s.period_end)}</td>
                      <td className="px-4 py-3 font-sans font-semibold text-slate-900">{money(s.amount_ngn, "NGN")}</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-600">{s.virtual_account_bank} · {s.virtual_account_number}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          s.status === "SETTLED"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}>
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* PCI-DSS Zero Raw Card Storage Guarantee (NFR-SEC.4) */}
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-xs text-slate-600">
          <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
          <p className="text-[11px] leading-relaxed">
            <strong>PCI-DSS &amp; Local Currency Protection:</strong> Procurely Flow enforces a strict zero raw-card storage policy. All billing collections route through licensed Nigerian financial institutions (Providus, Wema, Monnify, Paystack) via dedicated virtual accounts and bank transfers to prevent auto-renew card failures and naira volatility risks.
          </p>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   5. PERSONAL PROFILE & AVATAR COMPONENT
   ========================================================================= */

function ProfileSection() {
  const me = useMe();
  const updateProfile = useUpdateProfile();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (me.data?.profile) {
      setFullName(me.data.profile.full_name || "");
      setDepartment(me.data.profile.department || "");
      setAvatarUrl(me.data.profile.avatar_url || null);
    }
  }, [me.data]);

  async function handleAvatarUpload(file: File) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Profile picture must be under 5 MB.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose a valid image file (JPG, PNG, WebP).");
      return;
    }

    setIsUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const cleanExt = ext.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      const userId = me.data?.userId || "user";
      const filePath = `${userId}/${Date.now()}_avatar.${cleanExt}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { cacheControl: "3600", upsert: true });

      if (uploadError) throw new Error(uploadError.message || "Failed to upload avatar.");

      const { data: publicUrlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(uploadData.path);

      setAvatarUrl(publicUrlData.publicUrl);
      toast.success("Profile photo uploaded. Click 'Save Profile' to apply.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload photo.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleRemoveAvatar() {
    setAvatarUrl(null);
    toast.info("Profile photo removed. Click 'Save Profile' to apply.");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error("Full name cannot be empty.");
      return;
    }

    try {
      await updateProfile.mutateAsync({
        fullName: fullName.trim(),
        department: department.trim() || null,
        avatarUrl,
      });
      toast.success("Your profile details have been saved successfully.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-xs">
        <div className="max-w-2xl space-y-1">
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 tracking-tight">
            Personal Identity &amp; Profile Details
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 font-normal leading-normal">
            Upload your professional profile photo and maintain your official name and department as displayed across approvals and requisitions.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 max-w-xl space-y-6">
          {/* Avatar card */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4.5">
            <div className="relative group shrink-0">
              <UserAvatar
                name={fullName || me.data?.profile?.full_name}
                email={me.data?.email}
                avatarUrl={avatarUrl}
                size="xl"
                className="h-20 w-20 ring-4 ring-white shadow-sm text-2xl"
              />
              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              )}
            </div>

            <div className="flex-1 text-center sm:text-left space-y-2">
              <div>
                <p className="text-xs font-semibold text-slate-900">Profile Picture</p>
                <p className="text-[11px] text-slate-500">
                  PNG, JPG, or WebP up to 5MB. Rendered in sidebar, team directories, and audit sign-offs.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 gap-1.5 rounded-lg border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs"
                >
                  <Camera className="h-3.5 w-3.5 text-[#0B1457]" />
                  <span>{avatarUrl ? "Change Photo" : "Upload Photo"}</span>
                </Button>

                {avatarUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isUploading}
                    onClick={handleRemoveAvatar}
                    className="h-8 gap-1.5 rounded-lg text-xs font-medium text-rose-600 hover:bg-rose-50 hover:text-rose-700 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Remove</span>
                  </Button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleAvatarUpload(file);
                  }}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="settings-full-name" className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-slate-400" />
                <span>Official Full Name *</span>
              </Label>
              <Input
                id="settings-full-name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Vincent Agber"
                className="h-10 text-xs rounded-lg border-slate-200 bg-white shadow-2xs focus-visible:border-[#0B1457]"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settings-department" className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-slate-400" />
                <span>Department / Unit</span>
              </Label>
              <Input
                id="settings-department"
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Project Delivery &amp; Procurement"
                className="h-10 text-xs rounded-lg border-slate-200 bg-white shadow-2xs focus-visible:border-[#0B1457]"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settings-email" className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-slate-400" />
                <span>Authentication Email Address</span>
              </Label>
              <Input
                id="settings-email"
                type="email"
                disabled
                value={me.data?.email || ""}
                className="h-10 text-xs rounded-lg border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed shadow-none"
              />
            </div>

            <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                <ShieldCheck className="h-3.5 w-3.5 text-[#0001FF]" />
                <span>Organization &amp; Clearance Level:</span>
              </div>
              <p className="text-xs font-semibold text-slate-800">
                {me.data?.orgName || "Procurely Flow Enterprise"}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-0.5">
                {me.data?.roles && me.data.roles.length > 0 ? (
                  me.data.roles.map((role) => (
                    <span
                      key={role}
                      className="inline-flex items-center rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 border border-slate-200/80 shadow-2xs"
                    >
                      {ROLE_LABELS[role] || role}
                    </span>
                  ))
                ) : (
                  <span className="text-[11px] text-slate-400">Standard Requester</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-start gap-2.5 pt-2">
            <Button
              type="submit"
              disabled={updateProfile.isPending || isUploading}
              className="h-9 px-5 text-xs font-semibold rounded-lg bg-[#0B1457] hover:bg-[#0001FF] text-white transition-all shadow-xs gap-1.5 cursor-pointer"
            >
              {updateProfile.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Saving Profile…</span>
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Save Profile</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

