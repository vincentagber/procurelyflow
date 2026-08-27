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
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
      <div>
        <h1 className="page-title text-foreground">{title}</h1>
        {subtitle ? (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

const TONES: Record<string, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-accent/10 text-accent",
  pending: "bg-warning/15 text-warning-foreground",
  good: "bg-success/15 text-success",
  bad: "bg-destructive/12 text-destructive",
  primary: "bg-primary/10 text-primary",
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
        "inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
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
    <div className="rounded-lg border border-dashed border-border bg-surface px-6 py-14 text-center">
      <h2 className="font-display text-2xl uppercase tracking-wide text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{body}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
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
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="data-label">{label}</p>
      <p className="mt-1 font-display text-3xl leading-none text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
