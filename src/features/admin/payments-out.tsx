import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { ChevronRightIcon } from "lucide-react";
import { formatPrice, formatPriceCents } from "@/lib/currency";
import {
  DISTRIBUTION_KINDS,
  distributionKindLabel,
  eventTotals,
  planDistribution,
  type DistributionEvent,
  type DistributionKind,
  type DistributionLine,
} from "@/lib/distributions";
import type { WorkflowCommand, WorkflowView } from "@/lib/workflow-types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DialogFacts } from "./dialog-facts";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const REFUND_REASONS: Record<string, string> = {
  not_allocated: "Subscription not accepted",
  cancelled: "Subscription cancelled",
  rejected: "Subscription not accepted",
  funds_returned: "Subscription not accepted",
  allocated: "Funds in excess of the allocation",
};

const row = "grid gap-1.5 sm:grid-cols-[9rem_1fr] sm:items-center sm:gap-4";
/** Payee, payment, amount, status, action. Every row on the page shares these columns. */
const COLUMNS = "lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.4fr)_7.5rem_minmax(0,1.1fr)_10rem]";

type StatusFilter = "to_pay" | "paid" | "all";
type TypeFilter = "all" | "refunds" | "distributions";
type Refunded = WorkflowView["subscriptions"][number];
type Item =
  | { kind: "refund"; key: string; settled: boolean; at: string; subscription: Refunded }
  | { kind: "event"; key: string; settled: boolean; at: string; event: DistributionEvent };

/** Whole dollars when there are no cents to show, otherwise dollars and cents. */
const money = (n: number) => (Number.isInteger(n) ? formatPrice(n) : formatPriceCents(n));

const TONES = {
  due: { dot: "bg-amber-500", text: "text-foreground" },
  active: { dot: "bg-blue-500", text: "text-foreground" },
  failed: { dot: "bg-red-600", text: "text-red-700" },
  paid: { dot: "bg-green-600", text: "text-foreground" },
};

function Status({
  tone,
  label,
  detail,
}: {
  tone: keyof typeof TONES;
  label: string;
  detail?: string;
}) {
  return (
    <div className="min-w-0">
      <p className={`flex items-center gap-2 text-sm ${TONES[tone].text}`}>
        <span className={`size-2 shrink-0 rounded-full ${TONES[tone].dot}`} aria-hidden />
        {label}
      </p>
      {detail && <p className="mt-0.5 truncate pl-4 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

/** Every payment LUCA makes out of the fund's bank account: refunds and distributions. */
export default function PaymentsOutPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<StatusFilter>("to_pay");
  const [type, setType] = useState<TypeFilter>("all");
  const [closed, setClosed] = useState<Set<number>>(new Set());
  const [opened, setOpened] = useState<Set<number>>(new Set());
  const [recording, setRecording] = useState(false);
  const [paying, setPaying] = useState<{
    event: DistributionEvent;
    line?: DistributionLine;
  } | null>(null);
  const { data: view, isLoading } = useQuery({
    queryKey: ["workflows", user?.id],
    queryFn: () => api<WorkflowView>("/api/v1/workflows"),
  });

  const items = useMemo<Item[]>(() => {
    const refunds: Item[] = (view?.subscriptions ?? [])
      .filter((s) => s.refund)
      .map((s) => ({
        kind: "refund",
        key: `refund-${s.id}`,
        settled: s.refund!.status === "processed",
        at: s.refund!.processed_at ?? "9999",
        subscription: s,
      }));
    const events: Item[] = (view?.distributions ?? []).map((event) => ({
      kind: "event",
      key: `event-${event.id}`,
      settled: eventTotals(event).settled,
      at: event.recordedAt,
      event,
    }));
    return [...refunds, ...events].sort(
      (a, b) => Number(a.settled) - Number(b.settled) || b.at.localeCompare(a.at),
    );
  }, [view]);

  const refundsDue = items.filter(
    (i): i is Extract<Item, { kind: "refund" }> => i.kind === "refund" && !i.settled,
  );
  const refundsPaid = items.filter(
    (i): i is Extract<Item, { kind: "refund" }> => i.kind === "refund" && i.settled,
  );
  const events = items.filter((i): i is Extract<Item, { kind: "event" }> => i.kind === "event");
  const sum = (list: Item[], f: (i: Item) => number) => list.reduce((n, i) => n + f(i), 0);
  const refundAmount = (i: Item) =>
    i.kind === "refund" ? (i.subscription.refund?.amount ?? 0) : 0;
  const eventPart = (part: "owed" | "paidAmount") => (i: Item) =>
    i.kind === "event" ? eventTotals(i.event)[part] : 0;

  const refundsOwed = sum(refundsDue, refundAmount);
  const refundsSettled = sum(refundsPaid, refundAmount);
  const distributionsOwed = sum(events, eventPart("owed"));
  const distributionsSettled = sum(events, eventPart("paidAmount"));
  const dueLines = events.reduce(
    (n, i) => n + i.event.lines.filter((l) => l.status === "due").length,
    0,
  );
  const toPayCount = refundsDue.length + dueLines;
  const paidCount =
    refundsPaid.length + events.reduce((n, i) => n + eventTotals(i.event).paidCount, 0);

  const shown = items.filter(
    (i) =>
      (status === "all" || (status === "paid" ? i.settled : !i.settled)) &&
      (type === "all" || (type === "refunds" ? i.kind === "refund" : i.kind === "event")),
  );
  // A distribution still being paid opens by default; a settled one stays folded away.
  const isOpen = (item: Extract<Item, { kind: "event" }>) =>
    item.settled ? opened.has(item.event.id) : !closed.has(item.event.id);
  const toggle = (item: Extract<Item, { kind: "event" }>) => {
    const set = item.settled ? opened : closed;
    const next = new Set(set);
    if (!next.delete(item.event.id)) next.add(item.event.id);
    (item.settled ? setOpened : setClosed)(next);
  };

  return (
    <div className="w-full space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Payments out</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Money paid from the fund's bank account to investors. Confirm each payment here once the
            bank or Acclime has made it.
          </p>
        </div>
        <Button onClick={() => setRecording(true)}>Record distribution</Button>
      </div>

      <dl className="grid gap-y-6 border-y py-6 sm:grid-cols-2">
        <div className="sm:pr-8">
          <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            To pay
          </dt>
          <dd className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums">
            {money(refundsOwed + distributionsOwed)}
          </dd>
          <dd className="mt-1.5 text-sm text-muted-foreground">
            {toPayCount === 0
              ? "Nothing is waiting to be paid."
              : `${toPayCount} payment${toPayCount === 1 ? "" : "s"}: refunds ${money(refundsOwed)}, distributions ${money(distributionsOwed)}`}
          </dd>
        </div>
        <div className="sm:border-l sm:pl-8">
          <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Paid out
          </dt>
          <dd className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums">
            {money(refundsSettled + distributionsSettled)}
          </dd>
          <dd className="mt-1.5 text-sm text-muted-foreground">
            {paidCount} payment{paidCount === 1 ? "" : "s"}: refunds {money(refundsSettled)},
            distributions {money(distributionsSettled)}
          </dd>
        </div>
      </dl>

      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <Tabs value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <TabsList variant="line" className="justify-start">
              <TabsTrigger value="to_pay" className="flex-none px-3">
                To pay
                {toPayCount > 0 && (
                  <span className="rounded-full bg-amber-100 px-1.5 text-xs text-amber-800">
                    {toPayCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="paid" className="flex-none px-3">
                Paid
              </TabsTrigger>
              <TabsTrigger value="all" className="flex-none px-3">
                All
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex gap-1 pb-1" role="group" aria-label="Type of payment">
            {(
              [
                ["all", "All types"],
                ["refunds", "Refunds"],
                ["distributions", "Distributions"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={type === value}
                onClick={() => setType(value)}
                className={`rounded px-2.5 py-1 text-xs ${type === value ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:bg-muted/60"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <p className="py-12 text-center text-muted-foreground">Loading...</p>
        ) : shown.length === 0 ? (
          <p className="border-y py-12 text-center text-sm text-muted-foreground">
            {status === "to_pay"
              ? "Nothing is waiting to be paid."
              : status === "paid"
                ? "No payment has been made yet."
                : "No payments yet. Record a distribution when a fund pays income, returns capital or a holding is sold."}
          </p>
        ) : (
          <div>
            <div
              className={`hidden gap-x-4 border-b pb-2 text-xs text-muted-foreground lg:grid ${COLUMNS}`}
            >
              <span>Payee</span>
              <span>Payment</span>
              <span className="text-right">Amount</span>
              <span>Status</span>
              <span />
            </div>
            <ul className="divide-y border-b">
              {shown.map((item) =>
                item.kind === "refund" ? (
                  <RefundRow key={item.key} subscription={item.subscription} />
                ) : (
                  <EventRows
                    key={item.key}
                    event={item.event}
                    open={isOpen(item)}
                    onToggle={() => toggle(item)}
                    onPay={(line) => setPaying({ event: item.event, line })}
                  />
                ),
              )}
            </ul>
          </div>
        )}
      </div>

      {recording && view && (
        <RecordDistributionDialog view={view} onClose={() => setRecording(false)} />
      )}
      {paying && <ConfirmPaymentDialog {...paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

function RefundRow({ subscription: s }: { subscription: Refunded }) {
  const refund = s.refund!;
  const tone =
    refund.status === "processed"
      ? "paid"
      : refund.status === "failed"
        ? "failed"
        : refund.status === "processing"
          ? "active"
          : "due";
  const label = { due: "To pay", processing: "In progress", failed: "Failed", processed: "Paid" }[
    refund.status
  ];
  return (
    <li className={`grid items-center gap-x-4 gap-y-1.5 py-4 ${COLUMNS}`}>
      <div className="min-w-0">
        <Link
          to={`/luca/investors/${s.investor_id}`}
          className="block truncate text-sm font-medium hover:underline"
        >
          {s.investor_name}
        </Link>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {s.fund_name} · #{s.id}
        </p>
      </div>
      <div className="min-w-0">
        <p className="text-sm">Refund</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {REFUND_REASONS[s.status] ?? s.status}
        </p>
      </div>
      <p className="text-sm font-semibold tabular-nums lg:text-right">
        {formatPrice(refund.amount)}
      </p>
      <Status
        tone={tone}
        label={label}
        detail={
          refund.status === "processed"
            ? `${refund.processed_at ? day(refund.processed_at) : ""}${refund.reference ? ` · ${refund.reference}` : ""}`
            : refund.status === "processing"
              ? "With Ops and Acclime"
              : "To the investor's account"
        }
      />
      <div className="lg:text-right">
        {refund.status !== "processed" && (
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <Link
                to={`/luca/acclime?record=refund_processed&reference=${encodeURIComponent(s.payment_reference)}`}
              />
            }
          >
            Record as paid
          </Button>
        )}
      </div>
    </li>
  );
}

/** One recorded distribution as a single row, opening to show what each holder is paid. */
function EventRows({
  event,
  open,
  onToggle,
  onPay,
}: {
  event: DistributionEvent;
  open: boolean;
  onToggle: () => void;
  onPay: (line?: DistributionLine) => void;
}) {
  const totals = eventTotals(event);
  const exit = event.kind === "exit_proceeds";
  return (
    <li>
      <div className={`grid items-center gap-x-4 gap-y-1.5 py-4 ${COLUMNS}`}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          <ChevronRightIcon
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{event.fundName}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {totals.count} investor{totals.count === 1 ? "" : "s"}
            </span>
          </span>
        </button>
        <div className="min-w-0">
          <p className="text-sm">
            {distributionKindLabel(event.kind)}
            {exit && event.fullExit && (
              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                Full exit
              </span>
            )}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {formatPriceCents(event.perUnit)} per unit · record date {day(event.recordDate)}
          </p>
        </div>
        <p className="text-sm font-semibold tabular-nums lg:text-right">
          {formatPriceCents(totals.total)}
        </p>
        <div className="min-w-0">
          <Status
            tone={totals.settled ? "paid" : totals.paidCount > 0 ? "active" : "due"}
            label={totals.settled ? "Paid" : totals.paidCount > 0 ? "Part paid" : "To pay"}
            detail={
              totals.settled
                ? `${day(
                    event.lines
                      .map((l) => l.paidAt ?? "")
                      .sort()
                      .at(-1) || event.recordedAt,
                  )} · ${event.lines[0]?.reference ?? ""}`
                : `${totals.paidCount} of ${totals.count} paid`
            }
          />
          {!totals.settled && (
            <div className="mt-1.5 ml-4 h-1 w-24 rounded-full bg-muted" aria-hidden>
              <div
                className="h-1 rounded-full bg-green-600"
                style={{ width: `${(totals.paidCount / Math.max(1, totals.count)) * 100}%` }}
              />
            </div>
          )}
        </div>
        <div className="lg:text-right">
          {!totals.settled && (
            <Button variant="outline" size="sm" onClick={() => onPay()}>
              Confirm all remaining
            </Button>
          )}
        </div>
      </div>
      {open && (
        <ul className="mb-4 divide-y rounded-lg bg-muted/40 px-4">
          {event.lines.map((line) => (
            <li key={line.id} className={`grid items-center gap-x-4 gap-y-1 py-3 ${COLUMNS}`}>
              <div className="min-w-0 lg:pl-6">
                <Link
                  to={`/luca/investors/${line.investorId}`}
                  className="block truncate text-sm hover:underline"
                >
                  {line.investorName}
                </Link>
              </div>
              <p className="text-xs text-muted-foreground tabular-nums">
                {line.units.toLocaleString("en-US")} units
              </p>
              <p className="text-sm tabular-nums lg:text-right">{formatPriceCents(line.amount)}</p>
              <Status
                tone={line.status === "processed" ? "paid" : "due"}
                label={line.status === "processed" ? "Paid" : "To pay"}
                detail={
                  line.status === "processed"
                    ? `${line.paidAt ? day(line.paidAt) : ""}${line.reference ? ` · ${line.reference}` : ""}`
                    : undefined
                }
              />
              <div className="lg:text-right">
                {line.status === "due" && (
                  <Button variant="outline" size="sm" onClick={() => onPay(line)}>
                    Confirm paid
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function useRun(onDone: () => void, success: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: WorkflowCommand) =>
      api<WorkflowView>("/api/v1/workflows", { method: "POST", body: command }),
    onSuccess: () => {
      toast.success(success);
      queryClient.invalidateQueries();
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

function RecordDistributionDialog({ view, onClose }: { view: WorkflowView; onClose: () => void }) {
  const funds = useMemo(
    () =>
      view.funds.filter((f) => view.holdings.some((h) => h.fund_id === f.id && h.state === "held")),
    [view],
  );
  const [fundId, setFundId] = useState(funds[0] ? String(funds[0].id) : "");
  const [kind, setKind] = useState<DistributionKind>("income");
  const [perUnit, setPerUnit] = useState("");
  const [recordDate, setRecordDate] = useState(new Date().toISOString().slice(0, 10));
  const [fullExit, setFullExit] = useState(true);
  const [route, setRoute] = useState("");
  const [note, setNote] = useState("");

  const fund = funds.find((f) => String(f.id) === fundId);
  const amount = Number(perUnit);
  const plan = useMemo(
    () =>
      planDistribution(
        view.holdings
          .filter((h) => h.fund_id === Number(fundId) && h.state === "held")
          .map((h) => ({ holdingId: h.id, investorId: h.investor_id, units: Number(h.units) })),
        Number.isFinite(amount) && amount > 0 ? amount : 0,
      ),
    [view, fundId, amount],
  );
  const total = plan.reduce((n, l) => n + l.amount, 0);
  const committed = view.holdings
    .filter((h) => plan.some((l) => l.holdingId === h.id))
    .reduce((n, h) => n + Number(h.committed_amount), 0);
  const exit = kind === "exit_proceeds";

  const run = useRun(onClose, "Distribution recorded. Confirm each payment once it has been made.");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>Record distribution</DialogTitle>
        <DialogDescription>
          Each holder is paid in proportion to the units they hold. Nothing is paid or shown to
          investors until you confirm each payment.
        </DialogDescription>
        <div className="mt-4 space-y-4">
          <div className={row}>
            <Label>Sub-fund</Label>
            <Select value={fundId} onValueChange={(v) => setFundId(v as string)}>
              <SelectTrigger aria-label="Sub-fund">
                <SelectValue>{fund?.fundName ?? fund?.name}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {funds.map((f) => (
                  <SelectItem key={f.id} value={String(f.id)}>
                    {f.fundName ?? f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className={row}>
            <Label>Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as DistributionKind)}>
              <SelectTrigger aria-label="Type">
                <SelectValue>{distributionKindLabel(kind)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {DISTRIBUTION_KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground sm:pl-[10.25rem]">
            {DISTRIBUTION_KINDS.find((k) => k.value === kind)?.hint}
          </p>
          <div className={row}>
            <Label htmlFor="dist-per-unit">Amount per unit ($)</Label>
            <Input
              id="dist-per-unit"
              inputMode="decimal"
              value={perUnit}
              onChange={(e) => setPerUnit(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className={row}>
            <Label htmlFor="dist-record">Record date</Label>
            <Input
              id="dist-record"
              type="date"
              value={recordDate}
              onChange={(e) => setRecordDate(e.target.value)}
            />
          </div>
          {exit && (
            <>
              <div className={row}>
                <Label htmlFor="dist-route">How it exited</Label>
                <Input
                  id="dist-route"
                  value={route}
                  onChange={(e) => setRoute(e.target.value)}
                  placeholder="For example acquisition or secondary sale"
                />
              </div>
              <label className="flex cursor-pointer items-start gap-2.5 text-sm sm:pl-[10.25rem]">
                <Checkbox
                  checked={fullExit}
                  onChange={(e) => setFullExit(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  This is a full exit
                  <span className="block text-xs text-muted-foreground">
                    The holdings move to Realized in each investor's portfolio once they are paid.
                  </span>
                </span>
              </label>
            </>
          )}
          <div className={row}>
            <Label htmlFor="dist-note">Note</Label>
            <Textarea
              id="dist-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional. For example the period it covers."
            />
          </div>

          <DialogFacts
            rows={[
              { label: "Holders paid", value: plan.length },
              {
                label: "Units",
                value: plan.reduce((n, l) => n + l.units, 0).toLocaleString("en-US"),
              },
              { label: "Total to pay", value: formatPriceCents(total) },
              ...(exit && fullExit && committed > 0
                ? [
                    {
                      label: "Capital these holders invested",
                      value: formatPrice(committed),
                    },
                    {
                      label: "Proceeds against invested capital",
                      value: `${(total / committed).toFixed(2)}x`,
                    },
                  ]
                : []),
            ]}
          />
          {exit && fullExit && committed > 0 && total / committed < 0.5 && (
            <p className="text-sm text-amber-800">
              These proceeds are less than half of what the holders invested. Check the amount per
              unit before recording.
            </p>
          )}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              disabled={run.isPending || !fund || plan.length === 0}
              onClick={() =>
                run.mutate({
                  type: "record-distribution",
                  id: Number(fundId),
                  distribution: {
                    kind,
                    perUnit: amount,
                    recordDate,
                    fullExit: exit && fullExit,
                    exitRoute: exit && route.trim() ? route.trim() : null,
                    note: note.trim() || null,
                  },
                })
              }
            >
              {run.isPending ? "Recording..." : "Record distribution"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmPaymentDialog({
  event,
  line,
  onClose,
}: {
  event: DistributionEvent;
  line?: DistributionLine;
  onClose: () => void;
}) {
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const due = event.lines.filter((l) => l.status === "due" && (!line || l.id === line.id));
  const total = due.reduce((n, l) => n + l.amount, 0);
  const exits = event.kind === "exit_proceeds" && event.fullExit;
  const run = useRun(
    onClose,
    exits
      ? "Payment confirmed. The holding now shows as Realized for the investor."
      : "Payment confirmed. The investor's holding has been updated.",
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Confirm payment</DialogTitle>
        <DialogDescription>
          {distributionKindLabel(event.kind)} · {event.fundName}
        </DialogDescription>
        <div className="mt-4 space-y-4">
          <DialogFacts
            rows={[
              {
                label: line ? "Investor" : "Investors",
                value: line ? line.investorName : due.length,
              },
              { label: "Amount", value: formatPriceCents(total) },
              { label: "Paid to", value: "Each investor's own bank account" },
            ]}
          />
          <div className={row}>
            <Label htmlFor="pay-ref">Bank reference</Label>
            <Input
              id="pay-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="From the bank or Acclime's advice"
            />
          </div>
          <div className={row}>
            <Label htmlFor="pay-date">Date paid</Label>
            <Input
              id="pay-date"
              type="date"
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {exits
              ? "Confirming adds the payment to the investor's holding, moves it to Realized and tells them by message."
              : "Confirming adds the payment to the investor's holding and tells them by message."}
          </p>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              disabled={run.isPending || !reference.trim()}
              onClick={() =>
                run.mutate({
                  type: "confirm-distribution",
                  id: event.id,
                  target: line?.id,
                  text: reference.trim(),
                  due: paidOn,
                })
              }
            >
              {run.isPending ? "Confirming..." : "Confirm payment"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
