import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useMe, can } from "@/lib/useMe";
import { money, shortDate, STATUS_LABELS, ROLE_LABELS } from "@/lib/format";
import { PageHeader, Metric, StatusPill, EmptyState } from "@/components/procurely/bits";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Overview — Procurely Flow" },
      {
        name: "description",
        content: "Live view of open requisitions, approvals waiting on you, and committed spend.",
      },
      { property: "og:title", content: "Overview — Procurely Flow" },
      { property: "og:description", content: "Your procurement pipeline at a glance." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const me = useMe();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [reqs, steps, pos, projects, suppliers, members] = await Promise.all([
        supabase
          .from("requisitions")
          .select("id, reference, title, status, total_amount, currency, created_at, needed_by")
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("approval_steps")
          .select(
            "id, required_role, status, requisitions(id, title, reference, total_amount, currency)",
          )
          .eq("status", "pending"),
        supabase.from("purchase_orders").select("id, total_amount, settlement_currency"),
        supabase.from("projects").select("id", { count: "exact", head: true }),
        supabase.from("suppliers").select("id", { count: "exact", head: true }),
        supabase.from("user_roles").select("id", { count: "exact", head: true }),
      ]);
      return {
        requisitions: reqs.data ?? [],
        steps: steps.data ?? [],
        purchaseOrders: pos.data ?? [],
        projectCount: projects.count ?? 0,
        supplierCount: suppliers.count ?? 0,
        memberCount: members.count ?? 0,
      };
    },
  });

  const myPendingSteps = (data?.steps ?? []).filter(
    (s) => s.status === "pending" && me.data?.roles.includes(s.required_role as never),
  );
  const myPending = myPendingSteps.length;
  const awaiting = (data?.requisitions ?? []).filter((r) => r.status === "pending_approval").length;
  const committed = (data?.purchaseOrders ?? []).reduce(
    (sum, p) => sum + Number(p.total_amount),
    0,
  );
  const canRequest = can(me.data?.roles, ["requester", "admin"]);
  const canApprove = can(me.data?.roles, ["approver", "finance", "executive", "admin"]);
  const canProcure = can(me.data?.roles, ["procurement_officer", "admin"]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Good day, ${me.data?.profile?.full_name?.split(" ")[0] ?? "there"}`}
        subtitle="Everything moving through procurement right now, in one place."
        actions={
          <Button asChild className="h-11">
            <Link to="/requisitions/new">New requisition</Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Waiting on you"
          value={String(myPending)}
          hint="Approvals routed to your roles"
        />
        <Metric
          label="In approval"
          value={String(awaiting)}
          hint="Requests currently being reviewed"
        />
        <Metric
          label="Purchase orders"
          value={String(data?.purchaseOrders.length ?? 0)}
          hint="Issued to suppliers"
        />
        <Metric label="Committed spend" value={money(committed)} hint="Across issued POs" />
      </div>

      {canApprove && myPending > 0 ? (
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl uppercase tracking-wide text-foreground">
              Waiting on you
            </h2>
            <Button asChild variant="outline" className="h-10">
              <Link to="/approvals">View all</Link>
            </Button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {myPendingSteps.slice(0, 6).map((s) => {
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
                <Link
                  key={s.id}
                  to="/approvals"
                  className="rounded-md border border-border bg-surface p-3 transition-colors hover:bg-muted/40"
                >
                  <p className="truncate text-sm font-medium text-foreground">{req.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {req.reference} · {money(req.total_amount, req.currency)}
                  </p>
                  <p className="mt-2 text-xs font-medium text-signal">
                    Action as {ROLE_LABELS[s.required_role] ?? s.required_role}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="font-display text-xl uppercase tracking-wide text-foreground">
          Latest requisitions
        </h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-border bg-card">
          {isLoading ? (
            <p className="p-5 text-sm text-muted-foreground">Loading…</p>
          ) : !data?.requisitions.length ? (
            <EmptyState
              title="Nothing requested yet"
              body="When a site team raises their first material request, it will show up here with its full approval trail."
              action={
                <Button asChild className="h-11">
                  <Link to="/requisitions/new">Raise the first request</Link>
                </Button>
              }
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface">
                <tr className="text-left">
                  <th className="px-3 py-2.5 data-label">Ref</th>
                  <th className="px-3 py-2.5 data-label">Request</th>
                  <th className="px-3 py-2.5 data-label">Value</th>
                  <th className="hidden px-3 py-2.5 data-label sm:table-cell">Needed by</th>
                  <th className="px-3 py-2.5 data-label">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.requisitions.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-surface">
                    <td className="px-3 py-3 font-mono text-xs">
                      <Link to="/requisitions/$id" params={{ id: r.id }} className="text-accent">
                        {r.reference}
                      </Link>
                    </td>
                    <td className="px-3 py-3">{r.title}</td>
                    <td className="px-3 py-3 tabular-nums">{money(r.total_amount, r.currency)}</td>
                    <td className="hidden px-3 py-3 sm:table-cell">{shortDate(r.needed_by)}</td>
                    <td className="px-3 py-3">
                      <StatusPill status={r.status} label={STATUS_LABELS[r.status]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {me.data?.roles.includes("admin") ? (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-display text-xl uppercase tracking-wide text-foreground">
            Get your workspace ready
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Complete these steps so your pilot team can raise, approve and award work.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <ChecklistItem
              done={(data?.projectCount ?? 0) > 0}
              label="Add a project / cost center"
              hint="Every requisition belongs to a site."
              to="/projects"
            />
            <ChecklistItem
              done={(data?.memberCount ?? 0) > 1}
              label="Invite a teammate"
              hint="Assign roles under Settings."
              to="/settings"
            />
            <ChecklistItem
              done={(data?.supplierCount ?? 0) > 0}
              label="Add a supplier"
              hint="Procurement will invite them to quote."
              to="/suppliers"
            />
            <ChecklistItem
              done={(data?.requisitions.length ?? 0) > 0}
              label="Raise a requisition"
              hint="Try the full field-to-PO loop."
              to="/requisitions/new"
            />
          </ul>
        </section>
      ) : null}
    </div>
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
    <li
      className={cn("rounded-md border border-border p-3", done ? "bg-surface/60" : "bg-surface")}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            "grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] font-bold",
            done
              ? "border-signal bg-signal text-white"
              : "border-muted-foreground/30 text-muted-foreground",
          )}
          aria-hidden
        >
          {done ? "✓" : ""}
        </div>
        <div className="min-w-0">
          <Link to={to} className="text-sm font-medium text-foreground hover:underline">
            {label}
          </Link>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
    </li>
  );
}
