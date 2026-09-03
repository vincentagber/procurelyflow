"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { logSecurityEventFn } from "@/lib/security.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPasswordPage() {
  const router = useRouter();
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
        <Button className="mt-5 h-12 w-full" onClick={() => router.replace("/auth")}>
          Go to sign in
        </Button>
      </Shell>
    );
  }

  if (!ready) {
    return (
      <Shell title="Checking reset link…">
        <p className="mt-2 text-sm text-muted-foreground">Verifying your security token…</p>
      </Shell>
    );
  }

  if (!validLink) {
    return (
      <Shell title="Reset link expired or invalid">
        <p className="mt-2 text-sm text-muted-foreground">
          This password reset link is invalid, has expired, or has already been used.
        </p>
        <Button className="mt-5 h-12 w-full" onClick={() => router.replace("/auth")}>
          Request a new link
        </Button>
      </Shell>
    );
  }

  return (
    <Shell title="Set a new password">
      <p className="mt-1 text-sm text-muted-foreground">
        Choose a strong password for <span className="font-medium text-foreground">{email}</span>.
      </p>

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
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
          <Label htmlFor="confirm">Confirm new password</Label>
          <Input
            id="confirm"
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
          {busy ? "Updating password…" : "Save new password"}
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
