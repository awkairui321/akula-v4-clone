import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Subscription, Holding, Fund } from "@/lib/types";
import { CLOSED_SUBSCRIPTION_STATUSES } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatPrice, formatPricePrecise, numericValue } from "@/lib/currency";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";

/* ─── RM highlight (an adviser's recommendation for this investor) ─── */
type RmHighlight = {
  id: number;
  fund_id: number;
  fund_name: string;
  rationale: string;
  created_at: string;
};

function NavTrend({ nav, invested }: { nav: number; invested: number }) {
  const [range, setRange] = useState("All");
  const rangeDays: Record<string, number> = { "1M": 30, "3M": 90, "6M": 180, "1Y": 365, All: 730 };
  const today = new Date();
  const { data } = useQuery({
    queryKey: ["portfolioHistory"],
    queryFn: () =>
      api<{ history: { at: string; nav: number; invested: number }[] }>(
        "/api/v1/portfolio/history",
      ),
    refetchInterval: 2000,
  });
  const history = (data?.history ?? []).map((p) => ({ ...p, date: new Date(p.at) }));
  const start = new Date(today.getTime() - rangeDays[range] * 86400000);
  const previous = history.filter((p) => p.date < start).at(-1);
  const within = history.filter((p) => p.date >= start);
  const visible =
    range === "All"
      ? history
      : [{ date: start, nav: previous?.nav ?? 0, invested: previous?.invested ?? 0 }, ...within];
  if (!visible.length) visible.push({ date: today, nav, invested });
  const width = 820;
  const height = 300;
  const left = 68;
  const right = 12;
  const top = 16;
  const bottom = 48;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxValue = Math.max(1, nav, invested, ...visible.flatMap((p) => [p.nav, p.invested]));
  const tickStep =
    Math.pow(10, Math.floor(Math.log10(maxValue / 4))) *
    (maxValue / 4 / Math.pow(10, Math.floor(Math.log10(maxValue / 4))) > 5
      ? 10
      : maxValue / 4 / Math.pow(10, Math.floor(Math.log10(maxValue / 4))) > 2
        ? 5
        : 2);
  const axisMax = Math.ceil(maxValue / tickStep) * tickStep;
  const x = (index: number) =>
    left +
    ((visible[index].date.getTime() - visible[0].date.getTime()) /
      Math.max(1, visible.at(-1)!.date.getTime() - visible[0].date.getTime())) *
      plotWidth;
  const y = (value: number) => top + plotHeight - (value / axisMax) * plotHeight;
  const navPath = visible
    .map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.nav).toFixed(1)}`)
    .join(" ");
  const capitalPath = visible
    .map(
      (point, index) =>
        `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.invested).toFixed(1)}`,
    )
    .join(" ");
  const areaPath = `${navPath} L${x(visible.length - 1).toFixed(1)},${(top + plotHeight).toFixed(1)} L${left},${(top + plotHeight).toFixed(1)} Z`;
  const dateTicks = Array.from({ length: Math.min(6, visible.length) }, (_, index) =>
    Math.round((index * (visible.length - 1)) / Math.max(1, Math.min(6, visible.length) - 1)),
  );
  const axisMoney = (value: number) =>
    value >= 1_000_000
      ? `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}m`
      : `$${Math.round(value / 1000)}k`;
  return (
    <div className="space-y-2 rounded-lg border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Portfolio Value Over Time</p>
          <p className="text-xs text-muted-foreground">Reported NAV · latest {formatPrice(nav)}</p>
        </div>
        <div className="flex gap-1" aria-label="Chart date range">
          {Object.keys(rangeDays).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={range === item}
              onClick={() => setRange(item)}
              className={`rounded px-2 py-1 text-xs ${range === item ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:bg-muted/60"}`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Portfolio value over time, ${range} date range. Simulated estimated portfolio NAV and invested capital.`}
        className="h-52 w-full sm:h-64"
        preserveAspectRatio="xMidYMid meet"
      >
        {[0, 1, 2, 3, 4].map((tick) => {
          const value = (axisMax * tick) / 4;
          const py = y(value);
          return (
            <g key={tick}>
              <line
                x1={left}
                x2={width - right}
                y1={py}
                y2={py}
                stroke="currentColor"
                className="text-border"
                strokeWidth="1"
              />
              <text
                x={left - 8}
                y={py + 4}
                textAnchor="end"
                className="fill-muted-foreground"
                fontSize="11"
              >
                {value === 0 ? "$0" : axisMoney(value)}
              </text>
            </g>
          );
        })}
        <path d={areaPath} fill="currentColor" className="text-foreground/10" />
        <path
          d={capitalPath}
          fill="none"
          stroke="currentColor"
          className="text-muted-foreground/50"
          strokeWidth="2"
          strokeDasharray="5 5"
        />
        <path
          d={navPath}
          fill="none"
          stroke="currentColor"
          className="text-foreground"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {dateTicks.map((index) => (
          <text
            key={index}
            x={x(index)}
            y={height - 18}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize="10"
          >
            {visible[index].date.toLocaleDateString("en-US", { month: "short", year: "2-digit" })}
          </text>
        ))}
      </svg>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t pt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <i className="size-2 rounded-full bg-foreground" />
          Estimated Portfolio Value
        </span>
        <span className="flex items-center gap-2">
          <i className="w-4 border-t-2 border-dashed border-muted-foreground/60" />
          Invested Capital
        </span>
        <span className="ml-auto text-[10px]">
          Recorded holding values · no live pricing feed connected
        </span>
      </div>
    </div>
  );
}

const gainTone = (gain: number) =>
  gain > 0 ? "text-green-600" : gain < 0 ? "text-red-600" : "text-muted-foreground";

function PortfolioHero({
  heldPositions,
  holdings,
  activeSubs,
}: {
  heldPositions: Holding[];
  holdings: Holding[];
  activeSubs: Subscription[];
}) {
  const invested = heldPositions.reduce((sum, h) => sum + numericValue(h.committed_amount), 0);
  const navTotal = heldPositions.reduce((sum, h) => sum + numericValue(h.current_nav), 0);
  const gain = navTotal - invested;
  const gainPct = invested ? (gain / invested) * 100 : 0;
  const sign = gain > 0 ? "+" : "";

  if (heldPositions.length === 0) return null;

  return (
    <section className="space-y-6">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Portfolio overview
      </div>

      {/* Primary figures: one row, separated by whitespace rather than boxes */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-6 lg:grid-cols-[1.6fr_1fr_1fr_1fr_1fr]">
        <div className="col-span-2 lg:col-span-1">
          <p className="text-xs text-muted-foreground">Estimated portfolio value</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">
            {formatPrice(navTotal)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Estimated gain</p>
          <p className={`mt-1 text-xl font-semibold tabular-nums ${gainTone(gain)}`}>
            {sign}
            {formatPrice(gain)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Return</p>
          <p className={`mt-1 text-xl font-semibold tabular-nums ${gainTone(gain)}`}>
            {sign}
            {gainPct.toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total invested capital</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{formatPrice(invested)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Active investments</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{heldPositions.length}</p>
        </div>
      </div>

      {/* Trend + updates sit side by side beneath the figures */}
      <div className="grid gap-6 border-t pt-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-0">
        <div className="min-w-0 lg:pr-8">
          <NavTrend nav={navTotal} invested={invested} />
        </div>
        <div className="min-w-0 border-t pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
          <LatestUpdates holdings={holdings} activeSubs={activeSubs} />
        </div>
      </div>
    </section>
  );
}

/* ─── Portfolio breakdown: allocation bar + ledger ─── */

// Restrained navy → light-blue ramp, darkest for the largest holding.
const ALLOCATION_COLORS = ["#1e3a5f", "#2f5d8f", "#5b86b5", "#8fb0d3", "#c3d5e8"];

function PortfolioBreakdown({ holdings }: { holdings: Holding[] }) {
  const held = holdings.filter((h) => h.state !== "realized");
  const total = held.reduce((s, h) => s + numericValue(h.current_nav), 0);

  const rows = useMemo(
    () =>
      held
        .map((h) => ({
          id: h.id,
          name: h.asset_name,
          value: numericValue(h.current_nav),
          pct: total > 0 ? (numericValue(h.current_nav) / total) * 100 : 0,
        }))
        .sort((a, b) => b.value - a.value),
    [held, total],
  );

  if (held.length === 0) return null;

  const colorFor = (index: number) => ALLOCATION_COLORS[index % ALLOCATION_COLORS.length];

  return (
    <section className="space-y-4">
      <div>
        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Portfolio breakdown
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Share of estimated portfolio value by holding
        </p>
      </div>

      <div
        role="img"
        aria-label={`Portfolio allocation: ${rows.map((r) => `${r.name} ${r.pct.toFixed(0)}%`).join(", ")}`}
        className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full"
      >
        {rows.map((r, i) =>
          r.pct > 0 ? (
            <div
              key={r.id}
              className="h-full"
              style={{ width: `${r.pct}%`, backgroundColor: colorFor(i) }}
            />
          ) : null,
        )}
      </div>

      <div className="text-sm">
        <div className="grid grid-cols-[minmax(0,1fr)_5rem_3rem] gap-x-4 border-b pb-2 text-xs text-muted-foreground sm:grid-cols-[minmax(0,1fr)_6rem_5.5rem]">
          <span>Holding</span>
          <span className="text-right">Current NAV</span>
          <span className="text-right">
            <span className="sm:hidden">%</span>
            <span className="hidden sm:inline">% of portfolio</span>
          </span>
        </div>
        {rows.map((r, i) => (
          <div
            key={r.id}
            className="grid grid-cols-[minmax(0,1fr)_5rem_3rem] items-center gap-x-4 border-b py-2.5 sm:grid-cols-[minmax(0,1fr)_6rem_5.5rem]"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <i
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: colorFor(i) }}
              />
              <span className="truncate">{r.name}</span>
            </span>
            <span className="text-right tabular-nums">{formatPrice(r.value)}</span>
            <span className="text-right text-muted-foreground tabular-nums">
              {r.pct.toFixed(0)}%
            </span>
          </div>
        ))}
        <div className="grid grid-cols-[minmax(0,1fr)_5rem_3rem] gap-x-4 pt-2.5 font-medium sm:grid-cols-[minmax(0,1fr)_6rem_5.5rem]">
          <span>Total</span>
          <span className="text-right tabular-nums">{formatPrice(total)}</span>
          <span className="text-right tabular-nums">100%</span>
        </div>
      </div>
    </section>
  );
}

/* ─── Company & investment updates: real items + clearly-labelled placeholders ─── */

// PLACEHOLDER: illustrative company updates so the layout can be reviewed. There is no
// company-update feed yet. Replace with real data (or delete) once one exists. Headlines
// deliberately carry no figures.
const PLACEHOLDER_UPDATES = [
  { kind: "Valuation", title: "Quarterly valuation update published", daysAgo: 2 },
  { kind: "Company", title: "Management investor update available", daysAgo: 6 },
  { kind: "Company", title: "Follow-on funding round announced", daysAgo: 11 },
  { kind: "Company", title: "Board appointment announced", daysAgo: 19 },
];

const MAX_UPDATES = 5;

type UpdateItem = {
  key: string;
  kind: string;
  company: string;
  title: string;
  date: Date;
  placeholder?: boolean;
  onSelect: () => void;
};

function relativeDate(date: Date) {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function LatestUpdates({
  holdings,
  activeSubs,
}: {
  holdings: Holding[];
  activeSubs: Subscription[];
}) {
  const navigate = useNavigate();

  const { data: fundsData } = useQuery({
    queryKey: ["funds"],
    queryFn: () => api<{ funds: Fund[] }>("/api/v1/funds"),
  });
  const { data: highlightsData } = useQuery({
    queryKey: ["rmHighlights"],
    queryFn: () => api<{ highlights: RmHighlight[] }>("/api/v1/rm_highlights"),
  });

  const subscribedFundIds = new Set(activeSubs.map((s) => s.fund_id));
  const newPostings = (fundsData?.funds ?? [])
    .filter((f) => f.state === "open" && f.opened_at && !subscribedFundIds.has(f.id))
    .filter((f) => {
      const days = (Date.now() - new Date(f.opened_at!).getTime()) / (1000 * 60 * 60 * 24);
      return days <= 30;
    })
    .slice(0, 3);

  const highlights = highlightsData?.highlights ?? [];
  const held = holdings.filter((h) => h.state !== "realized");

  const openHolding = (holdingId: number) =>
    document
      .getElementById(`holding-${holdingId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });

  const placeholders: UpdateItem[] =
    held.length === 0
      ? []
      : PLACEHOLDER_UPDATES.map((u, i) => {
          const holding = held[i % held.length];
          return {
            key: `placeholder-${i}`,
            kind: u.kind,
            company: holding.asset_name,
            title: u.title,
            date: new Date(Date.now() - u.daysAgo * 86_400_000),
            placeholder: true,
            onSelect: () => openHolding(holding.id),
          };
        });

  const items: UpdateItem[] = [
    ...newPostings.map((f) => ({
      key: `posting-${f.id}`,
      kind: "Opportunity",
      company: f.asset.name,
      title: f.descriptor || "New opportunity open for subscription",
      date: new Date(f.opened_at!),
      onSelect: () => navigate(`/funds/${f.id}`),
    })),
    ...highlights.map((h) => ({
      key: `highlight-${h.id}`,
      kind: "Institution",
      company: h.fund_name,
      title: h.rationale,
      date: new Date(h.created_at),
      onSelect: () => navigate(`/funds/${h.fund_id}`),
    })),
    ...placeholders,
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, MAX_UPDATES);

  if (items.length === 0) return null;

  return (
    <div>
      <p className="text-sm font-medium">Company & investment updates</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Recent news and recommendations on your holdings.
      </p>
      <ul className="mt-3 divide-y">
        {items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              onClick={item.onSelect}
              className="-mx-2 block w-[calc(100%+1rem)] rounded-md px-2 py-3 text-left transition-colors hover:bg-muted/60"
            >
              <span className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                <span className="truncate">
                  {item.kind} · {item.company}
                </span>
                <span className="shrink-0 tabular-nums">{relativeDate(item.date)}</span>
              </span>
              <span className="mt-1 line-clamp-2 block text-sm font-medium">{item.title}</span>
            </button>
          </li>
        ))}
      </ul>
      {items.some((i) => i.placeholder) && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          Illustrative company updates · no live feed connected
        </p>
      )}
    </div>
  );
}

/* ─── Issued holdings: smaller cards, NAV + gain only, details in a dropdown ─── */

function HoldingCard({ holding }: { holding: Holding }) {
  const [expanded, setExpanded] = useState(false);
  const realized = holding.state === "realized";
  const committed = numericValue(holding.committed_amount);
  const nav = numericValue(holding.current_nav);
  const gain =
    (realized && holding.final_proceeds ? numericValue(holding.final_proceeds) : nav) - committed;
  const gainPct = committed > 0 ? (gain / committed) * 100 : 0;

  const subscribed = holding.subscribed_at
    ? new Date(holding.subscribed_at).toLocaleDateString()
    : null;
  const yearsHeld = holding.subscribed_at
    ? (
        (Date.now() - new Date(holding.subscribed_at).getTime()) /
        (365.25 * 24 * 60 * 60 * 1000)
      ).toFixed(1)
    : null;

  return (
    <div id={`holding-${holding.id}`} className="scroll-mt-24 py-4">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 basis-full items-center gap-2 sm:flex-1 sm:basis-0">
            <strong className="truncate text-sm font-semibold">{holding.asset_name}</strong>
            <span className="shrink-0 text-xs text-muted-foreground">{holding.fund_codename}</span>
          </div>

          <div className="flex shrink-0 gap-8">
            {realized ? (
              <>
                <div className="text-right">
                  <p className="text-[11px] text-muted-foreground">Final proceeds</p>
                  <p className="text-sm font-medium tabular-nums">
                    {holding.final_proceeds ? formatPricePrecise(holding.final_proceeds) : "—"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-muted-foreground">Profit</p>
                  <p className={`text-sm font-medium tabular-nums ${gainTone(gain)}`}>
                    {gain >= 0 ? "+" : ""}
                    {formatPrice(gain)}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="text-right">
                  <p className="text-[11px] text-muted-foreground">Current NAV</p>
                  <p className="text-sm font-medium tabular-nums">{formatPricePrecise(nav)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-muted-foreground">Unrealized gain</p>
                  <p className={`text-sm font-medium tabular-nums ${gainTone(gain)}`}>
                    {gain >= 0 ? "+" : ""}
                    {formatPrice(gain)} ({gainPct >= 0 ? "+" : ""}
                    {gainPct.toFixed(1)}%)
                  </p>
                </div>
              </>
            )}
          </div>

          <button
            className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <ChevronUpIcon className="size-3.5" />
            ) : (
              <ChevronDownIcon className="size-3.5" />
            )}
            {expanded ? "Hide" : "Details"}
          </button>
        </div>

        {expanded && (
          <div className="space-y-2 rounded-lg bg-muted/50 p-3 text-xs">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-muted-foreground">Committed</p>
                <p className="font-medium">{formatPricePrecise(committed)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Holding period</p>
                <p className="font-medium">{yearsHeld ? `${yearsHeld} yrs` : "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Entry price / share</p>
                <p className="font-medium">
                  ${numericValue(holding.entry_price_per_share).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Units</p>
                <p className="font-medium">{holding.units}</p>
              </div>
              {subscribed && (
                <div>
                  <p className="text-muted-foreground">Subscribed</p>
                  <p className="font-medium">{subscribed}</p>
                </div>
              )}
              {holding.nav_as_of && (
                <div>
                  <p className="text-muted-foreground">NAV as of</p>
                  <p className="font-medium">{new Date(holding.nav_as_of).toLocaleDateString()}</p>
                </div>
              )}
              {realized && (
                <>
                  <div>
                    <p className="text-muted-foreground">MOIC</p>
                    <p className="font-medium">{holding.moic ? `${holding.moic}x` : "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Exit</p>
                    <p className="font-medium">
                      {holding.exit_date
                        ? `${new Date(holding.exit_date).toLocaleDateString()} · ${holding.exit_type ?? ""}`
                        : "—"}
                    </p>
                  </div>
                </>
              )}
            </div>
            <p className="text-muted-foreground">
              Company valuations are context only and are not used by Akula to calculate
              performance. The holding value above is the administrator-reported record.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function Subscriptions() {
  const navigate = useNavigate();

  const { data: holdingsData, isLoading: holdingsLoading } = useQuery({
    queryKey: ["holdings"],
    queryFn: () => api<{ holdings: Holding[] }>("/api/v1/holdings"),
  });

  const { data: subsData, isLoading: subsLoading } = useQuery({
    queryKey: ["subscriptions"],
    queryFn: () => api<{ subscriptions: Subscription[] }>("/api/v1/subscriptions"),
  });

  const holdings = holdingsData?.holdings ?? [];
  const subscriptions = subsData?.subscriptions ?? [];
  const isLoading = holdingsLoading || subsLoading;

  const held = holdings.filter((h) => h.state !== "realized");
  const realizedHoldings = holdings.filter((h) => h.state === "realized");
  const activeSubscriptions = subscriptions.filter(
    (s) => !CLOSED_SUBSCRIPTION_STATUSES.includes(s.status),
  );

  if (isLoading) {
    return <p className="py-12 text-center text-muted-foreground">Loading portfolio...</p>;
  }

  if (holdings.length === 0) {
    return (
      <Card className="mt-2 border-2 border-dashed ring-0">
        <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
          <p className="text-muted-foreground">
            {subscriptions.length > 0
              ? "No holdings issued yet. Your subscriptions are tracked under Subscription Activity."
              : "No holdings or subscriptions yet."}
          </p>
          {subscriptions.length > 0 ? (
            <Button variant="outline" onClick={() => navigate("/portfolio?section=activity")}>
              View subscription activity
            </Button>
          ) : (
            <Button variant="outline" onClick={() => navigate("/funds")}>
              Browse opportunities
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-8 py-2">
      <PortfolioHero heldPositions={held} holdings={holdings} activeSubs={activeSubscriptions} />

      {/* Issued holdings: held positions first, realized grouped beneath */}
      {holdings.length > 0 && (
        <section className="space-y-3">
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Issued holdings
          </div>
          <div className="divide-y border-y">
            {held.map((holding) => (
              <HoldingCard key={holding.id} holding={holding} />
            ))}
          </div>
          {realizedHoldings.length > 0 && (
            <>
              <div className="pt-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Realized
              </div>
              <div className="divide-y border-y">
                {realizedHoldings.map((holding) => (
                  <HoldingCard key={holding.id} holding={holding} />
                ))}
              </div>
            </>
          )}
        </section>
      )}

      <PortfolioBreakdown holdings={holdings} />

      {holdings.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-6 text-sm text-muted-foreground">
          <p className="max-w-3xl">
            <strong className="text-foreground">Need to exit a holding?</strong> Akula may attempt
            to facilitate a private transfer to another verified accredited investor. A buyer,
            required consents and an agreed price are not guaranteed.
          </p>
          <Button variant="outline" size="sm" onClick={() => navigate("/support?topic=early-exit")}>
            Request an early-exit review
          </Button>
        </div>
      )}
    </div>
  );
}
