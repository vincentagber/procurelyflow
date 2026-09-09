"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useMe, can, type AppRole } from "@/lib/useMe";
import { NotificationBell } from "@/components/procurely/notifications";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: ClipboardList, roles: null },
  { href: "/requisitions", label: "Requisitions", icon: ClipboardList, roles: null },
  {
    href: "/approvals",
    label: "Approvals",
    icon: CheckSquare,
    roles: ["approver", "finance", "executive", "admin"],
  },
  { href: "/projects", label: "Projects / Cost Centers", icon: FolderKanban, roles: null },
  {
    href: "/rfqs",
    label: "RFQs & quotes",
    icon: Send,
    roles: ["procurement_officer", "finance", "executive", "admin"],
  },
  {
    href: "/purchase-orders",
    label: "Purchase orders",
    icon: ReceiptText,
    roles: ["procurement_officer", "finance", "executive", "admin"],
  },
  {
    href: "/deliveries",
    label: "Deliveries & Inspection",
    icon: Truck,
    roles: null,
  },
  {
    href: "/invoices",
    label: "Invoices & 3-Way Match",
    icon: ReceiptText,
    roles: ["procurement_officer", "finance", "executive", "admin"],
  },
  {
    href: "/suppliers",
    label: "Suppliers",
    icon: Truck,
    roles: ["procurement_officer", "finance", "admin"],
  },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["admin"] },
] as const satisfies ReadonlyArray<{
  href: string;
  label: string;
  icon: typeof ClipboardList;
  roles: readonly AppRole[] | null;
}>;

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem("sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("sidebar_collapsed", String(next));
    } catch {
      // ignore
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/auth");
  }

  if (me.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading your workspace…
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
          <div className="px-1 pb-5">
            <div className="flex items-center justify-between">
              <Link href="/dashboard" className="flex items-center">
                <img
                  src="/logo-dark.png"
                  alt="Logo"
                  className={cn(
                    "w-auto object-contain rounded-lg bg-white p-1.5 shadow-sm transition-all",
                    collapsed ? "h-7" : "h-8",
                  )}
                />
              </Link>
              <div className="hidden md:flex items-center gap-1.5">
                {!collapsed && watchesSuppliers ? <NotificationBell /> : null}
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                  aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition-colors"
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

          {/* Navigation Links */}
          <nav className="space-y-1">
            {NAV.filter((item) => !item.roles || can(me.data?.roles, [...item.roles])).map(
              (item) => {
                const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "group flex items-center rounded-lg py-2.5 text-sm transition-all",
                      collapsed ? "justify-center px-2" : "justify-between px-3",
                      isActive
                        ? "bg-[#0001FF] text-white font-semibold shadow-inner"
                        : "text-white/70 hover:bg-white/10 hover:text-white font-normal",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon
                        className="h-4 w-4 shrink-0 transition-colors group-hover:text-white"
                        aria-hidden
                      />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </div>
                  </Link>
                );
              },
            )}
          </nav>
        </div>

        {/* User Profile & Sign Out Footer */}
        <div className="mt-6 border-t border-[#162070] pt-4">
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <div
                title={`${me.data?.profile?.full_name || "User"} (${me.data?.email})`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0001FF] text-xs font-bold text-white uppercase shadow-sm cursor-default"
              >
                {me.data?.profile?.full_name?.slice(0, 2) || me.data?.email?.slice(0, 2) || "U"}
              </div>
              <button
                onClick={signOut}
                title="Sign out"
                aria-label="Sign out"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white transition-colors"
              >
                <LogOut className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0001FF] text-xs font-bold text-white uppercase shadow-sm">
                  {me.data?.profile?.full_name?.slice(0, 2) || me.data?.email?.slice(0, 2) || "U"}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-white">
                    {me.data?.profile?.full_name || "User"}
                  </p>
                  <p className="truncate text-[10px] text-white/50">{me.data?.email}</p>
                </div>
              </div>
              <button
                onClick={signOut}
                title="Sign out"
                aria-label="Sign out"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white transition-colors"
              >
                <LogOut className="h-4 w-4" aria-hidden />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="min-w-0 flex-1 bg-[#F8F9FB] px-4 py-6 md:px-8 md:py-7 overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
