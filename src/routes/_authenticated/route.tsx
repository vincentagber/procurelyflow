import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  ClipboardList,
  CheckSquare,
  Send,
  ReceiptText,
  Truck,
  FolderKanban,
  Settings,
  LogOut,
  Menu,
  X,
  ShieldAlert,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useMe, can, type AppRole } from "@/lib/useMe";
import { bootstrapOrg, myPendingInvite, acceptInviteFn } from "@/lib/procurement.functions";
import { myOrgAccessFn, amIPlatformAdmin } from "@/lib/platform.functions";
import { ROLE_LABELS } from "@/lib/format";
import { NotificationBell } from "@/components/procurely/notifications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AppLayout,
});

const NAV = [
  { to: "/dashboard", label: "Overview", icon: ClipboardList, roles: null },
  { to: "/requisitions", label: "Requisitions", icon: ClipboardList, roles: null },
  {
    to: "/approvals",
    label: "Approvals",
    icon: CheckSquare,
    roles: ["approver", "finance", "executive", "admin"],
  },
  { to: "/projects", label: "Projects / Cost Centers", icon: FolderKanban, roles: null },
  {
    to: "/rfqs",
    label: "RFQs & quotes",
    icon: Send,
    roles: ["procurement_officer", "finance", "executive", "admin"],
  },
  {
    to: "/purchase-orders",
    label: "Purchase orders",
    icon: ReceiptText,
    roles: ["procurement_officer", "finance", "executive", "admin"],
  },
  {
    to: "/deliveries",
    label: "Deliveries & Inspection",
    icon: Truck,
    roles: null,
  },
  {
    to: "/invoices",
    label: "Invoices & 3-Way Match",
    icon: ReceiptText,
    roles: ["procurement_officer", "finance", "executive", "admin"],
  },
  {
    to: "/suppliers",
    label: "Suppliers",
    icon: Truck,
    roles: ["procurement_officer", "finance", "admin"],
  },
  { to: "/settings", label: "Settings", icon: Settings, roles: ["admin"] },
] as const satisfies ReadonlyArray<{
  to: string;
  label: string;
  icon: typeof ClipboardList;
  roles: readonly AppRole[] | null;
}>;

function AppLayout() {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const access = useQuery({ queryKey: ["org-access"], queryFn: () => myOrgAccessFn() });
  const platform = useQuery({
    queryKey: ["platform-admin-gate"],
    queryFn: () => amIPlatformAdmin(),
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (me.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading your workspace…
      </div>
    );
  }

  if (!me.data?.profile?.org_id) {
    return <Onboarding />;
  }

  if (access.data?.suspended) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-signal" aria-hidden />
          <h1 className="page-title mt-3 text-3xl">Account suspended</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Access to {access.data.orgName ?? "this workspace"} is paused. All of your data is
            safely retained and returns the moment the account is reactivated — contact Procurely to
            sort it out.
          </p>
          <Button onClick={signOut} variant="outline" className="mt-5">
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  const watchesSuppliers = can(me.data?.roles, ["procurement_officer", "admin"]);

  return (
    <div className="min-h-screen bg-surface md:flex">
      <header className="flex items-center justify-between border-b border-sidebar-border bg-sidebar px-4 py-3 md:hidden">
        <span className="font-display text-xl uppercase tracking-wider text-sidebar-foreground">
          Procurely
        </span>
        <div className="flex items-center gap-1">
          {watchesSuppliers ? <NotificationBell /> : null}
          <button
            aria-label="Open menu"
            onClick={() => setOpen((v) => !v)}
            className="flex h-11 w-11 items-center justify-center rounded-md text-sidebar-foreground"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      <aside
        className={cn(
          "border-b border-sidebar-border bg-sidebar px-3 py-3 md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-b-0 md:border-r md:py-5",
          open ? "block" : "hidden md:block",
        )}
      >
        <div className="hidden px-2 pb-5 md:block">
          <div className="flex items-start justify-between gap-2">
            <p className="font-display text-2xl uppercase tracking-wider text-sidebar-foreground">
              Procurely Flow
            </p>
            {watchesSuppliers ? <NotificationBell /> : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-sidebar-foreground/70">{me.data.orgName}</p>
        </div>

        <nav className="space-y-1">
          {NAV.filter((item) => !item.roles || can(me.data?.roles, [...item.roles])).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              activeProps={{
                className:
                  "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-l-signal",
              }}
              className="tap-row flex items-center gap-2.5 rounded-md px-3 text-sm font-medium text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <item.icon className="h-4 w-4 shrink-0" aria-hidden />
              {item.label}
            </Link>
          ))}
        </nav>
        {platform.data?.isPlatformAdmin ? (
          <div className="mt-4 border-t border-sidebar-border pt-3">
            <Link
              to="/platform-admin"
              onClick={() => setOpen(false)}
              className="tap-row flex items-center gap-2.5 rounded-md border border-signal/40 px-3 text-sm font-medium text-signal hover:bg-signal/10"
            >
              <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden /> Platform admin
            </Link>
          </div>
        ) : null}
        <div className="mt-5 border-t border-sidebar-border pt-3">
          <p className="truncate px-3 text-xs text-sidebar-foreground/70">{me.data.email}</p>
          <button
            onClick={signOut}
            className="tap-row mt-1 flex w-full items-center gap-2.5 rounded-md px-3 text-sm text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-4 w-4" aria-hidden /> Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 bg-background px-4 py-5 md:px-8 md:py-7">
        <Outlet />
      </main>
    </div>
  );
}

function Onboarding() {
  const me = useMe();
  const queryClient = useQueryClient();
  const [orgName, setOrgName] = useState("");
  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [busy, setBusy] = useState(false);

  const invite = useQuery({
    queryKey: ["my-invite"],
    queryFn: () => myPendingInvite(),
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (invite.data) {
        await acceptInviteFn({
          data: { fullName, ...(department ? { department } : {}) },
        });
        toast.success(`You've joined ${invite.data.orgName}.`);
      } else {
        await bootstrapOrg({ data: { orgName, fullName, ...(department ? { department } : {}) } });
        toast.success("Workspace ready. Default approval thresholds have been set up for you.");
      }
      await queryClient.invalidateQueries();
      await me.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We couldn't finish setup.");
    } finally {
      setBusy(false);
    }
  }

  if (invite.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Checking your invitations…
      </div>
    );
  }

  const joining = !!invite.data;

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-5 py-10">
      <div className="w-full max-w-lg rounded-lg border border-border border-t-4 border-t-signal bg-card p-6">
        <h1 className="page-title text-foreground">
          {joining ? `Join ${invite.data!.orgName}` : "Set up your organization"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {joining
            ? `You've been invited as ${invite.data!.roles.map((r) => ROLE_LABELS[r] ?? r).join(", ")}. Confirm your details to join the team.`
            : "Everything you create stays private to this organization. You'll be its Admin, and we'll start you with sensible approval thresholds you can edit any time in Settings."}
        </p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          {joining ? null : (
            <div className="space-y-1.5">
              <Label htmlFor="org">Company name</Label>
              <Input
                id="org"
                required
                className="h-12"
                placeholder="e.g. Landmark Developments Ltd"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="name">Your full name</Label>
            <Input
              id="name"
              required
              className="h-12"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dept">Department (optional)</Label>
            <Input
              id="dept"
              className="h-12"
              placeholder="e.g. Projects"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy} className="h-12 w-full">
            {busy ? "Please wait…" : joining ? "Join team" : "Create workspace"}
          </Button>
        </form>
      </div>
    </main>
  );
}
