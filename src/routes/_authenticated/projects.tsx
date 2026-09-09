import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  MapPin,
  Wallet,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FileText,
  ShoppingBag,
  Building2,
  Plus,
  ArrowUpRight,
  TrendingUp,
  ShieldCheck,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useMe, can } from "@/lib/useMe";
import { createProjectFn, projectBudgetStatusFn } from "@/lib/procurement.functions";
import { money, shortDate } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/procurely/bits";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { motion, AnimatePresence, itemFadeIn, staggerContainer, fadeIn } from "@/components/ui/animated";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({
    meta: [
      { title: "Projects / Cost Centers — Procurely Flow" },
      {
        name: "description",
        content:
          "Create and track the projects or cost centers every requisition, quote and purchase order belongs to.",
      },
      { property: "og:title", content: "Projects / Cost Centers — Procurely Flow" },
      {
        property: "og:description",
        content: "Projects and cost centers with optional budgets for procurement tracking.",
      },
    ],
  }),
  component: Projects,
});

function Projects() {
  const me = useMe();
  const queryClient = useQueryClient();
  const canCreate = can(me.data?.roles, ["admin", "procurement_officer", "finance", "executive"]);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [budget, setBudget] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [modalTab, setModalTab] = useState<"requisitions" | "purchase_orders">("requisitions");

  const { data, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("projects")
          .select("id, name, location, budget_amount, created_at")
          .order("created_at", { ascending: false });
        if (error) throw error;
        const statuses = await Promise.all(
          (data ?? []).map((p) =>
            projectBudgetStatusFn({ data: { projectId: p.id } }).catch(() => ({
              budget: Number(p.budget_amount ?? 0),
              committed: 0,
              issued: 0,
              remaining: Number(p.budget_amount ?? 0),
            })),
          ),
        );
        return data?.map((p, i) => ({ ...p, status: statuses[i] })) ?? [];
      } catch (err) {
        console.warn("Failed fetching projects:", err);
        return [];
      }
    },
  });

  const { data: projectDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ["project-detail", selectedProjectId],
    queryFn: async () => {
      if (!selectedProjectId) return null;
      try {
        const [reqs, pos] = await Promise.all([
          supabase
            .from("requisitions")
            .select("id, reference, title, status, total_amount, currency, created_at")
            .eq("project_id", selectedProjectId)
            .order("created_at", { ascending: false }),
          supabase
            .from("purchase_orders")
            .select(
              "id, po_number, total_amount, settlement_currency, status, issued_at, requisition_id, requisitions!inner(project_id)",
            )
            .eq("requisitions.project_id", selectedProjectId)
            .order("issued_at", { ascending: false }),
        ]);
        return {
          requisitions: reqs.data ?? [],
          purchaseOrders: pos.data ?? [],
        };
      } catch (err) {
        console.warn("Failed fetching project details:", err);
        return { requisitions: [], purchaseOrders: [] };
      }
    },
    enabled: !!selectedProjectId,
  });

  const create = useMutation({
    mutationFn: () =>
      createProjectFn({
        data: {
          name,
          ...(location.trim() ? { location: location.trim() } : {}),
          ...(budget ? { budgetAmount: Number(budget) } : {}),
        },
      }),
    onSuccess: async () => {
      toast.success("Project / cost center created.");
      setName("");
      setLocation("");
      setBudget("");
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Couldn't create that project / cost center."),
  });

  const selectedProject = data?.find((p) => p.id === selectedProjectId);

  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="space-y-6 pb-12"
    >
      <motion.div variants={itemFadeIn}>
        <PageHeader
          title="Projects / Cost Centers"
          subtitle="Every requisition belongs to a project or cost center, so spend always rolls up to something you can report on."
        />
      </motion.div>

      {canCreate ? (
        <motion.form
          variants={itemFadeIn}
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-semibold text-slate-900 tracking-tight">Create Project / Cost Center</h2>
            <p className="text-xs text-slate-500 font-normal">Track departmental allocations and spend limits</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="p-name" className="text-xs font-medium text-slate-700">Project / Cost Center Name</Label>
              <Input
                id="p-name"
                required
                minLength={2}
                className="h-10 rounded-lg border-slate-200 bg-white text-xs font-medium text-slate-900 shadow-2xs focus-visible:border-[#0B1457] focus-visible:ring-1 focus-visible:ring-[#0B1457]/20"
                placeholder="e.g. Lekki Phase 2 Towers"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-loc" className="text-xs font-medium text-slate-700">Location (optional)</Label>
              <Input
                id="p-loc"
                className="h-10 rounded-lg border-slate-200 bg-white text-xs font-medium text-slate-900 shadow-2xs focus-visible:border-[#0B1457] focus-visible:ring-1 focus-visible:ring-[#0B1457]/20"
                placeholder="e.g. Victoria Island, Lagos"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-budget" className="text-xs font-medium text-slate-700">Budget Limit (₦, optional)</Label>
              <Input
                id="p-budget"
                type="number"
                min="0"
                step="any"
                className="h-10 rounded-lg border-slate-200 bg-white text-xs font-semibold tabular-nums text-slate-900 shadow-2xs focus-visible:border-[#0B1457] focus-visible:ring-1 focus-visible:ring-[#0B1457]/20"
                placeholder="e.g. 50000000"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <Button className="h-9 px-5 rounded-lg bg-[#0B1457] hover:bg-[#0001FF] text-xs font-semibold text-white shadow-xs cursor-pointer disabled:opacity-50" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create Project"}
            </Button>
          </div>
        </motion.form>
      ) : null}

      {isLoading ? (
        <p className="text-xs text-slate-500 py-12 text-center animate-pulse">Loading projects / cost centers…</p>
      ) : !data?.length ? (
        <EmptyState
          title="No projects or cost centers yet"
          body={
            canCreate
              ? "Add your first project or cost center above — requisitions will attach to it."
              : "An admin or procurement officer will add the projects or cost centers you can request against."
          }
        />
      ) : (
        <motion.div variants={staggerContainer} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((project) => {
            const totalBudget = project.budget_amount ?? 0;
            const committed = project.status?.committed ?? 0;
            const remaining = project.status?.remaining ?? 0;
            const percentUsed =
              totalBudget > 0 ? Math.min(Math.round((committed / totalBudget) * 100), 100) : 0;
            const isOverBudget = remaining < 0;

            return (
              <motion.article
                key={project.id}
                variants={itemFadeIn}
                whileHover={{ y: -2 }}
                transition={{ duration: 0.18 }}
                onClick={() => setSelectedProjectId(project.id)}
                className="group cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:border-slate-300 hover:shadow-2xs space-y-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 group-hover:text-[#0001FF] tracking-tight transition-colors flex items-center gap-1.5">
                      {project.name}
                      <ChevronRight className="h-4 w-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                    </h2>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 font-normal">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                      {project.location || "No location set"}
                    </p>
                  </div>
                  {isOverBudget ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 border border-rose-200/80 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                      <AlertCircle className="h-3 w-3" /> Over
                    </span>
                  ) : totalBudget > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" /> {percentUsed}% used
                    </span>
                  ) : null}
                </div>

                {totalBudget > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-slate-500 tabular-nums">
                      <span>Committed: <strong className="font-semibold text-slate-700">{money(committed)}</strong></span>
                      <span>Budget: <strong className="font-semibold text-slate-700">{money(totalBudget)}</strong></span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${percentUsed}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className={cn(
                          "h-1.5 rounded-full",
                          isOverBudget
                            ? "bg-rose-600"
                            : percentUsed > 80
                              ? "bg-amber-500"
                              : "bg-[#0B1457]",
                        )}
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2.5 text-xs border-t border-slate-100 text-slate-500">
                  <span className="flex items-center gap-1">
                    <Wallet className="h-3.5 w-3.5 text-slate-400" /> Remaining
                  </span>
                  <span
                    className={cn(
                      "font-sans font-semibold tabular-nums",
                      isOverBudget ? "text-rose-600" : "text-slate-900",
                    )}
                  >
                    {money(remaining)}
                  </span>
                </div>
              </motion.article>
            );
          })}
        </motion.div>
      )}

      {/* Project Spend Breakdown Modal */}
      <Dialog
        open={!!selectedProjectId}
        onOpenChange={(open) => !open && setSelectedProjectId(null)}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-6">
          {/* Header Section */}
          <DialogHeader className="space-y-3">
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="space-y-0.5">
                <DialogTitle className="text-base font-semibold tracking-tight text-slate-900">
                  {selectedProject?.name}
                </DialogTitle>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-slate-400" />
                    {selectedProject?.location || "No location specified"}
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="font-medium text-slate-700 tabular-nums">
                    Budget: {selectedProject?.budget_amount ? money(selectedProject.budget_amount) : "No Limit Set"}
                  </span>
                </div>
              </div>
            </div>

            {/* Budget Utilization Progress Bar */}
            {selectedProject?.budget_amount && selectedProject.budget_amount > 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-slate-500">
                    Utilization:{" "}
                    <span className="font-semibold text-slate-900 tabular-nums">
                      {Math.min(
                        Math.round(
                          ((selectedProject?.status?.committed ?? 0) /
                            selectedProject.budget_amount) *
                            100,
                        ),
                        100,
                      )}
                      %
                    </span>
                  </span>
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      (selectedProject?.status?.remaining ?? 0) < 0
                        ? "text-rose-600"
                        : "text-emerald-700",
                    )}
                  >
                    {(selectedProject?.status?.remaining ?? 0) < 0
                      ? "Over Budget"
                      : `${money(selectedProject?.status?.remaining ?? 0)} Available`}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-300",
                      (selectedProject?.status?.remaining ?? 0) < 0
                        ? "bg-rose-500"
                        : ((selectedProject?.status?.committed ?? 0) /
                            selectedProject.budget_amount) *
                            100 >
                          80
                        ? "bg-amber-500"
                        : "bg-emerald-500",
                    )}
                    style={{
                      width: `${Math.min(
                        Math.round(
                          ((selectedProject?.status?.committed ?? 0) /
                            selectedProject.budget_amount) *
                            100,
                        ),
                        100,
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}
          </DialogHeader>

          {/* 3 Executive Financial Metric Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-1">
            {/* Card 1: Committed Spend */}
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
              <span className="text-[11px] font-medium text-slate-500">
                Committed Spend
              </span>
              <p className="mt-1 text-base font-semibold tabular-nums text-slate-900">
                {money(selectedProject?.status?.committed ?? 0)}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-400">Approved requisitions</p>
            </div>

            {/* Card 2: Issued Purchase Orders */}
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
              <span className="text-[11px] font-medium text-slate-500">
                Issued POs
              </span>
              <p className="mt-1 text-base font-semibold tabular-nums text-slate-900">
                {money(selectedProject?.status?.issued ?? 0)}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-400">Contracted supplier POs</p>
            </div>

            {/* Card 3: Remaining Budget */}
            <div
              className={cn(
                "rounded-xl border p-3.5 shadow-2xs",
                (selectedProject?.status?.remaining ?? 0) < 0
                  ? "border-rose-200 bg-rose-50/50"
                  : "border-slate-200 bg-white",
              )}
            >
              <span
                className={cn(
                  "text-[11px] font-medium",
                  (selectedProject?.status?.remaining ?? 0) < 0
                    ? "text-rose-700"
                    : "text-slate-500",
                )}
              >
                Remaining Budget
              </span>
              <p
                className={cn(
                  "mt-1 text-base font-semibold tabular-nums",
                  (selectedProject?.status?.remaining ?? 0) < 0
                    ? "text-rose-700"
                    : "text-slate-900",
                )}
              >
                {money(selectedProject?.status?.remaining ?? 0)}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-400">Available spend headroom</p>
            </div>
          </div>

          {/* Activity Section with Tabs */}
          <div className="mt-3 space-y-3">
            {/* Tab Pill Switcher */}
            <div className="flex rounded-lg border border-slate-200 bg-slate-100/80 p-1">
              <button
                type="button"
                onClick={() => setModalTab("requisitions")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-all cursor-pointer",
                  modalTab === "requisitions"
                    ? "bg-white text-slate-900 font-semibold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900",
                )}
              >
                <FileText className="h-3.5 w-3.5" />
                Requisitions ({projectDetails?.requisitions.length ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setModalTab("purchase_orders")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-bold transition-all",
                  modalTab === "purchase_orders"
                    ? "bg-white text-[#0B1457] shadow-xs"
                    : "text-[#4B556D] hover:text-[#0B1457]",
                )}
              >
                <ShoppingBag className="h-3.5 w-3.5" />
                Purchase Orders ({projectDetails?.purchaseOrders.length ?? 0})
              </button>
            </div>

            {/* Tab 1: Requisitions List / Empty State */}
            {modalTab === "requisitions" && (
              <div>
                {isLoadingDetails ? (
                  <div className="py-8 text-center text-xs text-[#4B556D]">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0001FF] border-t-transparent inline-block mr-2" />
                    Loading requisitions…
                  </div>
                ) : !projectDetails?.requisitions.length ? (
                  <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-6 text-center">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#EFF3FF] text-[#0001FF]">
                      <FileText className="h-5 w-5" />
                    </div>
                    <h4 className="mt-2.5 text-xs font-bold text-[#0B1457]">
                      No requisitions for this project yet
                    </h4>
                    <p className="mt-1 text-[11px] text-[#4B556D] max-w-sm mx-auto">
                      Field and department material requests tagged to this project will appear here with live threshold sign-off status.
                    </p>
                    <Button
                      asChild
                      size="sm"
                      className="mt-3.5 h-8 bg-[#0001FF] text-xs font-semibold text-white hover:bg-[#0B1457] transition-all"
                    >
                      <Link to="/requisitions/new">
                        <Plus className="mr-1 h-3.5 w-3.5" /> Raise Requisition
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y divide-[#E2E8F0] rounded-xl border border-[#E2E8F0] bg-white overflow-hidden">
                    {projectDetails.requisitions.map((req) => (
                      <Link
                        key={req.id}
                        to="/requisitions/$id"
                        params={{ id: req.id }}
                        className="flex items-center justify-between p-3 text-xs hover:bg-[#F8FAFC] transition-colors group"
                      >
                        <div className="min-w-0 pr-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-[#0001FF]">
                              {req.reference}
                            </span>
                            <span className="rounded-full bg-[#F1F4FA] px-2 py-0.5 text-[10px] font-semibold text-[#0B1457] capitalize">
                              {req.status.replace("_", " ")}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate font-medium text-[#0F172A] group-hover:text-[#0001FF]">
                            {req.title}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold tabular-nums text-[#0B1457]">
                            {money(req.total_amount, req.currency as "NGN" | "USD")}
                          </p>
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-[#4B556D] group-hover:text-[#0001FF]">
                            View <ArrowUpRight className="h-3 w-3" />
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Purchase Orders List / Empty State */}
            {modalTab === "purchase_orders" && (
              <div>
                {isLoadingDetails ? (
                  <div className="py-8 text-center text-xs text-[#4B556D]">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0001FF] border-t-transparent inline-block mr-2" />
                    Loading purchase orders…
                  </div>
                ) : !projectDetails?.purchaseOrders.length ? (
                  <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-6 text-center">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#EFF3FF] text-[#0001FF]">
                      <ShoppingBag className="h-5 w-5" />
                    </div>
                    <h4 className="mt-2.5 text-xs font-bold text-[#0B1457]">
                      No purchase orders issued yet
                    </h4>
                    <p className="mt-1 text-[11px] text-[#4B556D] max-w-sm mx-auto">
                      Binding purchase orders issued to suppliers for this project will be recorded here with delivery milestones.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#E2E8F0] rounded-xl border border-[#E2E8F0] bg-white overflow-hidden">
                    {projectDetails.purchaseOrders.map((po) => (
                      <Link
                        key={po.id}
                        to="/purchase-orders/$id"
                        params={{ id: po.id }}
                        className="flex items-center justify-between p-3 text-xs hover:bg-[#F8FAFC] transition-colors group"
                      >
                        <div className="min-w-0 pr-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-[#0001FF]">
                              {po.po_number}
                            </span>
                            <span className="rounded-full bg-[#F1F4FA] px-2 py-0.5 text-[10px] font-semibold text-[#0B1457] capitalize">
                              {po.status}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-[#4B556D]">
                            Issued {shortDate(po.issued_at)}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold tabular-nums text-[#0B1457]">
                            {money(po.total_amount, po.settlement_currency as "NGN" | "USD")}
                          </p>
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-[#4B556D] group-hover:text-[#0001FF]">
                            View PO <ArrowUpRight className="h-3 w-3" />
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
