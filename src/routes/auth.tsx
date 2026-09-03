import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ShieldCheck,
  Lock,
  Mail,
  Building2,
  User,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Sparkles,
  KeyRound,
  ArrowLeft,
  Smartphone,
  Scale,
  Receipt,
  ChevronDown,
  Check,
  Fingerprint,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { logSecurityEventFn } from "@/lib/security.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign In — Procurely Flow" },
      {
        name: "description",
        content:
          "Enterprise procurement operating system for construction, energy, and commercial leaders. Requisitions, threshold approvals, and 3-way matching.",
      },
      { property: "og:title", content: "Sign In — Procurely Flow" },
      {
        property: "og:description",
        content: "Access your organization's verified procurement workspace.",
      },
    ],
  }),
  component: AuthPage,
});

const DEMO_PRESETS = [
  { label: "Admin", email: "admin@procurely.com", desc: "Full organization & system control" },
  { label: "Site Lead", email: "requester@procurely.com", desc: "Field material requisitions" },
  { label: "Approver", email: "approver@procurely.com", desc: "Project Director threshold sign-off" },
  { label: "Procurement", email: "procurement@procurely.com", desc: "RFQ issuing & PO creation" },
  { label: "Finance", email: "finance@procurely.com", desc: "Budget control & 3-way match" },
  { label: "Executive", email: "executive@procurely.com", desc: "Board-level approvals & audit" },
];

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [showDemoMenu, setShowDemoMenu] = useState(false);

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
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              full_name: fullName || email.split("@")[0],
              organization_name: orgName || "Enterprise Workspace",
            },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setCheckEmail(true);
          return;
        }
        toast.success("Account created successfully!");
        navigate({ to: "/dashboard", replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
        navigate({ to: "/dashboard", replace: true });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed. Please verify your credentials.");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in did not complete. Please try again.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard", replace: true });
  }

  function applyPreset(presetEmail: string) {
    setEmail(presetEmail);
    setPassword("Procurely@2026!");
    setMode("signin");
    setShowDemoMenu(false);
    toast.success(`Loaded credentials for ${presetEmail}`);
  }

  if (resetSent) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-6 py-12">
        <div className="w-full max-w-md rounded-2xl border border-[#E2E8F0] bg-white p-8 text-center shadow-lg shadow-black/[0.03]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#0001FF]/10 text-[#0001FF]">
            <Mail className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-xl font-bold tracking-tight text-[#0B1457]">Check your inbox</h1>
          <p className="mt-2 text-xs leading-relaxed text-[#0B1457]/70">
            If an account exists for <span className="font-semibold text-[#0B1457]">{email}</span>,
            a secure reset link has been dispatched. The link expires in 60 minutes.
          </p>
          <Button
            className="mt-6 h-11 w-full rounded-xl bg-[#0001FF] text-xs font-bold text-white hover:bg-[#0B1457] transition-all shadow-sm"
            onClick={() => {
              setResetSent(false);
              setMode("signin");
            }}
          >
            Return to Sign In
          </Button>
        </div>
      </main>
    );
  }

  if (checkEmail) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-6 py-12">
        <div className="w-full max-w-md rounded-2xl border border-[#E2E8F0] bg-white p-8 text-center shadow-lg shadow-black/[0.03]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-xl font-bold tracking-tight text-[#0B1457]">Verify your email</h1>
          <p className="mt-2 text-xs leading-relaxed text-[#0B1457]/70">
            We sent an activation link to <span className="font-semibold text-[#0B1457]">{email}</span>. Click
            the link to confirm your corporate email and access your workspace.
          </p>
          <Button
            className="mt-6 h-11 w-full rounded-xl bg-[#0001FF] text-xs font-bold text-white hover:bg-[#0B1457] transition-all shadow-sm"
            onClick={() => {
              setCheckEmail(false);
              setMode("signin");
            }}
          >
            Return to Sign In
          </Button>
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#FFFFFF] antialiased">
      {/* 1. Left Showcase Column: Enterprise Branding & Social Proof (Desktop) */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-[#0B1457] p-12 lg:flex xl:p-16">
        {/* Subtle Geometric Background Dot Pattern */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "radial-gradient(#FFFFFF 1.5px, transparent 1.5px)",
            backgroundSize: "24px 24px",
          }}
        />

        {/* Ambient Gradient Glows */}
        <div className="pointer-events-none absolute -top-40 -left-40 h-[450px] w-[450px] rounded-full bg-[#0001FF]/30 blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-40 -right-40 h-[450px] w-[450px] rounded-full bg-[#0001FF]/25 blur-[100px]" />

        {/* Top Header */}
        <div className="relative z-10 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center">
            <img
              src="/logo-dark.png"
              alt="Procurely Logo"
              className="h-8 w-auto object-contain rounded-lg bg-white p-1.5 shadow-sm"
            />
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/75 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Home
          </Link>
        </div>

        {/* Middle Core Proposition & Verified Executive Testimonial */}
        <div className="relative z-10 my-auto max-w-lg space-y-8 py-10">
          <h2 className="font-display text-3xl font-extrabold uppercase tracking-wide text-white xl:text-4xl leading-tight">
            One auditable flow from site request to purchase order.
          </h2>

          {/* Social Proof Executive Quote Card */}
          <div className="rounded-2xl border border-white/15 bg-white/10 p-6 backdrop-blur-md shadow-xl shadow-black/10 space-y-4">
            <div className="flex items-center gap-3">
              <img
                src="/avatars/avatar-ca.jpg"
                alt="Executive"
                className="h-11 w-11 rounded-full object-cover ring-2 ring-[#0001FF]"
              />
              <div>
                <p className="text-xs font-bold text-white">Engr. Babatunde Adeleke</p>
                <p className="text-[11px] text-white/70">Chief Operating Officer, Coastal Infra Plc</p>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-white/90 italic">
              "Procurely Flow eliminated over 40 scattered WhatsApp requisitions a day across our 12 sites.
              Our board and audit committee now have 100% immutable transparency."
            </p>
            <div className="flex items-center gap-4 border-t border-white/10 pt-3 text-[11px] font-medium text-white/80">
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> ₦4.2B Audited Spend
              </span>
            </div>
          </div>

          {/* Value Bullet Points */}
          <div className="space-y-3 pt-2 text-xs text-white/85">
            <div className="flex items-center gap-2.5">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0001FF] text-white">
                <Check className="h-3 w-3 stroke-[3]" />
              </div>
              <span>SHA-256 Cryptographic tamper-evident audit ledger</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0001FF] text-white">
                <Check className="h-3 w-3 stroke-[3]" />
              </div>
              <span>1-Click threshold approvals via WhatsApp & encrypted tokens</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0001FF] text-white">
                <Check className="h-3 w-3 stroke-[3]" />
              </div>
              <span>Automated 3-way matching and NRS e-invoicing compliance</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Right Form Column: Clean, Modern High-Contrast Form */}
      <div className="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-16 xl:px-24">
        <div className="mx-auto w-full max-w-[430px]">
          {/* Mobile Header with Logo */}
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Link to="/">
              <img
                src="/logo-dark.png"
                alt="Procurely Logo"
                className="h-8 w-auto object-contain rounded-md bg-[#0B1457] p-1.5"
              />
            </Link>
            <Link to="/" className="text-xs font-semibold text-[#0B1457] hover:underline">
              ← Overview
            </Link>
          </div>

          {/* Form Header */}
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-[#0B1457] sm:text-3xl">
              {mode === "signin"
                ? "Sign in to Procurely"
                : mode === "signup"
                  ? "Create your workspace"
                  : "Reset your password"}
            </h1>
            <p className="text-xs text-[#0B1457]/70 sm:text-sm leading-relaxed">
              {mode === "signin"
                ? "Enter your corporate email to access your procurement account."
                : mode === "signup"
                  ? "Set up your company workspace and invite your procurement team."
                  : "Enter your work email address and we'll dispatch a secure recovery link."}
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          {mode !== "forgot" && (
            <div className="mt-6 flex rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-1">
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
                  mode === "signin"
                    ? "bg-white text-[#0B1457] shadow-xs ring-1 ring-black/5"
                    : "text-[#0B1457]/60 hover:text-[#0B1457]"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
                  mode === "signup"
                    ? "bg-white text-[#0B1457] shadow-xs ring-1 ring-black/5"
                    : "text-[#0B1457]/60 hover:text-[#0B1457]"
                }`}
              >
                Create Workspace
              </button>
            </div>
          )}

          {/* Google Workspace OAuth Button */}
          <div className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={onGoogle}
              className="h-11 w-full rounded-xl border-[#E2E8F0] bg-white text-xs font-bold text-[#0B1457] hover:bg-[#F8FAFC] hover:border-[#CBD5E1] transition-all shadow-xs"
            >
              <svg className="mr-2.5 h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              Continue with Google Workspace
            </Button>
          </div>

          {/* Divider */}
          <div className="my-6 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-[#0B1457]/40">
            <span className="h-px flex-1 bg-[#E2E8F0]" />
            or with corporate email
            <span className="h-px flex-1 bg-[#E2E8F0]" />
          </div>

          {/* Form */}
          <form onSubmit={onSubmit} className="space-y-4">
            {mode === "signup" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="fullName" className="text-xs font-semibold text-[#0B1457]">
                    Full Name
                  </Label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0B1457]/40" />
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="e.g. Babatunde Adeleke"
                      required
                      className="h-11 rounded-xl border-[#E2E8F0] bg-[#FFFFFF] pl-10 text-xs text-[#0B1457] focus-visible:border-[#0001FF] focus-visible:ring-1 focus-visible:ring-[#0001FF]"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="orgName" className="text-xs font-semibold text-[#0B1457]">
                    Company / Organization Name
                  </Label>
                  <div className="relative">
                    <Building2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0B1457]/40" />
                    <Input
                      id="orgName"
                      type="text"
                      placeholder="e.g. Acme Infrastructure Ltd"
                      required
                      className="h-11 rounded-xl border-[#E2E8F0] bg-[#FFFFFF] pl-10 text-xs text-[#0B1457] focus-visible:border-[#0001FF] focus-visible:ring-1 focus-visible:ring-[#0001FF]"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-[#0B1457]">
                Work Email Address
              </Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0B1457]/40" />
                <Input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  required
                  autoComplete="email"
                  className="h-11 rounded-xl border-[#E2E8F0] bg-[#FFFFFF] pl-10 text-xs text-[#0B1457] focus-visible:border-[#0001FF] focus-visible:ring-1 focus-visible:ring-[#0001FF]"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            {mode !== "forgot" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-semibold text-[#0B1457]">
                    Password
                  </Label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="text-[11px] font-bold text-[#0001FF] hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0B1457]/40" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••••••"
                    required
                    minLength={6}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    className="h-11 rounded-xl border-[#E2E8F0] bg-[#FFFFFF] pl-10 pr-10 text-xs text-[#0B1457] focus-visible:border-[#0001FF] focus-visible:ring-1 focus-visible:ring-[#0001FF]"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#0B1457]/40 hover:text-[#0B1457] transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            {mode === "signin" && (
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-xs text-[#0B1457]/70 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-[#E2E8F0] text-[#0001FF] focus:ring-[#0001FF]"
                  />
                  Remember this device for 30 days
                </label>
              </div>
            )}

            <Button
              type="submit"
              disabled={busy}
              className="mt-2 h-11 w-full rounded-xl bg-[#0001FF] text-xs font-bold text-white shadow-md shadow-[#0001FF]/20 hover:bg-[#0B1457] transition-all"
            >
              {busy ? (
                <span className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Authenticating…
                </span>
              ) : mode === "signin" ? (
                <span className="flex items-center justify-center gap-1.5">
                  Sign In to Workspace <ArrowRight className="h-3.5 w-3.5" />
                </span>
              ) : mode === "signup" ? (
                <span className="flex items-center justify-center gap-1.5">
                  Create Workspace <ArrowRight className="h-3.5 w-3.5" />
                </span>
              ) : (
                "Send Password Reset Link"
              )}
            </Button>
          </form>

          {/* Quick Demo Credentials Preset Bar */}
          <div className="mt-8 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
            <button
              type="button"
              onClick={() => setShowDemoMenu(!showDemoMenu)}
              className="flex w-full items-center justify-between text-left"
            >
              <div className="flex items-center gap-2">
                <Fingerprint className="h-4 w-4 text-[#0001FF]" />
                <span className="text-xs font-bold text-[#0B1457]">
                  Demo Credentials (1-Click Fill)
                </span>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-[#0B1457]/50 transition-transform ${
                  showDemoMenu ? "rotate-180" : ""
                }`}
              />
            </button>

            {showDemoMenu && (
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#E2E8F0] pt-3 sm:grid-cols-3">
                {DEMO_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => applyPreset(p.email)}
                    className="rounded-lg border border-[#E2E8F0] bg-white p-2 text-left hover:border-[#0001FF] hover:bg-[#0001FF]/5 transition-all shadow-2xs"
                  >
                    <p className="text-[11px] font-bold text-[#0B1457]">{p.label}</p>
                    <p className="text-[9px] text-[#0B1457]/60 truncate">{p.email}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {mode === "forgot" && (
            <button
              type="button"
              className="mt-4 w-full text-center text-xs font-bold text-[#0001FF] hover:underline"
              onClick={() => setMode("signin")}
            >
              Back to Sign In
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
