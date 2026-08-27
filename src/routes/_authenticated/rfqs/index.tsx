import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { shortDate } from "@/lib/format";
import { PageHeader, StatusPill, EmptyState } from "@/components/procurely/bits";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/rfqs/")({
  head: () => ({
    meta: [
      { title: "RFQs & quotes — Procurely Flow" },
      {
        name: "description",
        content: "Track open requests for quotation, how many suppliers replied, and award status.",
      },
      { property: "og:title", content: "RFQs & quotes — Procurely Flow" },
      { property: "og:description", content: "Competitive supplier quoting, sealed by default." },
    ],
  }),
  component: RfqList,
});

function RfqList() {
  const { data, isLoading } = useQuery({
    queryKey: ["rfqs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rfqs")
        .select(
          "id, reference, title, status, closes_at, created_at, rfq_invitations(id), quotes(id, status)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="RFQs & quotes"
        subtitle="Approved requests out with suppliers. Quotes stay sealed from each other."
        actions={
          <Button asChild variant="outline" className="h-11">
            <Link to="/requisitions">Approved requisitions</Link>
          </Button>
        }
      />

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        {isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">Loading RFQs…</p>
        ) : !data?.length ? (
          <EmptyState
            title="No quote requests yet"
            body="Once a requisition is approved, procurement can invite suppliers to quote. Each supplier gets a private, expiring link."
            action={
              <Button asChild className="h-11">
                <Link to="/requisitions">Find an approved request</Link>
              </Button>
            }
          />
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-surface">
              <tr className="text-left">
                <th className="px-3 py-2.5 data-label">Ref</th>
                <th className="px-3 py-2.5 data-label">Title</th>
                <th className="px-3 py-2.5 data-label">Invited</th>
                <th className="px-3 py-2.5 data-label">Quotes in</th>
                <th className="px-3 py-2.5 data-label">Closes</th>
                <th className="px-3 py-2.5 data-label">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((rfq) => (
                <tr key={rfq.id} className="border-t border-border hover:bg-surface">
                  <td className="px-3 py-3 font-mono text-xs">
                    <Link to="/rfqs/$id" params={{ id: rfq.id }} className="text-accent">
                      {rfq.reference}
                    </Link>
                  </td>
                  <td className="px-3 py-3 font-medium">{rfq.title}</td>
                  <td className="px-3 py-3 tabular-nums">
                    {(rfq.rfq_invitations as { id: string }[]).length}
                  </td>
                  <td className="px-3 py-3 tabular-nums">
                    {(rfq.quotes as { id: string }[]).length}
                  </td>
                  <td className="px-3 py-3">{shortDate(rfq.closes_at)}</td>
                  <td className="px-3 py-3">
                    <StatusPill status={rfq.status} />
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
