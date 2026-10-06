import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, SearchIcon } from "lucide-react";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/currency";
import { stageOfStatus } from "@/lib/types";
import { STATUS_LABELS, type AdminSubscription, type SubscriptionsResponse } from "./types";
import { SubscriptionDialog } from "./subscriptions";
import { Input } from "@/components/ui/input";

type Outcome = "issued" | "closed";

const OUTCOMES: { key: Outcome; label: string; hint: string }[] = [
  { key: "issued", label: "Holdings issued", hint: "Allocated, with a holding on the register." },
  {
    key: "closed",
    label: "Closed without a holding",
    hint: "Declined, cancelled, not allocated or refunded.",
  },
];

const dateOf = (s: AdminSubscription) =>
  s.allocated_at ?? s.rejected_at ?? s.cancelled_at ?? s.created_at;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Finished subscriptions: kept as a record, out of the day-to-day working list. */
export default function AdminSubscriptionHistoryPage() {
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState<Outcome>("issued");
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "subscriptions", "board"],
    queryFn: () => api<SubscriptionsResponse>("/api/v1/admin/subscriptions"),
  });
  const finished = useMemo(
    () =>
      (data?.subscriptions ?? []).filter(
        (s) => !!s.holding_id || stageOfStatus(s.status) === undefined,
      ),
    [data],
  );
  const isIssued = (s: AdminSubscription) => !!s.holding_id;
  const counts = {
    issued: finished.filter(isIssued).length,
    closed: finished.filter((s) => !isIssued(s)).length,
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return finished
      .filter((s) => (outcome === "issued" ? isIssued(s) : !isIssued(s)))
      .filter(
        (s) =>
          !q ||
          s.investor_name.toLowerCase().includes(q) ||
          s.asset_name.toLowerCase().includes(q) ||
          (s.payment_reference ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => new Date(dateOf(b)).getTime() - new Date(dateOf(a)).getTime());
  }, [finished, outcome, search]);
  const detail = (data?.subscriptions ?? []).find((s) => s.id === detailId) ?? null;

  return (
    <div className="w-full space-y-6">
      <div className="space-y-3">
        <Link
          to="/luca/subscriptions"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Subscriptions
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Subscription history</h1>
        <p className="text-muted-foreground">
          A record of finished subscriptions. Anything still in progress is on the Subscriptions
          page.
        </p>
      </div>

      <div role="tablist" aria-label="Outcome" className="flex flex-wrap gap-x-6 border-b">
        {OUTCOMES.map((o) => (
          <button
            key={o.key}
            role="tab"
            type="button"
            aria-selected={outcome === o.key}
            onClick={() => setOutcome(o.key)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-1 pb-3 text-sm transition-colors ${
              outcome === o.key
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.label}
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
              {counts[o.key]}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-60 flex-1 sm:max-w-sm">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search investor, deal or payment reference"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {OUTCOMES.find((o) => o.key === outcome)?.hint}
        </p>
      </div>

      {isLoading ? (
        <p className="py-12 text-center text-muted-foreground">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="border-y py-12 text-center text-sm text-muted-foreground">
          Nothing to show here yet.
        </p>
      ) : (
        <div>
          <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_7rem_minmax(0,1.5fr)_7rem_4rem] gap-x-4 border-b pb-2 text-xs text-muted-foreground lg:grid">
            <span>Investor</span>
            <span>Deal</span>
            <span className="text-right">Amount</span>
            <span>Outcome</span>
            <span className="text-right">Date</span>
            <span />
          </div>
          <ul className="divide-y border-b">
            {rows.map((s) => (
              <li
                key={s.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 transition-colors hover:bg-muted/40 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_7rem_minmax(0,1.5fr)_7rem_4rem]"
              >
                <span className="min-w-0">
                  <Link
                    to={`/luca/investors/${s.investor_id}`}
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {s.investor_name}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">
                    {s.eam_firm ?? "Direct"}
                  </span>
                </span>
                <Link
                  to={`/luca/deals/${s.fund_id}`}
                  className="order-3 col-span-2 truncate text-sm hover:underline lg:order-none lg:col-span-1"
                >
                  {s.asset_name}
                </Link>
                <span className="text-right text-sm font-medium tabular-nums">
                  {formatPrice(s.amount)}
                </span>
                <span className="order-4 col-span-2 text-sm lg:order-none lg:col-span-1">
                  {STATUS_LABELS[s.status]}
                </span>
                <span className="hidden text-right text-sm text-muted-foreground tabular-nums lg:block">
                  {formatDate(dateOf(s))}
                </span>
                <button
                  type="button"
                  onClick={() => setDetailId(s.id)}
                  className="text-right text-sm hover:underline"
                >
                  View
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {detail && (
        <SubscriptionDialog
          subscription={detail}
          onClose={() => setDetailId(null)}
          onMoved={() => queryClient.invalidateQueries({ queryKey: ["admin", "subscriptions"] })}
        />
      )}
    </div>
  );
}
