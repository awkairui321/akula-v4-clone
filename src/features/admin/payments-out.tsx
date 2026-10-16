import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { formatPriceCents, formatPrice } from "@/lib/currency";
import { REFUND_STATUS_LABELS } from "@/lib/acclime";
import {
  DISTRIBUTION_KINDS,
  DISTRIBUTION_STATUS_LABELS,
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
  not_allocated: "Not accepted",
  cancelled: "Cancelled",
  rejected: "Not accepted",
  funds_returned: "Not accepted",
  allocated: "Funds in excess of the allocation",
};

const row = "grid gap-1.5 sm:grid-cols-[9rem_1fr] sm:items-center sm:gap-4";
const COLUMNS = "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_8rem_minmax(0,1.3fr)_9rem]";

type Tab = "all" | "refunds" | "distributions";

/** Every payment LUCA makes out of the fund's bank account: refunds and distributions. */
export default function PaymentsOutPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("all");
  const [recording, setRecording] = useState(false);
  const [paying, setPaying] = useState<{
    event: DistributionEvent;
    line?: DistributionLine;
  } | null>(null);
  const { data: view, isLoading } = useQuery({
    queryKey: ["workflows", user?.id],
    queryFn: () => api<WorkflowView>("/api/v1/workflows"),
  });

  const refunds = useMemo(
    () =>
      (view?.subscriptions ?? [])
        .filter((s) => s.refund)
        .sort((a, b) => {
          const settled = (x: typeof a) => (x.refund?.status === "processed" ? 1 : 0);
          return (
            settled(a) - settled(b) ||
            (b.refund?.processed_at ?? "").localeCompare(a.refund?.processed_at ?? "") ||
            b.id - a.id
          );
        }),
    [view],
  );
  const events = useMemo(
    () =>
      [...(view?.distributions ?? [])].sort(
        (a, b) => Number(eventTotals(a).settled) - Number(eventTotals(b).settled) || b.id - a.id,
      ),
    [view],
  );

  const refundsDue = refunds.filter((s) => s.refund?.status !== "processed");
  const refundsDueTotal = refundsDue.reduce((n, s) => n + (s.refund?.amount ?? 0), 0);
  const distributionsOwed = events.reduce((n, e) => n + eventTotals(e).owed, 0);
  const distributionsDueCount = events.reduce(
    (n, e) => n + e.lines.filter((l) => l.status === "due").length,
    0,
  );
  const paidTotal =
    refunds
      .filter((s) => s.refund?.status === "processed")
      .reduce((n, s) => n + (s.refund?.amount ?? 0), 0) +
    events.reduce((n, e) => n + eventTotals(e).paidAmount, 0);
  const waitingCount = refundsDue.length + distributionsDueCount;
  const waitingTotal = refundsDueTotal + distributionsOwed;

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Payments out</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Everything paid from the fund's bank account to investors: refunds of subscriptions that
            were not accepted, and distributions, including the proceeds of an exit. Each payment is
            confirmed here once the bank or Acclime has made it.
          </p>
        </div>
        <Button onClick={() => setRecording(true)}>Record distribution</Button>
      </div>

      <dl className="grid gap-x-10 gap-y-4 border-y py-5 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Waiting to be paid</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">
            {formatPriceCents(waitingTotal)}
          </dd>
          <dd className="mt-0.5 text-xs text-muted-foreground">
            {waitingCount === 0
              ? "Nothing outstanding"
              : `${waitingCount} payment${waitingCount === 1 ? "" : "s"}`}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Of which</dt>
          <dd className="mt-1 space-y-0.5 text-sm tabular-nums">
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Refunds</span>
              <span className="font-medium">{formatPrice(refundsDueTotal)}</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Distributions</span>
              <span className="font-medium">{formatPriceCents(distributionsOwed)}</span>
            </p>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Paid out to date</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">
            {formatPriceCents(paidTotal)}
          </dd>
          <dd className="mt-0.5 text-xs text-muted-foreground">Refunds and distributions</dd>
        </div>
      </dl>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList variant="line" className="w-full justify-start border-b">
          <TabsTrigger value="all" className="flex-none">
            All
          </TabsTrigger>
          <TabsTrigger value="refunds" className="flex-none">
            Refunds
            {refundsDue.length > 0 && (
              <span className="text-xs text-muted-foreground">{refundsDue.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="distributions" className="flex-none">
            Distributions
            {distributionsDueCount > 0 && (
              <span className="text-xs text-muted-foreground">{distributionsDueCount}</span>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <p className="py-12 text-center text-muted-foreground">Loading...</p>
      ) : (
        <div className="space-y-8">
          {tab !== "distributions" && (
            <section aria-label="Refunds" className="space-y-2">
              {tab === "all" && <h2 className="text-sm font-semibold">Refunds</h2>}
              {refunds.length === 0 ? (
                <p className="border-y py-8 text-center text-sm text-muted-foreground">
                  No subscription has been refunded or is due a refund.
                </p>
              ) : (
                <ul className="divide-y border-y">
                  {refunds.map((s) => (
                    <RefundRow key={s.id} subscription={s} />
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab !== "refunds" && (
            <section aria-label="Distributions" className="space-y-2">
              {tab === "all" && <h2 className="text-sm font-semibold">Distributions</h2>}
              {events.length === 0 ? (
                <p className="border-y py-8 text-center text-sm text-muted-foreground">
                  No distribution has been recorded. Record one when a fund pays income or returns
                  capital, or when a holding is sold.
                </p>
              ) : (
                <div className="space-y-6">
                  {events.map((event) => (
                    <EventBlock
                      key={event.id}
                      event={event}
                      onPay={(line) => setPaying({ event, line })}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {recording && view && (
        <RecordDistributionDialog view={view} onClose={() => setRecording(false)} />
      )}
      {paying && <ConfirmPaymentDialog {...paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

function RefundRow({ subscription: s }: { subscription: WorkflowView["subscriptions"][number] }) {
  const refund = s.refund!;
  return (
    <li className={`grid items-center gap-x-4 gap-y-1 py-3.5 ${COLUMNS}`}>
      <div className="min-w-0">
        <Link
          to={`/luca/investors/${s.investor_id}`}
          className="block truncate text-sm font-medium hover:underline"
        >
          {s.investor_name}
        </Link>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {s.fund_name} · #{s.id} · <span className="font-mono">{s.payment_reference}</span>
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        Refund · {REFUND_REASONS[s.status] ?? s.status}
      </p>
      <p className="text-sm font-semibold tabular-nums lg:text-right">
        {formatPrice(refund.amount)}
      </p>
      <div>
        <p
          className={`text-sm ${refund.status === "processed" ? "text-green-700" : refund.status === "failed" ? "text-destructive" : "text-amber-700"}`}
        >
          {REFUND_STATUS_LABELS[refund.status]}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {refund.status === "processed"
            ? `${refund.confirmed_by === "acclime" ? "Confirmed by Acclime" : "Confirmed by Ops"}${refund.processed_at ? ` · ${day(refund.processed_at)}` : ""}${refund.reference ? ` · ${refund.reference}` : ""}`
            : refund.status === "processing"
              ? "With Ops and Acclime"
              : "Paid back to the investor's own account"}
        </p>
      </div>
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

/** One recorded distribution: what it is, the total, and what each holder is owed. */
function EventBlock({
  event,
  onPay,
}: {
  event: DistributionEvent;
  onPay: (line?: DistributionLine) => void;
}) {
  const totals = eventTotals(event);
  return (
    <article className="space-y-1">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">
            {distributionKindLabel(event.kind)} · {event.fundName}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatPriceCents(event.perUnit)} per unit · record date {day(event.recordDate)}
            {event.kind === "exit_proceeds" &&
              (event.fullExit
                ? ` · full exit${event.exitRoute ? ` (${event.exitRoute})` : ""}, closes the holdings`
                : " · partial sale, holdings stay open")}
            {event.note ? ` · ${event.note}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-right text-sm tabular-nums">
            <span className="font-semibold">{formatPriceCents(totals.total)}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {totals.paidCount} of {totals.count} paid
            </span>
          </p>
          {!totals.settled && (
            <Button variant="outline" size="sm" onClick={() => onPay()}>
              Confirm all remaining
            </Button>
          )}
        </div>
      </header>
      <ul className="divide-y border-y">
        {event.lines.map((line) => (
          <li key={line.id} className={`grid items-center gap-x-4 gap-y-1 py-3 ${COLUMNS}`}>
            <div className="min-w-0">
              <Link
                to={`/luca/investors/${line.investorId}`}
                className="block truncate text-sm font-medium hover:underline"
              >
                {line.investorName}
              </Link>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                Holding #{line.holdingId}
              </p>
            </div>
            <p className="text-sm text-muted-foreground tabular-nums">
              {line.units.toLocaleString("en-US")} units
            </p>
            <p className="text-sm font-semibold tabular-nums lg:text-right">
              {formatPriceCents(line.amount)}
            </p>
            <div>
              <p
                className={`text-sm ${line.status === "processed" ? "text-green-700" : "text-amber-700"}`}
              >
                {DISTRIBUTION_STATUS_LABELS[line.status]}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {line.status === "processed"
                  ? `${line.paidAt ? day(line.paidAt) : ""}${line.reference ? ` · ${line.reference}` : ""}`
                  : "To the investor's own bank account"}
              </p>
            </div>
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
    </article>
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
