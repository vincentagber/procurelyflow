import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Trash2, ShieldCheck, Mail, Building2, Check, User, Loader2, Camera } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useUpdateProfile } from "@/lib/useMe";
import { UserAvatar } from "@/components/procurely/UserAvatar";
import { ROLE_LABELS } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProfileSection() {
  const me = useMe();
  const updateProfile = useUpdateProfile();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (me.data?.profile) {
      setFullName(me.data.profile.full_name || "");
      setDepartment(me.data.profile.department || "");
      setAvatarUrl(me.data.profile.avatar_url || null);
    }
  }, [me.data]);

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
        .upload(filePath, file, { cacheControl: "3600", upsert: true });

      if (uploadError) throw new Error(uploadError.message || "Failed to upload avatar.");

      const { data: publicUrlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(uploadData.path);

      setAvatarUrl(publicUrlData.publicUrl);
      toast.success("Profile photo uploaded. Click 'Save Profile' to apply.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload photo.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleRemoveAvatar() {
    setAvatarUrl(null);
    toast.info("Profile photo removed. Click 'Save Profile' to apply.");
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
        avatarUrl,
      });
      toast.success("Your profile details have been saved successfully.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-xs">
        <div className="max-w-2xl space-y-1">
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 tracking-tight">
            Personal Identity &amp; Profile Details
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 font-normal leading-normal">
            Upload your professional profile photo and maintain your official name and department as
            displayed across approvals and requisitions.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 max-w-xl space-y-6">
          {/* Avatar card */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4.5">
            <div className="relative group shrink-0">
              <UserAvatar
                name={fullName || me.data?.profile?.full_name}
                email={me.data?.email}
                avatarUrl={avatarUrl}
                size="xl"
                className="h-20 w-20 ring-4 ring-white shadow-sm text-2xl"
              />
              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              )}
            </div>

            <div className="flex-1 text-center sm:text-left space-y-2">
              <div>
                <p className="text-xs font-semibold text-slate-900">Profile Picture</p>
                <p className="text-[11px] text-slate-500">
                  PNG, JPG, or WebP up to 5MB. Rendered in sidebar, team directories, and audit
                  sign-offs.
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

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="settings-full-name"
                className="text-xs font-medium text-slate-700 flex items-center gap-1.5"
              >
                <User className="h-3.5 w-3.5 text-slate-400" />
                <span>Official Full Name *</span>
              </Label>
              <Input
                id="settings-full-name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Vincent Agber"
                className="h-10 text-xs rounded-lg border-slate-200 bg-white shadow-2xs focus-visible:border-[#0B1457]"
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="settings-department"
                className="text-xs font-medium text-slate-700 flex items-center gap-1.5"
              >
                <Building2 className="h-3.5 w-3.5 text-slate-400" />
                <span>Department / Unit</span>
              </Label>
              <Input
                id="settings-department"
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Project Delivery & Procurement"
                className="h-10 text-xs rounded-lg border-slate-200 bg-white shadow-2xs focus-visible:border-[#0B1457]"
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="settings-email"
                className="text-xs font-medium text-slate-700 flex items-center gap-1.5"
              >
                <Mail className="h-3.5 w-3.5 text-slate-400" />
                <span>Authentication Email Address</span>
              </Label>
              <Input
                id="settings-email"
                type="email"
                disabled
                value={me.data?.email || ""}
                className="h-10 text-xs rounded-lg border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed shadow-none"
              />
            </div>

            <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                <ShieldCheck className="h-3.5 w-3.5 text-[#0001FF]" />
                <span>Organization &amp; Clearance Level:</span>
              </div>
              <p className="text-xs font-semibold text-slate-800">
                {me.data?.orgName || "Procurely Flow Enterprise"}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-0.5">
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
                  <span className="text-[11px] text-slate-400">Standard Requester</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-start gap-2.5 pt-2">
            <Button
              type="submit"
              disabled={updateProfile.isPending || isUploading}
              className="h-9 px-5 text-xs font-semibold rounded-lg bg-[#0B1457] hover:bg-[#0001FF] text-white transition-all shadow-xs gap-1.5 cursor-pointer"
            >
              {updateProfile.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Saving Profile…</span>
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Save Profile</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
