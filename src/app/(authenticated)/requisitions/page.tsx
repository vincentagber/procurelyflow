"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { money, shortDate, STATUS_LABELS } from "@/lib/format";
import { PageHeader, StatusPill, EmptyState } from "@/components/procurely/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "pending_approval", label: "In approval" },
  { key: "approved", label: "Approved" },
  { key: "rfq_issued", label: "Out for quotes" },
  { key: "po_issued", label: "PO issued" },
] as const;

export default function RequisitionListPage() {
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
    <div className="space-y-5">
      <PageHeader
        title="Requisitions"
        subtitle="Every material request raised in your organization, newest first."
        actions={
          <Button asChild className="h-11">
            <Link href="/requisitions/new">New requisition</Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={
                filter === f.key
                  ? "h-10 rounded-md bg-primary px-3 text-xs font-semibold uppercase tracking-wide text-primary-foreground"
                  : "h-10 rounded-md border border-border px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-surface"
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
          className="h-10 w-full sm:max-w-xs"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        {isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">Loading requisitions…</p>
        ) : !rows.length ? (
          <EmptyState
            title="No requisitions found"
            body={
              search || filter !== "all"
                ? "Try clearing your filter or search."
                : "Raise the first request from the site to get started."
            }
            action={
              <Button asChild className="h-11">
                <Link href="/requisitions/new">New requisition</Link>
              </Button>
            }
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface">
              <tr className="text-left">
                <th className="px-3 py-2.5 data-label">Ref</th>
                <th className="px-3 py-2.5 data-label">Title</th>
                <th className="hidden px-3 py-2.5 data-label md:table-cell">Project</th>
                <th className="px-3 py-2.5 data-label">Value</th>
                <th className="hidden px-3 py-2.5 data-label sm:table-cell">Needed by</th>
                <th className="px-3 py-2.5 data-label">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-surface">
                  <td className="px-3 py-3 font-mono text-xs">
                    <Link href={`/requisitions/${r.id}`} className="text-accent hover:underline">
                      {r.reference}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <Link
                      href={`/requisitions/${r.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {r.title}
                    </Link>
                    {r.is_unbudgeted ? (
                      <span className="ml-2 inline-block rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                        Unbudgeted
                      </span>
                    ) : null}
                  </td>
                  <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">
                    {(r.projects as { name?: string })?.name ?? "—"}
                  </td>
                  <td className="px-3 py-3 tabular-nums font-medium">
                    {money(r.total_amount, r.currency)}
                  </td>
                  <td className="hidden px-3 py-3 text-muted-foreground sm:table-cell">
                    {shortDate(r.needed_by)}
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill status={r.status} label={STATUS_LABELS[r.status]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
