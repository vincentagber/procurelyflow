import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import { platformOrgDetailFn, setOrgPlanFn } from "@/lib/platform.functions";
import { BillingSection } from "@/components/procurely/billing";
import { BILLING_STATUS_LABELS, SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/billing";
import { money, shortDate, dateTime, ROLE_LABELS, STATUS_LABELS } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Currency } from "@/lib/format";

export const Route = createFileRoute("/platform-admin/$orgId")({
  head: () => ({
    meta: [
      { title: "Organization review — Platform Admin | Procurely" },
      {
        name: "description",
        content:
          "Read-only platform review of a customer organization: members, recent requisitions, RFQs and audit trail.",
      },
      { property: "og:title", content: "Organization review — Platform Admin | Procurely" },
      {
        property: "og:description",
        content: "Platform staff review of a single customer organization on Procurely.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OrgDetailPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-4">
      <h2 className="font-display text-xl uppercase tracking-wide text-foreground">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function OrgDetailPage() {
  const { orgId } = Route.useParams();
  const detail = useQuery({
    queryKey: ["platform-org", orgId],
    queryFn: () => platformOrgDetailFn({ data: { orgId } }),
  });

  async function changePlan(plan: string) {
    try {
      await setOrgPlanFn({ data: { orgId, plan: plan as SubscriptionPlan } });
      toast.success(`Plan updated to ${plan}.`);
      await detail.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update the plan.");
    }
  }

  if (detail.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading organization…</p>;
  }
  if (detail.error || !detail.data) {
    return (
      <p className="text-sm text-signal">
        {detail.error instanceof Error ? detail.error.message : "Couldn't load that organization."}
      </p>
    );
  }

  const { org, members, requisitions, rfqs, audit } = detail.data;

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/platform-admin">
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden /> All organizations
        </Link>
      </Button>

      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title text-3xl">{org.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {BILLING_STATUS_LABELS[org.status] ?? org.status} · {org.baseCurrency} · created{" "}
            {shortDate(org.createdAt)}
            {org.contactEmail ? ` · ${org.contactEmail}` : ""}
          </p>
          {org.status === "suspended" ? (
            <p className="mt-1 text-sm text-signal">
              Suspended {shortDate(org.suspendedAt)}
              {org.suspensionReason ? ` — ${org.suspensionReason}` : ""}
            </p>
          ) : null}
        </div>
        <div className="w-44">
          <Select value={org.plan} onValueChange={changePlan}>
            <SelectTrigger aria-label="Subscription plan">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUBSCRIPTION_PLANS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="mt-3 inline-flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
        This visit was recorded in the organization's permanent audit log as a platform action.
      </p>

      <BillingSection orgId={orgId} />

      <Section title={`Members (${members.length})`}>
        {!members.length ? (
          <p className="text-sm text-muted-foreground">No members yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <span className="font-medium text-foreground">
                  {m.fullName}
                  <span className="ml-2 font-normal text-muted-foreground">{m.email}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {m.roles.map((r) => ROLE_LABELS[r] ?? r).join(", ") || "No roles"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Recent requisitions">
        {!requisitions.length ? (
          <p className="text-sm text-muted-foreground">No requisitions yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {requisitions.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <span className="text-foreground">
                  <span className="text-muted-foreground">{r.reference}</span> {r.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  {money(r.totalAmount, r.currency as Currency)} ·{" "}
                  {STATUS_LABELS[r.status] ?? r.status} · {shortDate(r.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Recent RFQs">
        {!rfqs.length ? (
          <p className="text-sm text-muted-foreground">No RFQs yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rfqs.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <span className="text-foreground">
                  <span className="text-muted-foreground">{r.reference}</span> {r.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  {r.status} · closes {shortDate(r.closesAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Audit trail">
        {!audit.length ? (
          <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {audit.map((a) => (
              <li key={a.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{a.action}</span>
                  {a.isPlatform ? (
                    <span className="rounded-full bg-signal/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-signal">
                      Platform action
                    </span>
                  ) : null}
                  <span className="text-xs text-muted-foreground">{dateTime(a.createdAt)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {a.actorName ?? "System"}
                  {a.detail ? ` — ${a.detail}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
