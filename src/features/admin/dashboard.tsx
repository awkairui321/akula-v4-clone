import { clientStage } from "./client-stage";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import type { Fund } from "@/lib/types";
import { LUCA_PIPELINE_STAGES } from "@/lib/types";
import { formatPrice, formatPriceCompact } from "@/lib/currency";
import type {
  ActivityResponse,
  AdminSubscription,
  DocumentsResponse,
  InvestorsResponse,
  SubscriptionsResponse,
} from "./types";
import { DEAL_MATERIAL_KINDS } from "@/lib/document-catalogue";
import { allocationOf, daysUntil, formatClose } from "./vehicles/deal-status";
import { usePublication } from "./vehicles/use-publication";

/** Statuses that count as "funded" — money is confirmed on its way to escrow
 * or already there. Distinct from AUM, which is broader (see below). */
const FUNDED_STATUSES = ["reconciliation", "allocation_pending", "allocated"];
/** AUM: committed capital that's either moving toward funding or already an
 * active holding — the LUCA dashboard's "funded or in active holding" definition. */
const AUM_STATUSES = [...FUNDED_STATUSES, "awaiting_funds", "payment_unmatched"];
/** An item waiting longer than this is flagged as overdue. */
const OVERDUE_DAYS = 5;
const QUEUE_PREVIEW = 6;
// Restrained navy → light-blue ramp for the pipeline, earliest stage lightest.
const STAGE_COLORS = ["#c3d5e8", "#8fb0d3", "#5b86b5", "#2f5d8f", "#1e3a5f"];

const SECTION_LABEL = "text-xs font-medium tracking-wide text-muted-foreground uppercase";
const DAY = 24 * 60 * 60 * 1000;

function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY));
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type AttentionItem = {
  key: string;
  title: string;
  detail: string;
  /** What LUCA has to do. */
  needs: string;
  ageDays: number;
  /** Lower sorts first: capital decisions, then follow-ups, then reviews. */
  priority: number;
  amount?: number;
  to: string;
};

const axisMoney = (value: number) =>
  value >= 1_000_000
    ? `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`
    : `$${Math.round(value / 1000)}K`;

/* ─── Capital subscribed over time, built from real subscription dates ─── */

function CommitmentsChart({ subs }: { subs: AdminSubscription[] }) {
  const [range, setRange] = useState<"3M" | "6M">("6M");
  const days = range === "3M" ? 91 : 182;

  const points = useMemo(() => {
    const live = subs.filter(
      (s) => !["rejected", "cancelled", "funds_returned"].includes(s.status),
    );
    const weeks = Math.ceil(days / 7);
    const start = Date.now() - days * DAY;
    return Array.from({ length: weeks + 1 }, (_, i) => {
      const at = start + i * 7 * DAY;
      const sum = (rows: AdminSubscription[], field: "reserved_at" | "funds_received_at") =>
        rows.reduce((n, s) => {
          const t = s[field] ? new Date(s[field]!).getTime() : null;
          return t !== null && t <= at ? n + parseFloat(s.amount) : n;
        }, 0);
      return { at, committed: sum(live, "reserved_at"), funded: sum(live, "funds_received_at") };
    });
  }, [subs, days]);

  const width = 720;
  const height = 240;
  const left = 56;
  const right = 12;
  const top = 12;
  const bottom = 28;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const max = Math.max(1, ...points.map((p) => p.committed));
  const step = 10 ** Math.floor(Math.log10(max / 3));
  const axisMax = Math.ceil(max / step / 2) * step * 2;
  const x = (i: number) => left + (i / Math.max(1, points.length - 1)) * plotW;
  const y = (v: number) => top + plotH - (v / axisMax) * plotH;
  const path = (key: "committed" | "funded") =>
    points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
  const area = `${path("committed")} L${x(points.length - 1)},${top + plotH} L${left},${top + plotH} Z`;
  const monthTicks = points
    .map((p, i) => ({ i, label: new Date(p.at).toLocaleDateString("en-GB", { month: "short" }) }))
    .filter((t, idx, arr) => idx === 0 || t.label !== arr[idx - 1].label);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Capital subscribed over time</p>
          <p className="text-xs text-muted-foreground">
            Cumulative, from subscription dates (excludes rejected and cancelled)
          </p>
        </div>
        <div className="flex gap-1" aria-label="Chart date range">
          {(["3M", "6M"] as const).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              onClick={() => setRange(r)}
              className={`rounded px-2 py-1 text-xs ${
                range === r
                  ? "bg-muted font-semibold text-foreground"
                  : "text-muted-foreground hover:bg-muted/60"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Cumulative subscribed and funded capital over the last ${range}`}
        className="mt-2 h-56 w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {[0, 1, 2, 3].map((tick) => {
          const value = (axisMax * tick) / 3;
          return (
            <g key={tick}>
              <line
                x1={left}
                x2={width - right}
                y1={y(value)}
                y2={y(value)}
                stroke="currentColor"
                className="text-border"
              />
              <text
                x={left - 8}
                y={y(value) + 4}
                textAnchor="end"
                className="fill-muted-foreground"
                fontSize="11"
              >
                {value === 0 ? "$0" : axisMoney(value)}
              </text>
            </g>
          );
        })}
        <path d={area} fill="#2f5d8f" opacity="0.1" />
        <path
          d={path("committed")}
          fill="none"
          stroke="#2f5d8f"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d={path("funded")}
          fill="none"
          stroke="#1e3a5f"
          strokeWidth="2"
          strokeDasharray="5 4"
          strokeLinejoin="round"
        />
        {monthTicks.map((t) => (
          <text
            key={t.i}
            x={x(t.i)}
            y={height - 8}
            textAnchor={t.i === 0 ? "start" : "middle"}
            className="fill-muted-foreground"
            fontSize="11"
          >
            {t.label}
          </text>
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <i className="h-0.5 w-4 rounded bg-[#2f5d8f]" />
          Subscribed
        </span>
        <span className="flex items-center gap-2">
          <i className="w-4 border-t-2 border-dashed border-[#1e3a5f]" />
          Funded
        </span>
      </div>
    </div>
  );
}

/* ─── Small progress ring for a deal's raise ─── */

function Ring({ pct }: { pct: number | null }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const value = pct ?? 0;
  return (
    <svg viewBox="0 0 40 40" className="size-10 shrink-0 -rotate-90" aria-hidden>
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke="currentColor"
        className="text-muted"
        strokeWidth="4"
      />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke="#2f5d8f"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${(value / 100) * c} ${c}`}
      />
    </svg>
  );
}

export default function AdminDashboard() {
  const [showAllQueue, setShowAllQueue] = useState(false);
  const publication = usePublication();

  const { data: fundsData, isLoading: fundsLoading } = useQuery({
    queryKey: ["admin", "funds"],
    queryFn: () => api<{ funds: Fund[] }>("/api/v1/funds"),
  });

  // Unfiltered — used to compute AUM, the pipeline and the attention queue.
  const { data: allSubsData, isLoading: allSubsLoading } = useQuery({
    queryKey: ["admin", "subscriptions", "all"],
    queryFn: () => api<SubscriptionsResponse>("/api/v1/admin/subscriptions"),
  });

  const { data: investorsData, isLoading: investorsLoading } = useQuery({
    queryKey: ["admin", "investors", "summary"],
    queryFn: () => api<InvestorsResponse>("/api/v1/admin/investors?needs_review=true"),
  });

  const { data: documentsData, isLoading: documentsLoading } = useQuery({
    queryKey: ["admin", "documents", "summary"],
    queryFn: () => api<DocumentsResponse>("/api/v1/admin/documents?review_state=received"),
  });

  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ["admin", "activity"],
    queryFn: () => api<ActivityResponse>("/api/v1/admin/activity"),
  });

  const isLoading =
    fundsLoading || allSubsLoading || investorsLoading || documentsLoading || activityLoading;

  if (isLoading) {
    return <p className="py-12 text-center text-muted-foreground">Loading...</p>;
  }

  const funds = (fundsData?.funds ?? []).filter((f) => f.state !== "draft");
  const liveDeals = funds.filter((f) => f.state === "open" || f.state === "closing").length;

  const allSubs = allSubsData?.subscriptions ?? [];
  const summary = allSubsData?.summary;
  const sumOf = (subs: AdminSubscription[]) => subs.reduce((n, s) => n + parseFloat(s.amount), 0);
  const aum = sumOf(allSubs.filter((s) => AUM_STATUSES.includes(s.status)));
  const funded = sumOf(allSubs.filter((s) => FUNDED_STATUSES.includes(s.status)));

  const investors = investorsData?.summary;
  const events = activityData?.events ?? [];

  /* ─── What is waiting on the fund manager ─── */
  const attention: AttentionItem[] = [
    // Offerings the Investment Team has submitted for approval.
    ...publication.waiting.map((v) => ({
      key: `publish-${v.id}`,
      title: v.snapshot.codename,
      detail: `${v.snapshot.asset.name} · version ${v.number} from the Investment Team`,
      needs: "Review and approve offering",
      // Outward-facing, so it ranks above the capital queue.
      priority: -1,
      ageDays: daysSince(v.at),
      to: `/luca/deals/${v.fundId}`,
    })),
    ...allSubs
      .filter((s) => s.status === "payment_unmatched")
      .map((s) => ({
        key: `payment-${s.id}`,
        title: s.investor_name,
        detail: `${s.asset_name} · ${s.payment_claimed ? "Investor says paid" : "No transfer matched"}`,
        needs: "Awaiting Akula Ops payment matching",
        priority: 0,
        ageDays: daysSince(s.payment_declared_at ?? s.approved_at ?? s.created_at),
        amount: parseFloat(s.amount),
        to: "/luca/subscriptions?status=payment_unmatched",
      })),
    ...allSubs
      .filter((s) => s.status === "allocation_pending")
      .map((s) => ({
        key: `allocate-${s.id}`,
        title: s.investor_name,
        detail: `${s.asset_name} · ${s.eam_firm ?? "Direct"}`,
        needs: "Confirm allocation",
        priority: 0,
        ageDays: daysSince(s.reconciled_at ?? s.funds_received_at ?? s.created_at),
        amount: parseFloat(s.amount),
        to: "/luca/subscriptions?status=allocation_pending",
      })),
    ...(investorsData?.investors ?? [])
      .filter((i) => clientStage(i).waitingOn === "luca")
      .map((i) => ({
        key: `investor-${i.id}`,
        title: i.full_name,
        detail: `${i.investor_type === "institutional" ? "Entity" : "Individual"} · ${i.referral?.partner_firm ?? "Direct"}`,
        needs: "Verify identity and accreditation",
        priority: 1,
        ageDays: daysSince(i.created_at),
        to: `/luca/clients/${i.id}/review`,
      })),
    ...(documentsData?.documents ?? [])
      .filter((d) => !DEAL_MATERIAL_KINDS.includes(d.kind))
      .map((d) => ({
        key: `document-${d.id}`,
        title: d.name,
        detail: `${d.owner_name}${d.fund_name ? ` · ${d.fund_name}` : ""}`,
        needs: "Review document",
        priority: 2,
        ageDays: daysSince(d.created_at),
        to: "/luca/compliance?tab=review",
      })),
  ].sort((a, b) => a.priority - b.priority || b.ageDays - a.ageDays);
  const visibleAttention = showAllQueue ? attention : attention.slice(0, QUEUE_PREVIEW);
  const overdue = attention.filter((a) => a.ageDays > OVERDUE_DAYS).length;

  /* ─── Deals closing soonest ─── */
  const closingSoon = funds
    .filter((f) => ["open", "closing"].includes(f.state) && (daysUntil(f.closes_at) ?? 0) > 0)
    .sort((a, b) => (daysUntil(a.closes_at) ?? 0) - (daysUntil(b.closes_at) ?? 0))
    .slice(0, 4);

  /* ─── Pipeline by stage ─── */
  const stages = LUCA_PIPELINE_STAGES.map((stage, i) => {
    const subs = allSubs.filter((s) => stage.statuses.includes(s.status));
    return { ...stage, count: subs.length, amount: sumOf(subs), color: STAGE_COLORS[i] };
  });
  const pipelineTotal = stages.reduce((n, s) => n + s.amount, 0);

  const expiring = investors
    ? [
        { days: 30, count: investors.accreditation_expiring_30 },
        { days: 60, count: investors.accreditation_expiring_60 },
        { days: 90, count: investors.accreditation_expiring_90 },
      ]
    : [];

  return (
    <div className="w-full space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
            LUCA · Fund manager
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Overview</h1>
          <p className="mt-1 text-muted-foreground">
            {attention.length === 0
              ? "Nothing is waiting on you."
              : `${attention.length} item${attention.length === 1 ? "" : "s"} waiting on you${
                  overdue ? `, ${overdue} overdue` : ""
                }.`}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {new Date().toLocaleDateString("en-GB", { dateStyle: "full" })}
        </p>
      </div>

      {/* Capital: the headline figure, the supporting numbers and the trend */}
      <section className="grid gap-8 rounded-xl border bg-card p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:p-8">
        <div className="flex flex-col">
          <p className="text-xs text-muted-foreground">Active commitments</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">
            {formatPrice(aum)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatPrice(funded)} funded · {liveDeals} live deal{liveDeals === 1 ? "" : "s"}
          </p>
          <dl className="mt-6 divide-y border-y text-sm">
            {[
              ["Funded", formatPrice(funded), "/luca/subscriptions?stage=verification"],
              [
                "Awaiting allocation",
                formatPrice(summary?.awaiting_allocation_value ?? 0),
                "/luca/subscriptions?status=allocation_pending",
              ],
              [
                "Unmatched payments",
                formatPrice(summary?.unmatched_value ?? 0),
                "/luca/subscriptions?status=payment_unmatched",
              ],
            ].map(([label, value, to]) => (
              <Link
                key={label}
                to={to}
                className="flex items-center justify-between py-2.5 transition-colors hover:bg-muted/50"
              >
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium tabular-nums">{value}</dd>
              </Link>
            ))}
          </dl>
        </div>
        <CommitmentsChart subs={allSubs} />
      </section>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        {/* The work queue */}
        <section>
          <div className="flex items-baseline justify-between gap-4">
            <div className={SECTION_LABEL}>Needs your attention ({attention.length})</div>
            <p className="text-xs text-muted-foreground">
              Offerings and capital decisions first, then oldest
            </p>
          </div>
          {attention.length === 0 ? (
            <p className="mt-3 border-y py-6 text-sm text-muted-foreground">
              You’re all caught up. Nothing is waiting on LUCA.
            </p>
          ) : (
            <>
              <ul className="mt-2 divide-y border-y">
                {visibleAttention.map((item) => (
                  <li key={item.key}>
                    <Link
                      to={item.to}
                      className="flex items-center gap-4 py-3 transition-colors hover:bg-muted/50"
                    >
                      <span
                        aria-hidden
                        className={`size-2 shrink-0 rounded-full ${
                          item.priority === 0
                            ? "bg-[#1e3a5f]"
                            : item.priority === 1
                              ? "bg-[#6f98c4]"
                              : "bg-[#c3d5e8]"
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {item.needs} · {item.detail}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        {item.amount !== undefined && (
                          <span className="block text-sm tabular-nums">
                            {formatPrice(item.amount)}
                          </span>
                        )}
                        <span
                          className={`block text-xs tabular-nums ${
                            item.ageDays > OVERDUE_DAYS
                              ? "font-medium text-amber-700"
                              : "text-muted-foreground"
                          }`}
                        >
                          {item.ageDays}d waiting
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {attention.length > QUEUE_PREVIEW && (
                <button
                  type="button"
                  onClick={() => setShowAllQueue((v) => !v)}
                  className="mt-3 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  {showAllQueue ? "Show fewer" : `Show all ${attention.length} items`}
                </button>
              )}
            </>
          )}
        </section>

        {/* Deals closing soonest + compliance */}
        <div className="space-y-10">
          <section>
            <div className="flex items-baseline justify-between gap-4">
              <div className={SECTION_LABEL}>Closing soon</div>
              <Link
                to="/luca/deals"
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                All deals
              </Link>
            </div>
            {closingSoon.length === 0 ? (
              <p className="mt-2 border-y py-6 text-sm text-muted-foreground">
                No deals have an upcoming close date.
              </p>
            ) : (
              <ul className="mt-2 divide-y border-y">
                {closingSoon.map((fund) => {
                  const { allocated, total, pct } = allocationOf(fund);
                  const days = daysUntil(fund.closes_at);
                  return (
                    <li key={fund.id}>
                      <Link
                        to={`/luca/deals/${fund.id}`}
                        className="flex items-center gap-3 py-3 transition-colors hover:bg-muted/50"
                      >
                        <Ring pct={pct} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{fund.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {fund.codename}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground tabular-nums">
                            {formatPriceCompact(allocated)}
                            {total !== null ? ` of ${formatPriceCompact(total)}` : ""}
                            {pct !== null ? ` · ${pct}%` : ""}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-xs tabular-nums ${
                            days !== null && days <= 7
                              ? "bg-red-50 font-medium text-red-700"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {formatClose(days)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <div className={SECTION_LABEL}>Accreditation expiring</div>
            <div className="mt-2 grid grid-cols-3 divide-x border-y">
              {expiring.map((band) => (
                <Link
                  key={band.days}
                  to="/luca/compliance?tab=expiring"
                  className="px-3 py-3 transition-colors first:pl-0 hover:bg-muted/50"
                >
                  <p className="text-xl font-semibold tabular-nums">{band.count}</p>
                  <p className="text-xs text-muted-foreground">in {band.days} days</p>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        {/* Pipeline: one bar, then the detail */}
        <section>
          <div className="flex items-baseline justify-between gap-4">
            <div className={SECTION_LABEL}>Subscription pipeline</div>
            <Link
              to="/luca/subscriptions"
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              View subscriptions
            </Link>
          </div>
          <p className="mt-3 text-2xl font-semibold tabular-nums">
            {formatPrice(pipelineTotal)}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              across {allSubs.length} subscriptions
            </span>
          </p>
          <div
            role="img"
            aria-label={`Pipeline by stage: ${stages.map((s) => `${s.label} ${formatPrice(s.amount)}`).join(", ")}`}
            className="mt-3 flex h-3 w-full gap-0.5 overflow-hidden rounded-full"
          >
            {stages.map((stage) =>
              stage.amount > 0 ? (
                <div
                  key={stage.key}
                  title={`${stage.label}: ${formatPrice(stage.amount)}`}
                  style={{
                    width: `${(stage.amount / Math.max(1, pipelineTotal)) * 100}%`,
                    backgroundColor: stage.color,
                  }}
                />
              ) : null,
            )}
          </div>
          <ul className="mt-4 grid gap-x-8 sm:grid-cols-2">
            {stages.map((stage) => (
              <li
                key={stage.key}
                className="border-b last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0"
              >
                <Link
                  to={`/luca/subscriptions?stage=${stage.key}`}
                  className="flex items-center gap-3 py-2.5 text-sm transition-colors hover:bg-muted/50"
                >
                  <i
                    className="size-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: stage.color }}
                  />
                  <span className="min-w-0 flex-1 truncate">{stage.label}</span>
                  <span className="w-6 text-right tabular-nums">{stage.count}</span>
                  <span className="w-20 text-right text-muted-foreground tabular-nums">
                    {stage.count ? formatPrice(stage.amount) : "—"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <div className={SECTION_LABEL}>Recent activity</div>
          {events.length === 0 ? (
            <p className="mt-2 border-y py-4 text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="mt-2 divide-y border-y">
              {events.slice(0, 7).map((event) => (
                <li key={event.id} className="py-2.5">
                  <p className="text-sm">{event.message}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                    {formatDate(event.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
