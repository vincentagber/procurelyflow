import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Users, FileText, Send, Banknote } from "lucide-react";

import { platformOrgsFn, provisionOrgFn, setOrgStatusFn } from "@/lib/platform.functions";
import { money, shortDate } from "@/lib/format";
import {
  BILLING_STATUS_LABELS,
  PLAN_LABELS,
  SUBSCRIPTION_PLANS,
  type SubscriptionPlan,
} from "@/lib/billing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/platform-admin/")({
  head: () => ({
    meta: [
      { title: "Platform Admin — Organizations | Procurely" },
      {
        name: "description",
        content:
          "Procurely platform staff console: review customer organizations, plans, usage and account status.",
      },
      { property: "og:title", content: "Platform Admin — Organizations | Procurely" },
      {
        property: "og:description",
        content: "Provision, review and suspend customer organizations across Procurely.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OrganizationsPage,
});

const STATUS_STYLES: Record<string, string> = {
  trial: "bg-accent/10 text-accent",
  active: "bg-primary/10 text-primary",
  overdue: "bg-signal/15 text-signal",
  suspended: "bg-foreground/10 text-foreground",
};

function StatusTag({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
        STATUS_STYLES[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {BILLING_STATUS_LABELS[status] ?? status}
    </span>
  );
}

function OrganizationsPage() {
  const orgs = useQuery({ queryKey: ["platform-orgs"], queryFn: () => platformOrgsFn() });
  const [statusTarget, setStatusTarget] = useState<{
    id: string;
    name: string;
    suspended: boolean;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function applyStatus() {
    if (!statusTarget) return;
    setBusy(true);
    try {
      await setOrgStatusFn({
        data: {
          orgId: statusTarget.id,
          status: statusTarget.suspended ? "active" : "suspended",
          ...(reason ? { reason } : {}),
        },
      });
      toast.success(
        statusTarget.suspended
          ? `${statusTarget.name} reactivated.`
          : `${statusTarget.name} suspended. Their data is retained.`,
      );
      setStatusTarget(null);
      setReason("");
      await orgs.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title text-3xl">Organizations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every customer tenant on Procurely. Visibility here is read-only — provisioning, plan
            and status changes are the only writes, and all of them are audit-logged.
          </p>
        </div>
        <ProvisionDialog onDone={() => orgs.refetch()} />
      </div>

      {orgs.isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">Loading organizations…</p>
      ) : orgs.error ? (
        <p className="mt-8 text-sm text-signal">
          {orgs.error instanceof Error ? orgs.error.message : "Couldn't load organizations."}
        </p>
      ) : !orgs.data?.length ? (
        <p className="mt-8 text-sm text-muted-foreground">
          No organizations yet. Provision the first customer to get started.
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {orgs.data.map((org) => (
            <div
              key={org.id}
              className="rounded-lg border border-border bg-card p-4 md:flex md:items-start md:justify-between md:gap-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to="/platform-admin/$orgId"
                    params={{ orgId: org.id }}
                    className="font-display text-xl uppercase tracking-wide text-foreground hover:text-accent"
                  >
                    {org.name}
                  </Link>
                  <StatusTag status={org.status} />
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {PLAN_LABELS[org.plan] ?? org.plan}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {org.contactName ? `${org.contactName} · ` : ""}
                  {org.contactEmail ?? "No primary contact"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Created {shortDate(org.createdAt)}
                  {org.status === "suspended" && org.suspensionReason
                    ? ` · Suspended: ${org.suspensionReason}`
                    : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" aria-hidden /> {org.users} users
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" aria-hidden />
                    {org.requisitionsThisMonth} requisitions this month
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Send className="h-3.5 w-3.5" aria-hidden />
                    {org.rfqsThisMonth} RFQs this month
                  </span>
                  {org.openInvoices ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5",
                        org.overdueInvoices ? "font-semibold text-signal" : "",
                      )}
                    >
                      <Banknote className="h-3.5 w-3.5" aria-hidden />
                      {org.overdueInvoices
                        ? `${org.overdueInvoices} overdue invoice${org.overdueInvoices > 1 ? "s" : ""} · `
                        : `${org.openInvoices} unpaid · `}
                      {money(org.outstandingAmount, "NGN")} outstanding
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 flex shrink-0 gap-2 md:mt-0">
                <Button asChild variant="outline" size="sm">
                  <Link to="/platform-admin/$orgId" params={{ orgId: org.id }}>
                    Review
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant={org.status === "suspended" ? "default" : "destructive"}
                  onClick={() =>
                    setStatusTarget({
                      id: org.id,
                      name: org.name,
                      suspended: org.status === "suspended",
                    })
                  }
                >
                  {org.status === "suspended" ? "Reactivate" : "Suspend"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={!!statusTarget}
        onOpenChange={(open) => {
          if (!open) {
            setStatusTarget(null);
            setReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {statusTarget?.suspended ? "Reactivate" : "Suspend"} {statusTarget?.name}
            </DialogTitle>
            <DialogDescription>
              {statusTarget?.suspended
                ? "Members regain access immediately."
                : "Members can't sign in while suspended. All of their data is retained and returns untouched on reactivation."}
            </DialogDescription>
          </DialogHeader>
          {!statusTarget?.suspended ? (
            <div>
              <Label htmlFor="suspend-reason">Reason (recorded in the audit log)</Label>
              <Textarea
                id="suspend-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Pilot ended, invoice unpaid"
                className="mt-1.5"
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant={statusTarget?.suspended ? "default" : "destructive"}
              onClick={applyStatus}
              disabled={busy}
            >
              {busy ? "Saving…" : statusTarget?.suspended ? "Reactivate" : "Suspend access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProvisionDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [plan, setPlan] = useState<SubscriptionPlan>("starter");
  const [status, setStatus] = useState<"trial" | "active">("trial");
  const [adminFullName, setAdminFullName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await provisionOrgFn({
        data: { orgName, plan, status, adminFullName, adminEmail, adminPassword },
      });
      toast.success(`${orgName} provisioned with ${adminEmail} as its first Admin.`);
      setOpen(false);
      setOrgName("");
      setAdminFullName("");
      setAdminEmail("");
      setAdminPassword("");
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't provision that org.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" aria-hidden /> New organization
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Provision a customer organization</DialogTitle>
          <DialogDescription>
            Creates the tenant, its default approval thresholds, and its first Admin user.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label htmlFor="org-name">Organization name</Label>
            <Input
              id="org-name"
              required
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="org-plan">Subscription plan</Label>
              <Select value={plan} onValueChange={(v) => setPlan(v as SubscriptionPlan)}>
                <SelectTrigger id="org-plan" className="mt-1.5">
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
            <div>
              <Label htmlFor="org-status">Initial status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as "trial" | "active")}>
                <SelectTrigger id="org-status" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="admin-name">First Admin — full name</Label>
            <Input
              id="admin-name"
              required
              value={adminFullName}
              onChange={(e) => setAdminFullName(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="admin-email">First Admin — email</Label>
            <Input
              id="admin-email"
              type="email"
              required
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="admin-password">Temporary password</Label>
            <Input
              id="admin-password"
              type="text"
              required
              minLength={10}
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="At least 10 characters — share securely, ask them to change it"
              className="mt-1.5"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Provisioning…" : "Create organization"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
