import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { money, shortDate, STATUS_LABELS } from "@/lib/format";
import { PageHeader, StatusPill, EmptyState } from "@/components/procurely/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence, itemFadeIn, staggerContainer, fadeIn } from "@/components/ui/animated";

export const Route = createFileRoute("/_authenticated/requisitions/")({
  head: () => ({
    meta: [
      { title: "Requisitions — Procurely Flow" },
      {
        name: "description",
        content: "Scan every material request, its value, budget flag and approval status.",
      },
      { property: "og:title", content: "Requisitions — Procurely Flow" },
      { property: "og:description", content: "The full requisition queue for your organization." },
    ],
  }),
  component: RequisitionList,
});

const FILTERS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "pending_approval", label: "In approval" },
  { key: "approved", label: "Approved" },
  { key: "rfq_issued", label: "Out for quotes" },
  { key: "po_issued", label: "PO issued" },
] as const;

function RequisitionList() {
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["requisitions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("requisitions")
        .select(
          "id, reference, title, status, total_amount, currency, is_unbudgeted, needed_by, created_at, projects(name)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const rows = (data ?? []).filter((r) => {
    const statusOk = filter === "all" || r.status === filter;
    const q = search.trim().toLowerCase();
    const searchOk =
      !q || r.title.toLowerCase().includes(q) || r.reference.toLowerCase().includes(q);
    return statusOk && searchOk;
  });

  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="space-y-6 pb-12"
    >
      <motion.div variants={itemFadeIn}>
        <PageHeader
          title="Requisitions"
          subtitle="Every material request raised in your organization, newest first."
          actions={
            <Button asChild className="h-9 px-4 rounded-lg bg-[#0B1457] hover:bg-[#0001FF] text-white font-medium text-xs shadow-xs">
              <Link to="/requisitions/new">New requisition</Link>
            </Button>
          }
          />
        </motion.div>

        <motion.div variants={itemFadeIn} className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center rounded-xl bg-slate-100/80 p-1 border border-slate-200/80 gap-1 overflow-x-auto max-w-full">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={
                  filter === f.key
                    ? "h-8 rounded-lg bg-white px-3 text-xs font-semibold text-slate-900 shadow-2xs transition-all cursor-pointer"
                    : "h-8 rounded-lg px-3 text-xs font-medium text-slate-600 hover:text-slate-900 transition-all cursor-pointer"
                }
              >
                {f.label}
              </button>
            ))}
          </div>
          <Input
            placeholder="Search title or reference…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full sm:max-w-xs rounded-lg border-slate-200 bg-white text-xs shadow-2xs placeholder:text-slate-400 focus-visible:border-[#0B1457]"
          />
        </motion.div>

        <motion.div variants={itemFadeIn} className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
          {isLoading ? (
            <p className="p-5 text-xs text-slate-500">Loading requisitions…</p>
          ) : !rows.length ? (
            <EmptyState
              title="No requests here yet"
              body="Nothing matches this view. Raise a request and it will appear the moment it's saved."
              action={
                <Button asChild className="h-9 px-4 rounded-lg bg-[#0B1457] hover:bg-[#0001FF] text-white font-medium text-xs shadow-xs">
                  <Link to="/requisitions/new">New requisition</Link>
                </Button>
              }
            />
          ) : (
            <table className="w-full min-w-[720px] text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-medium">
                <tr className="text-left">
                  <th className="px-4 py-2.5">Ref</th>
                  <th className="px-4 py-2.5">Request Title</th>
                  <th className="px-4 py-2.5">Project / Cost Center</th>
                  <th className="px-4 py-2.5">Value</th>
                  <th className="px-4 py-2.5">Budget</th>
                  <th className="px-4 py-2.5">Needed by</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <motion.tr
                    key={r.id}
                    variants={itemFadeIn}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link to="/requisitions/$id" params={{ id: r.id }} className="inline-flex items-center rounded-md bg-slate-100 border border-slate-200/80 px-2 py-0.5 text-xs font-semibold tabular-nums text-[#0B1457] hover:text-[#0001FF]">
                        {r.reference}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{r.title}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {(r.projects as { name: string } | null)?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-slate-900">{money(r.total_amount, r.currency)}</td>
                    <td className="px-4 py-3">
                      {r.is_unbudgeted ? (
                        <StatusPill status="pending" label="Unbudgeted" />
                      ) : (
                        <span className="text-xs text-slate-500 font-normal">Budgeted</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{shortDate(r.needed_by)}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={r.status} label={STATUS_LABELS[r.status]} />
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </motion.div>
    </motion.div>
  );
}
