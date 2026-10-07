import { commercialTerms, fundForSegment } from "../../lib/investor-access";
import { validUploadedFile, type UploadedFile } from "@/lib/file-upload";
import { DOCUMENT_REQUEST_KINDS } from "@/lib/document-catalogue";
import {
  segmentFor,
  investorAudience,
  mayDiscover,
  hasInvestmentHistory,
} from "../investor-access";
import {
  command,
  portfolioHistory,
  persist,
  recordAudit,
  ownedSubscription,
  recordSignature,
  requestWithdrawal,
  currentVersion,
  disclosureAccess,
} from "../workflow";
import { attachReferral, submitForReview } from "../onboarding";
import { http, HttpResponse } from "msw";
import {
  currentUser,
  findFundById,
  funds,
  discoverCompanies,
  findDiscoverCompanyById,
  tags,
  fundManagers,
  holdings,
  subscriptions,
  createSubscription,
  toSubscription,
  acknowledgementsResponse,
  wizardStepFor,
  documents,
  watchlist,
  nextWatchlistId,
  findInvestorProfileByUserId,
  investorProfiles,
  investorOnboardingComplete,
  consentsForUser,
  grantConsent,
  withdrawConsent,
  ownerFor,
  nextActionFor,
  adviserClients,
  verificationDocumentsByInvestor,
  nextDocumentId,
  highlights,
  fundAsSeenBy,
  documentRequests,
  communications,
  communicationRecipients,
  syncSeedFromAccount,
  findAdminInvestorSeed,
  recordClientEvent,
  findReferralCode,
  clientEvents,
} from "../db";

function unauthorized() {
  return HttpResponse.json({ error: "Not authenticated" }, { status: 401 });
}

export const investorHandlers = [
  http.get("*/api/v1/demo/investor-segment", ({ request }) => {
    const user = currentUser(request);
    if (!user?.has_investor_profile) return unauthorized();
    return HttpResponse.json({ segment: segmentFor(user) });
  }),
  http.patch("*/api/v1/demo/investor-segment", async ({ request }) => {
    const user = currentUser(request);
    if (!user?.has_investor_profile) return unauthorized();
    const body = (await request.json()) as { segment?: string };
    if (body.segment !== "independent" && body.segment !== "partner_referred")
      return HttpResponse.json({ error: "Choose a valid demo investor profile." }, { status: 422 });
    user.investor_segment = body.segment;
    return HttpResponse.json({ segment: segmentFor(user) });
  }),
  // GET /api/v1/rm_highlights — deals the investor's own RM/adviser has
  // flagged for them, if they have an adviser relationship on file at all.
  http.get("*/api/v1/rm_highlights", ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const clientIds = adviserClients.filter((c) => c.investor_id === user.id).map((c) => c.id);
    const mine = highlights.filter(
      (h) => clientIds.includes(h.adviser_client_id) && mayDiscover(user, h.fund_id),
    );
    return HttpResponse.json({ highlights: mine });
  }),

  // GET /api/v1/investor_profile
  http.get("*/api/v1/investor_profile", ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const profile = findInvestorProfileByUserId(user.id);
    if (!profile) return HttpResponse.json({ investor_profile: null });
    return HttpResponse.json({
      investor_profile: {
        ...profile,
        completed: investorOnboardingComplete(profile, user),
        reference: findAdminInvestorSeed(user.id)?.reference ?? null,
      },
    });
  }),

  // POST /api/v1/investor_profile (first save) and PATCH (subsequent saves)
  http.post("*/api/v1/investor_profile", async ({ request }) => upsertProfile(request)),
  http.patch("*/api/v1/investor_profile", async ({ request }) => upsertProfile(request)),

  // GET /api/v1/funds
  http.get("*/api/v1/funds", ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    if (user.has_investor_profile && !user.has_eam_profile && !disclosureAccess(user))
      return HttpResponse.json(
        { error: "Complete eligibility, NDA and required consents to review new opportunities." },
        { status: 403 },
      );
    return HttpResponse.json({
      funds: funds
        .filter(
          (f) =>
            (["luca", "ops", "investment_team"].includes(user.role) || f.state !== "draft") &&
            mayDiscover(user, f.id),
        )
        .map((f) =>
          ["luca", "ops", "investment_team"].includes(user.role)
            ? f
            : investorAudience(user)
              ? fundForSegment(
                  fundAsSeenBy(
                    { ...(currentVersion(f.id)?.snapshot ?? f), state: f.state },
                    user.id,
                  ),
                  segmentFor(user),
                )
              : { ...(currentVersion(f.id)?.snapshot ?? f), state: f.state },
        ),
    });
  }),

  // GET /api/v1/funds/:id
  http.get("*/api/v1/funds/:id", ({ params, request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const fund = findFundById(Number(params.id));
    if (!fund) return HttpResponse.json({ error: "Fund not found" }, { status: 404 });
    if (
      user.has_investor_profile &&
      !user.has_eam_profile &&
      !disclosureAccess(user) &&
      !subscriptions.some((s) => s.investor_id === user.id && s.fund_id === fund.id)
    )
      return HttpResponse.json({ error: "Disclosure access required" }, { status: 403 });
    if (fund.state === "draft" && !["luca", "ops", "investment_team"].includes(user.role))
      return HttpResponse.json({ error: "Fund not found" }, { status: 404 });
    if (!mayDiscover(user, fund.id) && !hasInvestmentHistory(user, fund.id))
      return HttpResponse.json(
        { error: "This fund variant is not available to your client class." },
        { status: 403 },
      );
    return HttpResponse.json({
      fund: ["luca", "ops", "investment_team"].includes(user.role)
        ? fund
        : investorAudience(user)
          ? fundForSegment(
              fundAsSeenBy(
                { ...(currentVersion(fund.id)?.snapshot ?? fund), state: fund.state },
                user.id,
              ),
              segmentFor(user),
            )
          : { ...(currentVersion(fund.id)?.snapshot ?? fund), state: fund.state },
    });
  }),

  // GET /api/v1/discover
  http.get("*/api/v1/discover", () => {
    return HttpResponse.json({ companies: discoverCompanies });
  }),

  // GET /api/v1/discover/:id
  http.get("*/api/v1/discover/:id", ({ params }) => {
    const company = findDiscoverCompanyById(Number(params.id));
    if (!company) return HttpResponse.json({ error: "Company not found" }, { status: 404 });
    return HttpResponse.json({ company });
  }),

  http.get("*/api/v1/portfolio/history", ({ request }) => {
    const user = currentUser(request);
    if (!user?.has_investor_profile) return unauthorized();
    return HttpResponse.json({ history: portfolioHistory(user) });
  }),

  http.get("*/api/v1/onboarding/documents", ({ request }) => {
    const user = currentUser(request);
    if (!user?.has_investor_profile) return unauthorized();
    return HttpResponse.json({
      documents: (verificationDocumentsByInvestor[user.id] ?? []).map((doc) => ({
        ...doc,
        file_data_url:
          documents.find((d) => d.id === doc.id && d.owner_id === user.id)?.file_data_url ?? null,
      })),
    });
  }),
  // The investor confirms a document their RM supplied on their behalf.
  http.post("*/api/v1/onboarding/documents/:id/confirm", ({ request, params }) => {
    const user = currentUser(request);
    if (!user?.has_investor_profile) return unauthorized();
    const doc = (verificationDocumentsByInvestor[user.id] ?? []).find(
      (d) => d.id === Number(params.id) && d.uploaded_by?.role === "rm",
    );
    if (!doc) return HttpResponse.json({ error: "Document not found" }, { status: 404 });
    doc.confirmed_at ??= new Date().toISOString();
    const row = documents.find((d) => d.id === doc.id);
    if (row) row.confirmed_at = doc.confirmed_at;
    recordAudit(user.id, `Investor ${user.email} confirmed a document supplied by their RM.`);
    persist();
    return HttpResponse.json({ document: doc });
  }),
  http.post("*/api/v1/onboarding/documents", async ({ request }) => {
    const user = currentUser(request);
    if (!user?.has_investor_profile) return unauthorized();
    const body = (await request.json()) as { name?: string; kind?: string; file_data_url?: string };
    if (
      !body.name?.trim() ||
      !["passport", "accreditation_letter"].includes(body.kind ?? "") ||
      !body.file_data_url ||
      !/^data:(application\/pdf|image\/(png|jpeg));base64,[A-Za-z0-9+/]+={0,2}$/.test(
        body.file_data_url,
      ) ||
      body.file_data_url.length > 2800000
    )
      return HttpResponse.json(
        { error: "Choose a PDF, PNG or JPEG document up to 2 MB and a valid document type." },
        { status: 422 },
      );
    const id = nextDocumentId();
    const doc = {
      id,
      document_type: body.kind!,
      status: "pending",
      notes: body.name.trim(),
      has_file: true,
      created_at: new Date().toISOString(),
    };
    (verificationDocumentsByInvestor[user.id] ??= []).push(doc);
    recordClientEvent(
      user.id,
      "documents",
      `Uploaded ${body.kind === "passport" ? "an identity document" : "accreditation evidence"}.`,
      body.name.trim() ? (findAdminInvestorSeed(user.id)?.full_name ?? user.email) : user.email,
    );
    const profile = findInvestorProfileByUserId(user.id);
    documents.push({
      id,
      name: body.name.trim(),
      kind: body.kind!,
      status: "action_required",
      review_state: "received",
      has_file: true,
      file_data_url: body.file_data_url,
      fund_id: null,
      fund_name: null,
      subscription_id: null,
      owner_id: user.id,
      owner_name: profile
        ? `${profile.first_name} ${profile.last_name}`.trim() || user.email
        : user.email,
      owner_email: user.email,
      created_at: doc.created_at,
    });
    persist();
    return HttpResponse.json({ document: doc });
  }),

  // GET /api/v1/holdings
  http.get("*/api/v1/holdings", ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const mine = holdings
      .filter((h) => h.investor_id === user.id)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(({ investor_id, ...holding }) => holding);
    return HttpResponse.json({ holdings: mine });
  }),

  // GET /api/v1/subscriptions
  http.get("*/api/v1/subscriptions", ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    // Once allocated, a subscription is converted into a Holding and drops
    // out of the investor's own active-subscriptions view — it stays in the
    // underlying record for LUCA's own reporting, just not surfaced here.
    const mine = subscriptions
      .filter((s) => s.investor_id === user.id && !s._convertedToHoldingId)
      .map(toSubscription);
    return HttpResponse.json({ subscriptions: mine });
  }),

  // POST /api/v1/subscriptions
  http.post("*/api/v1/subscriptions", async ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const body = (await request.json()) as { fund_id?: number; amount?: string };
    if (!body.fund_id || !body.amount) {
      return HttpResponse.json({ error: "fund_id and amount are required" }, { status: 422 });
    }
    const working = findFundById(body.fund_id);
    const published = currentVersion(body.fund_id);
    const fund =
      working && published
        ? fundForSegment(
            fundAsSeenBy({ ...published.snapshot, state: working.state }, user.id),
            segmentFor(user),
          )
        : undefined;
    if (working && !mayDiscover(user, working.id))
      return HttpResponse.json(
        {
          error:
            "This opportunity is not available for new subscriptions under your investor profile.",
        },
        { status: 403 },
      );
    if (!fund) return HttpResponse.json({ error: "Fund not found" }, { status: 404 });
    if (
      !user.has_investor_profile ||
      user.kyc_status !== "approved" ||
      user.nda_status !== "signed" ||
      !consentsForUser(user.id)
        .filter((c) => c.required)
        .every((c) => c.granted) ||
      fund.state !== "open"
    )
      return HttpResponse.json(
        {
          error: "Complete eligibility, signature and explicit consents; choose an open offering.",
        },
        { status: 422 },
      );
    const min = parseFloat(fund.min_subscription);
    const max = fund.max_subscription ? parseFloat(fund.max_subscription) : null;
    const amount = parseFloat(body.amount);
    if (
      !Number.isFinite(amount) ||
      Math.abs(
        (amount - min) / Number(fund.subscription_increment) -
          Math.round((amount - min) / Number(fund.subscription_increment)),
      ) > 0.000001 ||
      amount < min ||
      (max !== null && amount > max)
    ) {
      return HttpResponse.json(
        { error: "Amount is outside the allowed subscription range" },
        { status: 422 },
      );
    }
    const sub = createSubscription(user.id, body.fund_id, body.amount);
    sub.document_version_id = published!.id;
    sub.effective_terms = structuredClone(fund);
    sub.commercial_terms = commercialTerms(
      segmentFor(user),
      fundAsSeenBy(published!.snapshot, user.id),
    );
    const feeAcknowledgement = sub.acknowledgements.find((term) => term.key === "fees_disclosure");
    if (feeAcknowledgement)
      feeAcknowledgement.body += ` My ${sub.commercial_terms.segment === "independent" ? "independent" : "partner-referred"} profile subscription fee is ${sub.commercial_terms.subscriptionFeePct}%. Allocation consideration is ${sub.commercial_terms.allocationPriority === "partner_priority" ? "partner priority" : "standard"}, subject to LUCA's decision; no allocation is guaranteed.`;
    sub.subscription_fee = ((amount * Number(fund.subscription_fee_pct)) / 100).toFixed(2);
    sub.fund_name = fund.name;
    sub.asset_name = fund.asset.name;
    return HttpResponse.json({
      subscription: toSubscription(sub),
      wizard_step: wizardStepFor(sub),
      acknowledgements_complete: false,
    });
  }),

  // GET /api/v1/subscriptions/:id
  http.get("*/api/v1/subscriptions/:id", ({ params, request }) => {
    const sub = ownedSubscription(request, Number(params.id));
    if (!sub) return HttpResponse.json({ error: "Subscription not found" }, { status: 404 });
    return HttpResponse.json({
      subscription: toSubscription(sub),
      wizard_step: wizardStepFor(sub),
      acknowledgements_complete: acknowledgementsResponse(sub).complete,
    });
  }),

  // PATCH /api/v1/subscriptions/:id
  http.patch("*/api/v1/subscriptions/:id", async ({ params, request }) => {
    const sub = ownedSubscription(request, Number(params.id));
    if (!sub) return HttpResponse.json({ error: "Subscription not found" }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as { payment_declared?: boolean };
    if (body.payment_declared && sub.status === "reconciliation") {
      try {
        command(currentUser(request)!, { type: "declare-topup", id: sub.id });
      } catch (error) {
        return HttpResponse.json({ error: (error as Error).message }, { status: 422 });
      }
    } else if (body.payment_declared) {
      if (sub.on_hold)
        return HttpResponse.json({ error: "Subscription is on hold" }, { status: 422 });
      if (!["awaiting_funds", "payment_unmatched"].includes(sub.status))
        return HttpResponse.json(
          { error: "Funding is not available at this stage" },
          { status: 422 },
        );
      sub.payment_declared_at = new Date().toISOString();
      sub.payment_claimed = true;
      if (sub.status === "awaiting_funds") {
        sub.status = "payment_unmatched";
        sub.owner = "akula_ops";
        sub.next_action = "match_payment";
      }
    }
    return HttpResponse.json({
      subscription: toSubscription(sub),
      wizard_step: wizardStepFor(sub),
      acknowledgements_complete: acknowledgementsResponse(sub).complete,
    });
  }),

  // GET /api/v1/subscriptions/:id/acknowledgements
  http.get("*/api/v1/subscriptions/:id/acknowledgements", ({ params, request }) => {
    const sub = ownedSubscription(request, Number(params.id));
    if (!sub) return HttpResponse.json({ error: "Subscription not found" }, { status: 404 });
    return HttpResponse.json({ acknowledgements: acknowledgementsResponse(sub) });
  }),

  // POST /api/v1/subscriptions/:id/acknowledgements
  http.post("*/api/v1/subscriptions/:id/acknowledgements", async ({ params, request }) => {
    const sub = ownedSubscription(request, Number(params.id));
    if (!sub) return HttpResponse.json({ error: "Subscription not found" }, { status: 404 });
    const body = (await request.json()) as {
      acknowledgement?: { acknowledgement_term_id?: number };
    };
    const termId = body.acknowledgement?.acknowledgement_term_id;
    const term = sub.acknowledgements.find((t) => t.id === termId);
    if (!term)
      return HttpResponse.json({ error: "Acknowledgement term not found" }, { status: 404 });
    if (!["reserved", "documents_pending"].includes(sub.status))
      return HttpResponse.json({ error: "Signed acknowledgments are immutable" }, { status: 422 });
    term.accepted = true;
    term.accepted_at = new Date().toISOString();
    return HttpResponse.json({ acknowledgements: acknowledgementsResponse(sub) });
  }),

  // DELETE /api/v1/subscriptions/:id/acknowledgements/:termId
  http.delete("*/api/v1/subscriptions/:id/acknowledgements/:termId", ({ params, request }) => {
    const sub = ownedSubscription(request, Number(params.id));
    if (!sub) return HttpResponse.json({ error: "Subscription not found" }, { status: 404 });
    const term = sub.acknowledgements.find((t) => t.id === Number(params.termId));
    if (!term)
      return HttpResponse.json({ error: "Acknowledgement term not found" }, { status: 404 });
    if (!["reserved", "documents_pending"].includes(sub.status))
      return HttpResponse.json({ error: "Signed acknowledgments are immutable" }, { status: 422 });
    term.accepted = false;
    term.accepted_at = null;
    return HttpResponse.json({ acknowledgements: acknowledgementsResponse(sub) });
  }),

  // POST /api/v1/signwell/sign_subscription
  http.post("*/api/v1/signwell/sign_subscription", async ({ request }) => {
    const body = (await request.json()) as { subscription_id?: number };
    const sub = ownedSubscription(request, Number(body.subscription_id));
    if (!sub) return HttpResponse.json({ error: "Subscription not found" }, { status: 404 });

    if (!acknowledgementsResponse(sub).complete)
      return HttpResponse.json({ error: "Accept required acknowledgments first" }, { status: 422 });
    sub.document_version_id ||= currentVersion(sub.fund_id)?.id;
    if (sub.status === "reserved") {
      sub.status = "documents_pending";
      sub.owner = "investor";
      sub.next_action = "sign_documents";
      sub._signPollCount = 0;
    }

    const alreadySigned = sub.status !== "documents_pending";
    return HttpResponse.json({
      status: alreadySigned ? "signed" : "documents_pending",
      signing_url: alreadySigned ? undefined : "about:blank",
      subscription_id: sub.id,
      packet: {
        complete: alreadySigned,
        signed_count: alreadySigned ? 1 : 0,
        total_count: 1,
      },
    });
  }),

  // POST /api/v1/signwell/check_subscription
  http.post("*/api/v1/signwell/check_subscription", async ({ request }) => {
    const body = (await request.json()) as { subscription_id?: number };
    const sub = ownedSubscription(request, Number(body.subscription_id));
    if (!sub) return HttpResponse.json({ error: "Subscription not found" }, { status: 404 });

    if (sub.status === "reserved" || !acknowledgementsResponse(sub).complete)
      return HttpResponse.json(
        { error: "Start signing after completing acknowledgments" },
        { status: 422 },
      );
    if (sub.status === "documents_pending") {
      sub._signPollCount += 1;
      if (sub._signPollCount >= 2) {
        // EAM-submitted subscriptions go through institution review before
        // LUCA ever sees them; direct/self-serve subscriptions go straight
        // to LUCA. Neither status is in TRANSITIONS' manually-triggerable
        // set from documents_pending's perspective — this is the automatic
        // "signing completed" event, same pattern as the rest of this file.
        sub.status = sub.origin === "eam" ? "institution_review" : "under_luca_review";
        sub.owner = ownerFor(sub.status, sub.origin);
        sub.next_action = nextActionFor(sub.status);
        sub.confirmed_at = new Date().toISOString();
        recordSignature(sub, currentUser(request)!.email);
      }
    }

    const signed = sub.status !== "documents_pending";
    return HttpResponse.json({
      status: signed ? "signed" : "documents_pending",
      subscription_id: sub.id,
      packet: {
        complete: signed,
        signed_count: signed ? 1 : 0,
        total_count: 1,
      },
    });
  }),

  // POST /api/v1/signwell/nda_session
  http.post("*/api/v1/signwell/nda_session", ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    if (user.nda_status === "not_started") {
      user.nda_status = "pending";
      user._ndaPollCount = 0;
    }
    return HttpResponse.json({
      nda_status: user.nda_status,
      signing_url: user.nda_status === "signed" ? undefined : "about:blank",
    });
  }),

  // POST /api/v1/signwell/check_nda
  http.post("*/api/v1/signwell/check_nda", ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    if (user.nda_status === "pending") {
      user._ndaPollCount += 1;
      if (user._ndaPollCount >= 2) {
        user.nda_status = "signed";
        syncSeedFromAccount(user.id);
        recordClientEvent(
          user.id,
          "milestone",
          "Signed the NDA.",
          findAdminInvestorSeed(user.id)?.full_name ?? user.email,
        );
      }
    }
    return HttpResponse.json({ nda_status: user.nda_status });
  }),

  // GET /api/v1/persona/config
  http.get("*/api/v1/persona/config", ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    return HttpResponse.json({
      template_id: "itmpl_mock000000000000000000",
      environment_id: "env_mock00000000000000000000",
      reference_id: `investor-${user.id}`,
      inquiry_id: null,
    });
  }),

  // POST /api/v1/persona/complete
  http.post("*/api/v1/persona/complete", async ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    user.kyc_status = "pending";
    user._kycPollCount = 0;
    // Their submission reaches LUCA's review queue; LUCA's decision is what unlocks the next step.
    submitForReview(user.id);
    return HttpResponse.json({ success: true });
  }),

  // GET /api/v1/messages — communications LUCA has sent this investor directly.
  http.get("*/api/v1/messages", ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const messages = communicationRecipients
      .filter((r) => r.investor_id === user.id && r.delivered_at && r.routed_via === "investor")
      .map((r) => {
        const communication = communications.find((c) => c.id === r.communication_id);
        if (!communication || communication.status !== "sent") return null;
        return {
          id: communication.id,
          subject: communication.subject,
          body: communication.body,
          sent_at: r.delivered_at,
          read: r.opened_at !== null,
          fund_id: communication.fund_id,
          fund_name: communication.fund_id
            ? (findFundById(communication.fund_id)?.name ?? null)
            : null,
          attachments: [
            ...communication.attachment_document_ids
              .map((id) => documents.find((d) => d.id === id))
              .filter((d): d is NonNullable<typeof d> => Boolean(d))
              .map((d) => ({ id: d.id, name: d.name, file_data_url: d.file_data_url })),
            ...(communication.uploaded_attachments ?? []).map((file, index) => ({
              ...file,
              id: -(communication.id * 10 + index + 1),
            })),
          ],
          requests: documentRequests
            .filter((q) => q.communication_id === communication.id && q.investor_id === user.id)
            .map((q) => ({
              id: q.id,
              kind: q.kind,
              due_at: q.due_at,
              status: q.status,
            })),
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .sort((a, b) => new Date(b.sent_at!).getTime() - new Date(a.sent_at!).getTime());
    return HttpResponse.json({ messages });
  }),

  // POST /api/v1/messages/:id/read — opening a message records that the investor read it,
  // which LUCA sees in the communication's open rate.
  http.post("*/api/v1/messages/:id/read", ({ request, params }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const recipient = communicationRecipients.find(
      (r) =>
        r.communication_id === Number(params.id) &&
        r.investor_id === user.id &&
        r.routed_via === "investor" &&
        r.delivered_at &&
        communications.some((c) => c.id === r.communication_id && c.status === "sent"),
    );
    if (!recipient) return HttpResponse.json({ error: "Message not found" }, { status: 404 });
    if (!recipient.opened_at) recipient.opened_at = new Date().toISOString();
    return HttpResponse.json({ ok: true });
  }),

  // GET /api/v1/document_requests — what LUCA has asked this investor to provide.
  http.get("*/api/v1/document_requests", ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const mine = documentRequests
      .filter((r) => r.investor_id === user.id && r.status === "requested")
      .map((r) => ({
        ...r,
        fund_name: r.fund_id ? (findFundById(r.fund_id)?.name ?? null) : null,
      }));
    return HttpResponse.json({ requests: mine });
  }),

  // POST /api/v1/document_requests/:id/upload — send the requested document to LUCA for review.
  http.post("*/api/v1/document_requests/:id/upload", async ({ request, params }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const req = documentRequests.find(
      (r) => r.id === Number(params.id) && r.investor_id === user.id,
    );
    if (!req) return HttpResponse.json({ error: "Request not found" }, { status: 404 });
    if (req.status !== "requested")
      return HttpResponse.json({ error: "This request is no longer open." }, { status: 409 });
    const body = (await request.json().catch(() => ({}))) as UploadedFile;
    if (!validUploadedFile(body))
      return HttpResponse.json(
        { error: "Choose a PDF, PNG or JPEG file up to 2 MB." },
        { status: 422 },
      );
    const profile = findInvestorProfileByUserId(user.id);
    const ownerName = profile
      ? `${profile.first_name} ${profile.last_name}`.trim() || user.email
      : user.email;
    const doc = {
      id: nextDocumentId(),
      name: body.name.trim(),
      file_data_url: body.file_data_url,
      kind: req.kind,
      status: "submitted",
      review_state: "received" as const,
      has_file: true,
      fund_id: req.fund_id,
      fund_name: req.fund_id ? (findFundById(req.fund_id)?.name ?? null) : null,
      subscription_id: null,
      owner_id: user.id,
      owner_name: ownerName,
      owner_email: user.email,
      created_at: new Date().toISOString(),
    };
    documents.push(doc);
    req.status = "uploaded";
    req.received_document_id = doc.id;
    persist();
    return HttpResponse.json({ request: req });
  }),

  http.post("*/api/v1/documents", async ({ request }) => {
    const user = currentUser(request);
    if (!user?.has_investor_profile) return unauthorized();
    const body = (await request.json().catch(() => ({}))) as UploadedFile & {
      kind?: string;
      fund_id?: number | null;
    };
    if (!validUploadedFile(body) || !DOCUMENT_REQUEST_KINDS.some((k) => k.key === body.kind))
      return HttpResponse.json(
        { error: "Choose a document type and a PDF, PNG or JPEG file up to 2 MB." },
        { status: 422 },
      );
    if (body.fund_id != null && !hasInvestmentHistory(user, body.fund_id))
      return HttpResponse.json({ error: "Upload only for your own investments." }, { status: 403 });
    const profile = findInvestorProfileByUserId(user.id);
    const doc = {
      id: nextDocumentId(),
      name: body.name.trim(),
      kind: body.kind!,
      status: "submitted",
      review_state: "received" as const,
      has_file: true,
      file_data_url: body.file_data_url,
      fund_id: body.fund_id ?? null,
      fund_name: body.fund_id ? (findFundById(body.fund_id)?.name ?? null) : null,
      subscription_id: null,
      owner_id: user.id,
      owner_email: user.email,
      owner_name: profile ? `${profile.first_name} ${profile.last_name}`.trim() : user.email,
      created_at: new Date().toISOString(),
    };
    documents.push(doc);
    recordClientEvent(
      user.id,
      "documents",
      "Submitted a document for LUCA review.",
      doc.owner_name,
    );
    persist();
    return HttpResponse.json({ document: doc });
  }),

  // GET /api/v1/documents (optionally ?fund_id=:id) — without a fund_id this
  // is the investor's own document library, so it stays owner-scoped. With a
  // fund_id (the deal overview page), it also surfaces that fund's published,
  // not-tied-to-one-subscription materials (factsheet, memo, etc.), which
  // every investor browsing the deal should see, not just whoever's owner_id
  // the record happens to carry.
  http.get("*/api/v1/documents", ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const url = new URL(request.url);
    const fundId = url.searchParams.get("fund_id");
    if (!fundId) {
      return HttpResponse.json({ documents: documents.filter((d) => d.owner_id === user.id) });
    }
    if (!mayDiscover(user, Number(fundId)) && !hasInvestmentHistory(user, Number(fundId)))
      return HttpResponse.json({ error: "Opportunity access required" }, { status: 403 });
    const forFund = documents.filter(
      (d) =>
        d.fund_id === Number(fundId) &&
        ((d.subscription_id === null && d.review_state === "filed" && disclosureAccess(user)) ||
          d.owner_id === user.id),
    );
    return HttpResponse.json({ documents: forFund });
  }),

  // GET /api/v1/watchlist
  http.get("*/api/v1/watchlist", ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const mine = watchlist
      .filter((w) => w.user_id === user.id)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(({ user_id, ...item }) => item);
    return HttpResponse.json({ watchlist: mine });
  }),

  // POST /api/v1/watchlist
  http.post("*/api/v1/watchlist", async ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const body = (await request.json()) as { fund_id?: number };
    const fund = findFundById(Number(body.fund_id));
    if (!fund) return HttpResponse.json({ error: "Fund not found" }, { status: 404 });
    const existing = watchlist.find((w) => w.user_id === user.id && w.fund_id === fund.id);
    if (existing) return HttpResponse.json({ watchlist_item: existing });
    const item = {
      id: nextWatchlistId(),
      user_id: user.id,
      fund_id: fund.id,
      fund_name: fund.name,
      fund_codename: fund.codename,
      asset_name: fund.asset.name,
      sector: fund.asset.sector,
      state: fund.state,
      price: fund.price,
      min_subscription: fund.min_subscription,
      closes_at: fund.closes_at,
      added_at: new Date().toISOString(),
    };
    watchlist.push(item);
    return HttpResponse.json({ watchlist_item: item });
  }),

  // DELETE /api/v1/watchlist/:fundId
  http.delete("*/api/v1/watchlist/:fundId", ({ request, params }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const index = watchlist.findIndex(
      (w) => w.user_id === user.id && w.fund_id === Number(params.fundId),
    );
    if (index !== -1) watchlist.splice(index, 1);
    return HttpResponse.json({});
  }),

  // POST /api/v1/onboarding/skip
  http.post("*/api/v1/onboarding/skip", ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();

    if (findInvestorProfileByUserId(user.id)?.prepared_by_rm)
      return HttpResponse.json(
        { error: "Complete the client confirmation and LUCA approval first." },
        { status: 422 },
      );
    const profile = findInvestorProfileByUserId(user.id);
    if (profile) profile.skipped = true;
    return HttpResponse.json({});
  }),

  // GET /api/v1/tags
  http.get("*/api/v1/tags", () => {
    return HttpResponse.json({ tags });
  }),

  // GET /api/v1/fund_managers
  http.get("*/api/v1/fund_managers", () => {
    return HttpResponse.json({ fund_managers: fundManagers });
  }),

  // GET /api/v1/consents
  http.get("*/api/v1/consents", ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    return HttpResponse.json({ consents: consentsForUser(user.id) });
  }),

  // POST /api/v1/consents — grant one
  http.post("*/api/v1/consents", async ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const body = (await request.json()) as { consent_item_id?: number };
    if (!body.consent_item_id || !grantConsent(user.id, body.consent_item_id)) {
      return HttpResponse.json({ error: "Consent item not found" }, { status: 404 });
    }
    syncSeedFromAccount(user.id);
    const profile = findInvestorProfileByUserId(user.id);
    if (
      profile &&
      investorOnboardingComplete(profile, user) &&
      !clientEvents.some(
        (e) => e.investor_id === user.id && e.text.startsWith("Completed onboarding"),
      )
    )
      recordClientEvent(
        user.id,
        "milestone",
        "Completed onboarding: identity verified, NDA signed and consents granted. Ready to invest.",
        findAdminInvestorSeed(user.id)?.full_name ?? user.email,
      );
    return HttpResponse.json({ consents: consentsForUser(user.id) });
  }),

  // DELETE /api/v1/consents/:id — withdraw one
  http.delete("*/api/v1/consents/:id", ({ request, params }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    withdrawConsent(user.id, Number(params.id));
    return HttpResponse.json({ consents: consentsForUser(user.id) });
  }),

  http.post("*/api/v1/subscriptions/:id/information_response", async ({ params, request }) => {
    const user = currentUser(request);
    const sub = ownedSubscription(request, Number(params.id));
    if (!user || !sub)
      return HttpResponse.json({ error: "Subscription not found" }, { status: 404 });
    const body = (await request.json()) as { text?: string };
    try {
      command(user, { type: "respond-information", id: sub.id, text: body.text });
      return HttpResponse.json({
        subscription: toSubscription(sub),
        wizard_step: wizardStepFor(sub),
        acknowledgements_complete: acknowledgementsResponse(sub).complete,
      });
    } catch (error) {
      return HttpResponse.json({ error: (error as Error).message }, { status: 422 });
    }
  }),

  // POST /api/v1/subscriptions/:id/proceed_to_funding
  http.post("*/api/v1/subscriptions/:id/proceed_to_funding", ({ params, request }) => {
    const sub = ownedSubscription(request, Number(params.id));
    if (!sub) return HttpResponse.json({ error: "Subscription not found" }, { status: 404 });
    if (sub.status !== "approved") {
      return HttpResponse.json(
        { error: "This subscription hasn't been approved yet" },
        { status: 422 },
      );
    }
    sub.status = "awaiting_funds";
    sub.owner = ownerFor(sub.status, sub.origin);
    sub.next_action = nextActionFor(sub.status);
    return HttpResponse.json({
      subscription: toSubscription(sub),
      wizard_step: wizardStepFor(sub),
      acknowledgements_complete: acknowledgementsResponse(sub).complete,
    });
  }),

  // POST /api/v1/subscriptions/:id/refund_request
  http.post("*/api/v1/subscriptions/:id/refund_request", ({ params, request }) => {
    const sub = ownedSubscription(request, Number(params.id));
    if (!sub) return HttpResponse.json({ error: "Subscription not found" }, { status: 404 });
    if (sub.status !== "awaiting_funds") {
      return HttpResponse.json(
        { error: "Refunds can only be requested while awaiting funds" },
        { status: 422 },
      );
    }
    requestWithdrawal(sub);
    return HttpResponse.json({
      subscription: toSubscription(sub),
      wizard_step: wizardStepFor(sub),
      acknowledgements_complete: acknowledgementsResponse(sub).complete,
    });
  }),

  // POST /api/v1/subscriptions/:id/payment_proof
  http.post("*/api/v1/subscriptions/:id/payment_proof", async ({ params, request }) => {
    const sub = ownedSubscription(request, Number(params.id));
    if (!sub) return HttpResponse.json({ error: "Subscription not found" }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as { filename?: string };
    if (!body.filename) {
      return HttpResponse.json({ error: "A file is required" }, { status: 422 });
    }
    // Ops still confirms the match by hand — this just flags the subscription
    // as having evidence attached so it surfaces in their queue.
    sub.payment_claimed = true;
    return HttpResponse.json({
      subscription: toSubscription(sub),
      wizard_step: wizardStepFor(sub),
      acknowledgements_complete: acknowledgementsResponse(sub).complete,
    });
  }),
];

async function upsertProfile(request: Request) {
  const user = currentUser(request);
  if (!user) return unauthorized();
  const body = (await request.json()) as { investor_profile?: Record<string, unknown> };
  const patch = body.investor_profile ?? {};

  let profile = findInvestorProfileByUserId(user.id);
  if (!profile) {
    profile = {
      id: investorProfiles.length + 1,
      user_id: user.id,
      first_name: "",
      preferred_first_name: null,
      middle_name: null,
      last_name: "",
      suffix: null,
      nationality: null,
      date_of_birth: null,
      country: "",
      phone: "",
      interested_industries: null,
      typical_ticket_size: null,
      onboarding_step: 0,
      completed: false,
      skipped: false,
      channel: null,
      referral_code: null,
      accreditation_basis: null,
      eligibility_confirmed_at: null,
      eam_firm: null,
      eam_name: null,
    };
    investorProfiles.push(profile);
  }

  if (patch.channel !== undefined && patch.channel !== "direct" && patch.channel !== "eam_referred")
    return HttpResponse.json({ error: "Invalid investor channel" }, { status: 422 });
  // An account referred by a LUCA RM is partner-referred and tagged to that RM; the client
  // cannot switch to the independent (direct) schedule, and no partner code is needed.
  if ((profile.prepared_by_rm || profile.referral) && patch.channel === "direct")
    return HttpResponse.json(
      { error: "Your account was referred by your LUCA RM, so it stays partner-referred." },
      { status: 422 },
    );
  const nextChannel = patch.channel ?? profile.channel;
  const code = String(patch.referral_code ?? profile.referral_code ?? "")
    .trim()
    .toUpperCase();
  if (
    nextChannel === "eam_referred" &&
    !profile.eam_firm &&
    !profile.prepared_by_rm &&
    !profile.referral &&
    (patch.channel !== undefined || patch.referral_code !== undefined)
  ) {
    // A code typed by hand tags the client the same way a referral link does.
    if (!attachReferral(user.id, code, "code").ok)
      return HttpResponse.json(
        {
          error:
            "Enter a valid referral code to link your adviser. Demo codes: MERIDIAN, NIMBUS, STRAITS-FO, ORCHARD.",
        },
        { status: 422 },
      );
  }
  // Changing a commercial route does not silently transfer an existing servicing relationship.
  if (patch.referral_code !== undefined && profile.eam_firm && code) {
    const owner = findReferralCode(code);
    if (!owner || owner.partner_firm !== profile.eam_firm)
      return HttpResponse.json(
        { error: "This referral code does not match your existing institution." },
        { status: 422 },
      );
  }
  if (patch.channel !== undefined) delete user.investor_segment;
  const previousStep = profile.onboarding_step;
  const allowed = [
    "first_name",
    "preferred_first_name",
    "middle_name",
    "last_name",
    "suffix",
    "nationality",
    "date_of_birth",
    "country",
    "phone",
    "interested_industries",
    "typical_ticket_size",
    "onboarding_step",
    "channel",
    "referral_code",
    "accreditation_basis",
    "eligibility_confirmed_at",
  ];
  Object.assign(
    profile,
    Object.fromEntries(Object.entries(patch).filter(([key]) => allowed.includes(key))),
  );
  for (const client of adviserClients.filter((c) => c.investor_id === user.id)) {
    client.client_name = `${profile.first_name} ${profile.last_name}`.trim() || user.email;
    client.updated_at = new Date().toISOString();
  }
  // onboarding_step should only ever move forward.
  if (typeof patch.onboarding_step === "number") {
    profile.onboarding_step = Math.max(previousStep, patch.onboarding_step);
  }
  // Finishing personal information is the investor's confirmation of what their RM entered.
  if (
    profile.prepared_by_rm &&
    !profile.prepared_by_rm.confirmed_at &&
    profile.onboarding_step >= 4
  ) {
    profile.prepared_by_rm.confirmed_at = new Date().toISOString();
    recordAudit(
      user.id,
      `Investor ${user.email} reviewed and confirmed the details their RM entered.`,
    );
    persist();
  }

  syncSeedFromAccount(user.id);
  return HttpResponse.json({
    investor_profile: {
      ...profile,
      completed: investorOnboardingComplete(profile, user),
      reference: findAdminInvestorSeed(user.id)?.reference ?? null,
    },
  });
}
