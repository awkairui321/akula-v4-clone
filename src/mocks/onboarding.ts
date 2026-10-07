import * as db from "./db";
import { assignClientToRm, persist, recordAudit, workflow } from "./workflow";
import {
  DEAL_MATERIAL_KINDS,
  DOCUMENT_REQUEST_KINDS,
  documentKindLabel,
} from "../lib/document-catalogue";
import type { AdminDocument } from "../features/admin/types";
import {
  ALL_PARTIES,
  type ClientEvent,
  type InvestorReviewStatus,
  type ReviewBundle,
  type ReviewDecision,
  type ReviewDocument,
} from "../lib/client-onboarding";

/**
 * The client journey, written once. Registering, being referred, submitting for review, and each
 * LUCA decision all go through here, so every portal reads the same records.
 */

const DAY = 24 * 60 * 60 * 1000;
const IDENTITY_KINDS = [
  "passport",
  "proof_of_address",
  "certificate_of_incorporation",
  "constitutional_documents",
  "ubo_declaration",
  "authorised_signatories",
  "trust_deed",
];
const ACCREDITATION_KINDS = ["accreditation_letter"];

export const rmLabel = (rmId: number | null | undefined) =>
  rmId ? (db.findUserById(rmId)?.email ?? `RM #${rmId}`) : null;

/** Tag a client with the RM and partner who referred them, and assign the RM. */
export function attachReferral(
  userId: number,
  code: string | null | undefined,
  via: "link" | "code" | "rm_invite" = "link",
  rmId?: number,
): { ok: true; label: string } | { ok: false } {
  const ref = db.findReferralCode(code);
  const seed = db.findAdminInvestorSeed(userId);
  const profile = db.findInvestorProfileByUserId(userId);
  if (!ref || !seed || !profile) return { ok: false };
  const coveringRm = rmId ?? ref.rm_id;
  const referral = { code: ref.code, via, rm_id: coveringRm, partner_firm: ref.partner_firm };
  profile.channel = "eam_referred";
  profile.referral_code = ref.code;
  profile.referral = referral;
  seed.referral = referral;
  if (ref.partner_firm) {
    const partner = db.partners.find((p) => p.firm_name === ref.partner_firm);
    const adviser =
      partner && db.users.find((u) => u.email === partner.contact_email && u.has_eam_profile);
    profile.eam_firm = ref.partner_firm;
    profile.eam_name = partner?.display_name ?? null;
    seed.eam_firm = ref.partner_firm;
    if (partner && !partner.clientInvestorIds.includes(userId))
      partner.clientInvestorIds.push(userId);
    if (
      adviser &&
      !db.adviserClients.some((c) => c.investor_id === userId && c.eam_user_id === adviser.id)
    )
      db.adviserClients.push({
        id: Math.max(0, ...db.adviserClients.map((c) => c.id)) + 1,
        investor_id: userId,
        investor_profile_id: profile.id,
        eam_user_id: adviser.id,
        client_name: seed.full_name,
        client_email: seed.email,
        stage: "onboarding",
        notes: `Referred through ${ref.code}.`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
  }
  assignClientToRm(userId, coveringRm);
  db.recordClientEvent(
    userId,
    "referred",
    ref.partner_firm
      ? `Referred by ${ref.partner_firm}, covered by ${rmLabel(coveringRm)}.`
      : `Referred by ${rmLabel(coveringRm)}.`,
    ref.label,
  );
  return { ok: true, label: ref.label };
}

/** Add a newly registered client to LUCA's book, with their RM and a first timeline entry. */
export function registerClient(userId: number, referralCode?: string | null) {
  const user = db.findUserById(userId);
  const profile = db.findInvestorProfileByUserId(userId);
  if (!user || !profile || db.findAdminInvestorSeed(userId)) return;
  db.addAdminInvestorSeed({
    id: userId,
    full_name: `${profile.first_name} ${profile.last_name}`.trim() || user.email,
    email: user.email,
    investor_type: "individual",
    country: profile.country || null,
    nationality: profile.nationality,
    onboarding_step: profile.onboarding_step,
    onboarding_completed_at: null,
    verification_status: "pending",
    identity_status: "not_started",
    accreditation_status: "not_started",
    accreditation_expiry: null,
    reviewed_at: null,
    nda_status: "not_started",
    eam_firm: null,
    internal_notes: "",
    registered_at: new Date().toISOString(),
    referral: { code: null, via: "direct", rm_id: null, partner_firm: null },
  });
  db.recordClientEvent(userId, "registered", "Registered with LUCA.", user.email);
  const referred = attachReferral(userId, referralCode, "link");
  if (!referred.ok) {
    const seed = db.findAdminInvestorSeed(userId)!;
    assignClientToRm(userId, db.defaultRmFor(seed));
  }
  persist();
}

/** The client has sent their identity and documents to LUCA. */
export function submitForReview(userId: number) {
  const seed = db.findAdminInvestorSeed(userId);
  if (!seed || seed.verification_status === "approved") return;
  const already = seed.verification_status === "in_review" && !seed.needs_info;
  seed.verification_status = "in_review";
  if (seed.identity_status === "not_started") seed.identity_status = "pending";
  if (seed.accreditation_status === "not_started") seed.accreditation_status = "pending";
  seed.needs_info = false;
  if (!already)
    db.recordClientEvent(
      userId,
      "submitted",
      "Submitted identity and documents for LUCA's review.",
      seed.full_name,
    );
  persist();
}

const sameClient = (viewer: db.MockUser, investorId: number) => viewer.id === investorId;

/** Timeline entries the viewer may read for one client. */
export function eventsFor(viewer: db.MockUser, investorId: number): ClientEvent[] {
  const all = db.clientEvents
    .filter((e) => e.investor_id === investorId)
    .sort((a, b) => a.at.localeCompare(b.at));
  if (viewer.role === "luca") return all;
  if (viewer.role === "rm")
    return workflow.assignments.some((a) => a.investorId === investorId && a.staffId === viewer.id)
      ? all.filter((e) => e.audience.includes("rm"))
      : [];
  if (viewer.has_eam_profile)
    return db.adviserClients.some(
      (c) => c.investor_id === investorId && c.eam_user_id === viewer.id,
    )
      ? all.filter((e) => e.audience.includes("partner"))
      : [];
  if (sameClient(viewer, investorId)) return all.filter((e) => e.audience.includes("investor"));
  return [];
}

const reviewDocument = (d: AdminDocument): ReviewDocument => ({
  id: d.id,
  name: d.name,
  kind: d.kind,
  created_at: d.created_at,
  has_file: d.has_file,
  file_data_url: d.file_data_url ?? null,
  review_state: d.review_state,
  uploaded_by: d.uploaded_by ? { role: d.uploaded_by.role, name: d.uploaded_by.name } : null,
  confirmed_at: d.confirmed_at ?? null,
});

/** A clearly labelled stand-in for the demo's made-up evidence files, so the viewer has something to show. */
const placeholderFile = (label: string, who: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="#f1f5f9" stroke="#94a3b8" stroke-dasharray="6 6"/><text x="320" y="170" font-family="sans-serif" font-size="22" fill="#334155" text-anchor="middle">${label}</text><text x="320" y="205" font-family="sans-serif" font-size="16" fill="#64748b" text-anchor="middle">${who}</text><text x="320" y="260" font-family="sans-serif" font-size="14" fill="#94a3b8" text-anchor="middle">DEMO PLACEHOLDER - not a real document</text></svg>`,
  )}`;

/** Evidence the investor submitted during verification, in the same shape as every other document. */
function verificationDocuments(investorId: number, who: string): ReviewDocument[] {
  return (db.verificationDocumentsByInvestor[investorId] ?? []).map((v) => ({
    id: -v.id,
    name: documentKindLabel(v.document_type),
    kind: v.document_type,
    created_at: v.created_at,
    has_file: v.has_file,
    file_data_url: v.has_file ? placeholderFile(documentKindLabel(v.document_type), who) : null,
    review_state: v.status,
    uploaded_by: v.uploaded_by ? { role: v.uploaded_by.role, name: v.uploaded_by.name } : null,
    confirmed_at: v.confirmed_at ?? null,
  }));
}

/** Everything the reviewer needs to decide on one client. */
export function reviewBundle(investorId: number): ReviewBundle | null {
  const seed = db.findAdminInvestorSeed(investorId);
  if (!seed) return null;
  const profile = db.findInvestorProfileByUserId(investorId);
  const user = db.findUserById(investorId);
  const onboardingKinds = DOCUMENT_REQUEST_KINDS.map((k) => k.key);
  const own = [
    ...db.documents
      .filter(
        (d) =>
          d.owner_id === investorId &&
          !DEAL_MATERIAL_KINDS.includes(d.kind) &&
          onboardingKinds.includes(d.kind),
      )
      .map(reviewDocument),
    ...verificationDocuments(investorId, seed.full_name),
  ];
  const rmId = workflow.assignments.find((a) => a.investorId === investorId)?.staffId ?? null;
  const row = db.adminInvestors().find((i) => i.id === seed.id)!;
  return {
    summary: { ...row, internal_notes: "" },
    investor: {
      id: seed.id,
      full_name: seed.full_name,
      email: seed.email,
      investor_type: seed.investor_type,
      reference: seed.reference ?? null,
      created_at: db.adminInvestors().find((i) => i.id === seed.id)!.created_at,
      verification_status: seed.verification_status,
      identity_status: seed.identity_status,
      accreditation_status: seed.accreditation_status,
      accreditation_expiry: seed.accreditation_expiry,
      needs_info: Boolean(seed.needs_info),
      decision_note: seed.decision_note ?? null,
      reviewed_by: seed.reviewed_by ?? null,
      approved_at: seed.approved_at ?? null,
      reapplied_at: seed.reapplied_at ?? null,
    },
    referral: seed.referral ?? null,
    rm: rmId ? { id: rmId, label: rmLabel(rmId)! } : null,
    declared: {
      first_name: profile?.first_name || seed.full_name.split(" ")[0] || "",
      last_name: profile?.last_name || seed.full_name.split(" ").slice(1).join(" "),
      nationality: profile?.nationality ?? seed.nationality,
      date_of_birth: profile?.date_of_birth ?? null,
      country: profile?.country ?? seed.country ?? "",
      phone: profile?.phone ?? "",
      accreditation_basis: profile?.accreditation_basis ?? null,
      eligibility_confirmed_at: profile?.eligibility_confirmed_at ?? null,
      typical_ticket_size: profile?.typical_ticket_size ?? null,
    },
    prepared_by_rm: profile?.prepared_by_rm?.rm_name ?? null,
    identity_documents: own.filter((d) => IDENTITY_KINDS.includes(d.kind)),
    accreditation_documents: own.filter((d) => ACCREDITATION_KINDS.includes(d.kind)),
    other_documents: own.filter(
      (d) => ![...IDENTITY_KINDS, ...ACCREDITATION_KINDS].includes(d.kind),
    ),
    open_requests: db.documentRequests
      .filter((r) => r.investor_id === investorId && r.status === "requested")
      .map((r) => ({ id: r.id, kind: r.kind, due_at: r.due_at, note: r.note })),
    checks: {
      nda_signed: user?.nda_status === "signed",
      consents_complete: db.allRequiredConsentsGranted(investorId),
    },
    events: db.clientEvents
      .filter((e) => e.investor_id === investorId)
      .sort((a, b) => a.at.localeCompare(b.at)),
  };
}

export type ReviewInput = {
  decision: ReviewDecision;
  identity?: "verified" | "failed" | "pending";
  accreditation?: "accredited" | "not_accredited" | "pending";
  accreditation_expires_at?: string | null;
  note?: string;
  request_kinds?: string[];
};

/** Record a LUCA decision and carry it to the client, the documents, the RM and the partner. */
export function applyReview(
  investorId: number,
  reviewer: db.MockUser,
  input: ReviewInput,
): { ok: true } | { ok: false; error: string } {
  const seed = db.findAdminInvestorSeed(investorId);
  if (!seed) return { ok: false, error: "Client not found." };
  const now = new Date().toISOString();
  const note = input.note?.trim() || null;
  const actor = "LUCA Fund Manager";
  const user = db.findUserById(investorId);

  if (input.decision === "approve") {
    if (input.identity !== "verified" || input.accreditation !== "accredited")
      return { ok: false, error: "Verify identity and accreditation before approving." };
    const expires = input.accreditation_expires_at
      ? new Date(input.accreditation_expires_at).toISOString()
      : new Date(Date.now() + 365 * DAY).toISOString();
    seed.identity_status = "verified";
    seed.accreditation_status = "accredited";
    seed.accreditation_expiry = expires;
    seed.verification_status = "approved";
    seed.needs_info = false;
    seed.reviewed_at = now;
    seed.approved_at = now;
    seed.reviewed_by = actor;
    seed.decision_note = note;
    seed.reference ??= db.nextReference();
    seed.onboarding_completed_at ??= now;
    if (user) user.kyc_status = "approved";
    for (const v of db.verificationDocumentsByInvestor[investorId] ?? [])
      if (v.status !== "rejected") v.status = "approved";
    for (const d of db.documents)
      if (
        d.owner_id === investorId &&
        [...IDENTITY_KINDS, ...ACCREDITATION_KINDS].includes(d.kind) &&
        d.review_state !== "filed"
      )
        d.review_state = "filed";
    db.recordClientEvent(
      investorId,
      "approved",
      `Approved by LUCA. Reference ${seed.reference} issued.${note ? ` ${note}` : ""}`,
      actor,
    );
    db.sendInvestorMessage(
      investorId,
      "You are approved to invest with LUCA",
      `Your identity and accreditation have been verified. Your client reference is ${seed.reference}. Please quote it in any message to LUCA, your relationship manager or your adviser.\n\nNext: sign the NDA and grant the required consents to see current opportunities.${note ? `\n\nNote from LUCA: ${note}` : ""}`,
    );
  } else if (input.decision === "request_info") {
    if (!note) return { ok: false, error: "Say what you need from the client." };
    seed.verification_status = "in_review";
    seed.needs_info = true;
    seed.decision_note = note;
    seed.reviewed_at = now;
    if (input.identity) seed.identity_status = input.identity;
    if (input.accreditation) seed.accreditation_status = input.accreditation;
    if (user) user.kyc_status = "pending";
    const kinds = (input.request_kinds ?? []).filter(
      (kind) =>
        !db.documentRequests.some(
          (r) => r.investor_id === investorId && r.kind === kind && r.status === "requested",
        ),
    );
    for (const kind of kinds)
      db.documentRequests.push({
        id: db.nextDocumentRequestId(),
        investor_id: investorId,
        kind,
        fund_id: null,
        note,
        requested_at: now,
        due_at: new Date(Date.now() + 7 * DAY).toISOString(),
        status: "requested",
        reminded_at: null,
        received_document_id: null,
        communication_id: null,
      });
    db.recordClientEvent(
      investorId,
      "needs_info",
      `LUCA asked for more information: ${note}`,
      actor,
    );
    db.sendInvestorMessage(
      investorId,
      "LUCA needs more information to approve you",
      `${note}\n\nPlease respond from your account. Once you have, LUCA will review again.`,
    );
  } else {
    if (!note) return { ok: false, error: "Give the client the reason." };
    seed.verification_status = "rejected";
    seed.needs_info = false;
    seed.decision_note = note;
    seed.reviewed_at = now;
    seed.reviewed_by = actor;
    if (input.identity === "verified" || input.identity === "failed")
      seed.identity_status = input.identity;
    if (input.accreditation === "accredited" || input.accreditation === "not_accredited")
      seed.accreditation_status = input.accreditation;
    if (user) user.kyc_status = "failed";
    db.recordClientEvent(investorId, "declined", `Declined by LUCA: ${note}`, actor);
    db.sendInvestorMessage(
      investorId,
      "Your application was not approved",
      `${note}\n\nYou can reapply from your account once the points above are resolved.`,
    );
  }
  recordAudit(reviewer.id, `${actor} ${input.decision.replace("_", " ")} for ${seed.full_name}.`);
  persist();
  return { ok: true };
}

/** A declined client, or one asked for more, sends their application back for review. */
export function resubmit(
  userId: number,
  note?: string,
): { ok: true } | { ok: false; error: string } {
  const seed = db.findAdminInvestorSeed(userId);
  if (!seed) return { ok: false, error: "No application found." };
  if (seed.verification_status !== "rejected" && !seed.needs_info)
    return { ok: false, error: "There is nothing to resubmit." };
  const wasDeclined = seed.verification_status === "rejected";
  seed.verification_status = "in_review";
  seed.identity_status = "pending";
  seed.accreditation_status = "pending";
  seed.needs_info = false;
  seed.reapplied_at = new Date().toISOString();
  const user = db.findUserById(userId);
  if (user) user.kyc_status = "pending";
  db.recordClientEvent(
    userId,
    "reapplied",
    `${wasDeclined ? "Reapplied after a decline" : "Responded to LUCA's request"}.${note?.trim() ? ` ${note.trim()}` : ""}`,
    seed.full_name,
  );
  persist();
  return { ok: true };
}

/** The client's own view of where their application stands. */
export function investorReviewStatus(userId: number): InvestorReviewStatus {
  const seed = db.findAdminInvestorSeed(userId);
  if (!seed)
    return {
      status: "not_submitted",
      reference: null,
      note: null,
      decided_at: null,
      referred_by: null,
      can_reapply: false,
    };
  const status =
    seed.verification_status === "approved"
      ? "approved"
      : seed.verification_status === "rejected"
        ? "declined"
        : seed.needs_info
          ? "needs_info"
          : seed.verification_status === "in_review"
            ? "in_review"
            : "not_submitted";
  const referral = seed.referral;
  return {
    status,
    reference: seed.reference ?? null,
    note:
      status === "declined" || status === "needs_info" || status === "approved"
        ? (seed.decision_note ?? null)
        : null,
    decided_at: seed.reviewed_at,
    referred_by:
      referral && (referral.partner_firm || referral.rm_id)
        ? { rm: rmLabel(referral.rm_id), partner: referral.partner_firm }
        : null,
    can_reapply: status === "declined" || status === "needs_info",
  };
}

/** What a partner sees of their own client's onboarding: standing, references, documents and their timeline. */
export function partnerOnboarding(viewer: db.MockUser, investorId: number) {
  const bundle = reviewBundle(investorId);
  if (!bundle) return null;
  return {
    ...bundle,
    summary: { ...bundle.summary, decision_note: null },
    investor: { ...bundle.investor, decision_note: null },
    events: eventsFor(viewer, investorId),
  };
}

export { ALL_PARTIES };
