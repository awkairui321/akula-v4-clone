import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, ChevronRightIcon, MinusIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { formatPricePrecise, formatPriceCents } from "@/lib/currency";
import {
  ACCLIME_MESSAGE_TYPES,
  ACCLIME_STATUS_LABELS,
  acclimeTypeLabel,
  type AcclimeInbound,
  type AcclimeMessage,
  type AcclimeMessageType,
  type AcclimeStatus,
} from "@/lib/acclime";
import type { WorkflowView } from "@/lib/workflow-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Sub = WorkflowView["subscriptions"][number];

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const STATUS_STYLE: Record<AcclimeStatus, string> = {
  applied: "text-green-700",
  needs_attention: "text-amber-700",
  duplicate: "text-muted-foreground",
};

const lastMonthEnd = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)).toISOString().slice(0, 10);
};

/** The subscriptions a message of this kind can be about. */
function candidates(type: AcclimeMessageType, subs: Sub[], view: WorkflowView): Sub[] {
  const due = (s: Sub) =>
    view.returns.some((r) => r.subscriptionId === s.id && r.status !== "confirmed");
  switch (type) {
    case "funds_confirmed":
      return subs.filter((s) =>
        [
          "approved",
          "awaiting_funds",
          "payment_unmatched",
          "reconciliation",
          "allocation_pending",
        ].includes(s.status),
      );
    case "acceptance":
      return subs.filter((s) => s.status === "allocated" && !s.holdingId);
    case "refund_processed":
      return subs.filter(due);
    default:
      return subs.filter(
        (s) => !["funds_returned", "cancelled", "rejected"].includes(s.status) && !s.holdingId,
      );
  }
}

const payableOf = (s: Sub) => Number(s.amount) + Number(s.subscription_fee);
const dueFor = (s: Sub, view: WorkflowView) =>
  view.returns
    .filter((r) => r.subscriptionId === s.id && r.status !== "confirmed")
    .reduce((n, r) => n + r.amount, 0);

/** What Acclime is most likely reporting for this subscription, so the form starts filled in. */
function prefill(type: AcclimeMessageType, s: Sub | undefined, view: WorkflowView) {
  if (!s) return { amount: "", units: "", price: "" };
  return {
    amount:
      type === "funds_confirmed"
        ? payableOf(s).toFixed(2)
        : type === "refund_processed"
          ? dueFor(s, view).toFixed(2)
          : "",
    units: type === "acceptance" ? String(Number(s.amount) / s.allocationPrice) : "",
    price: type === "acceptance" ? String(s.allocationPrice) : "",
  };
}
/* ─── Record a message from Acclime ─── */

function RecordDialog({
  view,
  initial,
  onClose,
}: {
  view: WorkflowView;
  initial: { type: AcclimeMessageType; reference?: string; retry?: AcclimeMessage };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const retry = initial.retry;
  const [type, setType] = useState<AcclimeMessageType>(initial.type);
  const [reference, setReference] = useState(
    initial.reference ?? String(retry?.payload.payment_reference ?? ""),
  );
  const start = prefill(
    initial.type,
    view.subscriptions.find((s) => s.payment_reference === (initial.reference ?? "")),
    view,
  );
  const [amount, setAmount] = useState(
    retry?.payload.amount ? String(retry.payload.amount) : start.amount,
  );
  const [bank, setBank] = useState(String(retry?.payload.bank_reference ?? ""));
  const [on, setOn] = useState(
    String(
      retry?.payload.received_on ?? retry?.payload.processed_on ?? retry?.payload.issued_on ?? "",
    ).slice(0, 10),
  );
  const [result, setResult] = useState<"pass" | "fail" | "more_documents">(
    (retry?.payload.result as "pass" | "fail" | "more_documents") ?? "pass",
  );
  const [note, setNote] = useState(String(retry?.payload.note ?? ""));
  const [units, setUnits] = useState(
    retry?.payload.units ? String(retry.payload.units) : start.units,
  );
  const [price, setPrice] = useState(
    retry?.payload.price ? String(retry.payload.price) : start.price,
  );
  const [fundId, setFundId] = useState(String(retry?.payload.fund_id ?? view.funds[0]?.id ?? ""));
  const [asOf, setAsOf] = useState(String(retry?.payload.as_of ?? lastMonthEnd()).slice(0, 10));
  const [nav, setNav] = useState(
    retry?.payload.nav_per_unit ? String(retry.payload.nav_per_unit) : "",
  );

  const subs = candidates(type, view.subscriptions, view);
  const sub = view.subscriptions.find((s) => s.payment_reference === reference);

  // Choosing a subscription fills in what Acclime is most likely to be reporting.
  const choose = (value: string) => {
    setReference(value);
    const filled = prefill(
      type,
      view.subscriptions.find((x) => x.payment_reference === value),
      view,
    );
    setAmount(filled.amount);
    setUnits(filled.units);
    setPrice(filled.price);
  };

  const send = useMutation({
    mutationFn: (body: AcclimeInbound) =>
      api<{ message: AcclimeMessage }>("/api/v1/admin/acclime/messages", { method: "POST", body }),
    onSuccess: ({ message }) => {
      queryClient.invalidateQueries();
      (message.status === "applied" ? toast.success : toast.warning)(message.outcome);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    const payload: Record<string, unknown> =
      type === "nav"
        ? { fund_id: Number(fundId), as_of: asOf, nav_per_unit: Number(nav) }
        : { payment_reference: reference };
    if (type === "funds_confirmed")
      Object.assign(payload, {
        amount: Number(amount),
        bank_reference: bank,
        received_on: on || undefined,
      });
    if (type === "refund_processed")
      Object.assign(payload, {
        amount: Number(amount),
        bank_reference: bank,
        processed_on: on || undefined,
      });
    if (type === "cdd_result") Object.assign(payload, { result, note: note.trim() || undefined });
    if (type === "acceptance")
      Object.assign(payload, {
        units: Number(units),
        price: Number(price),
        issued_on: on || undefined,
      });
    send.mutate({ type, channel: "manual", external_id: retry?.external_id, payload });
  };

  const ready =
    type === "nav"
      ? Boolean(fundId && asOf && Number(nav) > 0)
      : Boolean(reference) &&
        (type === "funds_confirmed" || type === "refund_processed"
          ? Number(amount) > 0 && bank.trim() !== ""
          : type === "acceptance"
            ? Number(units) > 0 && Number(price) > 0
            : true);

  const row = "grid gap-1.5 sm:grid-cols-[11rem_1fr] sm:items-center sm:gap-4";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogTitle>
          {retry ? "Try this message again" : "Record a message from Acclime"}
        </DialogTitle>
        <DialogDescription>
          For what Acclime sends by email. It is applied exactly as if it had arrived on the feed.
        </DialogDescription>
        <div className="mt-4 space-y-4">
          <div className={row}>
            <Label>Message</Label>
            <Select
              value={type}
              onValueChange={(v) => {
                setType(v as AcclimeMessageType);
                setReference("");
              }}
              disabled={Boolean(retry)}
            >
              <SelectTrigger aria-label="Message type">
                <SelectValue>{acclimeTypeLabel(type)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ACCLIME_MESSAGE_TYPES.map((t) => (
                  <SelectItem key={t.type} value={t.type}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            {ACCLIME_MESSAGE_TYPES.find((t) => t.type === type)?.effect}
          </p>

          {type === "nav" ? (
            <>
              <div className={row}>
                <Label>Sub-fund</Label>
                <Select value={fundId} onValueChange={(v) => setFundId(v as string)}>
                  <SelectTrigger aria-label="Sub-fund">
                    <SelectValue>
                      {view.funds.find((f) => String(f.id) === fundId)?.fundName ??
                        view.funds.find((f) => String(f.id) === fundId)?.name}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {view.funds.map((f) => (
                      <SelectItem key={f.id} value={String(f.id)}>
                        {f.fundName ?? f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className={row}>
                <Label htmlFor="acc-asof">Month end</Label>
                <Input
                  id="acc-asof"
                  type="date"
                  value={asOf}
                  onChange={(e) => setAsOf(e.target.value)}
                />
              </div>
              <div className={row}>
                <Label htmlFor="acc-nav">NAV per unit ($)</Label>
                <Input
                  id="acc-nav"
                  inputMode="decimal"
                  value={nav}
                  onChange={(e) => setNav(e.target.value)}
                />
              </div>
            </>
          ) : (
            <>
              <div className={row}>
                <Label>Subscription</Label>
                <Select value={reference} onValueChange={(v) => choose(v as string)}>
                  <SelectTrigger aria-label="Subscription">
                    <SelectValue>
                      {sub
                        ? `${sub.investor_name} · ${sub.payment_reference}`
                        : "Choose a subscription"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {subs.length === 0 && (
                      <SelectItem value="" disabled>
                        None at this stage
                      </SelectItem>
                    )}
                    {subs.map((s) => (
                      <SelectItem key={s.id} value={s.payment_reference}>
                        {s.investor_name} · {s.payment_reference} ·{" "}
                        {formatPricePrecise(payableOf(s))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(type === "funds_confirmed" || type === "refund_processed") && (
                <>
                  <div className={row}>
                    <Label htmlFor="acc-amount">Amount ($)</Label>
                    <Input
                      id="acc-amount"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </div>
                  <div className={row}>
                    <Label htmlFor="acc-bank">
                      {type === "funds_confirmed" ? "Receipt reference" : "Refund reference"}
                    </Label>
                    <Input
                      id="acc-bank"
                      value={bank}
                      onChange={(e) => setBank(e.target.value)}
                      placeholder="Acclime's or the bank's reference"
                    />
                  </div>
                </>
              )}
              {type === "cdd_result" && (
                <>
                  <div className={row}>
                    <Label>Result</Label>
                    <Select value={result} onValueChange={(v) => setResult(v as typeof result)}>
                      <SelectTrigger aria-label="Result">
                        <SelectValue>
                          {
                            {
                              pass: "Cleared",
                              fail: "Failed",
                              more_documents: "More documents needed",
                            }[result]
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pass">Cleared</SelectItem>
                        <SelectItem value="fail">Failed</SelectItem>
                        <SelectItem value="more_documents">More documents needed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className={row}>
                    <Label htmlFor="acc-note">Note</Label>
                    <Textarea
                      id="acc-note"
                      rows={2}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="What Acclime said, or what it needs"
                    />
                  </div>
                </>
              )}
              {type === "acceptance" && (
                <>
                  <div className={row}>
                    <Label htmlFor="acc-units">Units issued</Label>
                    <Input
                      id="acc-units"
                      inputMode="decimal"
                      value={units}
                      onChange={(e) => setUnits(e.target.value)}
                    />
                  </div>
                  <div className={row}>
                    <Label htmlFor="acc-price">Unit price ($)</Label>
                    <Input
                      id="acc-price"
                      inputMode="decimal"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                    />
                  </div>
                </>
              )}
              {type !== "cdd_result" && (
                <div className={row}>
                  <Label htmlFor="acc-on">Date</Label>
                  <Input
                    id="acc-on"
                    type="date"
                    value={on}
                    onChange={(e) => setOn(e.target.value)}
                  />
                </div>
              )}
            </>
          )}

          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button className="flex-1" disabled={!ready || send.isPending} onClick={submit}>
              {retry ? "Apply again" : "Record message"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── The page ─── */

type Tab = "messages" | "packs" | "nav";

export default function AcclimePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>("messages");
  const [filter, setFilter] = useState<"all" | AcclimeStatus>("all");
  const [recording, setRecording] = useState<{
    type: AcclimeMessageType;
    reference?: string;
    retry?: AcclimeMessage;
  } | null>(() => {
    const type = params.get("record") as AcclimeMessageType | null;
    return type && ACCLIME_MESSAGE_TYPES.some((t) => t.type === type)
      ? { type, reference: params.get("reference") ?? undefined }
      : null;
  });

  const { data: view } = useQuery({
    queryKey: ["workflows", user?.id],
    queryFn: () => api<WorkflowView>("/api/v1/workflows"),
  });

  const messages = useMemo(
    () => [...(view?.acclimeMessages ?? [])].sort((a, b) => b.id - a.id),
    [view],
  );
  const counts = {
    all: messages.length,
    needs_attention: messages.filter((m) => m.status === "needs_attention").length,
    applied: messages.filter((m) => m.status === "applied").length,
    duplicate: messages.filter((m) => m.status === "duplicate").length,
  };
  const shown = messages.filter((m) => filter === "all" || m.status === filter);
  const subOf = (id: number | null) => view?.subscriptions.find((s) => s.id === id);

  const close = () => {
    setRecording(null);
    if (params.has("record")) setParams({}, { replace: true });
  };

  // The demo feed: a sample of what Acclime would send, built from what is waiting in the demo.
  const feed = useMutation({
    mutationFn: (body: AcclimeInbound) =>
      api<{ message: AcclimeMessage }>("/api/v1/admin/acclime/messages", { method: "POST", body }),
    onSuccess: ({ message }) => {
      queryClient.invalidateQueries();
      (message.status === "applied" ? toast.success : toast.warning)(message.outcome);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const sendSample = (type: AcclimeMessageType) => {
    if (!view) return;
    const pick = candidates(type, view.subscriptions, view)[0];
    const external_id = `ACC-DEMO-${Date.now()}`;
    let payload: Record<string, unknown> | null = null;
    if (type === "nav") {
      const holding = view.holdings[0];
      if (holding)
        payload = {
          fund_id: holding.fund_id,
          as_of: lastMonthEnd(),
          nav_per_unit:
            Number((Number(holding.current_nav) / Number(holding.units)).toFixed(2)) * 1.02,
        };
    } else if (pick) {
      const ref = pick.payment_reference;
      if (type === "funds_confirmed")
        payload = {
          payment_reference: ref,
          amount: payableOf(pick),
          bank_reference: `ACC-${external_id.slice(-6)}`,
        };
      if (type === "cdd_result") payload = { payment_reference: ref, result: "pass" };
      if (type === "acceptance")
        payload = {
          payment_reference: ref,
          units: Number(pick.amount) / pick.allocationPrice,
          price: pick.allocationPrice,
        };
      if (type === "refund_processed")
        payload = {
          payment_reference: ref,
          amount: dueFor(pick, view),
          bank_reference: `ACC-${external_id.slice(-6)}`,
        };
    }
    if (!payload) {
      toast.info(
        `Nothing in the demo is waiting for a ${acclimeTypeLabel(type).toLowerCase()} message.`,
      );
      return;
    }
    feed.mutate({ type, channel: "feed", external_id, payload });
  };

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "messages", label: "Messages", count: messages.length },
    { key: "packs", label: "Packs sent", count: view?.packs.length ?? 0 },
    { key: "nav", label: "Monthly NAV", count: view?.navRecords.length ?? 0 },
  ];

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Acclime</h1>
          <p className="text-muted-foreground">
            {counts.needs_attention === 0
              ? "What the fund administrator has told LUCA, and what has been sent to it."
              : `${counts.needs_attention} message${counts.needs_attention === 1 ? "" : "s"} from Acclime need${counts.needs_attention === 1 ? "s" : ""} your attention.`}
          </p>
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="sm" disabled={feed.isPending} />}
            >
              Send a demo message
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                A sample of Acclime's feed. Not connected to Acclime.
              </p>
              {ACCLIME_MESSAGE_TYPES.map((t) => (
                <DropdownMenuItem key={t.type} onClick={() => sendSample(t.type)}>
                  {t.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={() => setRecording({ type: "funds_confirmed" })}>
            <PlusIcon className="size-4" />
            Record a message
          </Button>
        </div>
      </div>

      <div role="tablist" className="flex gap-6 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 border-b-2 pb-3 text-sm ${tab === t.key ? "border-primary font-medium" : "border-transparent text-muted-foreground"}`}
          >
            {t.label}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {tab === "messages" && (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-4 text-sm">
            {(
              [
                ["all", "All"],
                ["needs_attention", "Needs attention"],
                ["applied", "Applied"],
                ["duplicate", "Already received"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={
                  filter === key
                    ? "font-medium underline underline-offset-4"
                    : "text-muted-foreground hover:text-foreground"
                }
              >
                {label} <span className="tabular-nums">{counts[key]}</span>
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="border-y py-12 text-center text-sm text-muted-foreground">
              {messages.length === 0
                ? "Nothing has been received from Acclime yet."
                : "No messages match this filter."}
            </p>
          ) : (
            <ul className="divide-y border-y">
              {shown.map((m) => {
                const sub = subOf(m.subscription_id);
                const fund = view?.funds.find((f) => f.id === m.fund_id);
                return (
                  <li
                    key={m.id}
                    className="grid items-start gap-x-4 gap-y-1 py-3.5 lg:grid-cols-[8rem_11rem_minmax(0,1fr)_minmax(0,1.6fr)_6rem]"
                  >
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {stamp(m.received_at)}
                    </p>
                    <p className="text-sm font-medium">{acclimeTypeLabel(m.type)}</p>
                    <div className="min-w-0 text-sm">
                      {sub ? (
                        <>
                          <Link
                            to={`/luca/investors/${sub.investor_id}`}
                            className="block truncate hover:underline"
                          >
                            {sub.investor_name}
                          </Link>
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            {sub.payment_reference}
                          </p>
                        </>
                      ) : fund ? (
                        <p className="truncate">{fund.fundName ?? fund.name}</p>
                      ) : (
                        <p className="text-muted-foreground">Not matched</p>
                      )}
                    </div>
                    <div className="min-w-0 text-sm">
                      <p className={`font-medium ${STATUS_STYLE[m.status]}`}>
                        {ACCLIME_STATUS_LABELS[m.status]}
                      </p>
                      <p className="text-xs leading-5 text-muted-foreground">{m.outcome}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {m.channel === "feed" ? "Feed" : `Entered by ${m.entered_by ?? "LUCA"}`} ·{" "}
                        {m.external_id}
                      </p>
                    </div>
                    <div className="lg:text-right">
                      {m.status === "needs_attention" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRecording({ type: m.type, retry: m })}
                        >
                          Try again
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {tab === "packs" && (
        <section className="space-y-3">
          <p className="text-sm text-muted-foreground">
            What went to Acclime and to LUCA when each investor submitted: the signed agreement, KYC
            and CDD papers, and the payment reference. This is a record of the pack; nothing is
            transmitted in this demo.
          </p>
          {(view?.packs.length ?? 0) === 0 ? (
            <p className="border-y py-12 text-center text-sm text-muted-foreground">
              No subscription has been submitted yet.
            </p>
          ) : (
            <ul className="divide-y border-y">
              {[...(view?.packs ?? [])].reverse().map((pack) => {
                const sub = subOf(pack.subscriptionId);
                return (
                  <li key={pack.id}>
                    <details className="group/pack py-3.5">
                      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1">
                        <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-open/pack:rotate-90" />
                        <span className="text-sm font-medium">
                          {sub?.investor_name ?? `Subscription #${pack.subscriptionId}`}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {pack.paymentReference}
                        </span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          Sent to {pack.recipients.map((r) => r.name).join(" and ")} ·{" "}
                          {day(pack.createdAt)}
                        </span>
                      </summary>
                      <ul className="mt-3 space-y-2 pl-8 text-sm">
                        {pack.items.map((item) => (
                          <li key={item.kind} className="flex items-start gap-2">
                            {item.available ? (
                              <CheckIcon className="mt-0.5 size-4 shrink-0 text-green-700" />
                            ) : (
                              <MinusIcon className="mt-0.5 size-4 shrink-0 text-amber-700" />
                            )}
                            <span>
                              <span className="font-medium">{item.label}</span>
                              <span className="block text-xs text-muted-foreground">
                                {item.detail}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {tab === "nav" && (
        <section className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Acclime strikes a NAV per unit each month. When it is applied, every issued holding in
            the sub-fund takes its new value and investors see it on their dashboard.
          </p>
          {(view?.navRecords.length ?? 0) === 0 ? (
            <p className="border-y py-12 text-center text-sm text-muted-foreground">
              No monthly NAV has been received yet.
            </p>
          ) : (
            <ul className="divide-y border-y text-sm">
              {[...(view?.navRecords ?? [])].reverse().map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3"
                >
                  <span className="font-medium">
                    {view?.funds.find((f) => f.id === r.fundId)?.fundName ?? `Fund #${r.fundId}`}
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(r.asOf).toLocaleDateString("en-GB", {
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    })}
                  </span>
                  <span className="tabular-nums">{formatPriceCents(r.navPerUnit)} per unit</span>
                  <span className="text-muted-foreground">
                    {r.holdingsUpdated} holding{r.holdingsUpdated === 1 ? "" : "s"} updated
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {recording && view && <RecordDialog view={view} initial={recording} onClose={close} />}
    </div>
  );
}
