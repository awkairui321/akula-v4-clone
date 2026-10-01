export type Asset = {
  id: number;
  name: string;
  codename: string | null;
  legal_name: string | null;
  description: string;
  sector: string;
  sub_sector: string | null;
  founded_year: number | null;
  country: string;
  country_of_incorporation: string | null;
  funding_stage: string;
  headquarters: string;
  employee_count: number;
  notable_investors: string[];
  total_capital_raised: string | null;
  company_structure: string | null;
  website: string;
  about: string | null;
  thesis: string | null;
  highlights: string[];
  risks: Array<{ title: string; body: string }>;
  team: Array<{ name: string; role: string; note?: string | null }>;
  developments: Array<{ date: string; text: string }>;
  funding_rounds: Array<{
    date: string;
    round: string;
    valuation: string;
    raised?: string;
    lead?: string;
  }>;
  /** One-line pitch shown under the company name on the deal overview page. */
  tagline: string | null;
  /** "At a glance" facts on the deal overview page. */
  typical_buyer: string | null;
  commercial_model: string | null;
  /** The 4 "how the company creates value" rows: customer problem, what it
   *  provides, who uses it, practical benefit — in that order, but the count
   *  is not enforced so a deal can publish fewer. */
  how_it_works: Array<{ label: string; text: string }>;
  /** A single named customer example, shown alongside the overview rows. */
  in_practice: {
    lead: string;
    text: string;
    tag: string | null;
    source_label: string | null;
    source_href: string | null;
  } | null;
  /** Market-context prose paragraphs, shown before the competitive table. */
  market_context: string[];
  competitive_landscape: Array<{ category: string; examples: string; text: string }>;
  /** Distinct from `thesis` above, which is the short intro paragraph — these
   *  are the numbered "why this stands out" points underneath it. */
  thesis_points: Array<{ title: string; text: string }>;
  /** "Who pays and for what" / "How pricing works" / "What drives growth". */
  business_columns: Array<{ title: string; text: string }>;
  /** Selected product-level figures that indicate scale without claiming to
   *  be a full revenue breakdown. */
  product_disclosures: Array<{ label: string; sub: string; value: string }>;
  product_disclosures_note: string | null;
  product_disclosures_source: string | null;
  /** Standalone operating indicators shown in Financials beyond the headline
   *  figures and the two charts (e.g. "positive free cash flow"). */
  financial_indicators: Array<{ value: string; label: string; source: string; word: boolean }>;
};

export type Tag = {
  id: number;
  name: string;
  category: string;
};

export type FundStatus =
  | "draft"
  | "open"
  | "closing"
  | "closed"
  | "holding"
  | "realized"
  | "cancelled";

export type Fund = {
  id: number;
  name: string;
  codename: string;
  descriptor: string;
  hook: string;
  /** Full deal lifecycle: draft (not visible to anyone) -> open (institutions
   *  and eligible investors can see + subscribe) -> closing (existing
   *  subscriptions still process, no new ones) -> closed -> holding -> realized. */
  state: FundStatus;
  /** Fund / SPV / Direct — the vehicle structure, distinct from deal_type below. */
  vehicle_type: "fund" | "spv" | "direct";
  deal_type: string;
  security_type: string;
  price: string;
  min_subscription: string;
  max_subscription: string | null;
  subscription_increment: string;
  subscription_fee_pct: string;
  management_fee_pct: string;
  carried_interest_pct: string;
  supply_total: string | null;
  supply_allocated: string;
  implied_valuation: string | null;
  premium_pct: string | null;
  closes_at: string | null;
  opened_at: string | null;
  /** Free text — LUCA's own expected-duration note, not a computed maturity date. */
  holding_period_note: string | null;
  comparable_basis: string;
  entry_multiple: string;
  comparable_note: string | null;
  key_metrics: Array<{ label: string; value: string; note: string | null }>;
  revenue_points: Array<{ period: string; value: string | null }>;
  peers: Array<{ name: string; multiple: string }>;
  activities: Array<{ date: string; text: string; kind: string }>;
  fund_manager: {
    id: number;
    name: string;
  };
  asset: Asset;
  share_class: {
    id: number;
    name: string;
    /** Ordinary / Preference / Convertible / Other. */
    class_type: string;
  };
  tags: Tag[];
  /** The deck/data-room material the deal overview page is built from. */
  primary_source: { title: string; meta: string; text: string } | null;
  figures_checked_note: string | null;
  figures_checked_links: Array<{ label: string; href: string }>;
  recording_available: boolean;
  recording_embed_url: string | null;
};

/** Mirrors Subscription::TRANSITIONS on the backend. Never widen this locally: */
/** the server is the only authority on which moves are legal. */
export type SubscriptionStatus =
  | "reserved"
  | "documents_pending"
  /** EAM/institution-submitted subscriptions only — skipped entirely for direct/self-serve. */
  | "institution_review"
  /** Also covers what LUCA calls "Submitted to LUCA" — arrival in the queue and being
   *  reviewed are the same persisted moment, matching how every other stage here works. */
  | "under_luca_review"
  | "information_requested"
  | "approved"
  | "awaiting_funds"
  | "payment_unmatched"
  | "reconciliation"
  | "allocation_pending"
  | "allocated"
  | "not_allocated"
  | "funds_returned"
  /** Pre-funding compliance decision — distinct from not_allocated (a funding/allocation failure). */
  | "rejected"
  | "cancelled";

export type SubscriptionOwner =
  | "luca"
  | "investor"
  | "akula_ops"
  | "administrator"
  | "complete"
  | "eam";

export const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  reserved: "Reserved",
  documents_pending: "Documents pending",
  institution_review: "Institution review",
  under_luca_review: "Under LUCA review",
  information_requested: "Information requested",
  approved: "Approved",
  awaiting_funds: "Awaiting funds",
  payment_unmatched: "Payment unmatched",
  reconciliation: "Reconciliation",
  allocation_pending: "Allocation pending",
  allocated: "Allocated",
  not_allocated: "Not allocated",
  funds_returned: "Funds returned",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

/** LUCA Command Dashboard pipeline stage labels — a coarser grouping than
 *  STATUS_LABELS for the pipeline bar chart specifically. "Funded" buckets
 *  every status between approval and issuance, since that machinery
 *  (payment matching/reconciliation) is one continuous ops workflow, not
 *  separate pipeline stages from LUCA's vantage point. */
export const LUCA_PIPELINE_STAGES: {
  key: string;
  label: string;
  statuses: SubscriptionStatus[];
}[] = [
  { key: "draft", label: "Draft", statuses: ["reserved"] },
  { key: "awaiting_signature", label: "Awaiting Signature", statuses: ["documents_pending"] },
  { key: "institution_review", label: "Institution Review", statuses: ["institution_review"] },
  { key: "under_luca_review", label: "Under LUCA Review", statuses: ["under_luca_review"] },
  {
    key: "information_requested",
    label: "Information Requested",
    statuses: ["information_requested"],
  },
  { key: "approved", label: "Approved", statuses: ["approved"] },
  {
    key: "funded",
    label: "Funded",
    statuses: ["awaiting_funds", "payment_unmatched", "reconciliation", "allocation_pending"],
  },
  { key: "active_holding", label: "Allocated", statuses: ["allocated"] },
];

export const OWNER_LABELS: Record<SubscriptionOwner, string> = {
  investor: "Investor",
  akula_ops: "Akula Ops",
  luca: "LUCA fund manager",
  administrator: "Administrator",
  complete: "Complete",
  eam: "EAM",
};

/** The stable keys the backend stores in next_action, rendered here so a copy */
/** change stays a frontend deploy. */
export const NEXT_ACTION_LABELS: Record<string, string> = {
  accept_acknowledgements: "Investor to accept acknowledgements",
  sign_documents: "Investor to sign documents",
  institution_to_review: "Institution to review",
  luca_to_review: "LUCA to review",
  respond_information_request: "Awaiting response to information request",
  proceed_to_funding: "Investor to proceed to funding",
  transfer_funds: "Investor to transfer funds",
  send_to_client: "EAM to send to client",
  match_payment: "Match the payment reference",
  reconcile_funds: "Reconcile funds in escrow",
  allocate_units: "Allocate units",
  return_funds: "Return funds to investor",
};

/** Statuses considered closed/terminal — no further pipeline progress expected. */
export const CLOSED_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  "not_allocated",
  "funds_returned",
  "rejected",
  "cancelled",
];

export type Subscription = {
  id: number;
  fund_id: number;
  fund_name: string;
  asset_name: string;
  amount: string;
  status: SubscriptionStatus;
  owner: string;
  next_action: string;
  subscription_fee: string;
  payment_reference: string;
  /** Paused in place by LUCA — does not change status, just excludes it from */
  /** "needs action" urgency while true. */
  on_hold: boolean;
  /** What LUCA said is missing/needed, set when status is information_requested. */
  information_request_note: string | null;
  information_requested_at: string | null;
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
};

export type AcknowledgementTerm = {
  id: number;
  key: string;
  version: number;
  position: number;
  required: boolean;
  body: string;
  accepted: boolean;
  accepted_at: string | null;
};

export type AcknowledgementsResponse = {
  required_count: number;
  accepted_count: number;
  complete: boolean;
  accepted_at: string | null;
  terms: AcknowledgementTerm[];
};

export type SubscriptionShowResponse = {
  subscription: Subscription;
  wizard_step: string;
  acknowledgements_complete: boolean;
};

export type Holding = {
  id: number;
  fund_id: number;
  fund_name: string;
  fund_codename: string;
  asset_name: string;
  sector: string;
  units: string;
  committed_amount: string;
  current_nav: string;
  nav_as_of: string | null;
  distributions: string;
  entry_price_per_share: string;
  state: string;
  subscribed_at: string | null;
  exit_date: string | null;
  exit_type: string | null;
  final_proceeds: string | null;
  moic: string | null;
};

/** Typed document kinds for deal materials (factsheet, offering memorandum, etc.). */
export const DEAL_DOCUMENT_KINDS: { value: string; label: string }[] = [
  { value: "factsheet", label: "Factsheet" },
  { value: "offering_memorandum", label: "Offering / investment memorandum" },
  { value: "subscription_agreement_template", label: "Subscription agreement template" },
  { value: "risk_disclosure", label: "Risk disclosure" },
  { value: "other", label: "Other" },
];

export type Document = {
  id: number;
  fund_id: number | null;
  fund_name: string | null;
  subscription_id: number | null;
  name: string;
  kind: string;
  status: string;
  has_file: boolean;
  /** A data: URL holding the actual uploaded bytes — this is a real (if */
  /** in-memory-only) upload pipeline, not a placeholder. Undefined/omitted */
  /** on responses where the caller doesn't need the payload (list views). */
  file_data_url?: string | null;
  created_at: string;
};

export type WatchlistItem = {
  id: number;
  fund_id: number;
  fund_name: string;
  fund_codename: string;
  asset_name: string;
  sector: string;
  state: string;
  price: string;
  min_subscription: string;
  closes_at: string | null;
  added_at: string;
};

export type DiscoverCompany = {
  id: number;
  name: string;
  codename: string | null;
  description: string;
  sector: string;
  sub_sector: string | null;
  founded_year: number | null;
  country: string;
  country_of_incorporation: string | null;
  legal_name: string | null;
  funding_stage: string;
  headquarters: string;
  employee_count: number;
  notable_investors: string[];
  total_capital_raised: string | null;
  company_structure: string | null;
  website: string;
  about: string | null;
  thesis: string | null;
  risks: Array<{ title: string; body: string }>;
};

export type InvestmentChannel = "direct" | "eam_referred";

export type ConsentItem = {
  id: number;
  key: string;
  title: string;
  body: string;
  required: boolean;
  /** Only shown for onboarding flows reached via that channel; "all" always applies. */
  channel: InvestmentChannel | "all";
  granted: boolean;
  granted_at: string | null;
};

export type ConsentsResponse = { consents: ConsentItem[] };

export const SECTOR_LABELS: Record<string, string> = {
  ai_machine_learning: "AI & Machine Learning",
  space_satellites: "Space & Satellites",
  defence_aerospace: "Defence & Aerospace",
  fintech_payments: "Fintech & Payments",
  enterprise_saas: "Enterprise SaaS",
  semiconductors: "Semiconductors",
  biotech_health: "Biotech & Health",
  climate_energy: "Climate & Energy",
  consumer_marketplaces: "Consumer & Marketplaces",
  robotics_automation: "Robotics & Automation",
  cybersecurity: "Cybersecurity",
  crypto_infrastructure: "Crypto Infrastructure",
};

export const STAGE_LABELS: Record<string, string> = {
  seed: "Seed",
  series_a: "Series A",
  series_b: "Series B",
  series_c: "Series C",
  series_d: "Series D",
  growth_stage: "Growth Stage",
  late_stage: "Late Stage",
  pre_ipo: "Pre-IPO",
};
