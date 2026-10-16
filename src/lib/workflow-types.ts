import type { DistributionEvent, DistributionInput } from "./distributions";
import type { CommercialTerms } from "./investor-access";
import type { Fund, GateEvent, SubscriptionStatus } from "./types";
import type { AcclimeMessage, NavRecord, RefundSummary, SubscriptionPack } from "./acclime";

export type StaffRole = "luca" | "investment_team" | "ops" | "rm";
export type Receipt = {
  id: number;
  subscriptionId: number;
  amount: number;
  currency: string;
  reference: string;
  matched: boolean;
  supersededBy?: number;
  at: string;
  /** Who reported the funds: Ops keyed it in, or Acclime (the fund administrator) confirmed it. */
  source?: "ops" | "acclime";
  /** The Acclime message this receipt came from, once the Acclime inbox exists. */
  acclimeMessageId?: number | null;
};
export type Allocation = {
  id: number;
  subscriptionId: number;
  principal: number;
  fee: number;
  price: number;
  at: string;
  voided?: boolean;
};
export type ReturnObligation = {
  id: number;
  subscriptionId: number;
  amount: number;
  status: "required" | "processing" | "failed" | "confirmed";
  at: string;
  /** Who confirmed the refund was paid: Ops through their own screens, or Acclime. */
  source?: "ops" | "acclime";
  /** The bank reference of the refund payment, when Acclime reported it. */
  reference?: string | null;
  acclimeMessageId?: number | null;
};
export type Version = {
  id: number;
  fundId: number;
  number: number;
  status: "draft" | "review" | "approved" | "published";
  snapshot: Fund;
  at: string;
  /** Investment Team member who sent this version to the Fund Manager. */
  submittedBy?: number;
  note?: string;
  /** Content that differs from the last published version, for the Fund Manager's review. */
  changed?: string[];
  decision?: { by: number; at: string; outcome: "published" | "returned"; text?: string };
  /** Filled in for the Fund Manager's review: what differs from the live version, right now. */
  diff?: DiffRow[];
  impact?: { subscribers: number; newOffering: boolean };
  checklist?: { label: string; done: boolean }[];
};
export type DiffRow = {
  label: string;
  before: string;
  after: string;
  /** Terms investors feel most: fees, price, valuation, minimum and closing date. */
  material: boolean;
  /** The Fund Manager edited this field after the Investment Team submitted it. */
  editedByManager: boolean;
};
/** An edit to a deal's working content. Ops edits route to the Investment Team only. */
export type DealChange = {
  id: number;
  fundId: number;
  by: number;
  byRole: "ops" | "investment_team" | "luca";
  fields: string[];
  at: string;
  /** The version the Investment Team submitted these edits in. */
  includedInVersion?: number;
};
export type Signature = {
  id: number;
  subscriptionId: number;
  versionId: number;
  name: string;
  at: string;
};
export type ServiceCase = {
  discussionId?: number;
  id: number;
  investorId: number;
  subscriptionId?: number;
  holdingId?: number;
  subject: string;
  owner: StaffRole | "eam";
  status: "open" | "resolved";
  at: string;
  messages: { actorId: number; text: string; at: string }[];
};
export type WorkflowState = {
  schema: 1;
  sequence: number;
  receipts: Receipt[];
  allocations: Allocation[];
  returns: ReturnObligation[];
  /** What Acclime has reported, the subscription packs sent and the monthly NAV: the Fund Manager's only. */
  acclimeMessages: AcclimeMessage[];
  packs: SubscriptionPack[];
  navRecords: NavRecord[];
  /** Income, returns of capital and exit proceeds paid to investors: the Fund Manager's only. */
  distributions: DistributionEvent[];
  versions: Version[];
  dealChanges: DealChange[];
  /** Working edits not yet in a version, for the Fund Manager and Investment Team. */
  unpublished: { fundId: number; fields: string[] }[];
  signatures: Signature[];
  assignments: { investorId: number; staffId: number }[];
  highlights: {
    id: number;
    investorId: number;
    staffId: number;
    versionId: number;
    note: string;
    at: string;
    openedAt?: string;
  }[];
  notes: {
    id: number;
    investorId: number;
    staffId: number;
    text: string;
    due?: string;
    done: boolean;
    at: string;
  }[];
  cases: ServiceCase[];
  requests: {
    id: number;
    investorId: number;
    company: string;
    key: string;
    currency: string;
    amount?: number;
    status: string;
    fundId?: number;
    at: string;
  }[];
  valuations: {
    id: number;
    holdingId: number;
    amount: number;
    currency: string;
    source: string;
    at: string;
  }[];
  secondary: {
    id: number;
    fundId: number;
    amount: number;
    currency: string;
    source: string;
    at: string;
  }[];
  events: { id: number; actorId: number; label: string; at: string }[];
};
export type WorkflowCommand = {
  type: string;
  id?: number;
  holdingId?: number;
  exposure?: string;
  target?: number;
  amount?: number;
  price?: number;
  currency?: string;
  text?: string;
  status?: string;
  due?: string;
  /** For recording a distribution: what is paid, and on what basis. */
  distribution?: DistributionInput;
};
export type WorkflowView = WorkflowState & {
  actor: { id: number; role: string; email: string };
  clients: {
    id: number;
    code: string;
    name: string;
    type: "individual" | "entity";
    eamFirm?: string | null;
    showcase?: boolean;
  }[];
  subscriptions: {
    paymentProofs: { id: number; name: string; file_data_url: string | null; created_at: string }[];
    commercial_terms?: CommercialTerms;
    id: number;
    investor_id: number;
    investor_name: string;
    fund_id: number;
    fund_name: string;
    asset_name: string;
    amount: string;
    subscription_fee: string;
    payment_reference: string;
    currency: string;
    status: SubscriptionStatus;
    needsReview?: number;
    /** LUCA's two decisions, recorded only in LUCA's console. */
    /** Where the refund stands, once the subscription has ended without acceptance. */
    refund?: RefundSummary | null;
    /** Acclime's due diligence result, which is its acceptance of the investor into the fund. */
    acclimeDueDiligence?: {
      result: "pass" | "fail" | "more_documents";
      at: string;
      note: string | null;
    } | null;
    fundsVerified?: GateEvent | null;
    allocationConfirmed?: GateEvent | null;
    /** What stops the funds being verified. Eligibility is checked later, at allocation. */
    verificationBlockers: string[];
    allocationBlockers: string[];
    reconciliationBlockers: string[];
    /** The unit price on the offering version the investor signed. */
    allocationPrice: number;
    issuanceBlockers: string[];
    on_hold: boolean;
    information_request_note: string | null;
    information_response_note?: string | null;
    information_responded_at?: string | null;
    topup_declared_at?: string | null;
    topup_matched_amount?: number;
    holdingId: number | null;
    approved_at?: string | null;
  }[];
  holdings: {
    id: number;
    investor_id: number;
    fund_id: number;
    asset_name: string;
    state: string;
    committed_amount: string;
    current_nav: string;
    nav_as_of: string | null;
    units: string;
  }[];
  funds: {
    id: number;
    name: string;
    /** The fund's own name within its project, for example "Solara Grid SPV I". */
    fundName?: string;
    /** The company's id; every fund in one project shares it. */
    assetId?: number;
    state: string;
    company: string;
    sector: string;
    descriptor: string;
    hook: string;
    minimum: string;
    closesAt: string | null;
    risks: string[];
  }[];
  storageWarning: string | null;
};
