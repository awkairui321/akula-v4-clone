import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SECTOR_LABELS, STAGE_LABELS } from "@/lib/types";
import type { Asset, Document, Fund } from "@/lib/types";
import { formatPrice, formatPricePrecise } from "@/lib/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { ArrowLeftIcon, PlayCircleIcon, FileTextIcon, DownloadIcon } from "lucide-react";

/* ─── Formatting helpers ─── */

function daysUntil(dateString: string | null): number | null {
  if (!dateString) return null;
  const diff = new Date(dateString).getTime() - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/** Extracts a rough numeric magnitude from a free-text money display like
 *  "$1.6B" or "$740M", for scaling chart bars — never shown to the reader. */
function moneyMagnitude(display: string): number {
  const match = /([\d.]+)\s*([bmk])?/i.exec(display.replace(/[$,]/g, ""));
  if (!match) return 0;
  const n = parseFloat(match[1]);
  const suffix = match[2]?.toLowerCase();
  if (suffix === "b") return n * 1000;
  if (suffix === "m") return n;
  if (suffix === "k") return n / 1000;
  return n;
}

/* ─── Section registry — every section is optional; absent data hides both
 *  the section and its nav entry, matching the source template's rule. ─── */

type SectionId =
  | "overview"
  | "market"
  | "business"
  | "financials"
  | "risks"
  | "recording"
  | "documents";

function sectionsFor(_fund: Fund): { id: SectionId; nav: string }[] {
  return [
    { id: "overview", nav: "Overview" },
    { id: "market", nav: "Market & competitive" },
    { id: "business", nav: "Business model" },
    { id: "financials", nav: "Financials" },
    { id: "risks", nav: "Risks" },
    { id: "recording", nav: "Recordings" },
    { id: "documents", nav: "Documents" },
  ];
}

/* ─── Scroll-spy ─── */

function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);

  useEffect(() => {
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0 || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    elements.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")]);

  return active;
}

/* ─── Nav ─── */

function RailNav({
  sections,
  active,
}: {
  sections: { id: SectionId; nav: string }[];
  active: string | null;
}) {
  return (
    <nav aria-label="Contents" className="sticky top-6 hidden w-44 shrink-0 self-start lg:block">
      <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Contents
      </p>
      <ol className="space-y-1 text-sm">
        {sections.map((s, i) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${
                active === s.id
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="text-xs text-muted-foreground">{i + 1}</span>
              {s.nav}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function ChipNav({
  sections,
  active,
}: {
  sections: { id: SectionId; nav: string }[];
  active: string | null;
}) {
  return (
    <nav aria-label="Sections" className="pb-1 lg:hidden">
      <div className="flex flex-wrap gap-2">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs whitespace-nowrap ${
              active === s.id ? "border-primary bg-primary/10 font-medium" : "text-muted-foreground"
            }`}
          >
            {s.nav}
          </a>
        ))}
      </div>
    </nav>
  );
}

/* ─── Hero ─── */

function GlanceRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div
      className={`min-w-0 rounded-md bg-muted/35 p-3 ${label === "Key customers" || label === "Commercial model" ? "col-span-2" : ""}`}
    >
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-left text-sm leading-snug font-medium">{value}</dd>
    </div>
  );
}

function Hero({ fund }: { fund: Fund }) {
  const { asset } = fund;
  const allocated = parseFloat(fund.supply_allocated);
  const total = fund.supply_total ? parseFloat(fund.supply_total) : null;
  const pct = total && total > 0 ? Math.min(100, Math.round((allocated / total) * 100)) : null;
  const days = daysUntil(fund.closes_at);
  const closingSoon = days !== null && days <= 7;

  return (
    <section className="space-y-5">
      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-2.5">
          <div className="space-y-2.5">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {asset.name} · {fund.fund_manager.name}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{fund.codename}</h1>
              <Badge variant={fund.state === "open" ? "default" : "secondary"}>
                {fund.state === "open" ? "Live" : fund.state}
              </Badge>
              {closingSoon && <Badge variant="destructive">Closing soon</Badge>}
            </div>
            {asset.tagline && <p className="text-lg text-muted-foreground">{asset.tagline}</p>}
            <p className="text-sm text-muted-foreground">{asset.description}</p>
          </div>
          {fund.key_metrics.length > 0 && (
            <div className="mt-auto grid grid-cols-2 gap-3 pt-2">
              {fund.key_metrics.map((m) => (
                <div key={m.label} className="min-w-0 rounded-lg border bg-card px-3 py-2">
                  <strong className="block text-lg leading-tight font-bold">{m.value}</strong>
                  <span className="block text-xs text-muted-foreground">{m.label}</span>
                  {m.note && (
                    <span className="block text-[11px] leading-tight text-muted-foreground">
                      {m.note}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-2 rounded-lg border bg-card p-4">
          <p className="col-span-2 mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            At a glance
          </p>
          <GlanceRow label="Sector" value={SECTOR_LABELS[asset.sector] ?? asset.sector} />
          <GlanceRow
            label="Founded"
            value={asset.founded_year ? `${asset.founded_year}, ${asset.headquarters}` : null}
          />
          <GlanceRow label="Key customers" value={asset.typical_buyer} />
          <GlanceRow label="Commercial model" value={asset.commercial_model} />
        </dl>
      </div>

      {total !== null && (
        <div className="space-y-2 rounded-lg border bg-card p-4">
          <div className="flex justify-between text-sm">
            <span className="font-medium">
              {formatPrice(total - allocated)} of {formatPrice(total)} supply available
            </span>
            {days !== null && (
              <span className="text-muted-foreground">
                {days === 0 ? "Closes today" : `Closes in ${days} days`}
              </span>
            )}
          </div>
          <Progress value={pct ?? 0} />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatPrice(allocated)} allocated</span>
            {pct !== null && <span>{pct}% allocated</span>}
          </div>
        </div>
      )}
    </section>
  );
}

/* ─── Section shell ─── */

function SectionShell({
  id,
  title,
  standfirst,
  children,
}: {
  id: string;
  title: string;
  standfirst?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4">
      <div className="space-y-1.5">
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        {standfirst && <p className="text-sm text-muted-foreground">{standfirst}</p>}
      </div>
      {children}
    </section>
  );
}

/* ─── Overview section ─── */

function OverviewSection({ asset }: { asset: Asset }) {
  return (
    <div className="space-y-6">
      {asset.how_it_works.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {asset.how_it_works.map((row) => (
            <div key={row.label} className="space-y-1">
              <h3 className="text-sm font-semibold">{row.label}</h3>
              <p className="text-sm text-muted-foreground">{row.text}</p>
            </div>
          ))}
        </div>
      )}

      {asset.in_practice && (
        <div className="space-y-2 rounded-lg border bg-muted/40 p-4">
          <h3 className="text-sm font-semibold">In practice</h3>
          <p className="text-sm font-medium">{asset.in_practice.lead}</p>
          <p className="text-sm text-muted-foreground">{asset.in_practice.text}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {asset.in_practice.tag && <span>{asset.in_practice.tag}</span>}
            {asset.in_practice.source_href && (
              <a
                href={asset.in_practice.source_href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                {asset.in_practice.source_label ?? "Source"}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LeadershipSection({ asset }: { asset: Asset }) {
  if (asset.team.length === 0) return null;
  return (
    <div className="leadership-grid">
      <h3>Who leads the company</h3>
      <ul>
        {asset.team.map((person) => (
          <li key={person.name}>
            <strong>{person.name}</strong>
            <span>{person.role}</span>
            {person.note && <p>{person.note}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── Market section ─── */

function MarketSection({ asset }: { asset: Asset }) {
  return (
    <div className="space-y-6">
      {asset.market_context.length > 0 && (
        <div className="space-y-2 text-sm text-muted-foreground">
          {asset.market_context.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}

      {asset.competitive_landscape.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Competitive landscape</h3>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Alternative</th>
                  <th className="px-3 py-2 text-left font-medium">Examples</th>
                  <th className="px-3 py-2 text-left font-medium">Why a buyer might choose it</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {asset.competitive_landscape.map((row) => (
                  <tr key={row.category}>
                    <th scope="row" className="px-3 py-2.5 text-left font-medium">
                      {row.category}
                    </th>
                    <td className="px-3 py-2.5 text-muted-foreground">{row.examples}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{row.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(asset.thesis || asset.thesis_points.length > 0) && (
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <p className="text-xs font-medium tracking-wide text-primary uppercase">
            Investment thesis
          </p>
          {asset.thesis && <p className="text-sm text-muted-foreground">{asset.thesis}</p>}
          {asset.thesis_points.length > 0 && (
            <ol className="space-y-3">
              {asset.thesis_points.map((p, i) => (
                <li key={p.title} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{p.title}</p>
                    <p className="text-sm text-muted-foreground">{p.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Business section ─── */

function BusinessSection({ asset }: { asset: Asset }) {
  return (
    <div className="space-y-6">
      {asset.business_columns.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          {asset.business_columns.map((c) => (
            <div key={c.title} className="space-y-1">
              <h3 className="text-sm font-semibold">{c.title}</h3>
              <p className="text-sm text-muted-foreground">{c.text}</p>
            </div>
          ))}
        </div>
      )}

      {asset.product_disclosures.length > 0 && (
        <div className="space-y-2 rounded-lg border bg-muted/40 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Selected product disclosures</h3>
            {asset.product_disclosures_source && (
              <span className="text-xs text-muted-foreground">
                {asset.product_disclosures_source}
              </span>
            )}
          </div>
          {asset.product_disclosures_note && (
            <p className="text-xs text-muted-foreground">{asset.product_disclosures_note}</p>
          )}
          <dl className="grid gap-3 sm:grid-cols-2">
            {asset.product_disclosures.map((d) => (
              <div key={d.label}>
                <dt className="text-xs text-muted-foreground">
                  {d.label}
                  {d.sub && <span className="ml-1">· {d.sub}</span>}
                </dt>
                <dd className="text-lg font-semibold">{d.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

/* ─── Financials section ─── */

function RevenueBars({ points }: { points: Fund["revenue_points"] }) {
  const values = points.map((p) => parseFloat(p.value ?? "0"));
  const max = Math.max(...values, 0.01);
  return (
    <div className="flex items-end gap-2 overflow-x-auto pb-2">
      {points.map((p, i) => (
        <div key={p.period} className="flex min-w-14 flex-1 flex-col items-center gap-1">
          <span className="text-[11px] font-medium">
            {p.value === null ? "Undisclosed" : `$${p.value}B`}
          </span>
          <div className="flex h-32 w-full items-end">
            <div
              className={`w-full rounded-t ${i === points.length - 1 ? "bg-primary" : "bg-primary/40"}`}
              style={{ height: `${Math.max(2, (values[i] / max) * 100)}%` }}
            />
          </div>
          <span className="text-[11px] text-muted-foreground">{p.period}</span>
        </div>
      ))}
    </div>
  );
}

function RoundsChart({ rounds }: { rounds: Asset["funding_rounds"] }) {
  const [selected, setSelected] = useState(rounds.length - 1);
  const magnitudes = rounds.map((r) => moneyMagnitude(r.valuation));
  const max = Math.max(...magnitudes, 1);
  const round = rounds[selected];

  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_260px]">
      <div className="flex items-end gap-2 overflow-x-auto pb-2">
        {rounds.map((r, i) => (
          <button
            key={`${r.date}-${r.round}`}
            type="button"
            aria-pressed={i === selected}
            onClick={() => setSelected(i)}
            className={`flex min-w-16 flex-1 flex-col items-center gap-1 rounded-md py-1 transition-colors ${
              i === selected ? "bg-muted" : "hover:bg-muted/50"
            }`}
          >
            <span className="text-[11px] font-medium">{r.valuation}</span>
            <div className="flex h-28 w-full items-end px-1">
              <div
                className={`w-full rounded-t ${i === selected ? "bg-primary" : "bg-primary/40"}`}
                style={{ height: `${Math.max(2, (magnitudes[i] / max) * 100)}%` }}
              />
            </div>
            <span
              className={`text-[11px] ${i === selected ? "font-medium" : "text-muted-foreground"}`}
            >
              {r.date}
            </span>
          </button>
        ))}
      </div>
      {round && (
        <div className="space-y-2 rounded-lg border bg-card p-3 text-sm">
          <div className="flex items-baseline justify-between">
            <strong>{round.date}</strong>
            <span className="text-xs text-muted-foreground">{round.round}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-muted-foreground">Valuation</p>
              <p className="font-medium">{round.valuation}</p>
            </div>
            {round.raised && (
              <div>
                <p className="text-xs text-muted-foreground">Amount raised</p>
                <p className="font-medium">{round.raised}</p>
              </div>
            )}
          </div>
          {round.lead && (
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">Lead / participants:</strong> {round.lead}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function FinancialsSection({ fund }: { fund: Fund }) {
  const { asset } = fund;
  return (
    <div className="space-y-3">
      {fund.revenue_points.length > 0 && (
        <div className="grid gap-4 bg-muted/50 p-4 md:grid-cols-[minmax(0,1fr)_240px]">
          <div className="min-w-0 space-y-2">
            <h3 className="text-sm font-semibold">Revenue run-rate</h3>
            <p className="text-xs text-muted-foreground">Reported company updates · USD billions</p>
            <RevenueBars points={fund.revenue_points} />
          </div>
          <div className="flex flex-col justify-center bg-card p-4 text-sm">
            <strong>Reported growth</strong>
            <p className="mt-2 text-muted-foreground">
              Compare the published operating periods. These are company measures, not fund returns.
            </p>
          </div>
        </div>
      )}

      {asset.funding_rounds.length > 0 && (
        <div className="space-y-2 bg-muted/50 p-4">
          <h3 className="text-sm font-semibold">Financing and valuation</h3>
          <p className="text-xs text-muted-foreground">
            Selected financing rounds · select a round to see its details.
          </p>
          <RoundsChart rounds={asset.funding_rounds} />
        </div>
      )}

      {asset.financial_indicators.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {asset.financial_indicators.map((ind) => (
            <div key={ind.label} className="border bg-card p-3">
              <strong
                className={ind.word ? "block text-lg font-semibold" : "block text-xl font-bold"}
              >
                {ind.value}
              </strong>
              <span className="block text-xs text-muted-foreground">{ind.label}</span>
              {ind.source && (
                <span className="block text-[11px] text-muted-foreground">{ind.source}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        These figures are company-reported measures and operating indicators, not audited financial
        statements. No figure shown here is a forecast.
      </p>
    </div>
  );
}

/* ─── Risks section ─── */

const GENERAL_RISKS = [
  { label: "Liquidity", text: "Interests may be illiquid and subject to transfer restrictions." },
  {
    label: "Capital & dilution",
    text: "Investors can lose capital; future financing may dilute ownership.",
  },
  {
    label: "Terms vary",
    text: "Rights, fees, tax treatment and exposure depend on the actual security and investment vehicle.",
  },
  {
    label: "Exit uncertainty",
    text: "A financing valuation is not a guaranteed sale price, and no exit timetable is assured.",
  },
];

function RisksSection({ asset }: { asset: Asset }) {
  return (
    <div className="space-y-6">
      <ul className="space-y-4">
        {asset.risks.map((r) => (
          <li key={r.title} className="flex gap-2 text-sm">
            <span className="mt-0.5 shrink-0 text-amber-500">!</span>
            <div>
              <p className="font-medium">{r.title}</p>
              <p className="text-muted-foreground">{r.body}</p>
            </div>
          </li>
        ))}
      </ul>

      <details className="rounded-lg border bg-muted/40 p-4" open>
        <summary className="cursor-pointer text-sm font-semibold">
          General private-market investment risks
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {GENERAL_RISKS.map((r) => (
            <div key={r.label}>
              <h4 className="text-sm font-medium">{r.label}</h4>
              <p className="text-xs text-muted-foreground">{r.text}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          This overview is not an offer, solicitation, investment advice or a substitute for
          definitive documents and independent professional advice.
        </p>
      </details>
    </div>
  );
}

/* ─── Recording section ─── */

function RecordingSection({ fund }: { fund: Fund }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-muted/40 p-4 sm:flex-row sm:items-center">
      {fund.recording_available && fund.recording_embed_url ? (
        <a
          href={fund.recording_embed_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm font-medium underline underline-offset-2"
        >
          <PlayCircleIcon className="size-5" />
          Watch the recording
        </a>
      ) : (
        <div className="flex items-center gap-3 text-muted-foreground">
          <PlayCircleIcon className="size-8 shrink-0" />
          <div>
            <strong className="block text-sm text-foreground">Recording to be added</strong>
            <span className="text-sm">No video provided yet.</span>
          </div>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        Optional viewing. The written overview stands on its own.
      </p>
    </div>
  );
}

/* ─── Documents section ─── */

function DocumentsSection({
  fund,
  viewer,
}: {
  fund: Fund;
  viewer: "investor" | "luca" | "ops" | "eam" | "rm";
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["documents", { fund_id: fund.id }],
    queryFn: () => api<{ documents: Document[] }>(`/api/v1/documents?fund_id=${fund.id}`),
  });
  const documents = data?.documents ?? [];

  return (
    <div className="space-y-6">
      {fund.primary_source && (
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Primary material
          </p>
          <h3 className="mt-1 text-sm font-semibold">{fund.primary_source.title}</h3>
          <p className="text-xs text-muted-foreground">{fund.primary_source.meta}</p>
          <p className="mt-2 text-sm text-muted-foreground">{fund.primary_source.text}</p>
        </div>
      )}

      {(fund.figures_checked_note || fund.figures_checked_links.length > 0) && (
        <div className="rounded-lg border bg-card p-4 text-sm">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            How figures were checked
          </p>
          {fund.figures_checked_note && (
            <p className="mt-1 text-muted-foreground">{fund.figures_checked_note}</p>
          )}
          {fund.figures_checked_links.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-3">
              {fund.figures_checked_links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  {l.label}
                </a>
              ))}
            </p>
          )}
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Deal materials</h3>
        {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {!isLoading && documents.length === 0 && (
          <p className="text-sm text-muted-foreground">No deal documents available yet.</p>
        )}
        {documents.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
              >
                <div className="flex items-center gap-2.5">
                  <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                {doc.has_file && doc.file_data_url && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(doc.file_data_url!, "_blank")}
                  >
                    <DownloadIcon className="mr-1 size-4" />
                    View
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {viewer === "luca" && (
        <p className="text-xs text-muted-foreground">
          Upload additional materials from{" "}
          <Link to={`/luca/deals/${fund.id}`} className="underline underline-offset-2">
            this deal's Documents tab
          </Link>
          .
        </p>
      )}
    </div>
  );
}

/* ─── Terms panel + subscribe (investor) / edit callout (luca) ─── */

function TermsPanel({ fund }: { fund: Fund }) {
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4 text-sm">
      <div className="flex items-baseline justify-between">
        <strong>Price &amp; fees</strong>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-muted-foreground">Min ticket</p>
          <p className="font-semibold">{formatPrice(fund.min_subscription)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Closes in</p>
          <p className="font-semibold">
            {daysUntil(fund.closes_at) !== null ? `${daysUntil(fund.closes_at)}d` : "Open"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Entry price</p>
          <p className="font-semibold">{formatPricePrecise(fund.price)}</p>
        </div>
      </div>
      <Separator />
      <div className="space-y-1.5">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subscription fee</span>
          <span>{fund.subscription_fee_pct}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Management fee</span>
          <span>{fund.management_fee_pct}% p.a.</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Carried interest</span>
          <span>{fund.carried_interest_pct}%</span>
        </div>
      </div>
    </div>
  );
}

function SubscribeCalculator({ fund }: { fund: Fund }) {
  const [amount, setAmount] = useState(fund.min_subscription);
  const navigate = useNavigate();
  const numAmount = parseFloat(amount);
  const minSub = parseFloat(fund.min_subscription);
  const maxSub = fund.max_subscription ? parseFloat(fund.max_subscription) : null;
  const feePct = parseFloat(fund.subscription_fee_pct);
  const fee = numAmount * (feePct / 100);
  const valid = numAmount >= minSub && (!maxSub || numAmount <= maxSub);

  if (fund.investor_access && !fund.investor_access.canSubscribe) {
    return (
      <div className="rounded-lg border bg-card p-4 text-center text-sm text-muted-foreground">
        This deal remains available for your investment history. Your current investor profile does
        not provide access to new subscriptions in this deal.
      </div>
    );
  }

  if (fund.state !== "open") {
    return (
      <div className="rounded-lg border bg-card p-4 text-center text-sm text-muted-foreground">
        This deal is not currently open for subscriptions.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <Label htmlFor="investment-amount" className="text-sm font-semibold">
        Subscribe
      </Label>
      <Input
        id="investment-amount"
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        min={fund.min_subscription}
        max={fund.max_subscription ?? undefined}
        step="1000"
      />
      <p className="text-xs text-muted-foreground">
        Min {formatPricePrecise(fund.min_subscription)}
        {fund.max_subscription && ` · Max ${formatPricePrecise(fund.max_subscription)}`}
      </p>
      <div className="space-y-1 rounded-lg border p-2.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subscription amount</span>
          <span>{valid ? formatPricePrecise(numAmount) : "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Fee ({fund.subscription_fee_pct}%)</span>
          <span>{valid ? formatPricePrecise(fee) : "—"}</span>
        </div>
        <div className="flex justify-between border-t pt-1 font-medium">
          <span>Total</span>
          <span>{valid ? formatPricePrecise(numAmount + fee) : "—"}</span>
        </div>
      </div>
      <Button
        className="w-full"
        disabled={!valid}
        onClick={() => navigate(`/checkout/${fund.id}?amount=${amount}`)}
      >
        Start subscription
      </Button>
    </div>
  );
}

/* ─── Main component ─── */

export default function DealOverviewPage({
  fund,
  viewer,
  backTo,
  backLabel,
  onEditDeal,
  preview = false,
  embedded = false,
}: {
  fund: Fund;
  viewer: "investor" | "luca" | "ops" | "eam" | "rm";
  backTo: string;
  backLabel: string;
  onEditDeal?: () => void;
  preview?: boolean;
  /** Rendered inside another page that already provides the back link and actions. */
  embedded?: boolean;
}) {
  const { asset } = fund;
  const sections = useMemo(() => sectionsFor(fund), [fund]);
  const active = useActiveSection(sections.map((s) => s.id));
  const topRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={topRef}
      className="deal-reading-page pompom-deal mx-auto w-full max-w-6xl min-w-0 space-y-8"
    >
      {!embedded && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {preview ? (
            <Badge variant="outline">
              {viewer === "eam" ? "EAM" : viewer === "rm" ? "RM" : "Investor"} preview · read only
            </Badge>
          ) : (
            <Link to={backTo}>
              <Button variant="ghost" size="sm" className="p-0">
                <ArrowLeftIcon className="mr-1 size-4" />
                {backLabel}
              </Button>
            </Link>
          )}
          {viewer === "luca" || viewer === "ops" ? (
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {viewer === "ops" ? "Akula Ops publication editor" : "LUCA SGP authoring"}
              </Badge>
              {onEditDeal && (
                <Button size="sm" onClick={onEditDeal}>
                  Edit published deal
                </Button>
              )}
            </div>
          ) : null}
        </div>
      )}

      <Hero fund={fund} />

      <ChipNav sections={sections} active={active} />

      <div className="flex gap-8">
        <RailNav sections={sections} active={active} />
        <div className="min-w-0 flex-1 space-y-12">
          <SectionShell
            id="overview"
            title="How the company creates value"
            standfirst={`What problem ${asset.name} solves, what it provides and who uses it.`}
          >
            <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
              <OverviewSection asset={asset} />
              <div className="space-y-4 lg:sticky lg:top-8 lg:self-start">
                <TermsPanel fund={fund} />
                {viewer === "investor" && !preview ? (
                  <SubscribeCalculator fund={fund} />
                ) : preview ? (
                  <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                    <p className="font-medium">
                      {viewer === "eam"
                        ? "Adviser-facing opportunity"
                        : viewer === "rm"
                          ? "RM opportunity overview"
                          : "Investor opportunity access"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Read-only preview. No allocation or subscription is created.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    {viewer === "eam" || viewer === "rm"
                      ? "Adviser access is read-only. Investors can review and subscribe from their own workspace."
                      : "Investors see a subscribe calculator here. LUCA sees deal terms only."}
                  </div>
                )}
              </div>
            </div>
            <LeadershipSection asset={asset} />
          </SectionShell>

          {sections.some((s) => s.id === "market") && (
            <SectionShell
              id="market"
              title="Market opportunity and competitive position"
              standfirst="The opportunity is broad, but customers have several credible ways to meet the same need."
            >
              <MarketSection asset={asset} />
            </SectionShell>
          )}

          {sections.some((s) => s.id === "business") && (
            <SectionShell
              id="business"
              title="Business model and commercial traction"
              standfirst="Who pays, how pricing works and what makes spending grow or shrink."
            >
              <BusinessSection asset={asset} />
            </SectionShell>
          )}

          {sections.some((s) => s.id === "financials") && (
            <SectionShell
              id="financials"
              title="Financials and key statistics"
              standfirst="A longer view of reported growth, selected financing milestones and operating indicators."
            >
              <FinancialsSection fund={fund} />
            </SectionShell>
          )}

          {sections.some((s) => s.id === "risks") && (
            <SectionShell
              id="risks"
              title="Risks and considerations"
              standfirst="Business-specific questions to prioritise in diligence, plus the general risks that apply to all private-market investments."
            >
              <RisksSection asset={asset} />
            </SectionShell>
          )}

          <SectionShell
            id="recording"
            title="Recorded overview"
            standfirst="Optional viewing. The written overview stands on its own."
          >
            <RecordingSection fund={fund} />
          </SectionShell>

          <SectionShell
            id="documents"
            title="Documents and updates"
            standfirst="The source material behind this overview and the deal's published materials."
          >
            <DocumentsSection fund={fund} viewer={viewer} />
          </SectionShell>
        </div>
      </div>

      <Separator />
      <p className="pb-8 text-center text-xs text-muted-foreground">
        {STAGE_LABELS[asset.funding_stage] ?? asset.funding_stage} · Compiled from the data room,
        public sources and the selling shareholder. LUCA SGP does not warrant third-party
        information.
      </p>
    </div>
  );
}
