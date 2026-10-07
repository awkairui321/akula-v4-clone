import { mayDiscover, hasInvestmentHistory } from "./investor-access";
import * as db from "./db";
import { clientCode } from "../lib/client-code";
import type {
  WorkflowState,
  WorkflowCommand,
  WorkflowView,
  StaffRole,
} from "../lib/workflow-types";

export const workflow: WorkflowState = {
  schema: 1,
  sequence: 10000,
  receipts: [],
  allocations: [],
  returns: [],
  versions: [],
  dealChanges: [],
  signatures: [],
  assignments: [],
  highlights: [],
  notes: [],
  cases: [],
  requests: [],
  valuations: [],
  secondary: [],
  events: [],
};
const now = () => new Date().toISOString();
const id = () => ++workflow.sequence;
const round = (n: number) => Math.round(n * 100) / 100;
function requireValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
export function disclosureAccess(user: db.MockUser) {
  return (
    user.kyc_status === "approved" &&
    user.nda_status === "signed" &&
    db.allRequiredConsentsGranted(user.id)
  );
}
export function staff(user: db.MockUser) {
  return ["luca", "ops", "rm"].includes(user.role);
}
export function clientsFor(user: db.MockUser): number[] {
  if (user.role === "investment_team") return [];
  if (user.role === "luca" || user.role === "ops")
    return [
      ...new Set([
        ...db.adminInvestors().map((i) => i.id),
        ...db.investorProfiles.map((i) => i.user_id),
      ]),
    ];
  if (user.role === "rm")
    return workflow.assignments.filter((a) => a.staffId === user.id).map((a) => a.investorId);
  if (user.has_eam_profile)
    return [
      ...(user.has_investor_profile ? [user.id] : []),
      ...db.adviserClients.filter((c) => c.eam_user_id === user.id).map((c) => c.investor_id),
    ];
  return [user.id];
}
export function ownedSubscription(request: Request, sid: number) {
  const user = db.currentUser(request);
  return user && db.subscriptions.find((s) => s.id === sid && s.investor_id === user.id);
}
const CHANGE_LABELS: Record<string, string> = {
  hook: "Headline",
  descriptor: "Descriptor",
  price: "Price per unit",
  min_subscription: "Minimum subscription",
  subscription_fee_pct: "Subscription fee",
  management_fee_pct: "Management fee",
  carried_interest_pct: "Carried interest",
  closes_at: "Closing date",
  implied_valuation: "Valuation",
  tags: "Tags",
};
const humanize = (key: string) =>
  CHANGE_LABELS[key] ?? key.replace(/^asset\./, "Company: ").replaceAll("_", " ");
/** Content fields that differ between two snapshots, in plain words. */
function changedFields(previous: unknown, next: unknown): string[] {
  const flat = (value: unknown) => {
    const out: Record<string, string> = {};
    for (const [key, v] of Object.entries((value ?? {}) as Record<string, unknown>)) {
      if (["id", "state", "documents"].includes(key)) continue;
      if (key === "asset" && v && typeof v === "object")
        for (const [k, inner] of Object.entries(v as Record<string, unknown>))
          out[`asset.${k}`] = JSON.stringify(inner);
      else out[key] = JSON.stringify(v);
    }
    return out;
  };
  const a = flat(previous),
    b = flat(next);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((key) => a[key] !== b[key])
    .map(humanize);
}
/** Record an edit to a deal's working content so the right people see it. */
export function recordDealChange(user: db.MockUser, fundId: number, fields: string[]) {
  if (!fields.length) return;
  if (!["ops", "investment_team", "luca"].includes(user.role)) return;
  workflow.dealChanges.push({
    id: id(),
    fundId,
    by: user.id,
    byRole: user.role as "ops" | "investment_team" | "luca",
    fields: [...new Set(fields.map(humanize))],
    at: now(),
  });
}
export function currentVersion(fid: number) {
  return workflow.versions.filter((v) => v.fundId === fid && v.status === "published").at(-1);
}
export function signedVersion(sid: number) {
  const signature = workflow.signatures.find((s) => s.subscriptionId === sid);
  return workflow.versions.find((v) => v.id === signature?.versionId);
}
export function recordSignature(sub: db.MockSubscription, name: string) {
  if (workflow.signatures.some((s) => s.subscriptionId === sub.id)) return;
  const version =
    workflow.versions.find((v) => v.id === sub.document_version_id) || currentVersion(sub.fund_id);
  requireValue(version, "No published offering version.");
  workflow.signatures.push({
    id: id(),
    subscriptionId: sub.id,
    versionId: version.id,
    name,
    at: now(),
  });
}
export function matched(sid: number) {
  return round(
    workflow.receipts
      .filter((r) => r.subscriptionId === sid && r.matched && !r.supersededBy)
      .reduce((n, r) => n + r.amount, 0),
  );
}
function ensureReturns(sub: db.MockSubscription) {
  const a = workflow.allocations.find((a) => a.subscriptionId === sub.id && !a.voided);
  const due = round(matched(sub.id) - (a ? a.principal + a.fee : 0));
  const existing = workflow.returns
    .filter((r) => r.subscriptionId === sub.id)
    .reduce((n, r) => n + r.amount, 0);
  if (due > existing + 0.005)
    workflow.returns.push({
      id: id(),
      subscriptionId: sub.id,
      amount: round(due - existing),
      status: "required",
      at: now(),
    });
}
export function requestWithdrawal(sub: db.MockSubscription) {
  requireValue(
    !sub._convertedToHoldingId &&
      !workflow.allocations.some((a) => a.subscriptionId === sub.id && !a.voided),
    "An allocated investment requires manager review.",
  );
  sub.status = "cancelled";
  sub.cancelled_at = now();
  sub.next_action = "return_funds";
  sub.owner = "akula_ops";
  ensureReturns(sub);
}
export function seedWorkflow() {
  if (workflow.versions.length) {
    ensureIllustrativeDemand();
    return;
  }
  for (const fund of db.funds)
    workflow.versions.push({
      id: id(),
      fundId: fund.id,
      number: 1,
      status: fund.state === "draft" ? "draft" : "published",
      snapshot: structuredClone(fund),
      at: now(),
    });
  for (const sub of db.subscriptions) {
    if (!["reserved", "documents_pending"].includes(sub.status))
      recordSignature(sub, "Legacy simulated signature");
    if (
      [
        "reconciliation",
        "allocation_pending",
        "allocated",
        "not_allocated",
        "funds_returned",
      ].includes(sub.status)
    ) {
      workflow.receipts.push({
        id: id(),
        subscriptionId: sub.id,
        amount: round(Number(sub.amount) + Number(sub.subscription_fee)),
        currency: sub.currency,
        reference: `MIGRATED-${sub.id}`,
        matched: true,
        at: sub.funds_received_at || now(),
      });
    }
    if (sub.status === "allocated")
      workflow.allocations.push({
        id: id(),
        subscriptionId: sub.id,
        principal: Number(sub.amount),
        fee: Number(sub.subscription_fee),
        price: Number(db.findFundById(sub.fund_id)?.price || 1),
        at: sub.allocated_at || now(),
      });
    if (["not_allocated", "funds_returned"].includes(sub.status)) {
      ensureReturns(sub);
      if (sub.status === "funds_returned")
        for (const r of workflow.returns.filter((r) => r.subscriptionId === sub.id))
          r.status = "confirmed";
    }
  }
  for (const discussion of db.discussions) {
    const client = db.adviserClients.find((c) => c.id === discussion.adviser_client_id);
    if (client)
      workflow.cases.push({
        id: id(),
        discussionId: discussion.id,
        investorId: client.investor_id,
        subject: discussion.fund_name + " · institution discussion",
        owner: "eam",
        status: discussion.status === "resolved" ? "resolved" : "open",
        at: discussion.created_at,
        messages: discussion.messages.map((m) => ({
          actorId: m.sender_role === "investor" ? client.investor_id : client.eam_user_id,
          text: m.body,
          at: m.created_at,
        })),
      });
  }
  workflow.assignments = db.adminInvestors().map((i) => ({ investorId: i.id, staffId: 6 }));
  const sampleDemand = [
    [2, "Aster Compute", 75000],
    [11, "Aster Compute", 125000],
    [14, "Aster Compute", 90000],
    [18, "Northstar Energy", 150000],
    [19, "Northstar Energy", 250000],
    [12, "Cedar Health", 50000],
    [13, "Cedar Health", 80000],
  ] as const;
  for (const [investorId, company, amount] of sampleDemand) {
    workflow.requests.push({
      id: id(),
      investorId,
      company,
      key: company.toLowerCase(),
      currency: "USD",
      amount,
      status: "Under review",
      at: now(),
    });
  }
  ensureIllustrativeDemand();
}
function ensureIllustrativeDemand() {
  // Add sourcing examples to fresh installs and saved browser demos without clearing user data.
  const clients = db.adminInvestors();
  const samples = [
    { company: "Polaris", count: 15, base: 125_000, step: 17_500 },
    { company: "Aether Materials", count: 9, base: 80_000, step: 12_500 },
    { company: "Meridian Compute", count: 6, base: 150_000, step: 22_500 },
  ];
  for (const [sampleIndex, sample] of samples.entries()) {
    const key = sample.company.toLowerCase().replace(/[^a-z0-9]/g, "");
    const existing = workflow.requests.filter((request) => request.key === key);
    for (let index = existing.length; index < sample.count; index++) {
      const client = clients[(index + sampleIndex * 3) % clients.length];
      if (!client) continue;
      workflow.requests.push({
        id: id(),
        investorId: client.id,
        company: sample.company,
        key,
        currency: "USD",
        amount: sample.base + index * sample.step,
        status: "Received",
        at: now(),
      });
    }
  }
}
export let storageWarning: string | null = null;
let restoreFailed = false;
const KEY = "akula-v4-simulation-v1";
export function persist() {
  if (typeof localStorage === "undefined" || restoreFailed) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ schema: 1, workflow, db: db.exportDemoState() }));
    storageWarning = null;
  } catch {
    storageWarning = "Browser storage is unavailable or full. Export this demo before reloading.";
  }
}
export function restore() {
  if (typeof localStorage === "undefined") {
    ensureIllustrativeDemand();
    return;
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      ensureIllustrativeDemand();
      persist();
      return;
    }
    const saved = JSON.parse(raw);
    requireValue(
      saved.schema === 1 && saved.workflow?.schema === 1 && Array.isArray(saved.workflow.versions),
      "Unsupported saved demo",
    );
    db.restoreDemoState(saved.db);
    Object.assign(workflow, saved.workflow);
    ensureIllustrativeDemand();
    persist();
  } catch {
    restoreFailed = true;
    storageWarning =
      "Saved demo could not be restored. It has been retained; export or explicitly reset before continuing.";
  }
}
/** Used by the RM onboarding handlers: assignment and an attributable audit entry. */
export function assignClientToRm(investorId: number, staffId: number) {
  workflow.assignments = workflow.assignments.filter((a) => a.investorId !== investorId);
  workflow.assignments.push({ investorId, staffId });
}
export function recordAudit(actorId: number, label: string) {
  workflow.events.push({ id: id(), actorId, label, at: now() });
}
export function resetDemo() {
  localStorage.removeItem(KEY);
  location.reload();
}
export function investmentBlockers(s: db.MockSubscription, issuance = false): string[] {
  const blockers: string[] = [];
  const investor = db.findUserById(s.investor_id);
  if (!investor || !disclosureAccess(investor))
    blockers.push("Investor eligibility, NDA and required consents must remain approved.");
  if (!workflow.signatures.some((signature) => signature.subscriptionId === s.id))
    blockers.push("Investor must complete the subscription signature first.");
  if (s.on_hold) blockers.push("LUCA has placed this subscription on hold.");
  if (
    ["cancelled", "rejected", "funds_returned"].includes(s.status) ||
    db.findFundById(s.fund_id)?.state === "cancelled"
  )
    blockers.push("Cancelled or terminal investment.");
  if (s.needs_review_version_id)
    blockers.push(
      `Investor must review and acknowledge document version #${s.needs_review_version_id}.`,
    );
  if (workflow.receipts.some((r) => r.subscriptionId === s.id && !r.matched && !r.supersededBy))
    blockers.push("Resolve unmatched receipts: Ops must match or correct outstanding receipts.");
  const allocation = workflow.allocations.find((a) => a.subscriptionId === s.id && !a.voided);
  if (issuance) {
    if (!allocation || allocation.principal <= 0)
      blockers.push("LUCA must record a positive allocation first.");
    if (allocation && matched(s.id) < round(allocation.principal + allocation.fee))
      blockers.push(
        "Confirmed funding must cover the recorded allocation and its fee before issuance.",
      );
  } else {
    if (!["allocation_pending", "reconciliation"].includes(s.status))
      blockers.push("Complete signing, reviews and cash matching first.");
    if (allocation) blockers.push("Allocation is already recorded.");
    const required = round(Number(s.amount) + Number(s.subscription_fee));
    if (matched(s.id) < required)
      blockers.push(
        `Match full requested funding first: ${required.toFixed(2)} ${s.currency} required; ${matched(s.id).toFixed(2)} matched.`,
      );
  }
  return blockers;
}

export function portfolioHistory(user: db.MockUser) {
  const positions = db.holdings.filter((h) => h.investor_id === user.id && h.state !== "realized");
  const observations = positions.map((h) => {
    const entries = workflow.valuations
      .filter((v) => v.holdingId === h.id)
      .map((v) => ({ at: v.at, amount: v.amount }));
    if (!entries.length && h.nav_as_of)
      entries.push({ at: h.nav_as_of, amount: Number(h.current_nav) });
    entries.unshift({
      at: h.subscribed_at || h.nav_as_of || now(),
      amount: Number(h.committed_amount),
    });
    return { h, entries: entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)) };
  });
  const dates = [
    ...new Set([...observations.flatMap((p) => p.entries.map((v) => v.at)), now()]),
  ].sort((a, b) => Date.parse(a) - Date.parse(b));
  return dates.map((at) => {
    let nav = 0,
      invested = 0;
    for (const { h, entries } of observations) {
      const eligible = entries.filter((v) => Date.parse(v.at) <= Date.parse(at));
      if (eligible.length) {
        nav += eligible.at(-1)!.amount;
        invested += Number(h.committed_amount);
      }
    }
    return { at, nav: round(nav), invested: round(invested) };
  });
}

export function view(user: db.MockUser): WorkflowView {
  const ids = clientsFor(user),
    privileged = user.role === "luca" || user.role === "ops",
    publisher = privileged || user.role === "investment_team";
  const subs = db.subscriptions
    .filter((s) => ids.includes(s.investor_id))
    .sort(
      (a, b) =>
        Number(b.commercial_terms?.allocationPriority === "partner_priority") -
        Number(a.commercial_terms?.allocationPriority === "partner_priority"),
    );
  const sid = new Set(subs.map((s) => s.id));
  const holdings = db.holdings.filter((h) => ids.includes(h.investor_id));
  const hid = new Set(holdings.map((h) => h.id));
  const cases = workflow.cases.filter(
    (c) =>
      ids.includes(c.investorId) &&
      (privileged || user.id === c.investorId || c.owner === user.role),
  );
  const versions = workflow.versions.filter(
    (v) =>
      publisher ||
      ((staff(user) || user.has_eam_profile || disclosureAccess(user)) &&
        v.status === "published" &&
        mayDiscover(user, v.fundId)) ||
      workflow.signatures.some((s) => sid.has(s.subscriptionId) && s.versionId === v.id) ||
      subs.some(
        (s) => s.reviewed_version_ids?.includes(v.id) || s.needs_review_version_id === v.id,
      ),
  );
  return {
    ...workflow,
    actor: { id: user.id, role: user.role, email: user.email },
    storageWarning,
    clients: ids.map((id) => {
      const investor = db.adminInvestors().find((i) => i.id === id);
      return {
        id,
        code: clientCode(id),
        name: investor?.full_name || db.findUserById(id)?.email || `Investor ${id}`,
        type: investor?.investor_type === "individual" ? "individual" : "entity",
        eamFirm: investor?.eam_firm ?? null,
      };
    }),
    subscriptions: subs.map((s) => ({
      ...db.toSubscription(s),
      investor_id: s.investor_id,
      investor_name: s.investor_name,
      holdingId: s._convertedToHoldingId,
      currency: s.currency,
      needsReview: s.needs_review_version_id,
      allocationBlockers: investmentBlockers(s),
      issuanceBlockers: investmentBlockers(s, true),
    })),
    holdings,
    funds: db.funds
      .filter(
        (f) =>
          (publisher || f.state !== "draft") &&
          (mayDiscover(user, f.id) || hasInvestmentHistory(user, f.id)),
      )
      .map((f) => ({
        id: f.id,
        name: f.codename || f.name,
        state: f.state,
        company: f.asset.name,
        sector: f.asset.sector,
        descriptor: f.descriptor,
        hook: f.hook,
        minimum: f.min_subscription,
        closesAt: f.closes_at,
        risks: f.asset.risks.map((risk) => risk.title),
      })),
    receipts: workflow.receipts.filter((r) => sid.has(r.subscriptionId)),
    allocations: workflow.allocations.filter((r) => sid.has(r.subscriptionId)),
    returns: workflow.returns.filter((r) => sid.has(r.subscriptionId)),
    signatures: workflow.signatures.filter((r) => sid.has(r.subscriptionId)),
    versions,
    // Ops edits go to the Investment Team only; the Fund Manager sees what the team submits.
    dealChanges: workflow.dealChanges.filter(
      (change) =>
        user.role === "ops" ||
        user.role === "investment_team" ||
        (user.role === "luca" && change.byRole !== "ops"),
    ),
    assignments: workflow.assignments.filter((a) => ids.includes(a.investorId)),
    highlights: workflow.highlights.filter(
      (h) =>
        ids.includes(h.investorId) &&
        mayDiscover(user, workflow.versions.find((v) => v.id === h.versionId)?.fundId || 0) &&
        (db.findUserById(h.staffId)?.role === "luca" ||
          workflow.assignments.some(
            (a) => a.investorId === h.investorId && a.staffId === h.staffId,
          )) &&
        currentVersion(workflow.versions.find((v) => v.id === h.versionId)?.fundId || 0)?.id ===
          h.versionId &&
        db.findFundById(workflow.versions.find((v) => v.id === h.versionId)?.fundId || 0)?.state ===
          "open",
    ),
    notes: ["rm", "luca"].includes(user.role)
      ? workflow.notes.filter((n) => ids.includes(n.investorId))
      : [],
    cases,
    requests: workflow.requests.filter((r) => privileged || r.investorId === user.id),
    valuations: workflow.valuations.filter((v) => hid.has(v.holdingId)),
    secondary: workflow.secondary,
    events: privileged ? workflow.events : [],
  };
}
export function command(user: db.MockUser, c: WorkflowCommand) {
  if (c.currency) {
    requireValue(/^[A-Z]{3}$/.test(c.currency), "Use a three-letter uppercase currency.");
  }
  const before = structuredClone(workflow),
    dbBefore = db.exportDemoState();
  try {
    perform(user, c);
    workflow.events.push({
      id: id(),
      actorId: user.id,
      label: `${c.type} · record ${c.id ?? "new"}`,
      at: now(),
    });
    persist();
    return view(user);
  } catch (error) {
    Object.assign(workflow, before);
    db.restoreDemoState(dbBefore);
    throw error;
  }
}
function perform(user: db.MockUser, c: WorkflowCommand) {
  const role = (...roles: string[]) =>
    requireValue(roles.includes(user.role), "This action belongs to another role.");
  const text = () => {
    requireValue(c.text?.trim(), "Enter a description or source.");
    return c.text!.trim();
  };
  const amount = () => {
    requireValue(Number.isFinite(c.amount) && c.amount! >= 0, "Enter a non-negative amount.");
    return round(c.amount!);
  };
  const sub = () => {
    const s = db.findSubscriptionById(c.id!);
    requireValue(s && clientsFor(user).includes(s.investor_id), "Record not found.");
    return s;
  };
  const active = (s: db.MockSubscription) =>
    requireValue(
      !s.on_hold &&
        !["cancelled", "rejected", "funds_returned"].includes(s.status) &&
        db.findFundById(s.fund_id)?.state !== "cancelled",
      "Cancelled or terminal investment.",
    );
  switch (c.type) {
    case "declare-topup": {
      const s = sub();
      requireValue(user.id === s.investor_id, "Only the investor can declare a transfer.");
      active(s);
      requireValue(
        s.status === "reconciliation",
        "Additional funding is not available at this stage.",
      );
      requireValue(
        matched(s.id) > 0 && matched(s.id) < round(Number(s.amount) + Number(s.subscription_fee)),
        "No confirmed funding shortfall.",
      );
      requireValue(
        !workflow.receipts.some((r) => r.subscriptionId === s.id && !r.matched && !r.supersededBy),
        "Ops must resolve outstanding receipts first.",
      );
      requireValue(
        !s.topup_declared_at || s.topup_matched_amount !== matched(s.id),
        "Your additional transfer is already awaiting matching.",
      );
      s.topup_declared_at = now();
      s.topup_matched_amount = matched(s.id);
      s.payment_claimed = true;
      s.payment_declared_at = now();
      s.owner = "akula_ops";
      s.next_action = "match_payment";
      break;
    }
    case "respond-information": {
      const s = sub();
      requireValue(
        user.id === s.investor_id ||
          (user.has_eam_profile &&
            db.adviserClients.some(
              (client) => client.investor_id === s.investor_id && client.eam_user_id === user.id,
            )),
        "Investor or assigned institution required.",
      );
      requireValue(
        s.status === "information_requested" && !s.on_hold,
        "Information response is not available.",
      );
      s.information_response_note = text();
      s.information_responded_at = now();
      s.status = "under_luca_review";
      s.owner = "luca";
      s.next_action = "luca_to_review";
      break;
    }
    case "subscription-decision": {
      role("luca");
      const s = sub();
      active(s);
      requireValue(s.status === "under_luca_review", "Subscription must be awaiting LUCA review.");
      requireValue(
        ["approved", "information_requested", "rejected"].includes(c.status ?? ""),
        "Choose a review decision.",
      );
      if (c.status === "information_requested") {
        s.information_request_note = text();
        s.information_requested_at = now();
        s.information_request_delivery = "email_pending_integration";
        s.information_response_note = null;
        s.information_responded_at = null;
      }
      if (c.status === "rejected") {
        s.rejection_note = text();
        s.rejection_reason = "other";
        s.rejected_at = now();
      }
      if (c.status === "approved") s.approved_at = now();
      s.status = c.status as typeof s.status;
      s.owner = db.ownerFor(s.status, s.origin);
      s.next_action = db.nextActionFor(s.status);
      break;
    }
    case "subscription-hold": {
      role("luca");
      const s = sub();
      requireValue(
        !s._convertedToHoldingId &&
          !["not_allocated", "cancelled", "rejected", "funds_returned"].includes(s.status),
        "Cannot hold a closed subscription.",
      );
      s.on_hold = c.status === "held";
      break;
    }
    case "institution-review": {
      requireValue(user.has_eam_profile, "External institution profile required.");
      const s = sub();
      requireValue(
        db.adviserClients.some((c) => c.investor_id === s.investor_id && c.eam_user_id === user.id),
        "Assigned client required.",
      );
      requireValue(
        s.status === "institution_review" && !s.on_hold,
        "Institution review is not available.",
      );
      s.status = "under_luca_review";
      s.owner = "luca";
      s.next_action = "luca_to_review";
      s.institution_reviewed_at = now();
      break;
    }
    case "receipt": {
      role("ops");
      const s = sub();
      const value = amount();
      requireValue(value > 0, "Receipt must be positive.");
      const reference = text();
      if (workflow.receipts.some((r) => r.reference === reference))
        throw new Error("Receipt reference already exists.");
      workflow.receipts.push({
        id: id(),
        subscriptionId: s.id,
        amount: value,
        currency: c.currency || s.currency,
        reference,
        matched: false,
        at: now(),
      });
      break;
    }
    case "match": {
      role("ops");
      const s = sub();
      const r = workflow.receipts.find((r) => r.id === c.target && r.subscriptionId === s.id);
      requireValue(r && !r.supersededBy, "Receipt not found.");
      requireValue(r.currency === s.currency, "Correct wrong-currency receipt before matching.");
      if (r.matched) return;
      r.matched = true;
      if (
        ["cancelled", "rejected", "not_allocated", "funds_returned"].includes(s.status) ||
        workflow.allocations.some((a) => a.subscriptionId === s.id)
      )
        ensureReturns(s);
      else {
        requireValue(
          ["awaiting_funds", "payment_unmatched", "reconciliation", "allocation_pending"].includes(
            s.status,
          ),
          "Acceptance is required before matching.",
        );
        s.funds_received_at = now();
        s.status = "reconciliation";
        s.owner = "akula_ops";
      }
      break;
    }
    case "correct-receipt": {
      role("ops");
      const s = sub();
      const old = workflow.receipts.find((r) => r.id === c.target && r.subscriptionId === s.id);
      requireValue(
        old && !old.matched && !old.supersededBy,
        "Only an unmatched receipt can be corrected.",
      );
      const replacement = {
        id: id(),
        subscriptionId: s.id,
        amount: amount(),
        currency: c.currency || s.currency,
        reference: text(),
        matched: false,
        at: now(),
      };
      requireValue(
        replacement.amount > 0 &&
          !workflow.receipts.some((r) => r.reference === replacement.reference),
        "Use a positive amount and unique reference.",
      );
      old.supersededBy = replacement.id;
      workflow.receipts.push(replacement);
      break;
    }
    case "allocate": {
      role("luca");
      const s = sub();
      const blockers = investmentBlockers(s);
      requireValue(!blockers.length, blockers.join(" "));
      const capital = amount();
      requireValue(capital <= Number(s.amount), "Allocation cannot exceed requested principal.");
      requireValue(
        matched(s.id) >= round(Number(s.amount) + Number(s.subscription_fee)),
        "Match full requested funding first.",
      );
      const fee = round((capital * Number(s.subscription_fee)) / Number(s.amount));
      const price = Number(c.price);
      requireValue(
        Number.isFinite(price) && price > 0,
        "Enter the illustrative class unit price; company share prices are not class prices.",
      );
      workflow.allocations.push({
        id: id(),
        subscriptionId: s.id,
        principal: capital,
        fee,
        price,
        at: now(),
      });
      s.allocated_principal = capital;
      s.status = capital ? "allocated" : "not_allocated";
      s.allocated_at = now();
      s.owner = "akula_ops";
      s.next_action = capital ? "confirm_registry_issuance" : "return_funds";
      ensureReturns(s);
      break;
    }
    case "issue": {
      role("ops");
      const s = sub();
      if (s._convertedToHoldingId) return;
      const blockers = investmentBlockers(s, true);
      requireValue(!blockers.length, blockers.join(" "));
      const a = workflow.allocations.find((a) => a.subscriptionId === s.id && !a.voided)!;
      db.issueHolding(s, String(a.principal / a.price), String(a.price), a.principal);
      s.owner = "complete";
      s.next_action = "";
      break;
    }
    case "return": {
      role("ops");
      const s = sub();
      const r = workflow.returns.find((r) => r.id === c.target && r.subscriptionId === s.id);
      requireValue(r, "Return not found.");
      const allowed: Record<string, string[]> = {
        required: ["processing"],
        processing: ["failed", "confirmed"],
        failed: ["processing"],
        confirmed: [],
      };
      if (r.status === c.status) return;
      requireValue(allowed[r.status].includes(c.status || ""), "Invalid return transition.");
      r.status = c.status as typeof r.status;
      r.at = now();
      break;
    }
    case "cancel": {
      role("luca");
      const s = sub();
      requireValue(!s._convertedToHoldingId, "Issued holdings remain historical; use servicing.");
      s.status = "cancelled";
      s.allocated_principal = 0;
      s.cancelled_at = now();
      for (const a of workflow.allocations.filter((a) => a.subscriptionId === s.id))
        a.voided = true;
      ensureReturns(s);
      break;
    }
    case "case": {
      const iid = staff(user) || user.has_eam_profile ? c.target : user.id;
      requireValue(iid && clientsFor(user).includes(iid), "Client not found.");
      const investorInitiated = !staff(user) && !user.has_eam_profile;
      requireValue(
        !investorInitiated || !c.status || c.status === "rm",
        "Investor support goes to the assigned LUCA RM.",
      );
      const owner = (investorInitiated ? "rm" : c.status || "luca") as StaffRole | "eam";
      requireValue(["luca", "ops", "rm", "eam"].includes(owner), "Choose a case owner.");
      if (owner === "rm")
        requireValue(
          workflow.assignments.some((a) => a.investorId === iid),
          "No RM assigned.",
        );
      if (owner === "eam")
        requireValue(
          db.adviserClients.some((a) => a.investor_id === iid),
          "No external institution assigned.",
        );
      if (c.id)
        requireValue(
          db.subscriptions.some((s) => s.id === c.id && s.investor_id === iid),
          "Investment not found.",
        );
      if (c.holdingId)
        requireValue(
          db.holdings.some((holding) => holding.id === c.holdingId && holding.investor_id === iid),
          "Holding not found.",
        );
      const body = text();
      workflow.cases.push({
        id: id(),
        investorId: iid,
        subscriptionId: c.id,
        holdingId: c.holdingId,
        subject: body.slice(0, 90),
        owner,
        status: "open",
        at: now(),
        messages: [{ actorId: user.id, text: body, at: now() }],
      });
      break;
    }
    case "reply":
    case "resolve": {
      const sc = view(user).cases.find((s) => s.id === c.id);
      requireValue(sc, "Case not found.");
      const stored = workflow.cases.find((s) => s.id === sc.id)!;
      if (c.type === "reply") {
        const body = text();
        stored.messages.push({ actorId: user.id, text: body, at: now() });
        stored.status = "open";
        if (stored.discussionId) {
          const discussion = db.discussions.find((d) => d.id === stored.discussionId);
          if (discussion) {
            discussion.messages.push({
              id: db.nextDiscussionMessageId(),
              sender_role: user.id === stored.investorId ? "investor" : "adviser",
              body,
              created_at: now(),
            });
            discussion.updated_at = now();
            discussion.status = "open";
          }
        }
      } else {
        role("luca", "ops", stored.owner);
        stored.status = "resolved";
        if (stored.discussionId) {
          const discussion = db.discussions.find((d) => d.id === stored.discussionId);
          if (discussion) discussion.status = "resolved";
        }
      }
      break;
    }
    case "assign": {
      role("luca");
      requireValue(
        db.adminInvestors().some((i) => i.id === c.id) &&
          db.users.some((u) => u.id === c.target && u.role === "rm"),
        "Choose a client and LUCA RM.",
      );
      workflow.assignments = workflow.assignments.filter((a) => a.investorId !== c.id);
      workflow.assignments.push({ investorId: c.id!, staffId: c.target! });
      for (const n of workflow.notes.filter((n) => n.investorId === c.id && !n.done))
        n.staffId = c.target!;
      break;
    }
    case "highlight": {
      role("rm", "luca");
      requireValue(clientsFor(user).includes(c.id!), "Client not assigned.");
      const targetInvestor = db.findUserById(c.id!);
      requireValue(
        targetInvestor && mayDiscover(targetInvestor, c.target!),
        "This deal is unavailable under the client's investor profile.",
      );
      const v = currentVersion(c.target!);
      requireValue(
        v && db.findFundById(v.fundId)?.state === "open",
        "Choose a published open offering.",
      );
      workflow.highlights.push({
        id: id(),
        investorId: c.id!,
        staffId: user.id,
        versionId: v.id,
        note: text(),
        at: now(),
      });
      break;
    }
    case "open-highlight": {
      const h = view(user).highlights.find((h) => h.id === c.id && h.investorId === user.id);
      requireValue(h, "Highlight not found.");
      h.openedAt ||= now();
      break;
    }
    case "note": {
      role("rm", "luca");
      requireValue(clientsFor(user).includes(c.id!), "Client not assigned.");
      requireValue(!c.due || /^\d{4}-\d{2}-\d{2}$/.test(c.due), "Use a valid follow-up date.");
      workflow.notes.push({
        id: id(),
        investorId: c.id!,
        staffId: user.id,
        text: text(),
        due: c.due,
        done: false,
        at: now(),
      });
      break;
    }
    case "complete-note": {
      role("rm", "luca");
      const n = workflow.notes.find(
        (n) => n.id === c.id && clientsFor(user).includes(n.investorId),
      );
      requireValue(n, "Note not found.");
      n.done = true;
      break;
    }
    case "request": {
      requireValue(user.has_investor_profile, "Investor profile required.");
      const company = text(),
        key = company
          .normalize("NFKC")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
      requireValue(key, "Enter company name.");
      if (workflow.requests.some((r) => r.investorId === user.id && r.key === key)) return;
      workflow.requests.push({
        id: id(),
        investorId: user.id,
        company,
        key,
        currency: c.currency || "USD",
        amount: c.amount === undefined ? undefined : amount(),
        status: "Received",
        at: now(),
      });
      break;
    }
    case "request-status": {
      role("luca", "ops");
      const r = workflow.requests.find((r) => r.id === c.id);
      requireValue(r, "Request not found.");
      requireValue(
        [
          "Under review",
          "Shared with LUCA",
          "Not currently available",
          "Opportunity available",
        ].includes(c.status || ""),
        "Choose a status.",
      );
      if (c.status === "Opportunity available") {
        const f = db.findFundById(c.target!);
        requireValue(
          f?.state === "open" &&
            currentVersion(f.id) &&
            f.asset.name.toLowerCase().replace(/[^a-z0-9]/g, "") === r.key,
          "Link a published offering for this company.",
        );
      }
      for (const x of workflow.requests.filter((x) => x.key === r.key)) {
        x.status = c.status!;
        x.fundId = c.status === "Opportunity available" ? c.target : undefined;
      }
      if (c.status === "Shared with LUCA" && user.role === "ops") {
        const indications = workflow.requests.filter((x) => x.key === r.key).length;
        workflow.events.push({
          id: id(),
          actorId: user.id,
          label: `Sourcing signal shared with LUCA: ${r.company} · ${indications} investor indications`,
          at: now(),
        });
      }
      break;
    }
    case "prepare": {
      role("luca", "investment_team");
      const fund = db.findFundById(c.id!);
      requireValue(fund, "Offering not found.");
      requireValue(
        !workflow.versions.some((v) => v.fundId === fund.id && v.status !== "published"),
        "Finish the existing revision first.",
      );
      workflow.versions.push({
        id: id(),
        fundId: fund.id,
        number:
          Math.max(
            0,
            ...workflow.versions.filter((v) => v.fundId === fund.id).map((v) => v.number),
          ) + 1,
        status: "draft",
        snapshot: structuredClone(fund),
        at: now(),
      });
      break;
    }
    // The Investment Team sends a prepared version to the Fund Manager.
    case "review": {
      role("investment_team", "luca");
      const v = workflow.versions.find((v) => v.id === c.id);
      requireValue(v, "Version not found.");
      requireValue(v.status === "draft", "Version is not ready.");
      const f = db.findFundById(v.fundId)!;
      requireValue(f.state !== "cancelled", "Cancelled offering cannot be submitted.");
      v.snapshot = structuredClone(f);
      v.status = "review";
      v.submittedBy = user.id;
      v.note = c.text?.trim() || undefined;
      const published = currentVersion(v.fundId);
      v.changed = published ? changedFields(published.snapshot, v.snapshot) : [];
      for (const change of workflow.dealChanges.filter(
        (x) => x.fundId === v.fundId && x.includedInVersion === undefined,
      ))
        change.includedInVersion = v.id;
      break;
    }
    // The Fund Manager sends a version back with a reason.
    case "send-back": {
      role("luca");
      const v = workflow.versions.find((v) => v.id === c.id);
      requireValue(v, "Version not found.");
      requireValue(v.status === "review", "Version is not with the Fund Manager.");
      v.status = "draft";
      v.decision = { by: user.id, at: now(), outcome: "returned", text: text() };
      break;
    }
    // Only the Fund Manager publishes: approval is what puts the offering in front of investors.
    case "approve":
    case "publish": {
      role("luca");
      const v = workflow.versions.find((v) => v.id === c.id);
      requireValue(v, "Version not found.");
      requireValue(
        v.status === (c.type === "approve" ? "review" : "approved"),
        "Version is not ready.",
      );
      const f = db.findFundById(v.fundId)!;
      requireValue(f.state !== "cancelled", "Cancelled offering cannot publish.");
      // The Fund Manager approves what they are looking at, including their own edits.
      if (c.type === "approve") v.snapshot = structuredClone(f);
      v.status = "published";
      v.decision = { by: user.id, at: now(), outcome: "published" };
      Object.assign(f, structuredClone(v.snapshot));
      f.state = "open";
      for (const sub of db.subscriptions.filter(
        (s) =>
          s.fund_id === f.id && !["cancelled", "rejected", "funds_returned"].includes(s.status),
      ))
        sub.needs_review_version_id = v.id;
      break;
    }
    case "acknowledge": {
      const s = sub();
      requireValue(user.id === s.investor_id, "Only the investor can acknowledge.");
      requireValue(s.needs_review_version_id === c.target, "Choose the exact required version.");
      s.reviewed_version_ids = [...(s.reviewed_version_ids || []), c.target!];
      delete s.needs_review_version_id;
      break;
    }
    case "eligibility": {
      role("luca");
      const identity = db.findUserById(c.id!);
      requireValue(identity && identity.has_investor_profile, "Investor not found.");
      requireValue(["approved", "failed"].includes(c.status || ""), "Choose a decision.");
      identity.kyc_status = c.status as "approved" | "failed";
      const legacy = db.findAdminInvestorSeed(identity.id);
      if (legacy) {
        legacy.verification_status = c.status === "approved" ? "approved" : "rejected";
        legacy.identity_status = c.status === "approved" ? "verified" : "failed";
        legacy.accreditation_status = c.status === "approved" ? "accredited" : "not_accredited";
      }
      break;
    }
    case "valuation": {
      role("luca");
      requireValue(
        !c.currency || c.currency === "USD",
        "This holding is denominated in USD. No currency conversion is simulated.",
      );
      const h = db.holdings.find((h) => h.id === c.id);
      requireValue(h, "Holding not found.");
      const value = amount();
      const source = text();
      requireValue(!c.due || Number.isFinite(Date.parse(c.due)), "Invalid report date.");
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
        amount: value,
        currency: c.currency || "USD",
        source,
        at: c.due ? new Date(c.due).toISOString() : now(),
      });
      const latest = workflow.valuations
        .filter((v) => v.holdingId === h.id)
        .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id - a.id)[0];
      h.current_nav = latest.amount.toFixed(2);
      h.nav_as_of = latest.at;
      break;
    }
    case "secondary": {
      role("luca");
      requireValue(db.findFundById(c.id!), "Offering not found.");
      workflow.secondary.push({
        id: id(),
        fundId: c.id!,
        amount: amount(),
        currency: c.currency || "USD",
        source: text(),
        at: now(),
      });
      break;
    }
    default:
      throw new Error("Unknown workflow action.");
  }
}
