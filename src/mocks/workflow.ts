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
  if (workflow.versions.length) return;
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
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    requireValue(
      saved.schema === 1 && saved.workflow?.schema === 1 && Array.isArray(saved.workflow.versions),
      "Unsupported saved demo",
    );
    db.restoreDemoState(saved.db);
    Object.assign(workflow, saved.workflow);
  } catch {
    restoreFailed = true;
    storageWarning =
      "Saved demo could not be restored. It has been retained; export or explicitly reset before continuing.";
  }
}
export function resetDemo() {
  localStorage.removeItem(KEY);
  location.reload();
}
export function view(user: db.MockUser): WorkflowView {
  const ids = clientsFor(user),
    privileged = user.role === "luca" || user.role === "ops";
  const subs = db.subscriptions.filter((s) => ids.includes(s.investor_id));
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
      privileged ||
      ((staff(user) || user.has_eam_profile || disclosureAccess(user)) &&
        v.status === "published") ||
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
    })),
    holdings,
    funds: db.funds
      .filter((f) => privileged || f.state !== "draft")
      .map((f) => ({
        id: f.id,
        name: f.codename || f.name,
        state: f.state,
        company: f.asset.name,
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
    assignments: workflow.assignments.filter((a) => ids.includes(a.investorId)),
    highlights: workflow.highlights.filter(
      (h) =>
        ids.includes(h.investorId) &&
        workflow.assignments.some(
          (a) => a.investorId === h.investorId && a.staffId === h.staffId,
        ) &&
        currentVersion(workflow.versions.find((v) => v.id === h.versionId)?.fundId || 0)?.id ===
          h.versionId &&
        db.findFundById(workflow.versions.find((v) => v.id === h.versionId)?.fundId || 0)?.state ===
          "open",
    ),
    notes: user.role === "rm" ? workflow.notes.filter((n) => ids.includes(n.investorId)) : [],
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
      active(s);
      requireValue(!s.needs_review_version_id, "Investor must review the revised version first.");
      requireValue(
        ["allocation_pending", "reconciliation"].includes(s.status),
        "Reconciled funding is required.",
      );
      requireValue(
        !workflow.allocations.some((a) => a.subscriptionId === s.id && !a.voided),
        "Allocation already recorded.",
      );
      requireValue(
        !workflow.receipts.some((r) => r.subscriptionId === s.id && !r.matched && !r.supersededBy),
        "Resolve unmatched receipts first.",
      );
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
      active(s);
      requireValue(!s.needs_review_version_id, "Investor must review the revised version first.");
      const a = workflow.allocations.find((a) => a.subscriptionId === s.id && !a.voided);
      requireValue(a && a.principal > 0, "Positive manager allocation required.");
      requireValue(
        !workflow.receipts.some((r) => r.subscriptionId === s.id && !r.matched && !r.supersededBy),
        "Resolve receipt exceptions.",
      );
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
      const owner = (c.status || "ops") as StaffRole | "eam";
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
      role("rm");
      requireValue(clientsFor(user).includes(c.id!), "Client not assigned.");
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
      role("rm");
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
      role("rm");
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
      break;
    }
    case "prepare": {
      role("ops", "luca");
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
    case "review":
    case "approve":
    case "publish": {
      role(...(c.type === "approve" ? ["luca"] : ["ops"]));
      const v = workflow.versions.find((v) => v.id === c.id);
      requireValue(v, "Version not found.");
      const expected = { review: "draft", approve: "review", publish: "approved" };
      requireValue(v.status === expected[c.type], "Version is not ready.");
      const f = db.findFundById(v.fundId)!;
      requireValue(f.state !== "cancelled", "Cancelled offering cannot publish.");
      if (c.type === "review") v.snapshot = structuredClone(f);
      v.status = c.type === "review" ? "review" : c.type === "approve" ? "approved" : "published";
      if (c.type === "publish") {
        Object.assign(f, structuredClone(v.snapshot));
        f.state = "open";
        for (const sub of db.subscriptions.filter(
          (s) =>
            s.fund_id === f.id && !["cancelled", "rejected", "funds_returned"].includes(s.status),
        ))
          sub.needs_review_version_id = v.id;
      }
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
      workflow.valuations.push({
        id: id(),
        holdingId: h.id,
        amount: value,
        currency: c.currency || "USD",
        source,
        at: c.due ? new Date(c.due).toISOString() : now(),
      });
      h.current_nav = value.toFixed(2);
      h.nav_as_of = workflow.valuations.at(-1)!.at;
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
