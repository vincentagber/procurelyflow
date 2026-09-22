import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, Search, Mail, UserPlus, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/useMe";
import { UserAvatar } from "@/components/procurely/UserAvatar";
import {
  updateMemberRoles,
  inviteTeammateFn,
  cancelInvitationFn,
} from "@/lib/procurement.functions";
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

export function TeamSection({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["team"],
    queryFn: async () => {
      const [profiles, roles] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, department, avatar_url")
          .order("full_name"),
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
              Manage teammate role capabilities. Click any role badge to grant or revoke
              authorization.
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
                <SelectItem value="all" className="text-xs font-medium">
                  All Roles
                </SelectItem>
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
          <div className="py-16 text-center text-xs text-slate-400 animate-pulse">
            Loading directory…
          </div>
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
                                : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900 disabled:opacity-40",
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
          : "Invitation dispatched successfully.",
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
          <h2 className="text-base font-semibold text-slate-900 tracking-tight">
            Invite Teammate &amp; Assign Roles
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 font-normal">
            Enter an organizational work email. Assigned capabilities take effect the first time
            they sign in.
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
            <p className="text-[11px] text-slate-400">
              Teammate will receive an organizational invitation.
            </p>
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
                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900",
                    )}
                  >
                    {active && <Check className="h-3 w-3" />}
                    <span>{ROLE_CONFIG[role].shortLabel}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400">
              Multiple roles can be granted simultaneously.
            </p>
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
