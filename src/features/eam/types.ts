import type { ReviewBundle } from "@/lib/client-onboarding";
export type EamProfile = {
  id: number;
  firm_name: string;
  display_name: string;
  email: string;
  created_at: string;
};

export type AdviserClient = {
  id: number;
  investor_profile_id: number;
  client_name: string;
  client_email: string;
  stage: ClientStage;
  notes: string | null;
  created_at: string;
  updated_at: string;
  investor_user_id: number;
  client_code: string;
  showcase?: boolean;
};

export type ClientStage = "prospect" | "onboarding" | "active" | "inactive";

export const STAGE_LABELS: Record<ClientStage, string> = {
  prospect: "Prospect",
  onboarding: "Onboarding",
  active: "Active",
  inactive: "Inactive",
};

export type ServicingQueueItem = {
  id: number;
  client_name: string;
  stage: ClientStage;
  verification: string;
  highlights: string[];
  participation: number;
  updated_at: string;
};

export type DashboardData = {
  total_clients: number;
  verified_clients: number;
  total_participation: number;
  clients_by_stage: Record<ClientStage, number>;
  total_highlights: number;
  recent_highlights: Highlight[];
  servicing_queue: ServicingQueueItem[];
  investment_progress: EamProgressItem[];
  open_discussions: number;
};

export type EamProgressItem = {
  id: number;
  adviser_client_id: number;
  client_name: string;
  asset_name: string;
  amount: string;
  status: string;
};

export type Highlight = {
  id: number;
  adviser_client_id: number;
  client_name: string;
  fund_id: number;
  fund_name: string;
  rationale: string;
  created_at: string;
};

export type ClientDocument = {
  id: number;
  fund_id: number | null;
  subscription_id: number | null;
  name: string;
  kind: string;
  status: string;
  has_file: boolean;
  file_data_url?: string | null;
  created_at: string;
};

export type EamDocumentRow = ClientDocument & {
  adviser_client_id: number;
  client_name: string;
  fund_name: string | null;
};

export type ClientDetail = {
  client: AdviserClient;
  holdings: ClientHolding[];
  subscriptions: ClientSubscription[];
  documents: ClientDocument[];
  /** LUCA's onboarding record for this client, as their partner may read it. */
  onboarding?: ReviewBundle | null;
};

export type ClientHolding = {
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
  moic: string | null;
};

export type EamReportRow = ClientHolding & {
  adviser_client_id: number;
  client_name: string;
  client_code: string;
};

export type ClientSubscription = {
  holding_id: number | null;
  on_hold: boolean;
  information_request_note: string | null;
  id: number;
  fund_id: number;
  fund_name: string;
  asset_name: string;
  amount: string;
  status: string;
  subscription_fee: string;
  reserved_at: string | null;
  confirmed_at: string | null;
};

export type Discussion = {
  id: number;
  adviser_client_id: number;
  client_name: string;
  fund_id: number;
  fund_name: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type DiscussionDetail = Discussion & {
  messages: DiscussionMessage[];
};

export type DiscussionMessage = {
  id: number;
  sender_role: string;
  body: string;
  created_at: string;
};

export type EamRevenueTransaction = {
  id: number;
  project_name: string;
  client_name: string;
  reference: string | null;
  allocated_volume: number;
  fee_base_amount: number;
  share_pct: number;
  share_amount: number;
  status: "accrued" | "paid" | "pending";
  settlement_date: string | null;
  period: string | null;
};

export type EamRevenuePeriod = {
  id: number;
  period: string;
  status: "accrued" | "paid";
  amount: number;
};

export type EamRevenueData = {
  accrued: number;
  paid: number;
  pending: number;
  participation_volume: number;
  revenue_share_pct: number | null;
  client_subscription_fee_pct: number | null;
  periods: EamRevenuePeriod[];
  transactions: EamRevenueTransaction[];
};

export type EamFund = {
  id: number;
  name: string;
  codename: string;
  descriptor: string;
  hook: string;
  state: string;
  deal_type: string;
  price: string;
  currency: string;
  min_subscription: string;
  supply_total: string | null;
  supply_allocated: string;
  subscription_fee_pct: string | null;
  management_fee_pct: string | null;
  carried_interest_pct: string | null;
  closes_at: string | null;
  asset: {
    id: number;
    name: string;
    sector: string;
    sub_sector: string | null;
    funding_stage: string | null;
    country: string | null;
    description: string | null;
    about: string | null;
  };
  fund_manager: {
    id: number;
    name: string;
  };
};
