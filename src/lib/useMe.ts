import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  "requester" | "approver" | "procurement_officer" | "finance" | "executive" | "admin";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return null;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, org_id, full_name, email, department, avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      let orgName: string | null = null;
      if (profile?.org_id) {
        const { data: org } = await supabase
          .from("organizations")
          .select("name")
          .eq("id", profile.org_id)
          .maybeSingle();
        orgName = org?.name ?? null;
      }

      return {
        userId: user.id,
        email: user.email ?? "",
        profile: profile ?? null,
        orgName,
        roles: (roleRows ?? []).map((r) => r.role as AppRole),
      };
    },
  });
}

export function can(roles: AppRole[] | undefined, allowed: AppRole[]) {
  return !!roles?.some((r) => allowed.includes(r));
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      fullName,
      department,
      avatarUrl,
    }: {
      fullName: string;
      department?: string | null;
      avatarUrl?: string | null;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      const updates: {
        full_name: string;
        department?: string | null;
        avatar_url?: string | null;
      } = {
        full_name: fullName.trim(),
      };
      if (department !== undefined) updates.department = department?.trim() || null;
      if (avatarUrl !== undefined) updates.avatar_url = avatarUrl;

      const { data, error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", userData.user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
      queryClient.invalidateQueries({ queryKey: ["org-users"] });
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
  });
}

