"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useMe, can } from "@/lib/useMe";
import { PageHeader, EmptyState } from "@/components/procurely/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function SuppliersPage() {
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
      toast.success("Supplier added to directory.");
      setForm({ name: "", contact_name: "", email: "", phone: "", tax_id: "" });
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't add supplier."),
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
    <div className="space-y-5 pb-10 font-sans">
      <PageHeader
        title="Suppliers"
        subtitle="Manage your approved supplier directory and compliance certifications."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* Suppliers List */}
        <div className="overflow-x-auto rounded-xl border border-[#E5E7EB] bg-white shadow-xs">
          {isLoading ? (
            <p className="p-5 text-xs text-[#6B7280]">Loading suppliers…</p>
          ) : !data?.length ? (
            <EmptyState
              title="No suppliers registered yet"
              body="Add suppliers to your directory to begin inviting them to digital RFQs."
            />
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F9FAFB] text-[11px] font-semibold text-[#6B7280]">
                <tr>
                  <th className="px-3 py-2.5">Name</th>
                  <th className="px-3 py-2.5">Contact</th>
                  <th className="px-3 py-2.5">Email / Phone</th>
                  <th className="px-3 py-2.5">TIN / Tax ID</th>
                  <th className="px-3 py-2.5">Compliance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {data.map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-3 font-bold text-[#111315]">{s.name}</td>
                    <td className="px-3 py-3 text-[#6B7280]">{s.contact_name || "—"}</td>
                    <td className="px-3 py-3 text-[#6B7280]">{s.email || s.phone || "—"}</td>
                    <td className="px-3 py-3 font-mono text-xs">{s.tax_id || "—"}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={s.is_compliant}
                          disabled={!editable || toggleCompliance.isPending}
                          onCheckedChange={(val) =>
                            toggleCompliance.mutate({ id: s.id, value: val })
                          }
                        />
                        <span className="text-[10px] font-semibold uppercase text-[#6B7280]">
                          {s.is_compliant ? "Compliant" : "Unverified"}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Add Supplier Form */}
        {editable && (
          <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-xs">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#111315]">
              Add New Supplier
            </h2>

            <div className="mt-4 space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Company Name</Label>
                <Input
                  placeholder="e.g. Dangote Cement Plc"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="h-10 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Contact Person</Label>
                <Input
                  placeholder="e.g. Adeola Johnson"
                  value={form.contact_name}
                  onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                  className="h-10 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  placeholder="supplier@domain.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="h-10 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">WhatsApp / Phone</Label>
                <Input
                  placeholder="+234..."
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="h-10 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Tax ID / TIN</Label>
                <Input
                  placeholder="e.g. 10293847-0001"
                  value={form.tax_id}
                  onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
                  className="h-10 text-xs"
                />
              </div>

              <Button
                disabled={!form.name || add.isPending}
                onClick={() => add.mutate()}
                className="mt-2 w-full bg-[#111315] text-xs font-semibold text-white hover:bg-[#202428]"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Save Supplier
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
