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
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Building2,
  Receipt,
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
import { AnimatedPageWrapper } from "@/components/ui/animated";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AppLayout,
});

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: readonly AppRole[] | null;
  badgeKey?: "pendingApprovals";
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Main Menu",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: null },
      { to: "/requisitions", label: "Requisitions", icon: ClipboardList, roles: null },
      {
        to: "/approvals",
        label: "Approvals",
        icon: CheckSquare,
        roles: ["approver", "finance", "executive", "admin"],
        badgeKey: "pendingApprovals",
      },
      { to: "/projects", label: "Projects / Cost Centers", icon: FolderKanban, roles: null },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        to: "/rfqs",
        label: "RFQs & Quotes",
        icon: Send,
        roles: ["procurement_officer", "finance", "executive", "admin"],
      },
      {
        to: "/purchase-orders",
        label: "Purchase Orders",
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
        icon: Receipt,
        roles: ["procurement_officer", "finance", "executive", "admin"],
      },
      {
        to: "/suppliers",
        label: "Suppliers Directory",
        icon: Building2,
        roles: ["procurement_officer", "finance", "admin"],
      },
    ],
  },
  {
    title: "General",
    items: [
      { to: "/settings", label: "Settings", icon: Settings, roles: ["admin"] },
    ],
  },
];

function AppLayout() {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("sidebar_collapsed", String(next));
    } catch {
      // ignore
    }
  }

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const access = useQuery({ queryKey: ["org-access"], queryFn: () => myOrgAccessFn() });
  const platform = useQuery({
    queryKey: ["platform-admin-gate"],
    queryFn: () => amIPlatformAdmin(),
  });

  const pendingApprovalsQuery = useQuery({
    queryKey: ["sidebar-pending-approvals-count", me.data?.userId],
    queryFn: async () => {
      const { count } = await supabase
        .from("approval_steps")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      return count ?? 0;
    },
    enabled: !!me.data?.userId,
    staleTime: 30000,
  });
  const pendingApprovalsCount = pendingApprovalsQuery.data ?? 0;

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
    <div className="min-h-screen bg-[#F8F9FB] text-foreground antialiased md:flex">
      {/* Mobile Top Header */}
      <header className="flex items-center justify-between border-b border-[#162070] bg-[#0B1457] px-4 py-3 md:hidden">
        <div className="flex items-center">
          <img
            src="/logo-dark.png"
            alt="Logo"
            className="h-7 w-auto object-contain rounded-md bg-white p-1"
          />
        </div>
        <div className="flex items-center gap-2">
          {watchesSuppliers ? <NotificationBell /> : null}
          <button
            aria-label="Open menu"
            onClick={() => setOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-white transition-colors hover:bg-white/15"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* Sleek Dark Left Sidebar Navigation (Brand: #0B1457 base, #0001FF active) with Collapse Support */}
      <aside
        className={cn(
          "z-30 border-r border-[#162070] bg-[#0B1457] py-5 transition-all duration-300 md:sticky md:top-0 md:h-screen md:shrink-0 md:flex md:flex-col md:justify-between",
          collapsed ? "px-2.5 md:w-20" : "px-3.5 md:w-64",
          open ? "block" : "hidden md:flex",
        )}
      >
        <div>
          {/* Brand Header */}
          <div className="px-1 pb-4">
            <div className="flex items-center justify-between">
              <Link to="/dashboard" className="flex items-center">
                <img
                  src="/logo-dark.png"
                  alt="Procurely"
                  className={cn(
                    "w-auto object-contain rounded-lg bg-white p-1.5 shadow-sm transition-all",
                    collapsed ? "h-7" : "h-8",
                  )}
                />
              </Link>
              <div className="hidden md:flex items-center gap-1">
                {!collapsed && watchesSuppliers ? <NotificationBell /> : null}
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                  aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white transition-colors"
                >
                  {collapsed ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <ChevronLeft className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Navigation Sections Categorized (Main Menu, Operations, General) */}
          <nav className="space-y-3.5">
            {NAV_SECTIONS.map((section, idx) => {
              const visibleItems = section.items.filter(
                (item) => !item.roles || can(me.data?.roles, [...item.roles]),
              );
              if (!visibleItems.length) return null;

              return (
                <div key={section.title} className="space-y-0.5">
                  {/* Category Header (or subtle divider when collapsed) */}
                  {collapsed ? (
                    idx > 0 ? <div className="h-px bg-white/10 my-2 mx-1" /> : null
                  ) : (
                    <div className="px-3 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-white/40 select-none">
                      {section.title}
                    </div>
                  )}

                  <div className="space-y-0.5">
                    {visibleItems.map((item) => {
                      const badgeCount =
                        item.badgeKey === "pendingApprovals" ? pendingApprovalsCount : 0;

                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          onClick={() => setOpen(false)}
                          title={collapsed ? item.label : undefined}
                          activeProps={{
                            className:
                              "bg-[#0001FF] text-white font-medium shadow-xs",
                          }}
                          inactiveProps={{
                            className:
                              "text-white/70 hover:bg-white/10 hover:text-white font-normal",
                          }}
                          className={cn(
                            "group flex items-center rounded-xl py-2 text-xs transition-all",
                            collapsed ? "justify-center px-2" : "justify-between px-3",
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <item.icon
                              className="h-4 w-4 shrink-0 transition-colors group-hover:text-white"
                              aria-hidden
                            />
                            {!collapsed && <span className="truncate">{item.label}</span>}
                          </div>

                          {!collapsed && badgeCount > 0 && (
                            <span className="ml-auto rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white tabular-nums">
                              {badgeCount}
                            </span>
                          )}
                        </Link>
                      );
                    })}

                    {/* Add Log out into General category section */}
                    {section.title === "General" && (
                      <button
                        type="button"
                        onClick={signOut}
                        title={collapsed ? "Log out" : undefined}
                        className={cn(
                          "group w-full flex items-center rounded-xl py-2 text-xs text-white/70 hover:bg-white/10 hover:text-white transition-all cursor-pointer",
                          collapsed ? "justify-center px-2" : "gap-2.5 px-3",
                        )}
                      >
                        <LogOut className="h-4 w-4 shrink-0 text-white/60 group-hover:text-white transition-colors" />
                        {!collapsed && <span>Log out</span>}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Platform Admin in General / Standalone */}
            {platform.data?.isPlatformAdmin ? (
              <div className="pt-1">
                {!collapsed && (
                  <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-amber-400/60 select-none">
                    Platform
                  </div>
                )}
                <Link
                  to="/platform-admin"
                  onClick={() => setOpen(false)}
                  title={collapsed ? "Platform Admin" : undefined}
                  className={cn(
                    "flex items-center rounded-xl border border-amber-500/30 py-2 text-xs font-semibold text-amber-400 hover:bg-amber-500/10 transition-colors",
                    collapsed ? "justify-center px-2" : "gap-2.5 px-3",
                  )}
                >
                  <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
                  {!collapsed && <span>Platform Admin</span>}
                </Link>
              </div>
            ) : null}
          </nav>
        </div>

        {/* User Profile Footer */}
        <div className="mt-4 border-t border-[#162070] pt-3.5">
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <div
                title={`${me.data.profile?.full_name || "User"} (${me.data.email})`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0001FF] text-xs font-bold text-white uppercase shadow-sm cursor-default"
              >
                {me.data.profile?.full_name?.slice(0, 2) || me.data.email.slice(0, 2)}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 px-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0001FF] text-xs font-bold text-white uppercase shadow-sm">
                {me.data.profile?.full_name?.slice(0, 2) || me.data.email.slice(0, 2)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-white">
                  {me.data.profile?.full_name || "User"}
                </p>
                <p className="truncate text-[10px] text-white/50">{me.data.email}</p>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area (Clean White & High Contrast) */}
      <main className="min-w-0 flex-1 bg-[#F8F9FB] px-4 py-6 md:px-8 md:py-7 overflow-x-hidden">
        <AnimatedPageWrapper>
          <Outlet />
        </AnimatedPageWrapper>
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
