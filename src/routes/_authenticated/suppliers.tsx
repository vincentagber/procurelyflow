import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useMe, can } from "@/lib/useMe";
import { PageHeader, EmptyState } from "@/components/procurely/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({
    meta: [
      { title: "Suppliers — Procurely Flow" },
      {
        name: "description",
        content: "Your approved supplier list, contacts, tax IDs and compliance status.",
      },
      { property: "og:title", content: "Suppliers — Procurely Flow" },
      { property: "og:description", content: "Manage who you can invite to quote." },
    ],
  }),
  component: Suppliers,
});

function Suppliers() {
  const me = useMe();
  const queryClient = useQueryClient();
  const editable = can(me.data?.roles, ["procurement_officer", "admin"]);
  const [form, setForm] = useState({
    name: "",
    contact_name: "",
    email: "",
    phone: "",
    tax_id: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, contact_name, email, phone, tax_id, is_compliant")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("suppliers").insert({
        org_id: me.data!.profile!.org_id!,
        name: form.name.trim(),
        contact_name: form.contact_name || null,
        email: form.email || null,
        phone: form.phone || null,
        tax_id: form.tax_id || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Supplier added. You can invite them to quote right away.");
      setForm({ name: "", contact_name: "", email: "", phone: "", tax_id: "" });
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't add that supplier."),
  });

  const toggleCompliance = useMutation({
    mutationFn: async (input: { id: string; value: boolean }) => {
      const { error } = await supabase
        .from("suppliers")
        .update({ is_compliant: input.value })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't update compliance."),
  });

  return (
    <div className="space-y-5 pb-10">
      <PageHeader
        title="Suppliers"
        subtitle="Only compliant suppliers can be recommended as the lowest bid."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          {isLoading ? (
            <p className="p-5 text-sm text-muted-foreground">Loading suppliers…</p>
          ) : !data?.length ? (
            <EmptyState
              title="No suppliers yet"
              body="Add the vendors you already buy from. You'll invite them to quote with a private link — they never need an account."
            />
          ) : (
            <table className="w-full min-w-[600px] text-sm">
              <thead className="bg-surface">
                <tr className="text-left">
                  <th className="px-3 py-2.5 data-label">Supplier</th>
                  <th className="px-3 py-2.5 data-label">Contact</th>
                  <th className="px-3 py-2.5 data-label">Tax ID</th>
                  <th className="px-3 py-2.5 data-label">Compliant</th>
                </tr>
              </thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-3 py-3 font-medium">{s.name}</td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {s.contact_name ?? "—"}
                      {s.email ? <span className="block text-xs">{s.email}</span> : null}
                      {s.phone ? <span className="block text-xs">{s.phone}</span> : null}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{s.tax_id ?? "—"}</td>
                    <td className="px-3 py-3">
                      <Switch
                        checked={s.is_compliant}
                        disabled={!editable}
                        onCheckedChange={(value) => toggleCompliance.mutate({ id: s.id, value })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {editable ? (
          <aside className="rounded-lg border border-border bg-card p-4">
            <h2 className="font-display text-xl uppercase tracking-wide">Add supplier</h2>
            <form
              className="mt-3 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                add.mutate();
              }}
            >
              {(
                [
                  ["name", "Company name", true],
                  ["contact_name", "Contact person", false],
                  ["email", "Email", false],
                  ["phone", "Phone", false],
                  ["tax_id", "Tax ID (TIN)", false],
                ] as const
              ).map(([key, label, required]) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={key}>{label}</Label>
                  <Input
                    id={key}
                    required={required}
                    className="h-12"
                    value={form[key]}
                    onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
              ))}
              <Button type="submit" className="h-12 w-full" disabled={add.isPending}>
                {add.isPending ? "Saving…" : "Add supplier"}
              </Button>
            </form>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
