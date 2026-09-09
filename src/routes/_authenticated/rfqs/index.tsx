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

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
        {isLoading ? (
          <p className="p-5 text-xs text-slate-500">Loading RFQs…</p>
        ) : !data?.length ? (
          <EmptyState
            title="No quote requests yet"
            body="Once a requisition is approved, procurement can invite suppliers to quote. Each supplier gets a private, expiring link."
            action={
              <Button asChild className="h-9 px-4 rounded-lg bg-[#0B1457] hover:bg-[#0001FF] text-white font-medium text-xs shadow-xs">
                <Link to="/requisitions">Find an approved request</Link>
              </Button>
            }
          />
        ) : (
          <table className="w-full min-w-[640px] text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-medium">
              <tr className="text-left">
                <th className="px-4 py-2.5">Ref</th>
                <th className="px-4 py-2.5">Request Title</th>
                <th className="px-4 py-2.5">Invited</th>
                <th className="px-4 py-2.5">Quotes in</th>
                <th className="px-4 py-2.5">Closes</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((rfq) => (
                <tr key={rfq.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <Link to="/rfqs/$id" params={{ id: rfq.id }} className="inline-flex items-center rounded-md bg-slate-100 border border-slate-200/80 px-2 py-0.5 text-xs font-semibold tabular-nums text-[#0B1457] hover:text-[#0001FF]">
                      {rfq.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">{rfq.title}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-600 font-medium">
                    {(rfq.rfq_invitations as { id: string }[]).length}
                  </td>
                  <td className="px-4 py-3 tabular-nums font-semibold text-slate-900">
                    {(rfq.quotes as { id: string }[]).length}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{shortDate(rfq.closes_at)}</td>
                  <td className="px-4 py-3">
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
