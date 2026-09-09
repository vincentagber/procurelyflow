"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  MapPin,
  Wallet,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FileText,
  ShoppingBag,
  Plus,
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

export default function ProjectsPage() {
  const me = useMe();
  const queryClient = useQueryClient();
  const canCreate = can(me.data?.roles, ["admin", "procurement_officer", "finance", "executive"]);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [budget, setBudget] = useState("");

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
      } catch {
        return [];
      }
    },
  });

  const create = useMutation({
    mutationFn: () =>
      createProjectFn({
        data: {
          name,
          location: location || undefined,
          budgetAmount: budget ? Number(budget) : undefined,
        },
      }),
    onSuccess: async () => {
      toast.success("Project / Cost Center created.");
      setName("");
      setLocation("");
      setBudget("");
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't create project."),
  });

  return (
    <div className="space-y-6 pb-12 font-sans">
      <PageHeader
        title="Projects & Cost Centers"
        subtitle="Manage the construction sites, departments, and cost centers tracking budgets."
      />

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        {/* Create Form */}
        {canCreate && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs h-fit space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base font-semibold text-slate-900 tracking-tight">
                New Project / Site
              </h2>
              <p className="text-xs text-slate-500 font-normal mt-0.5">
                Allocate capital to a designated site or department
              </p>
            </div>

            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Project / Cost Center Name</Label>
                <Input
                  placeholder="e.g. Eko Atlantic Tower Phase 2"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-10 rounded-lg border-slate-200 bg-white text-xs font-medium text-slate-900 shadow-2xs focus-visible:border-[#0B1457] focus-visible:ring-1 focus-visible:ring-[#0B1457]/20"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Site Location / City</Label>
                <Input
                  placeholder="e.g. Victoria Island, Lagos"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="h-10 rounded-lg border-slate-200 bg-white text-xs font-medium text-slate-900 shadow-2xs focus-visible:border-[#0B1457] focus-visible:ring-1 focus-visible:ring-[#0B1457]/20"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Budget Limit (₦, optional)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 50000000"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="h-10 rounded-lg border-slate-200 bg-white text-xs font-semibold tabular-nums text-slate-900 shadow-2xs focus-visible:border-[#0B1457] focus-visible:ring-1 focus-visible:ring-[#0B1457]/20"
                />
              </div>

              <Button
                disabled={!name || create.isPending}
                onClick={() => create.mutate()}
                className="w-full h-9 rounded-lg bg-[#0B1457] hover:bg-[#0001FF] text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Create Project
              </Button>
            </div>
          </section>
        )}

        {/* Projects Grid */}
        <section className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {isLoading ? (
              <p className="text-xs text-slate-500 py-12 text-center col-span-2 animate-pulse">Loading projects…</p>
            ) : !data?.length ? (
              <div className="col-span-2">
                <EmptyState
                  title="No projects configured yet"
                  body="Create your first construction site or cost center to begin assigning material requests."
                />
              </div>
            ) : (
              data.map((p) => (
                <div
                  key={p.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-slate-300 hover:shadow-2xs transition-all space-y-3.5"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-sm text-slate-900 tracking-tight">{p.name}</h3>
                      <p className="mt-0.5 text-xs text-slate-500 flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-slate-400" />{" "}
                        {p.location || "Location not set"}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-3 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Total Budget:</span>
                      <span className="font-semibold tabular-nums text-slate-900">
                        {p.budget_amount ? money(p.budget_amount, "NGN") : "Uncapped"}
                      </span>
                    </div>
                    {p.status && p.status.committed > 0 ? (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Committed Spend:</span>
                        <span className="font-semibold tabular-nums text-emerald-700">
                          {money(p.status.committed, "NGN")}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
