import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Subscription, Holding, SubscriptionStatus, Fund } from "@/lib/types";
import { SECTOR_LABELS, STATUS_LABELS, CLOSED_SUBSCRIPTION_STATUSES } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { StepTracker, type StepState } from "@/components/ui/step-tracker";
import { formatPrice, formatPricePrecise, numericValue } from "@/lib/currency";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  InfoIcon,
  SparklesIcon,
  MegaphoneIcon,
  TrendingUpIcon,
  TrendingDownIcon,
} from "lucide-react";

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
  const history = Array.from({ length: 731 }, (_, index) => {
    const progress = index / 730;
    const date = new Date(today);
    date.setDate(today.getDate() - (730 - index));
    const trend = 0.16 + progress * 0.84;
    const movement =
      1 + Math.sin(progress * Math.PI * 9) * 0.025 + Math.sin(progress * Math.PI * 23) * 0.012;
    return {
      date,
      nav: Math.max(0, nav * Math.min(1, trend * movement)),
      invested: Math.max(0, invested * progress),
    };
  });
  const visible = history.filter(
    (point) => today.getTime() - point.date.getTime() <= rangeDays[range] * 86400000,
  );
  const width = 820;
  const height = 300;
  const left = 68;
  const right = 12;
  const top = 16;
  const bottom = 48;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxValue = Math.max(1, nav, invested);
  const tickStep =
    Math.pow(10, Math.floor(Math.log10(maxValue / 4))) *
    (maxValue / 4 / Math.pow(10, Math.floor(Math.log10(maxValue / 4))) > 5
      ? 10
      : maxValue / 4 / Math.pow(10, Math.floor(Math.log10(maxValue / 4))) > 2
        ? 5
        : 2);
  const axisMax = Math.ceil(maxValue / tickStep) * tickStep;
  const x = (index: number) => left + (index / Math.max(1, visible.length - 1)) * plotWidth;
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
          <p className="text-xs text-muted-foreground">
            Illustrative NAV · latest {formatPrice(nav)}
          </p>
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
          Illustrative history · no live pricing feed connected
        </span>
      </div>
    </div>
  );
}

function PortfolioHero({ heldPositions }: { heldPositions: Holding[] }) {
  const invested = heldPositions.reduce((sum, h) => sum + numericValue(h.committed_amount), 0);
  const navTotal = heldPositions.reduce((sum, h) => sum + numericValue(h.current_nav), 0);
  const gain = navTotal - invested;
  const gainPct = invested ? (gain / invested) * 100 : 0;
  const TrendIcon = gain >= 0 ? TrendingUpIcon : TrendingDownIcon;

  if (heldPositions.length === 0) return null;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col gap-8 lg:flex-row">
          {/* Left: figures */}
          <div className="flex shrink-0 flex-col gap-6 lg:w-56">
            <div>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                Estimated Portfolio Value
                <InfoIcon className="size-3" />
              </span>
              <p className="mt-1 text-3xl font-bold tabular-nums">{formatPrice(navTotal)}</p>
              <p
                className={`mt-1 flex items-center gap-1 text-sm font-medium ${gain >= 0 ? "text-green-600" : "text-red-600"}`}
              >
                <TrendIcon className="size-4" />
                {gain >= 0 ? "+" : ""}
                {formatPrice(gain)} ({gainPct >= 0 ? "+" : ""}
                {gainPct.toFixed(1)}%)
              </p>
            </div>
            <div className="flex flex-col gap-4 border-t pt-4">
              <div>
                <span className="text-xs text-muted-foreground">Total Invested Capital</span>
                <p className="mt-1 text-lg font-semibold tabular-nums">{formatPrice(invested)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Active Investments</span>
                <p className="mt-1 text-lg font-semibold tabular-nums">{heldPositions.length}</p>
              </div>
            </div>
          </div>

          {/* Right: chart */}
          <div className="min-w-0 flex-1">
            <NavTrend nav={navTotal} invested={invested} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Holdings breakdown: % of portfolio + by sector ─── */

function HoldingsBreakdown({ holdings }: { holdings: Holding[] }) {
  const held = holdings.filter((h) => h.state !== "realized");
  const total = held.reduce((s, h) => s + numericValue(h.current_nav), 0);

  const byCompany = useMemo(
    () =>
      held
        .map((h) => ({
          name: h.asset_name,
          value: numericValue(h.current_nav),
          pct: total > 0 ? (numericValue(h.current_nav) / total) * 100 : 0,
        }))
        .sort((a, b) => b.value - a.value),
    [held, total],
  );

  const bySector = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of held) {
      map.set(h.sector, (map.get(h.sector) ?? 0) + numericValue(h.current_nav));
    }
    return [...map.entries()]
      .map(([sector, value]) => ({
        sector,
        label: SECTOR_LABELS[sector] ?? sector,
        value,
        pct: total > 0 ? (value / total) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [held, total]);

  if (held.length === 0) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardContent className="pt-6">
          <p className="mb-4 text-sm font-medium">Holdings by % of portfolio</p>
          <div className="space-y-3">
            {byCompany.map((c) => (
              <div key={`${c.name}-${c.value}`} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-xs">{c.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${c.pct}%` }} />
                </div>
                <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                  {c.pct.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <p className="mb-4 text-sm font-medium">Holdings by sector</p>
          <div className="space-y-3">
            {bySector.map((s) => (
              <div key={s.sector} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-xs">{s.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${s.pct}%` }}
                  />
                </div>
                <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                  {s.pct.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Latest updates: new postings + RM recommendations + subscription progress ─── */

function LatestUpdates({ activeSubs }: { activeSubs: Subscription[] }) {
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

  const items: { key: string; icon: React.ReactNode; title: string; sub: string; to: string }[] = [
    ...newPostings.map((f) => ({
      key: `posting-${f.id}`,
      icon: <MegaphoneIcon className="size-4" />,
      title: `New opportunity: ${f.asset.name}`,
      sub: `${f.descriptor} · opened ${new Date(f.opened_at!).toLocaleDateString()}`,
      to: `/funds/${f.id}`,
    })),
    ...highlights.map((h) => ({
      key: `highlight-${h.id}`,
      icon: <SparklesIcon className="size-4" />,
      title: `Your external institution highlighted ${h.fund_name}`,
      sub: h.rationale,
      to: `/funds/${h.fund_id}`,
    })),
  ];

  if (items.length === 0) return null;

  return (
    <div>
      <p className="mb-1 text-sm font-medium">Company & investment updates</p>
      <p className="mb-3 text-xs text-muted-foreground">
        Opportunity news and recommendations related to companies on your investment shelf.
      </p>
      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.key}
            onClick={() => navigate(item.to)}
            className="flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left text-sm transition-colors hover:bg-accent"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              {item.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{item.title}</p>
              <p className="truncate text-xs text-muted-foreground">{item.sub}</p>
            </div>
          </button>
        ))}
      </div>
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
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <strong className="truncate text-sm font-bold">{holding.asset_name}</strong>
            <span className="shrink-0 text-xs text-muted-foreground">{holding.fund_codename}</span>
            <Badge variant={realized ? "default" : "secondary"} className="shrink-0 text-[10px]">
              {realized ? "Realized" : "Held"}
            </Badge>
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
                  <p
                    className={`text-sm font-medium tabular-nums ${gain >= 0 ? "text-green-600" : "text-red-600"}`}
                  >
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
                  <p
                    className={`text-sm font-medium tabular-nums ${gain >= 0 ? "text-green-600" : "text-red-600"}`}
                  >
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
      </CardContent>
    </Card>
  );
}

/* ─── Subscriptions and outcomes: 4-step flow ─── */
const SUBSCRIPTION_STEPS = [
  { key: "documents", label: "Documents signed" },
  { key: "funds", label: "Transfer of funds" },
  { key: "verification", label: "Fund verification" },
  { key: "holding", label: "Holding issued" },
];

const DOCUMENTS_DONE: SubscriptionStatus[] = [
  "institution_review",
  "under_luca_review",
  "information_requested",
  "approved",
  "awaiting_funds",
  "payment_unmatched",
  "reconciliation",
  "allocation_pending",
  "allocated",
];
const FUNDS_DONE: SubscriptionStatus[] = ["reconciliation", "allocation_pending", "allocated"];
const VERIFICATION_DONE: SubscriptionStatus[] = ["allocated"];

function stepStateFor(status: SubscriptionStatus): (stepKey: string) => StepState {
  const done: Record<string, boolean> = {
    documents: DOCUMENTS_DONE.includes(status),
    funds: FUNDS_DONE.includes(status),
    verification: VERIFICATION_DONE.includes(status),
    holding: status === "allocated",
  };
  const active: Record<string, boolean> = {
    documents: status === "reserved" || status === "documents_pending",
    funds:
      status === "institution_review" ||
      status === "under_luca_review" ||
      status === "information_requested" ||
      status === "approved" ||
      status === "awaiting_funds" ||
      status === "payment_unmatched",
    verification: status === "reconciliation" || status === "allocation_pending",
  };
  return (stepKey) => (done[stepKey] ? "done" : active[stepKey] ? "active" : "upcoming");
}

function SubscriptionCard({ subscription }: { subscription: Subscription }) {
  const queryClient = useQueryClient();
  const getState = stepStateFor(subscription.status);
  const isClosed = CLOSED_SUBSCRIPTION_STATUSES.includes(subscription.status);
  const [uploadOpen, setUploadOpen] = useState(false);

  const refundMutation = useMutation({
    mutationFn: () =>
      api<{ subscription: Subscription }>(
        `/api/v1/subscriptions/${subscription.id}/refund_request`,
        { method: "POST" },
      ),
    onSuccess: () => {
      toast.success("Refund requested. Funds will be returned within 5 business days.");
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card id={`subscription-${subscription.id}`} className="scroll-mt-24">
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <span className="font-medium">{subscription.asset_name}</span>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatPricePrecise(subscription.amount)} · {subscription.fund_name}
              {subscription.reserved_at &&
                ` · submitted ${new Date(subscription.reserved_at).toLocaleDateString()}`}
            </p>
          </div>
          <Badge variant="secondary">
            {STATUS_LABELS[subscription.status] ?? subscription.status}
          </Badge>
        </div>

        {!isClosed && <StepTracker variant="dots" steps={SUBSCRIPTION_STEPS} getState={getState} />}

        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Payment ref: {subscription.payment_reference}</span>
        </div>

        {!isClosed && (
          <p className="text-xs text-muted-foreground">
            Once fund verification is complete, this moves to Holding Issued above.
          </p>
        )}

        {subscription.status === "awaiting_funds" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => refundMutation.mutate()}
            disabled={refundMutation.isPending}
          >
            {refundMutation.isPending ? "Requesting refund..." : "Request refund"}
          </Button>
        )}

        {subscription.status === "payment_unmatched" && (
          <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
            Upload proof of payment
          </Button>
        )}

        {uploadOpen && (
          <UploadProofDialog
            subscriptionId={subscription.id}
            onClose={() => setUploadOpen(false)}
            onUploaded={() => {
              setUploadOpen(false);
              queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}

function UploadProofDialog({
  subscriptionId,
  onClose,
  onUploaded,
}: {
  subscriptionId: number;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);

  const uploadMutation = useMutation({
    mutationFn: () =>
      api(`/api/v1/subscriptions/${subscriptionId}/payment_proof`, {
        method: "POST",
        body: { filename: file?.name },
      }),
    onSuccess: () => {
      toast.success("Proof of payment uploaded. Ops will review it shortly.");
      onUploaded();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle>Upload proof of payment</DialogTitle>
        <p className="text-sm text-muted-foreground">
          Attach a bank transfer receipt or screenshot so ops can match your payment to this
          subscription.
        </p>
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:bg-transparent file:px-2 file:py-1 file:text-xs file:font-medium"
        />
        <Button
          className="w-full"
          disabled={!file || uploadMutation.isPending}
          onClick={() => uploadMutation.mutate()}
        >
          {uploadMutation.isPending ? "Uploading..." : "Upload"}
        </Button>
      </DialogContent>
    </Dialog>
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
  const activeSubscriptions = subscriptions.filter(
    (s) => !CLOSED_SUBSCRIPTION_STATUSES.includes(s.status),
  );

  if (isLoading) {
    return <p className="py-12 text-center text-muted-foreground">Loading portfolio...</p>;
  }

  if (holdings.length === 0 && subscriptions.length === 0) {
    return (
      <Card className="mt-2 border-2 border-dashed ring-0">
        <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
          <p className="text-muted-foreground">No holdings or subscriptions yet.</p>
          <Button variant="outline" onClick={() => navigate("/funds")}>
            Browse opportunities
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-8 py-2">
      <PortfolioHero heldPositions={held} />

      <HoldingsBreakdown holdings={holdings} />

      <LatestUpdates activeSubs={activeSubscriptions} />

      {/* Issued holdings */}
      {holdings.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Issued holdings
          </div>
          <div className="space-y-3">
            {holdings.map((holding) => (
              <HoldingCard key={holding.id} holding={holding} />
            ))}
          </div>
          <Card className="bg-muted/30">
            <CardContent className="text-sm text-muted-foreground">
              <strong>Need to exit a holding?</strong> Akula may attempt to facilitate a private
              transfer to another verified accredited investor. A buyer, required consents and an
              agreed price are not guaranteed.
              <div className="mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/support?topic=early-exit")}
                >
                  Request an early-exit review
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Subscriptions */}
      {subscriptions.length > 0 && (
        <div id="subscriptions-outcomes" className="scroll-mt-8 space-y-3">
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Subscriptions and outcomes
          </div>
          <div className="space-y-3">
            {subscriptions.map((subscription) => (
              <SubscriptionCard key={subscription.id} subscription={subscription} />
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/support?topic=allocation")}>
            Report an allocation or funding issue
          </Button>
        </div>
      )}
    </div>
  );
}
