import type { CommercialTerms } from "@/lib/investor-access";
import type { Holding } from "@/lib/types";

// Canonical source of truth: src/lib/types.ts (shared with the investor-facing
// Subscription type so both sides of the pipeline can never drift apart).
export {
  type SubscriptionStatus,
  type SubscriptionOwner,
  STATUS_LABELS,
  OWNER_LABELS,
  NEXT_ACTION_LABELS,
  CLOSED_SUBSCRIPTION_STATUSES,
} from "@/lib/types";
import type { SubscriptionStatus, SubscriptionOwner } from "@/lib/types";

export type AdminSubscription = {
  commercial_terms?: CommercialTerms;
  holding_id?: number | null;
  id: number;
  fund_id: number;
  fund_name: string;
  asset_name: string;
  amount: string;
  currency: string;
  status: SubscriptionStatus;
  owner: SubscriptionOwner;
  next_action: string;
  origin: string;
  subscription_fee: string;
  payment_reference: string | null;
  investor_id: number;
  investor_name: string;
  investor_email: string;
  eam_firm: string | null;
  eam_name: string | null;
  on_hold: boolean;
  information_request_note: string | null;
  information_requested_at: string | null;
  information_response_note?: string | null;
  information_responded_at?: string | null;
  rejection_reason: string | null;
  rejection_note: string | null;
  available_transitions: SubscriptionStatus[];
  /** Investor says they sent the money; nobody has confirmed receipt yet. */
  payment_claimed: boolean;
  reserved_at: string | null;
  confirmed_at: string | null;
  institution_reviewed_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
  funds_received_at: string | null;
  reconciled_at: string | null;
  allocated_at: string | null;
  payment_declared_at: string | null;
  created_at: string;
};

export type PaginationMeta = {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
};

export type SubscriptionsResponse = {
  subscriptions: AdminSubscription[];
  meta: PaginationMeta;
  summary: {
    total: number;
    needs_action: number;
    by_status: Partial<Record<SubscriptionStatus, number>>;
    payment_claimed: number;
    payment_claimed_value: string;
    unmatched_value: string;
    awaiting_allocation_value: string;
  };
};

export type BankTransfer = {
  id: number;
  amount: string;
  currency: string;
  raw_reference: string;
  sender_name: string | null;
  received_at: string;
  matched_subscription_id: number | null;
};

export type BankTransfersResponse = { bank_transfers: BankTransfer[] };

export type PlatformEvent = {
  id: number;
  kind:
    | "subscription_submitted"
    | "status_change"
    | "document_uploaded"
    | "communication_sent"
    | "deal_status_change";
  message: string;
  investor_id: number | null;
  fund_id: number | null;
  created_at: string;
};

export type ActivityResponse = { events: PlatformEvent[] };

export type BulkTransitionResponse = {
  subscriptions: AdminSubscription[];
  errors: Array<{ id: number; error: string }>;
};

export type VerificationStatus = "pending" | "in_review" | "approved" | "rejected";
export type IdentityStatus = "not_started" | "pending" | "verified" | "failed";
export type AccreditationStatus = "not_started" | "pending" | "accredited" | "not_accredited";

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  pending: "Pending",
  in_review: "In review",
  approved: "Approved",
  rejected: "Rejected",
};

export type AdminInvestor = {
  id: number;
  client_code: string;
  email: string;
  full_name: string;
  investor_type: "individual" | "institutional";
  country: string | null;
  nationality: string | null;
  onboarding_step: number | null;
  onboarding_completed_at: string | null;
  verification_status: VerificationStatus;
  identity_status: IdentityStatus;
  accreditation_status: AccreditationStatus;
  accreditation_expiry: string | null;
  reviewed_at: string | null;
  nda_status: string;
  eam_firm: string | null;
  /** LUCA's own private notes — never shown to the investor, EAM or RM. */
  internal_notes: string;
  committed_amount: string;
  open_subscriptions: number;
  created_at: string;
  /** Name of the LUCA RM who prepared this account, if it was RM-prepared. */
  prepared_by_rm?: string | null;
  invite_pending?: boolean;
};

export type InvestorsResponse = {
  investors: AdminInvestor[];
  meta: PaginationMeta;
  summary: {
    total: number;
    needs_review: number;
    approved: number;
    rejected: number;
    accreditation_expiring_30: number;
    accreditation_expiring_60: number;
    accreditation_expiring_90: number;
  };
};

export type AdminVerificationDocument = {
  id: number;
  document_type: string;
  status: string;
  notes: string | null;
  has_file: boolean;
  created_at: string;
};

export type InvestorDetailResponse = {
  investor: AdminInvestor;
  verification_documents: AdminVerificationDocument[];
  subscriptions: AdminSubscription[];
  holdings: Holding[];
};

export type DocumentReviewState = "received" | "reviewing" | "on_hold" | "filed";

export const REVIEW_STATE_LABELS: Record<DocumentReviewState, string> = {
  received: "New arrival",
  reviewing: "To review",
  on_hold: "On hold",
  filed: "Archived",
};

export type AdminDocument = {
  id: number;
  name: string;
  kind: string;
  status: string;
  review_state: DocumentReviewState;
  has_file: boolean;
  file_data_url?: string | null;
  fund_id: number | null;
  fund_name: string | null;
  subscription_id: number | null;
  owner_id: number;
  owner_name: string;
  owner_email: string;
  created_at: string;
  /** Who supplied the file when it was not the owner themselves (an RM acting for a client). */
  uploaded_by?: { id: number; role: "rm" | "investor"; name: string };
  /** When the owner confirmed an RM-supplied document. */
  confirmed_at?: string | null;
};

export type DocumentsResponse = {
  documents: AdminDocument[];
  meta: PaginationMeta;
  summary: { total: number; received: number; reviewing: number; on_hold: number; filed: number };
};

export type CommunicationAudienceType = "fund" | "individual" | "filtered_group";
export type CommunicationRouting = "direct" | "through_rm";
export type CommunicationStatus = "draft" | "scheduled" | "sent";

export type CommunicationRecipient = {
  email_status?: "pending_integration" | "scheduled";
  id: number;
  investor_id: number;
  investor_name: string;
  investor_email: string;
  eam_firm: string | null;
  routed_via: "investor" | "eam";
  delivered_at: string | null;
  opened_at: string | null;
  downloaded_document_ids: number[];
};

export type Communication = {
  delivery_channels?: ("email" | "inbox")[];
  purpose?: string;
  id: number;
  subject: string;
  body: string;
  audience_type: CommunicationAudienceType;
  audience_description: string;
  fund_id: number | null;
  routing: CommunicationRouting;
  attachment_document_ids: number[];
  status: CommunicationStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  recipient_count: number;
  delivered_count: number;
  opened_count: number;
  created_at: string;
};

export type CommunicationsResponse = {
  communications: Communication[];
  summary: { total: number; sent: number; scheduled: number; draft: number };
};

export type CommunicationDetailResponse = {
  communication: Communication;
  recipients: CommunicationRecipient[];
};

export type AdminPartner = {
  id: number;
  firm_name: string;
  display_name: string;
  contact_email: string;
  client_subscription_fee_pct: string | null;
  eam_revenue_share_pct: string | null;
  client_count: number;
  verified_client_count: number;
  allocated_volume: string;
  accrued_revenue: string;
  paid_revenue: string;
  created_at: string;
};

export type PartnersResponse = {
  partners: AdminPartner[];
  meta: PaginationMeta;
  summary: { total: number; total_clients: number; accrued_revenue: string };
};

export type PartnerClient = {
  id: number;
  investor_id: number;
  name: string;
  email: string;
  stage: string;
  onboarding_completed: boolean;
  authority_in_force: boolean;
};

export type PartnerDetailResponse = {
  partner: AdminPartner;
  clients: PartnerClient[];
  subscriptions: AdminSubscription[];
  revenue_periods: Array<{ id: number; period: string; amount: string; status: string }>;
};

/** Terms shown to one investor that differ from the standard published terms (null = standard). */
export type InvestorPricingRow = {
  id: number;
  fund_id: number;
  investor_id: number;
  price: string | null;
  subscription_fee_pct: string | null;
  management_fee_pct: string | null;
  carried_interest_pct: string | null;
  implied_valuation: string | null;
  note: string | null;
  updated_at: string;
  investor_name: string;
  investor_email: string;
  client_code: string;
  eam_firm: string | null;
};

export type PricingInvestorOption = {
  id: number;
  full_name: string;
  email: string;
  client_code: string;
  eam_firm: string | null;
};

export type InvestorPricingResponse = {
  overrides: InvestorPricingRow[];
  investors: PricingInvestorOption[];
};

/** A request for a client to provide a document, and where it stands. */
export type DocumentRequestRow = {
  id: number;
  investor_id: number;
  kind: string;
  fund_id: number | null;
  note: string | null;
  requested_at: string;
  due_at: string | null;
  status: "requested" | "uploaded" | "received" | "cancelled";
  reminded_at: string | null;
  received_document_id: number | null;
  investor_name: string;
  investor_email: string;
  client_code: string;
  investor_type: "individual" | "institutional";
  eam_firm: string | null;
  fund_name: string | null;
};
