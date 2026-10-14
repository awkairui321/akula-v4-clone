/**
 * What Acclime tells LUCA, and the pack LUCA sends it.
 *
 * Every message goes through `receiveAcclime`, whether it arrived on the feed or the Fund Manager
 * keyed it in from an email, so the two apply identically. A message is recorded and applied once:
 * the same Acclime id twice is shown as already received. Whatever Ops has already done is never
 * redone, and a message that does not fit what LUCA has recorded is kept, flagged, and applied to
 * nothing. Acclime's messages never make LUCA's two decisions (funds verified, allocation
 * confirmed): they only supply the facts those decisions rest on.
 */
import {
  ACCLIME_MESSAGE_TYPES,
  acclimeTypeLabel,
  type AcclimeInbound,
  type AcclimeMessage,
  type AcclimeStatus,
  type SubscriptionPack,
} from "../lib/acclime";
import * as db from "./db";
import {
  workflow,
  now,
  id,
  round,
  matched,
  recordAudit,
  transaction,
  persist,
  investmentBlockers,
  reconciliationBlockers,
} from "./workflow";

type Outcome = { status: AcclimeStatus; outcome: string };
const applied = (outcome: string): Outcome => ({ status: "applied", outcome });
const attention = (outcome: string): Outcome => ({ status: "needs_attention", outcome });
const duplicate = (outcome: string): Outcome => ({ status: "duplicate", outcome });

const usd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ---------------------------------------------------------------------------
// Reading a payload: anything malformed is refused outright, nothing is recorded.
// ---------------------------------------------------------------------------

function text(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required.`);
  return value.trim();
}
function positive(value: unknown, name: string): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0)
    throw new Error(`${name} must be a positive number.`);
  return n;
}
function dateOf(value: unknown, name: string): string {
  if (value === undefined || value === null || value === "") return now();
  const t = typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(t)) throw new Error(`${name} is not a valid date.`);
  return new Date(t).toISOString();
}

const bySubscriptionReference = (reference: string) =>
  db.subscriptions.find((s) => s.payment_reference.toLowerCase() === reference.toLowerCase());

/** Tells the investor in the platform, and puts it on their client timeline for LUCA to see. */
function tell(s: db.MockSubscription, subject: string, body: string, timeline: string) {
  db.sendInvestorMessage(s.investor_id, subject, body, "allocation");
  db.recordClientEvent(s.investor_id, "milestone", timeline, "Acclime", ["luca", "investor"]);
}

// ---------------------------------------------------------------------------
// The five kinds of message
// ---------------------------------------------------------------------------

function fundsConfirmed(m: AcclimeMessage, p: Record<string, unknown>): Outcome {
  const reference = text(p.payment_reference, "Payment reference");
  const amount = round(positive(p.amount, "Amount"));
  const bankReference = text(p.bank_reference, "Bank reference");
  const currency = typeof p.currency === "string" && p.currency ? p.currency.toUpperCase() : "USD";
  const at = dateOf(p.received_on, "Received on");
  const s = bySubscriptionReference(reference);
  if (!s) return attention(`No subscription has the payment reference ${reference}.`);
  m.subscription_id = s.id;
  m.fund_id = s.fund_id;
  if (currency !== s.currency)
    return attention(`Acclime reported ${currency}; this subscription is in ${s.currency}.`);
  const used = workflow.receipts.find((r) => r.reference === bankReference && !r.supersededBy);
  if (used)
    return used.subscriptionId === s.id
      ? duplicate(`Receipt ${bankReference} is already recorded against this subscription.`)
      : attention(`Receipt ${bankReference} is already recorded against another subscription.`);
  const expecting = [
    "approved",
    "awaiting_funds",
    "payment_unmatched",
    "reconciliation",
    "allocation_pending",
  ];
  if (!expecting.includes(s.status))
    return attention(`This subscription is not expecting funds (it is ${s.status}).`);

  workflow.receipts.push({
    id: id(),
    subscriptionId: s.id,
    amount,
    currency,
    reference: bankReference,
    source: "acclime",
    acclimeMessageId: m.id,
    matched: true,
    at,
  });
  s.funds_received_at ??= at;
  // Funds that arrive after LUCA verified them have to be verified again.
  if (s.status === "allocation_pending") s.funds_verified = null;
  s.status = "reconciliation";
  s.owner = db.ownerFor(s.status);
  s.next_action = db.nextActionFor(s.status);

  const payable = round(Number(s.amount) + Number(s.subscription_fee));
  const received = matched(s.id);
  tell(
    s,
    `Your ${s.asset_name} funds have been received`,
    `The fund administrator has confirmed receipt of ${usd(amount)} for your subscription in ${s.fund_name}.`,
    `Acclime confirmed receipt of ${usd(amount)} for the ${s.asset_name} subscription.`,
  );
  if (received + 0.005 < payable)
    return attention(
      `Recorded ${usd(amount)}. Short of the ${usd(payable)} payable by ${usd(round(payable - received))}.`,
    );
  if (received > payable + 0.005)
    return attention(
      `Recorded ${usd(amount)}. ${usd(round(received - payable))} more than the ${usd(payable)} payable.`,
    );
  const blockers = reconciliationBlockers(s);
  if (blockers.length)
    return attention(
      `Funds are in full (${usd(received)}) but reconciliation is blocked: ${blockers.join(" ")}`,
    );
  s.status = "allocation_pending";
  s.owner = db.ownerFor(s.status);
  s.next_action = db.nextActionFor(s.status);
  return applied(`Recorded ${usd(amount)}. Funds are in full: ready for you to verify.`);
}

function cddResult(m: AcclimeMessage, p: Record<string, unknown>): Outcome {
  const reference = text(p.payment_reference, "Payment reference");
  const result = p.result;
  if (result !== "pass" && result !== "fail" && result !== "more_documents")
    throw new Error("The result must be pass, fail or more_documents.");
  const note = typeof p.note === "string" && p.note.trim() ? p.note.trim() : null;
  const s = bySubscriptionReference(reference);
  if (!s) return attention(`No subscription has the payment reference ${reference}.`);
  m.subscription_id = s.id;
  m.fund_id = s.fund_id;
  if (["funds_returned", "cancelled", "rejected"].includes(s.status) || s._convertedToHoldingId)
    return attention("This subscription is closed, so the result was not applied.");
  const earlier = s.cdd;
  if (earlier && earlier.result === result && earlier.note === note)
    return duplicate("This due diligence result is already recorded.");
  let requestId: number | null = null;
  if (result === "more_documents") {
    const open = db.documentRequests.find(
      (r) =>
        r.investor_id === s.investor_id &&
        r.kind === "source_of_wealth" &&
        r.status === "requested",
    );
    requestId = open?.id ?? db.nextDocumentRequestId();
    if (!open)
      db.documentRequests.push({
        id: requestId,
        investor_id: s.investor_id,
        kind: "source_of_wealth",
        fund_id: s.fund_id,
        note:
          note ?? "Acclime needs more documents to complete due diligence on this subscription.",
        requested_at: now(),
        due_at: null,
        status: "requested",
        reminded_at: null,
        received_document_id: null,
      });
  }
  s.cdd = { result, at: now(), note, message_id: m.id, request_id: requestId };
  if (result === "pass") {
    db.recordClientEvent(
      s.investor_id,
      "milestone",
      `Acclime cleared due diligence for the ${s.asset_name} subscription.`,
      "Acclime",
      ["luca"],
    );
    return applied("Due diligence cleared.");
  }
  if (result === "fail")
    return attention(
      `Due diligence failed${note ? `: ${note}` : ""}. Acceptance is blocked: decline or cancel the subscription.`,
    );
  db.sendInvestorMessage(
    s.investor_id,
    `More documents needed for your ${s.asset_name} subscription`,
    "The fund administrator needs further documents to complete due diligence. Please upload them from your Documents page.",
    "allocation",
  );
  return attention(
    "Acclime needs more documents. A request has gone to the investor; acceptance waits until they are received.",
  );
}

function acceptance(m: AcclimeMessage, p: Record<string, unknown>): Outcome {
  const reference = text(p.payment_reference, "Payment reference");
  const units = positive(p.units, "Units");
  const price = positive(p.price, "Unit price");
  const s = bySubscriptionReference(reference);
  if (!s) return attention(`No subscription has the payment reference ${reference}.`);
  m.subscription_id = s.id;
  m.fund_id = s.fund_id;
  if (s._convertedToHoldingId)
    return duplicate("The holding has already been issued, by Ops or an earlier message.");
  const gates = db.gatesOf(s);
  if (s.status !== "allocated" || !gates.allocation_confirmed)
    return attention("LUCA has not confirmed the allocation, so there is nothing to issue yet.");
  const allocation = workflow.allocations.find((a) => a.subscriptionId === s.id && !a.voided);
  if (!allocation) return attention("There is no allocation recorded for this subscription.");
  const expected = allocation.principal / allocation.price;
  if (Math.abs(units - expected) > 0.01 || Math.abs(price - allocation.price) > 0.005)
    return attention(
      `Acclime reports ${units.toLocaleString("en-GB", { maximumFractionDigits: 2 })} units at ${usd(price)}; LUCA allocated ${expected.toLocaleString("en-GB", { maximumFractionDigits: 2 })} units at ${usd(allocation.price)}. Nothing was issued.`,
    );
  const blockers = investmentBlockers(s, true);
  if (blockers.length) return attention(`Nothing was issued: ${blockers.join(" ")}`);
  db.issueHolding(s, String(units), String(price), allocation.principal);
  s.owner = "complete";
  s.next_action = "";
  tell(
    s,
    `Your ${s.asset_name} shares have been issued`,
    `Your subscription in ${s.fund_name} has been accepted and your shares are issued. They now appear in your portfolio.`,
    `Acclime issued ${units.toLocaleString("en-GB", { maximumFractionDigits: 2 })} units for the ${s.asset_name} subscription.`,
  );
  return applied(
    `Issued ${units.toLocaleString("en-GB", { maximumFractionDigits: 2 })} units at ${usd(price)}. The investor now holds them.`,
  );
}

function refundProcessed(m: AcclimeMessage, p: Record<string, unknown>): Outcome {
  const reference = text(p.payment_reference, "Payment reference");
  const amount = round(positive(p.amount, "Amount"));
  const bankReference = text(p.bank_reference, "Bank reference");
  const at = dateOf(p.processed_on, "Processed on");
  const s = bySubscriptionReference(reference);
  if (!s) return attention(`No subscription has the payment reference ${reference}.`);
  m.subscription_id = s.id;
  m.fund_id = s.fund_id;
  const obligations = workflow.returns.filter((r) => r.subscriptionId === s.id);
  if (obligations.length === 0) return attention("No refund is due on this subscription.");
  if (obligations.every((r) => r.status === "confirmed"))
    return duplicate("This refund has already been recorded as paid.");
  const due = round(
    obligations.filter((r) => r.status !== "confirmed").reduce((n, r) => n + r.amount, 0),
  );
  if (Math.abs(due - amount) > 0.005)
    return attention(
      `Acclime reports ${usd(amount)} refunded; ${usd(due)} is due. Nothing was recorded.`,
    );
  for (const r of obligations)
    if (r.status !== "confirmed") {
      r.status = "confirmed";
      r.source = "acclime";
      r.reference = bankReference;
      r.acclimeMessageId = m.id;
      r.at = at;
    }
  if (["not_allocated", "cancelled"].includes(s.status)) {
    s.status = "funds_returned";
    s.owner = "complete";
    s.next_action = "";
  }
  tell(
    s,
    `Your ${s.asset_name} refund has been processed`,
    `${usd(amount)} has been returned to the account it came from, including the subscription fee.`,
    `Acclime refunded ${usd(amount)} for the ${s.asset_name} subscription.`,
  );
  return applied(`Refund of ${usd(amount)} recorded as paid to the investor.`);
}

function nav(m: AcclimeMessage, p: Record<string, unknown>): Outcome {
  const fund = db.findFundById(Number(p.fund_id));
  const navPerUnit = positive(p.nav_per_unit, "NAV per unit");
  const asOf = dateOf(p.as_of, "As of");
  if (!fund) return attention("No sub-fund has this id.");
  m.fund_id = fund.id;
  const month = asOf.slice(0, 7);
  const earlier = workflow.navRecords.find(
    (r) => r.fundId === fund.id && r.asOf.slice(0, 7) === month,
  );
  if (earlier)
    return Math.abs(earlier.navPerUnit - navPerUnit) < 0.0005
      ? duplicate("This month's NAV is already recorded.")
      : attention(
          `A NAV of ${usd(earlier.navPerUnit)} is already recorded for this month. ${usd(navPerUnit)} was not applied.`,
        );
  const monthLabel = new Date(asOf).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const held = db.holdings.filter((h) => h.fund_id === fund.id && h.state === "held");
  for (const h of held) {
    // Keep the value the holding showed before, so the chart has somewhere to start from.
    if (!workflow.valuations.some((v) => v.holdingId === h.id) && h.nav_as_of)
      workflow.valuations.push({
        id: id(),
        holdingId: h.id,
        amount: Number(h.current_nav),
        currency: "USD",
        source: "Previous reported holding value",
        at: h.nav_as_of,
      });
    workflow.valuations.push({
      id: id(),
      holdingId: h.id,
      amount: round(Number(h.units) * navPerUnit),
      currency: "USD",
      source: `Acclime fund administrator NAV, ${monthLabel}`,
      at: asOf,
    });
    const latest = workflow.valuations
      .filter((v) => v.holdingId === h.id)
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id - a.id)[0];
    h.current_nav = latest.amount.toFixed(2);
    h.nav_as_of = latest.at;
  }
  workflow.navRecords.push({
    id: id(),
    fundId: fund.id,
    asOf,
    navPerUnit,
    messageId: m.id,
    holdingsUpdated: held.length,
  });
  return applied(
    held.length
      ? `${monthLabel} NAV of ${usd(navPerUnit)} per unit applied to ${held.length} holding${held.length === 1 ? "" : "s"}.`
      : `${monthLabel} NAV of ${usd(navPerUnit)} per unit recorded. There are no issued holdings to update.`,
  );
}

const HANDLERS: Record<
  AcclimeInbound["type"],
  (m: AcclimeMessage, p: Record<string, unknown>) => Outcome
> = {
  funds_confirmed: fundsConfirmed,
  cdd_result: cddResult,
  acceptance,
  refund_processed: refundProcessed,
  nav,
};

/**
 * Records and applies one Acclime message. `actor` is the Fund Manager who keyed it in, or null
 * for the feed. Anything unreadable is refused and nothing is kept.
 */
export function receiveAcclime(actor: db.MockUser | null, inbound: AcclimeInbound): AcclimeMessage {
  return transaction(() => {
    if (!ACCLIME_MESSAGE_TYPES.some((t) => t.type === inbound.type))
      throw new Error("Unknown Acclime message type.");
    if (!inbound.payload || typeof inbound.payload !== "object")
      throw new Error("The message has no content.");
    const channel = inbound.channel === "feed" ? "feed" : "manual";
    const externalId =
      inbound.external_id?.trim() ||
      `${channel === "feed" ? "ACC" : "MAN"}-${workflow.sequence + 1}`;
    // Only a message that was applied counts as received: one that could not be applied can be
    // sent again, under the same id, once whatever stopped it has been put right.
    const earlier = workflow.acclimeMessages.find(
      (m) => m.external_id === externalId && m.status === "applied",
    );
    const message: AcclimeMessage = {
      id: id(),
      external_id: externalId,
      type: inbound.type,
      channel,
      entered_by: actor?.email ?? null,
      received_at: now(),
      subscription_id: earlier?.subscription_id ?? null,
      fund_id: earlier?.fund_id ?? null,
      payload: inbound.payload,
      status: "applied",
      outcome: "",
    };
    workflow.acclimeMessages.push(message);
    const result = earlier
      ? duplicate(`Message ${externalId} was already received (#${earlier.id}).`)
      : HANDLERS[inbound.type](message, inbound.payload);
    message.status = result.status;
    message.outcome = result.outcome;
    recordAudit(
      actor?.id ?? 0,
      `Acclime ${acclimeTypeLabel(inbound.type).toLowerCase()} message #${message.id} (${channel}): ${result.outcome}`,
    );
    return message;
  });
}

// ---------------------------------------------------------------------------
// The pack sent to Acclime and LUCA when the investor submits
// ---------------------------------------------------------------------------

const label = (type: string) => type.replace(/_/g, " ");
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * A record of what went to Acclime and to LUCA: the signed agreement, the investor's KYC and CDD
 * papers and the payment reference. It is a manifest: nothing is transmitted in this demo.
 */
export function createPack(s: db.MockSubscription): SubscriptionPack {
  const existing = workflow.packs.find((p) => p.subscriptionId === s.id);
  if (existing) return existing;
  const signature = workflow.signatures.find((x) => x.subscriptionId === s.id);
  const docs = db.verificationDocumentsByInvestor[s.investor_id] ?? [];
  const identity = docs.filter((d) => d.document_type !== "accreditation_letter" && d.has_file);
  const evidence = docs.filter((d) => d.document_type === "accreditation_letter" && d.has_file);
  const seed = db.findAdminInvestorSeed(s.investor_id);
  const at = now();
  const pack: SubscriptionPack = {
    id: id(),
    subscriptionId: s.id,
    createdAt: at,
    paymentReference: s.payment_reference,
    items: [
      {
        kind: "signed_agreement",
        label: "Signed subscription agreement",
        detail: signature
          ? `Signed by ${signature.name} on ${day(signature.at)}. Offering version #${signature.versionId}.`
          : "Not signed.",
        available: Boolean(signature),
      },
      {
        kind: "kyc",
        label: "KYC documents",
        detail: identity.length
          ? identity.map((d) => label(d.document_type)).join(", ")
          : "None on file.",
        available: identity.length > 0,
      },
      {
        kind: "cdd",
        label: "CDD record",
        detail: seed?.approved_at
          ? `Completed at onboarding, approved ${day(seed.approved_at)}${seed.accreditation_expiry ? `. Accreditation valid to ${day(seed.accreditation_expiry)}` : ""}${evidence.length ? `. Evidence: ${evidence.length} document${evidence.length === 1 ? "" : "s"}` : ""}.`
          : "Onboarding due diligence is not yet approved.",
        available: Boolean(seed?.approved_at),
      },
      {
        kind: "payment_reference",
        label: "Payment reference",
        detail: s.payment_reference,
        available: true,
      },
    ],
    recipients: [
      { name: "Acclime", status: "sent", sentAt: at },
      { name: "LUCA SGP", status: "sent", sentAt: at },
    ],
  };
  workflow.packs.push(pack);
  recordAudit(s.investor_id, `Subscription pack for #${s.id} sent to Acclime and LUCA SGP.`);
  persist();
  return pack;
}
