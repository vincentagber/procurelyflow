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
            <Button asChild className="h-11 shadow-xs">
              <Link to="/requisitions/new">New requisition</Link>
            </Button>
          }
        />
      </motion.div>

      <motion.div variants={itemFadeIn} className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={
                filter === f.key
                  ? "h-10 rounded-md bg-primary px-3 text-xs font-semibold uppercase tracking-wide text-primary-foreground shadow-xs transition-all"
                  : "h-10 rounded-md border border-border px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-surface transition-all"
              }
            >
              {f.label}
            </button>
          ))}
        </div>
        <Input
          placeholder="Search title or reference"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 w-full sm:max-w-xs shadow-2xs"
        />
      </motion.div>

      <motion.div variants={itemFadeIn} className="overflow-x-auto rounded-lg border border-border bg-card shadow-xs">
        {isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">Loading requisitions…</p>
        ) : !rows.length ? (
          <EmptyState
            title="No requests here yet"
            body="Nothing matches this view. Raise a request and it will appear the moment it's saved."
            action={
              <Button asChild className="h-11">
                <Link to="/requisitions/new">New requisition</Link>
              </Button>
            }
          />
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-surface">
              <tr className="text-left">
                <th className="px-3 py-2.5 data-label">Ref</th>
                <th className="px-3 py-2.5 data-label">Request</th>
                <th className="px-3 py-2.5 data-label">Project / Cost Center</th>
                <th className="px-3 py-2.5 data-label">Value</th>
                <th className="px-3 py-2.5 data-label">Budget</th>
                <th className="px-3 py-2.5 data-label">Needed by</th>
                <th className="px-3 py-2.5 data-label">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <motion.tr
                  key={r.id}
                  variants={itemFadeIn}
                  className="hover:bg-surface/70 transition-colors"
                >
                  <td className="px-3 py-3 font-mono text-xs">
                    <Link to="/requisitions/$id" params={{ id: r.id }} className="text-accent hover:underline font-semibold">
                      {r.reference}
                    </Link>
                  </td>
                  <td className="px-3 py-3 font-medium">{r.title}</td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {(r.projects as { name: string } | null)?.name ?? "—"}
                  </td>
                  <td className="px-3 py-3 tabular-nums font-semibold">{money(r.total_amount, r.currency)}</td>
                  <td className="px-3 py-3">
                    {r.is_unbudgeted ? (
                      <StatusPill status="pending" label="Unbudgeted" />
                    ) : (
                      <span className="text-xs text-muted-foreground">Budgeted</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{shortDate(r.needed_by)}</td>
                  <td className="px-3 py-3">
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
