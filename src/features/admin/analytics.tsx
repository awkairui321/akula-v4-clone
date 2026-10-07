import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatPrice, formatPriceCompact } from "@/lib/currency";
import { useAuth } from "@/contexts/auth-context";
import type { Fund } from "@/lib/types";
import type { WorkflowView } from "@/lib/workflow-types";
import type { PartnersResponse, SubscriptionsResponse } from "./types";
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
  const [tip, setTip] = useState<Tip>(null);
  const rootRef = useRef<HTMLDivElement>(null);

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

  const ready = subs.data && funds.data && workflow.data && partners.data;
  const a = useMemo(
    () =>
      ready
        ? buildAnalytics(
            {
              subscriptions: subs.data!.subscriptions,
              funds: funds.data!.funds,
              workflow: workflow.data!,
              partners: partners.data!.partners,
            },
            period,
          )
        : null,
    [ready, subs.data, funds.data, workflow.data, partners.data, period],
  );

  const showTip = (next: Tip, e?: React.PointerEvent) => {
    if (!next || !e || !rootRef.current) return setTip(null);
    const box = rootRef.current.getBoundingClientRect();
    setTip({ ...next, x: e.clientX - box.left + 12, y: e.clientY - box.top + 12 });
  };

  if (!a) return <p className="py-12 text-center text-muted-foreground">Loading analytics...</p>;

  const sourceMax = Math.max(1, ...a.sources.map((s) => s.committed));
  const speedMax = Math.max(1, ...a.speed.map((s) => s.median ?? 0));
  const periodLabel = PERIODS.find((p) => p.key === period)!.label.toLowerCase();
  // "in the last 90 days", or simply "all time" when there is no window.
  const within = period === "all" ? "all time" : `the last ${periodLabel}`;

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
          Applies to speed and fees. Capital and sources are the position today.
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
              `${a.endToEnd.n} subscription${a.endToEnd.n === 1 ? "" : "s"}, ${within}`,
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
        <h2 className={SECTION}>How long each step takes · subscriptions started {within}</h2>
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
      </section>

      {/* Fees */}
      <section className="space-y-4">
        <div>
          <h2 className={SECTION}>Fees: what we charge and what we receive</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Subscription fees and the partners&apos; share are for allocations made {within}.
            Management fee and carry are the position today.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 border-y py-5 lg:grid-cols-4">
          {(
            [
              [
                "Subscription fees charged",
                formatPrice(a.fees.subscriptionFees),
                "On allocations in the period",
              ],
              [
                "Shared with partners",
                formatPrice(a.fees.revenueShare),
                "Partner share of those fees",
              ],
              ["Subscription income to LUCA", formatPrice(a.fees.net), "After the partners' share"],
              [
                "Management fee per year",
                formatPrice(a.fees.managementRunRate),
                "Estimate on capital held today",
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

        <div className="divide-y border-y">
          <div className="grid grid-cols-[minmax(0,1.4fr)_9rem_repeat(5,minmax(6rem,1fr))] gap-x-3 py-2 text-xs text-muted-foreground max-xl:hidden">
            <span>Fund</span>
            <span>Fee schedule</span>
            <span className="text-right">Allocated</span>
            <span className="text-right">Subscription fees</span>
            <span className="text-right">Partner share</span>
            <span className="text-right">Mgmt fee / year</span>
            <span className="text-right">Carry (unrealised)</span>
          </div>
          {a.fees.rows.length === 0 && (
            <p className="py-6 text-sm text-muted-foreground">No capital has been allocated yet.</p>
          )}
          {a.fees.rows.map((row) => (
            <Link
              key={row.fundId}
              to={`/luca/deals/${row.fundId}`}
              className="grid grid-cols-[minmax(0,1.4fr)_9rem_repeat(5,minmax(6rem,1fr))] items-center gap-x-3 gap-y-1 py-2.5 text-sm hover:bg-muted/40 max-xl:grid-cols-2"
            >
              <span className="min-w-0 truncate font-medium">{row.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {row.schedule.subscription}% · {row.schedule.management}% · {row.schedule.carry}%
              </span>
              <span className="text-right tabular-nums">{formatPrice(row.allocated)}</span>
              <span className="text-right tabular-nums">{formatPrice(row.subscriptionFees)}</span>
              <span className="text-right text-muted-foreground tabular-nums">
                {formatPrice(row.revenueShare)}
              </span>
              <span className="text-right tabular-nums">{formatPrice(row.managementRunRate)}</span>
              <span className="text-right text-muted-foreground tabular-nums">
                {formatPrice(row.unrealisedCarry)}
              </span>
            </Link>
          ))}
        </div>

        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>
            Fee schedule is subscription · management · carried interest, set once per fund in its
            overview editor.
          </li>
          <li>
            Subscription fee: the rate is frozen on each application (the fund&apos;s rate, plus one
            point for independent investors). At allocation the fee is the allocated amount times
            that rate.
          </li>
          <li>
            Partner share: each partner&apos;s revenue-share percentage applied to the subscription
            fees on its clients&apos; allocations.
          </li>
          <li>
            Management fee is estimated as the yearly percentage on allocated capital, and carry as
            the carry percentage on unrealised gains. Neither is billed or received yet; carry is
            received only on exit.
          </li>
        </ul>
      </section>
    </div>
  );
}
