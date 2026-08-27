import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, Building2, ArrowLeft, LogOut } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { amIPlatformAdmin } from "@/lib/platform.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/platform-admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: PlatformShell,
});

function PlatformShell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const gate = useQuery({
    queryKey: ["platform-admin-gate"],
    queryFn: () => amIPlatformAdmin(),
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (gate.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-foreground text-sm text-background/80">
        Verifying platform access…
      </div>
    );
  }

  if (!gate.data?.isPlatformAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-signal" aria-hidden />
          <h1 className="page-title mt-3 text-3xl">Restricted area</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Platform administration is limited to Procurely staff accounts.
          </p>
          <div className="mt-5">
            <Button asChild variant="outline">
              <Link to="/dashboard">
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden /> Back to your workspace
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Deliberately different chrome: black bar + signal accent, never mistaken for an org view. */}
      <header className="border-b-2 border-signal bg-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-signal" aria-hidden />
            <div>
              <p className="font-display text-xl uppercase leading-none tracking-wider text-background">
                Procurely Platform Admin
              </p>
              <p className="mt-1 text-[11px] uppercase tracking-widest text-signal">
                All organizations · read-only visibility
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/platform-admin"
              className="rounded-md px-3 py-2 text-sm font-medium text-background/85 hover:bg-background/10"
            >
              Organizations
            </Link>
            <Link
              to="/dashboard"
              className="rounded-md px-3 py-2 text-sm font-medium text-background/85 hover:bg-background/10"
            >
              Exit to my org
            </Link>
            <button
              onClick={signOut}
              aria-label="Sign out"
              className="flex h-9 w-9 items-center justify-center rounded-md text-background/85 hover:bg-background/10"
            >
              <LogOut className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        <Outlet />
      </main>
    </div>
  );
}
