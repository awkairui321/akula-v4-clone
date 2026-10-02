import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import type { Fund, FundStatus } from "@/lib/types";
import { LUCA_PIPELINE_STAGES } from "@/lib/types";
import { formatPrice } from "@/lib/currency";
import type {
  ActivityResponse,
  AdminSubscription,
  DocumentsResponse,
  InvestorsResponse,
  SubscriptionsResponse,
} from "./types";

/** Statuses that count as "funded" — money is confirmed on its way to escrow
 * or already there. Distinct from AUM, which is broader (see below). */
const FUNDED_STATUSES = ["reconciliation", "allocation_pending", "allocated"];
/** AUM: committed capital that's either moving toward funding or already an
 * active holding — the LUCA dashboard's "funded or in active holding" definition. */
const AUM_STATUSES = [...FUNDED_STATUSES, "awaiting_funds", "payment_unmatched"];
const STAGE_OWNER: Record<string, string> = {
  draft: "Investor",
  awaiting_signature: "Investor",
  institution_review: "EAM / institution",
  under_luca_review: "LUCA",
  information_requested: "Investor / EAM",
  approved: "Investor",
  funded: "Investor → Akula Ops → LUCA",
  active_holding: "Akula Ops",
};
const FUND_STATE_LABELS: Record<FundStatus, string> = {
  draft: "Draft",
  open: "Live",
  closing: "Closing",
  closed: "Closed",
  holding: "Holding",
  realized: "Realized",
  cancelled: "Cancelled",
};
/** An item waiting longer than this is flagged as overdue. */
const OVERDUE_DAYS = 5;
const QUEUE_PREVIEW = 8;

const SECTION_LABEL = "text-xs font-medium tracking-wide text-muted-foreground uppercase";

function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)));
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return diff <= 0 ? 0 : Math.ceil(diff / (24 * 60 * 60 * 1000));
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
  /** Who or what the item is about. */
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

export default function AdminDashboard() {
  const [showAllQueue, setShowAllQueue] = useState(false);

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
  const documents = documentsData?.summary;
  const events = activityData?.events ?? [];

  /* ─── What is waiting on the fund manager, oldest first ─── */
  const attention: AttentionItem[] = [
    ...allSubs
      .filter((s) => s.status === "under_luca_review")
      .map((s) => ({
        key: `decide-${s.id}`,
        title: s.investor_name,
        detail: `${s.asset_name} · ${s.eam_firm ?? "Direct"}`,
        needs: "Approve or reject subscription",
        priority: 0,
        ageDays: daysSince(s.institution_reviewed_at ?? s.created_at),
        amount: parseFloat(s.amount),
        to: "/luca/subscriptions?status=under_luca_review",
      })),
    ...allSubs
      .filter((s) => s.status === "payment_unmatched")
      .map((s) => ({
        key: `payment-${s.id}`,
        title: s.investor_name,
        detail: `${s.asset_name} · ${s.payment_claimed ? "Investor says paid" : "No transfer matched"}`,
        needs: "Match payment",
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
    ...allSubs
      .filter(
        (s) =>
          s.status === "information_requested" &&
          daysSince(s.information_requested_at) > OVERDUE_DAYS,
      )
      .map((s) => ({
        key: `chase-${s.id}`,
        title: s.investor_name,
        detail: `${s.asset_name} · ${s.eam_firm ?? "Direct"}`,
        needs: "Chase information request",
        priority: 1,
        ageDays: daysSince(s.information_requested_at),
        amount: parseFloat(s.amount),
        to: "/luca/subscriptions?status=information_requested",
      })),
    ...(investorsData?.investors ?? []).map((i) => ({
      key: `investor-${i.id}`,
      title: i.full_name,
      detail: `${i.investor_type === "institutional" ? "Entity" : "Individual"} · ${i.client_code}`,
      needs: "Review investor onboarding",
      priority: 1,
      ageDays: daysSince(i.created_at),
      to: `/luca/investors/${i.id}`,
    })),
    ...(documentsData?.documents ?? []).map((d) => ({
      key: `document-${d.id}`,
      title: d.name,
      detail: `${d.owner_name}${d.fund_name ? ` · ${d.fund_name}` : ""}`,
      needs: "Review document",
      priority: 2,
      ageDays: daysSince(d.created_at),
      to: "/luca/documents",
    })),
  ].sort((a, b) => a.priority - b.priority || b.ageDays - a.ageDays);
  const visibleAttention = showAllQueue ? attention : attention.slice(0, QUEUE_PREVIEW);

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
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Fund manager overview</h1>
          <p className="mt-1 text-muted-foreground">
            What needs your decision today, and how capital and deals are tracking.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          As of {new Date().toLocaleDateString("en-GB", { dateStyle: "long" })}
        </p>
      </div>

      {/* Capital: one row of figures, separated by whitespace */}
      <section className="grid grid-cols-2 gap-x-8 gap-y-6 lg:grid-cols-5">
        <Figure
          label="Active commitments"
          value={formatPrice(aum)}
          note="Funded and active"
          to="/luca/subscriptions?stage=funded"
          primary
        />
        <Figure
          label="Funded"
          value={formatPrice(funded)}
          note="Transfers through allocation"
          to="/luca/subscriptions?stage=funded"
        />
        <Figure
          label="Awaiting allocation"
          value={formatPrice(summary?.awaiting_allocation_value ?? 0)}
          note="Reconciled, not yet allocated"
          to="/luca/subscriptions?status=allocation_pending"
        />
        <Figure
          label="Unmatched payments"
          value={formatPrice(summary?.unmatched_value ?? 0)}
          note="Needs matching"
          to="/luca/subscriptions?status=payment_unmatched"
        />
        <Figure
          label="Live deals"
          value={String(liveDeals)}
          note={`${funds.length} deals in total`}
          to="/luca/deals"
        />
      </section>

      {/* The work queue */}
      <section>
        <div className="flex items-baseline justify-between gap-4">
          <div className={SECTION_LABEL}>Needs your attention ({attention.length})</div>
          <p className="text-xs text-muted-foreground">
            Capital decisions first, then oldest. Waiting more than {OVERDUE_DAYS} days is flagged.
          </p>
        </div>
        {attention.length === 0 ? (
          <p className="mt-3 border-y py-6 text-sm text-muted-foreground">
            You’re all caught up. Nothing is waiting on LUCA.
          </p>
        ) : (
          <>
            <div className="mt-2 hidden grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_5rem_7rem_1.5rem] gap-x-4 border-b pb-2 text-xs text-muted-foreground md:grid">
              <span>Item</span>
              <span>Action needed</span>
              <span className="text-right">Waiting</span>
              <span className="text-right">Amount</span>
              <span />
            </div>
            <ul className="divide-y border-b md:border-t-0">
              {visibleAttention.map((item) => (
                <li key={item.key}>
                  <Link
                    to={item.to}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 transition-colors hover:bg-muted/50 md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_5rem_7rem_1.5rem] md:px-0"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{item.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.detail}
                      </span>
                    </span>
                    <span className="order-3 col-span-2 text-sm md:order-none md:col-span-1">
                      {item.needs}
                    </span>
                    <span
                      className={`text-right text-sm tabular-nums ${
                        item.ageDays > OVERDUE_DAYS
                          ? "font-medium text-amber-700"
                          : "text-muted-foreground"
                      }`}
                    >
                      {item.ageDays}d
                    </span>
                    <span className="hidden text-right text-sm tabular-nums md:block">
                      {item.amount !== undefined ? formatPrice(item.amount) : "—"}
                    </span>
                    <span aria-hidden className="hidden text-right text-muted-foreground md:block">
                      →
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

      {/* Deals: raise progress at a glance */}
      <section>
        <div className="flex items-baseline justify-between gap-4">
          <div className={SECTION_LABEL}>Deals ({funds.length})</div>
          <Link
            to="/luca/deals"
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            View all deals
          </Link>
        </div>
        <div className="mt-2 hidden grid-cols-[minmax(0,2fr)_6rem_minmax(0,2fr)_6rem] gap-x-4 border-b pb-2 text-xs text-muted-foreground md:grid">
          <span>Deal</span>
          <span>Status</span>
          <span>Committed</span>
          <span className="text-right">Closes</span>
        </div>
        <ul className="divide-y border-b">
          {funds.map((fund) => {
            const committed = parseFloat(fund.supply_allocated);
            const total = fund.supply_total ? parseFloat(fund.supply_total) : null;
            const pct =
              total && total > 0 ? Math.min(100, Math.round((committed / total) * 100)) : null;
            const days = daysUntil(fund.closes_at);
            return (
              <li key={fund.id}>
                <Link
                  to={`/luca/deals/${fund.id}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3 transition-colors hover:bg-muted/50 md:grid-cols-[minmax(0,2fr)_6rem_minmax(0,2fr)_6rem]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{fund.codename}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {fund.asset.name}
                    </span>
                  </span>
                  <span className="text-right text-sm text-muted-foreground md:text-left">
                    {FUND_STATE_LABELS[fund.state]}
                  </span>
                  <span className="order-3 col-span-2 md:order-none md:col-span-1">
                    {pct !== null && total !== null ? (
                      <>
                        <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <span
                            className="block h-full rounded-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                        <span className="mt-1 flex justify-between text-xs text-muted-foreground tabular-nums">
                          <span>
                            {formatPrice(committed)} of {formatPrice(total)}
                          </span>
                          <span>{pct}%</span>
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatPrice(committed)} · no cap set
                      </span>
                    )}
                  </span>
                  <span className="hidden text-right text-sm text-muted-foreground tabular-nums md:block">
                    {days === null ? "Open-ended" : days === 0 ? "Closed" : `${days}d`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-10 lg:grid-cols-2">
        {/* Pipeline: stage, owner, count, value */}
        <section>
          <div className={SECTION_LABEL}>Subscription pipeline</div>
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_2.5rem_5.5rem] gap-x-3 border-b pb-2 text-xs text-muted-foreground sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1.5fr)_2.5rem_5.5rem]">
            <span>Stage</span>
            <span className="hidden sm:block">Next owner</span>
            <span className="text-right">#</span>
            <span className="text-right">Amount</span>
          </div>
          <ul className="divide-y border-b">
            {LUCA_PIPELINE_STAGES.map((stage) => {
              const subs = allSubs.filter((s) => stage.statuses.includes(s.status));
              return (
                <li key={stage.key}>
                  <Link
                    to={`/luca/subscriptions?stage=${stage.key}`}
                    className="grid grid-cols-[minmax(0,1fr)_2.5rem_5.5rem] items-center gap-x-3 py-2.5 text-sm transition-colors hover:bg-muted/50 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1.5fr)_2.5rem_5.5rem]"
                  >
                    <span className="truncate">{stage.label}</span>
                    <span className="hidden truncate text-xs text-muted-foreground sm:block">
                      {STAGE_OWNER[stage.key] ?? "Review record"}
                    </span>
                    <span className="text-right tabular-nums">{subs.length}</span>
                    <span className="text-right text-muted-foreground tabular-nums">
                      {subs.length ? formatPrice(sumOf(subs)) : "—"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Compliance and documents */}
        <section className="space-y-8">
          <div>
            <div className={SECTION_LABEL}>Accreditation expiring</div>
            <dl className="mt-2 divide-y border-y text-sm">
              {expiring.map((band) => (
                <Link
                  key={band.days}
                  to="/luca/onboarding"
                  className="flex items-center justify-between py-2.5 transition-colors hover:bg-muted/50"
                >
                  <dt className="text-muted-foreground">Next {band.days} days</dt>
                  <dd className="font-medium tabular-nums">{band.count}</dd>
                </Link>
              ))}
            </dl>
          </div>
          <div>
            <div className={SECTION_LABEL}>Documents</div>
            <dl className="mt-2 divide-y border-y text-sm">
              <Link
                to="/luca/documents"
                className="flex items-center justify-between py-2.5 transition-colors hover:bg-muted/50"
              >
                <dt className="text-muted-foreground">New arrivals</dt>
                <dd className="font-medium tabular-nums">{documents?.received ?? 0}</dd>
              </Link>
              <Link
                to="/luca/documents"
                className="flex items-center justify-between py-2.5 transition-colors hover:bg-muted/50"
              >
                <dt className="text-muted-foreground">Archived</dt>
                <dd className="font-medium tabular-nums">{documents?.filed ?? 0}</dd>
              </Link>
            </dl>
          </div>
        </section>
      </div>

      <section>
        <div className={SECTION_LABEL}>Recent activity</div>
        {events.length === 0 ? (
          <p className="mt-2 border-y py-4 text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ul className="mt-2 divide-y border-y">
            {events.slice(0, 10).map((event) => (
              <li key={event.id} className="flex items-start justify-between gap-4 py-2.5 text-sm">
                <span>{event.message}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatDate(event.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Figure({
  label,
  value,
  note,
  to,
  primary = false,
}: {
  label: string;
  value: string;
  note?: string;
  to: string;
  primary?: boolean;
}) {
  return (
    <Link to={to} className="group block">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 font-semibold tracking-tight tabular-nums group-hover:underline ${
          primary ? "text-3xl" : "text-xl"
        }`}
      >
        {value}
      </p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </Link>
  );
}
