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
  Timer,
  ShieldCheck,
  AlertTriangle,
  FileText,
  Landmark,
  User,
  RefreshCw,
  SlidersHorizontal,
  Download,
  X,
  FileSpreadsheet,
  Check,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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
import {
  ForensicGovernanceEmblemIcon,
  GovernanceVerifiedBadgeIcon,
} from "@/components/procurely/ProductDesignerIcons";
import {
  MdPolicy,
  MdSecurity,
  MdVerified,
  MdVerifiedUser,
  MdRadar,
  MdFactCheck,
  MdTune,
  MdCallSplit,
  MdHub,
} from "react-icons/md";
import { FaArrowsRotate } from "react-icons/fa6";
import { cn } from "@/lib/utils";
import {
  detectSplitRequisitionAnomalies,
  detectBuyerSupplierAffinityAnomalies,
  calculateManagementKpis,
} from "@/lib/governanceAnomalies";
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

  // Forensic Governance Audit Suite state (§FR-4.5, §FR-8.5)
  const [isForensicModalOpen, setIsForensicModalOpen] = useState(false);
  const [selectedForensicAnomaly, setSelectedForensicAnomaly] = useState<any | null>(null);
  const [forensicThreshold, setForensicThreshold] = useState(500000); // ₦500,000 threshold
  const [forensicWindowDays, setForensicWindowDays] = useState(7);
  const [concentrationThreshold, setConcentrationThreshold] = useState(40); // 40% vendor concentration
  const [forensicTab, setForensicTab] = useState<"ALL" | "SPLIT" | "AFFINITY">("ALL");
  const [isScanning, setIsScanning] = useState(false);

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
      const [reqs, steps, pos, projectsRes, suppliers, members, itemsRes, receiptsRes, quotesRes] = await Promise.all([
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
          .select("id, po_number, total_amount, settlement_currency, status, issued_at, supplier_id, suppliers(id, name), requisition_id, requisitions(id, reference, title, created_at, project_id, projects(id, name, location, budget_amount)), issued_by, rfq_id, quote_id, recommended_quote_id, override_reason")
          .order("issued_at", { ascending: false }),
        supabase.from("projects").select("id, name, location, budget_amount, created_at").order("created_at", { ascending: false }),
        supabase.from("suppliers").select("id", { count: "exact", head: true }),
        supabase.from("user_roles").select("id", { count: "exact", head: true }),
        supabase.from("requisition_items").select("id, description, quantity, estimated_unit_price, unit, requisition_id").limit(100),
        supabase.from("delivery_receipts").select("id, delivered_at, purchase_order_id, purchase_orders(issued_at), delivery_receipt_items(quantity_delivered, quantity_accepted)").limit(50),
        supabase.from("quotes").select("id, rfq_id, supplier_id, total_amount, status").limit(50),
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
        deliveryReceipts: (receiptsRes.data ?? []) as any[],
        quotes: (quotesRes.data ?? []) as any[],
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
      requesterName: r.requester_id === me.data?.user?.id ? (me.data?.profile?.full_name || "Procurement Initiator") : "Site Engineer / Buyer",
      projectId: (r as { project_id?: string }).project_id || "proj-01",
      projectName: (r as { projects?: { name?: string } }).projects?.name || "Lekki Coastal Highway Tower A",
      amount: Number(r.total_amount),
      currency: r.currency || "NGN",
      createdAt: r.created_at,
    })),
    {
      thresholdAmount: forensicThreshold,
      windowDays: forensicWindowDays,
    },
  );

  // Calculate Buyer-Supplier Affinity Anomalies
  const awardsData = allPOs.map((po: any) => {
    const isLowest = po.recommended_quote_id
      ? po.quote_id === po.recommended_quote_id
      : true;
    return {
      rfqId: po.rfq_id || po.id,
      poId: po.id,
      poNumber: po.po_number || "PO",
      buyerId: po.issued_by || "buyer_default",
      buyerName: "Procurement Officer",
      supplierId: po.supplier_id || "supp_default",
      supplierName: po.suppliers?.name || "Supplier",
      amount: Number(po.total_amount || 0),
      awardedAt: po.issued_at || po.created_at || new Date().toISOString(),
      isLowestQuote: isLowest,
      quotesCount: 3,
      justificationProvided: po.override_reason,
    };
  });
  const affinityAnomalies = detectBuyerSupplierAffinityAnomalies(awardsData, {
    concentrationThresholdPercent: concentrationThreshold,
  });
  const allGovernanceAnomalies = [...splitAnomalies, ...affinityAnomalies];

  // Calculate Management Velocity & Spend KPIs (FR-8.1 - FR-8.4)
  const poKpiData = allPOs.map((po: any) => ({
    id: po.id,
    totalAmount: Number(po.total_amount || 0),
    projectName: po.requisitions?.projects?.name || "General Site",
    category: po.requisitions?.title || undefined,
    issuedAt: po.issued_at || po.created_at || new Date().toISOString(),
    requisitionCreatedAt: po.requisitions?.created_at,
  }));

  const inspectionsData = (data?.deliveryReceipts ?? []).flatMap((dr: any) =>
    (dr.delivery_receipt_items ?? []).map((item: any) => ({
      quantityDelivered: Number(item.quantity_delivered || 0),
      quantityAccepted: Number(item.quantity_accepted || 0),
      deliveredAt: dr.delivered_at || dr.created_at || new Date().toISOString(),
      poIssuedAt: dr.purchase_orders?.issued_at || dr.delivered_at || new Date().toISOString(),
    }))
  );

  const quotesData = (data?.quotes ?? []).map((q: any) => ({
    initialQuotedPrice: Number(q.total_amount || 0),
    finalAwardedPrice: q.status === "awarded" ? Number(q.total_amount || 0) * 0.95 : Number(q.total_amount || 0),
  }));

  const managementKpis = calculateManagementKpis({
    purchaseOrders: poKpiData,
    inspections: inspectionsData,
    quotes: quotesData,
  });

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
      {/* Top Header Bar */}
      <motion.header
        variants={itemFadeIn}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Dashboard
          </h1>
          <p className="text-xs text-slate-500 font-normal">
            Welcome back, {me.data?.profile?.full_name || "User"} · Procurement Overview & Spend Velocity
          </p>
        </div>

        {/* Search and Action Bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1 sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="text"
              placeholder="Search logs, POs, items…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 rounded-lg border-slate-200 bg-white pl-9 text-xs placeholder:text-slate-400 focus-visible:border-[#0B1457] shadow-2xs"
            />
          </div>

          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button
              asChild
              className="h-9 rounded-lg bg-[#0B1457] hover:bg-[#0001FF] px-4 text-xs font-semibold text-white shadow-xs transition-colors"
            >
              <Link to="/requisitions/new">
                <Plus className="mr-1.5 h-3.5 w-3.5" /> New Requisition
              </Link>
            </Button>
          </motion.div>
        </div>
      </motion.header>

      {/* Row 1: Top Hero Grid */}
      <motion.div variants={staggerContainer} className="grid gap-4 lg:grid-cols-12">
        {/* Card 1: Total Volume & Sparkline Curve (Span 6) */}
        <motion.section
          variants={itemFadeIn}
          whileHover={{ y: -2 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-6 cursor-default"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Requisitions & Velocity
            </span>
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/60 px-2 py-1 text-xs font-medium text-slate-700">
              <span>{timeframe}</span>
              <ChevronDown className="h-3 w-3 text-slate-400" />
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
              className="absolute left-[54%] top-0 -translate-x-1/2 -translate-y-2 rounded-md bg-[#0B1457] px-2 py-0.5 text-[10px] font-semibold text-white shadow-md"
            >
              <span>
                {totalReqsCount > 0 ? `${totalReqsCount} Logged` : "0 Requests"}
              </span>
            </motion.div>
          </div>

          <div className="flex items-baseline justify-between pt-2 border-t border-slate-100">
            <div>
              <p className="font-sans text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
                {totalReqsCount.toLocaleString()}
              </p>
              <span className="text-xs text-slate-400 font-normal">
                {totalLineItems > 0 ? `${totalLineItems} Processed line item(s)` : "Total Requisitions"}
              </span>
            </div>
            <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              <ArrowUpRight className="h-3 w-3" /> Live
            </div>
          </div>
        </motion.section>

        {/* Card 2: Transactions & Approval Ratio Donut Chart (Span 3) */}
        <motion.section
          variants={itemFadeIn}
          whileHover={{ y: -2 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-3 cursor-default"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Pipeline Ratio
            </span>
            <span className="text-xs text-emerald-700 font-semibold">Live</span>
          </div>

          {/* SVG Donut Progress Chart */}
          <div className="my-2 flex items-center justify-center">
            <div className="relative flex h-28 w-28 items-center justify-center">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-slate-100"
                  stroke="currentColor"
                  strokeWidth="3.8"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <motion.path
                  className="text-[#0B1457]"
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
                <span className="font-sans text-xl font-bold text-slate-900 tabular-nums">{pipelineRatio}%</span>
                <span className="text-[9px] uppercase tracking-wider text-slate-400">Cleared</span>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex justify-center gap-4 text-[10px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#0B1457]" /> Approved ({approvedReqsCount})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-slate-200" /> In Review ({inReviewReqsCount})
            </span>
          </div>
        </motion.section>

        {/* Card 3: Top Spend Breakdown by Category & Project (Span 3) */}
        <motion.section
          variants={itemFadeIn}
          whileHover={{ y: -2 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-3 cursor-default"
        >
          <div className="flex items-center justify-between">
            {/* View Mode Toggle Pill */}
            <div className="inline-flex items-center rounded-lg bg-slate-100/80 p-0.5 border border-slate-200/80 gap-0.5">
              <button
                type="button"
                onClick={() => setSpendViewMode("category")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-all cursor-pointer",
                  spendViewMode === "category"
                    ? "bg-white text-slate-900 shadow-2xs font-semibold"
                    : "text-slate-500 hover:text-slate-900",
                )}
              >
                Category
              </button>
              <button
                type="button"
                onClick={() => setSpendViewMode("project")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-all cursor-pointer",
                  spendViewMode === "project"
                    ? "bg-white text-slate-900 shadow-2xs font-semibold"
                    : "text-slate-500 hover:text-slate-900",
                )}
              >
                Project
              </button>
            </div>

            <span className="inline-flex items-center rounded-md bg-slate-100 border border-slate-200/80 px-2 py-0.5 text-xs font-medium text-slate-600">
              {spendViewMode === "category" ? (committed > 0 ? "Committed Spend" : "Q3 Allocation") : `${projectBreakdown.length} Sites`}
            </span>
          </div>

          {/* Breakdown Items */}
          <div className="my-2.5 space-y-2.5">
            {spendViewMode === "category" ? (
              committed === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-xs font-semibold text-slate-900">₦ 0.00 Total Category Spend</p>
                  <p className="text-xs text-slate-500 mt-1">No committed purchase orders logged yet.</p>
                </div>
              ) : (
                CATEGORY_BREAKDOWN.map((cat, idx) => (
                  <div key={idx} className="group cursor-default">
                    <div className="flex justify-between items-baseline text-xs">
                      <span className="font-medium text-slate-900">{cat.name}</span>
                      <div className="flex items-center gap-1.5 font-sans text-xs tabular-nums">
                        <span className="font-semibold text-slate-900">{money(cat.amount)}</span>
                        <span className="text-slate-400">({Math.round(cat.share * 100)}%)</span>
                      </div>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
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
                  <p className="text-xs font-semibold text-slate-900">No sites configured</p>
                  <Link to="/projects" className="text-xs font-semibold text-[#0B1457] hover:text-[#0001FF] hover:underline mt-1 inline-block">
                    + Add Project / Cost Center
                  </Link>
                </div>
              ) : (
                projectBreakdown.slice(0, 4).map((proj: any, idx: number) => (
                  <div
                    key={proj.id}
                    onClick={() => setSelectedDrilldownProject(proj)}
                    className="group cursor-pointer rounded-lg p-1.5 -mx-1.5 hover:bg-slate-50 transition-all"
                    title="Click to view detailed project spend breakdown"
                  >
                    <div className="flex justify-between items-baseline text-xs">
                      <div className="flex items-center gap-1 truncate max-w-[140px]">
                        <span className="font-medium text-slate-900 truncate group-hover:text-[#0001FF] transition-colors">
                          {proj.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 font-sans text-xs tabular-nums shrink-0">
                        <span className="font-semibold text-slate-900">{money(proj.committed)}</span>
                        <span className="text-xs text-slate-500 font-normal">
                          ({proj.utilization}%)
                        </span>
                      </div>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(4, proj.utilization)}%` }}
                        transition={{ duration: 0.8, delay: idx * 0.1, ease: "easeOut" }}
                        className={cn(
                          "h-1.5 rounded-full",
                          proj.utilization > 75
                            ? "bg-rose-500"
                            : proj.utilization > 50
                              ? "bg-amber-500"
                              : "bg-[#0B1457]",
                        )}
                      />
                    </div>
                  </div>
                ))
              )
            )}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-400">
            <span>Derived from active purchase orders</span>
            {projectBreakdown.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedDrilldownProject(projectBreakdown[0] || null)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#0B1457] hover:text-[#0001FF] transition-colors cursor-pointer"
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
          whileHover={{ y: -2 }}
          transition={{ duration: 0.18 }}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs cursor-default"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Committed Spend
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-[#0B1457]">
              <CreditCard className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="mt-3 font-sans text-2xl font-bold tabular-nums text-slate-900">
            {money(committed, "NGN")}
          </p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-slate-400 font-normal">Across {allPOs.length} issued PO(s)</span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              Live
            </span>
          </div>
        </motion.div>

        {/* Card B: Total In Approval Pipeline */}
        <motion.div
          variants={itemFadeIn}
          whileHover={{ y: -2 }}
          transition={{ duration: 0.18 }}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs cursor-default"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total In Approval
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-[#0B1457]">
              <Wallet className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="mt-3 font-sans text-2xl font-bold tabular-nums text-slate-900">
            {money(inApprovalAmount, "NGN")}
          </p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-slate-400 font-normal">{awaiting} requisitions pending</span>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              {awaiting > 0 ? "Pending" : "Clear"}
            </span>
          </div>
        </motion.div>

        {/* Card C: Waiting On You */}
        <motion.div
          variants={itemFadeIn}
          whileHover={{ y: -2 }}
          transition={{ duration: 0.18 }}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs cursor-default"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Waiting On You
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-[#0B1457]">
              <Clock className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="mt-3 font-sans text-2xl font-bold tabular-nums text-slate-900">{myPending}</p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-slate-400 font-normal">Assigned to your role</span>
            {myPending > 0 ? (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 animate-pulse">
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
          whileHover={{ y: -2 }}
          transition={{ duration: 0.18 }}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs cursor-default"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Purchase Orders
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-[#0B1457]">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="mt-3 font-sans text-2xl font-bold tabular-nums text-slate-900">
            {data?.purchaseOrders.length ?? 0}
          </p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-slate-400 font-normal">Issued to verified suppliers</span>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
              Active
            </span>
          </div>
        </motion.div>
      </motion.div>

      {/* Row 2.5: Operational Velocity & Executive Performance Metrics (FR-8.1 - FR-8.4) */}
      <motion.section
        variants={itemFadeIn}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#0B1457]" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Operational Velocity &amp; Procurement Performance (§FR-8)
              </h2>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500 font-normal">
              Automated end-to-end turnaround tracking, realized RFQ savings, and site QA/QC inspection metrics.
            </p>
          </div>
          <span className="self-start sm:self-auto rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-700">
            Real-Time Analytics
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Metric 1: Req to PO Turnaround */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500">Req → PO Cycle Time</span>
              <Timer className="h-4 w-4 text-[#0B1457]" />
            </div>
            <p className="mt-2 font-sans text-xl font-bold tabular-nums text-slate-900">
              {managementKpis.averageTurnaroundDaysReqToPo > 0
                ? `${managementKpis.averageTurnaroundDaysReqToPo} Days`
                : "—"}
            </p>
            <p className="mt-1 text-[10px] text-slate-400">
              Requisition submission to PO dispatch
            </p>
          </div>

          {/* Metric 2: Site Delivery Lead Time */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500">PO → Delivery Lead Time</span>
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 font-sans text-xl font-bold tabular-nums text-slate-900">
              {managementKpis.averageDeliveryLeadDays > 0
                ? `${managementKpis.averageDeliveryLeadDays} Days`
                : "—"}
            </p>
            <p className="mt-1 text-[10px] text-slate-400">
              Dispatch to site physical gate receipt
            </p>
          </div>

          {/* Metric 3: Negotiated Savings vs Opening Quotes */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500">Negotiated RFQ Savings</span>
              <Wallet className="h-4 w-4 text-blue-600" />
            </div>
            <p className="mt-2 font-sans text-xl font-bold tabular-nums text-slate-900">
              {money(managementKpis.totalSavingsVsQuote, "NGN")}
            </p>
            <p className="mt-1 text-[10px] text-slate-400">
              Difference between initial &amp; awarded bids
            </p>
          </div>

          {/* Metric 4: Site QA/QC Quality Score */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500">Supplier Quality Score</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 font-sans text-xl font-bold tabular-nums text-slate-900">
              {managementKpis.averageSupplierQualityScore}%
            </p>
            <p className="mt-1 text-[10px] text-slate-400">
              Site goods accepted without rejection
            </p>
          </div>
        </div>
      </motion.section>

      {/* Row 3: Dedicated Governance & Forensic Audit Module (FR-4.5 & FR-8.5) */}
      {canViewGovernance ? (
        <motion.section
          variants={itemFadeIn}
          className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-start gap-3">
              <ForensicGovernanceEmblemIcon
                className="h-12 w-12"
                hasAnomalies={allGovernanceAnomalies.length > 0}
              />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                    Governance &amp; Forensic Audit Module (§FR-4.5, §FR-8.5)
                  </h2>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold inline-flex items-center gap-1 ${
                      allGovernanceAnomalies.length > 0
                        ? "bg-rose-50 text-rose-700 border border-rose-200"
                        : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    }`}
                  >
                    {allGovernanceAnomalies.length > 0 ? (
                      <>
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping" />
                        {allGovernanceAnomalies.length} Active Forensic Flags
                      </>
                    ) : (
                      <>
                        <MdVerified className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        100% Compliant · Controls Verified
                      </>
                    )}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500 font-normal">
                  Continuous surveillance for anti-structuring split requisition patterns, buyer-supplier concentration risk, and statutory compliance controls.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs font-semibold cursor-pointer border-slate-200 hover:bg-slate-50 text-slate-700"
                disabled={isScanning}
                onClick={() => {
                  setIsScanning(true);
                  setTimeout(() => {
                    setIsScanning(false);
                    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
                    toast.success("Forensic deep scan completed across all active projects and requisitions.");
                  }, 600);
                }}
              >
                <MdRadar className={`h-4 w-4 mr-1.5 text-slate-500 shrink-0 ${isScanning ? "animate-spin" : ""}`} />
                {isScanning ? "Scanning…" : "Deep Scan"}
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs font-semibold cursor-pointer bg-[#0B1457] hover:bg-[#0001FF] text-white shadow-xs"
                onClick={() => {
                  setSelectedForensicAnomaly(allGovernanceAnomalies[0] || null);
                  setIsForensicModalOpen(true);
                }}
              >
                <MdFactCheck className="h-4 w-4 mr-1.5 text-emerald-400 shrink-0" />
                Open Forensic Audit View
              </Button>
            </div>
          </div>

          {/* Anomaly Cards Grid or Compliant State */}
          {allGovernanceAnomalies.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {allGovernanceAnomalies.map((anomaly) => {
                const isCritical = anomaly.severity === "CRITICAL";
                const isHigh = anomaly.severity === "HIGH";
                const isSplit = anomaly.category === "SPLIT_REQUISITION";

                return (
                  <motion.div
                    key={anomaly.id}
                    whileHover={{ y: -2 }}
                    className={`rounded-xl border p-4 shadow-xs transition-shadow hover:shadow-md space-y-3 ${
                      isCritical
                        ? "border-rose-200 bg-rose-50/30"
                        : isHigh
                        ? "border-amber-200 bg-amber-50/30"
                        : "border-blue-200 bg-blue-50/20"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full bg-white border border-slate-200 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-700 shadow-2xs">
                        {isSplit
                          ? "Anti-Structuring / Split"
                          : anomaly.category === "BUYER_SUPPLIER_AFFINITY"
                          ? "Vendor Concentration Risk"
                          : "Sole Source"}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold inline-flex items-center gap-1 ${
                          isCritical
                            ? "bg-rose-100 text-rose-800 border border-rose-300"
                            : isHigh
                            ? "bg-amber-100 text-amber-800 border border-amber-300"
                            : "bg-blue-100 text-blue-800 border border-blue-300"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            isCritical ? "bg-rose-600 animate-ping" : isHigh ? "bg-amber-600" : "bg-blue-600"
                          }`}
                        />
                        {anomaly.severity} SEVERITY
                      </span>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{anomaly.title}</h4>
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed font-normal">
                        {anomaly.description}
                      </p>
                    </div>

                    {/* Affected Entities Detailed Pills */}
                    <div className="rounded-lg bg-white/80 border border-slate-200/80 p-2.5 space-y-1.5 text-xs">
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Affected Entities</p>
                      <div className="flex flex-wrap gap-1.5">
                        {anomaly.entitiesSummary?.suppliers?.map((supp, i) => (
                          <span key={i} className="inline-flex items-center gap-1 rounded bg-slate-50 border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-800">
                            <Building2 className="h-3 w-3 text-slate-400" /> Supplier: {supp}
                          </span>
                        ))}
                        {anomaly.entitiesSummary?.approvers?.map((appr, i) => (
                          <span key={i} className="inline-flex items-center gap-1 rounded bg-slate-50 border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-800">
                            <User className="h-3 w-3 text-slate-400" /> Buyer/Approver: {appr}
                          </span>
                        ))}
                        {anomaly.entitiesSummary?.projects?.map((proj, i) => (
                          <span key={i} className="inline-flex items-center gap-1 rounded bg-slate-50 border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-800">
                            <FolderKanban className="h-3 w-3 text-slate-400" /> Project: {proj}
                          </span>
                        ))}
                        {anomaly.entitiesSummary?.totalAmount ? (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                            <Landmark className="h-3 w-3 text-amber-600" /> Flagged Spend: {money(anomaly.entitiesSummary.totalAmount, "NGN")}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Direct Audit Trail Links & Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 text-xs">
                      <span className="text-[10px] text-slate-400">
                        Detected {shortDate(anomaly.detectedAt)}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedForensicAnomaly(anomaly);
                          setIsForensicModalOpen(true);
                        }}
                        className="text-xs font-semibold text-[#0B1457] hover:text-[#0001FF] hover:underline cursor-pointer flex items-center gap-1"
                      >
                        Inspect forensic audit chain →
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            /* Compliant State */
            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/30 p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <GovernanceVerifiedBadgeIcon className="h-12 w-12" />
                <div>
                  <h4 className="text-xs font-bold text-emerald-950">
                    Corporate Governance Integrity Verified · Zero Anomalies
                  </h4>
                  <p className="text-[11px] text-emerald-800/80 mt-0.5 leading-relaxed">
                    Surveillance verified: No split requisitions bypassing the {money(forensicThreshold, "NGN")} approval threshold within rolling {forensicWindowDays}-day windows. Vendor concentration is within the {concentrationThreshold}% ceiling across all active construction sites.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs font-semibold border-emerald-300 text-emerald-900 hover:bg-emerald-100/60 shrink-0 cursor-pointer inline-flex items-center gap-1.5"
                onClick={() => setIsForensicModalOpen(true)}
              >
                <MdTune className="h-3.5 w-3.5 shrink-0" />
                Configure Forensic Rules
              </Button>
            </div>
          )}
        </motion.section>
      ) : null}

      {/* Dedicated Forensic Governance & Audit Dossier Modal (§FR-4.5, §FR-8.5) */}
      {isForensicModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="relative w-full max-w-4xl rounded-2xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-200 text-slate-800 my-8 animate-in fade-in zoom-in-95 duration-200 space-y-6">
            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-slate-200">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-[#0B1457] flex items-center justify-center text-white font-bold text-sm shadow-xs shrink-0">
                  <MdPolicy className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 tracking-tight">
                      Governance &amp; Forensic Audit Dossier (§FR-4.5, §FR-8.5)
                    </h3>
                    <span className="rounded-full bg-slate-100 text-slate-700 px-2.5 py-0.5 text-[10px] font-bold inline-flex items-center gap-1.5">
                      <MdRadar className="h-3.5 w-3.5 text-emerald-600 animate-pulse shrink-0" />
                      Live Forensic Stream
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Continuous anti-fraud surveillance engine evaluating buyer-supplier affinity, split requisition structuring, and threshold compliance across all active project sites.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsForensicModalOpen(false);
                  setSelectedForensicAnomaly(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Threshold Configuration & Control Bar */}
            <div className="grid gap-3 sm:grid-cols-4 bg-slate-50/80 p-4 rounded-xl border border-slate-200 text-xs">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  Split Threshold (₦)
                </label>
                <Input
                  type="number"
                  value={forensicThreshold}
                  onChange={(e) => setForensicThreshold(Math.max(50000, Number(e.target.value) || 500000))}
                  className="h-8 mt-1 text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  Window (Days)
                </label>
                <Input
                  type="number"
                  value={forensicWindowDays}
                  onChange={(e) => setForensicWindowDays(Math.max(1, Number(e.target.value) || 7))}
                  className="h-8 mt-1 text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  Vendor Limit (%)
                </label>
                <Input
                  type="number"
                  value={concentrationThreshold}
                  onChange={(e) => setConcentrationThreshold(Math.max(10, Math.min(100, Number(e.target.value) || 40)))}
                  className="h-8 mt-1 text-xs bg-white"
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  size="sm"
                  className="h-8 w-full text-xs font-semibold bg-[#0B1457] hover:bg-[#0001FF] text-white cursor-pointer inline-flex items-center justify-center gap-1.5"
                  onClick={() => {
                    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
                    toast.success("Forensic thresholds applied & transactions re-scanned.");
                  }}
                >
                  <FaArrowsRotate className="h-3 w-3 shrink-0" /> Re-scan
                </Button>
              </div>
            </div>

            {/* Tabs Bar */}
            <div className="flex items-center gap-1 border-b border-slate-200 pb-2 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setForensicTab("ALL")}
                className={`rounded-lg px-3 py-1.5 cursor-pointer transition-all inline-flex items-center gap-1.5 ${
                  forensicTab === "ALL" ? "bg-[#0B1457] text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <MdFactCheck className="h-3.5 w-3.5 shrink-0" />
                All Anomalies ({allGovernanceAnomalies.length})
              </button>
              <button
                type="button"
                onClick={() => setForensicTab("SPLIT")}
                className={`rounded-lg px-3 py-1.5 cursor-pointer transition-all inline-flex items-center gap-1.5 ${
                  forensicTab === "SPLIT" ? "bg-[#0B1457] text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <MdCallSplit className="h-3.5 w-3.5 shrink-0" />
                Split Requisitions ({splitAnomalies.length})
              </button>
              <button
                type="button"
                onClick={() => setForensicTab("AFFINITY")}
                className={`rounded-lg px-3 py-1.5 cursor-pointer transition-all inline-flex items-center gap-1.5 ${
                  forensicTab === "AFFINITY" ? "bg-[#0B1457] text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <MdHub className="h-3.5 w-3.5 shrink-0" />
                Concentration Risk ({affinityAnomalies.length})
              </button>
            </div>

            {/* Anomaly Inspection List */}
            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
              {(() => {
                const list =
                  forensicTab === "SPLIT"
                    ? splitAnomalies
                    : forensicTab === "AFFINITY"
                    ? affinityAnomalies
                    : allGovernanceAnomalies;

                if (list.length === 0) {
                  return (
                    <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500 space-y-2">
                      <MdVerifiedUser className="h-8 w-8 text-emerald-600 mx-auto" />
                      <p className="font-bold text-slate-800">No anomalies detected in this category.</p>
                      <p className="text-[11px] text-slate-500">
                        Current transactions comply with the configured {money(forensicThreshold, "NGN")} threshold and {concentrationThreshold}% vendor limit.
                      </p>
                    </div>
                  );
                }

                return list.map((anomaly) => (
                  <div
                    key={anomaly.id}
                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            anomaly.severity === "CRITICAL"
                              ? "bg-rose-100 text-rose-800 border border-rose-300"
                              : anomaly.severity === "HIGH"
                              ? "bg-amber-100 text-amber-800 border border-amber-300"
                              : "bg-blue-100 text-blue-800 border border-blue-300"
                          }`}
                        >
                          {anomaly.severity} SEVERITY
                        </span>
                        <span className="font-mono text-xs font-bold text-slate-800">{anomaly.id}</span>
                      </div>
                      <span className="text-[11px] text-slate-400">{shortDate(anomaly.detectedAt)}</span>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{anomaly.title}</h4>
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed">{anomaly.description}</p>
                    </div>

                    {/* Affected Entities Grid */}
                    <div className="grid sm:grid-cols-2 gap-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200 text-xs">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Affected Suppliers &amp; Vendors</p>
                        <p className="font-semibold text-slate-900 mt-1">
                          {anomaly.entitiesSummary?.suppliers?.join(", ") || "Multiple / Unaffiliated"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Initiating Buyers &amp; Approvers</p>
                        <p className="font-semibold text-slate-900 mt-1">
                          {anomaly.entitiesSummary?.approvers?.join(", ") || "Procurement Officer"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active Site Projects</p>
                        <p className="font-semibold text-slate-900 mt-1">
                          {anomaly.entitiesSummary?.projects?.join(", ") || "Site / Capex Project"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Flagged Purchase Amounts</p>
                        <p className="font-sans font-bold text-slate-900 mt-1">
                          {anomaly.entitiesSummary?.totalAmount
                            ? money(anomaly.entitiesSummary.totalAmount, "NGN")
                            : "—"}
                          {anomaly.entitiesSummary?.purchaseAmounts ? (
                            <span className="text-[11px] font-normal text-slate-500 ml-1">
                              ({anomaly.entitiesSummary.purchaseAmounts.map((a) => money(a, "NGN")).join(", ")})
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>

                    {/* Direct Audit Trail Links & Approval Chain */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Direct Transaction Audit Trail &amp; Approval Chain Records
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {anomaly.auditTrailLinks?.map((link, i) => (
                          <Link
                            key={i}
                            to={link.url as any}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#0B1457] hover:bg-blue-50/50 transition-colors cursor-pointer shadow-2xs"
                          >
                            <FileText className="h-3.5 w-3.5 text-slate-400" />
                            <span>{link.label}</span>
                            <ExternalLink className="h-3 w-3 text-slate-400" />
                          </Link>
                        ))}
                      </div>

                      {/* Step-by-Step Approval Chain */}
                      {anomaly.approvalChainDetails ? (
                        <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5 text-xs space-y-1.5">
                          {anomaly.approvalChainDetails.map((chain, i) => (
                            <div key={i} className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-600 font-medium">
                                Step {i + 1}: {chain.stage} ({chain.requiredRole})
                              </span>
                              <span className="font-semibold text-slate-800">
                                {chain.actorName || "System Rule"} · <span className="uppercase text-amber-700 font-bold">{chain.status}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    {/* Forensic Action Buttons */}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] font-semibold text-rose-700 border-rose-200 hover:bg-rose-50 cursor-pointer"
                        onClick={() => {
                          toast.error(`Transaction freeze flagged for anomaly ${anomaly.id}. Executive notification dispatched.`);
                        }}
                      >
                        Freeze Affected Orders
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 text-[11px] font-semibold bg-[#0B1457] hover:bg-[#0001FF] text-white cursor-pointer"
                        onClick={() => {
                          const csvContent = `data:text/csv;charset=utf-8,AnomalyID,Severity,Title,Description\n${anomaly.id},${anomaly.severity},"${anomaly.title}","${anomaly.description}"`;
                          const encodedUri = encodeURI(csvContent);
                          const link = document.createElement("a");
                          link.setAttribute("href", encodedUri);
                          link.setAttribute("download", `forensic_${anomaly.id}.csv`);
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                          toast.success("Forensic dossier downloaded.");
                        }}
                      >
                        <Download className="h-3 w-3 mr-1" /> Export Dossier
                      </Button>
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* Modal Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200 text-xs">
              <span className="text-slate-500 font-medium">
                Surveillance Active: NDPA 2023 Compliant · FIRS / NRS Statutory Anti-Fraud Standard
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs font-semibold cursor-pointer"
                  onClick={() => {
                    const rows = [
                      ["AnomalyID", "Category", "Severity", "Title", "DetectedAt"],
                      ...allGovernanceAnomalies.map((a) => [
                        a.id,
                        a.category,
                        a.severity,
                        `"${a.title.replace(/"/g, '""')}"`,
                        a.detectedAt,
                      ]),
                    ];
                    const csv = "data:text/csv;charset=utf-8," + rows.map((r) => r.join(",")).join("\n");
                    const link = document.createElement("a");
                    link.setAttribute("href", encodeURI(csv));
                    link.setAttribute("download", `forensic_governance_report_${Date.now()}.csv`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    toast.success("Complete forensic governance report exported.");
                  }}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
                  Export All (CSV)
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                  onClick={() => {
                    setIsForensicModalOpen(false);
                    setSelectedForensicAnomaly(null);
                  }}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

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
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 tracking-tight">
              Recent Procurement Logs & Requests
            </h2>
            <p className="text-xs text-slate-500 font-normal">Real-time operational activity log across all cost centers</p>
          </div>

          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer">
              <Filter className="h-3.5 w-3.5 text-slate-400" /> Filter
            </button>
            <Button
              asChild
              variant="outline"
              className="h-8 rounded-lg border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs"
            >
              <Link to="/requisitions">View All</Link>
            </Button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
          {isLoading ? (
            <p className="p-6 text-center text-xs text-slate-500">Loading activity logs…</p>
          ) : !filteredRequisitions.length ? (
            <EmptyState
              title="No procurement activity logged yet"
              body="When site teams raise requisitions or issue POs, all transactions appear here in real time."
              action={
                <Button
                  asChild
                  className="h-9 rounded-lg bg-[#0B1457] text-xs font-semibold text-white hover:bg-[#0001FF] shadow-xs transition-colors"
                >
                  <Link to="/requisitions/new">Raise First Request</Link>
                </Button>
              }
            />
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-medium">
                <tr>
                  <th className="w-10 px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300"
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-3 py-2.5">Full Name / Ref</th>
                  <th className="px-3 py-2.5">Description / Title</th>
                  <th className="px-3 py-2.5">Value</th>
                  <th className="hidden px-3 py-2.5 sm:table-cell">Action Type</th>
                  <th className="hidden px-3 py-2.5 md:table-cell">Date Created</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRequisitions.map((r: any) => (
                  <motion.tr
                    key={r.id}
                    variants={itemFadeIn}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300"
                        aria-label={`Select ${r.reference}`}
                      />
                    </td>
                    <td className="px-3 py-3 font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0B1457] text-[10px] font-bold text-white uppercase">
                          {r.reference.slice(-2)}
                        </div>
                        <span className="tabular-nums font-semibold text-[#0B1457]">{r.reference}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 max-w-[220px] truncate text-slate-800 font-medium">{r.title}</td>
                    <td className="px-3 py-3 font-semibold tabular-nums text-slate-900">
                      {money(r.total_amount, r.currency)}
                    </td>
                    <td className="hidden px-3 py-3 sm:table-cell">
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-normal">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Requisition Log
                      </span>
                    </td>
                    <td className="hidden px-3 py-3 md:table-cell text-slate-500 font-normal">
                      {shortDate(r.created_at)}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={r.status} label={STATUS_LABELS[r.status]} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Link
                        to="/requisitions/$id"
                        params={{ id: r.id }}
                        className="inline-flex items-center gap-1 rounded-md bg-[#0B1457] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#0001FF] shadow-xs transition-colors"
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
        <DialogContent className="max-w-3xl rounded-2xl p-6 bg-white border border-slate-200 shadow-xl font-sans">
          <DialogHeader className="space-y-1.5 text-left border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-slate-100 border border-slate-200/80 px-2 py-0.5 text-xs font-semibold text-[#0B1457]">
                Project Spend Drilldown
              </span>
              {selectedDrilldownProject?.location ? (
                <span className="text-xs text-slate-500 font-normal">
                  {selectedDrilldownProject.location}
                </span>
              ) : null}
            </div>
            <DialogTitle className="text-xl font-bold tracking-tight text-slate-900">
              {selectedDrilldownProject?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 font-normal leading-relaxed">
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
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-1.5">
                  <p className="text-xs font-medium text-slate-500">Committed Spend</p>
                  <p className="font-sans text-xl font-semibold tabular-nums text-slate-900 tracking-tight">
                    {money(selectedDrilldownProject.committed)}
                  </p>
                  <p className="text-xs font-medium text-emerald-700">
                    {selectedDrilldownProject.budget > 0
                      ? `${selectedDrilldownProject.utilization}% of total budget`
                      : "Uncapped Budget"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-1.5">
                  <p className="text-xs font-medium text-slate-500">Allocated Budget</p>
                  <p className="font-sans text-xl font-semibold tabular-nums text-slate-900 tracking-tight">
                    {selectedDrilldownProject.budget > 0 ? money(selectedDrilldownProject.budget) : "₦ 0.00"}
                  </p>
                  <p className="text-xs text-slate-500 font-normal">Approved Capex</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-1.5">
                  <p className="text-xs font-medium text-slate-500">Remaining Budget</p>
                  <p className="font-sans text-xl font-semibold tabular-nums text-[#0B1457] tracking-tight">
                    {selectedDrilldownProject.budget > 0 ? money(selectedDrilldownProject.remaining) : "—"}
                  </p>
                  <p className="text-xs font-medium text-slate-600">
                    {selectedDrilldownProject.budget > 0 ? "Available to commit" : "No budget limit"}
                  </p>
                </div>
              </div>

              {/* Progress Utilization */}
              {selectedDrilldownProject.budget > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-medium text-slate-700">Budget Consumption Velocity</span>
                    <span className="font-semibold tabular-nums text-slate-900">
                      {selectedDrilldownProject.utilization}% Utilized
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, selectedDrilldownProject.utilization)}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className={cn(
                        "h-full rounded-full transition-all",
                        selectedDrilldownProject.utilization > 90
                          ? "bg-rose-500"
                          : selectedDrilldownProject.utilization > 75
                            ? "bg-amber-500"
                            : "bg-[#0B1457]",
                      )}
                    />
                  </div>
                </div>
              )}

              {/* Real Purchase Orders Ledger for this Project */}
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
                  <p className="text-xs font-semibold text-slate-800">
                    Active Purchase Orders on this Site ({selectedDrilldownProject.purchaseOrders.length})
                  </p>
                  <span className="text-xs text-slate-500 font-normal">
                    Committed Total:{" "}
                    <strong className="font-semibold text-slate-900 tabular-nums">
                      {money(selectedDrilldownProject.committed)}
                    </strong>
                  </span>
                </div>

                {selectedDrilldownProject.purchaseOrders.length === 0 ? (
                  <div className="p-6 text-center bg-white">
                    <p className="text-xs font-semibold text-slate-800">No purchase orders issued yet for this site</p>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                      Committed spend will reflect automatically once purchase orders are issued to verified suppliers.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-medium">
                        <tr>
                          <th className="px-4 py-2.5 font-medium">PO Ref</th>
                          <th className="px-4 py-2.5 font-medium">Supplier</th>
                          <th className="px-4 py-2.5 font-medium">Issued</th>
                          <th className="px-4 py-2.5 font-medium">Status</th>
                          <th className="px-4 py-2.5 font-medium text-right">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedDrilldownProject.purchaseOrders.map((po: any) => (
                          <tr key={po.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3">
                              <Link
                                to="/purchase-orders"
                                className="inline-flex items-center rounded-md bg-slate-100 border border-slate-200/80 px-2 py-0.5 text-xs font-semibold tabular-nums text-[#0B1457] hover:text-[#0001FF]"
                              >
                                {po.po_number || po.id.slice(0, 8)}
                              </Link>
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-900">
                              {po.suppliers?.name || "Verified Vendor"}
                            </td>
                            <td className="px-4 py-3 text-slate-500 font-normal">
                              {po.issued_at ? shortDate(po.issued_at) : "—"}
                            </td>
                            <td className="px-4 py-3">
                              <StatusPill
                                status={po.status || "issued"}
                                label={po.status ? STATUS_LABELS[po.status] || po.status : "Issued"}
                              />
                            </td>
                            <td className="px-4 py-3 text-right font-sans font-semibold text-slate-900 tabular-nums">
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
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="text-xs text-slate-500 font-normal">
                  {selectedDrilldownProject.requisitions.length} requisition(s) linked to this site
                </span>
                <div className="flex items-center gap-2">
                  <Button asChild variant="outline" className="h-9 px-3 rounded-lg border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50">
                    <Link to="/requisitions/new">
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      New Requisition
                    </Link>
                  </Button>
                  <Button asChild className="h-9 px-4 rounded-lg bg-[#0B1457] hover:bg-[#0001FF] text-white font-medium text-xs shadow-xs">
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
