"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Image, Printer, Send, Plus } from "lucide-react";

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

export default function RequisitionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  const me = useMe();
  const router = useRouter();
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

  const duplicate = useMutation({
    mutationFn: () => duplicateRequisitionFn({ data: { requisitionId: id } }),
    onSuccess: (res) => {
      toast.success("Requisition duplicated as a new draft.");
      router.push(`/requisitions/${res.newRequisitionId}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't duplicate request."),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading request…</p>;
  const req = data?.requisition;
  if (!req) return <p className="text-sm text-muted-foreground">This request no longer exists.</p>;

  const isOwner = req.requester_id === me.data?.userId;
  const canBuy = can(me.data?.roles, ["procurement_officer", "admin"]);

  return (
    <div className="space-y-5 pb-10 font-sans">
      <PageHeader
        title={req.title}
        subtitle={`${req.reference} · raised ${shortDate(req.created_at)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {req.status === "draft" && isOwner ? (
              <Button onClick={() => submit.mutate()} disabled={submit.isPending} className="h-10">
                Submit for Approval
              </Button>
            ) : null}
            {req.status === "approved" && canBuy ? (
              <Button
                onClick={() => setRfqOpen((v) => !v)}
                className="h-10 bg-[#111315] text-xs font-semibold text-white"
              >
                {rfqOpen ? "Close RFQ Panel" : "Request Supplier Quotes"}
              </Button>
            ) : null}
            <Button
              variant="outline"
              onClick={() => duplicate.mutate()}
              disabled={duplicate.isPending}
              className="h-10"
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Duplicate
            </Button>
            <Button variant="outline" onClick={() => window.print()} className="h-10">
              <Printer className="mr-1.5 h-3.5 w-3.5" /> Print
            </Button>
          </div>
        }
      />

      {rfqOpen ? <RfqComposer requisitionId={id} onDone={() => setRfqOpen(false)} /> : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {/* Summary Banner */}
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-xs">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                  Project / Cost Center
                </span>
                <p className="mt-1 text-sm font-semibold text-[#111315]">
                  {(req.projects as { name?: string })?.name ?? "—"}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                  Total Value
                </span>
                <p className="mt-1 text-sm font-bold text-[#111315]">
                  {money(req.total_amount, req.currency)}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                  Status
                </span>
                <div className="mt-1">
                  <StatusPill status={req.status} label={STATUS_LABELS[req.status]} />
                </div>
              </div>
            </div>
            {(req as { delivery_location?: string | null }).delivery_location ? (
              <div className="mt-4 border-t border-[#F3F4F6] pt-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                  Site Delivery Location / Drop-off Point (FR-1.1)
                </span>
                <p className="mt-1 text-xs font-semibold text-[#111315]">
                  {(req as { delivery_location?: string | null }).delivery_location}
                </p>
              </div>
            ) : null}
            {req.notes ? (
              <div className="mt-4 border-t border-[#F3F4F6] pt-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                  Notes from Site
                </span>
                <p className="mt-1 text-xs text-[#374151]">{req.notes}</p>
              </div>
            ) : null}
          </div>

          {/* Items Table */}
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-xs">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#111315]">
              Line Items ({data?.items.length})
            </h2>
            <div className="mt-3 overflow-x-auto rounded-lg border border-[#E5E7EB]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F9FAFB] text-[11px] font-semibold text-[#6B7280]">
                  <tr>
                    <th className="px-3 py-2.5">#</th>
                    <th className="px-3 py-2.5">Description</th>
                    <th className="px-3 py-2.5">Quantity</th>
                    <th className="px-3 py-2.5">Est. Unit Price</th>
                    <th className="px-3 py-2.5 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {data?.items.map((item, index) => (
                    <tr key={item.id} className="hover:bg-[#F9FAFB]/70">
                      <td className="px-3 py-3 text-[#9CA3AF] font-mono">{index + 1}</td>
                      <td className="px-3 py-3 font-medium text-[#111315]">
                        {item.description}
                        {Array.isArray(item.attachments) && item.attachments.length ? (
                          <div className="mt-1.5">
                            <AttachmentThumbs
                              attachments={item.attachments as unknown as { path: string; name: string }[]}
                            />
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        {item.quantity} {item.unit}
                      </td>
                      <td className="px-3 py-3 tabular-nums">
                        {money(item.estimated_unit_price, req.currency)}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-[#111315]">
                        {money(
                          Number(item.quantity) * Number(item.estimated_unit_price),
                          req.currency,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Sidebar: Approval & Audit Trail */}
        <div className="space-y-4">
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#111315]">
              Approval Chain
            </h3>
            <ul className="mt-3 space-y-2.5">
              {data?.steps.map((s) => (
                <li
                  key={s.id}
                  className="flex items-start gap-2.5 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-2.5 text-xs"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#111315] text-[10px] font-bold text-white">
                    {s.step_order}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-[#111315]">
                      {ROLE_LABELS[s.required_role] ?? s.required_role}
                    </p>
                    <p className="text-[10px] text-[#6B7280]">Status: {s.status}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function RfqComposer({ requisitionId, onDone }: { requisitionId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [closesAt, setClosesAt] = useState("");
  const [instructions, setInstructions] = useState("");
  const [links, setLinks] = useState<{ supplierName: string; url: string }[] | null>(null);

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, is_compliant")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: () =>
      createRfqFn({
        data: {
          requisitionId,
          supplierIds: selected,
          closesAt: closesAt ? new Date(closesAt).toISOString() : undefined,
          instructions: instructions || undefined,
        },
      }),
    onSuccess: async (res) => {
      toast.success("RFQ created and invitations generated.");
      setLinks(
        (res.invitations as any[]).map((inv) => ({
          supplierName: suppliers?.find((s) => s.id === inv.supplier_id)?.name ?? "Supplier",
          url: `${window.location.origin}/quote/${inv.token}`,
        })),
      );
      await queryClient.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't send RFQ."),
  });

  if (links) {
    return (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <h3 className="text-sm font-bold text-emerald-950">Supplier Quoting Links Generated</h3>
        <p className="mt-1 text-xs text-emerald-800">
          Share these individual links with each invited supplier via WhatsApp or Email:
        </p>
        <ul className="mt-3 space-y-2">
          {links.map((link, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-white p-3 text-xs"
            >
              <div>
                <span className="font-bold text-[#111315]">{link.supplierName}</span>
                <p className="font-mono text-[11px] text-[#6B7280] truncate max-w-md">{link.url}</p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(link.url);
                  toast.success(`Copied quoting link for ${link.supplierName}`);
                }}
                className="h-8 text-xs font-semibold"
              >
                <Copy className="mr-1 h-3.5 w-3.5" /> Copy Link
              </Button>
            </li>
          ))}
        </ul>
        <Button onClick={onDone} className="mt-4 bg-[#111315] text-xs text-white">
          Done
        </Button>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-xs">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[#111315]">
        Issue Digital RFQ to Suppliers
      </h3>
      <p className="mt-1 text-xs text-[#6B7280]">
        Select approved suppliers to receive sealed quotation requests.
      </p>

      <div className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Select Suppliers</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {suppliers?.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-2 rounded-lg border border-[#E5E7EB] p-2.5 text-xs"
              >
                <Checkbox
                  checked={selected.includes(s.id)}
                  onCheckedChange={(checked) => {
                    if (checked) setSelected([...selected, s.id]);
                    else setSelected(selected.filter((item) => item !== s.id));
                  }}
                />
                <span className="font-medium text-[#111315]">{s.name}</span>
                {s.is_compliant ? (
                  <span className="ml-auto text-[10px] text-emerald-600 font-bold">Compliant</span>
                ) : null}
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Quotation Deadline</Label>
            <Input
              type="date"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
              className="h-10 text-xs"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Special Instructions to Suppliers</Label>
          <Textarea
            rows={2}
            placeholder="e.g. Specify site delivery timeline and warranty terms."
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            className="text-xs"
          />
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            disabled={!selected.length || create.isPending}
            onClick={() => create.mutate()}
            className="bg-[#111315] text-xs font-semibold text-white hover:bg-[#202428]"
          >
            <Send className="mr-1.5 h-3.5 w-3.5" /> Dispatch RFQ Links
          </Button>
          <Button variant="outline" onClick={onDone} className="text-xs">
            Cancel
          </Button>
        </div>
      </div>
    </section>
  );
}
