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
import { motion, itemFadeIn, staggerContainer } from "@/components/ui/animated";

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
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="space-y-6 pb-12"
    >
      <motion.div variants={itemFadeIn}>
        <PageHeader
          title="Suppliers"
          subtitle="Only compliant suppliers can be recommended as the lowest bid."
        />
      </motion.div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <motion.div variants={itemFadeIn} className="overflow-x-auto rounded-lg border border-border bg-card shadow-xs">
          {isLoading ? (
            <p className="p-5 text-sm text-muted-foreground">Loading suppliers…</p>
          ) : !data?.length ? (
            <EmptyState
              title="No suppliers yet"
              body="Add your approved suppliers so your team can invite them to RFQs."
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface">
                <tr className="text-left font-semibold text-muted-foreground">
                  <th className="px-3 py-2.5">Supplier</th>
                  <th className="px-3 py-2.5">Contact</th>
                  <th className="px-3 py-2.5">Tax / RC ID</th>
                  <th className="px-3 py-2.5 text-right">Compliant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.map((s) => (
                  <motion.tr key={s.id} variants={itemFadeIn} className="hover:bg-surface/60 transition-colors">
                    <td className="px-3 py-3 font-semibold text-foreground">{s.name}</td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {s.contact_name || s.email ? (
                        <div>
                          <p className="font-medium text-foreground">{s.contact_name}</p>
                          <p className="text-xs text-muted-foreground">{s.email || s.phone}</p>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                      {s.tax_id || "—"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Switch
                        checked={s.is_compliant}
                        disabled={!editable || toggleCompliance.isPending}
                        onCheckedChange={(val) =>
                          toggleCompliance.mutate({ id: s.id, value: val })
                        }
                      />
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </motion.div>

        {editable ? (
          <motion.form
            variants={itemFadeIn}
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
            className="h-fit rounded-lg border border-border bg-card p-4 shadow-xs space-y-3"
          >
            <p className="data-label">Add a supplier</p>
            <div className="space-y-1">
              <Label htmlFor="s-name">Company name</Label>
              <Input
                id="s-name"
                required
                className="h-10"
                placeholder="e.g. Dangote Cement Plc"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="s-contact">Contact person (optional)</Label>
              <Input
                id="s-contact"
                className="h-10"
                placeholder="e.g. Tunde Adeyemi"
                value={form.contact_name}
                onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="s-email">Email (optional)</Label>
              <Input
                id="s-email"
                type="email"
                className="h-10"
                placeholder="sales@supplier.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="s-phone">Phone (optional)</Label>
              <Input
                id="s-phone"
                className="h-10"
                placeholder="+234 803 000 0000"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="s-tax">Tax ID / RC number (optional)</Label>
              <Input
                id="s-tax"
                className="h-10"
                placeholder="e.g. RC-1234567"
                value={form.tax_id}
                onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
              />
            </div>
            <Button className="h-10 w-full font-semibold shadow-xs" disabled={add.isPending}>
              {add.isPending ? "Adding…" : "Add supplier"}
            </Button>
          </motion.form>
        ) : null}
      </div>
    </motion.div>
  );
}
