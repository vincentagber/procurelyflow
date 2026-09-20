import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowRight,
  ShieldCheck,
  Smartphone,
  ChevronRight,
  BarChart3,
  Scale,
  Sparkles,
  Star,
  Check,
  Receipt,
  Lock,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Procurely Flow — Enterprise Procurement Operating System" },
      {
        name: "description",
        content:
          "Autonomous, auditable procurement platform for construction, energy, and commercial enterprises. Requisitions, threshold workflows, 3-way invoice matching, and WhatsApp approvals.",
      },
    ],
  }),
  component: LandingPage,
});

const PIPELINE_STAGES = [
  {
    id: "requisition",
    number: "01",
    label: "Site Requisition",
    tagline: "Field & Project Requisitions in Seconds",
    desc: "Site supervisors and engineers raise material requests directly from their phones or desktop with standardized SKU catalogs and instant budget verification against cost codes.",
    details: [
      "Standardized Item Master & SKU catalog",
      "Cost code allocation & budget overrun lock",
      "Photo and delivery note attachments",
      "Auto-assigned reference numbers",
    ],
    metric: "< 60s",
    metricLabel: "Average Requisition Creation Time",
  },
  {
    id: "approvals",
    number: "02",
    label: "Threshold Approvals",
    tagline: "Intelligent Multi-Tier Governance",
    desc: "Configurable spending matrices route requisitions sequentially or in parallel based on department, project, and monetary limits — with 1-click WhatsApp and email approval tokens.",
    details: [
      "1-Click tokenized WhatsApp & Email actions",
      "Granular amount thresholds (e.g. >₦10M Executive)",
      "Unbudgeted item escalation overrides",
      "Cryptographic SHA-256 tamper-evident log",
    ],
    metric: "94%",
    metricLabel: "Faster Approval Cycle Speed",
  },
  {
    id: "sourcing",
    number: "03",
    label: "Sealed Sourcing & RFQ",
    tagline: "Competitive Quotes & Transparent Sourcing",
    desc: "Broadcast sealed RFQs to pre-qualified suppliers. Suppliers submit proposals directly through secure token links or procurement officers enter proxy bids with physical receipts.",
    details: [
      "Sealed-bid quotation comparison matrix",
      "Automatic unit-price VAT & delivery charge audit",
      "Proxy quote entry with WhatsApp evidence uploads",
      "Vendor rating and compliance verification",
    ],
    metric: "14.2%",
    metricLabel: "Average Unit Price Cost Savings",
  },
  {
    id: "orders",
    number: "04",
    label: "PO & Goods Inspection",
    tagline: "Digitized Purchase Orders & GRN Verification",
    desc: "Generate official PDF Purchase Orders with terms, delivery addresses, and FX rates. Receiving officers inspect shipments on-site and record Goods Received Notes (GRN).",
    details: [
      "Instant PO dispatch with supplier acknowledgement",
      "Mobile Goods Received Note (GRN) logging",
      "Accept vs. Reject discrepancy tracking with photos",
      "Auto-linked project cost commitment records",
    ],
    metric: "100%",
    metricLabel: "Audit-Trail Verifiable Delivery Records",
  },
  {
    id: "matching",
    number: "05",
    label: "3-Way Match & NRS Invoicing",
    tagline: "Zero-Fraud 3-Way Invoice Reconciliation",
    desc: "Automated Three-Way Matching compares PO line items, GRN inspection counts, and supplier invoices. Complete with NRS e-invoicing compliance (PEPPOL BIS 3.0) and 2% WHT deduction.",
    details: [
      "Automated PO ⟷ GRN ⟷ Invoice 3-Way Match",
      "National e-Invoicing (PEPPOL BIS 3.0) IRN validation",
      "Automated Withholding Tax (WHT 2%) computation",
      "Payment settlement & ERP sync export",
    ],
    metric: "0%",
    metricLabel: "Duplicate or Phantom Invoices",
  },
];

const CAPABILITIES = [
  {
    faIcon: "fa-solid fa-shield-halved",
    googleSymbol: "verified_user",
    title: "Cryptographic Audit Chaining",
    desc: "Every action, rejection, approval, and override is stamped with a SHA-256 hash linked to the previous event, creating a tamper-evident audit ledger that auditors trust.",
    badge: "Enterprise Security",
  },
  {
    faIcon: "fa-brands fa-whatsapp",
    googleSymbol: "chat",
    title: "1-Click WhatsApp & Email Approvals",
    desc: "Executives and managers can approve or reject multi-million Naira requisitions directly from WhatsApp or email without friction using secure, single-use cryptographic tokens.",
    badge: "Mobile Agility",
  },
  {
    faIcon: "fa-solid fa-scale-balanced",
    googleSymbol: "balance",
    title: "Automated 3-Way Invoice Matching",
    desc: "Eliminates phantom invoices and billing discrepancies by automatically reconciling Purchase Order prices, Delivery Receipt quantities, and Supplier Invoice lines.",
    badge: "Zero-Leakage",
  },
  {
    faIcon: "fa-solid fa-receipt",
    googleSymbol: "receipt_long",
    title: "NRS e-Invoicing & WHT Compliance",
    desc: "Fully aligned with Nigeria Revenue Service (NRS) e-invoicing standards (PEPPOL BIS 3.0 UBL), with automated 2% Withholding Tax deductions and VAT tracking.",
    badge: "Tax Ready",
  },
  {
    faIcon: "fa-solid fa-chart-line",
    googleSymbol: "trending_up",
    title: "Real-Time Project Budget Guardrails",
    desc: "Prevent cost overruns before they happen. Cost codes immediately reflect committed and incurred amounts, warning or blocking requisitions that breach limits.",
    badge: "Cost Control",
  },
  {
    faIcon: "fa-solid fa-user-shield",
    googleSymbol: "lock",
    title: "Bank-Grade Tenant Isolation & NDPA 2023",
    desc: "Row-Level Security (RLS) policies enforce strict multi-tenant isolation, coupled with granular user roles and NDPA 2023 data protection compliance.",
    badge: "Data Privacy",
  },
];

function LandingPage() {
  const [activeStage, setActiveStage] = useState(0);
  const [spendAmount, setSpendAmount] = useState(50000000); // 50M default
  const [leadName, setLeadName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");

  const currentStage = PIPELINE_STAGES[activeStage] ?? PIPELINE_STAGES[0]!;

  // Calculated ROI values
  const estimatedSavings = Math.round(spendAmount * 0.115);
  const hoursSavedMonthly = Math.round((spendAmount / 1000000) * 3.5);
  const fraudPrevented = Math.round(spendAmount * 0.042);

  return (
    <div className="min-h-screen bg-[#FFFFFF] text-[#0B1457] font-sans selection:bg-[#0001FF] selection:text-white antialiased">
      {/* 1. Header / Navbar (Clean standalone logo without text) */}
      <header className="sticky top-0 z-50 border-b border-[#E2E8F0] bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center">
              <img src="/logo-dark.png" alt="Logo" className="h-8 md:h-9 w-auto object-contain" />
            </Link>
            <span className="hidden rounded-full bg-[#0B1457] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white md:inline-block">
              Enterprise
            </span>
          </div>

          <nav className="hidden items-center gap-8 text-sm font-medium text-[#0B1457]/80 md:flex">
            <a href="#pipeline" className="transition-colors hover:text-[#0001FF]">
              Workflow
            </a>
            <a href="#capabilities" className="transition-colors hover:text-[#0001FF]">
              Capabilities
            </a>
            <a href="#roi" className="transition-colors hover:text-[#0001FF]">
              ROI Calculator
            </a>
            <a href="#security" className="transition-colors hover:text-[#0001FF]">
              Compliance & Security
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              to="/auth"
              className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold text-[#0B1457] hover:text-[#0001FF] hover:bg-[#EFF3FF] transition-all"
            >
              Sign In
            </Link>
            <Link
              to="/auth"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0B1457] px-5 text-sm font-semibold text-white shadow-md shadow-[#0B1457]/20 transition-all hover:bg-[#0001FF] hover:shadow-lg hover:shadow-[#0001FF]/30"
            >
              Get Started Free <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* 2. Hero Section (Brand Colors: #0B1457, #0001FF) */}
      <section className="relative overflow-hidden bg-[#FFFFFF] px-6 pt-12 pb-20 md:pt-16 md:pb-28">
        <div className="pointer-events-none absolute -top-24 right-1/4 h-96 w-96 rounded-full bg-[#0001FF]/10 blur-3xl" />
        <div className="pointer-events-none absolute top-1/2 left-0 h-72 w-72 rounded-full bg-[#0B1457]/10 blur-3xl" />

        <div className="relative mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
            {/* Left Column: Hero Text & Social Proof */}
            <div className="lg:col-span-7">
              {/* Status Badge */}
              <div className="inline-flex items-center gap-2 rounded-full bg-[#0B1457] px-3.5 py-1.5 text-xs font-bold text-white shadow-sm">
                <span className="flex h-2 w-2 rounded-full bg-[#0001FF] animate-pulse" />
                <span>Enterprise Procurement OS</span>
                <span className="text-white/40">|</span>
                <span className="text-white/90">NRS e-Invoicing & NDPA 2023 Compliant</span>
              </div>

              {/* Main Headline */}
              <div className="relative mt-6">
                <h1 className="text-4xl font-extrabold tracking-tight text-[#0B1457] sm:text-6xl md:text-7xl leading-[1.05]">
                  One auditable flow <br />
                  <span className="relative inline-block">
                    from site request to payment.
                    {/* Hand-drawn Blue Highlight Underline */}
                    <svg
                      className="absolute -bottom-2.5 left-0 w-full text-[#0001FF] opacity-90"
                      viewBox="0 0 358 12"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M3 9C118.5 1.5 239.5 2 355 9"
                        stroke="currentColor"
                        strokeWidth="5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                </h1>
              </div>

              {/* Subtitle */}
              <p className="mt-7 max-w-xl text-base text-[#0B1457]/80 sm:text-lg leading-relaxed">
                Procurely Flow replaces disconnected WhatsApp chats, lost invoices, and paper
                vouchers with an automated, tamper-evident procurement pipeline with real-time
                budget guardrails, sealed RFQs, and automated 3-way matching.
              </p>

              {/* CTAs */}
              <div className="mt-8 flex flex-col gap-3.5 sm:flex-row">
                <Link
                  to="/auth"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#0B1457] px-7 text-sm font-semibold text-white shadow-lg shadow-[#0B1457]/25 transition-all hover:bg-[#0001FF] hover:shadow-xl hover:shadow-[#0001FF]/35"
                >
                  Launch Your Workspace <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/auth"
                  className="inline-flex h-12 items-center justify-center rounded-xl border border-[#E2E8F0] bg-white px-7 text-sm font-semibold text-[#0B1457] shadow-sm transition-all hover:bg-[#EFF3FF] hover:border-[#0B1457]"
                >
                  Sign In to Existing Org
                </Link>
              </div>

              {/* Social Proof & Trust Avatar Row */}
              <div className="mt-10 flex items-center gap-4 pt-6 border-t border-[#E2E8F0]">
                <div className="flex -space-x-2.5 overflow-hidden">
                  <img
                    src="/avatars/avatar-ca.jpg"
                    alt="Construction & Engineering Lead (CA)"
                    title="Construction & Engineering Lead"
                    className="inline-block h-10 w-10 rounded-full object-cover ring-2 ring-white shadow-sm"
                  />
                  <img
                    src="/avatars/avatar-tr.jpg"
                    alt="Transit & Infrastructure Director (TR)"
                    title="Transit & Infrastructure Director"
                    className="inline-block h-10 w-10 rounded-full object-cover ring-2 ring-white shadow-sm"
                  />
                  <img
                    src="/avatars/avatar-na.jpg"
                    alt="National Assets Procurement VP (NA)"
                    title="National Assets Procurement VP"
                    className="inline-block h-10 w-10 rounded-full object-cover ring-2 ring-white shadow-sm"
                  />
                  <img
                    src="/avatars/avatar-ep.jpg"
                    alt="Energy & Property CFO (EP)"
                    title="Energy & Property CFO"
                    className="inline-block h-10 w-10 rounded-full object-cover ring-2 ring-white shadow-sm"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-1 text-[#0001FF]">
                    <Star className="h-4 w-4 fill-[#0001FF]" />
                    <Star className="h-4 w-4 fill-[#0001FF]" />
                    <Star className="h-4 w-4 fill-[#0001FF]" />
                    <Star className="h-4 w-4 fill-[#0001FF]" />
                    <Star className="h-4 w-4 fill-[#0001FF]" />
                  </div>
                  <p className="text-xs font-medium text-[#0B1457]/70 mt-0.5">
                    Trusted by construction, energy & commercial property leaders
                  </p>
                </div>
              </div>
            </div>

            {/* Right Column: Floating Lead Gen / Workspace Card */}
            <div className="relative lg:col-span-5">
              {/* Sunburst line doodle at top */}
              <div className="absolute -top-10 -right-4 w-24 h-24 pointer-events-none opacity-30">
                <svg
                  viewBox="0 0 100 100"
                  fill="none"
                  stroke="currentColor"
                  className="text-[#0B1457] w-full h-full"
                >
                  <line x1="50" y1="10" x2="50" y2="25" strokeWidth="2" strokeLinecap="round" />
                  <line x1="50" y1="75" x2="50" y2="90" strokeWidth="2" strokeLinecap="round" />
                  <line x1="10" y1="50" x2="25" y2="50" strokeWidth="2" strokeLinecap="round" />
                  <line x1="75" y1="50" x2="90" y2="50" strokeWidth="2" strokeLinecap="round" />
                  <line x1="22" y1="22" x2="33" y2="33" strokeWidth="2" strokeLinecap="round" />
                  <line x1="67" y1="67" x2="78" y2="78" strokeWidth="2" strokeLinecap="round" />
                  <line x1="22" y1="78" x2="33" y2="67" strokeWidth="2" strokeLinecap="round" />
                  <line x1="67" y1="33" x2="78" y2="22" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>

              {/* Floating Card */}
              <div className="relative rounded-3xl border border-[#E2E8F0] bg-white p-8 shadow-2xl shadow-[#0B1457]/10">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-[#0B1457]">Secure your spot now</h2>
                  <span className="rounded-full bg-[#0001FF] px-2.5 py-0.5 text-[11px] font-bold text-white">
                    Live
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#0B1457]/70">
                  Be the first to streamline your procurement from field to finance.
                </p>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    window.location.href = "/auth";
                  }}
                  className="mt-6 space-y-3"
                >
                  <div>
                    <input
                      type="text"
                      placeholder="Your full name"
                      value={leadName}
                      onChange={(e) => setLeadName(e.target.value)}
                      className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-sm text-[#0B1457] placeholder:text-[#0B1457]/40 focus:border-[#0001FF] focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <input
                      type="email"
                      placeholder="Your work email"
                      value={leadEmail}
                      onChange={(e) => setLeadEmail(e.target.value)}
                      className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-sm text-[#0B1457] placeholder:text-[#0B1457]/40 focus:border-[#0001FF] focus:bg-white focus:outline-none transition-all"
                    />
                  </div>

                  <Link
                    to="/auth"
                    className="flex w-full items-center justify-center rounded-xl bg-[#0B1457] py-3.5 text-sm font-semibold text-white shadow-md shadow-[#0B1457]/25 hover:bg-[#0001FF] transition-all"
                  >
                    Launch Your Workspace
                  </Link>
                </form>

                <div className="mt-4 text-center">
                  <p className="text-[11px] text-[#0B1457]/60">
                    By subscribing, you agree with our{" "}
                    <span className="text-[#0001FF] font-medium cursor-pointer">
                      Terms of Service
                    </span>
                  </p>
                </div>
              </div>

              {/* Scribble lines doodle at bottom-right */}
              <div className="absolute -bottom-8 -right-4 w-28 h-12 pointer-events-none opacity-25">
                <svg
                  viewBox="0 0 100 40"
                  fill="none"
                  stroke="currentColor"
                  className="text-[#0B1457] w-full h-full"
                >
                  <path
                    d="M5 10 Q 50 35 95 10 M10 20 Q 55 45 90 20 M15 30 Q 60 55 85 30"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Key Metric Badges Bar */}
          <div className="mt-16 grid grid-cols-2 gap-4 border-t border-[#E2E8F0] pt-10 sm:grid-cols-4">
            <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-5 text-center">
              <p className="font-display text-3xl font-extrabold text-[#0B1457] sm:text-4xl">
                ₦50B+
              </p>
              <p className="mt-1 text-xs font-medium text-[#0B1457]/70">Total Spend Governed</p>
            </div>
            <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-5 text-center">
              <p className="font-display text-3xl font-extrabold text-[#0001FF] sm:text-4xl">
                99.9%
              </p>
              <p className="mt-1 text-xs font-medium text-[#0B1457]/70">3-Way Match Accuracy</p>
            </div>
            <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-5 text-center">
              <p className="font-display text-3xl font-extrabold text-[#0B1457] sm:text-4xl">
                &lt; 15 min
              </p>
              <p className="mt-1 text-xs font-medium text-[#0B1457]/70">Approval Turnaround</p>
            </div>
            <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-5 text-center">
              <p className="font-display text-3xl font-extrabold text-[#0001FF] sm:text-4xl">0%</p>
              <p className="mt-1 text-xs font-medium text-[#0B1457]/70">Duplicate Invoices</p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Interactive 5-Stage Procurement Engine Journey */}
      <section id="pipeline" className="border-t border-[#E2E8F0] bg-[#F8FAFC] py-24 px-6">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#0B1457] px-3.5 py-1 text-xs font-bold text-white">
              End-to-End Governance
            </div>
            <h2 className="mt-3 font-display text-4xl uppercase tracking-wider text-[#0B1457] sm:text-5xl">
              The 5-Stage Procurement Engine
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-[#0B1457]/80">
              Click through the pipeline stages below to explore how Procurely governs spend from
              the field to finance.
            </p>
          </div>

          {/* Interactive Stepper Navigation Bar */}
          <div className="mt-12">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {PIPELINE_STAGES.map((stage, idx) => {
                const isActive = activeStage === idx;
                return (
                  <button
                    key={stage.id}
                    onClick={() => setActiveStage(idx)}
                    className={`group relative flex flex-col items-start rounded-2xl p-4 text-left transition-all duration-300 ${
                      isActive
                        ? "bg-white border-2 border-[#0001FF] shadow-xl shadow-[#0B1457]/10 scale-[1.02]"
                        : "bg-white/80 border border-[#E2E8F0] hover:bg-white hover:border-[#0B1457]"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-xl text-xs font-bold transition-colors ${
                          isActive
                            ? "bg-[#0B1457] text-white font-extrabold"
                            : "bg-[#EFF3FF] text-[#0B1457]"
                        }`}
                      >
                        {stage.number}
                      </span>
                      {isActive && (
                        <span className="flex h-2 w-2 rounded-full bg-[#0001FF] animate-ping" />
                      )}
                    </div>
                    <span className="mt-3 font-semibold text-xs text-[#0B1457] group-hover:text-[#0001FF] transition-colors">
                      {stage.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Stage Interactive Showcase Card */}
          <div className="mt-8 rounded-3xl border border-[#E2E8F0] bg-white p-8 md:p-12 shadow-xl shadow-[#0B1457]/5">
            <div className="grid gap-8 md:grid-cols-12 md:items-center">
              <div className="md:col-span-7">
                <div className="inline-flex items-center gap-2 rounded-lg bg-[#0B1457] px-3 py-1 text-xs font-bold text-white">
                  STAGE {currentStage.number}
                </div>
                <h3 className="mt-4 font-display text-3xl font-extrabold uppercase tracking-wide text-[#0B1457] sm:text-4xl">
                  {currentStage.tagline}
                </h3>
                <p className="mt-4 text-sm leading-relaxed text-[#0B1457]/80">
                  {currentStage.desc}
                </p>

                <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
                  {currentStage.details.map((detail) => (
                    <div
                      key={detail}
                      className="flex items-start gap-2.5 text-xs font-medium text-[#0B1457]"
                    >
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0B1457] text-white">
                        <Check className="h-3 w-3 stroke-[3]" />
                      </div>
                      <span>{detail}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stage Impact Metric Panel */}
              <div className="md:col-span-5">
                <div className="flex flex-col items-center justify-center rounded-2xl border border-[#E2E8F0] bg-gradient-to-b from-[#F8FAFC] to-[#EFF3FF] p-8 text-center shadow-inner">
                  <p className="text-xs font-bold uppercase tracking-widest text-[#0001FF]">
                    Stage Impact Metric
                  </p>
                  <p className="mt-3 font-display text-6xl font-extrabold text-[#0B1457] sm:text-7xl">
                    {currentStage.metric}
                  </p>
                  <p className="mt-2 max-w-xs text-xs font-semibold text-[#0B1457]">
                    {currentStage.metricLabel}
                  </p>

                  <div className="mt-6 flex w-full justify-center">
                    <Link
                      to="/auth"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0B1457] hover:text-[#0001FF] transition-colors"
                    >
                      Test this step in live workspace <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Enterprise Capabilities Grid (Brand Colors: #0B1457, #0001FF) */}
      <section id="capabilities" className="py-24 px-6 bg-white">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#0B1457] px-3.5 py-1 text-xs font-bold text-white">
              Platform Architecture
            </div>
            <h2 className="mt-3 font-display text-4xl uppercase tracking-wider text-[#0B1457] sm:text-5xl">
              Engineered for Audit-Proof Control
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-[#0B1457]/80">
              Built specifically for modern African corporations, commercial builders, and
              institutional operations.
            </p>
          </div>

          {/* Top Row: 3 Deep Navy Cards (#0B1457) with White text & Blue accents */}
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {CAPABILITIES.slice(0, 3).map((cap) => (
              <div
                key={cap.title}
                className="group relative rounded-3xl bg-[#0B1457] p-8 text-white shadow-md transition-all duration-300 hover:shadow-2xl hover:shadow-[#0B1457]/30 hover:-translate-y-1"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-white shadow-sm ring-1 ring-white/20">
                    <i
                      className={`${cap.faIcon} text-xl text-[#0001FF] group-hover:scale-110 transition-transform`}
                    ></i>
                  </div>
                  <span className="rounded-full bg-[#0001FF] px-3 py-1 text-[11px] font-bold text-white">
                    {cap.badge}
                  </span>
                </div>

                <h3 className="mt-6 text-xl font-bold tracking-tight text-white">{cap.title}</h3>
                <p className="mt-3 text-xs leading-relaxed text-white/90 font-normal">{cap.desc}</p>
              </div>
            ))}
          </div>

          {/* Bottom Row: 3 Clean Modern White Cards with Blue & Navy Accents */}
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {CAPABILITIES.slice(3, 6).map((cap) => (
              <div
                key={cap.title}
                className="group relative rounded-3xl border border-[#E2E8F0] bg-[#F8FAFC] p-8 text-[#0B1457] shadow-sm transition-all duration-300 hover:bg-white hover:border-[#0001FF] hover:shadow-lg hover:-translate-y-1"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EFF3FF] text-[#0B1457] group-hover:bg-[#0B1457] group-hover:text-white transition-all shadow-sm">
                    <i
                      className={`${cap.faIcon} text-xl group-hover:scale-110 transition-transform`}
                    ></i>
                  </div>
                  <span className="rounded-full bg-[#0B1457]/10 px-3 py-1 text-[11px] font-bold text-[#0B1457]">
                    {cap.badge}
                  </span>
                </div>

                <h3 className="mt-6 text-xl font-bold tracking-tight text-[#0B1457]">
                  {cap.title}
                </h3>
                <p className="mt-3 text-xs leading-relaxed text-[#0B1457]/80">{cap.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Interactive ROI & Savings Estimator */}
      <section id="roi" className="border-t border-[#E2E8F0] bg-[#F8FAFC] py-24 px-6">
        <div className="mx-auto max-w-5xl rounded-3xl border border-[#E2E8F0] bg-white p-8 md:p-12 shadow-xl shadow-[#0B1457]/5">
          <div className="text-center">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#0B1457] px-3.5 py-1 text-xs font-bold text-white">
              <Sparkles className="h-3.5 w-3.5 text-[#0001FF]" /> ROI Calculator
            </div>
            <h2 className="mt-3 font-display text-4xl uppercase tracking-wider text-[#0B1457] sm:text-5xl">
              Estimate Your Operational Savings
            </h2>
            <p className="mt-2 text-sm text-[#0B1457]/80">
              Drag the slider to match your organization's estimated monthly procurement volume.
            </p>
          </div>

          <div className="mt-10">
            <div className="flex items-center justify-between text-xl font-bold text-[#0B1457] sm:text-2xl">
              <span>Monthly Spend:</span>
              <span className="rounded-xl bg-[#0B1457] px-4 py-1.5 font-display text-2xl font-extrabold text-white">
                ₦{(spendAmount / 1000000).toFixed(0)}M
              </span>
            </div>

            <input
              type="range"
              min="5000000"
              max="500000000"
              step="5000000"
              value={spendAmount}
              onChange={(e) => setSpendAmount(Number(e.target.value))}
              className="mt-6 h-3 w-full cursor-pointer appearance-none rounded-lg bg-[#E2E8F0] accent-[#0001FF]"
            />
            <div className="mt-2 flex justify-between text-xs font-semibold text-[#0B1457]/60">
              <span>₦5M/mo</span>
              <span>₦250M/mo</span>
              <span>₦500M/mo</span>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-6 text-center">
                <p className="text-xs font-semibold text-[#0B1457]/70">
                  Estimated Sourcing Savings
                </p>
                <p className="mt-2 font-display text-3xl font-extrabold text-[#0001FF]">
                  ₦{(estimatedSavings / 1000000).toFixed(1)}M
                </p>
                <p className="mt-1 text-[11px] text-[#0B1457]/60">via competitive sealed quotes</p>
              </div>

              <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-6 text-center">
                <p className="text-xs font-semibold text-[#0B1457]/70">
                  Finance & Admin Hours Saved
                </p>
                <p className="mt-2 font-display text-3xl font-extrabold text-[#0B1457]">
                  {hoursSavedMonthly} hrs/mo
                </p>
                <p className="mt-1 text-[11px] text-[#0B1457]/60">
                  reconciliation & paper elimination
                </p>
              </div>

              <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-6 text-center">
                <p className="text-xs font-semibold text-[#0B1457]/70">
                  Leakage & Overcharge Prevention
                </p>
                <p className="mt-2 font-display text-3xl font-extrabold text-[#0001FF]">
                  ₦{(fraudPrevented / 1000000).toFixed(1)}M
                </p>
                <p className="mt-1 text-[11px] text-[#0B1457]/60">via 3-way match & budget locks</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Security & Compliance Certifications */}
      <section id="security" className="py-24 px-6 bg-white">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-3xl border border-[#E2E8F0] bg-[#F8FAFC] p-8 md:p-12">
            <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-[#0B1457] px-3.5 py-1 text-xs font-bold text-white">
                  Enterprise Trust
                </div>
                <h2 className="mt-3 font-display text-4xl uppercase tracking-wider text-[#0B1457]">
                  Built for Nigerian Regulatory Compliance
                </h2>
                <p className="mt-3 text-sm text-[#0B1457]/80 leading-relaxed">
                  Procurely Flow adheres to national compliance mandates including the Nigeria Data
                  Protection Act (NDPA 2023) and NRS electronic invoice clearance frameworks.
                </p>

                <div className="mt-6 grid grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
                    <p className="font-bold text-sm text-[#0B1457]">NDPA 2023 Compliant</p>
                    <p className="mt-1 text-xs text-[#0B1457]/70">
                      Granular consent logging & data sovereignty
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
                    <p className="font-bold text-sm text-[#0B1457]">PEPPOL BIS 3.0</p>
                    <p className="mt-1 text-xs text-[#0B1457]/70">
                      UBL e-invoicing schema ready for NRS clearing
                    </p>
                  </div>
                </div>
              </div>

              {/* Cryptographic Audit Verification Output Terminal */}
              <div className="rounded-2xl border border-[#162070] bg-[#0B1457] p-6 font-mono text-xs text-slate-300 shadow-xl space-y-2">
                <p className="text-[#0001FF] font-bold">
                  // Cryptographic Audit Verification Output
                </p>
                <p className="text-slate-200 leading-relaxed">
                  Event: REQUISITION_APPROVED_EXECUTIVE <br />
                  Tenant_ID: 11111111-1111-1111-1111-111111111111 <br />
                  Amount: ₦45,000,000.00 (NGN) <br />
                  Payload_Hash:
                  sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 <br />
                  Previous_Hash:
                  sha256:88d4266fd4e6338d13b845fcf289579d209c897823b9217da3e161936f031589 <br />
                  Signature_Status:{" "}
                  <span className="text-[#0001FF] font-bold">VERIFIED_IMMUTABLE</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. Call To Action Footer Banner */}
      <section className="border-t border-[#E2E8F0] bg-[#FFFFFF] py-20 px-6 text-center">
        <div className="mx-auto max-w-4xl rounded-3xl bg-[#0B1457] px-8 py-16 text-white shadow-2xl relative overflow-hidden">
          <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-[#0001FF]/40 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-[#0001FF]/20 blur-3xl" />

          <h2 className="relative font-display text-4xl uppercase tracking-wider text-white sm:text-6xl">
            Upgrade Your Procurement Operations Today
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-sm text-white/90">
            Eliminate approval delays, cut rogue spending, and establish an unbroken audit trail in
            less than 5 minutes.
          </p>
          <div className="relative mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to="/auth"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0001FF] px-8 text-sm font-bold text-white shadow-md shadow-[#0001FF]/30 hover:bg-[#0B1457] transition-all sm:w-auto"
            >
              Start Free Trial <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/auth"
              className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-white/20 bg-white/10 px-8 text-sm font-semibold text-white hover:bg-white/20 sm:w-auto"
            >
              Sign In to Your Account
            </Link>
          </div>
        </div>
      </section>

      {/* 8. Modern Footer (Clean standalone logo without text) */}
      <footer className="border-t border-[#E2E8F0] bg-[#FFFFFF] py-12 px-6">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex items-center">
            <img src="/logo-dark.png" alt="Logo" className="h-8 w-auto object-contain" />
          </div>

          <div className="flex items-center gap-6 text-xs text-[#0B1457]/70 font-medium">
            <span>© {new Date().getFullYear()} Procurely Flow Inc. All rights reserved.</span>
            <span>•</span>
            <span className="text-emerald-600 font-semibold flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              All Systems Operational
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
