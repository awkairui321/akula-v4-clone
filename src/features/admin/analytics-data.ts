import type { Fund } from "@/lib/types";
import type { WorkflowView } from "@/lib/workflow-types";
import type { AdminInvestor, AdminPartner, AdminSubscription } from "./types";

export type Period = "30d" | "90d" | "12m" | "all";
export const PERIODS: { key: Period; label: string }[] = [
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "12m", label: "12 months" },
  { key: "all", label: "All time" },
];
const DAY = 24 * 60 * 60 * 1000;
const PERIOD_DAYS: Record<Period, number | null> = { "30d": 30, "90d": 90, "12m": 365, all: null };

const INACTIVE = ["cancelled", "rejected", "not_allocated", "funds_returned"];

export type AnalyticsInput = {
  investors: AdminInvestor[];
  subscriptions: AdminSubscription[];
  funds: Fund[];
  workflow: Pick<WorkflowView, "receipts" | "allocations">;
  partners: AdminPartner[];
};

export type CapitalRow = {
  key: string;
  label: string;
  /** Present when the row opens a project page. */
  assetId?: number;
  company?: string;
  target: number | null;
  committed: number;
  funded: number;
  allocated: number;
  funds: number;
};

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const days = (from: string | null, to: string | null) =>
  from && to ? (new Date(to).getTime() - new Date(from).getTime()) / DAY : null;

/** Every figure on the Analytics page, calculated from the records the Fund Manager can see. */
export function buildAnalytics(input: AnalyticsInput, period: Period, now = Date.now()) {
  const span = PERIOD_DAYS[period];
  const since = span === null ? 0 : now - span * DAY;
  const inPeriod = (iso: string | null) => !!iso && new Date(iso).getTime() >= since;

  /* ── Capital by project and fund (current state) ── */
  const active = input.subscriptions.filter((s) => !INACTIVE.includes(s.status));
  const received = (id: number) =>
    input.workflow.receipts
      .filter((r) => r.subscriptionId === id && r.matched && !r.supersededBy)
      .reduce((n, r) => n + r.amount, 0);
  const allocatedOf = (id: number) =>
    input.workflow.allocations
      .filter((a) => a.subscriptionId === id && !a.voided)
      .reduce((n, a) => n + a.principal, 0);
  const capitalOf = (subs: AdminSubscription[]) => ({
    committed: subs.reduce((n, s) => n + Number(s.amount), 0),
    // Cash covers the subscription fee too; funded is what has arrived for the investment itself.
    funded: subs.reduce(
      (n, s) =>
        n + Math.min(Number(s.amount), Math.max(0, received(s.id) - Number(s.subscription_fee))),
      0,
    ),
    allocated: subs.reduce((n, s) => n + allocatedOf(s.id), 0),
  });

  const projects = new Map<number, Fund[]>();
  for (const fund of input.funds)
    projects.set(fund.asset.id, [...(projects.get(fund.asset.id) ?? []), fund]);
  const capital: CapitalRow[] = [...projects.entries()]
    .map(([assetId, funds]) => {
      const ids = new Set(funds.map((f) => f.id));
      const targets = funds.map((f) => (f.supply_total ? parseFloat(f.supply_total) : null));
      return {
        key: `p${assetId}`,
        label: funds[0].codename,
        company: funds[0].asset.name,
        assetId,
        target: targets.every((t) => t !== null) ? targets.reduce((n, t) => n + (t ?? 0), 0) : null,
        funds: funds.length,
        ...capitalOf(active.filter((s) => ids.has(s.fund_id))),
      };
    })
    .filter((row) => row.committed > 0 || row.target)
    .sort((a, b) => b.committed - a.committed);
  const totals = capitalOf(active);
  const target = capital.reduce((n, r) => n + (r.target ?? 0), 0);

  /* ── New commitments by month ── */
  const months = new Map<string, number>();
  for (const s of active.filter((s) => inPeriod(s.created_at))) {
    const key = s.created_at.slice(0, 7);
    months.set(key, (months.get(key) ?? 0) + Number(s.amount));
  }
  const series = [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount]) => ({ month, amount }));

  /* ── Investor funnel: how far this period's new investors have got ── */
  const cohort = input.investors.filter((i) => span === null || inPeriod(i.created_at));
  const investedIds = new Set(active.map((s) => s.investor_id));
  const funnel = [
    { key: "registered", label: "Registered", count: cohort.length },
    {
      key: "details",
      label: "Details completed",
      count: cohort.filter((i) => (i.onboarding_step ?? 0) >= 4 || i.onboarding_completed_at)
        .length,
    },
    {
      key: "identity",
      label: "Identity verified",
      count: cohort.filter((i) => i.identity_status === "verified").length,
    },
    {
      key: "nda",
      label: "NDA signed",
      count: cohort.filter((i) => i.nda_status === "signed").length,
    },
    {
      key: "approved",
      label: "Approved by LUCA",
      count: cohort.filter((i) => i.verification_status === "approved").length,
    },
    {
      key: "invested",
      label: "Invested",
      count: cohort.filter((i) => investedIds.has(i.id)).length,
    },
  ];

  /* ── Where the capital comes from (current commitments) ── */
  const bySource = new Map<string, { committed: number; clients: Set<number> }>();
  for (const s of active) {
    const key = s.eam_firm ?? "Direct";
    const row = bySource.get(key) ?? { committed: 0, clients: new Set<number>() };
    row.committed += Number(s.amount);
    row.clients.add(s.investor_id);
    bySource.set(key, row);
  }
  const sources = [...bySource.entries()]
    .map(([label, row]) => ({ label, committed: row.committed, clients: row.clients.size }))
    .sort((a, b) => b.committed - a.committed);
  const perInvestor = new Map<number, number>();
  for (const s of active)
    perInvestor.set(s.investor_id, (perInvestor.get(s.investor_id) ?? 0) + Number(s.amount));
  const ranked = [...perInvestor.values()].sort((a, b) => b - a);
  const share = (n: number) =>
    totals.committed > 0 ? ranked.slice(0, n).reduce((a, b) => a + b, 0) / totals.committed : 0;

  /* ── How long each step takes (subscriptions started in the period) ── */
  const sample = input.subscriptions.filter(
    (s) => inPeriod(s.created_at) && !INACTIVE.includes(s.status),
  );
  const step = (label: string, pick: (s: AdminSubscription) => number | null) => {
    const values = sample.map(pick).filter((v): v is number => v !== null && v >= 0);
    return { label, median: median(values), n: values.length };
  };
  const speed = [
    step("Signature", (s) => days(s.created_at, s.confirmed_at)),
    step("Review and approval", (s) => days(s.confirmed_at, s.approved_at)),
    step("Fund transfer", (s) => days(s.approved_at, s.funds_received_at)),
    step("Verification and allocation", (s) => days(s.funds_received_at, s.allocated_at)),
  ];
  const endToEnd = step("Start to allocation", (s) => days(s.created_at, s.allocated_at));
  const oldestOpen = active
    .filter((s) => !s.allocated_at && !s.holding_id)
    .map((s) => ({ s, age: Math.floor((now - new Date(s.created_at).getTime()) / DAY) }))
    .sort((a, b) => b.age - a.age)
    .slice(0, 5);

  /* ── Fees ── */
  const fees = input.workflow.allocations
    .filter((a) => !a.voided && inPeriod(a.at))
    .reduce((n, a) => n + a.fee, 0);
  const owedToPartners = input.partners.reduce((n, p) => n + Number(p.accrued_revenue), 0);

  return {
    capital,
    totals: { ...totals, target },
    series,
    funnel,
    sources,
    concentration: { top1: share(1), top5: share(5), top10: share(10), investors: ranked.length },
    speed,
    endToEnd,
    oldestOpen,
    fees: { earned: fees, owedToPartners },
  };
}
