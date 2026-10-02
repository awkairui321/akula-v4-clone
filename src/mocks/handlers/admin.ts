import { workflow, command } from "../workflow";
import { http, HttpResponse } from "msw";
import {
  currentUser,
  findUserById,
  subscriptions,
  findSubscriptionById,
  toAdminSubscription,
  TRANSITIONS,
  ownerFor,
  nextActionFor,
  adminInvestors,
  findAdminInvestorSeed,
  verificationDocumentsByInvestor,
  holdings,
  documents,
  nextDocumentId,
  partners,
  partnerSummary,
  partnerClientsFor,
  findPartnerById,
  funds,
  findFundById,
  fundManagers,
  tagsFor,
  findOrCreateTag,
  investorPricing,
  nextInvestorPricingId,
  documentRequests,
  nextDocumentRequestId,
  bankTransfers,
  findBankTransferById,
  logEvent,
  platformEvents,
  communications,
  communicationRecipients,
  communicationSummary,
  nextCommunicationId,
  nextCommunicationRecipientId,
  type MockUser,
  type MockSubscription,
  type CommunicationAudienceType,
  type CommunicationRouting,
  type CommunicationStatus,
} from "../db";
import { clientCode } from "@/lib/client-code";
import { STATUS_LABELS } from "@/lib/types";
import type { SubscriptionStatus, Fund } from "@/lib/types";

function unauthorized() {
  return HttpResponse.json({ error: "Not authenticated" }, { status: 401 });
}

function requireAdmin(request: Request): MockUser | null {
  const user = currentUser(request);
  if (!user || user.role !== "luca") return null;
  return user;
}

const NEEDS_ACTION_OWNER = "akula_ops";
const NEEDS_ACTION_STATUSES: SubscriptionStatus[] = [
  "under_luca_review",
  "payment_unmatched",
  "reconciliation",
  "allocation_pending",
  "not_allocated",
];

/** Shared by the single and bulk transition endpoints, and by payment matching. */
type TransitionExtras = {
  paymentReference?: string;
  informationRequestNote?: string;
  rejectionReason?: string;
  rejectionNote?: string;
  units?: string;
  pricePerUnit?: string;
};

function applyTransition(
  id: number,
  to: SubscriptionStatus | undefined,
  extras: TransitionExtras = {},
): { sub: MockSubscription } | { error: string } {
  const sub = findSubscriptionById(id);
  if (!sub) return { error: "Subscription not found" };
  if (!to || !TRANSITIONS[sub.status].includes(to)) {
    return { error: `Cannot move a subscription from ${sub.status} to ${to ?? "(none)"}` };
  }
  if (
    to === "institution_review" ||
    (to === "under_luca_review" && sub.status !== "information_requested")
  )
    return { error: "Complete investor signing and institution review in their own workflows." };
  if (to === "information_requested" && !extras.informationRequestNote?.trim()) {
    return { error: "Describe what information is needed" };
  }
  if (to === "rejected" && !extras.rejectionReason) {
    return { error: "Select a rejection reason" };
  }

  if (
    [
      "allocated",
      "not_allocated",
      "funds_returned",
      "payment_unmatched",
      "reconciliation",
      "allocation_pending",
    ].includes(to)
  )
    return {
      error: "Use the connected workflow workspace for cash, allocation, issuance and returns.",
    };
  if (findFundById(sub.fund_id)?.state === "cancelled" && to !== "cancelled")
    return { error: "Cancelled offering cannot advance." };
  if (to === "cancelled") {
    try {
      command({ role: "luca", id: 1 } as ReturnType<typeof requireAdmin> & {}, {
        type: "cancel",
        id: sub.id,
      });
    } catch (e) {
      return { error: (e as Error).message };
    }
  }
  const now = new Date().toISOString();
  sub.status = to;
  sub.owner = ownerFor(to, sub.origin);
  sub.next_action = nextActionFor(to);

  if (extras.paymentReference?.trim()) {
    sub.payment_reference = extras.paymentReference.trim();
  }
  if (to === "under_luca_review") {
    sub.institution_reviewed_at = sub.institution_reviewed_at ?? now;
  }
  if (to === "information_requested") {
    sub.information_request_note = extras.informationRequestNote!.trim();
    sub.information_requested_at = now;
  }
  if (to === "under_luca_review") {
    // Coming back from an answered information request — clear the old note.
    sub.information_request_note = null;
    sub.information_requested_at = null;
  }
  if (to === "approved") {
    sub.approved_at = now;
  }
  if (to === "rejected") {
    sub.rejected_at = now;
    sub.rejection_reason = extras.rejectionReason ?? null;
    sub.rejection_note = extras.rejectionNote?.trim() || null;
  }
  if (to === "reconciliation") {
    sub.funds_received_at = sub.funds_received_at ?? now;
    sub.reconciled_at = now;
  }
  if (to === "allocation_pending") {
    sub.funds_received_at = sub.funds_received_at ?? now;
  }
  if (to === "allocated" || to === "not_allocated" || to === "funds_returned") {
    sub.allocated_at = now;
  }

  if (to === "cancelled") {
    sub.cancelled_at = now;
  }

  logEvent(
    "status_change",
    `${sub.investor_name}'s subscription to ${sub.asset_name} moved to ${STATUS_LABELS[to].toLowerCase()}.`,
    { investorId: sub.investor_id, fundId: sub.fund_id },
  );

  return { sub };
}

function paginationMeta(total: number) {
  return { page: 1, per_page: total || 1, total, total_pages: total > 0 ? 1 : 0 };
}

function subscriptionsSummary() {
  const by_status: Partial<Record<SubscriptionStatus, number>> = {};
  for (const s of subscriptions) {
    by_status[s.status] = (by_status[s.status] ?? 0) + 1;
  }
  const claimedUnconfirmed = subscriptions.filter(
    (s) => s.payment_claimed && s.status === "payment_unmatched",
  );
  const unmatched = subscriptions.filter((s) => s.status === "payment_unmatched");
  const awaitingAllocation = subscriptions.filter((s) => s.status === "allocation_pending");
  return {
    total: subscriptions.length,
    needs_action: subscriptions.filter((s) => NEEDS_ACTION_STATUSES.includes(s.status)).length,
    by_status,
    payment_claimed: claimedUnconfirmed.length,
    payment_claimed_value: claimedUnconfirmed
      .reduce((sum, s) => sum + (s.allocated_principal ?? parseFloat(s.amount)), 0)
      .toFixed(2),
    unmatched_value: unmatched
      .reduce((sum, s) => sum + (s.allocated_principal ?? parseFloat(s.amount)), 0)
      .toFixed(2),
    awaiting_allocation_value: awaitingAllocation
      .reduce((sum, s) => sum + (s.allocated_principal ?? parseFloat(s.amount)), 0)
      .toFixed(2),
  };
}

function expiringWithin(days: number): number {
  const now = Date.now();
  const cutoff = now + days * 24 * 60 * 60 * 1000;
  return adminInvestors().filter((i) => {
    if (!i.accreditation_expiry) return false;
    const t = new Date(i.accreditation_expiry).getTime();
    return t >= now && t <= cutoff;
  }).length;
}

function investorsSummary() {
  const list = adminInvestors();
  return {
    total: list.length,
    needs_review: list.filter(
      (i) => i.verification_status === "pending" || i.verification_status === "in_review",
    ).length,
    approved: list.filter((i) => i.verification_status === "approved").length,
    rejected: list.filter((i) => i.verification_status === "rejected").length,
    accreditation_expiring_30: expiringWithin(30),
    accreditation_expiring_60: expiringWithin(60),
    accreditation_expiring_90: expiringWithin(90),
  };
}

function documentsSummary() {
  return {
    total: documents.length,
    received: documents.filter((d) => d.review_state === "received").length,
    reviewing: documents.filter((d) => d.review_state === "reviewing").length,
    on_hold: documents.filter((d) => d.review_state === "on_hold").length,
    filed: documents.filter((d) => d.review_state === "filed").length,
  };
}

function partnersSummary() {
  const list = partners.map(partnerSummary);
  return {
    total: list.length,
    total_clients: list.reduce((sum, p) => sum + p.client_count, 0),
    accrued_revenue: list.reduce((sum, p) => sum + parseFloat(p.accrued_revenue), 0).toFixed(2),
  };
}

export const adminHandlers = [
  // GET /api/v1/admin/activity?{investor_id,fund_id} — most recent platform
  // events; an investor_id/fund_id filters to that record's own history
  // rather than the dashboard's platform-wide top 15.
  http.get("*/api/v1/admin/activity", ({ request }) => {
    const user = requireAdmin(request);
    if (!user) return unauthorized();
    const url = new URL(request.url);
    const investorId = url.searchParams.get("investor_id");
    const fundId = url.searchParams.get("fund_id");

    if (investorId || fundId) {
      const filtered = platformEvents.filter(
        (e) =>
          (investorId ? e.investor_id === Number(investorId) : true) &&
          (fundId ? e.fund_id === Number(fundId) : true),
      );
      return HttpResponse.json({ events: filtered });
    }

    return HttpResponse.json({ events: platformEvents.slice(0, 15) });
  }),

  // GET /api/v1/admin/subscriptions?{needs_action,payment_claimed,status,q}
  http.get("*/api/v1/admin/subscriptions", ({ request }) => {
    const user = currentUser(request);
    if (!user || !["luca", "ops"].includes(user.role)) return unauthorized();
    const url = new URL(request.url);
    let list = subscriptions;

    if (url.searchParams.get("needs_action") === "true") {
      list = list.filter((s) => ownerFor(s.status) === NEEDS_ACTION_OWNER);
    }
    if (url.searchParams.get("payment_claimed") === "true") {
      list = list.filter((s) => s.payment_claimed);
    }
    const status = url.searchParams.get("status");
    if (status) {
      list = list.filter((s) => s.status === status);
    }
    const fundId = url.searchParams.get("fund_id");
    if (fundId) {
      list = list.filter((s) => s.fund_id === Number(fundId));
    }
    const q = url.searchParams.get("q")?.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          s.payment_reference.toLowerCase().includes(q) ||
          s.investor_name.toLowerCase().includes(q) ||
          s.investor_email.toLowerCase().includes(q),
      );
    }

    return HttpResponse.json({
      subscriptions: list.map(toAdminSubscription),
      meta: paginationMeta(list.length),
      summary: subscriptionsSummary(),
    });
  }),

  // POST /api/v1/admin/subscriptions/:id/transition
  http.post("*/api/v1/admin/subscriptions/:id/transition", async ({ request, params }) => {
    const user = requireAdmin(request);
    if (!user) return unauthorized();
    const sub = findSubscriptionById(Number(params.id));
    if (!sub) return HttpResponse.json({ error: "Subscription not found" }, { status: 404 });

    const body = (await request.json()) as {
      to?: SubscriptionStatus;
      payment_reference?: string;
      information_request_note?: string;
      rejection_reason?: string;
      rejection_note?: string;
      units?: string;
      price_per_unit?: string;
    };
    const result = applyTransition(sub.id, body.to, {
      paymentReference: body.payment_reference,
      informationRequestNote: body.information_request_note,
      rejectionReason: body.rejection_reason,
      rejectionNote: body.rejection_note,
      units: body.units,
      pricePerUnit: body.price_per_unit,
    });
    if ("error" in result) return HttpResponse.json({ error: result.error }, { status: 422 });

    return HttpResponse.json({ subscription: toAdminSubscription(result.sub) });
  }),

  // PATCH /api/v1/admin/subscriptions/:id/hold
  http.patch("*/api/v1/admin/subscriptions/:id/hold", async ({ request, params }) => {
    const user = requireAdmin(request);
    if (!user) return unauthorized();
    const sub = findSubscriptionById(Number(params.id));
    if (!sub) return HttpResponse.json({ error: "Subscription not found" }, { status: 404 });
    const body = (await request.json()) as { on_hold?: boolean };
    sub.on_hold = Boolean(body.on_hold);
    return HttpResponse.json({ subscription: toAdminSubscription(sub) });
  }),

  // POST /api/v1/admin/subscriptions/bulk_transition
  http.post("*/api/v1/admin/subscriptions/bulk_transition", async ({ request }) => {
    const user = requireAdmin(request);
    if (!user) return unauthorized();
    const body = (await request.json()) as { ids?: number[]; to?: SubscriptionStatus };
    const ids = body.ids ?? [];
    const moved: ReturnType<typeof toAdminSubscription>[] = [];
    const errors: Array<{ id: number; error: string }> = [];

    for (const id of ids) {
      const result = applyTransition(id, body.to);
      if ("error" in result) errors.push({ id, error: result.error });
      else moved.push(toAdminSubscription(result.sub));
    }

    return HttpResponse.json({ subscriptions: moved, errors });
  }),

  // GET /api/v1/admin/bank_transfers?matched=false
  http.get("*/api/v1/admin/bank_transfers", ({ request }) => {
    const user = requireAdmin(request);
    if (!user) return unauthorized();
    const url = new URL(request.url);
    let list = bankTransfers;
    if (url.searchParams.get("matched") === "false") {
      list = list.filter((t) => t.matched_subscription_id === null);
    }
    return HttpResponse.json({ bank_transfers: list });
  }),

  // POST /api/v1/admin/bank_transfers/:id/match
  http.post("*/api/v1/admin/bank_transfers/:id/match", async ({ request, params }) => {
    const user = requireAdmin(request);
    if (!user) return unauthorized();
    const transfer = findBankTransferById(Number(params.id));
    if (!transfer) return HttpResponse.json({ error: "Bank transfer not found" }, { status: 404 });
    const body = (await request.json()) as { subscription_id?: number };
    const sub = body.subscription_id ? findSubscriptionById(body.subscription_id) : undefined;
    if (!sub) return HttpResponse.json({ error: "Subscription not found" }, { status: 404 });

    return HttpResponse.json(
      { error: "Record and match the receipt in the Akula Ops workflow workspace." },
      { status: 422 },
    );
  }),

  // GET /api/v1/admin/investors?{needs_review,expiring_within,q}
  http.get("*/api/v1/admin/investors", ({ request }) => {
    const user = requireAdmin(request);
    if (!user) return unauthorized();
    const url = new URL(request.url);
    let list = adminInvestors();

    if (url.searchParams.get("needs_review") === "true") {
      list = list.filter(
        (i) => i.verification_status === "pending" || i.verification_status === "in_review",
      );
    }
    const expiringWithin = url.searchParams.get("expiring_within");
    if (expiringWithin) {
      const days = Number(expiringWithin);
      const now = Date.now();
      const cutoff = now + days * 24 * 60 * 60 * 1000;
      list = list.filter((i) => {
        if (!i.accreditation_expiry) return false;
        const t = new Date(i.accreditation_expiry).getTime();
        return t >= now && t <= cutoff;
      });
    }
    const q = url.searchParams.get("q")?.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (i) => i.full_name.toLowerCase().includes(q) || i.email.toLowerCase().includes(q),
      );
    }

    return HttpResponse.json({
      investors: list,
      meta: paginationMeta(list.length),
      summary: investorsSummary(),
    });
  }),

  // GET /api/v1/admin/investors/:id
  http.get("*/api/v1/admin/investors/:id", ({ request, params }) => {
    const user = requireAdmin(request);
    if (!user) return unauthorized();
    const id = Number(params.id);
    const investor = adminInvestors().find((i) => i.id === id);
    if (!investor) return HttpResponse.json({ error: "Investor not found" }, { status: 404 });

    return HttpResponse.json({
      investor,
      verification_documents: verificationDocumentsByInvestor[id] ?? [],
      subscriptions: subscriptions.filter((s) => s.investor_id === id).map(toAdminSubscription),
      holdings: holdings
        .filter((h) => h.investor_id === id)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(({ investor_id, ...h }) => h),
    });
  }),

  // PATCH /api/v1/admin/investors/:id/verification
  http.patch("*/api/v1/admin/investors/:id/verification", async ({ request, params }) => {
    const user = requireAdmin(request);
    if (!user) return unauthorized();
    const seed = findAdminInvestorSeed(Number(params.id));
    if (!seed) return HttpResponse.json({ error: "Investor not found" }, { status: 404 });

    const body = (await request.json()) as {
      identity_status?: string;
      accreditation_status?: string;
      notes?: string;
    };
    if (body.identity_status)
      seed.identity_status = body.identity_status as typeof seed.identity_status;
    if (body.accreditation_status) {
      seed.accreditation_status = body.accreditation_status as typeof seed.accreditation_status;
    }

    if (seed.identity_status === "failed" || seed.accreditation_status === "not_accredited") {
      seed.verification_status = "rejected";
    } else if (seed.identity_status === "verified" && seed.accreditation_status === "accredited") {
      seed.verification_status = "approved";
    } else if (seed.identity_status === "pending" || seed.accreditation_status === "pending") {
      seed.verification_status = "in_review";
    } else {
      seed.verification_status = "pending";
    }
    seed.reviewed_at = new Date().toISOString();
    const identity = findUserById(seed.id);
    if (identity)
      identity.kyc_status =
        seed.verification_status === "approved"
          ? "approved"
          : seed.verification_status === "rejected"
            ? "failed"
            : "pending";

    const investor = adminInvestors().find((i) => i.id === seed.id);
    return HttpResponse.json({ investor });
  }),

  // PATCH /api/v1/admin/investors/:id/notes — LUCA's private notes, saved on
  // their own, independent of any identity/accreditation decision.
  http.patch("*/api/v1/admin/investors/:id/notes", async ({ request, params }) => {
    const user = requireAdmin(request);
    if (!user) return unauthorized();
    const seed = findAdminInvestorSeed(Number(params.id));
    if (!seed) return HttpResponse.json({ error: "Investor not found" }, { status: 404 });
    const body = (await request.json()) as { notes?: string };
    seed.internal_notes = body.notes ?? "";
    const investor = adminInvestors().find((i) => i.id === seed.id);
    return HttpResponse.json({ investor });
  }),

  // GET /api/v1/admin/documents?{review_state,q}
  http.get("*/api/v1/admin/documents", ({ request }) => {
    const user = requireAdmin(request);
    if (!user) return unauthorized();
    const url = new URL(request.url);
    let list = documents;

    const reviewState = url.searchParams.get("review_state");
    if (reviewState) {
      list = list.filter((d) => d.review_state === reviewState);
    }
    const subscriptionId = url.searchParams.get("subscription_id");
    if (subscriptionId) {
      list = list.filter((d) => d.subscription_id === Number(subscriptionId));
    }
    const q = url.searchParams.get("q")?.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (d) => d.name.toLowerCase().includes(q) || d.owner_name.toLowerCase().includes(q),
      );
    }

    return HttpResponse.json({
      documents: list,
      meta: paginationMeta(list.length),
      summary: documentsSummary(),
    });
  }),

  // POST /api/v1/admin/documents — real upload: the file is read client-side
  // (FileReader -> data URL) and stored on the record, so view/download
  // genuinely round-trips rather than staging a filename with no bytes.
  http.post("*/api/v1/admin/documents", async ({ request }) => {
    const user = requireAdmin(request);
    if (!user) return unauthorized();
    const body = (await request.json()) as {
      document?: {
        name?: string;
        kind?: string;
        fund_id?: number;
        file_data_url?: string;
      };
    };
    const { name, kind, fund_id, file_data_url } = body.document ?? {};
    if (!name?.trim() || !kind || !fund_id) {
      return HttpResponse.json({ error: "name, kind and fund_id are required" }, { status: 422 });
    }
    const fund = findFundById(fund_id);
    if (!fund) return HttpResponse.json({ error: "Fund not found" }, { status: 404 });

    const doc: (typeof documents)[number] = {
      id: nextDocumentId(),
      name: name.trim(),
      kind,
      status: "active",
      review_state: "received",
      has_file: Boolean(file_data_url),
      file_data_url: file_data_url ?? null,
      fund_id: fund.id,
      fund_name: fund.name,
      subscription_id: null,
      owner_id: user.id,
      owner_name: "LUCA SGP",
      owner_email: user.email,
      created_at: new Date().toISOString(),
    };
    documents.push(doc);
    logEvent("document_uploaded", `${doc.name} uploaded for ${fund.asset.name}.`, {
      fundId: fund.id,
    });

    return HttpResponse.json({ document: doc });
  }),

  // GET /api/v1/admin/document_requests — what has been asked of clients, and where it stands.
  http.get("*/api/v1/admin/document_requests", ({ request }) => {
    const user = requireAdmin(request);
    if (!user) return unauthorized();
    const investors = adminInvestors();
    const rows = documentRequests
      .filter((r) => r.status !== "cancelled")
      .map((r) => {
        const investor = investors.find((i) => i.id === r.investor_id);
        const fund = r.fund_id ? findFundById(r.fund_id) : null;
        return {
          ...r,
          investor_name: investor?.full_name ?? `Investor #${r.investor_id}`,
          investor_email: investor?.email ?? "",
          client_code: investor?.client_code ?? "",
          investor_type: investor?.investor_type ?? "individual",
          eam_firm: investor?.eam_firm ?? null,
          fund_name: fund?.name ?? null,
        };
      });
    return HttpResponse.json({ requests: rows });
  }),

  // POST /api/v1/admin/document_requests — ask one or more clients for one or more documents.
  http.post("*/api/v1/admin/document_requests", async ({ request }) => {
    const user = requireAdmin(request);
    if (!user) return unauthorized();
    const body = (await request.json()) as {
      investor_ids?: number[];
      kinds?: string[];
      due_at?: string | null;
      note?: string | null;
      fund_id?: number | null;
      communication_id?: number | null;
    };
    const investorIds = body.investor_ids ?? [];
    const kinds = body.kinds ?? [];
    if (investorIds.length === 0 || kinds.length === 0)
      return HttpResponse.json(
        { error: "Choose at least one client and one document" },
        { status: 422 },
      );
    let created = 0;
    for (const investorId of investorIds) {
      for (const kind of kinds) {
        const open = documentRequests.some(
          (r) =>
            r.investor_id === investorId &&
            r.kind === kind &&
            (r.status === "requested" || r.status === "uploaded"),
        );
        if (open) continue; // never ask twice for the same thing
        documentRequests.push({
          id: nextDocumentRequestId(),
          investor_id: investorId,
          kind,
          fund_id: body.fund_id ?? null,
          note: body.note?.trim() || null,
          requested_at: new Date().toISOString(),
          due_at: body.due_at ?? null,
          status: "requested",
          reminded_at: null,
          received_document_id: null,
          communication_id: body.communication_id ?? null,
        });
        created += 1;
      }
    }
    logEvent(
      "document_uploaded",
      `${created} document request${created === 1 ? "" : "s"} sent to ${investorIds.length} client${investorIds.length === 1 ? "" : "s"}.`,
    );
    return HttpResponse.json({ created, skipped: investorIds.length * kinds.length - created });
  }),

  // POST /api/v1/admin/document_requests/:id/remind
  http.post("*/api/v1/admin/document_requests/:id/remind", ({ request, params }) => {
    const user = requireAdmin(request);
    if (!user) return unauthorized();
    const req = documentRequests.find((r) => r.id === Number(params.id));
    if (!req) return HttpResponse.json({ error: "Request not found" }, { status: 404 });
    req.reminded_at = new Date().toISOString();
    return HttpResponse.json({ ok: true });
  }),

  // DELETE /api/v1/admin/document_requests/:id — withdraw a request.
  http.delete("*/api/v1/admin/document_requests/:id", ({ request, params }) => {
    const user = requireAdmin(request);
    if (!user) return unauthorized();
    const req = documentRequests.find((r) => r.id === Number(params.id));
    if (!req) return HttpResponse.json({ error: "Request not found" }, { status: 404 });
    req.status = "cancelled";
    return HttpResponse.json({ ok: true });
  }),

  // DELETE /api/v1/admin/documents/:id — remove a deal document.
  http.delete("*/api/v1/admin/documents/:id", ({ request, params }) => {
    const user = requireAdmin(request);
    if (!user) return unauthorized();
    const index = documents.findIndex((d) => d.id === Number(params.id));
    if (index === -1) return HttpResponse.json({ error: "Document not found" }, { status: 404 });
    const [removed] = documents.splice(index, 1);
    logEvent("document_uploaded", `${removed.name} was removed.`, {
      fundId: removed.fund_id,
    });
    return HttpResponse.json({ document: removed });
  }),

  // POST /api/v1/tags — create a custom tag (or reuse one with the same name).
  http.post("*/api/v1/tags", async ({ request }) => {
    const user = requireAdmin(request);
    if (!user) return unauthorized();
    const body = (await request.json()) as { tag?: { name?: string } };
    const name = body.tag?.name?.trim();
    if (!name) return HttpResponse.json({ error: "Tag name is required" }, { status: 422 });
    if (name.length > 40)
      return HttpResponse.json(
        { error: "Tag names are limited to 40 characters" },
        { status: 422 },
      );
    return HttpResponse.json({ tag: findOrCreateTag(name) });
  }),

  // GET /api/v1/admin/investor_pricing — every custom-terms row, across all deals.
  http.get("*/api/v1/admin/investor_pricing", ({ request }) => {
    const user = requireAdmin(request);
    if (!user) return unauthorized();
    return HttpResponse.json({ overrides: investorPricing });
  }),

  // GET /api/v1/admin/funds/:id/investor_pricing — per-investor terms for one deal.
  http.get("*/api/v1/admin/funds/:id/investor_pricing", ({ request, params }) => {
    const user = requireAdmin(request);
    if (!user) return unauthorized();
    const fund = findFundById(Number(params.id));
    if (!fund) return HttpResponse.json({ error: "Fund not found" }, { status: 404 });
    const investors = adminInvestors().filter((i) => i.verification_status === "approved");
    const overrides = investorPricing
      .filter((p) => p.fund_id === fund.id)
      .map((p) => {
        const investor = adminInvestors().find((i) => i.id === p.investor_id);
        return {
          ...p,
          investor_name: investor?.full_name ?? `Investor #${p.investor_id}`,
          investor_email: investor?.email ?? "",
          client_code: clientCode(p.investor_id),
          eam_firm: investor?.eam_firm ?? null,
        };
      });
    return HttpResponse.json({
      overrides,
      investors: investors.map((i) => ({
        id: i.id,
        full_name: i.full_name,
        email: i.email,
        client_code: i.client_code,
        eam_firm: i.eam_firm,
      })),
    });
  }),

  // PUT /api/v1/admin/funds/:id/investor_pricing/:investorId — create or update.
  http.put("*/api/v1/admin/funds/:id/investor_pricing/:investorId", async ({ request, params }) => {
    const user = requireAdmin(request);
    if (!user) return unauthorized();
    const fund = findFundById(Number(params.id));
    if (!fund) return HttpResponse.json({ error: "Fund not found" }, { status: 404 });
    const investorId = Number(params.investorId);
    const investor = adminInvestors().find((i) => i.id === investorId);
    if (!investor) return HttpResponse.json({ error: "Investor not found" }, { status: 404 });

    const body = (await request.json()) as {
      pricing?: Record<string, string | null | undefined>;
    };
    const input = body.pricing ?? {};
    const clean = (value: string | null | undefined) =>
      value === undefined || value === null || String(value).trim() === ""
        ? null
        : String(value).trim();
    const fields = {
      price: clean(input.price),
      subscription_fee_pct: clean(input.subscription_fee_pct),
      management_fee_pct: clean(input.management_fee_pct),
      carried_interest_pct: clean(input.carried_interest_pct),
      implied_valuation: clean(input.implied_valuation),
    };
    const note = clean(input.note);

    if (Object.values(fields).every((v) => v === null))
      return HttpResponse.json(
        { error: "Set at least one price, fee or valuation that differs from standard." },
        { status: 422 },
      );
    for (const [key, value] of Object.entries(fields)) {
      if (value === null) continue;
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0)
        return HttpResponse.json({ error: `${key} must be a positive number` }, { status: 422 });
      if (key.endsWith("_pct") && n > 100)
        return HttpResponse.json({ error: `${key} cannot exceed 100%` }, { status: 422 });
    }

    const existing = investorPricing.find(
      (p) => p.fund_id === fund.id && p.investor_id === investorId,
    );
    const now = new Date().toISOString();
    if (existing) {
      Object.assign(existing, fields, { note, updated_at: now });
    } else {
      investorPricing.push({
        id: nextInvestorPricingId(),
        fund_id: fund.id,
        investor_id: investorId,
        ...fields,
        note,
        updated_at: now,
      });
    }
    logEvent(
      "deal_status_change",
      `Custom terms ${existing ? "updated" : "set"} for ${investor.full_name} on ${fund.asset.name}.`,
      { fundId: fund.id, investorId },
    );
    return HttpResponse.json({ ok: true });
  }),

  // DELETE /api/v1/admin/funds/:id/investor_pricing/:investorId — back to standard terms.
  http.delete("*/api/v1/admin/funds/:id/investor_pricing/:investorId", ({ request, params }) => {
    const user = requireAdmin(request);
    if (!user) return unauthorized();
    const index = investorPricing.findIndex(
      (p) => p.fund_id === Number(params.id) && p.investor_id === Number(params.investorId),
    );
    if (index === -1) return HttpResponse.json({ error: "No custom terms found" }, { status: 404 });
    investorPricing.splice(index, 1);
    return HttpResponse.json({ ok: true });
  }),

  // PATCH /api/v1/admin/documents/:id
  http.patch("*/api/v1/admin/documents/:id", async ({ request, params }) => {
    const user = requireAdmin(request);
    if (!user) return unauthorized();
    const doc = documents.find((d) => d.id === Number(params.id));
    if (!doc) return HttpResponse.json({ error: "Document not found" }, { status: 404 });
    const body = (await request.json()) as { document?: { review_state?: string } };
    if (body.document?.review_state) {
      doc.review_state = body.document.review_state as typeof doc.review_state;
      // Filing an investor's document closes the request it answers.
      if (doc.review_state === "filed") {
        const answered = documentRequests.find(
          (r) =>
            r.investor_id === doc.owner_id &&
            r.kind === doc.kind &&
            (r.status === "uploaded" || r.status === "requested"),
        );
        if (answered) {
          answered.status = "received";
          answered.received_document_id = doc.id;
        }
      }
    }
    return HttpResponse.json({ document: doc });
  }),

  // GET /api/v1/admin/partners
  http.get("*/api/v1/admin/partners", ({ request }) => {
    const user = requireAdmin(request);
    if (!user) return unauthorized();
    const url = new URL(request.url);
    let list = partners.map(partnerSummary);
    const q = url.searchParams.get("q")?.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => p.firm_name.toLowerCase().includes(q));
    }
    return HttpResponse.json({
      partners: list,
      meta: paginationMeta(list.length),
      summary: partnersSummary(),
    });
  }),

  // GET /api/v1/admin/partners/:id
  http.get("*/api/v1/admin/partners/:id", ({ request, params }) => {
    const user = requireAdmin(request);
    if (!user) return unauthorized();
    const partner = findPartnerById(Number(params.id));
    if (!partner) return HttpResponse.json({ error: "Partner not found" }, { status: 404 });

    const partnerSubs = subscriptions.filter((s) => s.eam_firm === partner.firm_name);
    const allocated = partnerSubs.filter((s) => s.status === "allocated");
    const sharePct = parseFloat(partner.eam_revenue_share_pct ?? "0");
    const periodMap = new Map<string, number>();
    for (const s of allocated) {
      const period = (s.allocated_at ?? s.created_at).slice(0, 7);
      periodMap.set(
        period,
        (periodMap.get(period) ?? 0) +
          (s.allocated_principal ?? parseFloat(s.amount)) * (sharePct / 100),
      );
    }
    const revenue_periods = [...periodMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, amount], i) => ({
        id: i + 1,
        period,
        amount: amount.toFixed(2),
        status: i % 2 === 0 ? "paid" : "accrued",
      }));

    return HttpResponse.json({
      partner: partnerSummary(partner),
      clients: partnerClientsFor(partner),
      subscriptions: partnerSubs.map(toAdminSubscription),
      revenue_periods,
    });
  }),

  // POST /api/v1/funds
  http.post("*/api/v1/funds", async ({ request }) => {
    const user = requireAdmin(request);
    if (!user) return unauthorized();
    const body = (await request.json()) as {
      fund?: { company_name?: string; codename?: string; sector?: string; target_amount?: number };
    };
    const { company_name, codename, sector, target_amount } = body.fund ?? {};
    if (!company_name?.trim() || !codename?.trim() || !target_amount || target_amount <= 0) {
      return HttpResponse.json(
        { error: "Company name, codename and target amount are required" },
        { status: 422 },
      );
    }

    const assetId = Math.max(...funds.map((f) => f.asset.id), 0) + 1;
    const fund: Fund = {
      id: Math.max(...funds.map((f) => f.id), 0) + 1,
      name: `${company_name.trim()} SPV`,
      codename: codename.trim(),
      descriptor: "",
      hook: "",
      state: "draft",
      vehicle_type: "fund",
      holding_period_note: null,
      deal_type: "primary",
      security_type: "Primary equity",
      price: "1.00",
      min_subscription: "25000",
      max_subscription: null,
      subscription_increment: "1000",
      subscription_fee_pct: "4",
      management_fee_pct: "1.5",
      carried_interest_pct: "15",
      supply_total: String(target_amount),
      supply_allocated: "0",
      implied_valuation: null,
      premium_pct: null,
      closes_at: null,
      opened_at: new Date().toISOString(),
      comparable_basis: "",
      entry_multiple: "",
      comparable_note: null,
      key_metrics: [],
      revenue_points: [],
      peers: [],
      activities: [],
      fund_manager: { id: 1, name: "LUCA SGP" },
      asset: {
        id: assetId,
        name: company_name.trim(),
        codename: null,
        legal_name: null,
        description: "",
        sector: sector ?? "enterprise_saas",
        sub_sector: null,
        founded_year: null,
        country: "",
        country_of_incorporation: null,
        funding_stage: "seed",
        headquarters: "",
        employee_count: 0,
        notable_investors: [],
        total_capital_raised: null,
        company_structure: null,
        website: "",
        about: null,
        thesis: null,
        highlights: [],
        risks: [],
        team: [],
        developments: [],
        funding_rounds: [],
        tagline: null,
        typical_buyer: null,
        commercial_model: null,
        how_it_works: [],
        in_practice: null,
        market_context: [],
        competitive_landscape: [],
        thesis_points: [],
        business_columns: [],
        product_disclosures: [],
        product_disclosures_note: null,
        product_disclosures_source: null,
        financial_indicators: [],
      },
      share_class: {
        id: Math.max(...funds.map((f) => f.share_class.id), 0) + 1,
        name: "Class A Participating",
        class_type: "preference",
      },
      tags: [],
      primary_source: null,
      figures_checked_note: null,
      figures_checked_links: [],
      recording_available: false,
      recording_embed_url: null,
    };
    funds.push(fund);
    return HttpResponse.json({ fund });
  }),

  // PATCH /api/v1/funds/:id
  http.patch("*/api/v1/funds/:id", async ({ request, params }) => {
    const user = currentUser(request);
    if (!user || !["luca", "ops"].includes(user.role)) return unauthorized();
    const fund = findFundById(Number(params.id));
    if (!fund) return HttpResponse.json({ error: "Fund not found" }, { status: 404 });

    const body = (await request.json()) as { fund?: Record<string, unknown> };
    const patch = body.fund ?? {};
    if (patch.state === "open" && fund.state !== "open")
      return HttpResponse.json(
        { error: "Use exact-version approval and Ops publication in Workflows." },
        { status: 422 },
      );
    if (
      workflow.versions.some(
        (v) => v.fundId === fund.id && ["review", "approved"].includes(v.status),
      )
    )
      return HttpResponse.json(
        { error: "Finish the reviewed version before editing again." },
        { status: 422 },
      );

    if (Array.isArray(patch.tag_ids)) {
      fund.tags = tagsFor(patch.tag_ids as number[]);
    }
    if (typeof patch.fund_manager_id === "number") {
      const manager = fundManagers.find((m) => m.id === patch.fund_manager_id);
      if (manager) fund.fund_manager = manager;
    }
    if (patch.asset && typeof patch.asset === "object") {
      Object.assign(fund.asset, patch.asset);
    }
    if (patch.share_class && typeof patch.share_class === "object") {
      Object.assign(fund.share_class, patch.share_class);
    }

    const {
      tag_ids: _tagIds,
      fund_manager_id: _fundManagerId,
      asset: _asset,
      share_class: _shareClass,
      ...scalarPatch
    } = patch;
    const previousState = fund.state;
    Object.assign(fund, scalarPatch);

    if (typeof scalarPatch.state === "string" && scalarPatch.state !== previousState) {
      logEvent("deal_status_change", `${fund.asset.name} moved to ${scalarPatch.state}.`, {
        fundId: fund.id,
      });
    }

    return HttpResponse.json({ fund });
  }),

  // GET /api/v1/admin/communications
  http.get("*/api/v1/admin/communications", ({ request }) => {
    const user = requireAdmin(request);
    if (!user) return unauthorized();
    const list = communications
      .map((c) => ({ ...c, ...communicationSummary(c.id) }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return HttpResponse.json({
      communications: list,
      summary: {
        total: communications.length,
        sent: communications.filter((c) => c.status === "sent").length,
        scheduled: communications.filter((c) => c.status === "scheduled").length,
        draft: communications.filter((c) => c.status === "draft").length,
      },
    });
  }),

  // GET /api/v1/admin/communications/:id
  http.get("*/api/v1/admin/communications/:id", ({ request, params }) => {
    const user = requireAdmin(request);
    if (!user) return unauthorized();
    const id = Number(params.id);
    const communication = communications.find((c) => c.id === id);
    if (!communication) return HttpResponse.json({ error: "Not found" }, { status: 404 });
    const recipients = communicationRecipients.filter((r) => r.communication_id === id);
    return HttpResponse.json({
      communication: { ...communication, ...communicationSummary(id) },
      recipients,
    });
  }),

  // POST /api/v1/admin/communications — the caller resolves the audience
  // client-side (from the same investor/subscription lists the rest of the
  // LUCA portal already fetches) and sends the resolved investor_ids; the
  // mock just builds recipients and simulated delivery/open state from them.
  http.post("*/api/v1/admin/communications", async ({ request }) => {
    const user = requireAdmin(request);
    if (!user) return unauthorized();
    const body = (await request.json()) as {
      subject?: string;
      body?: string;
      audience_type?: CommunicationAudienceType;
      audience_description?: string;
      fund_id?: number | null;
      routing?: CommunicationRouting;
      attachment_document_ids?: number[];
      send_at?: string | null;
      investor_ids?: number[];
    };
    if (!body.subject?.trim() || !body.body?.trim() || !body.investor_ids?.length) {
      return HttpResponse.json(
        { error: "subject, body and at least one recipient are required" },
        { status: 422 },
      );
    }

    const now = new Date();
    const sendAt = body.send_at ? new Date(body.send_at) : now;
    const status: CommunicationStatus = sendAt.getTime() > now.getTime() ? "scheduled" : "sent";
    const commId = nextCommunicationId();

    body.investor_ids.forEach((investorId, i) => {
      const investor = adminInvestors().find((inv) => inv.id === investorId);
      if (!investor) return;
      const routedVia: "investor" | "eam" =
        body.routing === "through_rm" && investor.eam_firm ? "eam" : "investor";
      const delivered = status === "sent";
      const opened = delivered && i % 6 !== 0;
      communicationRecipients.push({
        id: nextCommunicationRecipientId(),
        communication_id: commId,
        investor_id: investor.id,
        investor_name: investor.full_name,
        investor_email: investor.email,
        eam_firm: investor.eam_firm,
        routed_via: routedVia,
        delivered_at: delivered ? now.toISOString() : null,
        opened_at: opened ? new Date(now.getTime() + 60 * 60 * 1000).toISOString() : null,
        downloaded_document_ids: [],
      });
    });

    const communication = {
      id: commId,
      subject: body.subject.trim(),
      body: body.body,
      audience_type: body.audience_type ?? ("filtered_group" as CommunicationAudienceType),
      audience_description:
        body.audience_description?.trim() || `${body.investor_ids.length} investors`,
      fund_id: body.fund_id ?? null,
      routing: body.routing ?? ("direct" as CommunicationRouting),
      attachment_document_ids: body.attachment_document_ids ?? [],
      status,
      scheduled_at: status === "scheduled" ? sendAt.toISOString() : null,
      sent_at: status === "sent" ? now.toISOString() : null,
      created_at: now.toISOString(),
    };
    communications.unshift(communication);
    logEvent(
      "communication_sent",
      `"${communication.subject}" ${status === "sent" ? "sent" : "scheduled"} to ${body.investor_ids.length} investor(s).`,
      { fundId: communication.fund_id ?? undefined },
    );

    return HttpResponse.json({
      communication: { ...communication, ...communicationSummary(commId) },
    });
  }),
];
