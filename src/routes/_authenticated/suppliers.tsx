import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Pencil,
  Trash2,
  Search,
  Building2,
  AlertTriangle,
  Plus,
  X,
  Check,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useMe, can } from "@/lib/useMe";
import { cn } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/procurely/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { motion, itemFadeIn, staggerContainer } from "@/components/ui/animated";

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({
    meta: [
      { title: "Suppliers — Procurely Flow" },
      {
        name: "description",
        content: "Approved supplier directory, tax identification, and digital RFQ compliance.",
      },
      { property: "og:title", content: "Suppliers — Procurely Flow" },
      { property: "og:description", content: "Manage approved vendors and invitation eligibility." },
    ],
  }),
  component: Suppliers,
});

interface SupplierItem {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  tax_id: string | null;
  is_compliant: boolean;
}

function Suppliers() {
  const me = useMe();
  const queryClient = useQueryClient();
  const editable = can(me.data?.roles, ["procurement_officer", "admin"]);

  // Search filter
  const [searchQuery, setSearchQuery] = useState("");

  // Add form state
  const [form, setForm] = useState({
    name: "",
    contact_name: "",
    email: "",
    phone: "",
    tax_id: "",
  });

  // Edit dialog state
  const [editingSupplier, setEditingSupplier] = useState<SupplierItem | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    contact_name: "",
    email: "",
    phone: "",
    tax_id: "",
    is_compliant: true,
  });

  // Delete dialog state
  const [deletingSupplier, setDeletingSupplier] = useState<SupplierItem | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, contact_name, email, phone, tax_id, is_compliant")
        .order("name");
      if (error) throw error;
      return (data as SupplierItem[]) ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("suppliers").insert({
        org_id: me.data!.profile!.org_id!,
        name: form.name.trim(),
        contact_name: form.contact_name?.trim() || null,
        email: form.email?.trim() || null,
        phone: form.phone?.trim() || null,
        tax_id: form.tax_id?.trim() || null,
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

  const update = useMutation({
    mutationFn: async () => {
      if (!editingSupplier) return;
      const { error } = await supabase
        .from("suppliers")
        .update({
          name: editForm.name.trim(),
          contact_name: editForm.contact_name?.trim() || null,
          email: editForm.email?.trim() || null,
          phone: editForm.phone?.trim() || null,
          tax_id: editForm.tax_id?.trim() || null,
          is_compliant: editForm.is_compliant,
        })
        .eq("id", editingSupplier.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Supplier profile updated successfully.");
      setEditingSupplier(null);
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't update supplier profile."),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Supplier removed from directory.");
      setDeletingSupplier(null);
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (e) =>
      toast.error(
        e instanceof Error
          ? e.message
          : "Couldn't delete supplier. They may be linked to existing Purchase Orders or RFQs.",
      ),
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

  function openEditModal(supplier: SupplierItem) {
    setEditingSupplier(supplier);
    setEditForm({
      name: supplier.name,
      contact_name: supplier.contact_name || "",
      email: supplier.email || "",
      phone: supplier.phone || "",
      tax_id: supplier.tax_id || "",
      is_compliant: supplier.is_compliant,
    });
  }

  const filteredSuppliers = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.toLowerCase().trim();
    if (!q) return data;
    return data.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.contact_name || "").toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q) ||
        (s.phone || "").toLowerCase().includes(q) ||
        (s.tax_id || "").toLowerCase().includes(q),
    );
  }, [data, searchQuery]);

  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="space-y-6 pb-16 max-w-7xl mx-auto"
    >
      <motion.div variants={itemFadeIn}>
        <PageHeader
          title="Suppliers"
          subtitle="Only compliant suppliers can be recommended as the lowest bid."
        />
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Suppliers List Table & Search */}
        <motion.div
          variants={itemFadeIn}
          className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs space-y-4"
        >
          {/* Table Header / Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Approved Vendors</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                {filteredSuppliers.length}
              </span>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                type="text"
                placeholder="Search vendor, contact, TIN…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 rounded-lg border-slate-200 bg-white pl-8 text-xs shadow-2xs placeholder:text-slate-400 focus-visible:border-[#0B1457]"
              />
            </div>
          </div>

          {isLoading ? (
            <p className="py-12 text-center text-xs text-slate-500">Loading suppliers…</p>
          ) : !filteredSuppliers.length ? (
            <div className="py-12 text-center space-y-2">
              <p className="text-xs font-semibold text-slate-900">
                {searchQuery ? "No suppliers match your search." : "No suppliers registered yet."}
              </p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                {searchQuery
                  ? "Try searching for a different company name, contact, or tax identification."
                  : "Add approved suppliers to your directory to begin issuing digital RFQs."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-medium text-xs">
                  <tr>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Tax / RC ID</th>
                    <th className="px-4 py-3 text-center">Compliant</th>
                    {editable && <th className="px-4 py-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSuppliers.map((s) => (
                    <motion.tr
                      key={s.id}
                      variants={itemFadeIn}
                      className="hover:bg-slate-50/60 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{s.name}</p>
                      </td>

                      <td className="px-4 py-3 text-slate-600">
                        {s.contact_name || s.email || s.phone ? (
                          <div className="space-y-0.5">
                            {s.contact_name && (
                              <p className="font-medium text-slate-800">{s.contact_name}</p>
                            )}
                            {s.email && (
                              <p className="text-[11px] text-slate-500">{s.email}</p>
                            )}
                            {s.phone && (
                              <p className="text-[11px] text-slate-500 tabular-nums">{s.phone}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-700">
                        {s.tax_id || <span className="text-slate-400 font-sans">—</span>}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Switch
                            checked={s.is_compliant}
                            disabled={!editable || toggleCompliance.isPending}
                            onCheckedChange={(val) =>
                              toggleCompliance.mutate({ id: s.id, value: val })
                            }
                          />
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border",
                              s.is_compliant
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-slate-100 text-slate-600 border-slate-200",
                            )}
                          >
                            {s.is_compliant ? "Compliant" : "Pending"}
                          </span>
                        </div>
                      </td>

                      {editable && (
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(s)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-[#0B1457] hover:bg-slate-100 transition-colors"
                              title="Edit Supplier Profile"
                              aria-label={`Edit ${s.name}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => setDeletingSupplier(s)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                              title="Delete Supplier"
                              aria-label={`Delete ${s.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>

        {/* Add Supplier Sidebar Form */}
        {editable ? (
          <motion.form
            variants={itemFadeIn}
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
            className="h-fit rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs space-y-4"
          >
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">
                Add New Supplier
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Register vendor credentials for RFQ invitations.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="s-name" className="text-xs font-semibold text-slate-700">
                Company / Legal Name
              </Label>
              <Input
                id="s-name"
                required
                className="h-10 rounded-lg border-slate-200 bg-white text-xs shadow-2xs placeholder:text-slate-400 focus-visible:border-[#0B1457]"
                placeholder="e.g. Dangote Cement Plc"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="s-contact" className="text-xs font-semibold text-slate-700">
                Contact Person (Optional)
              </Label>
              <Input
                id="s-contact"
                className="h-10 rounded-lg border-slate-200 bg-white text-xs shadow-2xs placeholder:text-slate-400 focus-visible:border-[#0B1457]"
                placeholder="e.g. Alhaji Musa Ibrahim"
                value={form.contact_name}
                onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="s-email" className="text-xs font-semibold text-slate-700">
                Email Address (Optional)
              </Label>
              <Input
                id="s-email"
                type="email"
                className="h-10 rounded-lg border-slate-200 bg-white text-xs shadow-2xs placeholder:text-slate-400 focus-visible:border-[#0B1457]"
                placeholder="sales@supplier.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="s-phone" className="text-xs font-semibold text-slate-700">
                Phone / WhatsApp (Optional)
              </Label>
              <Input
                id="s-phone"
                className="h-10 rounded-lg border-slate-200 bg-white text-xs shadow-2xs placeholder:text-slate-400 focus-visible:border-[#0B1457]"
                placeholder="+234 803 000 0000"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="s-tax" className="text-xs font-semibold text-slate-700">
                Tax ID / RC Number (Optional)
              </Label>
              <Input
                id="s-tax"
                className="h-10 rounded-lg border-slate-200 bg-white text-xs font-mono shadow-2xs placeholder:text-slate-400 focus-visible:border-[#0B1457]"
                placeholder="e.g. TIN-23490812"
                value={form.tax_id}
                onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
              />
            </div>

            <Button
              type="submit"
              className="h-9 w-full bg-[#0B1457] hover:bg-[#0001FF] text-white text-xs font-medium rounded-lg shadow-xs transition-colors"
              disabled={add.isPending || !form.name.trim()}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              {add.isPending ? "Adding Supplier…" : "Save Supplier"}
            </Button>
          </motion.form>
        ) : null}
      </div>

      {/* Edit Supplier Modal */}
      <Dialog
        open={!!editingSupplier}
        onOpenChange={(open) => !open && setEditingSupplier(null)}
      >
        <DialogContent className="w-[95vw] sm:max-w-lg p-5 sm:p-6 rounded-2xl border border-slate-200 bg-white shadow-xl">
          <DialogHeader className="border-b border-slate-100 pb-3 text-left">
            <DialogTitle className="text-base font-semibold text-slate-900">
              Edit Supplier Profile
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-0.5">
              Update legal entity details, primary contact, tax identification, and bidding eligibility.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate();
            }}
            className="space-y-4 py-2"
          >
            <div className="space-y-1.5">
              <Label htmlFor="edit-name" className="text-xs font-semibold text-slate-700">
                Company / Legal Name
              </Label>
              <Input
                id="edit-name"
                required
                className="h-10 rounded-lg border-slate-200 bg-white text-xs shadow-2xs placeholder:text-slate-400 focus-visible:border-[#0B1457]"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-contact" className="text-xs font-semibold text-slate-700">
                Contact Person
              </Label>
              <Input
                id="edit-contact"
                className="h-10 rounded-lg border-slate-200 bg-white text-xs shadow-2xs placeholder:text-slate-400 focus-visible:border-[#0B1457]"
                placeholder="e.g. Alhaji Musa Ibrahim"
                value={editForm.contact_name}
                onChange={(e) => setEditForm({ ...editForm, contact_name: e.target.value })}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-email" className="text-xs font-semibold text-slate-700">
                  Email Address
                </Label>
                <Input
                  id="edit-email"
                  type="email"
                  className="h-10 rounded-lg border-slate-200 bg-white text-xs shadow-2xs placeholder:text-slate-400 focus-visible:border-[#0B1457]"
                  placeholder="contact@supplier.com"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-phone" className="text-xs font-semibold text-slate-700">
                  Phone / WhatsApp
                </Label>
                <Input
                  id="edit-phone"
                  className="h-10 rounded-lg border-slate-200 bg-white text-xs shadow-2xs placeholder:text-slate-400 focus-visible:border-[#0B1457]"
                  placeholder="+234..."
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-tax" className="text-xs font-semibold text-slate-700">
                Tax ID / RC Number
              </Label>
              <Input
                id="edit-tax"
                className="h-10 rounded-lg border-slate-200 bg-white text-xs font-mono shadow-2xs placeholder:text-slate-400 focus-visible:border-[#0B1457]"
                placeholder="e.g. TIN-23490812"
                value={editForm.tax_id}
                onChange={(e) => setEditForm({ ...editForm, tax_id: e.target.value })}
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-900">Compliance Status</p>
                <p className="text-[11px] text-slate-500">
                  Compliant suppliers can be invited to RFQs and awarded purchase orders.
                </p>
              </div>
              <Switch
                checked={editForm.is_compliant}
                onCheckedChange={(val) => setEditForm({ ...editForm, is_compliant: val })}
              />
            </div>

            <DialogFooter className="border-t border-slate-100 pt-3 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingSupplier(null)}
                className="h-9 px-4 rounded-lg border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={update.isPending || !editForm.name.trim()}
                className="h-9 px-5 rounded-lg bg-[#0B1457] hover:bg-[#0001FF] text-xs font-medium text-white shadow-xs transition-colors"
              >
                {update.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Supplier Confirmation Dialog */}
      <Dialog
        open={!!deletingSupplier}
        onOpenChange={(open) => !open && setDeletingSupplier(null)}
      >
        <DialogContent className="w-[95vw] sm:max-w-md p-5 sm:p-6 rounded-2xl border border-slate-200 bg-white shadow-xl">
          <DialogHeader className="text-left">
            <div className="flex items-center gap-2.5 text-rose-600 pb-1">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 border border-rose-200">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <DialogTitle className="text-base font-semibold text-slate-900">
                Delete Supplier
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-500 mt-1">
              Are you sure you want to delete <strong className="text-slate-900 font-semibold">{deletingSupplier?.name}</strong>? This action will remove this vendor from your organization's directory.
            </DialogDescription>
          </DialogHeader>

          <p className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 leading-relaxed">
            Note: If this supplier is linked to historical purchase orders or legal invoices, deletion may be restricted to preserve fiscal audit integrity.
          </p>

          <DialogFooter className="border-t border-slate-100 pt-3 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingSupplier(null)}
              className="h-9 px-4 rounded-lg border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={remove.isPending}
              onClick={() => deletingSupplier && remove.mutate(deletingSupplier.id)}
              className="h-9 px-5 rounded-lg bg-rose-600 hover:bg-rose-700 text-xs font-medium text-white shadow-xs transition-colors"
            >
              {remove.isPending ? "Deleting…" : "Delete Supplier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
