import type { CommercialTerms } from "./investor-access";
import type { Fund, SubscriptionStatus } from "./types";

export type StaffRole = "luca" | "ops" | "rm";
export type Receipt = {
  id: number;
  subscriptionId: number;
  amount: number;
  currency: string;
  reference: string;
  matched: boolean;
  supersededBy?: number;
  at: string;
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
};
export type Version = {
  id: number;
  fundId: number;
  number: number;
  status: "draft" | "review" | "approved" | "published";
  snapshot: Fund;
  at: string;
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
  versions: Version[];
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
};
export type WorkflowView = WorkflowState & {
  actor: { id: number; role: string; email: string };
  clients: {
    id: number;
    code: string;
    name: string;
    type: "individual" | "entity";
    eamFirm?: string | null;
  }[];
  subscriptions: {
    commercial_terms?: CommercialTerms;
    id: number;
    investor_id: number;
    investor_name: string;
    fund_id: number;
    asset_name: string;
    amount: string;
    subscription_fee: string;
    payment_reference: string;
    currency: string;
    status: SubscriptionStatus;
    needsReview?: number;
    allocationBlockers: string[];
    issuanceBlockers: string[];
    on_hold: boolean;
    information_request_note: string | null;
    information_response_note?: string | null;
    information_responded_at?: string | null;
    topup_declared_at?: string | null;
    topup_matched_amount?: number;
    holdingId: number | null;
  }[];
  holdings: {
    id: number;
    investor_id: number;
    fund_id: number;
    asset_name: string;
    committed_amount: string;
    current_nav: string;
    nav_as_of: string | null;
    units: string;
  }[];
  funds: {
    id: number;
    name: string;
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
