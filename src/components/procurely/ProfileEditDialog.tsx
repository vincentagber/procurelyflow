import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Camera,
  Trash2,
  User,
  Building2,
  Mail,
  Shield,
  Loader2,
  X,
  Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useUpdateProfile } from "@/lib/useMe";
import { UserAvatar } from "./UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_LABELS } from "@/lib/format";

interface ProfileEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileEditDialog({ open, onOpenChange }: ProfileEditDialogProps) {
  const me = useMe();
  const updateProfile = useUpdateProfile();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Sync state when dialog opens or profile data changes
  useEffect(() => {
    if (me.data?.profile) {
      setFullName(me.data.profile.full_name || "");
      setDepartment(me.data.profile.department || "");
      setAvatarUrl(me.data.profile.avatar_url || null);
    }
  }, [me.data, open]);

  if (!open) return null;

  async function handleAvatarUpload(file: File) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Profile picture must be under 5 MB.");
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Please choose a valid image file (JPG, PNG, WebP).");
      return;
    }

    setIsUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const cleanExt = ext.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      const userId = me.data?.userId || "user";
      const filePath = `${userId}/${Date.now()}_avatar.${cleanExt}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        throw new Error(uploadError.message || "Failed to upload avatar.");
      }

      const { data: publicUrlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(uploadData.path);

      const newUrl = publicUrlData.publicUrl;
      setAvatarUrl(newUrl);
      toast.success("Profile photo uploaded. Click 'Save Changes' to apply.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload photo.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleRemoveAvatar() {
    setAvatarUrl(null);
    toast.info("Profile photo removed. Click 'Save Changes' to apply.");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error("Full name cannot be empty.");
      return;
    }

    try {
      await updateProfile.mutateAsync({
        fullName: fullName.trim(),
        department: department.trim() || null,
        avatarUrl: avatarUrl,
      });
      toast.success("Your profile has been updated successfully.");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-dialog-title"
        className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-2xl animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 id="profile-dialog-title" className="text-lg font-semibold text-slate-900 tracking-tight">
              Edit User Profile
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Update your photo, name, and departmental details.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* Avatar Section */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <div className="relative group shrink-0">
              <UserAvatar
                name={fullName || me.data?.profile?.full_name}
                email={me.data?.email}
                avatarUrl={avatarUrl}
                size="xl"
                className="h-20 w-20 ring-4 ring-white shadow-md text-2xl"
              />
              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              )}
            </div>

            <div className="flex-1 text-center sm:text-left space-y-2">
              <div>
                <p className="text-xs font-semibold text-slate-800">Profile Picture</p>
                <p className="text-[11px] text-slate-500">
                  PNG, JPG, or WebP up to 5MB. Clear face portrait recommended.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 gap-1.5 rounded-lg border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs"
                >
                  <Camera className="h-3.5 w-3.5 text-[#0B1457]" />
                  <span>{avatarUrl ? "Change Photo" : "Upload Photo"}</span>
                </Button>

                {avatarUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isUploading}
                    onClick={handleRemoveAvatar}
                    className="h-8 gap-1.5 rounded-lg text-xs font-medium text-rose-600 hover:bg-rose-50 hover:text-rose-700 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Remove</span>
                  </Button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleAvatarUpload(file);
                  }}
                />
              </div>
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="full-name" className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-slate-400" />
                <span>Full Name *</span>
              </Label>
              <Input
                id="full-name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Vincent Agber"
                className="h-10 text-xs rounded-lg border-slate-200 bg-white shadow-2xs focus-visible:border-[#0B1457]"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="department" className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-slate-400" />
                <span>Department / Unit</span>
              </Label>
              <Input
                id="department"
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Engineering &amp; Operations"
                className="h-10 text-xs rounded-lg border-slate-200 bg-white shadow-2xs focus-visible:border-[#0B1457]"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-slate-400" />
                <span>Email Address (Read-only)</span>
              </Label>
              <Input
                id="email"
                type="email"
                disabled
                value={me.data?.email || ""}
                className="h-10 text-xs rounded-lg border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed shadow-none"
              />
            </div>

            {/* Roles and Org metadata */}
            <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                <Shield className="h-3.5 w-3.5 text-[#0001FF]" />
                <span>Assigned Roles &amp; Permissions:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {me.data?.roles && me.data.roles.length > 0 ? (
                  me.data.roles.map((role) => (
                    <span
                      key={role}
                      className="inline-flex items-center rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 border border-slate-200/80 shadow-2xs"
                    >
                      {ROLE_LABELS[role] || role}
                    </span>
                  ))
                ) : (
                  <span className="text-[11px] text-slate-400">No specific roles assigned</span>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-9 px-4 text-xs font-medium rounded-lg border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={updateProfile.isPending || isUploading}
              className="h-9 px-5 text-xs font-semibold rounded-lg bg-[#0B1457] hover:bg-[#0001FF] text-white transition-all shadow-xs gap-1.5 cursor-pointer"
            >
              {updateProfile.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Save Changes</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
