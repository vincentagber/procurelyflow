import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
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
import { PageHeader, EmptyState } from "@/components/procurely/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
      { title: "Settings — Procurely Flow" },
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

const ROLE_COLOR_MAP: Record<AppRole, { bg: string; text: string; border: string; activeBg: string }> = {
  admin: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", activeBg: "bg-[#0B1457] text-white" },
  approver: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", activeBg: "bg-emerald-700 text-white" },
  procurement_officer: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", activeBg: "bg-[#0001FF] text-white" },
  finance: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", activeBg: "bg-amber-600 text-white" },
  executive: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200", activeBg: "bg-indigo-700 text-white" },
  requester: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200", activeBg: "bg-slate-800 text-white" },
};

function Settings() {
  const me = useMe();
  const isAdmin = can(me.data?.roles, ["admin"]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0B1457] tracking-tight">Organization Settings</h1>
          <p className="mt-1 text-xs text-[#4B556D]">
            Approval routing is dynamic data — edit financial thresholds, manage teammate role permissions, and view cryptographically sealed audit ledgers.
          </p>
        </div>
      </div>

      <Tabs defaultValue="rules" className="space-y-6">
        <TabsList className="h-11 bg-[#E2E8F0]/70 p-1 rounded-xl gap-1 border border-[#CBD5E1]/50">
          <TabsTrigger
            value="rules"
            className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold text-[#4B556D] data-[state=active]:bg-[#0001FF] data-[state=active]:text-white transition-all shadow-none data-[state=active]:shadow-sm"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Approval Rules</span>
          </TabsTrigger>
          <TabsTrigger
            value="team"
            className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold text-[#4B556D] data-[state=active]:bg-[#0001FF] data-[state=active]:text-white transition-all shadow-none data-[state=active]:shadow-sm"
          >
            <Users className="h-3.5 w-3.5" />
            <span>Team & Permissions</span>
          </TabsTrigger>
          <TabsTrigger
            value="audit"
            className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold text-[#4B556D] data-[state=active]:bg-[#0001FF] data-[state=active]:text-white transition-all shadow-none data-[state=active]:shadow-sm"
          >
            <History className="h-3.5 w-3.5" />
            <span>Audit Log</span>
          </TabsTrigger>
          <TabsTrigger
            value="ndpa"
            className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold text-[#4B556D] data-[state=active]:bg-[#0001FF] data-[state=active]:text-white transition-all shadow-none data-[state=active]:shadow-sm"
          >
            <BadgeCheck className="h-3.5 w-3.5" />
            <span>NDPA Compliance</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="mt-0">
          <Rules isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="team" className="mt-0">
          <Team isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="audit" className="mt-0">
          <AuditLog />
        </TabsContent>
        <TabsContent value="ndpa" className="mt-0">
          <NdpaCompliance isAdmin={isAdmin} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Rules({ isAdmin }: { isAdmin: boolean }) {
  const me = useMe();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({
    label: "",
    min_amount: "",
    max_amount: "",
    roles: ["approver"] as AppRole[],
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
      if (!draft.label.trim()) throw new Error("Enter a policy label.");
      if (!draft.roles.length) throw new Error("Pick at least one approving role.");
      const { error } = await supabase.from("approval_rules").insert({
        org_id: me.data!.profile!.org_id!,
        label: draft.label.trim(),
        min_amount: Number(draft.min_amount) || 0,
        max_amount: draft.max_amount ? Number(draft.max_amount) : null,
        required_roles: draft.roles,
        approval_mode: draft.mode,
        extra_role_if_unbudgeted: draft.extra === "none" ? null : draft.extra,
        sort_order: (data?.length ?? 0) + 1,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Threshold policy saved successfully.");
      setDraft({
        label: "",
        min_amount: "",
        max_amount: "",
        roles: ["approver"],
        extra: "none",
        mode: "sequential",
      });

      await queryClient.invalidateQueries({ queryKey: ["approval-rules"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save that rule."),
  });

  const remove = useMutation({
    mutationFn: async (rule: (typeof rulesList)[number]) => {
      // Clean up this rule and any identical duplicates
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
      toast.success("Rule removed. Requests already in flight keep their original chain.");
      await queryClient.invalidateQueries({ queryKey: ["approval-rules"] });
    },
  });

  function toggleRole(role: AppRole) {
    if (draft.roles.includes(role)) {
      setDraft((p) => ({ ...p, roles: p.roles.filter((r) => r !== role) }));
    } else {
      setDraft((p) => ({ ...p, roles: [...p.roles, role] }));
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* 1. Active Threshold Policies List */}
      <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[#0B1457]">Configured Spend Approval Tiers</h2>
              <span className="rounded-full bg-[#EFF3FF] px-2.5 py-0.5 text-[11px] font-extrabold text-[#0001FF]">
                {uniqueRules.length} Active Tiers
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[#4B556D]">
              Spend approvals are automatically triggered based on total order amount and sequential clearance rules.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-xs text-[#4B556D]">Loading approval policies…</div>
        ) : !uniqueRules.length ? (
          <div className="py-12 text-center text-xs text-[#4B556D]">
            No spend thresholds configured yet. Create a policy on the right to set up automated routing.
          </div>
        ) : (
          <div className="space-y-3 pt-1">
            {uniqueRules.map((rule, index) => {
              const rolesList = rule.required_roles as AppRole[];

              return (
                <div
                  key={rule.id}
                  className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 transition-all hover:border-[#CBD5E1] hover:shadow-xs space-y-3"
                >
                  {/* Top Bar: Band & Rule Label */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-[#0B1457] px-2.5 py-1 font-mono text-xs font-bold text-white tabular-nums shadow-2xs">
                        {money(rule.min_amount)} → {rule.max_amount === null ? "No Upper Limit" : money(rule.max_amount)}
                      </span>
                      <span className="text-xs font-bold text-[#0B1457]">{rule.label}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded-md px-2 py-0.5 text-[10px] font-bold uppercase",
                          rule.approval_mode === "parallel"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-[#EFF3FF] text-[#0001FF]",
                        )}
                      >
                        {rule.approval_mode === "parallel" ? "Parallel Mode" : "Sequential Flow"}
                      </span>
                      {isAdmin ? (
                        <button
                          aria-label="Delete rule"
                          title="Delete policy tier"
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-[#94A3B8] hover:bg-red-50 hover:text-red-600 transition-colors"
                          onClick={() => remove.mutate(rule)}
                          disabled={remove.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Step Pipeline Visualization */}
                  <div className="rounded-lg border border-[#E2E8F0] bg-white p-3 space-y-1.5">
                    <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">
                      Required Clearance Sequence
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {rolesList.map((role, rIdx) => {
                        const style = ROLE_COLOR_MAP[role] ?? {
                          bg: "bg-slate-100",
                          text: "text-slate-700",
                          border: "border-slate-200",
                        };

                        return (
                          <div key={rIdx} className="flex items-center gap-1.5">
                            <span
                              className={cn(
                                "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold border",
                                style.bg,
                                style.text,
                                style.border,
                              )}
                            >
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white text-[9px] font-black shadow-2xs">
                                {rIdx + 1}
                              </span>
                              {ROLE_LABELS[role] ?? role}
                            </span>
                            {rIdx < rolesList.length - 1 && (
                              <ArrowRight className="h-3.5 w-3.5 text-[#94A3B8]" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Unbudgeted Clause */}
                  {rule.extra_role_if_unbudgeted && (
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 bg-amber-50/70 border border-amber-200/60 rounded-lg px-2.5 py-1">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Unbudgeted requisitions automatically append mandatory clearance from: <strong>{ROLE_LABELS[rule.extra_role_if_unbudgeted]}</strong></span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Add Threshold Rule Builder */}
      {isAdmin ? (
        <aside className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EFF3FF] text-[#0001FF]">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#0B1457]">Create Threshold Policy</h2>
              <p className="mt-0.5 text-[11px] text-[#4B556D]">
                Configure amount band triggers and required sign-off sequence.
              </p>
            </div>
          </div>

          <form
            className="space-y-4 pt-1"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="label" className="text-xs font-bold text-[#0B1457]">
                Policy Title
              </Label>
              <Input
                id="label"
                required
                className="h-10 rounded-xl border-[#E2E8F0] text-xs font-medium text-[#0B1457] focus-visible:ring-[#0001FF]"
                placeholder="e.g. Major Capex Purchases"
                value={draft.label}
                onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1.5">
                <Label htmlFor="min" className="text-xs font-bold text-[#0B1457]">
                  From (₦)
                </Label>
                <Input
                  id="min"
                  type="number"
                  placeholder="0"
                  className="h-10 rounded-xl border-[#E2E8F0] font-mono text-xs font-bold text-[#0B1457] focus-visible:ring-[#0001FF]"
                  value={draft.min_amount}
                  onChange={(e) => setDraft((p) => ({ ...p, min_amount: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="max" className="text-xs font-bold text-[#0B1457]">
                  To (₦)
                </Label>
                <Input
                  id="max"
                  type="number"
                  placeholder="Uncapped"
                  className="h-10 rounded-xl border-[#E2E8F0] font-mono text-xs font-bold text-[#0B1457] focus-visible:ring-[#0001FF]"
                  value={draft.max_amount}
                  onChange={(e) => setDraft((p) => ({ ...p, max_amount: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-[#0B1457]">Routing Mechanism</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDraft((p) => ({ ...p, mode: "sequential" }))}
                  className={cn(
                    "flex flex-col items-start rounded-xl p-2.5 text-left border transition-all",
                    draft.mode === "sequential"
                      ? "border-[#0001FF] bg-[#EFF3FF] text-[#0001FF]"
                      : "border-[#E2E8F0] bg-[#F8FAFC] text-[#4B556D] hover:border-[#CBD5E1]",
                  )}
                >
                  <span className="text-xs font-bold">Sequential</span>
                  <span className="text-[10px] opacity-75 mt-0.5">One after another</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDraft((p) => ({ ...p, mode: "parallel" }))}
                  className={cn(
                    "flex flex-col items-start rounded-xl p-2.5 text-left border transition-all",
                    draft.mode === "parallel"
                      ? "border-[#0001FF] bg-[#EFF3FF] text-[#0001FF]"
                      : "border-[#E2E8F0] bg-[#F8FAFC] text-[#4B556D] hover:border-[#CBD5E1]",
                  )}
                >
                  <span className="text-xs font-bold">Parallel</span>
                  <span className="text-[10px] opacity-75 mt-0.5">Simultaneous sign-off</span>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-[#0B1457]">
                Required Approver Roles (Click to toggle in order)
              </Label>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {ALL_ROLES.filter((r) => r !== "requester").map((role) => {
                  const isSelected = draft.roles.includes(role);
                  const orderIndex = draft.roles.indexOf(role);

                  return (
                    <button
                      type="button"
                      key={role}
                      onClick={() => toggleRole(role)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all",
                        isSelected
                          ? "bg-[#0001FF] text-white shadow-xs"
                          : "bg-[#F8FAFC] border border-[#E2E8F0] text-[#4B556D] hover:border-[#CBD5E1] hover:text-[#0B1457]",
                      )}
                    >
                      {isSelected && (
                        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white text-[#0001FF] text-[9px] font-black">
                          {orderIndex + 1}
                        </span>
                      )}
                      {ROLE_LABELS[role]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-[#0B1457]">Extra Step If Unbudgeted</Label>
              <Select
                value={draft.extra}
                onValueChange={(v) => setDraft((p) => ({ ...p, extra: v as AppRole | "none" }))}
              >
                <SelectTrigger className="h-10 rounded-xl border-[#E2E8F0] text-xs font-medium text-[#0B1457]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No extra step</SelectItem>
                  {ALL_ROLES.filter((r) => r !== "requester").map((role) => (
                    <SelectItem key={role} value={role}>
                      + {ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              type="submit"
              className="h-11 w-full rounded-xl bg-[#0001FF] text-xs font-bold text-white hover:bg-[#0B1457] transition-all shadow-xs"
              disabled={create.isPending || !draft.label.trim() || !draft.roles.length}
            >
              {create.isPending ? "Saving Policy…" : <span className="flex items-center gap-1.5"><Plus className="h-4 w-4" /> Save Threshold Policy</span>}
            </Button>
          </form>
        </aside>
      ) : null}
    </div>
  );
}

function InviteTeammate() {
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
          ? "They're already on your team — roles updated."
          : "Invitation saved. They'll join your organization the first time they sign in with that email.",
      );
      setEmail("");
      setRoles(["requester"]);
      await queryClient.invalidateQueries({ queryKey: ["invitations"] });
      await queryClient.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't send that invite."),
  });

  const cancel = useMutation({
    mutationFn: (invitationId: string) => cancelInvitationFn({ data: { invitationId } }),
    onSuccess: async () => {
      toast.success("Invitation cancelled.");
      await queryClient.invalidateQueries({ queryKey: ["invitations"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't cancel that invite."),
  });

  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-xs space-y-5">
      <div className="flex items-start gap-3.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EFF3FF] text-[#0001FF]">
          <UserPlus className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-[#0B1457]">Invite Teammate</h2>
          <p className="mt-0.5 text-xs text-[#4B556D]">
            Invite a colleague by email and assign enterprise role capabilities; they get these roles the first time they sign in.
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate();
        }}
        className="space-y-4 pt-1"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email" className="text-xs font-bold text-[#0B1457]">
              Work Email Address
            </Label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
              <Input
                id="invite-email"
                type="email"
                required
                className="h-11 rounded-xl border-[#E2E8F0] bg-white pl-10 text-xs font-medium text-[#0B1457] focus-visible:ring-[#0001FF]"
                placeholder="colleague@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-[#0B1457]">Pre-Assign Roles</Label>
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
                      "flex items-center gap-1.5 h-8 rounded-lg px-2.5 text-[11px] font-bold transition-all",
                      active
                        ? "bg-[#0001FF] text-white shadow-xs"
                        : "bg-[#F8FAFC] border border-[#E2E8F0] text-[#4B556D] hover:border-[#CBD5E1] hover:text-[#0B1457]",
                    )}
                  >
                    {active ? <Check className="h-3 w-3" /> : null}
                    {ROLE_LABELS[role]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <Button
            type="submit"
            disabled={send.isPending || !email.trim()}
            className="h-10 rounded-xl bg-[#0001FF] px-5 text-xs font-bold text-white hover:bg-[#0B1457] transition-all shadow-xs"
          >
            {send.isPending ? (
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Sending Invite…
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <UserPlus className="h-3.5 w-3.5" /> Send Invitation
              </span>
            )}
          </Button>
        </div>
      </form>

      {invites.data?.length ? (
        <div className="border-t border-[#E2E8F0] pt-4 space-y-2.5">
          <p className="text-xs font-bold text-[#0B1457]">Pending Invitations ({invites.data.length})</p>
          <div className="divide-y divide-[#F1F5F9] rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] overflow-hidden">
            {invites.data.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EFF3FF] text-[#0001FF] text-xs font-bold uppercase">
                    {invite.email.slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#0B1457]">{invite.email}</p>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {(invite.roles ?? []).map((r) => (
                        <span
                          key={r}
                          className="rounded-md bg-[#EFF3FF] px-1.5 py-0.5 text-[10px] font-bold text-[#0001FF]"
                        >
                          {ROLE_LABELS[r] ?? r}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => cancel.mutate(invite.id)}
                  disabled={cancel.isPending}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-200 bg-red-50/50 px-2.5 text-xs font-bold text-red-600 hover:bg-red-100/70 transition-colors"
                >
                  <Trash2 className="h-3 w-3" /> Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Team({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

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
      toast.success("Member roles updated successfully.");
      await queryClient.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't update those roles."),
  });

  const filteredMembers = (data?.members ?? []).filter((m) => {
    const q = search.toLowerCase();
    return (
      (m.full_name || "").toLowerCase().includes(q) ||
      (m.email || "").toLowerCase().includes(q) ||
      (m.department || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {isAdmin ? <InviteTeammate /> : null}

      {/* Team Directory Header & Search */}
      <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[#0B1457]">Team Directory & Role Assignment</h2>
              <span className="rounded-full bg-[#EFF3FF] px-2.5 py-0.5 text-[11px] font-extrabold text-[#0001FF]">
                {data?.members.length ?? 0} Members
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[#4B556D]">
              A person can hold multiple role capabilities. Click any role pill below to toggle access permissions.
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94A3B8]" />
            <Input
              type="text"
              placeholder="Search by name, email, department…"
              className="h-10 rounded-xl border-[#E2E8F0] bg-[#F8FAFC] pl-9 text-xs text-[#0B1457] focus-visible:ring-[#0001FF]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-xs text-[#4B556D]">Loading team directory…</div>
        ) : !filteredMembers.length ? (
          <div className="py-8 text-center text-xs text-[#4B556D]">No members found matching "{search}".</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 pt-1">
            {filteredMembers.map((member) => {
              const current = (data?.roles ?? [])
                .filter((r) => r.user_id === member.id)
                .map((r) => r.role as AppRole);

              return (
                <div
                  key={member.id}
                  className="flex flex-col justify-between rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 transition-all hover:border-[#CBD5E1] hover:shadow-xs space-y-3"
                >
                  {/* Member Info */}
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0B1457] text-white text-xs font-bold uppercase shadow-2xs">
                      {member.full_name?.slice(0, 2) || member.email.slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-xs font-bold text-[#0B1457]">
                          {member.full_name || member.email}
                        </p>
                        {member.department && (
                          <span className="truncate rounded-md bg-white border border-[#E2E8F0] px-1.5 py-0.5 text-[10px] font-semibold text-[#4B556D]">
                            {member.department}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-[11px] text-[#64748B] mt-0.5">{member.email}</p>
                    </div>
                  </div>

                  {/* Role Assignment Chips */}
                  <div className="border-t border-[#E2E8F0] pt-2.5">
                    <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1.5">
                      Assigned Roles
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_ROLES.map((role) => {
                        const active = current.includes(role);
                        const roleStyle = ROLE_COLOR_MAP[role];

                        return (
                          <button
                            key={role}
                            disabled={!isAdmin || save.isPending}
                            title={isAdmin ? `Toggle ${ROLE_LABELS[role]}` : undefined}
                            onClick={() =>
                              save.mutate({
                                targetUserId: member.id,
                                roles: active
                                  ? current.filter((r) => r !== role)
                                  : [...current, role],
                              })
                            }
                            className={cn(
                              "flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all",
                              active
                                ? cn(roleStyle.activeBg, "shadow-2xs")
                                : "bg-white border border-[#E2E8F0] text-[#64748B] hover:border-[#CBD5E1] hover:text-[#0B1457] disabled:opacity-50",
                            )}
                          >
                            {active ? <Check className="h-3 w-3" /> : null}
                            {ROLE_LABELS[role]}
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

function AuditLog() {
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

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading audit log…</p>;
  if (!data?.length)
    return (
      <EmptyState
        title="Nothing logged yet"
        body="Every submission, approval, rejection and purchase order lands here permanently — nobody can edit or delete an entry."
      />
    );

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[620px] text-sm">
        <thead className="bg-surface">
          <tr className="text-left">
            <th className="px-3 py-2.5 data-label">When</th>
            <th className="px-3 py-2.5 data-label">Who</th>
            <th className="px-3 py-2.5 data-label">Action</th>
            <th className="px-3 py-2.5 data-label">Detail</th>
            <th className="px-3 py-2.5 data-label">Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.map((entry) => (
            <tr key={entry.id} className="border-t border-border">
              <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                {dateTime(entry.created_at)}
              </td>
              <td className="px-3 py-3">{entry.actor_name}</td>
              <td className="px-3 py-3 font-medium">{entry.action.replace(/_/g, " ")}</td>
              <td className="px-3 py-3 text-muted-foreground">{entry.detail ?? "—"}</td>
              <td className="px-3 py-3 tabular-nums">
                {entry.amount === null ? "—" : money(entry.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NdpaCompliance({ isAdmin }: { isAdmin: boolean }) {
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
      {/* 1. Header Banner */}
      <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0B1457] text-[#0001FF] shadow-xs ring-4 ring-[#EFF3FF]">
              <BadgeCheck className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[#0B1457]">
                  NDPA 2023 Data Protection Baseline
                </h2>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active & Enforced
                </span>
              </div>
              <p className="mt-1 text-xs text-[#4B556D] leading-relaxed max-w-2xl">
                Procurely Flow enforces strict multi-tenant isolation, cryptographic audit trails, and automatic PII minimization in compliance with the Nigeria Data Protection Act (NDPA 2023).
              </p>
            </div>
          </div>
        </div>

        {/* 3 Pillars Grid */}
        <div className="mt-6 grid gap-3.5 sm:grid-cols-3">
          {/* Pillar 1 */}
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0B1457] text-white">
                <Lock className="h-4 w-4" />
              </div>
              <span className="rounded-md bg-white border border-[#E2E8F0] px-2 py-0.5 text-[10px] font-bold text-[#0B1457]">
                PostgreSQL RLS
              </span>
            </div>
            <div>
              <p className="text-xs font-bold text-[#0B1457]">Multi-Tenant Isolation</p>
              <p className="mt-1 text-[11px] text-[#4B556D] leading-relaxed">
                Every database query is enforced via Row Level Security scoped strictly to your organization ID.
              </p>
            </div>
          </div>

          {/* Pillar 2 */}
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0001FF] text-white">
                <Fingerprint className="h-4 w-4" />
              </div>
              <span className="rounded-md bg-white border border-[#E2E8F0] px-2 py-0.5 text-[10px] font-bold text-[#0001FF]">
                SHA-256 Ledger
              </span>
            </div>
            <div>
              <p className="text-xs font-bold text-[#0B1457]">Immutable Audit Trail</p>
              <p className="mt-1 text-[11px] text-[#4B556D] leading-relaxed">
                Requisitions, approvals, and payouts generate permanent chained cryptographic hashes.
              </p>
            </div>
          </div>

          {/* Pillar 3 */}
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0B1457] text-white">
                <EyeOff className="h-4 w-4" />
              </div>
              <span className="rounded-md bg-white border border-[#E2E8F0] px-2 py-0.5 text-[10px] font-bold text-[#0B1457]">
                NDPA §24
              </span>
            </div>
            <div>
              <p className="text-xs font-bold text-[#0B1457]">Sensitive Data Masking</p>
              <p className="mt-1 text-[11px] text-[#4B556D] leading-relaxed">
                Vendor bank account details and tax identification numbers are masked at rest in transaction exports.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Statutory Retention & Consent Governance Card */}
      <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-[#0B1457]">
            Data Retention & Subject Access Control
          </h3>
          <p className="mt-0.5 text-xs text-[#4B556D]">
            Manage organizational retention ceilings and log regulatory compliance consent events.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 pt-1">
          {/* Retention Input */}
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-3">
            <div className="space-y-1">
              <Label htmlFor="retention" className="text-xs font-bold text-[#0B1457]">
                Statutory Financial Audit Retention (Years)
              </Label>
              <div className="relative">
                <Input
                  id="retention"
                  type="number"
                  min={7}
                  max={20}
                  className="h-11 rounded-xl border-[#E2E8F0] bg-white font-mono text-sm font-bold text-[#0B1457] focus-visible:ring-[#0001FF]"
                  value={retentionYears}
                  onChange={(e) => setRetentionYears(e.target.value)}
                  disabled={!isAdmin}
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#4B556D]">
                  Years
                </span>
              </div>
            </div>
            <p className="text-[11px] text-[#4B556D] leading-relaxed">
              Mandatory minimum 7 years per Section 375 of the Companies and Allied Matters Act (CAMA 2020) and FIRS financial audit guidelines.
            </p>
          </div>

          {/* Consent Action */}
          <div className="flex flex-col justify-between rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-3">
            <div>
              <p className="text-xs font-bold text-[#0B1457]">Regulatory Consent Logging</p>
              <p className="mt-1 text-[11px] text-[#4B556D] leading-relaxed">
                Records timestamped compliance agreement with NDPC data processing terms for your organization.
              </p>
            </div>

            <Button
              className="h-11 w-full rounded-xl bg-[#0001FF] text-xs font-bold text-white hover:bg-[#0B1457] transition-all shadow-xs"
              onClick={() => logConsent.mutate()}
              disabled={logConsent.isPending}
            >
              {logConsent.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Logging Consent…
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" /> Log NDPA Data Consent Record
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
