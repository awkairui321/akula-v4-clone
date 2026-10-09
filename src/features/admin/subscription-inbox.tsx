import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HistoryIcon, LinkIcon, SearchIcon, ArrowRightIcon } from "lucide-react";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/currency";
import { SUBSCRIPTION_STAGES, stageOfStatus } from "@/lib/types";
import {
  OWNER_LABELS,
  STATUS_LABELS,
  type AdminSubscription,
  type InvestorPricingRow,
  type PartnersResponse,
  type SubscriptionStatus,
  type SubscriptionsResponse,
} from "./types";
import { PaymentMatchingDialog, SubscriptionDialog } from "./subscriptions";
import { AllocateDialog } from "./allocate-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const OVERDUE_DAYS = 5;
const DAY = 24 * 60 * 60 * 1000;

/** Open subscriptions only: finished and closed ones live on the History page. */
const isActive = (s: AdminSubscription) => !s.holding_id && stageOfStatus(s.status) !== undefined;

/** When the subscription entered its current stage, for "waiting" ages. */
function stageSince(s: AdminSubscription): string | null {
  switch (s.status) {
    case "approved":
    case "awaiting_funds":
      return s.approved_at ?? s.created_at;
    case "payment_unmatched":
      return s.payment_declared_at ?? s.approved_at ?? s.created_at;
    case "reconciliation":
      return s.funds_received_at ?? s.created_at;
    case "allocation_pending":
      return s.reconciled_at ?? s.funds_received_at ?? s.created_at;
    case "allocated":
      return s.allocated_at ?? s.created_at;
    case "rejected":
      return s.rejected_at ?? s.created_at;
    case "cancelled":
      return s.cancelled_at ?? s.created_at;
    case "institution_review":
      return s.confirmed_at ?? s.created_at;
    default:
      return s.reserved_at ?? s.created_at;
  }
}

const ageInDays = (s: AdminSubscription) =>
  Math.max(0, Math.floor((Date.now() - new Date(stageSince(s) ?? s.created_at).getTime()) / DAY));

/* ─── The subscriptions page: by fund, then by stage ─── */

type StageFilter = "ready_allocation" | "all" | (typeof SUBSCRIPTION_STAGES)[number]["key"];

const stageLabel = (key: StageFilter) =>
  key === "ready_allocation"
    ? "Ready to allocate"
    : key === "all"
      ? "All stages"
      : (SUBSCRIPTION_STAGES.find((st) => st.key === key)?.label ?? key);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function AdminSubscriptionsPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFromUrl = searchParams.get("status") as SubscriptionStatus | null;
  const stageFromUrl = searchParams.get("stage");
  const dealFromUrl = searchParams.get("deal");
  const queryFromUrl = searchParams.get("q") ?? "";
  const allocateFromUrl = Number(searchParams.get("allocate")) || null;

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "subscriptions", "board"],
    queryFn: () => api<SubscriptionsResponse>("/api/v1/admin/subscriptions"),
  });
  const { data: partnersData } = useQuery({
    queryKey: ["admin", "partners", ""],
    queryFn: () => api<PartnersResponse>("/api/v1/admin/partners"),
  });
  const { data: pricingData } = useQuery({
    queryKey: ["admin", "investor-pricing", "all"],
    queryFn: () => api<{ overrides: InvestorPricingRow[] }>("/api/v1/admin/investor_pricing"),
  });

  const all = useMemo(() => data?.subscriptions ?? [], [data]);
  const active = useMemo(() => all.filter(isActive), [all]);
  const historyCount = all.length - active.length;

  const partnerIdByFirm = useMemo(
    () => new Map((partnersData?.partners ?? []).map((p) => [p.firm_name, p.id])),
    [partnersData],
  );
  const customTerms = useMemo(
    () => new Set((pricingData?.overrides ?? []).map((o) => `${o.fund_id}:${o.investor_id}`)),
    [pricingData],
  );

  // Links from other pages (dashboard, deals, investors) arrive pre-filtered.
  const urlStage: StageFilter = (() => {
    const fromStatus =
      statusFromUrl === "allocation_pending"
        ? "ready_allocation"
        : statusFromUrl
          ? stageOfStatus(statusFromUrl)?.key
          : undefined;
    const key = (stageFromUrl as StageFilter | null) ?? fromStatus;
    return key && (key === "ready_allocation" || SUBSCRIPTION_STAGES.some((st) => st.key === key))
      ? key
      : "all";
  })();
  const filteredByUrl = Boolean(statusFromUrl || stageFromUrl || dealFromUrl || queryFromUrl);

  const [stage, setStage] = useState<StageFilter>(urlStage);
  const [onlyMine, setOnlyMine] = useState(!filteredByUrl);
  const [deal, setDeal] = useState(dealFromUrl ?? "all");
  const [search, setSearch] = useState(queryFromUrl);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [allocateId, setAllocateId] = useState<number | null>(allocateFromUrl);
  const [matchingOpen, setMatchingOpen] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "subscriptions"] });

  const deals = useMemo(
    () => [...new Map(active.map((s) => [s.fund_id, s.fund_name])).entries()],
    [active],
  );

  // Everything except the stage filter, so each stage option can show its own count.
  const scoped = useMemo(() => {
    const q = search.trim().toLowerCase();
    return active.filter(
      (s) =>
        (!onlyMine || s.owner === "luca") &&
        (deal === "all" || String(s.fund_id) === deal) &&
        (!q ||
          s.investor_name.toLowerCase().includes(q) ||
          s.investor_email.toLowerCase().includes(q) ||
          (s.payment_reference ?? "").toLowerCase().includes(q) ||
          (s.eam_firm ?? "").toLowerCase().includes(q) ||
          s.asset_name.toLowerCase().includes(q)),
    );
  }, [active, onlyMine, deal, search]);

  const mineCount = active.filter((s) => s.owner === "luca").length;

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: scoped.length };
    for (const st of SUBSCRIPTION_STAGES) {
      counts[st.key] = scoped.filter(
        (s) => s.status !== "allocation_pending" && stageOfStatus(s.status)?.key === st.key,
      ).length;
    }
    counts.ready_allocation = scoped.filter((s) => s.status === "allocation_pending").length;
    return counts;
  }, [scoped]);

  const rows = useMemo(
    () =>
      scoped
        .filter(
          (s) =>
            stage === "all" ||
            (stage === "ready_allocation"
              ? s.status === "allocation_pending"
              : s.status !== "allocation_pending" && stageOfStatus(s.status)?.key === stage),
        )
        .sort((a, b) => ageInDays(b) - ageInDays(a)),
    [scoped, stage],
  );

  // Fund first; funds with something waiting on LUCA come first.
  const funds = useMemo(() => {
    const book = new Map<number, AdminSubscription[]>();
    for (const sub of rows) {
      const list = book.get(sub.fund_id) ?? [];
      list.push(sub);
      book.set(sub.fund_id, list);
    }
    return [...book.values()].sort(
      (a, b) =>
        b.filter((s) => s.owner === "luca").length - a.filter((s) => s.owner === "luca").length ||
        a[0].fund_name.localeCompare(b[0].fund_name),
    );
  }, [rows]);

  const detail = all.find((s) => s.id === detailId) ?? null;
  const allocating = all.find((s) => s.id === allocateId && s.status === "allocation_pending");
  const rowTotal = rows.reduce((n, s) => n + parseFloat(s.amount), 0);
  const clients = new Set(rows.map((s) => s.investor_id)).size;

  const clearUrl = () => {
    if (filteredByUrl) setSearchParams({});
  };
  const closeAllocate = () => {
    setAllocateId(null);
    if (searchParams.has("allocate")) setSearchParams({}, { replace: true });
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Subscriptions</h1>
          <p className="text-muted-foreground">
            {mineCount === 0
              ? "Nothing is waiting on your decision."
              : `${mineCount} subscription${mineCount === 1 ? "" : "s"} waiting on you, out of ${active.length} in progress.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link to="/luca/subscriptions/history" />}
          >
            <HistoryIcon className="size-4" />
            History
            <span className="text-muted-foreground tabular-nums">{historyCount}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMatchingOpen(true)}>
            <LinkIcon className="size-4" />
            Match payments
          </Button>
        </div>
      </div>

      <div role="tablist" aria-label="Subscription queue" className="flex gap-6 border-b">
        {[
          { mine: true, label: "Needs my decision", count: mineCount },
          { mine: false, label: "All in progress", count: active.length },
        ].map((queue) => (
          <button
            key={queue.label}
            type="button"
            role="tab"
            aria-selected={onlyMine === queue.mine}
            onClick={() => {
              setOnlyMine(queue.mine);
              clearUrl();
            }}
            className={`flex items-center gap-2 border-b-2 pb-3 text-sm ${onlyMine === queue.mine ? "border-primary font-medium" : "border-transparent text-muted-foreground"}`}
          >
            {queue.label}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">
              {queue.count}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1 sm:max-w-sm">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search investor, adviser, email or payment reference"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={deal}
          onValueChange={(v) => {
            setDeal(v as string);
            clearUrl();
          }}
        >
          <SelectTrigger className="w-52" aria-label="Fund">
            <SelectValue>
              {deal === "all" ? "All funds" : deals.find(([id]) => String(id) === deal)?.[1]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All funds</SelectItem>
            {deals.map(([id, name]) => (
              <SelectItem key={id} value={String(id)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={stage}
          onValueChange={(value) => {
            setStage(value as StageFilter);
            clearUrl();
          }}
        >
          <SelectTrigger className="w-56" aria-label="Subscription stage">
            <SelectValue>{stageLabel(stage)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(
              [
                "all",
                ...SUBSCRIPTION_STAGES.map((st) => st.key),
                "ready_allocation",
              ] as StageFilter[]
            ).map((key) => (
              <SelectItem key={key} value={key}>
                {stageLabel(key)} · {stageCounts[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="ml-auto text-sm text-muted-foreground tabular-nums">
          {plural(clients, "client")} · {plural(rows.length, "subscription")} ·{" "}
          {formatPrice(rowTotal)}
        </p>
      </div>

      {isLoading ? (
        <p className="py-12 text-center text-muted-foreground">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="border-y py-12 text-center text-sm text-muted-foreground">
          {active.length === 0
            ? "No subscriptions in progress."
            : onlyMine && mineCount === 0
              ? "You’re all caught up. Nothing needs your decision."
              : "No subscriptions match these filters."}
        </p>
      ) : (
        <div className="space-y-10">
          {funds.map((subs) => {
            const lead = subs[0];
            const mine = subs.filter((s) => s.owner === "luca").length;
            const total = subs.reduce((n, s) => n + parseFloat(s.amount), 0);
            return (
              <section key={lead.fund_id} aria-label={lead.fund_name} className="space-y-5">
                <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 border-b pb-3">
                  <div>
                    <Link
                      to={`/luca/deals/${lead.fund_id}`}
                      className="text-xl font-semibold hover:underline"
                    >
                      {lead.fund_name}
                    </Link>
                    <p className="mt-0.5 text-sm text-muted-foreground">{lead.asset_name}</p>
                  </div>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {plural(subs.length, "subscription")} · {formatPrice(total)}
                    {mine > 0 && (
                      <span className="ml-2 font-medium text-amber-700">{mine} for you</span>
                    )}
                  </p>
                </header>

                {SUBSCRIPTION_STAGES.map((st) => {
                  const inStage = subs.filter((s) => stageOfStatus(s.status)?.key === st.key);
                  if (inStage.length === 0) return null;
                  return (
                    <div key={st.key} className="space-y-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          {st.label} ({inStage.length})
                        </h3>
                        <p className="text-xs text-muted-foreground">{st.detail}</p>
                      </div>
                      <ul className="divide-y border-y">
                        {inStage.map((sub) => {
                          const age = ageInDays(sub);
                          const readyToAllocate = sub.status === "allocation_pending";
                          const firmId = sub.eam_firm
                            ? partnerIdByFirm.get(sub.eam_firm)
                            : undefined;
                          return (
                            <li
                              key={sub.id}
                              className="grid items-center gap-x-4 gap-y-1 py-3.5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.3fr)_7rem_11rem]"
                            >
                              <div className="min-w-0">
                                <Link
                                  to={`/luca/investors/${sub.investor_id}`}
                                  className="block truncate text-sm font-medium hover:underline"
                                >
                                  {sub.investor_name}
                                </Link>
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                  {firmId ? (
                                    <Link
                                      to={`/luca/partners/${encodeURIComponent(sub.eam_firm ?? "")}`}
                                      className="hover:underline"
                                    >
                                      {sub.eam_firm}
                                    </Link>
                                  ) : (
                                    (sub.eam_firm ?? "Direct")
                                  )}{" "}
                                  · #{sub.id}
                                  {customTerms.has(`${sub.fund_id}:${sub.investor_id}`) &&
                                    " · Custom terms"}
                                </p>
                              </div>
                              <div>
                                <p className="text-sm">
                                  {readyToAllocate
                                    ? "Ready for allocation"
                                    : STATUS_LABELS[sub.status]}
                                  {sub.on_hold ? " · On hold" : ""}
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {sub.owner === "luca"
                                    ? "Waiting for your decision"
                                    : "With " + (OWNER_LABELS[sub.owner] ?? sub.owner)}{" "}
                                  <span className="mx-1">·</span>
                                  <span
                                    className={
                                      sub.owner === "luca" && age > OVERDUE_DAYS
                                        ? "text-amber-700"
                                        : ""
                                    }
                                  >
                                    {plural(age, "day")}
                                  </span>
                                </p>
                              </div>
                              <p className="text-sm font-semibold tabular-nums lg:text-right">
                                {formatPrice(sub.amount)}
                              </p>
                              <div className="lg:flex lg:justify-end">
                                {readyToAllocate ? (
                                  <Button variant="outline" onClick={() => setAllocateId(sub.id)}>
                                    Allocate
                                    <ArrowRightIcon className="size-3.5" />
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    onClick={() =>
                                      sub.status === "payment_unmatched"
                                        ? setMatchingOpen(true)
                                        : setDetailId(sub.id)
                                    }
                                  >
                                    {sub.status === "payment_unmatched"
                                      ? "Match payment"
                                      : "View subscription"}
                                    <ArrowRightIcon className="size-3.5" />
                                  </Button>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}

      {allocating && <AllocateDialog subscription={allocating} onClose={closeAllocate} />}

      {detail && (
        <SubscriptionDialog
          subscription={detail}
          onClose={() => setDetailId(null)}
          onMoved={() => refresh()}
        />
      )}

      {matchingOpen && <PaymentMatchingDialog onClose={() => setMatchingOpen(false)} />}
    </div>
  );
}
