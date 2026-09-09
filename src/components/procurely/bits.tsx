import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string | undefined;
  actions?: ReactNode | undefined;
}) {
  return (
    <header className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1 max-w-2xl">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
            {title}
          </h1>
          {subtitle ? (
            <p className="text-xs sm:text-sm text-slate-500 font-normal leading-normal">
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2.5 shrink-0">{actions}</div> : null}
      </div>
    </header>
  );
}

const TONES: Record<string, string> = {
  neutral: "bg-slate-50 text-slate-600 border-slate-200/60",
  info: "bg-blue-50 text-blue-700 border-blue-200/80",
  pending: "bg-amber-50 text-amber-800 border-amber-200/80",
  good: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
  bad: "bg-rose-50 text-rose-700 border-rose-200/80",
  primary: "bg-slate-100 text-[#0B1457] border-slate-200",
};

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  draft: "neutral",
  pending_approval: "pending",
  pending: "pending",
  approved: "good",
  rejected: "bad",
  cancelled: "neutral",
  rfq_issued: "info",
  po_issued: "primary",
  open: "info",
  closed: "neutral",
  awarded: "primary",
  submitted: "info",
  invited: "neutral",
  shortlisted: "info",
  skipped: "neutral",
  issued: "primary",
  acknowledged: "good",
};

export function StatusPill({ status, label }: { status: string; label?: string | undefined }) {
  const tone = STATUS_TONE[status] ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium",
        TONES[tone],
      )}
    >
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode | undefined;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-6 py-14 text-center shadow-xs">
      <h2 className="text-base font-semibold text-slate-900 tracking-tight">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-xs text-slate-500 font-normal leading-relaxed">{body}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 font-sans text-2xl font-semibold text-slate-900 tabular-nums tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-slate-400 font-normal">{hint}</p> : null}
    </div>
  );
}
