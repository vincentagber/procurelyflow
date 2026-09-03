import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Filter,
  ArrowUpRight,
  TrendingUp,
  CreditCard,
  Wallet,
  Clock,
  ShieldAlert,
  ChevronDown,
  CheckCircle2,
  ExternalLink,
  Plus,
  Building2,
  Layers,
  PieChart,
  FolderKanban,
  ArrowRight,
  Sparkles,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useMe, can } from "@/lib/useMe";
import { money, shortDate, dateTime, STATUS_LABELS, ROLE_LABELS } from "@/lib/format";
import { StatusPill, EmptyState } from "@/components/procurely/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { detectSplitRequisitionAnomalies } from "@/lib/governanceAnomalies";
import { motion, AnimatePresence, itemFadeIn, staggerContainer, fadeIn, cardHover } from "@/components/ui/animated";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Procurely Flow" },
      {
        name: "description",
        content:
          "Enterprise procurement overview: spend velocity, approval pipeline, and transaction logs.",
      },
      { property: "og:title", content: "Dashboard — Procurely Flow" },
      { property: "og:description", content: "Executive procurement dashboard and analytics." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const me = useMe();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [timeframe, setTimeframe] = useState<"This Month" | "Last 30 Days" | "All Time">(
    "This Month",
  );
  const [spendViewMode, setSpendViewMode] = useState<"category" | "project">("category");
  const [selectedDrilldownProject, setSelectedDrilldownProject] = useState<{
    id: string;
    name: string;
    location: string;
    budget: number;
    committed: number;
    remaining: number;
    utilization: number;
    poCount: number;
    purchaseOrders: any[];
    requisitions: any[];
  } | null>(null);

  // Real-time listener: automatically invalidate and refetch on any DB insert/update/delete
  useEffect(() => {
    const channel = supabase
      .channel("dashboard_realtime_updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "requisitions" }, () => {
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "approval_steps" }, () => {
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_orders" }, () => {
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => {
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [reqs, steps, pos, projectsRes, suppliers, members, itemsRes] = await Promise.all([
        supabase
          .from("requisitions")
          .select("id, reference, title, status, total_amount, currency, created_at, needed_by, project_id, projects(id, name, location, budget_amount)")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("approval_steps")
          .select(
            "id, required_role, status, requisitions(id, title, reference, total_amount, currency)",
          )
          .eq("status", "pending"),
        supabase
          .from("purchase_orders")
          .select("id, po_number, total_amount, settlement_currency, status, issued_at, supplier_id, suppliers(id, name), requisition_id, requisitions(id, reference, title, project_id, projects(id, name, location, budget_amount))")
          .order("issued_at", { ascending: false }),
        supabase.from("projects").select("id, name, location, budget_amount, created_at").order("created_at", { ascending: false }),
        supabase.from("suppliers").select("id", { count: "exact", head: true }),
        supabase.from("user_roles").select("id", { count: "exact", head: true }),
        supabase.from("requisition_items").select("id, description, quantity, estimated_unit_price, unit, requisition_id").limit(100),
      ]);
      return {
        requisitions: reqs.data ?? [],
        steps: steps.data ?? [],
        purchaseOrders: pos.data ?? [],
        projectsList: projectsRes.data ?? [],
        projectCount: projectsRes.data?.length ?? 0,
        supplierCount: suppliers.count ?? 0,
        memberCount: members.count ?? 0,
        requisitionItems: itemsRes.data ?? [],
      };
    },
  });

  const myPendingSteps = (data?.steps ?? []).filter(
    (s: any) => s.status === "pending" && me.data?.roles.includes(s.required_role as never),
  );
  const myPending = myPendingSteps.length;
  const awaiting = (data?.requisitions ?? []).filter((r: any) => r.status === "pending_approval").length;
  const committed = (data?.purchaseOrders ?? []).reduce(
    (sum: number, p: any) => sum + Number(p.total_amount || 0),
    0,
  );
  const inApprovalAmount = (data?.requisitions ?? [])
    .filter((r: any) => r.status === "pending_approval")
    .reduce((sum: number, r: any) => sum + Number(r.total_amount || 0), 0);

  const allPOs = data?.purchaseOrders ?? [];
  const allReqs = data?.requisitions ?? [];
  const allItems = data?.requisitionItems ?? [];

  const totalReqsCount = allReqs.length;
  const approvedReqsCount = allReqs.filter(
    (r: any) =>
      r.status === "approved" ||
      r.status === "po_created" ||
      r.status === "partially_received" ||
      r.status === "received" ||
      r.status === "matched",
  ).length;
  const inReviewReqsCount = allReqs.filter(
    (r: any) => r.status === "pending_approval" || r.status === "draft",
  ).length;
  const pipelineRatio =
    totalReqsCount > 0 ? Math.round((approvedReqsCount / totalReqsCount) * 100) : 0;
  const totalLineItems = allItems.length > 0 ? allItems.length : totalReqsCount;

  // Group real spend dynamically
  const categoryMap = new Map<string, number>();
  if (allItems.length > 0) {
    allItems.forEach((item: any) => {
      const cat = item.description?.split(" ")[0] || "General";
      const val = Number(item.estimated_unit_price || 0) * Number(item.quantity || 1);
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + val);
    });
  }

  const categoryEntries = Array.from(categoryMap.entries()).sort((a, b) => b[1] - a[1]);
  const totalItemSpend = categoryEntries.reduce((s, [, v]) => s + v, 0) || committed;

  const CATEGORY_BREAKDOWN = categoryEntries.length > 0
    ? categoryEntries.slice(0, 4).map(([name, amount], idx) => ({
        name,
        amount,
        share: totalItemSpend > 0 ? amount / totalItemSpend : 0,
        color: idx === 0 ? "bg-[#0B1457]" : idx === 1 ? "bg-[#10B981]" : idx === 2 ? "bg-[#F59E0B]" : "bg-[#6366F1]",
      }))
    : [
        { name: "Structural & Civil Works", share: committed > 0 ? 0.50 : 0, amount: committed * 0.50, color: "bg-[#0B1457]" },
        { name: "Equipment & Mechanical", share: committed > 0 ? 0.30 : 0, amount: committed * 0.30, color: "bg-[#10B981]" },
        { name: "Electrical & Utilities", share: committed > 0 ? 0.20 : 0, amount: committed * 0.20, color: "bg-[#F59E0B]" },
      ];

  // Real database projects with actual committed spend, approved Capex, and remaining balance
  const projectsData = data?.projectsList ?? [];
  const projectBreakdown = projectsData.map((p: any) => {
    const pPOs = allPOs.filter((po: any) => po.requisitions?.project_id === p.id);
    const pReqs = allReqs.filter((r: any) => r.project_id === p.id);
    const pCommitted = pPOs.reduce((sum: number, po: any) => sum + Number(po.total_amount || 0), 0);
    const budget = Number(p.budget_amount || 0);
    const remaining = budget > 0 ? Math.max(0, budget - pCommitted) : 0;
    const utilization = budget > 0 ? Math.min(100, Math.round((pCommitted / budget) * 100)) : (pCommitted > 0 ? 100 : 0);
    return {
      id: p.id,
      name: p.name,
      location: p.location || "Location unassigned",
      budget,
      committed: pCommitted,
      remaining,
      utilization,
      poCount: pPOs.length,
      purchaseOrders: pPOs,
      requisitions: pReqs,
    };
  });

  const canApprove = can(me.data?.roles, ["approver", "finance", "executive", "admin"]);
  const canViewGovernance = can(me.data?.roles, ["executive", "admin", "finance"]);

  // Calculate real-time governance anomalies from loaded requisitions
  const splitAnomalies = detectSplitRequisitionAnomalies(
    (data?.requisitions ?? []).map((r: any) => ({
      id: r.id,
      reference: r.reference,
      requesterId: (r as { requester_id?: string }).requester_id || "req-01",
      requesterName: "Requester",
      projectId: (r as { project_id?: string }).project_id || "proj-01",
      projectName: "Active Site",
      amount: Number(r.total_amount),
      currency: r.currency,
      createdAt: r.created_at,
    })),
  );

  // Filter requisitions for the data table
  const filteredRequisitions = (data?.requisitions ?? []).filter(
    (r: any) =>
      r.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.reference?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="space-y-6 pb-12 font-sans"
    >
      {/* Top Header Bar (Matching Reference Header Layout) */}
      <motion.header
        variants={itemFadeIn}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#111315] uppercase sm:text-2xl">
            Dashboard
          </h1>
          <p className="text-xs text-[#6B7280]">
            Welcome back, {me.data?.profile?.full_name || "User"} · Procurement Overview
          </p>
        </div>

        {/* Search and Action Bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1 sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
            <Input
              type="text"
              placeholder="Search logs, POs, items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-10 rounded-lg border-[#E5E7EB] bg-white pl-9 text-xs placeholder:text-[#9CA3AF] focus-visible:ring-1 focus-visible:ring-black shadow-xs"
            />
          </div>

          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button
              asChild
              className="h-10 rounded-lg bg-[#111315] px-4 text-xs font-semibold text-white shadow-sm hover:bg-[#202428] transition-colors"
            >
              <Link to="/requisitions/new">
                <Plus className="mr-1.5 h-3.5 w-3.5" /> New Requisition
              </Link>
            </Button>
          </motion.div>
        </div>
      </motion.header>

      {/* Row 1: Top Hero Grid (Matching the 3 Cards in the Reference Image) */}
      <motion.div variants={staggerContainer} className="grid gap-4 lg:grid-cols-12">
        {/* Card 1: Total Volume & Sparkline Curve (Span 6) */}
        <motion.section
          variants={itemFadeIn}
          whileHover={{ y: -3 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col justify-between rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-xs lg:col-span-6 cursor-default"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
              Total Requisitions & Velocity
            </span>
            <div className="flex items-center gap-1 rounded-md border border-[#E5E7EB] bg-[#F9FAFB] px-2 py-1 text-[11px] font-medium text-[#374151]">
              <span>{timeframe}</span>
              <ChevronDown className="h-3 w-3 text-[#9CA3AF]" />
            </div>
          </div>

          {/* SVG Sparkline Curve Chart (Reference Aesthetic) */}
          <div className="relative my-4 h-24 w-full">
            <svg
              className="h-full w-full overflow-visible"
              viewBox="0 0 400 80"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              {/* Shaded Area */}
              <motion.path
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6 }}
                d="M 0,55 Q 30,30 60,45 T 120,25 T 180,40 T 240,15 T 300,35 T 360,20 T 400,45 L 400,80 L 0,80 Z"
                fill="url(#curveGradient)"
              />
              {/* Smooth Stroke Line with drawing animation */}
              <motion.path
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.2, ease: "easeOut" }}
                d="M 0,55 Q 30,30 60,45 T 120,25 T 180,40 T 240,15 T 300,35 T 360,20 T 400,45"
                fill="none"
                stroke="#10B981"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              {/* Highlight Pin / Tooltip Node with subtle pulsing animation */}
              <motion.circle
                cx="240"
                cy="15"
                r="4"
                fill="#111315"
                stroke="#FFFFFF"
                strokeWidth="2"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              />
            </svg>
            {/* Tooltip Label Badge */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="absolute left-[54%] top-0 -translate-x-1/2 -translate-y-2 rounded-md bg-[#111315] px-2 py-0.5 text-[10px] font-semibold text-white shadow-md"
            >
              <span>
                {totalReqsCount > 0 ? `${totalReqsCount} Logged` : "0 Requests"}
              </span>
            </motion.div>
          </div>

          <div className="flex items-baseline justify-between pt-2 border-t border-[#F3F4F6]">
            <div>
              <p className="font-sans text-2xl font-extrabold tracking-tight text-[#111315]">
                {totalReqsCount.toLocaleString()}
              </p>
              <span className="text-[11px] text-[#9CA3AF]">
                {totalLineItems > 0 ? `${totalLineItems} Processed line item(s)` : "Total Requisitions"}
              </span>
            </div>
            <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-600">
              <ArrowUpRight className="h-3 w-3" /> Live
            </div>
          </div>
        </motion.section>

        {/* Card 2: Transactions & Approval Ratio Donut Chart (Span 3) */}
        <motion.section
          variants={itemFadeIn}
          whileHover={{ y: -3 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col justify-between rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-xs lg:col-span-3 cursor-default"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
              Pipeline Ratio
            </span>
            <span className="text-xs text-emerald-600 font-bold">Live</span>
          </div>

          {/* SVG Donut Progress Chart */}
          <div className="my-2 flex items-center justify-center">
            <div className="relative flex h-28 w-28 items-center justify-center">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-[#F3F4F6]"
                  stroke="currentColor"
                  strokeWidth="3.8"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <motion.path
                  className="text-[#111315]"
                  stroke="currentColor"
                  strokeWidth="3.8"
                  initial={{ strokeDasharray: "0, 100" }}
                  animate={{ strokeDasharray: `${pipelineRatio}, 100` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  strokeLinecap="round"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="font-sans text-xl font-extrabold text-[#111315]">{pipelineRatio}%</span>
                <span className="text-[9px] uppercase tracking-wider text-[#9CA3AF]">Cleared</span>
              </div>
            </div>
          </div>

          {/* Legend Matching Reference Photo */}
          <div className="flex justify-center gap-4 text-[10px] text-[#6B7280]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#111315]" /> Approved ({approvedReqsCount})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#E5E7EB]" /> In Review ({inReviewReqsCount})
            </span>
          </div>
        </motion.section>

        {/* Card 3: Top Spend Breakdown by Category & Project (Span 3) */}
        <motion.section
          variants={itemFadeIn}
          whileHover={{ y: -3 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col justify-between rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-xs lg:col-span-3 cursor-default"
        >
          <div className="flex items-center justify-between">
            {/* View Mode Toggle Pill */}
            <div className="flex items-center gap-1 rounded-lg bg-[#F1F5F9] p-0.5 border border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => setSpendViewMode("category")}
                className={cn(
                  "rounded-md px-2 py-0.5 text-[10px] font-bold transition-all",
                  spendViewMode === "category"
                    ? "bg-white text-[#0B1457] shadow-2xs"
                    : "text-[#64748B] hover:text-[#0B1457]",
                )}
              >
                Category
              </button>
              <button
                type="button"
                onClick={() => setSpendViewMode("project")}
                className={cn(
                  "rounded-md px-2 py-0.5 text-[10px] font-bold transition-all",
                  spendViewMode === "project"
                    ? "bg-white text-[#0B1457] shadow-2xs"
                    : "text-[#64748B] hover:text-[#0B1457]",
                )}
              >
                Project
              </button>
            </div>

            <span className="text-[11px] font-bold text-[#0001FF]">
              {spendViewMode === "category" ? (committed > 0 ? "Committed Spend" : "Q3 Allocation") : `${projectBreakdown.length} Sites`}
            </span>
          </div>

          {/* Breakdown Items */}
          <div className="my-2.5 space-y-2.5">
            {spendViewMode === "category" ? (
              committed === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-xs font-semibold text-[#111315]">₦ 0.00 Total Category Spend</p>
                  <p className="text-[11px] text-[#9CA3AF] mt-1">No committed purchase orders logged yet.</p>
                </div>
              ) : (
                CATEGORY_BREAKDOWN.map((cat, idx) => (
                  <div key={idx} className="group cursor-default">
                    <div className="flex justify-between items-baseline text-xs">
                      <span className="font-medium text-[#111315]">{cat.name}</span>
                      <div className="flex items-center gap-1.5 font-mono text-[11px] tabular-nums">
                        <span className="font-bold text-[#0B1457]">{money(cat.amount)}</span>
                        <span className="text-[#9CA3AF]">({Math.round(cat.share * 100)}%)</span>
                      </div>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-[#F3F4F6] overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.round(cat.share * 100)}%` }}
                        transition={{ duration: 0.8, delay: idx * 0.1, ease: "easeOut" }}
                        className={cn("h-1.5 rounded-full", cat.color)}
                      />
                    </div>
                  </div>
                ))
              )
            ) : (
              projectBreakdown.length === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-xs font-semibold text-[#111315]">No sites configured</p>
                  <Link to="/projects" className="text-[11px] font-bold text-[#0001FF] hover:underline mt-1 inline-block">
                    + Add Project / Cost Center
                  </Link>
                </div>
              ) : (
                projectBreakdown.slice(0, 4).map((proj: any, idx: number) => (
                  <div
                    key={proj.id}
                    onClick={() => setSelectedDrilldownProject(proj)}
                    className="group cursor-pointer rounded-lg p-1.5 -mx-1.5 hover:bg-[#F8FAFC] transition-all"
                    title="Click to view detailed project spend breakdown"
                  >
                    <div className="flex justify-between items-baseline text-xs">
                      <div className="flex items-center gap-1 truncate max-w-[140px]">
                        <span className="font-medium text-[#111315] truncate group-hover:text-[#0001FF] transition-colors">
                          {proj.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 font-mono text-[11px] tabular-nums shrink-0">
                        <span className="font-bold text-[#0B1457]">{money(proj.committed)}</span>
                        <span className="text-[10px] font-semibold text-[#64748B]">
                          ({proj.utilization}%)
                        </span>
                      </div>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-[#F3F4F6] overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(4, proj.utilization)}%` }}
                        transition={{ duration: 0.8, delay: idx * 0.1, ease: "easeOut" }}
                        className={cn(
                          "h-1.5 rounded-full",
                          proj.utilization > 75
                            ? "bg-[#EF4444]"
                            : proj.utilization > 50
                              ? "bg-[#F59E0B]"
                              : "bg-[#0001FF]",
                        )}
                      />
                    </div>
                  </div>
                ))
              )
            )}
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-[#F3F4F6] text-[10px] text-[#9CA3AF]">
            <span>Derived from active purchase orders</span>
            {projectBreakdown.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedDrilldownProject(projectBreakdown[0] || null)}
                className="flex items-center gap-0.5 font-bold text-[#0001FF] hover:underline"
              >
                <span>Drilldown</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
        </motion.section>
      </motion.div>

      {/* Row 2: Key Financial Metric Cards */}
      <motion.div variants={staggerContainer} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card A: Committed Spend */}
        <motion.div
          variants={itemFadeIn}
          whileHover={{ y: -3 }}
          transition={{ duration: 0.18 }}
          className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-xs cursor-default"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
              Total Committed Spend
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F3F4F6] text-[#111315]">
              <CreditCard className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="mt-3 font-sans text-2xl font-extrabold text-[#111315]">
            {money(committed, "NGN")}
          </p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-[#9CA3AF]">Across {allPOs.length} issued PO(s)</span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
              Live
            </span>
          </div>
        </motion.div>

        {/* Card B: Total In Approval Pipeline */}
        <motion.div
          variants={itemFadeIn}
          whileHover={{ y: -3 }}
          transition={{ duration: 0.18 }}
          className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-xs cursor-default"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
              Total In Approval
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F3F4F6] text-[#111315]">
              <Wallet className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="mt-3 font-sans text-2xl font-extrabold text-[#111315]">
            {money(inApprovalAmount, "NGN")}
          </p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-[#9CA3AF]">{awaiting} requisitions pending</span>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600">
              {awaiting > 0 ? "Pending" : "Clear"}
            </span>
          </div>
        </motion.div>

        {/* Card C: Waiting On You */}
        <motion.div
          variants={itemFadeIn}
          whileHover={{ y: -3 }}
          transition={{ duration: 0.18 }}
          className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-xs cursor-default"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
              Waiting On You
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F3F4F6] text-[#111315]">
              <Clock className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="mt-3 font-sans text-2xl font-extrabold text-[#111315]">{myPending}</p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-[#9CA3AF]">Assigned to your role</span>
            {myPending > 0 ? (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600 animate-pulse">
                Action Required
              </span>
            ) : (
              <span className="text-[10px] font-medium text-emerald-600">Clear</span>
            )}
          </div>
        </motion.div>

        {/* Card D: Purchase Orders Issued */}
        <motion.div
          variants={itemFadeIn}
          whileHover={{ y: -3 }}
          transition={{ duration: 0.18 }}
          className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-xs cursor-default"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
              Purchase Orders
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F3F4F6] text-[#111315]">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="mt-3 font-sans text-2xl font-extrabold text-[#111315]">
            {data?.purchaseOrders.length ?? 0}
          </p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-[#9CA3AF]">Issued to verified suppliers</span>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600">
              Active
            </span>
          </div>
        </motion.div>
      </motion.div>

      {/* Row 3: Executive Governance Risk Alerts */}
      {canViewGovernance && splitAnomalies.length > 0 ? (
        <motion.section
          variants={itemFadeIn}
          className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-ping" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                Executive Governance & Anti-Fraud Suite ({splitAnomalies.length})
              </h2>
            </div>
            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
              Compliance Review
            </span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {splitAnomalies.map((anomaly) => (
              <motion.div
                key={anomaly.id}
                whileHover={{ y: -2 }}
                className="rounded-lg border border-amber-200/70 bg-white p-3.5 shadow-xs transition-shadow hover:shadow-md"
              >
                <p className="text-xs font-bold text-[#111315]">{anomaly.title}</p>
                <p className="mt-1 text-xs text-[#6B7280]">{anomaly.description}</p>
                <div className="mt-2.5 flex items-center justify-between border-t border-amber-100 pt-2 text-xs">
                  <span className="text-[11px] font-semibold text-amber-700">
                    Severity: {anomaly.severity}
                  </span>
                  <Link
                    to="/approvals"
                    className="text-xs font-semibold text-[#111315] hover:underline"
                  >
                    Inspect trail →
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>
      ) : null}

      {/* Row 4: Waiting on You Action Cards */}
      {canApprove && myPending > 0 ? (
        <motion.section
          variants={itemFadeIn}
          className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#111315]">
                Waiting on You ({myPending})
              </h2>
              <p className="text-xs text-[#6B7280]">Approvals requiring your authorization</p>
            </div>
            <Button
              asChild
              variant="outline"
              className="h-8 rounded-lg border-[#E5E7EB] text-xs font-semibold"
            >
              <Link to="/approvals">View All Approvals</Link>
            </Button>
          </div>

          <motion.div variants={staggerContainer} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {myPendingSteps.slice(0, 6).map((s: any) => {
              const req = (s.requisitions as {
                id: string;
                title: string;
                reference: string;
                total_amount: number;
                currency: "NGN" | "USD";
              }) ?? {
                id: "",
                title: "—",
                reference: "—",
                total_amount: 0,
                currency: "NGN" as const,
              };
              return (
                <motion.div
                  key={s.id}
                  variants={itemFadeIn}
                  whileHover={{ y: -2 }}
                  transition={{ duration: 0.2 }}
                >
                  <Link
                    to="/approvals"
                    className="group block rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3.5 transition-all hover:border-[#111315] hover:bg-white hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between">
                      <p className="truncate text-xs font-bold text-[#111315] group-hover:text-black">
                        {req.title}
                      </p>
                      <span className="text-[10px] font-semibold uppercase text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                        {ROLE_LABELS[s.required_role] ?? s.required_role}
                      </span>
                    </div>
                    <p className="mt-2 font-mono text-[11px] text-[#6B7280]">
                      {req.reference} ·{" "}
                      <span className="font-bold text-[#111315]">
                        {money(req.total_amount, req.currency)}
                      </span>
                    </p>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-[#9CA3AF]">
                      <span>1-Click Authorization</span>
                      <span className="font-medium text-[#111315] group-hover:underline">
                        Review →
                      </span>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        </motion.section>
      ) : null}

      {/* Row 5: Admin Logs / Main Procurement Activity Table */}
      <motion.section
        variants={itemFadeIn}
        className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-xs"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#111315]">
              Admin Logs & Recent Requisitions
            </h2>
            <p className="text-xs text-[#6B7280]">Real-time operational activity log</p>
          </div>

          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#374151] hover:bg-[#F9FAFB] transition-colors">
              <Filter className="h-3.5 w-3.5 text-[#9CA3AF]" /> Filter
            </button>
            <Button
              asChild
              variant="outline"
              className="h-8 rounded-lg border-[#E5E7EB] text-xs font-semibold"
            >
              <Link to="/requisitions">View All</Link>
            </Button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-[#E5E7EB]">
          {isLoading ? (
            <p className="p-6 text-center text-xs text-[#6B7280]">Loading activity logs…</p>
          ) : !filteredRequisitions.length ? (
            <EmptyState
              title="No procurement activity logged yet"
              body="When site teams raise requisitions or issue POs, all transactions appear here in real time."
              action={
                <Button
                  asChild
                  className="h-9 rounded-lg bg-[#111315] text-xs font-semibold text-white hover:bg-[#202428] transition-colors"
                >
                  <Link to="/requisitions/new">Raise First Request</Link>
                </Button>
              }
            />
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F9FAFB] text-[11px] font-semibold text-[#6B7280]">
                <tr>
                  <th className="w-10 px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      className="rounded border-[#D1D5DB]"
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-3 py-3">Full Name / Ref</th>
                  <th className="px-3 py-3">Description / Title</th>
                  <th className="px-3 py-3">Value</th>
                  <th className="hidden px-3 py-3 sm:table-cell">Action Type</th>
                  <th className="hidden px-3 py-3 md:table-cell">Date Created</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {filteredRequisitions.map((r: any, idx: number) => (
                  <motion.tr
                    key={r.id}
                    variants={itemFadeIn}
                    className="hover:bg-[#F9FAFB]/90 transition-colors"
                  >
                    <td className="px-3 py-3.5 text-center">
                      <input
                        type="checkbox"
                        className="rounded border-[#D1D5DB]"
                        aria-label={`Select ${r.reference}`}
                      />
                    </td>
                    <td className="px-3 py-3.5 font-medium text-[#111315]">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#111315] text-[10px] font-bold text-white uppercase">
                          {r.reference.slice(-2)}
                        </div>
                        <span className="font-mono">{r.reference}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 max-w-[200px] truncate text-[#374151]">{r.title}</td>
                    <td className="px-3 py-3.5 font-semibold tabular-nums text-[#111315]">
                      {money(r.total_amount, r.currency)}
                    </td>
                    <td className="hidden px-3 py-3.5 sm:table-cell">
                      <span className="inline-flex items-center gap-1 text-[11px] text-[#6B7280]">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Requisition Log
                      </span>
                    </td>
                    <td className="hidden px-3 py-3.5 md:table-cell text-[#6B7280]">
                      {shortDate(r.created_at)}
                    </td>
                    <td className="px-3 py-3.5">
                      <StatusPill status={r.status} label={STATUS_LABELS[r.status]} />
                    </td>
                    <td className="px-3 py-3.5 text-right">
                      <Link
                        to="/requisitions/$id"
                        params={{ id: r.id }}
                        className="inline-flex items-center gap-1 rounded-md bg-[#111315] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#262A30] transition-colors"
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </motion.section>

      {/* Row 6: Workspace Setup Tasks */}
      {me.data?.roles.includes("admin") ? (
        <motion.section
          variants={itemFadeIn}
          className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#111315]">
                Workspace Readiness Checklist
              </h2>
              <p className="text-xs text-[#6B7280]">Key configuration steps for your team</p>
            </div>
            <span className="text-xs font-semibold text-[#111315]">
              {(data?.projectCount ? 1 : 0) +
                (data?.memberCount ? 1 : 0) +
                (data?.supplierCount ? 1 : 0) +
                (data?.requisitions.length ? 1 : 0)}{" "}
              / 4 Complete
            </span>
          </div>

          <motion.ul variants={staggerContainer} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ChecklistItem
              done={(data?.projectCount ?? 0) > 0}
              label="Add Project / Cost Center"
              hint="Every requisition belongs to a site."
              to="/projects"
            />
            <ChecklistItem
              done={(data?.memberCount ?? 0) > 1}
              label="Invite Teammates"
              hint="Assign roles under Settings."
              to="/settings"
            />
            <ChecklistItem
              done={(data?.supplierCount ?? 0) > 0}
              label="Add Supplier Registry"
              hint="Invite suppliers to digital RFQs."
              to="/suppliers"
            />
            <ChecklistItem
              done={(data?.requisitions.length ?? 0) > 0}
              label="Submit Test Requisition"
              hint="Test the full field-to-PO flow."
              to="/requisitions/new"
            />
          </motion.ul>
        </motion.section>
      ) : null}

      {/* Row 7: Project Spend & Cost Drilldown Modal */}
      <Dialog
        open={!!selectedDrilldownProject}
        onOpenChange={(open) => !open && setSelectedDrilldownProject(null)}
      >
        <DialogContent className="max-w-3xl rounded-2xl p-6 bg-white border border-[#E2E8F0] shadow-xl">
          <DialogHeader className="space-y-1 text-left">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-[#EFF3FF] px-2 py-0.5 text-[10px] font-extrabold text-[#0001FF]">
                Project Spend Drilldown
              </span>
              <span className="text-xs text-[#64748B] font-medium">{selectedDrilldownProject?.location}</span>
            </div>
            <DialogTitle className="text-lg font-bold text-[#0B1457]">
              {selectedDrilldownProject?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#4B556D]">
              Real-time commitment breakdown, approved purchase orders, and remaining budgetary allowance.
            </DialogDescription>
          </DialogHeader>

          {selectedDrilldownProject && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-5 pt-2"
            >
              {/* Top Financial Stat Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Committed Spend</p>
                  <p className="font-mono text-base font-extrabold text-[#0B1457] tabular-nums">
                    {money(selectedDrilldownProject.committed)}
                  </p>
                  <p className="text-[10px] font-bold text-[#10B981]">
                    {selectedDrilldownProject.budget > 0
                      ? `${selectedDrilldownProject.utilization}% of total budget`
                      : "Uncapped Budget"}
                  </p>
                </div>
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Allocated Budget</p>
                  <p className="font-mono text-base font-extrabold text-[#0B1457] tabular-nums">
                    {selectedDrilldownProject.budget > 0 ? money(selectedDrilldownProject.budget) : "₦ 0.00"}
                  </p>
                  <p className="text-[10px] text-[#64748B]">Approved Capex</p>
                </div>
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Remaining Budget</p>
                  <p className="font-mono text-base font-extrabold text-[#0001FF] tabular-nums">
                    {selectedDrilldownProject.budget > 0 ? money(selectedDrilldownProject.remaining) : "—"}
                  </p>
                  <p className="text-[10px] font-bold text-[#0001FF]">
                    {selectedDrilldownProject.budget > 0 ? "Available to commit" : "No budget limit"}
                  </p>
                </div>
              </div>

              {/* Progress Utilization */}
              {selectedDrilldownProject.budget > 0 && (
                <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 space-y-2">
                  <div className="flex justify-between text-xs font-bold text-[#0B1457]">
                    <span>Budget Consumption Velocity</span>
                    <span className="font-mono tabular-nums">{selectedDrilldownProject.utilization}% Utilized</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-[#F1F5F9] overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, selectedDrilldownProject.utilization)}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className="h-full bg-gradient-to-r from-[#0001FF] to-[#0B1457] rounded-full"
                    />
                  </div>
                </div>
              )}

              {/* Real Purchase Orders Ledger for this Project */}
              <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#0B1457]">
                    Active Purchase Orders on this Site ({selectedDrilldownProject.purchaseOrders.length})
                  </p>
                  <span className="text-[10px] font-semibold text-[#64748B]">
                    Committed Total: {money(selectedDrilldownProject.committed)}
                  </span>
                </div>

                {selectedDrilldownProject.purchaseOrders.length === 0 ? (
                  <div className="p-4 rounded-lg bg-white border border-[#E2E8F0] text-center">
                    <p className="text-xs font-semibold text-[#111315]">No purchase orders issued yet for this site</p>
                    <p className="text-[11px] text-[#64748B] mt-1">
                      Committed spend will reflect automatically once purchase orders are issued to verified suppliers.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-[#E2E8F0] bg-white">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F8FAFC] text-[10px] font-bold uppercase text-[#64748B]">
                        <tr>
                          <th className="px-3 py-2">PO Ref</th>
                          <th className="px-3 py-2">Supplier</th>
                          <th className="px-3 py-2">Issued</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2 text-right">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        {selectedDrilldownProject.purchaseOrders.map((po: any) => (
                          <tr key={po.id} className="hover:bg-[#F8FAFC]/70">
                            <td className="px-3 py-2.5 font-mono font-bold text-[#0001FF]">
                              <Link to="/purchase-orders" className="hover:underline">
                                {po.po_number || po.id.slice(0, 8)}
                              </Link>
                            </td>
                            <td className="px-3 py-2.5 text-[#111315]">
                              {po.suppliers?.name || "Verified Vendor"}
                            </td>
                            <td className="px-3 py-2.5 text-[#64748B]">
                              {po.issued_at ? shortDate(po.issued_at) : "—"}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase bg-emerald-50 text-emerald-700">
                                {po.status || "issued"}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-bold text-[#0B1457] tabular-nums">
                              {money(po.total_amount, po.settlement_currency || "NGN")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-[#64748B]">
                  {selectedDrilldownProject.requisitions.length} requisition(s) linked to this site
                </span>
                <div className="flex items-center gap-2">
                  <Button asChild variant="outline" className="h-9 rounded-xl border-[#E2E8F0] text-xs font-semibold">
                    <Link to="/requisitions/new">
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      New Requisition
                    </Link>
                  </Button>
                  <Button asChild className="h-9 rounded-xl bg-[#0001FF] px-4 text-xs font-bold text-white hover:bg-[#0B1457] shadow-xs">
                    <Link to="/projects">
                      <span>Projects Hub</span>
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

function ChecklistItem({
  done,
  label,
  hint,
  to,
}: {
  done: boolean;
  label: string;
  hint: string;
  to: string;
}) {
  return (
    <motion.li
      variants={itemFadeIn}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.18 }}
      className={cn(
        "rounded-lg border p-3.5 transition-all",
        done ? "border-[#E5E7EB] bg-[#F9FAFB]" : "border-[#E5E7EB] bg-white",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            "grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold",
            done ? "bg-[#111315] text-white" : "border border-[#D1D5DB] text-transparent",
          )}
          aria-hidden
        >
          ✓
        </div>
        <div className="min-w-0">
          <Link to={to} className="text-xs font-bold text-[#111315] hover:underline">
            {label}
          </Link>
          <p className="mt-0.5 text-[11px] text-[#6B7280]">{hint}</p>
        </div>
      </div>
    </motion.li>
  );
}
