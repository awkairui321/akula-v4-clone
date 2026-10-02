import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HistoryIcon, LinkIcon, SearchIcon } from "lucide-react";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/currency";
import { SUBSCRIPTION_STAGES, stageOfStatus } from "@/lib/types";
import {
  NEXT_ACTION_LABELS,
  OWNER_LABELS,
  STATUS_LABELS,
  type AdminSubscription,
  type BulkTransitionResponse,
  type InvestorPricingRow,
  type PartnersResponse,
  type SubscriptionStatus,
  type SubscriptionsResponse,
} from "./types";
import { PaymentMatchingDialog, SubscriptionDialog, REJECTION_REASONS } from "./subscriptions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const OVERDUE_DAYS = 5;
const DAY = 24 * 60 * 60 * 1000;

/** Open subscriptions only: finished and closed ones live on the History page. */
const isActive = (s: AdminSubscription) => stageOfStatus(s.status) !== undefined;

/** When the subscription entered its current stage, for "waiting" ages. */
function stageSince(s: AdminSubscription): string | null {
  switch (s.status) {
    case "under_luca_review":
      return s.institution_reviewed_at ?? s.confirmed_at ?? s.created_at;
    case "information_requested":
      return s.information_requested_at ?? s.created_at;
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

/* ─── One-click decisions (with a confirmation step) ─── */

type Decision = { kind: "approve" | "info" | "decline"; subs: AdminSubscription[] };

function DecisionDialog({
  decision,
  onClose,
  onDone,
}: {
  decision: Decision;
  onClose: () => void;
  onDone: () => void;
}) {
  const { kind, subs } = decision;
  const single = subs.length === 1 ? subs[0] : null;
  const total = subs.reduce((n, s) => n + parseFloat(s.amount), 0);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: async () => {
      if (kind === "approve" && subs.length > 1) {
        const result = await api<BulkTransitionResponse>(
          "/api/v1/admin/subscriptions/bulk_transition",
          { method: "POST", body: { ids: subs.map((s) => s.id), to: "approved" } },
        );
        if (result.errors.length > 0)
          throw new Error(
            `${result.errors.length} could not be approved: ${result.errors[0].error}`,
          );
        return;
      }
      const sub = subs[0];
      await api(`/api/v1/admin/subscriptions/${sub.id}/transition`, {
        method: "POST",
        body:
          kind === "approve"
            ? { to: "approved" }
            : kind === "info"
              ? { to: "information_requested", information_request_note: note.trim() }
              : {
                  to: "rejected",
                  rejection_reason: reason ?? undefined,
                  rejection_note: note.trim() || undefined,
                },
      });
    },
    onSuccess: () => {
      toast.success(
        kind === "approve"
          ? `${subs.length === 1 ? "Subscription" : `${subs.length} subscriptions`} approved. Investors will be asked to fund.`
          : kind === "info"
            ? "Information request sent."
            : "Subscription declined.",
      );
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const title =
    kind === "approve"
      ? single
        ? "Approve this subscription?"
        : `Approve ${subs.length} subscriptions?`
      : kind === "info"
        ? "Request more information"
        : "Decline this subscription";

  const ready = kind === "info" ? note.trim() !== "" : kind === "decline" ? reason !== null : true;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{title}</DialogTitle>

        {single ? (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{single.investor_name}</span> ·{" "}
            {single.asset_name} · {formatPrice(single.amount)}
          </p>
        ) : (
          <div className="text-sm text-muted-foreground">
            <p>
              {subs.length} subscriptions totalling{" "}
              <span className="font-medium text-foreground">{formatPrice(total)}</span>
            </p>
            <ul className="mt-2 max-h-40 divide-y overflow-y-auto border-y">
              {subs.map((s) => (
                <li key={s.id} className="flex justify-between gap-3 py-1.5">
                  <span className="truncate">
                    {s.investor_name} · {s.asset_name}
                  </span>
                  <span className="tabular-nums">{formatPrice(s.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {kind === "approve" && (
          <p className="text-sm text-muted-foreground">
            The investor{subs.length === 1 ? "" : "s"} will be notified to transfer funds. This is
            recorded in the audit trail.
          </p>
        )}

        {kind === "info" && (
          <div className="space-y-1.5">
            <Label htmlFor="decision-note">What’s missing or needed?</Label>
            <Textarea
              id="decision-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Updated proof of address dated within the last 3 months"
            />
          </div>
        )}

        {kind === "decline" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Select value={reason ?? undefined} onValueChange={(v) => setReason(v as string)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a reason…" />
                </SelectTrigger>
                <SelectContent>
                  {REJECTION_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="decision-note">
                Note <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea id="decision-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            variant={kind === "decline" ? "destructive" : "default"}
            disabled={!ready || send.isPending}
            onClick={() => send.mutate()}
          >
            {send.isPending
              ? "Saving..."
              : kind === "approve"
                ? "Approve"
                : kind === "info"
                  ? "Send request"
                  : "Decline subscription"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── The subscriptions page: four stages, worked from the top ─── */

// Fixed last column keeps every row's columns aligned whatever buttons it carries.
const GRID =
  "lg:grid-cols-[1.25rem_minmax(0,2fr)_minmax(0,1.4fr)_6.5rem_minmax(0,1.8fr)_4rem_21rem]";

type StageFilter = "all" | (typeof SUBSCRIPTION_STAGES)[number]["key"];

const stageLabel = (key: StageFilter) =>
  key === "all" ? "All stages" : (SUBSCRIPTION_STAGES.find((st) => st.key === key)?.label ?? key);

export default function AdminSubscriptionsPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFromUrl = searchParams.get("status") as SubscriptionStatus | null;
  const stageFromUrl = searchParams.get("stage");
  const dealFromUrl = searchParams.get("deal");

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
    const fromStatus = statusFromUrl ? stageOfStatus(statusFromUrl)?.key : undefined;
    const key = (stageFromUrl as StageFilter | null) ?? fromStatus;
    return key && SUBSCRIPTION_STAGES.some((st) => st.key === key) ? key : "all";
  })();
  const filteredByUrl = Boolean(statusFromUrl || stageFromUrl || dealFromUrl);

  const [stage, setStage] = useState<StageFilter>(urlStage);
  const [onlyMine, setOnlyMine] = useState(!filteredByUrl);
  const [deal, setDeal] = useState(dealFromUrl ?? "all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [matchingOpen, setMatchingOpen] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "subscriptions"] });

  const deals = useMemo(
    () => [...new Map(active.map((s) => [s.fund_id, s.fund_name])).entries()],
    [active],
  );

  // Everything except the stage filter, so each stage tab can show its own count.
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
          s.asset_name.toLowerCase().includes(q)),
    );
  }, [active, onlyMine, deal, search]);

  const mineCount = active.filter((s) => s.owner === "luca").length;

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: scoped.length };
    for (const st of SUBSCRIPTION_STAGES) {
      counts[st.key] = scoped.filter((s) => stageOfStatus(s.status)?.key === st.key).length;
    }
    return counts;
  }, [scoped]);

  const rows = useMemo(
    () =>
      scoped
        .filter((s) => stage === "all" || stageOfStatus(s.status)?.key === stage)
        .sort((a, b) => ageInDays(b) - ageInDays(a)),
    [scoped, stage],
  );

  const approvable = rows.filter((s) => s.available_transitions.includes("approved"));
  const selectedSubs = approvable.filter((s) => selected.includes(s.id));
  const detail = all.find((s) => s.id === detailId) ?? null;
  const rowTotal = rows.reduce((n, s) => n + parseFloat(s.amount), 0);

  const clearUrl = () => {
    if (filteredByUrl) setSearchParams({});
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

      {/* The four stages of a subscription */}
      <div
        role="tablist"
        aria-label="Subscription stage"
        className="flex flex-wrap gap-x-6 border-b"
      >
        {(["all", ...SUBSCRIPTION_STAGES.map((st) => st.key)] as StageFilter[]).map((key) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={stage === key}
            onClick={() => {
              setStage(key);
              setSelected([]);
              clearUrl();
            }}
            className={`-mb-px flex items-center gap-2 border-b-2 px-1 pb-3 text-sm transition-colors ${
              stage === key
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {key === "all" ? "All in progress" : stageLabel(key)}
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
              {stageCounts[key]}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1 sm:max-w-sm">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search investor, email or payment reference"
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
          <SelectTrigger className="w-52">
            <SelectValue>
              {deal === "all" ? "All deals" : deals.find(([id]) => String(id) === deal)?.[1]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All deals</SelectItem>
            {deals.map(([id, name]) => (
              <SelectItem key={id} value={String(id)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyMine}
            onChange={(e) => {
              setOnlyMine(e.target.checked);
              setSelected([]);
              clearUrl();
            }}
          />
          Waiting on me
          <span className="text-muted-foreground tabular-nums">{mineCount}</span>
        </label>
        <p className="ml-auto text-sm text-muted-foreground tabular-nums">
          {rows.length} subscription{rows.length === 1 ? "" : "s"} · {formatPrice(rowTotal)}
        </p>
      </div>

      {stage !== "all" && (
        <p className="-mt-2 text-sm text-muted-foreground">
          {SUBSCRIPTION_STAGES.find((st) => st.key === stage)?.detail}
        </p>
      )}

      {/* Bulk approval */}
      {selectedSubs.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md bg-muted/50 px-4 py-2.5 text-sm">
          <span>
            <strong>{selectedSubs.length}</strong> selected ·{" "}
            {formatPrice(selectedSubs.reduce((n, s) => n + parseFloat(s.amount), 0))}
          </span>
          <Button size="sm" onClick={() => setDecision({ kind: "approve", subs: selectedSubs })}>
            Approve selected
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      )}

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
        <div>
          <div
            className={`hidden items-center gap-x-4 border-b pb-2 text-xs text-muted-foreground lg:grid ${GRID}`}
          >
            <span>
              {approvable.length > 0 && (
                <input
                  type="checkbox"
                  aria-label="Select all approvable subscriptions"
                  checked={selectedSubs.length === approvable.length}
                  onChange={(e) => setSelected(e.target.checked ? approvable.map((s) => s.id) : [])}
                />
              )}
            </span>
            <span>Investor</span>
            <span>Deal</span>
            <span className="text-right">Amount</span>
            <span>Status &amp; next step</span>
            <span className="text-right">Waiting</span>
            <span />
          </div>
          <ul className="divide-y border-b">
            {rows.map((s) => {
              const age = ageInDays(s);
              const mine = s.owner === "luca";
              const canApprove = s.available_transitions.includes("approved");
              const canInfo = s.available_transitions.includes("information_requested");
              const canDecline = s.available_transitions.includes("rejected");
              const firmId = s.eam_firm ? partnerIdByFirm.get(s.eam_firm) : undefined;
              const hasCustomTerms = customTerms.has(`${s.fund_id}:${s.investor_id}`);
              return (
                <li
                  key={s.id}
                  className={`grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 transition-colors hover:bg-muted/40 lg:py-3.5 ${GRID}`}
                >
                  <span>
                    {canApprove && (
                      <input
                        type="checkbox"
                        aria-label={`Select ${s.investor_name}`}
                        checked={selected.includes(s.id)}
                        onChange={(e) =>
                          setSelected((prev) =>
                            e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id),
                          )
                        }
                      />
                    )}
                  </span>
                  <span className="min-w-0">
                    <Link
                      to={`/luca/investors/${s.investor_id}`}
                      className="block truncate text-sm font-medium hover:underline"
                    >
                      {s.investor_name}
                    </Link>
                    <span className="block truncate text-xs text-muted-foreground">
                      {firmId ? (
                        <Link to={`/luca/partners/${firmId}`} className="hover:underline">
                          {s.eam_firm}
                        </Link>
                      ) : (
                        (s.eam_firm ?? "Direct")
                      )}
                      {s.on_hold ? " · On hold" : ""}
                    </span>
                  </span>
                  <span className="order-3 col-span-2 min-w-0 text-sm lg:order-none lg:col-span-1">
                    <Link
                      to={`/luca/deals/${s.fund_id}`}
                      className="block truncate hover:underline"
                    >
                      {s.asset_name}
                    </Link>
                    {hasCustomTerms && (
                      <Link
                        to={`/luca/deals/${s.fund_id}?tab=pricing`}
                        className="text-xs text-primary hover:underline"
                      >
                        Custom terms
                      </Link>
                    )}
                  </span>
                  <span className="text-right text-sm font-medium tabular-nums">
                    {formatPrice(s.amount)}
                  </span>
                  <span className="order-4 col-span-2 min-w-0 lg:order-none lg:col-span-1">
                    <span className="block truncate text-sm">{STATUS_LABELS[s.status]}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {NEXT_ACTION_LABELS[s.next_action] ?? OWNER_LABELS[s.owner]}
                    </span>
                  </span>
                  <span
                    className={`hidden text-right text-sm tabular-nums lg:block ${
                      mine && age > OVERDUE_DAYS
                        ? "font-medium text-amber-700"
                        : "text-muted-foreground"
                    }`}
                  >
                    {age}d
                  </span>
                  <span className="order-5 col-span-3 flex flex-wrap items-center justify-end gap-2 lg:order-none lg:col-span-1">
                    {canApprove && (
                      <Button size="sm" onClick={() => setDecision({ kind: "approve", subs: [s] })}>
                        Approve
                      </Button>
                    )}
                    {canInfo && s.status === "under_luca_review" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDecision({ kind: "info", subs: [s] })}
                      >
                        Request info
                      </Button>
                    )}
                    {canDecline && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDecision({ kind: "decline", subs: [s] })}
                      >
                        Decline
                      </Button>
                    )}
                    {s.status === "allocation_pending" && (
                      <Button size="sm" nativeButton={false} render={<Link to="/workflows" />}>
                        Allocate in Workflows
                      </Button>
                    )}
                    {s.status === "payment_unmatched" && (
                      <Button size="sm" variant="outline" onClick={() => setMatchingOpen(true)}>
                        Match payment
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setDetailId(s.id)}>
                      {mine ? "Review" : "View"}
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {decision && (
        <DecisionDialog
          decision={decision}
          onClose={() => setDecision(null)}
          onDone={() => {
            setDecision(null);
            setSelected([]);
            refresh();
          }}
        />
      )}

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
