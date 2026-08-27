import { useQuery } from "@tanstack/react-query";
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
        .select("id, org_id, full_name, email, department")
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
