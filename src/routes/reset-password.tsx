import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { logSecurityEventFn } from "@/lib/security.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — Procurely Flow" },
      {
        name: "description",
        content: "Choose a new password for your Procurely Flow account and sign back in securely.",
      },
      { property: "og:title", content: "Set a new password — Procurely Flow" },
      {
        property: "og:description",
        content: "Complete your Procurely Flow password reset.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [validLink, setValidLink] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setValidLink(Boolean(data.user));
      setEmail(data.user?.email ?? null);
      setReady(true);
    }
    // The recovery link puts a session in place via the URL fragment.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") void check();
    });
    void check();
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      toast.error("Those passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await logSecurityEventFn({
        data: { event: "password_reset_completed", ...(email ? { email } : {}) },
      }).catch(() => undefined);
      // Force every other device/session to sign in again.
      await supabase.auth.signOut({ scope: "global" }).catch(() => undefined);
      setDone(true);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "We couldn't update your password. Request a new reset link.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Shell title="Password updated">
        <p className="mt-2 text-sm text-muted-foreground">
          Your password has been changed and all other active sessions were signed out. Sign in
          again with your new password.
        </p>
        <Button className="mt-5 h-12 w-full" onClick={() => navigate({ to: "/auth" })}>
          Go to sign in
        </Button>
      </Shell>
    );
  }

  if (!ready) {
    return (
      <Shell title="Checking your link">
        <p className="mt-2 text-sm text-muted-foreground">One moment…</p>
      </Shell>
    );
  }

  if (!validLink) {
    return (
      <Shell title="Link expired">
        <p className="mt-2 text-sm text-muted-foreground">
          Reset links expire after one hour and can only be used once. Request a fresh link from the
          sign-in page.
        </p>
        <Button className="mt-5 h-12 w-full" onClick={() => navigate({ to: "/auth" })}>
          Back to sign in
        </Button>
      </Shell>
    );
  }

  return (
    <Shell title="Set a new password">
      <p className="mt-1 text-sm text-muted-foreground">
        Choose a new password for {email ?? "your account"}. Minimum 6 characters.
      </p>
      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            className="h-12"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input
            id="confirm-password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            className="h-12"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={busy} className="h-12 w-full">
          {busy ? "Updating…" : "Update password"}
        </Button>
      </form>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-5 py-10">
      <div className="w-full max-w-md">
        <p className="font-display text-2xl uppercase tracking-wider text-primary">
          Procurely Flow
        </p>
        <div className="mt-4 rounded-lg border border-border bg-card p-6">
          <h1 className="page-title text-foreground">{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}
