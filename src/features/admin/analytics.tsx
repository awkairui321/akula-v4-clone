import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatPrice, formatPriceCompact } from "@/lib/currency";
import { useAuth } from "@/contexts/auth-context";
import type { Fund } from "@/lib/types";
import type { WorkflowView } from "@/lib/workflow-types";
import type { InvestorsResponse, PartnersResponse, SubscriptionsResponse } from "./types";
import { Button } from "@/components/ui/button";
import { PERIODS, buildAnalytics, type Period } from "./analytics-data";

/* Colour: capital states are an ordered, one-hue ramp (validated --ordinal); every other
   chart is a single series in the lead hue. Both modes are validated against their surface. */
const VIZ_CSS = `
.viz-root {
  --viz-main: #2a78d6;
  --viz-track: #cde2fb;
  --viz-committed: #86b6ef;
  --viz-funded: #3987e5;
  --viz-allocated: #1c5cab;
  --viz-surface: #fcfcfb;
  --viz-grid: #e4e3df;
}
:root[data-theme="dark"] .viz-root, .dark .viz-root {
  --viz-main: #3987e5;
  --viz-track: #26364a;
  --viz-committed: #184f95;
  --viz-funded: #2a78d6;
  --viz-allocated: #86b6ef;
  --viz-surface: #1a1a19;
  --viz-grid: #383835;
}
`;

const SECTION = "text-xs font-medium tracking-wide text-muted-foreground uppercase";
const monthLabel = (key: string) =>
  new Date(`${key}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });

type Tip = { x: number; y: number; title: string; lines: string[] } | null;

/** Capital in three states, nested on one baseline against the target. */
function CapitalMeter({
  row,
  scale,
  onTip,
}: {
  row: { committed: number; funded: number; allocated: number; target: number | null };
  scale: number;
  onTip: (tip: Tip, e?: React.PointerEvent) => void;
}) {
  const w = (n: number) => `${Math.min(100, (n / scale) * 100)}%`;
  return (
    <div
      className="relative h-2 w-full rounded-full"
      style={{ background: "var(--viz-track)" }}
      onPointerMove={(e) =>
        onTip(
          {
            x: 0,
            y: 0,
            title: "Capital",
            lines: [
              `Committed ${formatPrice(row.committed)}`,
              `Funded ${formatPrice(row.funded)}`,
              `Allocated ${formatPrice(row.allocated)}`,
              row.target ? `Target ${formatPrice(row.target)}` : "No target set",
            ],
          },
          e,
        )
      }
      onPointerLeave={() => onTip(null)}
    >
      {(
        [
          ["committed", row.committed],
          ["funded", row.funded],
          ["allocated", row.allocated],
        ] as const
      ).map(([key, value]) => (
        <div
          key={key}
          className="absolute inset-y-0 left-0 rounded-r-[4px]"
          style={{ width: w(value), background: `var(--viz-${key})` }}
        />
      ))}
    </div>
  );
}

/** A labelled horizontal bar: the value sits at the tip. */
function BarRow({
  label,
  note,
  value,
  max,
  display,
  href,
  onTip,
  tip,
}: {
  label: string;
  note?: string;
  value: number;
  max: number;
  display: string;
  href?: string;
  onTip: (tip: Tip, e?: React.PointerEvent) => void;
  tip: string[];
}) {
  const inner = (
    <div
      className="grid grid-cols-[minmax(0,12rem)_1fr_7rem] items-center gap-x-4 py-2 hover:bg-muted/40 max-md:grid-cols-[1fr_6rem]"
      onPointerMove={(e) => onTip({ x: 0, y: 0, title: label, lines: tip }, e)}
      onPointerLeave={() => onTip(null)}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm">{label}</span>
        {note && <span className="block truncate text-xs text-muted-foreground">{note}</span>}
      </span>
      <span className="max-md:order-3 max-md:col-span-2">
        <span
          className="block h-3 rounded-r-[4px]"
          style={{
            width: `${max > 0 ? Math.max(1, (value / max) * 100) : 0}%`,
            background: "var(--viz-main)",
          }}
        />
      </span>
      <span className="text-right text-sm font-medium tabular-nums">{display}</span>
    </div>
  );
  return href ? <Link to={href}>{inner}</Link> : inner;
}

/** How the fund is doing: capital, investors, partners, speed and fees. */
export default function AnalyticsPage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("90d");
  const [showTable, setShowTable] = useState(false);
  const [tip, setTip] = useState<Tip>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const investors = useQuery({
    queryKey: ["admin", "investors", "all"],
    queryFn: () => api<InvestorsResponse>("/api/v1/admin/investors"),
  });
  const subs = useQuery({
    queryKey: ["admin", "subscriptions", "all"],
    queryFn: () => api<SubscriptionsResponse>("/api/v1/admin/subscriptions"),
  });
  const funds = useQuery({
    queryKey: ["admin", "funds"],
    queryFn: () => api<{ funds: Fund[] }>("/api/v1/funds"),
  });
  const workflow = useQuery({
    queryKey: ["workflows", user?.id],
    queryFn: () => api<WorkflowView>("/api/v1/workflows"),
    staleTime: 0,
  });
  const partners = useQuery({
    queryKey: ["admin", "partners", "terms"],
    queryFn: () => api<PartnersResponse>("/api/v1/admin/partners"),
  });

  const ready = investors.data && subs.data && funds.data && workflow.data && partners.data;
  const a = useMemo(
    () =>
      ready
        ? buildAnalytics(
            {
              investors: investors.data!.investors,
              subscriptions: subs.data!.subscriptions,
              funds: funds.data!.funds,
              workflow: workflow.data!,
              partners: partners.data!.partners,
            },
            period,
          )
        : null,
    [ready, investors.data, subs.data, funds.data, workflow.data, partners.data, period],
  );

  const showTip = (next: Tip, e?: React.PointerEvent) => {
    if (!next || !e || !rootRef.current) return setTip(null);
    const box = rootRef.current.getBoundingClientRect();
    setTip({ ...next, x: e.clientX - box.left + 12, y: e.clientY - box.top + 12 });
  };

  if (!a) return <p className="py-12 text-center text-muted-foreground">Loading analytics...</p>;

  const monthMax = Math.max(1, ...a.series.map((s) => s.amount));
  const sourceMax = Math.max(1, ...a.sources.map((s) => s.committed));
  const funnelMax = Math.max(1, a.funnel[0].count);
  const speedMax = Math.max(1, ...a.speed.map((s) => s.median ?? 0));
  const biggestDrop = a.funnel
    .slice(1)
    .map((stage, i) => ({ stage, lost: a.funnel[i].count - stage.count, from: a.funnel[i] }))
    .sort((x, y) => y.lost - x.lost)[0];
  const periodLabel = PERIODS.find((p) => p.key === period)!.label.toLowerCase();

  return (
    <div ref={rootRef} className="viz-root relative flex w-full flex-col gap-10">
      <style>{VIZ_CSS}</style>
      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-20 max-w-64 rounded-md border bg-popover px-3 py-2 text-xs shadow-sm"
          style={{ left: tip.x, top: tip.y }}
        >
          <p className="font-medium">{tip.title}</p>
          {tip.lines.map((line) => (
            <p key={line} className="text-muted-foreground tabular-nums">
              {line}
            </p>
          ))}
        </div>
      )}

      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">
          How the fund is doing. The Dashboard shows what needs you today; this shows the trends
          behind it. Every figure comes from the records and opens the list behind it.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Period">
        <span className="mr-1 text-sm text-muted-foreground">Period</span>
        {PERIODS.map((p) => (
          <Button
            key={p.key}
            size="sm"
            variant={period === p.key ? "secondary" : "outline"}
            className="rounded-full"
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </Button>
        ))}
        <span className="ml-2 text-xs text-muted-foreground">
          Applies to commitments over time, the investor funnel, speed and fees. Capital and sources
          are the position today.
        </span>
      </div>

      {/* Headline figures */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-5 border-y py-5 lg:grid-cols-4">
        {(
          [
            [
              "Committed",
              formatPrice(a.totals.committed),
              a.totals.target ? `of ${formatPrice(a.totals.target)} target` : "live commitments",
            ],
            ["Funded", formatPrice(a.totals.funded), "Cash received, fees excluded"],
            ["Allocated", formatPrice(a.totals.allocated), "Allocated by LUCA"],
            [
              "Median start to allocation",
              a.endToEnd.median === null ? "—" : `${a.endToEnd.median.toFixed(1)} days`,
              `${a.endToEnd.n} subscription${a.endToEnd.n === 1 ? "" : "s"} in the last ${periodLabel}`,
            ],
          ] as const
        ).map(([label, value, note]) => (
          <div key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{note}</p>
          </div>
        ))}
      </div>

      {/* Capital */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className={SECTION}>Capital by project</h2>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {(
              [
                ["Committed", "committed"],
                ["Funded", "funded"],
                ["Allocated", "allocated"],
              ] as const
            ).map(([label, key]) => (
              <span key={key} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm" style={{ background: `var(--viz-${key})` }} />
                {label}
              </span>
            ))}
          </div>
        </div>
        <div className="divide-y border-y">
          <div className="grid grid-cols-[minmax(0,12rem)_1fr_repeat(3,6.5rem)] gap-x-4 py-2 text-xs text-muted-foreground max-lg:hidden">
            <span>Project</span>
            <span>Committed against target</span>
            <span className="text-right">Committed</span>
            <span className="text-right">Funded</span>
            <span className="text-right">Allocated</span>
          </div>
          {a.capital.map((row) => (
            <Link
              key={row.key}
              to={`/luca/projects/${row.assetId}`}
              className="grid grid-cols-[minmax(0,12rem)_1fr_repeat(3,6.5rem)] items-center gap-x-4 py-2.5 text-sm hover:bg-muted/40 max-lg:grid-cols-[1fr_auto]"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{row.label}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {row.company} · {row.funds} fund{row.funds === 1 ? "" : "s"}
                </span>
              </span>
              <span className="flex items-center gap-3 max-lg:order-3 max-lg:col-span-2">
                <span className="flex-1">
                  <CapitalMeter
                    row={row}
                    scale={row.target ?? Number.POSITIVE_INFINITY}
                    onTip={showTip}
                  />
                </span>
                <span className="w-28 text-right text-xs text-muted-foreground tabular-nums">
                  {row.target
                    ? `${Math.round((row.committed / row.target) * 100)}% of ${formatPriceCompact(row.target)}`
                    : "no target"}
                </span>
              </span>
              <span className="text-right tabular-nums">{formatPrice(row.committed)}</span>
              <span className="text-right tabular-nums max-lg:hidden">
                {formatPrice(row.funded)}
              </span>
              <span className="text-right tabular-nums max-lg:hidden">
                {formatPrice(row.allocated)}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Commitments over time */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className={SECTION}>New commitments by month · last {periodLabel}</h2>
          <Button size="sm" variant="ghost" onClick={() => setShowTable((v) => !v)}>
            {showTable ? "Show chart" : "Show as table"}
          </Button>
        </div>
        {a.series.length === 0 ? (
          <p className="border-y py-8 text-sm text-muted-foreground">
            No new commitments in this period.
          </p>
        ) : showTable ? (
          <table className="w-full max-w-md text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="pb-2 font-normal">Month</th>
                <th className="pb-2 text-right font-normal">Committed</th>
              </tr>
            </thead>
            <tbody className="divide-y border-y">
              {a.series.map((s) => (
                <tr key={s.month}>
                  <td className="py-2">{monthLabel(s.month)}</td>
                  <td className="py-2 text-right tabular-nums">{formatPrice(s.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="border-y py-4">
            <div className="relative flex h-48 items-end gap-3 pl-14">
              {[1, 0.5, 0].map((t) => (
                <div
                  key={t}
                  className="pointer-events-none absolute right-0 left-0 flex items-center"
                  style={{ bottom: `${t * 100}%` }}
                >
                  <span className="w-12 pr-2 text-right text-[11px] text-muted-foreground tabular-nums">
                    {formatPriceCompact(monthMax * t)}
                  </span>
                  <span className="h-px flex-1" style={{ background: "var(--viz-grid)" }} />
                </div>
              ))}
              {a.series.map((s) => (
                <div
                  key={s.month}
                  tabIndex={0}
                  role="img"
                  aria-label={`${monthLabel(s.month)}: ${formatPrice(s.amount)} committed`}
                  className="relative z-10 flex h-full flex-1 items-end justify-center outline-none focus-visible:bg-muted/40"
                  onPointerMove={(e) =>
                    showTip(
                      {
                        x: 0,
                        y: 0,
                        title: monthLabel(s.month),
                        lines: [`${formatPrice(s.amount)} committed`],
                      },
                      e,
                    )
                  }
                  onPointerLeave={() => showTip(null)}
                  onFocus={() =>
                    setTip({
                      x: 40,
                      y: 20,
                      title: monthLabel(s.month),
                      lines: [`${formatPrice(s.amount)} committed`],
                    })
                  }
                  onBlur={() => setTip(null)}
                >
                  <div
                    className="w-full max-w-6 rounded-t-[4px]"
                    style={{
                      height: `${Math.max(1, (s.amount / monthMax) * 100)}%`,
                      background: "var(--viz-main)",
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-3 pl-14">
              {a.series.map((s) => (
                <span
                  key={s.month}
                  className="flex-1 text-center text-[11px] text-muted-foreground"
                >
                  {monthLabel(s.month)}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Funnel */}
      <section className="space-y-3">
        <h2 className={SECTION}>Investor funnel · registered in the last {periodLabel}</h2>
        <div className="divide-y border-y">
          {a.funnel.map((stage, i) => (
            <BarRow
              key={stage.key}
              label={stage.label}
              note={
                i === 0
                  ? undefined
                  : `${a.funnel[0].count ? Math.round((stage.count / a.funnel[0].count) * 100) : 0}% of registered`
              }
              value={stage.count}
              max={funnelMax}
              display={String(stage.count)}
              href="/luca/clients?tab=onboarding"
              onTip={showTip}
              tip={[`${stage.count} of ${a.funnel[0].count} investors`]}
            />
          ))}
        </div>
        {biggestDrop && biggestDrop.lost > 0 && (
          <p className="text-sm text-muted-foreground">
            Biggest drop: {biggestDrop.lost} investor{biggestDrop.lost === 1 ? "" : "s"} between “
            {biggestDrop.from.label.toLowerCase()}” and “{biggestDrop.stage.label.toLowerCase()}”.
            Each stage counts everyone who reached it, so a stage can be ahead of the one before.
          </p>
        )}
      </section>

      {/* Sources */}
      <section className="space-y-3">
        <h2 className={SECTION}>Where the committed capital comes from</h2>
        <div className="divide-y border-y">
          {a.sources.map((s) => (
            <BarRow
              key={s.label}
              label={s.label}
              note={`${s.clients} client${s.clients === 1 ? "" : "s"}`}
              value={s.committed}
              max={sourceMax}
              display={formatPrice(s.committed)}
              href={
                s.label === "Direct"
                  ? "/luca/clients"
                  : `/luca/partners/${encodeURIComponent(s.label)}`
              }
              onTip={showTip}
              tip={[
                `${formatPrice(s.committed)} committed`,
                `${a.totals.committed ? Math.round((s.committed / a.totals.committed) * 100) : 0}% of all committed`,
              ]}
            />
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Concentration: the largest investor is {Math.round(a.concentration.top1 * 100)}% of
          committed capital, the top 5 are {Math.round(a.concentration.top5 * 100)}% and the top 10
          are {Math.round(a.concentration.top10 * 100)}%, across {a.concentration.investors}{" "}
          investors with live commitments.
        </p>
      </section>

      {/* Speed */}
      <section className="space-y-3">
        <h2 className={SECTION}>
          How long each step takes · subscriptions started in the last {periodLabel}
        </h2>
        <div className="divide-y border-y">
          {a.speed.map((step) => (
            <BarRow
              key={step.label}
              label={step.label}
              note={`median of ${step.n} subscription${step.n === 1 ? "" : "s"}`}
              value={step.median ?? 0}
              max={speedMax}
              display={step.median === null ? "—" : `${step.median.toFixed(1)} days`}
              href="/luca/subscriptions"
              onTip={showTip}
              tip={[
                step.median === null
                  ? "No completed steps yet"
                  : `${step.median.toFixed(1)} days (median)`,
              ]}
            />
          ))}
        </div>
        {a.oldestOpen.length > 0 && (
          <div className="space-y-2 pt-2">
            <h3 className="text-sm font-medium">Oldest subscriptions still open</h3>
            <ul className="divide-y border-y text-sm">
              {a.oldestOpen.map(({ s, age }) => (
                <li
                  key={s.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 py-2 md:grid-cols-[12rem_minmax(0,1fr)_6rem]"
                >
                  <Link
                    to={`/luca/investors/${s.investor_id}`}
                    className="truncate font-medium hover:underline"
                  >
                    {s.investor_name}
                  </Link>
                  <span className="order-3 col-span-2 truncate text-muted-foreground md:order-none md:col-span-1">
                    {s.fund_name} · {s.status.replaceAll("_", " ")}
                  </span>
                  <span className="text-right tabular-nums">{age} days</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Fees */}
      <section className="space-y-3">
        <h2 className={SECTION}>Fees · allocated in the last {periodLabel}</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 border-y py-5 lg:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Subscription fees on allocations</p>
            <p className="mt-1 text-2xl font-semibold">{formatPrice(a.fees.earned)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Revenue share accrued to partners</p>
            <p className="mt-1 text-2xl font-semibold">{formatPrice(a.fees.owedToPartners)}</p>
            <p className="mt-1 text-xs text-muted-foreground">All time, from the partner terms</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Management fees and carried interest are not tracked in this demo, so they are not shown.
        </p>
      </section>
    </div>
  );
}
