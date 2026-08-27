import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardList, ShieldCheck, FileSignature } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Procurely Flow — Auditable procurement for builders" },
      {
        name: "description",
        content:
          "Requisitions, threshold approvals, supplier quotes and purchase orders in one auditable flow for Nigerian construction and property teams.",
      },
      { property: "og:title", content: "Procurely Flow — Auditable procurement for builders" },
      {
        property: "og:description",
        content:
          "Replace WhatsApp threads and paper approvals with one auditable procurement flow.",
      },
      { property: "og:url", content: "https://site-deal-pro.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://site-deal-pro.lovable.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": "https://site-deal-pro.lovable.app/#organization",
              name: "Procurely Flow",
              url: "https://site-deal-pro.lovable.app/",
              description:
                "Procurement workflow platform for Nigerian construction and property-development teams.",
            },
            {
              "@type": "WebSite",
              "@id": "https://site-deal-pro.lovable.app/#website",
              name: "Procurely Flow",
              url: "https://site-deal-pro.lovable.app/",
              publisher: { "@id": "https://site-deal-pro.lovable.app/#organization" },
            },
          ],
        }),
      },
    ],
  }),
  component: Landing,
});

const STEPS = [
  {
    icon: ClipboardList,
    title: "Request",
    body: "Site teams raise a material request from their phone in under a minute.",
  },
  {
    icon: ShieldCheck,
    title: "Approve",
    body: "Your own threshold rules route each request. Every decision is logged permanently.",
  },
  {
    icon: FileSignature,
    title: "Buy",
    body: "Collect sealed supplier quotes, compare side by side, then issue the purchase order.",
  },
];

function Landing() {
  return (
    <main className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <span className="font-display text-2xl uppercase tracking-wider text-primary">
          Procurely Flow
        </span>
        <Link
          to="/auth"
          className="inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Sign in
        </Link>
      </header>

      <section className="mx-auto max-w-4xl px-5 py-14">
        <p className="data-label">Procurement workflow · Nigeria</p>
        <h1 className="mt-2 font-display text-4xl uppercase leading-[1.05] text-foreground sm:text-6xl">
          One auditable flow from site request to purchase order
        </h1>
        <p className="mt-4 max-w-2xl text-base text-muted-foreground">
          Procurely Flow replaces WhatsApp messages, phone calls and paper approvals with a single
          record your finance team can trust — requisitions, threshold approvals, competitive
          supplier quotes and purchase orders.
        </p>
        <div className="mt-7">
          <Link
            to="/auth"
            className="inline-flex h-12 items-center rounded-md bg-accent px-6 text-sm font-semibold text-accent-foreground hover:bg-accent/90"
          >
            Get started
          </Link>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.title} className="rounded-lg border border-border bg-card p-5">
              <step.icon className="h-5 w-5 text-accent" aria-hidden />
              <h2 className="mt-3 font-display text-2xl uppercase text-foreground">{step.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
