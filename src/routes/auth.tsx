import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { logSecurityEventFn } from "@/lib/security.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Procurely Flow" },
      {
        name: "description",
        content: "Sign in to Procurely Flow to raise, approve and award procurement requests.",
      },
      { property: "og:title", content: "Sign in — Procurely Flow" },
      { property: "og:description", content: "Access your organization's procurement workspace." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "forgot") {
        // Always show the same confirmation — never reveal whether the email exists.
        await supabase.auth
          .resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
          })
          .catch(() => undefined);
        await logSecurityEventFn({
          data: { event: "password_reset_requested", email },
        }).catch(() => undefined);
        setResetSent(true);
        return;
      }
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          setCheckEmail(true);
          return;
        }
        navigate({ to: "/dashboard", replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard", replace: true });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in didn't complete. Please try again.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard", replace: true });
  }

  if (resetSent) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface px-5">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-7 text-center">
          <h1 className="page-title text-primary">Check your inbox</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            If an account exists for that email, we've sent a reset link. It expires in one hour and
            can only be used once.
          </p>
          <Button
            variant="outline"
            className="mt-5 h-12 w-full"
            onClick={() => {
              setResetSent(false);
              setMode("signin");
            }}
          >
            Back to sign in
          </Button>
        </div>
      </main>
    );
  }

  if (checkEmail) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface px-5">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-7 text-center">
          <h1 className="page-title text-primary">Check your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We've sent a confirmation link to <span className="font-medium">{email}</span>. Open it
            to activate your account, then come back here to sign in.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-5 py-10">
      <div className="w-full max-w-md">
        <p className="font-display text-2xl uppercase tracking-wider text-primary">
          Procurely Flow
        </p>
        <div className="mt-4 rounded-lg border border-border bg-card p-6">
          <h1 className="page-title text-foreground">
            {mode === "signin"
              ? "Sign in"
              : mode === "signup"
                ? "Create your account"
                : "Reset your password"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Welcome back. Your requests and approvals are waiting."
              : mode === "signup"
                ? "Set up your organization's procurement workspace in a minute."
                : "Enter your work email and we'll send you a link to set a new password."}
          </p>

          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                className="h-12"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {mode !== "forgot" ? (
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  className="h-12"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            ) : null}
            <Button type="submit" disabled={busy} className="h-12 w-full">
              {busy
                ? "Please wait…"
                : mode === "signin"
                  ? "Sign in"
                  : mode === "signup"
                    ? "Create account"
                    : "Send reset link"}
            </Button>
          </form>

          {mode === "signin" ? (
            <button
              type="button"
              className="mt-3 text-sm text-accent underline-offset-4 hover:underline"
              onClick={() => setMode("forgot")}
            >
              Forgot password?
            </button>
          ) : null}

          <div className="my-4 flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" className="h-12 w-full" onClick={onGoogle}>
            Continue with Google
          </Button>

          <button
            type="button"
            className="mt-5 w-full text-sm text-accent underline-offset-4 hover:underline"
            onClick={() =>
              setMode(mode === "signup" ? "signin" : mode === "signin" ? "signup" : "signin")
            }
          >
            {mode === "signin"
              ? "New here? Create an account"
              : mode === "signup"
                ? "Already have an account? Sign in"
                : "Back to sign in"}
          </button>
        </div>
      </div>
    </main>
  );
}
