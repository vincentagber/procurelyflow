import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Image, Printer } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useMe, can } from "@/lib/useMe";
import {
  createRfqFn,
  submitRequisitionFn,
  duplicateRequisitionFn,
} from "@/lib/procurement.functions";
import { money, shortDate, dateTime, ROLE_LABELS, STATUS_LABELS } from "@/lib/format";
import { PageHeader, StatusPill } from "@/components/procurely/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { AttachmentThumbs } from "@/components/procurely/AttachmentThumbs";

export const Route = createFileRoute("/_authenticated/requisitions/$id")({
  head: () => ({
    meta: [
      { title: "Requisition detail — Procurely Flow" },
      {
        name: "description",
        content: "Items, approval chain and permanent audit trail for a single material request.",
      },
      { property: "og:title", content: "Requisition detail — Procurely Flow" },
      { property: "og:description", content: "Full history of one procurement request." },
    ],
  }),
  component: RequisitionDetail,
});

function RequisitionDetail() {
  const { id } = Route.useParams();
  const me = useMe();
  const queryClient = useQueryClient();
  const [rfqOpen, setRfqOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["requisition", id],
    queryFn: async () => {
      const [req, items, steps, audit] = await Promise.all([
        supabase.from("requisitions").select("*, projects(name)").eq("id", id).maybeSingle(),
        supabase.from("requisition_items").select("*").eq("requisition_id", id).order("sort_order"),
        supabase.from("approval_steps").select("*").eq("requisition_id", id).order("step_order"),
        supabase
          .from("approval_audit_log")
          .select("*")
          .eq("requisition_id", id)
          .order("created_at", { ascending: false }),
      ]);
      return {
        requisition: req.data,
        items: items.data ?? [],
        steps: steps.data ?? [],
        audit: audit.data ?? [],
      };
    },
  });

  const submit = useMutation({
    mutationFn: () => submitRequisitionFn({ data: { requisitionId: id } }),
    onSuccess: async () => {
      toast.success("Submitted. The approval chain has been notified.");
      await queryClient.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't submit this request."),
  });

  const navigate = useNavigate();

  const duplicate = useMutation({
    mutationFn: () => duplicateRequisitionFn({ data: { requisitionId: id } }),
    onSuccess: (res) => {
      toast.success("Requisition duplicated as a new draft.");
      navigate({ to: "/requisitions/$id", params: { id: res.newRequisitionId } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't duplicate request."),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading request…</p>;
  const req = data?.requisition;
  if (!req) return <p className="text-sm text-muted-foreground">This request no longer exists.</p>;

  const isOwner = req.requester_id === me.data?.userId;
  const canBuy = can(me.data?.roles, ["procurement_officer", "admin"]);

  return (
    <div className="space-y-5 pb-10">
      <PageHeader
        title={req.title}
        subtitle={`${req.reference} · raised ${shortDate(req.created_at)}`}
        actions={
          <>
            {req.status === "draft" && isOwner ? (
              <Button className="h-11" disabled={submit.isPending} onClick={() => submit.mutate()}>
                Submit for approval
              </Button>
            ) : null}
            {req.status === "approved" && canBuy ? (
              <Button className="h-11" onClick={() => setRfqOpen((v) => !v)}>
                {rfqOpen ? "Close" : "Request quotes"}
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="h-11"
              disabled={duplicate.isPending}
              onClick={() => duplicate.mutate()}
            >
              <Copy className="mr-1.5 h-4 w-4" /> Duplicate
            </Button>
            <Button variant="outline" className="h-11" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-4 w-4" /> Export PDF
            </Button>
            <Button asChild variant="outline" className="h-11 print:hidden">
              <Link to="/requisitions">All requisitions</Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusPill status={req.status} label={STATUS_LABELS[req.status]} />
        {req.is_unbudgeted ? <StatusPill status="pending" label="Unbudgeted" /> : null}
        <span className="text-sm text-muted-foreground">
          Project / cost center: {(req.projects as { name: string } | null)?.name ?? "—"}
        </span>
        <span className="text-sm text-muted-foreground">Needed by {shortDate(req.needed_by)}</span>
        <span className="ml-auto font-display text-2xl">
          {money(req.total_amount, req.currency)}
        </span>
      </div>

      {rfqOpen ? <RfqComposer requisitionId={id} onDone={() => setRfqOpen(false)} /> : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <section className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-surface">
              <tr className="text-left">
                <th className="px-3 py-2.5 data-label">Item</th>
                <th className="px-3 py-2.5 data-label">Qty</th>
                <th className="px-3 py-2.5 data-label">Est. unit</th>
                <th className="px-3 py-2.5 data-label">Line total</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id} className="border-t border-border">
                  <td className="px-3 py-3">
                    <p>{item.description}</p>
                    <AttachmentThumbs attachments={item.attachments} />
                  </td>
                  <td className="px-3 py-3 tabular-nums">
                    {Number(item.quantity)} {item.unit}
                  </td>
                  <td className="px-3 py-3 tabular-nums">
                    {money(item.estimated_unit_price, req.currency)}
                  </td>
                  <td className="px-3 py-3 tabular-nums">
                    {money(Number(item.quantity) * Number(item.estimated_unit_price), req.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {req.notes ? (
            <p className="border-t border-border px-3 py-3 text-sm text-muted-foreground">
              {req.notes}
            </p>
          ) : null}
        </section>

        <aside className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="data-label">Approval chain</h2>
            {data.steps.length ? (
              <ol className="mt-3 space-y-3">
                {data.steps.map((step) => (
                  <li key={step.id} className="border-l-2 border-border pl-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {step.step_order}. {ROLE_LABELS[step.required_role] ?? step.required_role}
                      </span>
                      <StatusPill status={step.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">{step.reason}</p>
                    {step.decided_at ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {dateTime(step.decided_at)}
                        {step.comment ? ` — "${step.comment}"` : ""}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Not submitted yet — the chain is generated from your organization's threshold rules
                the moment this is sent for approval.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="data-label">Audit trail</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Permanent record. Entries can never be edited or removed.
            </p>
            <ul className="mt-3 space-y-3">
              {data.audit.length ? (
                data.audit.map((entry) => (
                  <li key={entry.id} className="text-sm">
                    <span className="font-medium">{entry.action.replace(/_/g, " ")}</span>
                    <span className="block text-xs text-muted-foreground">
                      {entry.actor_name} · {dateTime(entry.created_at)}
                    </span>
                    {entry.detail ? (
                      <span className="block text-xs text-muted-foreground">{entry.detail}</span>
                    ) : null}
                  </li>
                ))
              ) : (
                <li className="text-sm text-muted-foreground">Nothing logged yet.</li>
              )}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function RfqComposer({ requisitionId, onDone }: { requisitionId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [instructions, setInstructions] = useState("");
  const [closesAt, setClosesAt] = useState(
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  );
  const [links, setLinks] = useState<{ name: string; url: string }[]>([]);

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("suppliers")
        .select("id, name, email, is_compliant")
        .order("name");
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () =>
      createRfqFn({
        data: {
          requisitionId,
          supplierIds: selected,
          instructions: instructions || undefined,
          closesAt: new Date(`${closesAt}T23:59:00`).toISOString(),
        },
      }),
    onSuccess: async (result) => {
      const byId = new Map((suppliers ?? []).map((s) => [s.id, s.name]));
      setLinks(
        result.invitations.map((i) => ({
          name: byId.get(i.supplier_id) ?? "Supplier",
          url: `${window.location.origin}/quote/${i.token}`,
        })),
      );
      toast.success(`${result.reference} created. Share each private link with its supplier.`);
      await queryClient.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't create this RFQ."),
  });

  if (links.length) {
    return (
      <section className="rounded-lg border border-accent/40 bg-accent/5 p-4">
        <h2 className="font-display text-xl uppercase tracking-wide">Private supplier links</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Each link is unique and expires with the RFQ. A supplier can only ever see their own
          quote.
        </p>
        <ul className="mt-3 space-y-2">
          {links.map((link) => (
            <li key={link.url} className="rounded-md border border-border bg-card p-3">
              <p className="text-sm font-medium">{link.name}</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-surface px-2 py-1.5 text-xs">
                  {link.url}
                </code>
                <Button
                  variant="outline"
                  aria-label="Copy link"
                  className="h-10 shrink-0"
                  onClick={() => {
                    navigator.clipboard.writeText(link.url);
                    toast.success("Link copied.");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <Button className="mt-4 h-11" onClick={onDone}>
          Done
        </Button>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="font-display text-xl uppercase tracking-wide">Request quotes</h2>
      {!suppliers?.length ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Add suppliers first, then you can invite them to quote.{" "}
          <Link to="/suppliers" className="text-accent underline">
            Go to suppliers
          </Link>
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick who to invite. Each supplier gets their own expiring link — no login needed.
          </p>
          <div className="mt-3 space-y-2">
            {suppliers.map((s) => (
              <label
                key={s.id}
                className="tap-row flex items-center gap-3 rounded-md border border-border px-3"
              >
                <Checkbox
                  checked={selected.includes(s.id)}
                  onCheckedChange={(checked) =>
                    setSelected((prev) =>
                      checked ? [...prev, s.id] : prev.filter((x) => x !== s.id),
                    )
                  }
                />
                <span className="text-sm">
                  {s.name}
                  {!s.is_compliant ? (
                    <span className="ml-2 text-xs text-destructive">non-compliant</span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="closes">Quotes close</Label>
              <Input
                id="closes"
                type="date"
                className="h-12"
                value={closesAt}
                onChange={(e) => setClosesAt(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <Label htmlFor="instructions">Instructions to suppliers (optional)</Label>
            <Textarea
              id="instructions"
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Delivery location, quality expectations, payment terms you can accept."
            />
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              className="h-11"
              disabled={!selected.length || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? "Creating…" : "Send RFQ"}
            </Button>
            <Button variant="outline" className="h-11" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
