import { createFileRoute } from "@tanstack/react-router";
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
    <div className="space-y-5 pb-10">
      <PageHeader
        title="Projects / Cost Centers"
        subtitle="Every requisition belongs to a project or cost center, so spend always rolls up to something you can report on."
      />

      {canCreate ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="rounded-lg border border-border bg-card p-4"
        >
          <p className="data-label">Create a project / cost center</p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-name">Project / cost center name</Label>
              <Input
                id="p-name"
                required
                minLength={2}
                className="h-12"
                placeholder="e.g. Lekki Phase 2 Towers"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-loc">Location (optional)</Label>
              <Input
                id="p-loc"
                className="h-12"
                placeholder="e.g. Victoria Island, Lagos"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-budget">Budget limit (optional)</Label>
              <Input
                id="p-budget"
                type="number"
                min="0"
                step="any"
                className="h-12"
                placeholder="e.g. 50000000"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button className="h-12" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create project"}
            </Button>
          </div>
        </form>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading projects / cost centers…</p>
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((project) => {
            const totalBudget = project.budget_amount ?? 0;
            const committed = project.status?.committed ?? 0;
            const remaining = project.status?.remaining ?? 0;
            const percentUsed =
              totalBudget > 0 ? Math.min(Math.round((committed / totalBudget) * 100), 100) : 0;
            const isOverBudget = remaining < 0;

            return (
              <article
                key={project.id}
                onClick={() => setSelectedProjectId(project.id)}
                className="group cursor-pointer rounded-xl border border-border bg-card p-4 transition-all hover:border-accent hover:shadow-md space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-display text-xl uppercase tracking-wide text-foreground group-hover:text-accent transition-colors flex items-center gap-1.5">
                      {project.name}
                      <ChevronRight className="h-4 w-4 opacity-40 group-hover:translate-x-0.5 transition-transform" />
                    </h2>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      {project.location || "No location set"}
                    </p>
                  </div>
                  {isOverBudget ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                      <AlertCircle className="h-3 w-3" /> Over
                    </span>
                  ) : totalBudget > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" /> {percentUsed}% used
                    </span>
                  ) : null}
                </div>

                {totalBudget > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>Committed: {money(committed)}</span>
                      <span>Budget: {money(totalBudget)}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
                      <div
                        className={cn(
                          "h-full transition-all duration-300",
                          isOverBudget
                            ? "bg-destructive"
                            : percentUsed > 80
                              ? "bg-amber-500"
                              : "bg-emerald-500",
                        )}
                        style={{ width: `${percentUsed}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 text-xs border-t border-border/50 text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Wallet className="h-3.5 w-3.5" /> Remaining
                  </span>
                  <span
                    className={cn(
                      "font-mono font-semibold",
                      isOverBudget ? "text-destructive" : "text-foreground",
                    )}
                  >
                    {money(remaining)}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Project Spend Breakdown Modal */}
      <Dialog
        open={!!selectedProjectId}
        onOpenChange={(open) => !open && setSelectedProjectId(null)}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl uppercase tracking-wide">
              {selectedProject?.name} — Spend Breakdown
            </DialogTitle>
            <DialogDescription>
              Location: {selectedProject?.location || "N/A"} · Budget:{" "}
              {selectedProject?.budget_amount
                ? money(selectedProject.budget_amount)
                : "No Budget set"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Stat row */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-surface p-2.5">
                <span className="text-muted-foreground">Committed Spend</span>
                <p className="font-mono text-sm font-bold text-foreground mt-0.5">
                  {money(selectedProject?.status?.committed ?? 0)}
                </p>
              </div>
              <div className="rounded-lg bg-surface p-2.5">
                <span className="text-muted-foreground">Issued POs</span>
                <p className="font-mono text-sm font-bold text-foreground mt-0.5">
                  {money(selectedProject?.status?.issued ?? 0)}
                </p>
              </div>
              <div className="rounded-lg bg-surface p-2.5">
                <span className="text-muted-foreground">Remaining Budget</span>
                <p
                  className={cn(
                    "font-mono text-sm font-bold mt-0.5",
                    (selectedProject?.status?.remaining ?? 0) < 0
                      ? "text-destructive"
                      : "text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {money(selectedProject?.status?.remaining ?? 0)}
                </p>
              </div>
            </div>

            {/* Requisitions for this project */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Requisitions (
                {projectDetails?.requisitions.length ?? 0})
              </h3>
              {isLoadingDetails ? (
                <p className="text-xs text-muted-foreground">Loading requisitions…</p>
              ) : !projectDetails?.requisitions.length ? (
                <p className="text-xs text-muted-foreground italic">
                  No requisitions for this project yet.
                </p>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border bg-card">
                  {projectDetails.requisitions.map((req) => (
                    <div key={req.id} className="flex items-center justify-between p-3 text-xs">
                      <div>
                        <span className="font-mono font-medium text-accent">{req.reference}</span>
                        <p className="font-medium text-foreground">{req.title}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold tabular-nums">
                          {money(req.total_amount, req.currency as "NGN" | "USD")}
                        </p>
                        <span className="text-[10px] capitalize text-muted-foreground">
                          {req.status.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Issued POs for this project */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <ShoppingBag className="h-3.5 w-3.5" /> Issued POs (
                {projectDetails?.purchaseOrders.length ?? 0})
              </h3>
              {isLoadingDetails ? (
                <p className="text-xs text-muted-foreground">Loading purchase orders…</p>
              ) : !projectDetails?.purchaseOrders.length ? (
                <p className="text-xs text-muted-foreground italic">
                  No purchase orders issued for this project yet.
                </p>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border bg-card">
                  {projectDetails.purchaseOrders.map((po) => (
                    <div key={po.id} className="flex items-center justify-between p-3 text-xs">
                      <div>
                        <span className="font-mono font-medium text-accent">{po.po_number}</span>
                        <p className="text-[10px] text-muted-foreground">
                          Issued {shortDate(po.issued_at)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold tabular-nums">
                          {money(po.total_amount, po.settlement_currency as "NGN" | "USD")}
                        </p>
                        <span className="text-[10px] capitalize text-muted-foreground">
                          {po.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
