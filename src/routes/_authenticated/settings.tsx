import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2, ShieldCheck, Lock, FileText } from "lucide-react";
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

function Settings() {
  const me = useMe();
  const isAdmin = can(me.data?.roles, ["admin"]);

  return (
    <div className="space-y-5 pb-10">
      <PageHeader
        title="Settings"
        subtitle="Approval routing is data, not code — edit your thresholds any time and new requests follow them immediately."
      />
      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Approval rules</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
          <TabsTrigger value="ndpa">NDPA Compliance</TabsTrigger>
        </TabsList>
        <TabsContent value="rules" className="mt-4">
          <Rules isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="team" className="mt-4">
          <Team isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <AuditLog />
        </TabsContent>
        <TabsContent value="ndpa" className="mt-4">
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
    roles: [] as AppRole[],
    extra: "none" as AppRole | "none",
    mode: "sequential" as "sequential" | "parallel",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["approval-rules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("approval_rules").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
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
      toast.success("Threshold rule saved.");
      setDraft({
        label: "",
        min_amount: "",
        max_amount: "",
        roles: [],
        extra: "none",
        mode: "sequential",
      });

      await queryClient.invalidateQueries({ queryKey: ["approval-rules"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save that rule."),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("approval_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Rule removed. Requests already in flight keep their original chain.");
      await queryClient.invalidateQueries({ queryKey: ["approval-rules"] });
    },
  });

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        {isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">Loading rules…</p>
        ) : !data?.length ? (
          <EmptyState
            title="No thresholds set"
            body="Add your first rule to tell Procurely who must approve at each spend level."
          />
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-surface">
              <tr className="text-left">
                <th className="px-3 py-2.5 data-label">Rule</th>
                <th className="px-3 py-2.5 data-label">From</th>
                <th className="px-3 py-2.5 data-label">To</th>
                <th className="px-3 py-2.5 data-label">Must approve</th>
                <th className="px-3 py-2.5 data-label">Routing</th>
                <th className="px-3 py-2.5 data-label">If unbudgeted</th>
                {isAdmin ? <th className="px-3 py-2.5" /> : null}
              </tr>
            </thead>
            <tbody>
              {data.map((rule) => (
                <tr key={rule.id} className="border-t border-border">
                  <td className="px-3 py-3 font-medium">{rule.label}</td>
                  <td className="px-3 py-3 tabular-nums">{money(rule.min_amount)}</td>
                  <td className="px-3 py-3 tabular-nums">
                    {rule.max_amount === null ? "and above" : money(rule.max_amount)}
                  </td>
                  <td className="px-3 py-3">
                    {(rule.required_roles as AppRole[])
                      .map((r) => ROLE_LABELS[r])
                      .join(rule.approval_mode === "parallel" ? " + " : " → ")}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={
                        rule.approval_mode === "parallel"
                          ? "rounded-full bg-signal/10 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-signal"
                          : "rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-primary"
                      }
                    >
                      {rule.approval_mode === "parallel" ? "Parallel" : "Sequential"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {rule.extra_role_if_unbudgeted
                      ? `+ ${ROLE_LABELS[rule.extra_role_if_unbudgeted]}`
                      : "no extra step"}
                  </td>

                  {isAdmin ? (
                    <td className="px-3 py-3">
                      <button
                        aria-label="Delete rule"
                        className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-surface"
                        onClick={() => remove.mutate(rule.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isAdmin ? (
        <aside className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-display text-xl uppercase tracking-wide">Add threshold rule</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Amounts are in your base currency. Leave the upper bound empty for "and above".
          </p>
          <form
            className="mt-3 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="label">Rule name</Label>
              <Input
                id="label"
                required
                className="h-12"
                placeholder="e.g. High value spend"
                value={draft.label}
                onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="min">From</Label>
                <Input
                  id="min"
                  inputMode="decimal"
                  className="h-12"
                  value={draft.min_amount}
                  onChange={(e) => setDraft((p) => ({ ...p, min_amount: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="max">To</Label>
                <Input
                  id="max"
                  inputMode="decimal"
                  className="h-12"
                  placeholder="no limit"
                  value={draft.max_amount}
                  onChange={(e) => setDraft((p) => ({ ...p, max_amount: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>How approvals run</Label>
              <Select
                value={draft.mode}
                onValueChange={(v) =>
                  setDraft((p) => ({ ...p, mode: v as "sequential" | "parallel" }))
                }
              >
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sequential">Sequential — one after another</SelectItem>
                  <SelectItem value="parallel">Parallel — all at once, any order</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {draft.mode === "parallel"
                  ? "Every required role is notified immediately and can decide independently."
                  : "Each approver only sees the request once the previous one has cleared it."}
              </p>
            </div>
            <div className="space-y-2">
              <Label>
                {draft.mode === "parallel"
                  ? "Roles that must approve (all of them)"
                  : "Roles that must approve (in order)"}
              </Label>
              {ALL_ROLES.map((role) => (
                <label
                  key={role}
                  className="tap-row flex items-center gap-3 rounded-md border border-border px-3"
                >
                  <Checkbox
                    checked={draft.roles.includes(role)}
                    onCheckedChange={(checked) =>
                      setDraft((p) => ({
                        ...p,
                        roles: checked ? [...p.roles, role] : p.roles.filter((r) => r !== role),
                      }))
                    }
                  />
                  <span className="text-sm">{ROLE_LABELS[role]}</span>
                </label>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label>Extra approval if unbudgeted</Label>
              <Select
                value={draft.extra}
                onValueChange={(v) => setDraft((p) => ({ ...p, extra: v as AppRole | "none" }))}
              >
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No extra step</SelectItem>
                  {ALL_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="h-12 w-full" disabled={create.isPending}>
              {create.isPending ? "Saving…" : "Save rule"}
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
    <div className="rounded-lg border border-border border-l-4 border-l-signal bg-card p-4">
      <p className="data-label">Invite a teammate</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate();
        }}
        className="mt-3 space-y-3"
      >
        <div className="space-y-1.5">
          <Label htmlFor="invite-email">Work email</Label>
          <Input
            id="invite-email"
            type="email"
            required
            className="h-12"
            placeholder="teammate@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Roles</Label>
          <div className="flex flex-wrap gap-2">
            {ALL_ROLES.map((role) => {
              const active = roles.includes(role);
              return (
                <button
                  type="button"
                  key={role}
                  onClick={() =>
                    setRoles(active ? roles.filter((r) => r !== role) : [...roles, role])
                  }
                  className={
                    active
                      ? "h-10 rounded-md bg-primary px-3 text-xs font-semibold uppercase tracking-wide text-primary-foreground"
                      : "h-10 rounded-md border border-border px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-surface"
                  }
                >
                  {ROLE_LABELS[role]}
                </button>
              );
            })}
          </div>
        </div>
        <Button type="submit" disabled={send.isPending} className="h-12 w-full md:w-auto">
          {send.isPending ? "Inviting…" : "Send invite"}
        </Button>
      </form>

      {invites.data?.length ? (
        <div className="mt-5 border-t border-border pt-3">
          <p className="data-label">Pending invitations</p>
          <ul className="mt-2 space-y-2">
            {invites.data.map((invite) => (
              <li
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface px-3 py-2"
              >
                <span className="text-sm">
                  {invite.email}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {(invite.roles ?? []).map((r) => ROLE_LABELS[r] ?? r).join(", ")}
                  </span>
                </span>
                <button
                  onClick={() => cancel.mutate(invite.id)}
                  disabled={cancel.isPending}
                  className="inline-flex h-10 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden /> Cancel
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Team({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();

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
      toast.success("Roles updated.");
      await queryClient.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't update those roles."),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading team…</p>;

  return (
    <div className="space-y-3">
      {isAdmin ? <InviteTeammate /> : null}
      <p className="text-sm text-muted-foreground">
        Invite a teammate by email and pre-assign roles; they get those roles the first time they
        sign in. A person can hold more than one role.
      </p>
      {(data?.members ?? []).map((member) => {
        const current = (data?.roles ?? [])
          .filter((r) => r.user_id === member.id)
          .map((r) => r.role as AppRole);
        return (
          <article key={member.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{member.full_name || member.email}</p>
                <p className="text-xs text-muted-foreground">
                  {member.email}
                  {member.department ? ` · ${member.department}` : ""}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {ALL_ROLES.map((role) => {
                const active = current.includes(role);
                return (
                  <button
                    key={role}
                    disabled={!isAdmin || save.isPending}
                    onClick={() =>
                      save.mutate({
                        targetUserId: member.id,
                        roles: active ? current.filter((r) => r !== role) : [...current, role],
                      })
                    }
                    className={
                      active
                        ? "h-10 rounded-md bg-primary px-3 text-xs font-semibold uppercase tracking-wide text-primary-foreground"
                        : "h-10 rounded-md border border-border px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-surface disabled:opacity-60"
                    }
                  >
                    {ROLE_LABELS[role]}
                  </button>
                );
              })}
            </div>
          </article>
        );
      })}
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
    onSuccess: () => toast.success("NDPA consent record logged."),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed logging consent."),
  });

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2 text-primary">
          <ShieldCheck className="h-5 w-5" />
          <h2 className="font-display text-xl uppercase tracking-wide">
            NDPA 2023 Data Protection Baseline
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Procurely Flow maintains data minimization, strict organizational data isolation, and
          immutable audit logs in compliance with the Nigeria Data Protection Act 2023.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 pt-2 text-xs">
          <div className="rounded-md bg-surface p-3 space-y-1">
            <span className="font-semibold text-foreground flex items-center gap-1">
              <Lock className="h-3.5 w-3.5" /> Multi-Tenant Isolation
            </span>
            <p className="text-muted-foreground">
              Every query is enforced with Row Level Security (RLS) scoped strictly to your
              organization ID.
            </p>
          </div>

          <div className="rounded-md bg-surface p-3 space-y-1">
            <span className="font-semibold text-foreground flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" /> Immutable Audit Trail
            </span>
            <p className="text-muted-foreground">
              Approval actions, threshold rule modifications, and payments produce permanent
              timestamped log entries.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Data Retention & Subject Access
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 text-xs">
          <div className="space-y-1.5">
            <Label htmlFor="retention">Statutory Financial Audit Retention (Years)</Label>
            <Input
              id="retention"
              type="number"
              className="h-12 text-sm"
              value={retentionYears}
              onChange={(e) => setRetentionYears(e.target.value)}
              disabled={!isAdmin}
            />
            <p className="text-[11px] text-muted-foreground">
              Default is 7 years per statutory Nigerian financial audit rules.
            </p>
          </div>

          <div className="flex flex-col justify-end space-y-2">
            <Button
              variant="outline"
              className="h-12 font-medium"
              onClick={() => logConsent.mutate()}
              disabled={logConsent.isPending}
            >
              Log NDPA Data Consent Record
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
