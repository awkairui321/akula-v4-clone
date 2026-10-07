import type { AdminInvestor } from "../features/admin/types";

/**
 * One client's journey from registration to onboarded, and who each step is visible to.
 * Shared by every portal so an action in one is the same record everywhere.
 */

/** How a client came to LUCA, and who gets credit for it. */
export type Referral = {
  /** The signup link or code used, if any. */
  code: string | null;
  via: "link" | "code" | "rm_invite" | "direct";
  /** The LUCA RM who referred or covers this client. */
  rm_id: number | null;
  /** The MFO or EAM that brought the client in. */
  partner_firm: string | null;
};

export type ClientEventKind =
  | "registered"
  | "referred"
  | "invited"
  | "prepared"
  | "documents"
  | "submitted"
  | "needs_info"
  | "approved"
  | "declined"
  | "reapplied"
  | "rm_assigned"
  | "milestone"
  | "message";

export type ClientEventAudience = "luca" | "rm" | "partner" | "investor";

export type ClientEvent = {
  id: number;
  investor_id: number;
  at: string;
  kind: ClientEventKind;
  text: string;
  /** Who did it, in words. */
  actor: string;
  /** Which parties may read this entry. LUCA always can. */
  audience: ClientEventAudience[];
};

export const ALL_PARTIES: ClientEventAudience[] = ["luca", "rm", "partner", "investor"];

export type ReviewDecision = "approve" | "request_info" | "decline";

export type ReviewDocument = {
  id: number;
  name: string;
  kind: string;
  created_at: string;
  has_file: boolean;
  /** Present so the reviewer can open the file; absent for records without one. */
  file_data_url: string | null;
  review_state: string;
  uploaded_by: { role: "rm" | "investor"; name: string } | null;
  confirmed_at: string | null;
};

/** Everything LUCA needs on one screen to decide on a client. */
export type ReviewBundle = {
  /** The client's row in LUCA's book, private notes removed, for stage and status wording. */
  summary: AdminInvestor;
  investor: {
    id: number;
    full_name: string;
    email: string;
    investor_type: "individual" | "institutional";
    reference: string | null;
    created_at: string;
    verification_status: string;
    identity_status: string;
    accreditation_status: string;
    accreditation_expiry: string | null;
    needs_info: boolean;
    decision_note: string | null;
    reviewed_by: string | null;
    approved_at: string | null;
    reapplied_at: string | null;
  };
  referral: Referral | null;
  rm: { id: number; label: string } | null;
  /** What the client entered themselves. */
  declared: {
    first_name: string;
    last_name: string;
    nationality: string | null;
    date_of_birth: string | null;
    country: string;
    phone: string;
    accreditation_basis: string[] | null;
    eligibility_confirmed_at: string | null;
    typical_ticket_size: string | null;
  };
  prepared_by_rm: string | null;
  /** Identity evidence and accreditation evidence, separated. */
  identity_documents: ReviewDocument[];
  accreditation_documents: ReviewDocument[];
  other_documents: ReviewDocument[];
  open_requests: { id: number; kind: string; due_at: string | null; note: string | null }[];
  checks: { nda_signed: boolean; consents_complete: boolean };
  events: ClientEvent[];
};

/** The investor's own view of their review. */
export type InvestorReviewStatus = {
  status: "not_submitted" | "in_review" | "needs_info" | "approved" | "declined";
  reference: string | null;
  note: string | null;
  decided_at: string | null;
  referred_by: { rm: string | null; partner: string | null } | null;
  can_reapply: boolean;
};

/** The sequence a client moves through, in order. */
export const ONBOARDING_STEPS = [
  { key: "invited", label: "Invited", waitingOn: "client" },
  { key: "details", label: "Completing details", waitingOn: "client" },
  { key: "documents", label: "Identity and documents", waitingOn: "client" },
  { key: "review", label: "Awaiting LUCA review", waitingOn: "luca" },
  { key: "needs_info", label: "Needs more information", waitingOn: "client" },
  { key: "declined", label: "Declined", waitingOn: "none" },
  { key: "onboarded", label: "Onboarded", waitingOn: "none" },
] as const;
