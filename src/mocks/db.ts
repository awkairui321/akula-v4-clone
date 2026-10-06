import type { InvestorSegment, CommercialTerms } from "../lib/investor-access";
// ---------------------------------------------------------------------------
// In-memory mock database for the MSW mock API layer.
//
// This is the only backend the app has in this environment — there is no
// Rails API running anywhere. Everything here is mutable, in-memory, plain
// arrays/objects (no library), and mutations persist for the life of the
// browser tab (reload = fresh state).
//
// ---------------------------------------------------------------------------
// LOGIN CREDENTIALS (all passwords are "password123")
// ---------------------------------------------------------------------------
//   luca@akula.vc        — LUCA SGP (fund manager) portal
//   investor@akula.vc    — investor, onboarding complete, NDA signed, KYC
//                           approved. Has a subscription in every pipeline
//                           status and a few issued/realized holdings.
//   newinvestor@akula.vc — investor, fresh account, onboarding not started.
//   eam@akula.vc         — EAM adviser (Meridian Capital Advisors) with a
//                           client book, highlights and discussions.
//   dual@akula.vc        — EAM (Straits Family Office) *and* investor, but
//                           investor-side onboarding is deliberately
//                           incomplete. Exercises dual-profile routing.
// ---------------------------------------------------------------------------

import { clientCode } from "@/lib/client-code";
import type {
  Fund,
  Asset,
  Tag,
  Subscription,
  SubscriptionStatus,
  SubscriptionOwner,
  AcknowledgementTerm,
  Holding,
  WatchlistItem,
  DiscoverCompany,
  ConsentItem,
  InvestmentChannel,
} from "@/lib/types";
import type {
  AdminDocument,
  AdminInvestor,
  AdminPartner,
  PartnerClient,
  VerificationStatus,
  IdentityStatus,
  AccreditationStatus,
  BankTransfer,
} from "@/features/admin/types";
import type {
  EamProfile,
  AdviserClient,
  Highlight,
  Discussion,
  DiscussionMessage,
} from "@/features/eam/types";

// ---------------------------------------------------------------------------
// Users / auth
// ---------------------------------------------------------------------------

export type MockUser = {
  investor_segment?: InvestorSegment;
  id: number;
  email: string;
  password: string;
  role: "luca" | "investment_team" | "ops" | "rm" | "investor" | "eam";
  verified: boolean;
  two_factor_enabled: boolean;
  otp_secret: string | null;
  has_investor_profile: boolean;
  has_eam_profile: boolean;
  nda_status: "not_started" | "pending" | "signed";
  kyc_status: "not_started" | "pending" | "approved" | "failed";
  // internal polling counters, not exposed to the client
  _kycPollCount: number;
  _ndaPollCount: number;
};

export const users: MockUser[] = [
  {
    id: 1,
    email: "luca@akula.vc",
    password: "password123",
    role: "luca",
    verified: true,
    two_factor_enabled: false,
    otp_secret: null,
    has_investor_profile: false,
    has_eam_profile: false,
    nda_status: "not_started",
    kyc_status: "not_started",
    _kycPollCount: 0,
    _ndaPollCount: 0,
  },
  {
    id: 2,
    email: "investor@akula.vc",
    password: "password123",
    role: "investor",
    verified: true,
    two_factor_enabled: false,
    otp_secret: null,
    has_investor_profile: true,
    has_eam_profile: false,
    nda_status: "signed",
    kyc_status: "approved",
    _kycPollCount: 0,
    _ndaPollCount: 0,
  },
  {
    id: 3,
    email: "newinvestor@akula.vc",
    password: "password123",
    role: "investor",
    verified: false,
    two_factor_enabled: false,
    otp_secret: null,
    has_investor_profile: true,
    has_eam_profile: false,
    nda_status: "not_started",
    kyc_status: "not_started",
    _kycPollCount: 0,
    _ndaPollCount: 0,
  },
  {
    id: 4,
    email: "eam@akula.vc",
    password: "password123",
    role: "eam",
    verified: true,
    two_factor_enabled: false,
    otp_secret: null,
    has_investor_profile: false,
    has_eam_profile: true,
    nda_status: "not_started",
    kyc_status: "not_started",
    _kycPollCount: 0,
    _ndaPollCount: 0,
  },
  {
    id: 5,
    email: "dual@akula.vc",
    password: "password123",
    role: "eam",
    verified: true,
    two_factor_enabled: false,
    otp_secret: null,
    has_investor_profile: true,
    has_eam_profile: true,
    nda_status: "not_started",
    kyc_status: "not_started",
    _kycPollCount: 0,
    _ndaPollCount: 0,
  },
];

users.push(
  ...[
    { id: 6, email: "rm@akula.vc", role: "rm" as const },
    { id: 7, email: "ops@akula.vc", role: "ops" as const },
    { id: 8, email: "rm2@akula.vc", role: "rm" as const },
    { id: 9000, email: "investment@akula.vc", role: "investment_team" as const },
  ].map((u) => ({ ...users[0], ...u })),
);

const investmentTeamSeed = structuredClone(users.find((user) => user.role === "investment_team")!);

export function findUserByEmail(email: string): MockUser | undefined {
  return users.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

export function findUserById(id: number): MockUser | undefined {
  return users.find((u) => u.id === id);
}

// ---------------------------------------------------------------------------
// Investor profiles (onboarding.tsx / account.tsx)
// ---------------------------------------------------------------------------

export type MockInvestorProfile = {
  id: number;
  user_id: number;
  first_name: string;
  preferred_first_name: string | null;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  nationality: string | null;
  date_of_birth: string | null;
  country: string;
  phone: string;
  interested_industries: string[] | null;
  typical_ticket_size: string | null;
  onboarding_step: number;
  completed: boolean;
  /** Set by POST /api/v1/onboarding/skip — forces onboarding_completed regardless of step/NDA/KYC. */
  skipped: boolean;
  channel: InvestmentChannel | null;
  referral_code: string | null;
  accreditation_basis: string[] | null;
  eligibility_confirmed_at: string | null;
  /** Set when channel is "eam_referred" — which institution/RM subscriptions get attributed to. */
  eam_firm: string | null;
  eam_name: string | null;
};

export const investorProfiles: MockInvestorProfile[] = [
  {
    id: 1,
    user_id: 2,
    first_name: "Elena",
    preferred_first_name: "Lena",
    middle_name: "Marie",
    last_name: "Cross",
    suffix: null,
    nationality: "American",
    date_of_birth: "1985-04-12",
    country: "United States",
    phone: "+14155550142",
    interested_industries: [
      "ai_machine_learning",
      "space_satellites",
      "fintech_payments",
      "climate_energy",
    ],
    typical_ticket_size: "50k-150k",
    onboarding_step: 4,
    completed: true,
    skipped: false,
    channel: "direct",
    referral_code: null,
    accreditation_basis: ["net_personal_assets", "net_financial_assets"],
    eligibility_confirmed_at: "2024-11-02T09:00:00.000Z",
    eam_firm: null,
    eam_name: null,
  },
  {
    id: 2,
    user_id: 3,
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
  },
  {
    id: 3,
    user_id: 5,
    first_name: "Nadia",
    preferred_first_name: null,
    middle_name: null,
    last_name: "Farouk",
    suffix: null,
    nationality: "Singaporean",
    date_of_birth: "1990-11-02",
    country: "Singapore",
    phone: "+6591234567",
    interested_industries: null,
    typical_ticket_size: null,
    onboarding_step: 1,
    completed: false,
    skipped: false,
    channel: "eam_referred",
    referral_code: "STRAITS-FO",
    accreditation_basis: null,
    eligibility_confirmed_at: null,
    eam_firm: "Straits Family Office",
    eam_name: "Nadia Farouk",
  },
];

export function findInvestorProfileByUserId(userId: number): MockInvestorProfile | undefined {
  return investorProfiles.find((p) => p.user_id === userId);
}

// ---------------------------------------------------------------------------
// Consent items (onboarding.tsx consent step / account.tsx management mode)
// ---------------------------------------------------------------------------

type ConsentCatalogEntry = Pick<
  ConsentItem,
  "id" | "key" | "title" | "body" | "required" | "channel"
>;

const CONSENT_CATALOG: ConsentCatalogEntry[] = [
  {
    id: 1,
    key: "privacy_policy",
    title: "Privacy policy",
    body: "You consent to Akula collecting and processing your personal data as described in our privacy policy, including for KYC/AML checks.",
    required: true,
    channel: "all",
  },
  {
    id: 2,
    key: "electronic_communications",
    title: "Electronic communications",
    body: "You consent to receiving statements, notices and other account communications electronically rather than by post.",
    required: true,
    channel: "all",
  },
  {
    id: 3,
    key: "eam_data_sharing",
    title: "Share my data with my adviser",
    body: "You consent to Akula sharing your subscription status, holdings and documents with the adviser who referred you.",
    required: true,
    channel: "eam_referred",
  },
  {
    id: 4,
    key: "marketing_updates",
    title: "Marketing updates",
    body: "You consent to receiving occasional updates about new deals and platform features. You can withdraw this at any time.",
    required: false,
    channel: "all",
  },
];

/** {userId, consentItemId} -> granted_at. In-memory only, resets on reload. */
const consentGrants = new Map<string, string>();

function grantKey(userId: number, itemId: number): string {
  return `${userId}:${itemId}`;
}

// investor@akula.vc (user 2) is fully onboarded, so its required consents
// (channel "direct": privacy_policy, electronic_communications) are pre-granted.
consentGrants.set(grantKey(2, 1), "2024-11-02T09:05:00.000Z");
consentGrants.set(grantKey(2, 2), "2024-11-02T09:05:00.000Z");

function catalogFor(channel: InvestmentChannel | null): ConsentCatalogEntry[] {
  return CONSENT_CATALOG.filter((c) => c.channel === "all" || c.channel === channel);
}

export function consentsForUser(userId: number): ConsentItem[] {
  const profile = findInvestorProfileByUserId(userId);
  return catalogFor(profile?.channel ?? null).map((entry) => {
    const grantedAt = consentGrants.get(grantKey(userId, entry.id)) ?? null;
    return { ...entry, granted: grantedAt !== null, granted_at: grantedAt };
  });
}

export function allRequiredConsentsGranted(userId: number): boolean {
  return consentsForUser(userId)
    .filter((c) => c.required)
    .every((c) => c.granted);
}

export function grantConsent(userId: number, itemId: number): ConsentItem | null {
  const entry = CONSENT_CATALOG.find((c) => c.id === itemId);
  if (!entry) return null;
  consentGrants.set(grantKey(userId, itemId), new Date().toISOString());
  return consentsForUser(userId).find((c) => c.id === itemId) ?? null;
}

export function withdrawConsent(userId: number, itemId: number): void {
  consentGrants.delete(grantKey(userId, itemId));
}

// ---------------------------------------------------------------------------
// EAM profiles
// ---------------------------------------------------------------------------

export type MockEamProfile = EamProfile & {
  user_id: number;
  client_subscription_fee_pct: number;
  revenue_share_pct: number;
};

export const eamProfiles: MockEamProfile[] = [
  {
    id: 1,
    user_id: 4,
    firm_name: "Meridian Capital Advisors",
    display_name: "Aisha Tan",
    email: "eam@akula.vc",
    created_at: "2025-02-18T09:00:00.000Z",
    client_subscription_fee_pct: 4,
    revenue_share_pct: 30,
  },
  {
    id: 2,
    user_id: 5,
    firm_name: "Straits Family Office",
    display_name: "Nadia Farouk",
    email: "dual@akula.vc",
    created_at: "2025-05-03T09:00:00.000Z",
    client_subscription_fee_pct: 3.5,
    revenue_share_pct: 25,
  },
];

export function findEamProfileByUserId(userId: number): MockEamProfile | undefined {
  return eamProfiles.find((p) => p.user_id === userId);
}

// ---------------------------------------------------------------------------
// Fund managers / tags
// ---------------------------------------------------------------------------

// LUCA SGP is the licensed fund manager of record on every deal — Akula is
// the distribution platform, not the fund manager. Kept as a list (rather
// than a hardcoded constant) since the editor's "Fund manager" field expects
// one, but there is deliberately only one entry.
export const fundManagers = [{ id: 1, name: "LUCA SGP" }];

export const tags: Tag[] = [
  { id: 1, name: "High growth", category: "Strategy" },
  { id: 2, name: "Income-oriented", category: "Strategy" },
  { id: 3, name: "Late-stage", category: "Strategy" },
  { id: 4, name: "AI-native", category: "Sector" },
  { id: 5, name: "Regulated industry", category: "Risk profile" },
  { id: 6, name: "Pre-IPO", category: "Strategy" },
  { id: 7, name: "Capital intensive", category: "Risk profile" },
  { id: 8, name: "Founder-led", category: "Strategy" },
];

export function tagsFor(ids: number[]): Tag[] {
  return tags.filter((t) => ids.includes(t.id));
}

let tagAutoId = tags.length + 1;
/** Find a tag by name (case-insensitive) or create it. Custom tags have no preset category. */
export function findOrCreateTag(name: string): Tag {
  const trimmed = name.trim();
  const existing = tags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing;
  const tag: Tag = { id: tagAutoId++, name: trimmed, category: "Custom" };
  tags.push(tag);
  return tag;
}

// ---------------------------------------------------------------------------
// Per-investor pricing: the fund manager can show an individual investor
// different price / fees / valuation than the standard published terms.
// A null field means "use the standard published value".
// ---------------------------------------------------------------------------

export type InvestorPricing = {
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
};

export const investorPricing: InvestorPricing[] = [];

// ---------------------------------------------------------------------------
// Document requests: what the fund manager has asked a client to provide.
//   requested -> uploaded (client sent it, awaiting review) -> received (approved)
// ---------------------------------------------------------------------------

export type MockDocumentRequest = {
  id: number;
  investor_id: number;
  /** A key from the shared document catalogue (src/lib/document-catalogue.ts). */
  kind: string;
  fund_id: number | null;
  note: string | null;
  requested_at: string;
  due_at: string | null;
  status: "requested" | "uploaded" | "received" | "cancelled";
  reminded_at: string | null;
  received_document_id: number | null;
  /** The message that asked for it, if it was requested through the composer. */
  communication_id?: number | null;
};

export const documentRequests: MockDocumentRequest[] = [];
let documentRequestAutoId = 1;
export function nextDocumentRequestId(): number {
  return documentRequestAutoId++;
}
let investorPricingAutoId = 1;
export function nextInvestorPricingId(): number {
  return investorPricingAutoId++;
}
export function pricingFor(fundId: number, investorId: number): InvestorPricing | undefined {
  return investorPricing.find((p) => p.fund_id === fundId && p.investor_id === investorId);
}
/** The fund as one specific investor sees it: standard terms with their overrides applied. */
export function fundAsSeenBy<T extends { id: number }>(fund: T, investorId: number): T {
  const override = pricingFor(fund.id, investorId);
  if (!override) return fund;
  const patch: Record<string, string> = {};
  for (const key of [
    "price",
    "subscription_fee_pct",
    "management_fee_pct",
    "carried_interest_pct",
    "implied_valuation",
  ] as const) {
    const value = override[key];
    if (value !== null) patch[key] = value;
  }
  return { ...fund, ...patch };
}

// ---------------------------------------------------------------------------
// Funds (and embedded assets)
// ---------------------------------------------------------------------------

const now = Date.now();
const daysFromNow = (d: number) => new Date(now + d * 24 * 60 * 60 * 1000).toISOString();
const daysAgo = (d: number) => new Date(now - d * 24 * 60 * 60 * 1000).toISOString();

const solaraGrid: Asset = {
  id: 1,
  name: "Solara Grid",
  codename: null,
  legal_name: "Solara Grid Pte. Ltd.",
  description: "Grid-scale battery storage developer and operator across Southeast Asia.",
  sector: "climate_energy",
  sub_sector: "Battery storage",
  founded_year: 2018,
  country: "Singapore",
  country_of_incorporation: "Singapore",
  funding_stage: "series_c",
  headquarters: "Singapore",
  employee_count: 410,
  notable_investors: ["Temasek", "GIC", "Breakthrough Energy Ventures"],
  total_capital_raised: "$620M",
  company_structure: "Singapore holding company with regional operating subsidiaries",
  website: "https://solaragrid.example.com",
  about:
    "Solara Grid designs, builds and operates grid-scale battery storage facilities that firm up intermittent solar and wind generation across Singapore, Vietnam and Indonesia.\n\nThe company owns and operates its storage assets under long-term capacity contracts with regional utilities, giving it a contracted, multi-year revenue base rather than merchant power-price exposure.",
  thesis:
    "Southeast Asia's renewable build-out is outpacing grid flexibility. Solara Grid is the largest independent storage operator in the region and is positioned to capture a growing share of ancillary-services and capacity-contract revenue as more intermittent generation comes online.",
  highlights: [
    "480MWh of contracted storage capacity in operation, another 620MWh under construction",
    "Multi-year capacity contracts with three national utilities",
    "Backed by Temasek and Breakthrough Energy Ventures",
    "Management team from Fluence and Tesla Energy",
  ],
  risks: [
    {
      title: "Utility counterparty concentration",
      body: "Over 70% of contracted revenue sits with two national utilities; a renegotiation or default would materially affect cash flow.",
    },
    {
      title: "Battery cell input costs",
      body: "Lithium and nickel price swings affect the cost of new build-out, though signed contracts are largely insulated.",
    },
    {
      title: "Permitting and land access",
      body: "New sites require grid-connection approval and land rights that can slip project timelines by multiple quarters.",
    },
    {
      title: "Currency exposure",
      body: "Revenue is earned in multiple regional currencies against USD-denominated capital costs.",
    },
  ],
  team: [
    { name: "Wei Lin Koh", role: "Chief Executive Officer" },
    { name: "Marcus Andrade", role: "Chief Operating Officer" },
    { name: "Priyanka Rao", role: "Chief Financial Officer" },
  ],
  developments: [
    {
      date: daysAgo(20),
      text: "Commissioned a 120MWh site in Johor, Malaysia, ahead of schedule.",
    },
    {
      date: daysAgo(75),
      text: "Signed a 10-year capacity contract with PT Perusahaan Listrik Negara.",
    },
    { date: daysAgo(140), text: "Closed a $180M Series C led by Breakthrough Energy Ventures." },
  ],
  funding_rounds: [
    { date: "Nov 2021", round: "Series B", valuation: "$740M", raised: "$210M", lead: "GIC" },
    {
      date: "May 2024",
      round: "Series C",
      valuation: "$1.6B",
      raised: "$180M",
      lead: "Breakthrough Energy Ventures",
    },
    { date: "Mar 2026", round: "Series C-1", valuation: "$1.85B", raised: "$95M", lead: "Temasek" },
  ],
  tagline: "Firming up Southeast Asia's renewable grid, one contracted battery site at a time.",
  typical_buyer: "National and regional utilities buying multi-year capacity contracts",
  commercial_model: "Long-term capacity contracts plus ancillary-services revenue",
  how_it_works: [
    {
      label: "The grid problem",
      text: "Solar and wind generation is intermittent, but utilities need firm, dispatchable capacity to keep the grid stable as renewables scale up.",
    },
    {
      label: "What Solara Grid provides",
      text: "Grid-scale battery storage sites that a utility contracts under a multi-year capacity agreement, charging when generation is abundant and discharging on demand.",
    },
    {
      label: "Who uses it",
      text: "National utilities and grid operators sign the capacity contracts; Solara Grid's own operations team builds, owns and operates the physical sites.",
    },
    {
      label: "The practical benefit",
      text: "Utilities get firm capacity without owning storage assets themselves; Solara Grid gets contracted, multi-year revenue instead of merchant power-price exposure.",
    },
  ],
  in_practice: {
    lead: "A 10-year capacity contract turned a single Indonesian utility into Solara Grid's largest customer.",
    text: "PT Perusahaan Listrik Negara signed a 10-year capacity agreement covering a 120MWh site in Johor, giving Solara Grid a contracted revenue base through the mid-2030s rather than exposure to short-term power prices.",
    tag: "Company-reported customer example",
    source_label: null,
    source_href: null,
  },
  market_context: [
    "Southeast Asia's renewable capacity additions are outpacing the region's grid flexibility, creating demand for storage that can firm up intermittent generation.",
    "Utilities can meet that need by contracting independent storage operators, building and operating their own sites, or leaving the gap unaddressed and accepting curtailment risk.",
    "Solara Grid competes for utility contracts against both larger diversified energy groups and other independent storage developers active in the region.",
  ],
  competitive_landscape: [
    {
      category: "Diversified energy groups",
      examples: "AES, Fluence-backed regional developers",
      text: "Bring balance-sheet scale and existing utility relationships, but typically operate across many geographies rather than specializing in Southeast Asia.",
    },
    {
      category: "Independent storage developers",
      examples: "Regional pure-play battery developers",
      text: "Compete directly for the same utility capacity contracts; a utility may prefer their pricing or a longer operating track record.",
    },
    {
      category: "Utility self-build",
      examples: "In-house utility storage programmes",
      text: "Some utilities build and operate their own storage rather than contracting a third party, particularly for smaller sites.",
    },
  ],
  thesis_points: [
    {
      title: "Contracted, not merchant, revenue",
      text: "Long-term capacity contracts with national utilities insulate most revenue from short-term power-price swings.",
    },
    {
      title: "Regional scale advantage",
      text: "The largest independent storage operator in its markets, which may help win the next round of utility contracts as more renewables come online.",
    },
    {
      title: "Operating team from established storage players",
      text: "Leadership from Fluence and Tesla Energy brings a track record of deploying grid-scale storage at commercial scale.",
    },
  ],
  business_columns: [
    {
      title: "Who pays and for what",
      text: "National and regional utilities pay under multi-year capacity contracts for guaranteed access to Solara Grid's storage capacity.",
    },
    {
      title: "How pricing works",
      text: "Contracts typically combine a fixed capacity payment with variable ancillary-services revenue tied to grid dispatch.",
    },
    {
      title: "What drives growth",
      text: "New site commissioning and additional utility contracts grow revenue; delayed permitting or contract renegotiation can slow it.",
    },
  ],
  product_disclosures: [
    { label: "Contracted storage capacity", sub: "In operation", value: "480MWh" },
    { label: "Under construction", sub: "Additional contracted capacity", value: "620MWh" },
  ],
  product_disclosures_note: "Capacity figures indicate scale, not revenue recognized to date.",
  product_disclosures_source: "Company update, most recent quarter",
  financial_indicators: [
    {
      value: "3",
      label: "National utilities under multi-year capacity contract",
      source: "Company disclosure",
      word: false,
    },
    {
      value: "Contracted",
      label: "Revenue basis, not merchant power pricing",
      source: "Company disclosure",
      word: true,
    },
  ],
};

const kestrelRobotics: Asset = {
  id: 2,
  name: "Kestrel Robotics",
  codename: null,
  legal_name: "Kestrel Robotics, Inc.",
  description: "Autonomous mobile robots for warehouse fulfilment and last-mile sortation.",
  sector: "robotics_automation",
  sub_sector: "Warehouse automation",
  founded_year: 2016,
  country: "United States",
  country_of_incorporation: "United States",
  funding_stage: "series_d",
  headquarters: "Austin, Texas",
  employee_count: 890,
  notable_investors: ["Sequoia Capital", "Tiger Global", "Fidelity"],
  total_capital_raised: "$540M",
  company_structure: "Delaware C-Corp",
  website: "https://kestrelrobotics.example.com",
  about:
    "Kestrel Robotics builds fleets of autonomous mobile robots that automate picking, sortation and inventory movement inside third-party logistics warehouses.\n\nThe company sells its fleet as a service, billed per unit moved, and now operates in over 140 fulfilment centres across North America and Europe.",
  thesis:
    "Warehouse labour shortages and rising fulfilment volumes are accelerating adoption of robotics-as-a-service. Kestrel has the largest deployed fleet among independent (non-Amazon-owned) providers and a usage-based model that scales with customer volume.",
  highlights: [
    "Fleet of 38,000 robots deployed across 140+ warehouses",
    "92% gross retention across its top 50 logistics customers",
    "Usage-based pricing model with expanding net revenue retention",
    "Secondary transaction priced at a discount to last primary round",
  ],
  risks: [
    {
      title: "Customer concentration in 3PL",
      body: "A small number of large third-party logistics customers account for a meaningful share of deployed fleet.",
    },
    {
      title: "Hardware margin pressure",
      body: "Robot bill-of-materials costs compress gross margin until utilization-based software revenue scales.",
    },
    {
      title: "Competitive intensity",
      body: "Amazon Robotics, Locus Robotics and several well-funded entrants are competing for the same warehouse floor space.",
    },
  ],
  team: [
    { name: "Daniel Osei", role: "Chief Executive Officer" },
    { name: "Hana Fujimoto", role: "Chief Technology Officer" },
    { name: "Robert Lindqvist", role: "Chief Revenue Officer" },
  ],
  developments: [
    { date: daysAgo(15), text: "Announced expansion into UK and German fulfilment centres." },
    { date: daysAgo(60), text: "Crossed 38,000 robots in active deployment." },
    { date: daysAgo(200), text: "Closed a $150M Series D at a $3.9B valuation." },
  ],
  funding_rounds: [
    {
      date: "Jun 2022",
      round: "Series C",
      valuation: "$2.1B",
      raised: "$120M",
      lead: "Tiger Global",
    },
    {
      date: "Sep 2024",
      round: "Series D",
      valuation: "$3.9B",
      raised: "$150M",
      lead: "Sequoia Capital",
    },
  ],
  tagline: "Robots-as-a-service for the warehouse floor, billed by the unit moved.",
  typical_buyer: "Third-party logistics operators and large-format fulfilment centres",
  commercial_model: "Usage-based fleet-as-a-service, billed per unit moved",
  how_it_works: [
    {
      label: "The warehouse problem",
      text: "Fulfilment volumes keep rising while warehouse labour is scarce and expensive, leaving operators short of picking and sortation capacity.",
    },
    {
      label: "What Kestrel Robotics provides",
      text: "A fleet of autonomous mobile robots that handle picking, sortation and inventory movement, deployed and billed as a service rather than sold outright.",
    },
    {
      label: "Who uses it",
      text: "Third-party logistics operators and large fulfilment centres integrate the fleet into existing warehouse operations without owning the hardware.",
    },
    {
      label: "The practical benefit",
      text: "Operators add picking capacity without a large upfront capital purchase, and pricing scales with the volume they actually move.",
    },
  ],
  in_practice: {
    lead: "A top-50 logistics customer expanded its deployment as fulfilment volume grew through peak season.",
    text: "One of Kestrel's largest 3PL customers increased its deployed fleet size during a peak seasonal surge, using the usage-based model to add capacity temporarily rather than purchasing additional hardware outright.",
    tag: "Company-reported customer example",
    source_label: null,
    source_href: null,
  },
  market_context: [
    "Warehouse operators face a persistent labour shortage alongside rising e-commerce fulfilment volumes, pushing many toward automation.",
    "Robotics-as-a-service lowers the upfront cost of adoption compared with buying and integrating fixed automation, which broadens the addressable customer base.",
    "Kestrel competes against both large in-house programmes at the biggest fulfilment operators and other independent robotics vendors.",
  ],
  competitive_landscape: [
    {
      category: "In-house fulfilment automation",
      examples: "Amazon Robotics",
      text: "The largest fulfilment operators build their own automation and are not addressable customers for third-party fleets.",
    },
    {
      category: "Independent robotics vendors",
      examples: "Locus Robotics and other AMR providers",
      text: "Compete directly for the same third-party logistics customers on fleet performance, pricing and integration effort.",
    },
    {
      category: "Fixed automation integrators",
      examples: "Conveyor and sortation system vendors",
      text: "Offer a different automation approach that may suit high-volume, low-change facilities better than flexible mobile robots.",
    },
  ],
  thesis_points: [
    {
      title: "Largest independent deployed fleet",
      text: "38,000 robots across 140+ warehouses gives Kestrel a scale and data advantage among non-Amazon-owned providers.",
    },
    {
      title: "Usage-based pricing aligns with customer volume",
      text: "Billing per unit moved lets revenue scale with customer fulfilment volume rather than a fixed hardware sale.",
    },
    {
      title: "High retention among top customers",
      text: "92% gross retention across its top 50 logistics customers suggests the fleet becomes embedded in daily operations once deployed.",
    },
  ],
  business_columns: [
    {
      title: "Who pays and for what",
      text: "Third-party logistics operators and fulfilment centres pay for access to the deployed robot fleet and its software.",
    },
    {
      title: "How pricing works",
      text: "Billing is usage-based, charged per unit moved, so cost scales with the customer's actual fulfilment volume.",
    },
    {
      title: "What drives growth",
      text: "More deployed robots and higher customer volume increase revenue; margin also depends on robot bill-of-materials cost.",
    },
  ],
  product_disclosures: [
    { label: "Deployed fleet size", sub: "Active robots in operation", value: "38,000" },
    { label: "Warehouses served", sub: "Across North America and Europe", value: "140+" },
  ],
  product_disclosures_note: "Fleet-size figures indicate deployment scale, not revenue recognized.",
  product_disclosures_source: "Company disclosure",
  financial_indicators: [
    {
      value: "92%",
      label: "Gross retention across top 50 logistics customers",
      source: "Company disclosure",
      word: false,
    },
  ],
};

const orbisSpace: Asset = {
  id: 3,
  name: "Orbis Space Systems",
  codename: null,
  legal_name: "Orbis Space Systems Ltd.",
  description: "Small-satellite manufacturer and Earth-observation constellation operator.",
  sector: "space_satellites",
  sub_sector: "Earth observation",
  founded_year: 2015,
  country: "United Kingdom",
  country_of_incorporation: "United Kingdom",
  funding_stage: "series_c",
  headquarters: "London, United Kingdom",
  employee_count: 520,
  notable_investors: ["Lockheed Martin Ventures", "In-Q-Tel", "Balderton Capital"],
  total_capital_raised: "$410M",
  company_structure: "UK public limited company (pre-listing)",
  website: "https://orbisspace.example.com",
  about:
    "Orbis Space Systems designs and manufactures small Earth-observation satellites and operates a 64-satellite constellation delivering daily sub-metre imagery to government and commercial customers.\n\nThe company both sells satellites to government space agencies and sells imagery and analytics subscriptions from its own constellation.",
  thesis:
    "Demand for high-frequency Earth-observation imagery is growing across defence, agriculture and insurance use cases. Orbis is one of a small number of vertically integrated operators that both builds satellites and monetises the resulting data.",
  highlights: [
    "64-satellite constellation delivering daily global revisit",
    "Long-term imagery contracts with two G7 defence ministries",
    "Vertically integrated: builds its own satellite buses in-house",
    "Backed by Lockheed Martin Ventures and In-Q-Tel",
  ],
  risks: [
    {
      title: "Launch dependency",
      body: "Constellation replenishment depends on third-party launch providers; a launch failure or delay can degrade coverage.",
    },
    {
      title: "Government budget cycles",
      body: "A meaningful share of contracted revenue is tied to annual defence and government budget approvals.",
    },
    {
      title: "Capital intensity",
      body: "Satellite manufacturing and launch require continued heavy capital expenditure ahead of an eventual public listing.",
    },
    {
      title: "Export control exposure",
      body: "Imaging technology is subject to UK and allied export-control regimes that can restrict certain customers.",
    },
  ],
  team: [
    { name: "Charlotte Ibbotson", role: "Chief Executive Officer" },
    { name: "Rajiv Malhotra", role: "Chief Technology Officer" },
    { name: "Simone Vasseur", role: "Chief Financial Officer" },
  ],
  developments: [
    {
      date: daysAgo(10),
      text: "Launched 8 additional satellites, completing the 64-satellite constellation.",
    },
    {
      date: daysAgo(95),
      text: "Extended imagery contract with UK Ministry of Defence through 2029.",
    },
    { date: daysAgo(180), text: "Opened a second satellite manufacturing line in Glasgow." },
  ],
  funding_rounds: [
    {
      date: "Jan 2021",
      round: "Series B",
      valuation: "$610M",
      raised: "$95M",
      lead: "Balderton Capital",
    },
    {
      date: "Aug 2023",
      round: "Series C",
      valuation: "$1.4B",
      raised: "$140M",
      lead: "Lockheed Martin Ventures",
    },
  ],
  tagline: "Building and operating the satellites behind daily global Earth imagery.",
  typical_buyer: "Defence ministries, government agencies and commercial analytics customers",
  commercial_model: "Satellite sales plus imagery and analytics subscriptions",
  how_it_works: [
    {
      label: "The customer problem",
      text: "Defence, agriculture and insurance customers need frequent, reliable Earth-observation imagery, but building and operating a satellite constellation is capital-intensive.",
    },
    {
      label: "What Orbis Space Systems provides",
      text: "Small Earth-observation satellites it designs and manufactures in-house, plus daily imagery and analytics subscriptions from its own 64-satellite constellation.",
    },
    {
      label: "Who uses it",
      text: "Government space agencies buy satellites directly; defence ministries and commercial customers subscribe to imagery and analytics from the constellation.",
    },
    {
      label: "The practical benefit",
      text: "Customers get daily global revisit imagery without operating their own constellation, while government buyers can also acquire satellites outright.",
    },
  ],
  in_practice: {
    lead: "A G7 defence ministry extended its imagery contract years ahead of expiry.",
    text: "The UK Ministry of Defence extended its imagery contract with Orbis through 2029, following completion of the full 64-satellite constellation that improved daily global revisit coverage.",
    tag: "Company-reported customer example",
    source_label: null,
    source_href: null,
  },
  market_context: [
    "Demand for high-frequency Earth-observation imagery is growing across defence, agriculture and insurance use cases as more organisations build imagery into routine decision-making.",
    "Government customers can buy satellites outright, subscribe to imagery from an operator's constellation, or rely on national/allied government-owned systems.",
    "Orbis is one of a small number of vertically integrated operators that both builds satellites and monetises the resulting data, rather than specializing in only one.",
  ],
  competitive_landscape: [
    {
      category: "Government-owned systems",
      examples: "National and allied defence satellite programmes",
      text: "Some government customers rely on their own systems rather than commercial imagery providers, limiting the addressable contract pool.",
    },
    {
      category: "Commercial imagery operators",
      examples: "Other Earth-observation constellation operators",
      text: "Compete for the same imagery-subscription contracts on revisit frequency, resolution and pricing.",
    },
    {
      category: "Satellite manufacturers",
      examples: "Specialist small-satellite bus manufacturers",
      text: "Sell satellites to government agencies without operating their own constellation, competing only for the manufacturing side of Orbis's business.",
    },
  ],
  thesis_points: [
    {
      title: "Vertically integrated model",
      text: "Building its own satellite buses in-house and operating the resulting constellation is a structural advantage over operators that do only one or the other.",
    },
    {
      title: "Established government relationships",
      text: "Long-term imagery contracts with two G7 defence ministries suggest a durable customer base for a capital-intensive business.",
    },
    {
      title: "Completed constellation reduces near-term capex",
      text: "Reaching the full 64-satellite constellation this quarter reduces the near-term launch dependency that had been a key execution risk.",
    },
  ],
  business_columns: [
    {
      title: "Who pays and for what",
      text: "Government space agencies pay to acquire satellites; defence ministries and commercial customers pay for imagery and analytics subscriptions.",
    },
    {
      title: "How pricing works",
      text: "Satellite sales are contracted individually; imagery subscriptions are typically priced on revisit frequency and coverage area.",
    },
    {
      title: "What drives growth",
      text: "Constellation expansion, new government contracts and expanding commercial subscriptions drive revenue; launch delays can slow it.",
    },
  ],
  product_disclosures: [
    { label: "Constellation size", sub: "Satellites in orbit", value: "64" },
    { label: "Manufacturing lines", sub: "In-house satellite bus production", value: "2" },
  ],
  product_disclosures_note:
    "Constellation and manufacturing figures indicate operating scale, not revenue.",
  product_disclosures_source: "Company disclosure",
  financial_indicators: [
    {
      value: "2",
      label: "G7 defence ministries under long-term imagery contract",
      source: "Company disclosure",
      word: false,
    },
  ],
};

const ledgerlineFinancial: Asset = {
  id: 4,
  name: "Ledgerline Financial",
  codename: null,
  legal_name: "Ledgerline Financial Holdings Ltd.",
  description: "Embedded cross-border payments infrastructure for marketplaces and fintechs.",
  sector: "fintech_payments",
  sub_sector: "Cross-border payments",
  founded_year: 2017,
  country: "United Kingdom",
  country_of_incorporation: "United Kingdom",
  funding_stage: "growth_stage",
  headquarters: "London, United Kingdom",
  employee_count: 610,
  notable_investors: ["Index Ventures", "Ribbit Capital", "Visa Ventures"],
  total_capital_raised: "$390M",
  company_structure: "UK holding company with regulated payments subsidiaries",
  website: "https://ledgerlinefi.example.com",
  about:
    "Ledgerline Financial provides embedded cross-border payments and FX infrastructure to marketplaces, fintechs and platforms, processing payouts to more than 180 countries.\n\nThe company is licensed as a payments institution in the UK, EU and Singapore, and generates revenue primarily through FX spread and per-transaction fees.",
  thesis:
    "Cross-border commerce continues to shift toward embedded, API-first payment rails. Ledgerline's licensing footprint and marketplace-first go-to-market give it a defensible position against both legacy processors and newer entrants.",
  highlights: [
    "Processes payouts to 180+ countries for 400+ marketplace customers",
    "Licensed payments institution in the UK, EU and Singapore",
    "Take-rate expansion as customers adopt FX and treasury products",
    "This vehicle acquired shares from an early employee shareholder pool",
  ],
  risks: [
    {
      title: "Regulatory change",
      body: "Payments licensing requirements vary by jurisdiction and are subject to change, affecting cost of compliance.",
    },
    {
      title: "FX spread compression",
      body: "Larger customers negotiate tighter FX spreads as volume grows, pressuring take rate over time.",
    },
    {
      title: "This is a secondary transaction",
      body: "Shares were acquired from an existing shareholder rather than issued by the company; the company was not a counterparty to this transaction.",
    },
  ],
  team: [
    { name: "Oliver Bramwell", role: "Chief Executive Officer" },
    { name: "Ines Duarte", role: "Chief Financial Officer" },
    { name: "Tomasz Wysocki", role: "Chief Compliance Officer" },
  ],
  developments: [
    { date: daysAgo(30), text: "Obtained a Major Payment Institution licence in Singapore." },
    { date: daysAgo(110), text: "Surpassed $40B in annualised payment volume." },
    { date: daysAgo(260), text: "Closed a $120M growth round led by Ribbit Capital." },
  ],
  funding_rounds: [
    {
      date: "Feb 2022",
      round: "Series C",
      valuation: "$1.1B",
      raised: "$95M",
      lead: "Index Ventures",
    },
    {
      date: "Oct 2024",
      round: "Growth round",
      valuation: "$2.3B",
      raised: "$120M",
      lead: "Ribbit Capital",
    },
  ],
  tagline: "Embedded payment rails for marketplaces moving money across borders.",
  typical_buyer: "Marketplaces, fintechs and platforms with cross-border payout needs",
  commercial_model: "FX spread and per-transaction fees on payout volume",
  how_it_works: [
    {
      label: "The customer problem",
      text: "Marketplaces and platforms that pay out to sellers or partners across borders need licensed payment rails, but building and maintaining that infrastructure themselves is slow and compliance-heavy.",
    },
    {
      label: "What Ledgerline Financial provides",
      text: "Embedded, API-first cross-border payments and FX infrastructure, licensed as a payments institution in the UK, EU and Singapore.",
    },
    {
      label: "Who uses it",
      text: "Marketplace and platform engineering teams integrate the API; their finance teams rely on it for payout compliance and FX execution.",
    },
    {
      label: "The practical benefit",
      text: "Customers can pay out to 180+ countries without holding their own payments licences, while Ledgerline earns FX spread and transaction fees on the volume.",
    },
  ],
  in_practice: {
    lead: "A marketplace customer added treasury products as its payout volume scaled.",
    text: "As one of Ledgerline's marketplace customers grew its cross-border payout volume, it adopted Ledgerline's FX and treasury products alongside core payouts, expanding the take rate on that relationship.",
    tag: "Company-reported customer example",
    source_label: null,
    source_href: null,
  },
  market_context: [
    "Cross-border commerce continues to shift toward embedded, API-first payment rails rather than customers building or licensing their own infrastructure.",
    "A platform can meet its payout needs by integrating a licensed provider like Ledgerline, using a legacy processor, or pursuing its own licensing in each jurisdiction it serves.",
    "Ledgerline's licensing footprint across the UK, EU and Singapore is a meaningful barrier for newer entrants that have not yet obtained that regulatory coverage.",
  ],
  competitive_landscape: [
    {
      category: "Legacy processors",
      examples: "Established cross-border payment processors",
      text: "Offer longer operating history and broader jurisdiction coverage, but often less API-first integration than newer platforms expect.",
    },
    {
      category: "Newer embedded-payments entrants",
      examples: "API-first cross-border payment start-ups",
      text: "Compete on integration speed and pricing, though many have narrower licensing coverage than Ledgerline's UK, EU and Singapore footprint.",
    },
    {
      category: "Self-licensing by large platforms",
      examples: "In-house payments infrastructure at the largest marketplaces",
      text: "The largest platforms may build and licence their own payments infrastructure rather than using a third-party provider.",
    },
  ],
  thesis_points: [
    {
      title: "Multi-jurisdiction licensing footprint",
      text: "Licensed payments-institution status in the UK, EU and Singapore is a defensible position against newer, less-licensed entrants.",
    },
    {
      title: "Marketplace-first go-to-market",
      text: "400+ marketplace customers give Ledgerline a distribution base to cross-sell FX and treasury products into.",
    },
    {
      title: "Take-rate expansion potential",
      text: "As customers adopt FX and treasury products beyond core payouts, take rate can expand without needing new logos.",
    },
  ],
  business_columns: [
    {
      title: "Who pays and for what",
      text: "Marketplaces, fintechs and platforms pay for payout processing, FX conversion and treasury products built on Ledgerline's rails.",
    },
    {
      title: "How pricing works",
      text: "Revenue comes primarily from FX spread on converted volume and per-transaction processing fees.",
    },
    {
      title: "What drives growth",
      text: "More customers, higher payout volume and adoption of FX/treasury products grow revenue; spread compression at scale works against it.",
    },
  ],
  product_disclosures: [
    { label: "Annualised payment volume", sub: "Company disclosure", value: ">$40B" },
    { label: "Marketplace customers", sub: "Active platforms", value: "400+" },
  ],
  product_disclosures_note: "Volume figures indicate processing scale, not net revenue.",
  product_disclosures_source: "Company disclosure",
  financial_indicators: [
    {
      value: "180+",
      label: "Countries reached by payout processing",
      source: "Company disclosure",
      word: false,
    },
  ],
};

const atlasDefense: Asset = {
  id: 5,
  name: "Atlas Defense Systems",
  codename: null,
  legal_name: "Atlas Defense Systems, Inc.",
  description: "Autonomous maritime and aerial systems for defence and border-security customers.",
  sector: "defence_aerospace",
  sub_sector: "Autonomous systems",
  founded_year: 2019,
  country: "United States",
  country_of_incorporation: "United States",
  funding_stage: "series_b",
  headquarters: "San Diego, California",
  employee_count: 340,
  notable_investors: ["Founders Fund", "8VC", "In-Q-Tel"],
  total_capital_raised: "$260M",
  company_structure: "Delaware C-Corp",
  website: "https://atlasdefensesystems.example.com",
  about:
    "Atlas Defense Systems builds autonomous unmanned surface vessels and aerial systems for maritime domain awareness, border security and defence customers.\n\nThe company holds multiple U.S. government contracts and is expanding into allied-nation procurement programmes.",
  thesis:
    "Defence budgets are shifting toward lower-cost autonomous systems. Atlas has secured early production contracts ahead of most peers and has a founder team with prior operational experience at Anduril and the U.S. Navy.",
  highlights: [
    "Active production contracts with the U.S. Navy and Customs and Border Protection",
    "Founding team from Anduril Industries and the U.S. Navy",
    "Autonomy stack reused across maritime and aerial platforms",
    "Backed by Founders Fund and In-Q-Tel",
  ],
  risks: [
    {
      title: "Government contract concentration",
      body: "The majority of current revenue is tied to a small number of U.S. government contracts subject to appropriations risk.",
    },
    {
      title: "Early-stage production scale-up",
      body: "The company is scaling manufacturing from prototype to production volumes, which carries execution risk.",
    },
    {
      title: "Export and security clearance requirements",
      body: "International expansion depends on export licences and security clearances that can take multiple quarters.",
    },
  ],
  team: [
    { name: "Commander Jake Ferris (Ret.)", role: "Chief Executive Officer" },
    { name: "Grace Whitfield", role: "Chief Technology Officer" },
    { name: "Lucas Bergman", role: "Chief Operating Officer" },
  ],
  developments: [
    {
      date: daysAgo(25),
      text: "Awarded a follow-on production contract with U.S. Customs and Border Protection.",
    },
    {
      date: daysAgo(90),
      text: "Delivered first autonomous surface vessels under Navy pilot programme.",
    },
    { date: daysAgo(300), text: "Closed a $85M Series B led by Founders Fund." },
  ],
  funding_rounds: [
    { date: "Jul 2023", round: "Series A", valuation: "$310M", raised: "$45M", lead: "8VC" },
    {
      date: "Dec 2025",
      round: "Series B",
      valuation: "$780M",
      raised: "$85M",
      lead: "Founders Fund",
    },
  ],
  tagline: "Autonomous maritime and aerial systems built for defence procurement.",
  typical_buyer: "U.S. and allied-nation defence and border-security agencies",
  commercial_model: "Government production contracts",
  how_it_works: [
    {
      label: "The customer problem",
      text: "Maritime domain awareness and border-security missions require persistent surveillance and response capability, but crewed platforms are expensive to operate at scale.",
    },
    {
      label: "What Atlas Defense Systems provides",
      text: "Autonomous unmanned surface vessels and aerial systems, sharing a common autonomy stack across both platform types.",
    },
    {
      label: "Who uses it",
      text: "U.S. Navy, Customs and Border Protection, and allied-nation defence agencies operate the systems for maritime and border missions.",
    },
    {
      label: "The practical benefit",
      text: "Agencies gain persistent, lower-cost autonomous coverage without the crew and operating cost of traditional platforms.",
    },
  ],
  in_practice: {
    lead: "A border-security agency expanded from pilot to a follow-on production contract.",
    text: "U.S. Customs and Border Protection moved from an initial pilot deployment to a follow-on production contract after the first autonomous surface vessels were delivered under the Navy pilot programme.",
    tag: "Company-reported customer example",
    source_label: null,
    source_href: null,
  },
  market_context: [
    "Defence and border-security budgets are shifting toward lower-cost autonomous systems as a complement to, or substitute for, crewed platforms.",
    "Agencies can meet that need by procuring from an autonomous-systems specialist like Atlas, from large established defence primes, or by extending crewed-platform programmes.",
    "Atlas competes for production contracts against both larger primes with autonomy programmes and other specialist autonomous-systems entrants.",
  ],
  competitive_landscape: [
    {
      category: "Established defence primes",
      examples: "Large incumbent defence contractors",
      text: "Bring existing procurement relationships and production scale, but may be slower to field new autonomous platforms.",
    },
    {
      category: "Autonomous-systems specialists",
      examples: "Anduril Industries and similar entrants",
      text: "Compete directly for the same production contracts on cost, autonomy performance and delivery speed.",
    },
    {
      category: "Crewed-platform incumbents",
      examples: "Traditional manned vessel and aircraft programmes",
      text: "Some missions continue to use crewed platforms rather than shifting to autonomous systems, limiting near-term addressable budget.",
    },
  ],
  thesis_points: [
    {
      title: "Early production contracts secured",
      text: "Active production contracts with the U.S. Navy and Customs and Border Protection put Atlas ahead of most peers still in pilot stages.",
    },
    {
      title: "Shared autonomy stack across platforms",
      text: "Reusing the same autonomy software across maritime and aerial platforms may lower incremental development cost for new platform types.",
    },
    {
      title: "Operationally experienced founding team",
      text: "Leadership with prior experience at Anduril and the U.S. Navy may aid navigating defence procurement and customer relationships.",
    },
  ],
  business_columns: [
    {
      title: "Who pays and for what",
      text: "U.S. and allied-nation defence and border-security agencies pay under production contracts for delivered autonomous systems.",
    },
    {
      title: "How pricing works",
      text: "Government production contracts are individually negotiated and typically span multiple years with defined delivery schedules.",
    },
    {
      title: "What drives growth",
      text: "New contract awards and follow-on production orders drive growth; appropriations timing and export licensing can slow it.",
    },
  ],
  product_disclosures: [
    { label: "Active government contracts", sub: "Company disclosure", value: "2" },
  ],
  product_disclosures_note:
    "Contract count indicates customer base, not contract value or revenue.",
  product_disclosures_source: "Company disclosure",
  financial_indicators: [
    {
      value: "2019",
      label: "Founded, with founding team from Anduril and the U.S. Navy",
      source: "Company disclosure",
      word: false,
    },
  ],
};

export const funds: Fund[] = [
  {
    id: 1,
    name: "Solara Grid SPV I",
    codename: "Project Helios",
    descriptor: "Grid-scale battery storage",
    hook: "Backing the storage layer for Southeast Asia's renewable build-out.",
    state: "open",
    vehicle_type: "fund",
    holding_period_note: null,
    deal_type: "primary",
    security_type: "Primary equity",
    price: "184.50",
    min_subscription: "25000",
    max_subscription: null,
    subscription_increment: "1000",
    subscription_fee_pct: "4",
    management_fee_pct: "1.5",
    carried_interest_pct: "15",
    supply_total: "5000000",
    supply_allocated: "2150000",
    implied_valuation: "1850000000",
    premium_pct: "12",
    closes_at: daysFromNow(25),
    opened_at: daysAgo(40),
    comparable_basis: "EV / Revenue",
    entry_multiple: "9.2x",
    comparable_note:
      "Priced at a discount to listed storage-and-generation peers given illiquidity.",
    key_metrics: [
      { label: "ARR", value: "$210M", note: "FY2025 contracted capacity revenue" },
      { label: "Gross margin", value: "58%", note: "FY2025" },
      { label: "Contracted capacity", value: "480MWh", note: "In operation" },
      { label: "Net revenue retention", value: "118%", note: "FY2025" },
    ],
    revenue_points: [
      { period: "FY2023", value: "0.82" },
      { period: "FY2024", value: "1.35" },
      { period: "FY2025", value: "2.10" },
      { period: "FY2026E", value: "2.95" },
    ],
    peers: [
      { name: "Fluence Energy", multiple: "6.1x" },
      { name: "Stem, Inc.", multiple: "5.4x" },
    ],
    activities: [
      {
        date: daysAgo(5),
        text: "Akula completed diligence on the Series C-1 tranche.",
        kind: "milestone",
      },
      { date: daysAgo(18), text: "Escrow account opened for this vehicle.", kind: "update" },
      {
        date: daysAgo(38),
        text: "Akula committed to acquire an allocation in Solara Grid's Series C-1.",
        kind: "commit",
      },
    ],
    fund_manager: { id: 1, name: "LUCA SGP" },
    asset: solaraGrid,
    share_class: {
      id: 1,
      name: "Class A Participating",
      class_type: "preference",
    },
    tags: tagsFor([1, 4, 7]),
    primary_source: {
      title: "Solara Grid investor materials",
      meta: "LUCA SGP Pte. Ltd., data room, September 2026",
      text: "Supplied by the selling shareholder alongside company update calls. The business, market comparison and financing history above follow its structure.",
    },
    figures_checked_note:
      "Revenue and retention figures were checked against the company's most recent investor update call. Contracted-capacity figures were cross-referenced against the disclosed utility agreements.",
    figures_checked_links: [],
    recording_available: false,
    recording_embed_url: null,
  },
  {
    id: 2,
    name: "Kestrel Robotics SPV II",
    codename: "Project Kestrel",
    descriptor: "Warehouse robotics secondary",
    hook: "A discounted secondary into the largest independent warehouse-robotics fleet.",
    state: "open",
    vehicle_type: "fund",
    holding_period_note: null,
    deal_type: "secondary",
    security_type: "Common stock (secondary)",
    price: "96.20",
    min_subscription: "25000",
    max_subscription: "500000",
    subscription_increment: "5000",
    subscription_fee_pct: "3.5",
    management_fee_pct: "1.5",
    carried_interest_pct: "15",
    supply_total: "3000000",
    supply_allocated: "2850000",
    implied_valuation: "3400000000",
    premium_pct: "-13",
    closes_at: daysFromNow(5),
    opened_at: daysAgo(55),
    comparable_basis: "EV / Revenue",
    entry_multiple: "7.4x",
    comparable_note:
      "Acquired at a 13% discount to the last primary round from a departing early employee.",
    key_metrics: [
      { label: "ARR", value: "$460M", note: "FY2025" },
      { label: "Gross margin", value: "41%", note: "FY2025, hardware + software blended" },
      { label: "Deployed fleet", value: "38,000 robots", note: "As of last quarter" },
      { label: "Gross retention", value: "92%", note: "Top 50 customers" },
    ],
    revenue_points: [
      { period: "FY2023", value: "2.10" },
      { period: "FY2024", value: "3.40" },
      { period: "FY2025", value: "4.60" },
    ],
    peers: [
      { name: "Locus Robotics", multiple: "8.9x" },
      { name: "Berkshire Grey", multiple: "4.2x" },
    ],
    activities: [
      {
        date: daysAgo(2),
        text: "Final allocation window opens — closing in days.",
        kind: "update",
      },
      { date: daysAgo(12), text: "Seller share transfer agreement executed.", kind: "milestone" },
      {
        date: daysAgo(50),
        text: "Akula sourced a secondary block from a departing early employee.",
        kind: "commit",
      },
    ],
    fund_manager: { id: 1, name: "LUCA SGP" },
    asset: kestrelRobotics,
    share_class: { id: 2, name: "Class B Common", class_type: "ordinary" },
    tags: tagsFor([1, 3, 8]),
    primary_source: {
      title: "Kestrel Robotics secondary transaction memo",
      meta: "LUCA SGP Pte. Ltd., data room, September 2026",
      text: "Prepared from the departing employee's disclosure package and public company statements. The business, market comparison and financing history above follow its structure.",
    },
    figures_checked_note:
      "Fleet-size and retention figures were checked against the company's most recent public disclosure. Deployment-count figures were not independently verified beyond that source.",
    figures_checked_links: [],
    recording_available: false,
    recording_embed_url: null,
  },
  {
    id: 3,
    name: "Orbis Space Systems SPV I",
    codename: "Project Orbis",
    descriptor: "Earth-observation constellation operator",
    hook: "A vertically integrated space-data business with government-backed contracts.",
    state: "open",
    vehicle_type: "fund",
    holding_period_note: null,
    deal_type: "primary",
    security_type: "Primary equity",
    price: "212.00",
    min_subscription: "25000",
    max_subscription: null,
    subscription_increment: "1000",
    subscription_fee_pct: "4",
    management_fee_pct: "2",
    carried_interest_pct: "20",
    supply_total: null,
    supply_allocated: "1200000",
    implied_valuation: "1650000000",
    premium_pct: "18",
    closes_at: null,
    opened_at: daysAgo(20),
    comparable_basis: "EV / Revenue",
    entry_multiple: "11.5x",
    comparable_note:
      "No direct listed pure-play comparable; benchmarked against diversified aerospace primes.",
    key_metrics: [
      { label: "Contracted backlog", value: "$740M", note: "As of last quarter" },
      { label: "Constellation size", value: "64 satellites", note: "Fully deployed" },
      { label: "Gross margin", value: "49%", note: "FY2025" },
    ],
    revenue_points: [
      { period: "FY2023", value: "0.31" },
      { period: "FY2024", value: "0.58" },
      { period: "FY2025", value: "0.94" },
    ],
    peers: [
      { name: "Planet Labs", multiple: "9.8x" },
      { name: "BlackSky Technology", multiple: "6.3x" },
    ],
    activities: [
      { date: daysAgo(3), text: "Open-ended raise continues; no close date set.", kind: "update" },
      { date: daysAgo(20), text: "Akula opened this vehicle for subscriptions.", kind: "commit" },
    ],
    fund_manager: { id: 1, name: "LUCA SGP" },
    asset: orbisSpace,
    share_class: {
      id: 3,
      name: "Class A Participating",
      class_type: "preference",
    },
    tags: tagsFor([1, 6, 7]),
    primary_source: {
      title: "Orbis Space Systems investor materials",
      meta: "LUCA SGP Pte. Ltd., data room, September 2026",
      text: "Supplied by the selling shareholder alongside company disclosures. The business, market comparison and financing history above follow its structure.",
    },
    figures_checked_note:
      "Constellation-size and contract figures were checked against the company's most recent public disclosure and government contract announcements.",
    figures_checked_links: [],
    recording_available: false,
    recording_embed_url: null,
  },
  {
    id: 4,
    name: "Ledgerline Financial SPV I",
    codename: "Project Ledger",
    descriptor: "Cross-border payments secondary",
    hook: "Embedded FX and payments infrastructure for global marketplaces.",
    state: "closed",
    vehicle_type: "fund",
    holding_period_note: null,
    deal_type: "secondary",
    security_type: "Preferred stock (secondary)",
    price: "58.40",
    min_subscription: "25000",
    max_subscription: "250000",
    subscription_increment: "5000",
    subscription_fee_pct: "3",
    management_fee_pct: "1.5",
    carried_interest_pct: "15",
    supply_total: "4000000",
    supply_allocated: "4000000",
    implied_valuation: "2300000000",
    premium_pct: "-6",
    closes_at: daysAgo(35),
    opened_at: daysAgo(140),
    comparable_basis: "EV / Revenue",
    entry_multiple: "6.8x",
    comparable_note: "Closed fully subscribed; acquired from an institutional secondary seller.",
    key_metrics: [
      { label: "Annualised payment volume", value: "$40B", note: "As of last quarter" },
      { label: "Take rate", value: "0.34%", note: "FY2025 blended" },
      { label: "Licensed markets", value: "UK, EU, Singapore", note: "Regulated entities" },
    ],
    revenue_points: [
      { period: "FY2023", value: "0.95" },
      { period: "FY2024", value: "1.28" },
      { period: "FY2025", value: "1.61" },
    ],
    peers: [
      { name: "Airwallex", multiple: "7.9x" },
      { name: "Nium", multiple: "6.5x" },
    ],
    activities: [
      { date: daysAgo(35), text: "Vehicle closed, fully subscribed.", kind: "milestone" },
      {
        date: daysAgo(90),
        text: "Share transfer agreement executed with the selling shareholder.",
        kind: "commit",
      },
    ],
    fund_manager: { id: 1, name: "LUCA SGP" },
    asset: ledgerlineFinancial,
    share_class: { id: 4, name: "Series C Preferred", class_type: "preference" },
    tags: tagsFor([2, 5]),
    primary_source: {
      title: "Ledgerline Financial secondary transaction memo",
      meta: "LUCA SGP Pte. Ltd., data room, September 2026",
      text: "Prepared from the selling shareholder's disclosure package and public company statements. The business, market comparison and financing history above follow its structure.",
    },
    figures_checked_note:
      "Payment-volume and licensing figures were checked against the company's most recent public disclosure.",
    figures_checked_links: [],
    recording_available: false,
    recording_embed_url: null,
  },
  {
    id: 5,
    name: "Atlas Defense Systems SPV I",
    codename: "Project Atlas",
    descriptor: "Autonomous maritime and aerial defence systems",
    hook: "Early production contracts in the shift toward lower-cost autonomous defence platforms.",
    state: "open",
    vehicle_type: "fund",
    holding_period_note: null,
    deal_type: "primary",
    security_type: "Primary equity",
    price: "142.75",
    min_subscription: "25000",
    max_subscription: null,
    subscription_increment: "1000",
    subscription_fee_pct: "4",
    management_fee_pct: "2",
    carried_interest_pct: "20",
    supply_total: "6000000",
    supply_allocated: "800000",
    implied_valuation: "780000000",
    premium_pct: "8",
    closes_at: daysFromNow(60),
    opened_at: daysAgo(10),
    comparable_basis: "EV / Revenue",
    entry_multiple: "12.1x",
    comparable_note:
      "Priced in line with recent Series B, ahead of an anticipated follow-on round.",
    key_metrics: [
      { label: "Contracted backlog", value: "$180M", note: "U.S. government contracts" },
      { label: "Headcount", value: "340", note: "As of last quarter" },
    ],
    revenue_points: [
      { period: "FY2024", value: "0.06" },
      { period: "FY2025", value: "0.14" },
    ],
    peers: [
      { name: "Anduril Industries", multiple: "N/A — private" },
      { name: "Saildrone", multiple: "N/A — private" },
    ],
    activities: [
      { date: daysAgo(4), text: "Akula opened this vehicle for subscriptions.", kind: "commit" },
      {
        date: daysAgo(10),
        text: "Diligence completed following the Series B close.",
        kind: "milestone",
      },
    ],
    fund_manager: { id: 1, name: "LUCA SGP" },
    asset: atlasDefense,
    share_class: {
      id: 5,
      name: "Class A Participating",
      class_type: "preference",
    },
    tags: tagsFor([1, 7, 8]),
    primary_source: {
      title: "Atlas Defense Systems investor materials",
      meta: "LUCA SGP Pte. Ltd., data room, September 2026",
      text: "Supplied by the selling shareholder alongside company disclosures. The business, market comparison and financing history above follow its structure.",
    },
    figures_checked_note:
      "Contract and delivery figures were checked against the company's public contract-award disclosures.",
    figures_checked_links: [],
    recording_available: false,
    recording_embed_url: null,
  },
];

// ---------------------------------------------------------------------------
// Illustrative deals — made-up vehicles so the LUCA deals list, dashboard and
// per-deal workspace have a realistic spread of closing dates and raise levels.
// ---------------------------------------------------------------------------

type DealSpec = {
  id: number;
  name: string;
  codename: string;
  descriptor: string;
  hook: string;
  state: Fund["state"];
  sector: string;
  subSector: string;
  company: string;
  country: string;
  price: string;
  min: string;
  fees: [string, string, string];
  total: string;
  allocated: string;
  valuation: string;
  premium: string;
  closesIn: number | null;
  openedAgo: number;
  entryMultiple: string;
  about: string;
  highlights: string[];
  tagIds: number[];
  buyer: string;
  model: string;
  metrics: Fund["key_metrics"];
};

const monthYear = (ago: number) =>
  new Date(now - ago * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });

const dealSpecs: DealSpec[] = [
  {
    id: 6,
    name: "Helix Therapeutics SPV I",
    codename: "Project Helix",
    descriptor: "Late-stage oncology platform",
    hook: "A clinical-stage platform with two programmes entering pivotal trials.",
    state: "open",
    sector: "biotech_health",
    subSector: "Oncology",
    company: "Helix Therapeutics",
    country: "United States",
    price: "96.40",
    min: "25000",
    fees: ["4", "2", "20"],
    total: "4500000",
    allocated: "3150000",
    valuation: "2400000000",
    premium: "10",
    closesIn: 12,
    openedAgo: 50,
    entryMultiple: "n/a",
    about:
      "Helix Therapeutics develops targeted oncology treatments from a proprietary antibody platform.\n\nTwo lead programmes are entering pivotal trials, supported by a recent crossover round.",
    highlights: [
      "Two programmes entering pivotal trials",
      "Crossover round led by tier-one healthcare investors",
      "Cash runway into the second half of next year",
    ],
    tagIds: [3, 6],
    buyer: "Hospitals and oncology centres treating late-stage patients",
    model: "Clinical-stage: value driven by trial milestones and partnering revenue",
    metrics: [
      { label: "Programmes in clinic", value: "4", note: "Two entering pivotal trials" },
      { label: "Cash runway", value: "30 months", note: "As of last quarter" },
    ],
  },
  {
    id: 7,
    name: "Northwind Cyber SPV I",
    codename: "Project Northwind",
    descriptor: "Cloud-native security platform",
    hook: "Enterprise security consolidation, sold on multi-year contracts.",
    state: "open",
    sector: "cybersecurity",
    subSector: "Cloud security",
    company: "Northwind Cyber",
    country: "Israel",
    price: "58.20",
    min: "25000",
    fees: ["4", "1.5", "15"],
    total: "3500000",
    allocated: "1400000",
    valuation: "950000000",
    premium: "6",
    closesIn: 38,
    openedAgo: 22,
    entryMultiple: "11.4x",
    about:
      "Northwind Cyber sells a cloud-native security platform that consolidates detection, response and posture management for large enterprises.",
    highlights: [
      "Net revenue retention above 125%",
      "Multi-year contracts with Fortune 500 customers",
      "Recently crossed profitability on a contribution basis",
    ],
    tagIds: [1, 8],
    buyer: "Large enterprises consolidating security vendors",
    model: "Multi-year subscription contracts, priced per protected workload",
    metrics: [
      { label: "Net revenue retention", value: "125%", note: "Trailing twelve months" },
      { label: "Customers", value: "310", note: "Enterprise accounts" },
    ],
  },
  {
    id: 8,
    name: "Quanta Compute SPV I",
    codename: "Project Quanta",
    descriptor: "AI infrastructure and compute",
    hook: "Dedicated GPU capacity sold to frontier AI labs on long-term take-or-pay terms.",
    state: "open",
    sector: "ai_machine_learning",
    subSector: "AI infrastructure",
    company: "Quanta Compute",
    country: "United States",
    price: "212.00",
    min: "50000",
    fees: ["4", "2", "20"],
    total: "8000000",
    allocated: "7300000",
    valuation: "6200000000",
    premium: "18",
    closesIn: 3,
    openedAgo: 70,
    entryMultiple: "15.8x",
    about:
      "Quanta Compute builds and operates dedicated GPU clusters and leases capacity to AI labs under multi-year take-or-pay agreements.",
    highlights: [
      "Take-or-pay contracts covering most of installed capacity",
      "Data-centre pipeline secured through the next two years",
      "Strategic investors include a top-three cloud provider",
    ],
    tagIds: [1, 4, 7],
    buyer: "AI labs and enterprises leasing dedicated GPU capacity",
    model: "Take-or-pay capacity contracts with annual escalators",
    metrics: [
      { label: "Contracted capacity", value: "92%", note: "Of installed GPUs" },
      { label: "Data-centre pipeline", value: "180MW", note: "Secured through next two years" },
    ],
  },
  {
    id: 9,
    name: "Tidewater Carbon SPV I",
    codename: "Project Tidewater",
    descriptor: "Nature-based carbon removal",
    hook: "Verified removal credits from restored coastal ecosystems.",
    state: "closing",
    sector: "climate_energy",
    subSector: "Carbon removal",
    company: "Tidewater Carbon",
    country: "Australia",
    price: "41.75",
    min: "25000",
    fees: ["3.5", "1.5", "15"],
    total: "2500000",
    allocated: "2380000",
    valuation: "410000000",
    premium: "4",
    closesIn: 9,
    openedAgo: 60,
    entryMultiple: "8.1x",
    about:
      "Tidewater Carbon restores coastal ecosystems and sells independently verified carbon removal credits to corporate buyers.",
    highlights: [
      "Offtake agreements with investment-grade corporate buyers",
      "Independent verification of removal volumes",
      "Restoration sites across three jurisdictions",
    ],
    tagIds: [2, 5],
    buyer: "Corporate buyers of verified carbon removal credits",
    model: "Forward offtake agreements priced per verified tonne",
    metrics: [
      { label: "Verified removals", value: "1.2Mt", note: "Cumulative" },
      { label: "Offtake coverage", value: "78%", note: "Of expected volume" },
    ],
  },
  {
    id: 10,
    name: "Cobalt Semiconductors SPV I",
    codename: "Project Cobalt",
    descriptor: "Power semiconductors",
    hook: "Wide-bandgap power devices for electric vehicles and data centres.",
    state: "draft",
    sector: "semiconductors",
    subSector: "Power devices",
    company: "Cobalt Semiconductors",
    country: "Japan",
    price: "73.10",
    min: "25000",
    fees: ["4", "2", "20"],
    total: "5000000",
    allocated: "0",
    valuation: "1300000000",
    premium: "9",
    closesIn: 75,
    openedAgo: 0,
    entryMultiple: "9.6x",
    about:
      "Cobalt Semiconductors designs wide-bandgap power devices used in electric vehicle drivetrains and data-centre power supplies.",
    highlights: [
      "Design wins with two global automotive suppliers",
      "In-house packaging reduces unit cost",
      "Capacity expansion funded in the current round",
    ],
    tagIds: [3],
    buyer: "Automotive suppliers and data-centre power-supply makers",
    model: "Device sales under multi-year supply agreements",
    metrics: [
      { label: "Design wins", value: "2", note: "Global automotive suppliers" },
      { label: "Capacity expansion", value: "Funded", note: "In the current round" },
    ],
  },
];

for (const spec of dealSpecs) {
  const base = structuredClone(funds[0]);
  const asset: Asset = {
    ...base.asset,
    id: spec.id,
    name: spec.company,
    legal_name: `${spec.company} Ltd.`,
    description: spec.descriptor,
    sector: spec.sector,
    sub_sector: spec.subSector,
    country: spec.country,
    country_of_incorporation: spec.country,
    headquarters: spec.country,
    about: spec.about,
    thesis: spec.hook,
    highlights: spec.highlights,
    website: `https://${spec.company.toLowerCase().replace(/[^a-z]+/g, "")}.example.com`,
    risks: [
      {
        title: "Illustrative risk",
        body: "Placeholder risk disclosure for this made-up deal. Replace with the real disclosure before publication.",
      },
      {
        title: "Valuation and liquidity",
        body: "Private-company holdings are illiquid and valuations are estimates.",
      },
    ],
    team: [
      { name: "Alex Morgan", role: "Chief Executive Officer" },
      { name: "Jordan Lee", role: "Chief Financial Officer" },
    ],
    developments: [{ date: daysAgo(20), text: "Illustrative: milestone announced." }],
    tagline: spec.hook,
    typical_buyer: spec.buyer,
    commercial_model: spec.model,
    how_it_works: base.asset.how_it_works.map((row, i) => ({
      label: row.label,
      text: [
        `Illustrative: ${spec.company} addresses a significant customer problem in ${spec.subSector.toLowerCase()}.`,
        `${spec.company} provides ${spec.descriptor.toLowerCase()}.`,
        `Used by ${spec.buyer.toLowerCase()}.`,
        "Illustrative practical benefit for customers of this made-up company.",
      ][i % 4],
    })),
    in_practice: null,
    market_context: [
      `Illustrative market context for ${spec.subSector.toLowerCase()}. Replace with the real market overview before publication.`,
    ],
    competitive_landscape: [],
    thesis_points: [
      {
        title: "Illustrative thesis point",
        text: spec.highlights[0] ?? "Placeholder thesis point.",
      },
    ],
    business_columns: [{ title: "Who pays and for what", text: `Illustrative: ${spec.model}.` }],
    product_disclosures: [],
    product_disclosures_note: null,
    product_disclosures_source: null,
    financial_indicators: [],
    funding_rounds: [
      {
        date: monthYear(400),
        round: "Series B",
        valuation: `$${(Number(spec.valuation) / 1e9 / 2).toFixed(2)}B`,
      },
      {
        date: monthYear(120),
        round: "Series C",
        valuation: `$${(Number(spec.valuation) / 1e9 / 1.08).toFixed(2)}B`,
      },
    ],
  };
  funds.push({
    ...base,
    id: spec.id,
    name: spec.name,
    codename: spec.codename,
    descriptor: spec.descriptor,
    hook: spec.hook,
    state: spec.state,
    price: spec.price,
    min_subscription: spec.min,
    subscription_fee_pct: spec.fees[0],
    management_fee_pct: spec.fees[1],
    carried_interest_pct: spec.fees[2],
    supply_total: spec.total,
    supply_allocated: spec.allocated,
    implied_valuation: spec.valuation,
    premium_pct: spec.premium,
    closes_at: spec.closesIn === null ? null : daysFromNow(spec.closesIn),
    opened_at: spec.state === "draft" ? null : daysAgo(spec.openedAgo),
    entry_multiple: spec.entryMultiple,
    comparable_note: "Illustrative comparable note for a made-up deal.",
    key_metrics: spec.metrics,
    revenue_points: [
      { period: "FY2024", value: "0.08" },
      { period: "FY2025", value: "0.17" },
    ],
    peers: [],
    activities: [
      { date: daysAgo(spec.openedAgo), text: "Akula opened this vehicle.", kind: "commit" },
    ],
    asset,
    share_class: { id: spec.id, name: "Class A Participating", class_type: "preference" },
    tags: tagsFor(spec.tagIds),
    primary_source: {
      title: `${spec.company} investor materials`,
      meta: "Illustrative source for a made-up deal",
      text: "Illustrative placeholder content so the deal workspace can be reviewed.",
    },
    figures_checked_note: "Illustrative: figures have not been checked.",
  });
}

export function findFundById(id: number): Fund | undefined {
  return funds.find((f) => f.id === id);
}
// Made-up document requests, in different states, so the Compliance flow is visible.
{
  const ask = (
    investorId: number,
    kind: string,
    requestedAgo: number,
    dueIn: number | null,
    status: MockDocumentRequest["status"] = "requested",
    fundId: number | null = null,
    note: string | null = null,
  ) =>
    documentRequests.push({
      id: nextDocumentRequestId(),
      investor_id: investorId,
      kind,
      fund_id: fundId,
      note,
      requested_at: daysAgo(requestedAgo),
      due_at: dueIn === null ? null : daysFromNow(dueIn),
      status,
      reminded_at: null,
      received_document_id: null,
    });
  ask(25, "passport", 12, -6, "requested", null, "Needed to complete onboarding.");
  ask(25, "proof_of_address", 12, -6);
  ask(29, "trust_deed", 8, 4);
  ask(29, "certificate_of_incorporation", 8, 4);
  ask(
    22,
    "accreditation_letter",
    5,
    8,
    "requested",
    null,
    "Your accreditation expires soon. Please send a renewal.",
  );
  ask(32, "proof_of_address", 3, 3, "uploaded");
  ask(
    31,
    "accreditation_letter",
    20,
    -10,
    "requested",
    null,
    "Needed to lift the block on new subscriptions.",
  );
  ask(26, "source_of_funds", 6, 5, "requested", 8, "Required for tickets above $100,000.");
  ask(30, "authorised_signatories", 6, 12, "uploaded");
  ask(23, "accreditation_letter", 9, null, "uploaded");
  // The demo investor (Elena Cross) has a few open requests, so the loop is visible from her side.
  ask(2, "source_of_funds", 4, 6, "requested", 8, "Required for tickets above $100,000.");
  ask(
    2,
    "accreditation_letter",
    3,
    20,
    "requested",
    null,
    "Your accreditation expires soon. Please send a renewal.",
  );
  ask(2, "bank_details", 2, 14);
}

// Made-up per-investor terms so the investor-pricing view has examples.
investorPricing.push(
  {
    id: nextInvestorPricingId(),
    fund_id: 1,
    investor_id: 11,
    price: "178.00",
    subscription_fee_pct: "2.5",
    management_fee_pct: "1.25",
    carried_interest_pct: "12.5",
    implied_valuation: "1780000000",
    note: "Founding-adviser terms agreed with Meridian Capital Advisors.",
    updated_at: daysAgo(12),
  },
  {
    id: nextInvestorPricingId(),
    fund_id: 1,
    investor_id: 14,
    price: null,
    subscription_fee_pct: "3",
    management_fee_pct: null,
    carried_interest_pct: null,
    implied_valuation: null,
    note: "Fee concession for a repeat investor.",
    updated_at: daysAgo(9),
  },
  {
    id: nextInvestorPricingId(),
    fund_id: 2,
    investor_id: 16,
    price: "92.00",
    subscription_fee_pct: "3",
    management_fee_pct: "1.25",
    carried_interest_pct: "15",
    implied_valuation: null,
    note: "Volume commitment across two vehicles.",
    updated_at: daysAgo(6),
  },
  {
    id: nextInvestorPricingId(),
    fund_id: 8,
    investor_id: 2,
    price: "205.50",
    subscription_fee_pct: "3.5",
    management_fee_pct: null,
    carried_interest_pct: null,
    implied_valuation: "6000000000",
    note: null,
    updated_at: daysAgo(3),
  },
);

// ---------------------------------------------------------------------------
// Discover companies (no live Akula vehicle)
// ---------------------------------------------------------------------------

export const discoverCompanies: DiscoverCompany[] = [
  {
    id: 1,
    name: "Nightjar Labs",
    codename: null,
    description:
      "Short-form video and creator-monetisation platform with 340M monthly active users.",
    sector: "ai_machine_learning",
    sub_sector: "Consumer AI",
    founded_year: 2019,
    country: "Singapore",
    country_of_incorporation: "Cayman Islands",
    legal_name: "Nightjar Labs Pte. Ltd.",
    funding_stage: "late_stage",
    headquarters: "Singapore",
    employee_count: 4200,
    notable_investors: ["SoftBank Vision Fund", "General Atlantic"],
    total_capital_raised: "$3.1B",
    company_structure: "Cayman Islands holding company",
    website: "https://nightjarlabs.example.com",
    about:
      "Nightjar Labs operates a short-form video platform with an AI-driven recommendation engine and a creator-monetisation marketplace spanning 60+ markets.",
    thesis:
      "A category leader in short-form video with a large, engaged user base and an emerging monetisation layer. Akula is tracking a potential future secondary as early shareholders seek liquidity.",
    risks: [
      {
        title: "Regulatory scrutiny",
        body: "Faces data-privacy and content-moderation scrutiny in several major markets.",
      },
      {
        title: "No confirmed liquidity path",
        body: "No secondary transaction has been sourced; timing and pricing are unconfirmed.",
      },
    ],
  },
  {
    id: 2,
    name: "Palette Studio",
    codename: null,
    description:
      "Browser-based design and brand-collateral platform used by 200M+ registered users.",
    sector: "enterprise_saas",
    sub_sector: "Design software",
    founded_year: 2013,
    country: "Australia",
    country_of_incorporation: "Australia",
    legal_name: "Palette Studio Pty Ltd",
    funding_stage: "late_stage",
    headquarters: "Sydney, Australia",
    employee_count: 5100,
    notable_investors: ["Sequoia Capital", "Blackbird Ventures"],
    total_capital_raised: "$570M",
    company_structure: "Australian proprietary company",
    website: "https://palettestudio.example.com",
    about:
      "Palette Studio provides browser-based design tools used by individuals and enterprise marketing teams to produce presentations, social content and brand collateral.",
    thesis:
      "Profitable at scale with a large self-serve user base and a growing enterprise motion. Akula is monitoring for a pre-IPO secondary window.",
    risks: [
      {
        title: "Competitive pressure from AI-native tools",
        body: "New AI-first design entrants are targeting the same self-serve segment.",
      },
      {
        title: "Valuation expectations",
        body: "Recent tender offers have priced above levels Akula considers attractive for investors.",
      },
    ],
  },
  {
    id: 3,
    name: "Wavelength",
    codename: null,
    description: "Community and voice-chat platform for gaming and interest-based communities.",
    sector: "consumer_marketplaces",
    sub_sector: "Social platforms",
    founded_year: 2015,
    country: "United States",
    country_of_incorporation: "United States",
    legal_name: "Wavelength, Inc.",
    funding_stage: "late_stage",
    headquarters: "San Francisco, California",
    employee_count: 900,
    notable_investors: ["Tiger Global", "Index Ventures"],
    total_capital_raised: "$980M",
    company_structure: "Delaware C-Corp",
    website: "https://wavelength.example.com",
    about:
      "Wavelength operates a voice, video and text community platform with more than 200M monthly active users, monetised through subscriptions and platform fees.",
    thesis:
      "A durable, highly engaged community platform with an underdeveloped monetisation layer relative to peers. Akula is tracking the company ahead of any liquidity event.",
    risks: [
      {
        title: "Monetisation still developing",
        body: "Revenue per user remains low relative to comparable social platforms.",
      },
      {
        title: "No live vehicle",
        body: "No transaction has been sourced; this listing is for research purposes only.",
      },
    ],
  },
  {
    id: 4,
    name: "Fenwick AI",
    codename: null,
    description: "Frontier AI research lab building open-weight and enterprise foundation models.",
    sector: "ai_machine_learning",
    sub_sector: "Foundation models",
    founded_year: 2023,
    country: "France",
    country_of_incorporation: "France",
    legal_name: "Fenwick AI SAS",
    funding_stage: "growth_stage",
    headquarters: "Paris, France",
    employee_count: 480,
    notable_investors: ["Andreessen Horowitz", "General Catalyst", "Nvidia"],
    total_capital_raised: "$1.2B",
    company_structure: "French simplified joint-stock company (SAS)",
    website: "https://fenwickai.example.com",
    about:
      "Fenwick AI develops open-weight and enterprise foundation models, with a growing enterprise licensing and API business alongside its research programme.",
    thesis:
      "One of a small number of independent frontier AI labs, with a European base that gives it a differentiated regulatory and sovereignty positioning. Akula is tracking the company for a future primary round.",
    risks: [
      {
        title: "Capital intensity",
        body: "Frontier model training requires continual, very large capital raises.",
      },
      {
        title: "Competitive field",
        body: "Competes directly with much larger, better-capitalised U.S. labs.",
      },
    ],
  },
];

export function findDiscoverCompanyById(id: number): DiscoverCompany | undefined {
  return discoverCompanies.find((c) => c.id === id);
}

// ---------------------------------------------------------------------------
// Subscription pipeline
// ---------------------------------------------------------------------------

export const TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  reserved: ["documents_pending", "cancelled"],
  // documents_pending's real next status forks on origin (institution_review for
  // EAM-submitted, under_luca_review for direct) — decided in code by the
  // SignWell completion handler, not by an admin picking from this list, so
  // both are offered here for LUCA's manual override too.
  documents_pending: ["institution_review", "under_luca_review", "cancelled"],
  institution_review: ["under_luca_review", "cancelled"],
  under_luca_review: ["information_requested", "approved", "rejected", "cancelled"],
  information_requested: ["under_luca_review", "cancelled"],
  approved: ["awaiting_funds", "cancelled"],
  awaiting_funds: ["payment_unmatched", "reconciliation", "cancelled"],
  payment_unmatched: ["reconciliation", "cancelled"],
  reconciliation: ["allocation_pending", "cancelled"],
  allocation_pending: ["allocated", "not_allocated"],
  allocated: ["funds_returned"],
  not_allocated: ["funds_returned"],
  funds_returned: [],
  rejected: [],
  cancelled: [],
};

const NEXT_ACTION_BY_STATUS: Record<SubscriptionStatus, string> = {
  reserved: "accept_acknowledgements",
  documents_pending: "sign_documents",
  institution_review: "institution_to_review",
  under_luca_review: "luca_to_review",
  information_requested: "respond_information_request",
  approved: "proceed_to_funding",
  awaiting_funds: "transfer_funds",
  payment_unmatched: "match_payment",
  reconciliation: "reconcile_funds",
  allocation_pending: "allocate_units",
  allocated: "",
  not_allocated: "return_funds",
  funds_returned: "",
  rejected: "",
  cancelled: "",
};

/** owner is origin-aware for exactly one status: who needs to answer an
 *  information request differs for an institution-submitted subscription
 *  (the RM) vs. a direct one (the investor themself). Every other status is a
 *  pure lookup. */
const OWNER_BY_STATUS: Record<SubscriptionStatus, SubscriptionOwner> = {
  reserved: "investor",
  documents_pending: "investor",
  institution_review: "eam",
  under_luca_review: "luca",
  information_requested: "investor",
  approved: "investor",
  awaiting_funds: "investor",
  payment_unmatched: "akula_ops",
  reconciliation: "akula_ops",
  allocation_pending: "luca",
  allocated: "complete",
  not_allocated: "akula_ops",
  funds_returned: "complete",
  rejected: "complete",
  cancelled: "complete",
};

export function ownerFor(status: SubscriptionStatus, origin?: string): SubscriptionOwner {
  if (status === "information_requested" && origin === "eam") return "eam";
  return OWNER_BY_STATUS[status];
}

export function nextActionFor(status: SubscriptionStatus): string {
  return NEXT_ACTION_BY_STATUS[status];
}

const REVIEW_STATUSES: SubscriptionStatus[] = [
  "institution_review",
  "under_luca_review",
  "information_requested",
];

export function wizardStepFor(sub: MockSubscription): string {
  switch (sub.status) {
    case "reserved":
      return "terms";
    case "documents_pending":
      return "documents";
    case "awaiting_funds":
      return sub.payment_declared_at ? "completed" : "payment";
    default:
      if (REVIEW_STATUSES.includes(sub.status) || sub.status === "approved") return "review";
      return "completed";
  }
}

const ACK_TEMPLATE: Array<
  Pick<AcknowledgementTerm, "key" | "version" | "position" | "required" | "body">
> = [
  {
    key: "illiquidity",
    version: 1,
    position: 1,
    required: true,
    body: "I understand this investment is illiquid and there is no guaranteed secondary market or exit.",
  },
  {
    key: "risk_of_loss",
    version: 1,
    position: 2,
    required: true,
    body: "I understand I may lose some or all of my invested capital.",
  },
  {
    key: "no_advice",
    version: 1,
    position: 3,
    required: true,
    body: "I confirm Akula has not provided investment, tax or legal advice in connection with this subscription.",
  },
  {
    key: "fees_disclosure",
    version: 1,
    position: 4,
    required: true,
    body: "I have reviewed and accept the subscription fee, management fee and carried interest disclosed for this vehicle.",
  },
];

function freshAcknowledgements(): AcknowledgementTerm[] {
  return ACK_TEMPLATE.map((t, i) => ({
    id: i + 1,
    key: t.key,
    version: t.version,
    position: t.position,
    required: t.required,
    body: t.body,
    accepted: false,
    accepted_at: null,
  }));
}

function acceptedAcknowledgements(): AcknowledgementTerm[] {
  return freshAcknowledgements().map((t) => ({ ...t, accepted: true, accepted_at: daysAgo(30) }));
}

export type MockSubscription = {
  commercial_terms?: CommercialTerms;
  effective_terms?: Fund;
  allocated_principal?: number;
  document_version_id?: number;
  needs_review_version_id?: number;
  reviewed_version_ids?: number[];
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
  payment_reference: string;
  investor_id: number;
  investor_name: string;
  investor_email: string;
  eam_firm: string | null;
  eam_name: string | null;
  on_hold: boolean;
  information_request_delivery?: "email_pending_integration";
  information_request_note: string | null;
  information_requested_at: string | null;
  information_response_note?: string | null;
  information_responded_at?: string | null;
  topup_declared_at?: string | null;
  topup_matched_amount?: number;
  holding_id?: number | null;
  rejection_reason: string | null;
  rejection_note: string | null;
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
  acknowledgements: AcknowledgementTerm[];
  /** internal signing-flow poll counters, not exposed to the client */
  _signPollCount: number;
  /** Set once this subscription has been converted into a Holding record on
   *  allocation — not exposed to the client. The subscription record itself
   *  is kept (LUCA's own reporting/history still reads it); the investor-
   *  facing subscriptions list filters it out once this is set. */
  _convertedToHoldingId: number | null;
};

function feeFor(fundId: number, amount: number, investorId?: number): string {
  const fund = findFundById(fundId);
  const override = investorId !== undefined ? pricingFor(fundId, investorId) : undefined;
  const pct = override?.subscription_fee_pct
    ? parseFloat(override.subscription_fee_pct)
    : fund
      ? parseFloat(fund.subscription_fee_pct)
      : 4;
  return (amount * (pct / 100)).toFixed(2);
}

function makeSubscription(
  id: number,
  fundId: number,
  amount: number,
  status: SubscriptionStatus,
  investor: {
    id: number;
    name: string;
    email: string;
    eamFirm: string | null;
    eamName: string | null;
  },
  ageDays: number,
): MockSubscription {
  const fund = findFundById(fundId)!;
  const acknowledgements =
    status === "reserved" ? freshAcknowledgements() : acceptedAcknowledgements();

  const origin = investor.eamFirm ? "eam" : "self_serve";
  const reserved_at = daysAgo(ageDays);
  // Index of each status along the full happy-path pipeline (institution_review
  // only actually occurs for EAM-origin subs, but its presence in this array is
  // just for threshold math — indexOf still works fine for statuses that skip it).
  const PIPELINE_ORDER: SubscriptionStatus[] = [
    "documents_pending",
    "institution_review",
    "under_luca_review",
    "information_requested",
    "approved",
    "awaiting_funds",
    "payment_unmatched",
    "reconciliation",
    "allocation_pending",
    "allocated",
    "not_allocated",
    "funds_returned",
    "rejected",
  ];
  const isPast = (step: number) => PIPELINE_ORDER.indexOf(status) >= step || status === "cancelled";
  const reviewReached = isPast(1); // at or past institution_review/under_luca_review
  const approvedReached = isPast(4); // at or past approved

  return {
    id,
    fund_id: fundId,
    fund_name: fund.name,
    asset_name: fund.asset.name,
    amount: amount.toFixed(2),
    currency: "USD",
    status,
    owner: ownerFor(status, origin),
    next_action: nextActionFor(status),
    origin,
    subscription_fee: feeFor(fundId, amount, investor.id),
    payment_reference: `AK-${fund.codename.replace(/\D/g, "").padStart(3, "0") || "000"}-${String(id).padStart(4, "0")}`,
    investor_id: investor.id,
    investor_name: investor.name,
    investor_email: investor.email,
    eam_firm: investor.eamFirm,
    eam_name: investor.eamName,
    on_hold: false,
    information_request_note:
      status === "information_requested"
        ? "Please provide an updated proof of address (dated within the last 3 months)."
        : null,
    information_requested_at:
      status === "information_requested" ? daysAgo(Math.max(0, ageDays - 4)) : null,
    rejection_reason: status === "rejected" ? "accreditation_lapsed" : null,
    rejection_note:
      status === "rejected"
        ? "Accreditation evidence on file expired before this subscription reached review."
        : null,
    payment_claimed: [
      "payment_unmatched",
      "reconciliation",
      "allocation_pending",
      "allocated",
      "not_allocated",
      "funds_returned",
    ].includes(status),
    reserved_at,
    confirmed_at: isPast(0) ? daysAgo(Math.max(0, ageDays - 3)) : null,
    institution_reviewed_at: reviewReached ? daysAgo(Math.max(0, ageDays - 4)) : null,
    approved_at: approvedReached ? daysAgo(Math.max(0, ageDays - 5)) : null,
    rejected_at: status === "rejected" ? daysAgo(Math.max(0, ageDays - 5)) : null,
    cancelled_at: status === "cancelled" ? daysAgo(Math.max(0, ageDays - 5)) : null,
    funds_received_at:
      isPast(6) && status !== "cancelled" ? daysAgo(Math.max(0, ageDays - 8)) : null,
    reconciled_at: isPast(7) && status !== "cancelled" ? daysAgo(Math.max(0, ageDays - 10)) : null,
    allocated_at: ["allocated", "not_allocated", "funds_returned"].includes(status)
      ? daysAgo(Math.max(0, ageDays - 12))
      : null,
    payment_declared_at:
      isPast(5) && status !== "cancelled" ? daysAgo(Math.max(0, ageDays - 6)) : null,
    created_at: reserved_at,
    acknowledgements,
    _signPollCount: 0,
    _convertedToHoldingId: null,
  };
}

let subscriptionAutoId = 1;
function nextSubscriptionId(): number {
  return subscriptionAutoId++;
}

export const subscriptions: MockSubscription[] = [];

function seedSubscriptions() {
  const investor2 = {
    id: 2,
    name: "Elena Cross",
    email: "investor@akula.vc",
    eamFirm: null,
    eamName: null,
  };
  const statuses: SubscriptionStatus[] = [
    "reserved",
    "documents_pending",
    "awaiting_funds",
    "payment_unmatched",
    "reconciliation",
    "allocation_pending",
    "allocated",
    "not_allocated",
    "funds_returned",
    "cancelled",
  ];
  const fundCycle = [1, 2, 3, 4, 5];
  const amounts = [50000, 75000, 40000, 60000, 100000, 30000, 45000, 35000, 55000, 20000];
  statuses.forEach((status, i) => {
    subscriptions.push(
      makeSubscription(
        nextSubscriptionId(),
        fundCycle[i % fundCycle.length],
        amounts[i],
        status,
        investor2,
        180 - i * 12,
      ),
    );
  });

  // EAM-book (Meridian) clients
  const priya = {
    id: 11,
    name: "Priya Nair",
    email: "priya.nair@example.com",
    eamFirm: "Meridian Capital Advisors",
    eamName: "Aisha Tan",
  };
  const marcus = {
    id: 12,
    name: "Marcus Webb",
    email: "marcus.webb@example.com",
    eamFirm: "Meridian Capital Advisors",
    eamName: "Aisha Tan",
  };
  const amara = {
    id: 19,
    name: "Amara Bello",
    email: "amara.bello@example.com",
    eamFirm: "Meridian Capital Advisors",
    eamName: "Aisha Tan",
  };
  subscriptions.push(makeSubscription(nextSubscriptionId(), 2, 60000, "allocated", priya, 150));
  subscriptions.push(makeSubscription(nextSubscriptionId(), 5, 30000, "awaiting_funds", priya, 20));
  subscriptions.push(makeSubscription(nextSubscriptionId(), 1, 25000, "reserved", marcus, 6));
  subscriptions.push(
    makeSubscription(nextSubscriptionId(), 4, 45000, "funds_returned", amara, 200),
  );

  // EAM-book (Straits) client
  const henry = {
    id: 18,
    name: "Henry Osei",
    email: "henry.osei@example.com",
    eamFirm: "Straits Family Office",
    eamName: "Nadia Farouk",
  };
  subscriptions.push(makeSubscription(nextSubscriptionId(), 4, 40000, "allocated", henry, 160));

  // Admin-only synthetic investors
  const julian = {
    id: 14,
    name: "Julian Ortiz",
    email: "julian.ortiz@example.com",
    eamFirm: null,
    eamName: null,
  };
  const sofia = {
    id: 15,
    name: "Sofia Reyes",
    email: "sofia.reyes@example.com",
    eamFirm: null,
    eamName: null,
  };
  const daniel = {
    id: 16,
    name: "Daniel Kim",
    email: "daniel.kim@example.com",
    eamFirm: "Nimbus Wealth Partners",
    eamName: "Oscar Bennett",
  };
  const grace = {
    id: 17,
    name: "Grace Liu",
    email: "grace.liu@example.com",
    eamFirm: "Orchard Peak Advisory",
    eamName: "Miriam Solberg",
  };
  const felix = {
    id: 20,
    name: "Felix Wong",
    email: "felix.wong@example.com",
    eamFirm: null,
    eamName: null,
  };
  subscriptions.push(makeSubscription(nextSubscriptionId(), 1, 35000, "allocated", julian, 140));
  subscriptions.push(makeSubscription(nextSubscriptionId(), 2, 28000, "cancelled", sofia, 90));
  subscriptions.push(makeSubscription(nextSubscriptionId(), 2, 50000, "allocated", daniel, 130));
  subscriptions.push(makeSubscription(nextSubscriptionId(), 3, 25000, "reserved", grace, 8));
  subscriptions.push(
    makeSubscription(nextSubscriptionId(), 5, 30000, "documents_pending", felix, 15),
  );

  // New LUCA-pipeline stages — a mix of EAM-submitted (institution_review is
  // only reachable for these) and direct/self-serve subscriptions.
  subscriptions.push(
    makeSubscription(nextSubscriptionId(), 3, 70000, "institution_review", priya, 4),
  );
  subscriptions.push(
    makeSubscription(nextSubscriptionId(), 1, 55000, "under_luca_review", julian, 12),
  );
  subscriptions.push(
    makeSubscription(nextSubscriptionId(), 4, 42000, "information_requested", marcus, 11),
  );
  subscriptions.push(makeSubscription(nextSubscriptionId(), 2, 65000, "approved", sofia, 3));
  subscriptions.push(makeSubscription(nextSubscriptionId(), 5, 38000, "rejected", daniel, 11));

  // Made-up activity on the illustrative deals (Helix, Northwind, Quanta, Tidewater).
  type SeedInvestor = Parameters<typeof makeSubscription>[4];
  const extra: [number, number, SubscriptionStatus, SeedInvestor, number][] = [
    [6, 60000, "under_luca_review", priya, 9],
    [6, 100000, "allocated", julian, 40],
    [6, 45000, "awaiting_funds", sofia, 14],
    [7, 35000, "documents_pending", marcus, 6],
    [7, 50000, "approved", grace, 5],
    [7, 40000, "allocation_pending", daniel, 18],
    [8, 120000, "allocated", amara, 55],
    [8, 80000, "reconciliation", felix, 20],
    [8, 90000, "payment_unmatched", investor2, 16],
    [8, 75000, "under_luca_review", priya, 7],
    [9, 60000, "allocated", julian, 45],
    [9, 30000, "information_requested", sofia, 8],
  ];
  for (const [fundId, amount, status, who, age] of extra) {
    subscriptions.push(makeSubscription(nextSubscriptionId(), fundId, amount, status, who, age));
  }

  // More made-up investors, each at a different point in the subscription journey.
  const person = (
    id: number,
    name: string,
    email: string,
    eamFirm: string | null = null,
    eamName: string | null = null,
  ): SeedInvestor => ({ id, name, email, eamFirm, eamName });
  const isabella = person(34, "Isabella Marchetti", "isabella.marchetti@example.com");
  const tomas = person(
    22,
    "Tomás Herrera",
    "tomas.herrera@example.com",
    "Nimbus Wealth Partners",
    "Oscar Bennett",
  );
  const rohan = person(
    24,
    "Rohan Mehta",
    "rohan.mehta@example.com",
    "Meridian Capital Advisors",
    "Aisha Tan",
  );
  const omar = person(26, "Omar Haddad", "omar.haddad@example.com");
  const chen = person(
    27,
    "Chen Wei",
    "chen.wei@example.com",
    "Straits Family Office",
    "Nadia Farouk",
  );
  const sofiaL = person(28, "Sofia Lindqvist", "sofia.lindqvist@example.com");
  const harbourview = person(
    30,
    "Harbourview Capital LP",
    "investor.relations@harbourview.example.com",
  );
  const noah = person(31, "Noah Fitzgerald", "noah.fitzgerald@example.com");
  const priyanka = person(
    32,
    "Priyanka Rao",
    "priyanka.rao@example.com",
    "Orchard Peak Advisory",
    "Miriam Solberg",
  );
  const okafor = person(33, "Daniel Okafor", "daniel.okafor@example.com");
  const journey: [number, number, SubscriptionStatus, SeedInvestor, number][] = [
    [6, 90000, "allocated", isabella, 100],
    [7, 50000, "awaiting_funds", isabella, 12],
    [8, 85000, "under_luca_review", tomas, 6],
    [1, 40000, "documents_pending", tomas, 3],
    [9, 40000, "documents_pending", rohan, 4],
    [3, 60000, "institution_review", rohan, 2],
    [8, 150000, "reconciliation", omar, 18],
    [6, 50000, "information_requested", omar, 9],
    [7, 60000, "approved", chen, 2],
    [1, 70000, "allocation_pending", chen, 26],
    [6, 25000, "rejected", sofiaL, 40],
    [8, 250000, "allocated", harbourview, 62],
    [5, 200000, "payment_unmatched", harbourview, 14],
    [2, 30000, "cancelled", noah, 120],
    [3, 55000, "institution_review", priyanka, 1],
    [1, 25000, "reserved", okafor, 3],
    [9, 45000, "awaiting_funds", okafor, 20],
    [5, 35000, "not_allocated", okafor, 70],
    [2, 40000, "funds_returned", okafor, 90],
  ];
  for (const [fundId, amount, status, who, age] of journey) {
    subscriptions.push(makeSubscription(nextSubscriptionId(), fundId, amount, status, who, age));
  }
}
seedSubscriptions();

export function findSubscriptionById(id: number): MockSubscription | undefined {
  return subscriptions.find((s) => s.id === id);
}

export function toSubscription(sub: MockSubscription): Subscription {
  return {
    id: sub.id,
    fund_id: sub.fund_id,
    fund_name: sub.fund_name,
    asset_name: sub.asset_name,
    amount: sub.amount,
    status: sub.status,
    owner: sub.owner,
    next_action: sub.next_action,
    subscription_fee: sub.subscription_fee,
    commercial_terms: sub.commercial_terms,
    effective_terms: sub.effective_terms,
    payment_reference: sub.payment_reference,
    on_hold: sub.on_hold,
    information_request_note: sub.information_request_note,
    information_requested_at: sub.information_requested_at,
    information_response_note: sub.information_response_note,
    information_responded_at: sub.information_responded_at,
    topup_declared_at: sub.topup_declared_at,
    topup_matched_amount: sub.topup_matched_amount,
    holding_id: sub._convertedToHoldingId,
    reserved_at: sub.reserved_at,
    confirmed_at: sub.confirmed_at,
    institution_reviewed_at: sub.institution_reviewed_at,
    approved_at: sub.approved_at,
    rejected_at: sub.rejected_at,
    cancelled_at: sub.cancelled_at,
    funds_received_at: sub.funds_received_at,
    reconciled_at: sub.reconciled_at,
    allocated_at: sub.allocated_at,
    payment_declared_at: sub.payment_declared_at,
  };
}

export function toAdminSubscription(sub: MockSubscription) {
  return {
    id: sub.id,
    fund_id: sub.fund_id,
    fund_name: sub.fund_name,
    asset_name: sub.asset_name,
    amount: sub.amount,
    currency: sub.currency,
    status: sub.status,
    owner: sub.owner,
    next_action: sub.next_action,
    origin: sub.origin,
    subscription_fee: sub.subscription_fee,
    commercial_terms: sub.commercial_terms,
    effective_terms: sub.effective_terms,
    payment_reference: sub.payment_reference,
    investor_id: sub.investor_id,
    investor_name: sub.investor_name,
    investor_email: sub.investor_email,
    eam_firm: sub.eam_firm,
    eam_name: sub.eam_name,
    on_hold: sub.on_hold,
    information_request_note: sub.information_request_note,
    information_requested_at: sub.information_requested_at,
    information_response_note: sub.information_response_note,
    information_responded_at: sub.information_responded_at,
    topup_declared_at: sub.topup_declared_at,
    topup_matched_amount: sub.topup_matched_amount,
    holding_id: sub._convertedToHoldingId,
    rejection_reason: sub.rejection_reason,
    rejection_note: sub.rejection_note,
    available_transitions: TRANSITIONS[sub.status].filter(
      (t) =>
        (t === "under_luca_review" && sub.status === "information_requested") ||
        ![
          "allocated",
          "not_allocated",
          "funds_returned",
          "payment_unmatched",
          "reconciliation",
          "allocation_pending",
          "institution_review",
          "under_luca_review",
        ].includes(t),
    ),
    payment_claimed: sub.payment_claimed,
    reserved_at: sub.reserved_at,
    confirmed_at: sub.confirmed_at,
    institution_reviewed_at: sub.institution_reviewed_at,
    approved_at: sub.approved_at,
    rejected_at: sub.rejected_at,
    cancelled_at: sub.cancelled_at,
    funds_received_at: sub.funds_received_at,
    reconciled_at: sub.reconciled_at,
    allocated_at: sub.allocated_at,
    payment_declared_at: sub.payment_declared_at,
    created_at: sub.created_at,
  };
}

export function acknowledgementsResponse(sub: MockSubscription) {
  const required = sub.acknowledgements.filter((t) => t.required);
  const accepted = required.filter((t) => t.accepted);
  const acceptedDates = sub.acknowledgements
    .map((t) => t.accepted_at)
    .filter((d): d is string => Boolean(d))
    .sort();
  return {
    required_count: required.length,
    accepted_count: accepted.length,
    complete: required.length > 0 && accepted.length === required.length,
    accepted_at: acceptedDates.length > 0 ? acceptedDates[acceptedDates.length - 1] : null,
    terms: sub.acknowledgements,
  };
}

// ---------------------------------------------------------------------------
// Platform activity feed (LUCA Command Dashboard)
//
// Deliberately lightweight: an in-memory, capped, push-only list — this is
// NOT the excluded audit-logging/retention feature, just a recent-events
// display. No query API, no persistence beyond the current tab session.
// ---------------------------------------------------------------------------

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

export const platformEvents: PlatformEvent[] = [];
let eventAutoId = 1;
const MAX_EVENTS = 50;

export function logEvent(
  kind: PlatformEvent["kind"],
  message: string,
  opts: { investorId?: number | null; fundId?: number | null; at?: string } = {},
) {
  platformEvents.unshift({
    id: eventAutoId++,
    kind,
    message,
    investor_id: opts.investorId ?? null,
    fund_id: opts.fundId ?? null,
    created_at: opts.at ?? new Date().toISOString(),
  });
  platformEvents.length = Math.min(platformEvents.length, MAX_EVENTS);
}

// Seed a short realistic backlog so the dashboard isn't empty on first load.
logEvent("subscription_submitted", "Elena Cross submitted a $50,000 subscription to Solara Grid.", {
  at: daysAgo(2),
  investorId: 2,
});
logEvent("status_change", "Priya Nair's subscription to Wavelength moved to institution review.", {
  at: daysAgo(4),
  investorId: 11,
});
logEvent(
  "status_change",
  "Marcus Webb's subscription to Fenwick AI is awaiting a response to an information request.",
  { at: daysAgo(9), investorId: 12 },
);
logEvent("deal_status_change", "Ledgerline Financial closed to new subscriptions.", {
  at: daysAgo(6),
  fundId: 4,
});
logEvent("status_change", "Sofia Reyes's subscription to Palette Studio was approved.", {
  at: daysAgo(3),
  investorId: 15,
});
logEvent("status_change", "Daniel Kim's subscription to Nightjar Labs was rejected.", {
  at: daysAgo(11),
  investorId: 16,
});
logEvent("deal_status_change", "Quanta Compute is 91% subscribed and closes in 3 days.", {
  at: daysAgo(1),
});
logEvent(
  "subscription_submitted",
  "Priya Nair submitted a $75,000 subscription to Quanta Compute.",
  {
    at: daysAgo(7),
  },
);
logEvent("deal_status_change", "Tidewater Carbon closed to new subscriptions.", { at: daysAgo(2) });
logEvent("document_uploaded", "Offering Memorandum filed for Helix Therapeutics.", {
  at: daysAgo(4),
});
logEvent("document_uploaded", "Updated risk disclosure filed for Kestrel Robotics.", {
  at: daysAgo(1),
  fundId: 2,
});

export function createSubscription(
  investorId: number,
  fundId: number,
  amount: string,
): MockSubscription {
  const user = findUserById(investorId);
  const profile = findInvestorProfileByUserId(investorId);
  const name = profile
    ? `${profile.first_name} ${profile.last_name}`.trim() || user?.email || "Investor"
    : user?.email || "Investor";
  const sub = makeSubscription(
    nextSubscriptionId(),
    fundId,
    parseFloat(amount),
    "reserved",
    {
      id: investorId,
      name,
      email: user?.email ?? "",
      eamFirm: profile?.eam_firm ?? null,
      eamName: profile?.eam_name ?? null,
    },
    0,
  );
  sub.confirmed_at = null;
  sub.funds_received_at = null;
  sub.reconciled_at = null;
  sub.allocated_at = null;
  sub.payment_declared_at = null;
  sub.payment_claimed = false;
  subscriptions.push(sub);
  logEvent(
    "subscription_submitted",
    `${sub.investor_name} submitted a ${formatUsd(sub.amount)} subscription to ${sub.asset_name}.`,
    { investorId: investorId, fundId: fundId },
  );
  return sub;
}

function formatUsd(amount: string): string {
  const n = parseFloat(amount);
  return `$${n.toLocaleString("en-US")}`;
}

// ---------------------------------------------------------------------------
// Bank transfers (admin payment-matching)
// ---------------------------------------------------------------------------

export const bankTransfers: BankTransfer[] = [
  {
    id: 1,
    amount: "60000.00",
    currency: "USD",
    raw_reference: "AKULA INV REF UNCLEAR /ELENA C",
    sender_name: "Elena Cross",
    received_at: daysAgo(3),
    matched_subscription_id: null,
  },
  {
    id: 2,
    amount: "42500.00",
    currency: "USD",
    raw_reference: "FBO AKULA VCC CLIENT MONEY",
    sender_name: "J. Okafor",
    received_at: daysAgo(1),
    matched_subscription_id: null,
  },
];

let bankTransferAutoId = Math.max(...bankTransfers.map((t) => t.id)) + 1;
export function nextBankTransferId(): number {
  return bankTransferAutoId++;
}

export function findBankTransferById(id: number): BankTransfer | undefined {
  return bankTransfers.find((t) => t.id === id);
}

// ---------------------------------------------------------------------------
// Holdings
// ---------------------------------------------------------------------------

export type MockHolding = Holding & { investor_id: number };

export const holdings: MockHolding[] = [
  {
    id: 1,
    investor_id: 2,
    fund_id: 1,
    fund_name: "Solara Grid SPV I",
    fund_codename: "Project Helios",
    asset_name: "Solara Grid",
    sector: "climate_energy",
    units: "270.5",
    committed_amount: "50000.00",
    current_nav: "68000.00",
    nav_as_of: daysAgo(20),
    distributions: "0.00",
    entry_price_per_share: "184.50",
    state: "held",
    subscribed_at: daysAgo(310),
    exit_date: null,
    exit_type: null,
    final_proceeds: null,
    moic: "1.36",
  },
  {
    id: 2,
    investor_id: 2,
    fund_id: 3,
    fund_name: "Orbis Space Systems SPV I",
    fund_codename: "Project Orbis",
    asset_name: "Orbis Space Systems",
    sector: "space_satellites",
    units: "190.0",
    committed_amount: "40000.00",
    current_nav: "59000.00",
    nav_as_of: daysAgo(20),
    distributions: "2000.00",
    entry_price_per_share: "210.00",
    state: "held",
    subscribed_at: daysAgo(420),
    exit_date: null,
    exit_type: null,
    final_proceeds: null,
    moic: "1.53",
  },
  {
    id: 3,
    investor_id: 2,
    fund_id: 4,
    fund_name: "Ledgerline Financial SPV I",
    fund_codename: "Project Ledger",
    asset_name: "Ledgerline Financial",
    sector: "fintech_payments",
    units: "770.5",
    committed_amount: "45000.00",
    current_nav: "82000.00",
    nav_as_of: daysAgo(60),
    distributions: "82000.00",
    entry_price_per_share: "58.40",
    state: "realized",
    subscribed_at: daysAgo(500),
    exit_date: daysAgo(60),
    exit_type: "acquisition",
    final_proceeds: "82000.00",
    moic: "1.82",
  },
  {
    id: 4,
    investor_id: 11,
    fund_id: 2,
    fund_name: "Kestrel Robotics SPV II",
    fund_codename: "Project Kestrel",
    asset_name: "Kestrel Robotics",
    sector: "robotics_automation",
    units: "624.0",
    committed_amount: "60000.00",
    current_nav: "71000.00",
    nav_as_of: daysAgo(15),
    distributions: "0.00",
    entry_price_per_share: "96.20",
    state: "held",
    subscribed_at: daysAgo(150),
    exit_date: null,
    exit_type: null,
    final_proceeds: null,
    moic: "1.18",
  },
  {
    id: 5,
    investor_id: 19,
    fund_id: 5,
    fund_name: "Atlas Defense Systems SPV I",
    fund_codename: "Project Atlas",
    asset_name: "Atlas Defense Systems",
    sector: "defence_aerospace",
    units: "560.5",
    committed_amount: "80000.00",
    current_nav: "95000.00",
    nav_as_of: daysAgo(15),
    distributions: "0.00",
    entry_price_per_share: "142.75",
    state: "held",
    subscribed_at: daysAgo(90),
    exit_date: null,
    exit_type: null,
    final_proceeds: null,
    moic: "1.19",
  },
  {
    id: 6,
    investor_id: 18,
    fund_id: 3,
    fund_name: "Orbis Space Systems SPV I",
    fund_codename: "Project Orbis",
    asset_name: "Orbis Space Systems",
    sector: "space_satellites",
    units: "236.0",
    committed_amount: "50000.00",
    current_nav: "58000.00",
    nav_as_of: daysAgo(20),
    distributions: "0.00",
    entry_price_per_share: "210.00",
    state: "held",
    subscribed_at: daysAgo(200),
    exit_date: null,
    exit_type: null,
    final_proceeds: null,
    moic: "1.16",
  },
  {
    id: 7,
    investor_id: 14,
    fund_id: 1,
    fund_name: "Solara Grid SPV I",
    fund_codename: "Project Helios",
    asset_name: "Solara Grid",
    sector: "climate_energy",
    units: "189.7",
    committed_amount: "35000.00",
    current_nav: "44000.00",
    nav_as_of: daysAgo(20),
    distributions: "0.00",
    entry_price_per_share: "184.50",
    state: "held",
    subscribed_at: daysAgo(140),
    exit_date: null,
    exit_type: null,
    final_proceeds: null,
    moic: "1.26",
  },
];

let holdingAutoId = Math.max(...holdings.map((h) => h.id)) + 1;
export function nextHoldingId(): number {
  return holdingAutoId++;
}

/** Issuing a holding is the investor-facing conclusion of allocation: a real
 *  Holding record is created from the subscription's own numbers, and the
 *  subscription is marked converted so the investor's own subscriptions list
 *  stops showing it — LUCA's own reporting keeps reading the subscription
 *  record unchanged, this only affects the investor-facing view. Used both
 *  for live "allocated" transitions and to backfill subscriptions seeded
 *  directly at "allocated" status below. */
export function issueHolding(
  sub: MockSubscription,
  units?: string,
  pricePerUnit?: string,
  allocatedPrincipal?: number,
): void {
  const fund = findFundById(sub.fund_id);
  if (!fund || sub._convertedToHoldingId) return;
  const amount = allocatedPrincipal ?? parseFloat(sub.amount);
  const price = pricePerUnit?.trim() ? parseFloat(pricePerUnit) : parseFloat(fund.price);
  const unitCount = units?.trim() ? parseFloat(units) : price > 0 ? amount / price : 0;
  const now = new Date().toISOString();

  const holding: MockHolding = {
    id: nextHoldingId(),
    investor_id: sub.investor_id,
    fund_id: fund.id,
    fund_name: fund.name,
    fund_codename: fund.codename,
    asset_name: fund.asset.name,
    sector: fund.asset.sector,
    units: unitCount.toFixed(2),
    committed_amount: amount.toFixed(2),
    current_nav: amount.toFixed(2),
    nav_as_of: sub.allocated_at ?? now,
    distributions: "0.00",
    entry_price_per_share: price.toFixed(2),
    state: "held",
    subscribed_at: sub.reserved_at,
    exit_date: null,
    exit_type: null,
    final_proceeds: null,
    moic: null,
  };
  holdings.push(holding);
  sub._convertedToHoldingId = holding.id;
  logEvent("status_change", `${sub.investor_name}'s holding in ${sub.asset_name} was issued.`, {
    investorId: sub.investor_id,
    fundId: sub.fund_id,
  });
}

// Backfill: subscriptions seeded directly at "allocated" status never went
// through the live transition above, so convert them here too — keeps the
// seed data consistent with the rule that an allocated subscription always
// has a matching Holding and never lingers in the investor's own list.
for (const sub of subscriptions) {
  if (sub.status === "allocated") issueHolding(sub);
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const documents: AdminDocument[] = [
  {
    id: 1,
    name: "Solara Grid — Subscription Agreement",
    kind: "agreement",
    status: "signed",
    review_state: "filed",
    has_file: true,
    fund_id: 1,
    fund_name: "Solara Grid SPV I",
    subscription_id: 1,
    owner_id: 2,
    owner_name: "Elena Cross",
    owner_email: "investor@akula.vc",
    created_at: daysAgo(170),
  },
  {
    id: 2,
    name: "Solara Grid — Factsheet",
    kind: "factsheet",
    status: "available",
    review_state: "filed",
    has_file: true,
    fund_id: 1,
    fund_name: "Solara Grid SPV I",
    subscription_id: null,
    owner_id: 2,
    owner_name: "Elena Cross",
    owner_email: "investor@akula.vc",
    created_at: daysAgo(175),
  },
  {
    id: 3,
    name: "Kestrel Robotics — Term Sheet",
    kind: "termsheet",
    status: "issued",
    review_state: "reviewing",
    has_file: true,
    fund_id: 2,
    fund_name: "Kestrel Robotics SPV II",
    subscription_id: 2,
    owner_id: 2,
    owner_name: "Elena Cross",
    owner_email: "investor@akula.vc",
    created_at: daysAgo(80),
  },
  {
    id: 4,
    name: "Ledgerline Financial — Q3 Statement",
    kind: "statement",
    status: "available",
    review_state: "filed",
    has_file: true,
    fund_id: 4,
    fund_name: "Ledgerline Financial SPV I",
    subscription_id: null,
    owner_id: 2,
    owner_name: "Elena Cross",
    owner_email: "investor@akula.vc",
    created_at: daysAgo(55),
  },
  {
    id: 5,
    name: "Atlas Defense Systems — Pitch Deck",
    kind: "deck",
    status: "available",
    review_state: "filed",
    has_file: true,
    fund_id: 5,
    fund_name: "Atlas Defense Systems SPV I",
    subscription_id: null,
    owner_id: 2,
    owner_name: "Elena Cross",
    owner_email: "investor@akula.vc",
    created_at: daysAgo(9),
  },
  {
    id: 6,
    name: "Elena Cross — Tax Form W-8BEN",
    kind: "tax",
    status: "action_required",
    review_state: "received",
    has_file: false,
    fund_id: null,
    fund_name: null,
    subscription_id: null,
    owner_id: 2,
    owner_name: "Elena Cross",
    owner_email: "investor@akula.vc",
    created_at: daysAgo(2),
  },
  {
    id: 7,
    name: "Kestrel Robotics — Subscription Agreement",
    kind: "agreement",
    status: "signed",
    review_state: "filed",
    has_file: true,
    fund_id: 2,
    fund_name: "Kestrel Robotics SPV II",
    subscription_id: 11,
    owner_id: 11,
    owner_name: "Priya Nair",
    owner_email: "priya.nair@example.com",
    created_at: daysAgo(148),
  },
  {
    id: 8,
    name: "Kestrel Robotics — Factsheet",
    kind: "factsheet",
    status: "available",
    review_state: "filed",
    has_file: true,
    fund_id: 2,
    fund_name: "Kestrel Robotics SPV II",
    subscription_id: null,
    owner_id: 11,
    owner_name: "Priya Nair",
    owner_email: "priya.nair@example.com",
    created_at: daysAgo(150),
  },
  {
    id: 9,
    name: "Priya Nair — KYC Passport Copy",
    kind: "tax",
    status: "available",
    review_state: "filed",
    has_file: true,
    fund_id: null,
    fund_name: null,
    subscription_id: null,
    owner_id: 11,
    owner_name: "Priya Nair",
    owner_email: "priya.nair@example.com",
    created_at: daysAgo(155),
  },
  {
    id: 10,
    name: "Julian Ortiz — Subscription Agreement",
    kind: "agreement",
    status: "signed",
    review_state: "reviewing",
    has_file: true,
    fund_id: 1,
    fund_name: "Solara Grid SPV I",
    subscription_id: 15,
    owner_id: 14,
    owner_name: "Julian Ortiz",
    owner_email: "julian.ortiz@example.com",
    created_at: daysAgo(2),
  },
  {
    id: 11,
    name: "Sofia Reyes — Accreditation Letter",
    kind: "tax",
    status: "action_required",
    review_state: "received",
    has_file: true,
    fund_id: null,
    fund_name: null,
    subscription_id: null,
    owner_id: 15,
    owner_name: "Sofia Reyes",
    owner_email: "sofia.reyes@example.com",
    created_at: daysAgo(1),
  },
  {
    id: 12,
    name: "Orbis Space Systems — Memo",
    kind: "memo",
    status: "available",
    review_state: "received",
    has_file: true,
    fund_id: 3,
    fund_name: "Orbis Space Systems SPV I",
    subscription_id: null,
    owner_id: 18,
    owner_name: "Henry Osei",
    owner_email: "henry.osei@example.com",
    created_at: daysAgo(3),
  },
];

let documentAutoId = documents.length + 1;
export function nextDocumentId(): number {
  return documentAutoId++;
}

// Made-up compliance documents from the new investors, waiting for LUCA to review.
{
  const submitted = (
    name: string,
    kind: string,
    ownerId: number,
    ownerName: string,
    email: string,
    ageDays: number,
    review: AdminDocument["review_state"] = "received",
  ) =>
    documents.push({
      id: nextDocumentId(),
      name,
      kind,
      status: "submitted",
      review_state: review,
      has_file: true,
      fund_id: null,
      fund_name: null,
      subscription_id: null,
      owner_id: ownerId,
      owner_name: ownerName,
      owner_email: email,
      created_at: daysAgo(ageDays),
    });
  submitted(
    "Aiko Tanaka — Accredited investor evidence",
    "accreditation_letter",
    23,
    "Aiko Tanaka",
    "aiko.tanaka@example.com",
    6,
  );
  submitted(
    "Priyanka Rao — Proof of address",
    "proof_of_address",
    32,
    "Priyanka Rao",
    "priyanka.rao@example.com",
    2,
  );
  submitted(
    "Isabella Marchetti — Tax self-certification (CRS)",
    "tax",
    34,
    "Isabella Marchetti",
    "isabella.marchetti@example.com",
    4,
    "reviewing",
  );
  submitted(
    "Harbourview Capital LP — Authorised signatory list",
    "authorised_signatories",
    30,
    "Harbourview Capital LP",
    "investor.relations@harbourview.example.com",
    1,
  );
}

// Deal-level materials (no subscription attached) for every vehicle, so each
// deal workspace has documents to browse. Investor-visible once published.
const dealMaterials: [string, string][] = [
  ["factsheet", "Factsheet"],
  ["offering_memorandum", "Offering Memorandum"],
  ["risk_disclosure", "Risk Disclosure"],
];
for (const fund of funds) {
  if (fund.id <= 5) continue;
  dealMaterials.forEach(([kind, label], index) => {
    if (fund.state === "draft" && index > 0) return;
    documents.push({
      id: nextDocumentId(),
      name: `${fund.asset.name} — ${label}`,
      kind,
      status: "available",
      review_state: "filed",
      has_file: false,
      fund_id: fund.id,
      fund_name: fund.name,
      subscription_id: null,
      owner_id: 1,
      owner_name: "LUCA SGP",
      owner_email: "luca@akula.vc",
      created_at: daysAgo(20 - index * 3),
    });
  });
}

// Backfill a signed subscription agreement for every subscription that has
// actually signed its documents (confirmed_at set) but has no agreement
// document on file yet, so the LUCA review queue's document checklist
// matches what the subscription timeline already claims happened.
for (const sub of subscriptions) {
  if (!sub.confirmed_at) continue;
  const hasAgreement = documents.some(
    (d) => d.kind === "agreement" && d.subscription_id === sub.id,
  );
  if (hasAgreement) continue;
  documents.push({
    id: nextDocumentId(),
    name: `${sub.asset_name} — Subscription Agreement`,
    kind: "agreement",
    status: "signed",
    review_state: "filed",
    has_file: true,
    fund_id: sub.fund_id,
    fund_name: sub.fund_name,
    subscription_id: sub.id,
    owner_id: sub.investor_id,
    owner_name: sub.investor_name,
    owner_email: sub.investor_email,
    created_at: sub.confirmed_at,
  });
}

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------

export type MockWatchlistItem = WatchlistItem & { user_id: number };

export const watchlist: MockWatchlistItem[] = [
  {
    id: 1,
    user_id: 2,
    fund_id: 2,
    fund_name: "Kestrel Robotics SPV II",
    fund_codename: "Project Kestrel",
    asset_name: "Kestrel Robotics",
    sector: "robotics_automation",
    state: "open",
    price: "96.20",
    min_subscription: "25000",
    closes_at: daysFromNow(5),
    added_at: daysAgo(14),
  },
  {
    id: 2,
    user_id: 2,
    fund_id: 5,
    fund_name: "Atlas Defense Systems SPV I",
    fund_codename: "Project Atlas",
    asset_name: "Atlas Defense Systems",
    sector: "defence_aerospace",
    state: "open",
    price: "142.75",
    min_subscription: "25000",
    closes_at: daysFromNow(60),
    added_at: daysAgo(6),
  },
];

let watchlistAutoId = watchlist.length + 1;
export function nextWatchlistId(): number {
  return watchlistAutoId++;
}

// ---------------------------------------------------------------------------
// EAM: adviser clients, highlights, discussions
// ---------------------------------------------------------------------------

export type MockAdviserClient = Omit<AdviserClient, "investor_user_id" | "client_code"> & {
  eam_user_id: number;
  investor_id: number;
};

export const adviserClients: MockAdviserClient[] = [
  {
    id: 1,
    eam_user_id: 4,
    investor_id: 11,
    investor_profile_id: 11,
    client_name: "Priya Nair",
    client_email: "priya.nair@example.com",
    stage: "active",
    notes: "Long-standing client, comfortable with illiquid positions. Prefers primary deals.",
    created_at: daysAgo(160),
    updated_at: daysAgo(5),
  },
  {
    id: 2,
    eam_user_id: 4,
    investor_id: 12,
    investor_profile_id: 12,
    client_name: "Marcus Webb",
    client_email: "marcus.webb@example.com",
    stage: "onboarding",
    notes: "Referred last month, still completing KYC.",
    created_at: daysAgo(20),
    updated_at: daysAgo(2),
  },
  {
    id: 3,
    eam_user_id: 4,
    investor_id: 13,
    investor_profile_id: 13,
    client_name: "Chloe Tan",
    client_email: "chloe.tan@example.com",
    stage: "prospect",
    notes: "Introductory call scheduled; interested in climate and space deals.",
    created_at: daysAgo(9),
    updated_at: daysAgo(9),
  },
  {
    id: 4,
    eam_user_id: 4,
    investor_id: 19,
    investor_profile_id: 19,
    client_name: "Amara Bello",
    client_email: "amara.bello@example.com",
    stage: "active",
    notes: "Realized her first position; looking to redeploy into defence-sector deals.",
    created_at: daysAgo(210),
    updated_at: daysAgo(30),
  },
  {
    id: 5,
    eam_user_id: 5,
    investor_id: 18,
    investor_profile_id: 18,
    client_name: "Henry Osei",
    client_email: "henry.osei@example.com",
    stage: "active",
    notes: "Family office allocation; reviews quarterly.",
    created_at: daysAgo(205),
    updated_at: daysAgo(12),
  },
  {
    id: 6,
    eam_user_id: 4,
    investor_id: 2,
    investor_profile_id: 1,
    client_name: "Elena Cross",
    client_email: "investor@akula.vc",
    stage: "active",
    notes: "Self-directed on most deals; open to occasional RM ideas outside her usual sectors.",
    created_at: daysAgo(300),
    updated_at: daysAgo(6),
  },
  {
    id: 7,
    eam_user_id: 4,
    investor_id: 24,
    investor_profile_id: 24,
    client_name: "Rohan Mehta",
    client_email: "rohan.mehta@example.com",
    stage: "active",
    notes: "Referred two months ago; first subscriptions in progress.",
    created_at: daysAgo(60),
    updated_at: daysAgo(2),
  },
];

export const highlights: Highlight[] = [
  {
    id: 1,
    adviser_client_id: 2,
    client_name: "Marcus Webb",
    fund_id: 1,
    fund_name: "Solara Grid SPV I",
    rationale: "Fits his stated interest in climate infrastructure with contracted revenue.",
    created_at: daysAgo(6),
  },
  {
    id: 2,
    adviser_client_id: 3,
    client_name: "Chloe Tan",
    fund_id: 3,
    fund_name: "Orbis Space Systems SPV I",
    rationale: "Matches her interest in space and government-backed contracts.",
    created_at: daysAgo(4),
  },
  {
    id: 3,
    adviser_client_id: 4,
    client_name: "Amara Bello",
    fund_id: 5,
    fund_name: "Atlas Defense Systems SPV I",
    rationale: "Good redeployment candidate following her Ledgerline exit.",
    created_at: daysAgo(25),
  },
  {
    id: 4,
    adviser_client_id: 5,
    client_name: "Henry Osei",
    fund_id: 2,
    fund_name: "Kestrel Robotics SPV II",
    rationale: "Discounted secondary entry ahead of the closing window.",
    created_at: daysAgo(3),
  },
  {
    id: 5,
    adviser_client_id: 6,
    client_name: "Elena Cross",
    fund_id: 5,
    fund_name: "Atlas Defense Systems SPV I",
    rationale:
      "Diversifies away from your climate/robotics concentration into defence-backed contracts.",
    created_at: daysAgo(2),
  },
];

let highlightAutoId = highlights.length + 1;
export function nextHighlightId(): number {
  return highlightAutoId++;
}

export type MockDiscussion = Discussion & { messages: DiscussionMessage[] };

export const discussions: MockDiscussion[] = [
  {
    id: 1,
    adviser_client_id: 1,
    client_name: "Priya Nair",
    fund_id: 2,
    fund_name: "Kestrel Robotics SPV II",
    status: "open",
    created_at: daysAgo(18),
    updated_at: daysAgo(1),
    messages: [
      {
        id: 1,
        sender_role: "investor",
        body: "Is there room to increase my allocation before this closes?",
        created_at: daysAgo(3),
      },
      {
        id: 2,
        sender_role: "adviser",
        body: "Checking with Akula ops on remaining supply — will confirm by tomorrow.",
        created_at: daysAgo(2),
      },
      {
        id: 3,
        sender_role: "adviser",
        body: "Confirmed, there's room for another $25k if you'd like to add to your position.",
        created_at: daysAgo(1),
      },
    ],
  },
  {
    id: 2,
    adviser_client_id: 4,
    client_name: "Amara Bello",
    fund_id: 5,
    fund_name: "Atlas Defense Systems SPV I",
    status: "resolved",
    created_at: daysAgo(28),
    updated_at: daysAgo(24),
    messages: [
      {
        id: 4,
        sender_role: "investor",
        body: "How does the exit from Ledgerline affect my tax reporting this year?",
        created_at: daysAgo(28),
      },
      {
        id: 5,
        sender_role: "adviser",
        body: "Your realized gain statement is in Documents — happy to walk through it on a call.",
        created_at: daysAgo(24),
      },
    ],
  },
];

let discussionAutoId = discussions.length + 1;
let discussionMessageAutoId = 6;
export function nextDiscussionId(): number {
  return discussionAutoId++;
}
export function nextDiscussionMessageId(): number {
  return discussionMessageAutoId++;
}

export function findAdviserClientById(id: number): MockAdviserClient | undefined {
  return adviserClients.find((c) => c.id === id);
}

// ---------------------------------------------------------------------------
// Admin: investors, partners
// ---------------------------------------------------------------------------

type AdminInvestorSeed = {
  id: number;
  full_name: string;
  email: string;
  investor_type: "individual" | "institutional";
  country: string | null;
  nationality: string | null;
  onboarding_step: number | null;
  onboarding_completed_at: string | null;
  verification_status: VerificationStatus;
  identity_status: IdentityStatus;
  accreditation_status: AccreditationStatus;
  /** null unless accredited — the LUCA dashboard's 30/60/90-day expiry bands key off this. */
  accreditation_expiry: string | null;
  reviewed_at: string | null;
  nda_status: string;
  eam_firm: string | null;
  /** LUCA's own private notes on this investor — never shown to the investor, EAM or RM. */
  internal_notes: string;
};

function committedAmountFor(investorId: number): string {
  // A subscription that's been converted into a Holding (see issueHolding)
  // is excluded here — its committed capital is now represented by that
  // Holding record, and counting both would double it.
  const subTotal = subscriptions
    .filter(
      (s) =>
        s.investor_id === investorId &&
        !["cancelled", "rejected", "funds_returned", "not_allocated"].includes(s.status) &&
        !s._convertedToHoldingId,
    )
    .reduce((sum, s) => sum + (s.allocated_principal ?? parseFloat(s.amount)), 0);
  const holdingTotal = holdings
    .filter((h) => h.investor_id === investorId)
    .reduce((sum, h) => sum + parseFloat(h.committed_amount), 0);
  return (subTotal + holdingTotal).toFixed(2);
}

function openSubscriptionsFor(investorId: number): number {
  return subscriptions.filter(
    (s) =>
      s.investor_id === investorId &&
      !s._convertedToHoldingId &&
      !["cancelled", "rejected", "not_allocated", "funds_returned"].includes(s.status),
  ).length;
}

const adminInvestorSeeds: AdminInvestorSeed[] = [
  {
    id: 2,
    full_name: "Elena Cross",
    email: "investor@akula.vc",
    investor_type: "individual",
    country: "United States",
    nationality: "American",
    onboarding_step: 4,
    onboarding_completed_at: daysAgo(300),
    verification_status: "approved",
    identity_status: "verified",
    accreditation_status: "accredited",
    accreditation_expiry: daysFromNow(45),
    reviewed_at: daysAgo(295),
    nda_status: "signed",
    eam_firm: null,
    internal_notes:
      "Long-standing direct investor, very responsive. Confirmed by phone that the renewed accreditation letter is already with her accountant.",
  },
  {
    id: 3,
    full_name: "Newly Registered",
    email: "newinvestor@akula.vc",
    investor_type: "individual",
    country: null,
    nationality: null,
    onboarding_step: 0,
    onboarding_completed_at: null,
    verification_status: "pending",
    identity_status: "not_started",
    accreditation_status: "not_started",
    accreditation_expiry: null,
    reviewed_at: null,
    nda_status: "not_started",
    eam_firm: null,
    internal_notes: "",
  },
  {
    id: 5,
    full_name: "Nadia Farouk",
    email: "dual@akula.vc",
    investor_type: "individual",
    country: "Singapore",
    nationality: "Singaporean",
    onboarding_step: 1,
    onboarding_completed_at: null,
    verification_status: "pending",
    identity_status: "not_started",
    accreditation_status: "not_started",
    accreditation_expiry: null,
    reviewed_at: null,
    nda_status: "not_started",
    eam_firm: null,
    internal_notes: "",
  },
  {
    id: 11,
    full_name: "Priya Nair",
    email: "priya.nair@example.com",
    investor_type: "individual",
    country: "Singapore",
    nationality: "Singaporean",
    onboarding_step: 4,
    onboarding_completed_at: daysAgo(158),
    verification_status: "approved",
    identity_status: "verified",
    accreditation_status: "accredited",
    accreditation_expiry: daysFromNow(20),
    reviewed_at: daysAgo(155),
    nda_status: "signed",
    eam_firm: "Meridian Capital Advisors",
    internal_notes: "",
  },
  {
    id: 12,
    full_name: "Marcus Webb",
    email: "marcus.webb@example.com",
    investor_type: "individual",
    country: "United Kingdom",
    nationality: "British",
    onboarding_step: 3,
    onboarding_completed_at: null,
    verification_status: "in_review",
    identity_status: "pending",
    accreditation_status: "pending",
    accreditation_expiry: null,
    reviewed_at: null,
    nda_status: "pending",
    eam_firm: "Meridian Capital Advisors",
    internal_notes:
      "RM (Aisha Tan) flagged that KYC documents were sent to the wrong inbox — resent 2 weeks ago, still awaiting upload from the client's side.",
  },
  {
    id: 13,
    full_name: "Chloe Tan",
    email: "chloe.tan@example.com",
    investor_type: "individual",
    country: "Singapore",
    nationality: "Singaporean",
    onboarding_step: 0,
    onboarding_completed_at: null,
    verification_status: "pending",
    identity_status: "not_started",
    accreditation_status: "not_started",
    accreditation_expiry: null,
    reviewed_at: null,
    nda_status: "not_started",
    eam_firm: "Meridian Capital Advisors",
    internal_notes: "",
  },
  {
    id: 14,
    full_name: "Julian Ortiz",
    email: "julian.ortiz@example.com",
    investor_type: "individual",
    country: "Spain",
    nationality: "Spanish",
    onboarding_step: 4,
    onboarding_completed_at: daysAgo(138),
    verification_status: "approved",
    identity_status: "verified",
    accreditation_status: "accredited",
    accreditation_expiry: daysFromNow(80),
    reviewed_at: daysAgo(136),
    nda_status: "signed",
    eam_firm: null,
    internal_notes: "",
  },
  {
    id: 15,
    full_name: "Sofia Reyes",
    email: "sofia.reyes@example.com",
    investor_type: "individual",
    country: "Mexico",
    nationality: "Mexican",
    onboarding_step: 4,
    onboarding_completed_at: daysAgo(85),
    verification_status: "rejected",
    identity_status: "failed",
    accreditation_status: "not_accredited",
    accreditation_expiry: null,
    reviewed_at: daysAgo(80),
    nda_status: "signed",
    eam_firm: null,
    internal_notes: "",
  },
  {
    id: 16,
    full_name: "Daniel Kim",
    email: "daniel.kim@example.com",
    investor_type: "individual",
    country: "South Korea",
    nationality: "South Korean",
    onboarding_step: 4,
    onboarding_completed_at: daysAgo(128),
    verification_status: "approved",
    identity_status: "verified",
    accreditation_status: "accredited",
    accreditation_expiry: daysFromNow(10),
    reviewed_at: daysAgo(126),
    nda_status: "signed",
    eam_firm: "Nimbus Wealth Partners",
    internal_notes: "",
  },
  {
    id: 17,
    full_name: "Grace Liu",
    email: "grace.liu@example.com",
    investor_type: "individual",
    country: "Taiwan",
    nationality: "Taiwanese",
    onboarding_step: 2,
    onboarding_completed_at: null,
    verification_status: "pending",
    identity_status: "pending",
    accreditation_status: "pending",
    accreditation_expiry: null,
    reviewed_at: null,
    nda_status: "not_started",
    eam_firm: "Orchard Peak Advisory",
    internal_notes: "",
  },
  {
    id: 18,
    full_name: "Henry Osei",
    email: "henry.osei@example.com",
    investor_type: "individual",
    country: "Ghana",
    nationality: "Ghanaian",
    onboarding_step: 4,
    onboarding_completed_at: daysAgo(203),
    verification_status: "approved",
    identity_status: "verified",
    accreditation_status: "accredited",
    accreditation_expiry: daysFromNow(200),
    reviewed_at: daysAgo(200),
    nda_status: "signed",
    eam_firm: "Straits Family Office",
    internal_notes: "",
  },
  {
    id: 19,
    full_name: "Amara Bello",
    email: "amara.bello@example.com",
    investor_type: "individual",
    country: "Nigeria",
    nationality: "Nigerian",
    onboarding_step: 4,
    onboarding_completed_at: daysAgo(208),
    verification_status: "approved",
    identity_status: "verified",
    accreditation_status: "accredited",
    accreditation_expiry: daysFromNow(55),
    reviewed_at: daysAgo(205),
    nda_status: "signed",
    eam_firm: "Meridian Capital Advisors",
    internal_notes: "",
  },
  {
    id: 20,
    full_name: "Felix Wong",
    email: "felix.wong@example.com",
    investor_type: "individual",
    country: "Canada",
    nationality: "Canadian",
    onboarding_step: 4,
    onboarding_completed_at: daysAgo(14),
    verification_status: "in_review",
    identity_status: "pending",
    accreditation_status: "pending",
    accreditation_expiry: null,
    reviewed_at: null,
    nda_status: "signed",
    eam_firm: null,
    internal_notes: "",
  },
  {
    id: 21,
    full_name: "Meridian Growth Capital Ltd.",
    email: "onboarding@meridiangrowthcapital.example.com",
    investor_type: "institutional",
    country: "Singapore",
    nationality: null,
    onboarding_step: 3,
    onboarding_completed_at: null,
    verification_status: "pending",
    identity_status: "pending",
    accreditation_status: "pending",
    accreditation_expiry: null,
    reviewed_at: null,
    nda_status: "pending",
    eam_firm: null,
    internal_notes:
      "Entity application — awaiting certificate of incorporation and authorised-signatory list.",
  },
  // ── Made-up investors spread across the onboarding lifecycle ──
  {
    id: 34,
    full_name: "Isabella Marchetti",
    email: "isabella.marchetti@example.com",
    investor_type: "individual",
    country: "Italy",
    nationality: "Italian",
    onboarding_step: 4,
    onboarding_completed_at: daysAgo(210),
    verification_status: "approved",
    identity_status: "verified",
    accreditation_status: "accredited",
    accreditation_expiry: daysFromNow(200),
    reviewed_at: daysAgo(205),
    nda_status: "signed",
    eam_firm: null,
    internal_notes: "",
  },
  {
    id: 22,
    full_name: "Tomás Herrera",
    email: "tomas.herrera@example.com",
    investor_type: "individual",
    country: "Spain",
    nationality: "Spanish",
    onboarding_step: 4,
    onboarding_completed_at: daysAgo(95),
    verification_status: "approved",
    identity_status: "verified",
    accreditation_status: "accredited",
    accreditation_expiry: daysFromNow(12),
    reviewed_at: daysAgo(90),
    nda_status: "signed",
    eam_firm: "Nimbus Wealth Partners",
    internal_notes: "Accreditation renewal letter requested via his adviser.",
  },
  {
    id: 23,
    full_name: "Aiko Tanaka",
    email: "aiko.tanaka@example.com",
    investor_type: "individual",
    country: "Japan",
    nationality: "Japanese",
    onboarding_step: 3,
    onboarding_completed_at: null,
    verification_status: "in_review",
    identity_status: "verified",
    accreditation_status: "pending",
    accreditation_expiry: null,
    reviewed_at: null,
    nda_status: "signed",
    eam_firm: null,
    internal_notes: "Identity verified. Accreditation evidence uploaded, waiting for LUCA review.",
  },
  {
    id: 24,
    full_name: "Rohan Mehta",
    email: "rohan.mehta@example.com",
    investor_type: "individual",
    country: "India",
    nationality: "Indian",
    onboarding_step: 4,
    onboarding_completed_at: daysAgo(60),
    verification_status: "approved",
    identity_status: "verified",
    accreditation_status: "accredited",
    accreditation_expiry: daysFromNow(75),
    reviewed_at: daysAgo(57),
    nda_status: "signed",
    eam_firm: "Meridian Capital Advisors",
    internal_notes: "",
  },
  {
    id: 25,
    full_name: "Lena Fischer",
    email: "lena.fischer@example.com",
    investor_type: "individual",
    country: "Germany",
    nationality: "German",
    onboarding_step: 2,
    onboarding_completed_at: null,
    verification_status: "pending",
    identity_status: "pending",
    accreditation_status: "not_started",
    accreditation_expiry: null,
    reviewed_at: null,
    nda_status: "not_started",
    eam_firm: null,
    internal_notes: "",
  },
  {
    id: 26,
    full_name: "Omar Haddad",
    email: "omar.haddad@example.com",
    investor_type: "individual",
    country: "United Arab Emirates",
    nationality: "Emirati",
    onboarding_step: 4,
    onboarding_completed_at: daysAgo(130),
    verification_status: "approved",
    identity_status: "verified",
    accreditation_status: "accredited",
    accreditation_expiry: daysFromNow(365),
    reviewed_at: daysAgo(128),
    nda_status: "signed",
    eam_firm: null,
    internal_notes: "High-net-worth investor. Prefers late-stage deals.",
  },
  {
    id: 27,
    full_name: "Chen Wei",
    email: "chen.wei@example.com",
    investor_type: "individual",
    country: "Singapore",
    nationality: "Singaporean",
    onboarding_step: 4,
    onboarding_completed_at: daysAgo(80),
    verification_status: "approved",
    identity_status: "verified",
    accreditation_status: "accredited",
    accreditation_expiry: daysFromNow(33),
    reviewed_at: daysAgo(78),
    nda_status: "signed",
    eam_firm: "Straits Family Office",
    internal_notes: "",
  },
  {
    id: 28,
    full_name: "Sofia Lindqvist",
    email: "sofia.lindqvist@example.com",
    investor_type: "individual",
    country: "Sweden",
    nationality: "Swedish",
    onboarding_step: 4,
    onboarding_completed_at: daysAgo(40),
    verification_status: "rejected",
    identity_status: "failed",
    accreditation_status: "not_accredited",
    accreditation_expiry: null,
    reviewed_at: daysAgo(38),
    nda_status: "signed",
    eam_firm: null,
    internal_notes: "Declined after identity verification failed.",
  },
  {
    id: 29,
    full_name: "Atlas Family Trust",
    email: "onboarding@atlasfamilytrust.example.com",
    investor_type: "institutional",
    country: "Cayman Islands",
    nationality: null,
    onboarding_step: 3,
    onboarding_completed_at: null,
    verification_status: "pending",
    identity_status: "pending",
    accreditation_status: "pending",
    accreditation_expiry: null,
    reviewed_at: null,
    nda_status: "pending",
    eam_firm: null,
    internal_notes: "Entity application — awaiting trust deed and trustee list.",
  },
  {
    id: 30,
    full_name: "Harbourview Capital LP",
    email: "investor.relations@harbourview.example.com",
    investor_type: "institutional",
    country: "United States",
    nationality: null,
    onboarding_step: 4,
    onboarding_completed_at: daysAgo(150),
    verification_status: "approved",
    identity_status: "verified",
    accreditation_status: "accredited",
    accreditation_expiry: daysFromNow(150),
    reviewed_at: daysAgo(146),
    nda_status: "signed",
    eam_firm: null,
    internal_notes: "Institutional investor. Larger tickets across several deals.",
  },
  {
    id: 31,
    full_name: "Noah Fitzgerald",
    email: "noah.fitzgerald@example.com",
    investor_type: "individual",
    country: "Ireland",
    nationality: "Irish",
    onboarding_step: 4,
    onboarding_completed_at: daysAgo(360),
    verification_status: "approved",
    identity_status: "verified",
    accreditation_status: "not_accredited",
    accreditation_expiry: null,
    reviewed_at: daysAgo(355),
    nda_status: "signed",
    eam_firm: null,
    internal_notes:
      "Accreditation lapsed 10 days ago. Blocked from new subscriptions until renewed.",
  },
  {
    id: 32,
    full_name: "Priyanka Rao",
    email: "priyanka.rao@example.com",
    investor_type: "individual",
    country: "India",
    nationality: "Indian",
    onboarding_step: 3,
    onboarding_completed_at: null,
    verification_status: "in_review",
    identity_status: "pending",
    accreditation_status: "pending",
    accreditation_expiry: null,
    reviewed_at: null,
    nda_status: "signed",
    eam_firm: "Orchard Peak Advisory",
    internal_notes: "",
  },
  {
    id: 33,
    full_name: "Daniel Okafor",
    email: "daniel.okafor@example.com",
    investor_type: "individual",
    country: "Nigeria",
    nationality: "Nigerian",
    onboarding_step: 4,
    onboarding_completed_at: daysAgo(70),
    verification_status: "approved",
    identity_status: "verified",
    accreditation_status: "accredited",
    accreditation_expiry: daysFromNow(95),
    reviewed_at: daysAgo(68),
    nda_status: "signed",
    eam_firm: null,
    internal_notes: "",
  },
];

export function adminInvestors(): AdminInvestor[] {
  return adminInvestorSeeds.map((seed) => ({
    id: seed.id,
    client_code: clientCode(seed.id),
    email: seed.email,
    full_name: seed.full_name,
    investor_type: seed.investor_type,
    country: seed.country,
    nationality: seed.nationality,
    onboarding_step: seed.onboarding_step,
    onboarding_completed_at: seed.onboarding_completed_at,
    verification_status: seed.verification_status,
    identity_status: seed.identity_status,
    accreditation_status: seed.accreditation_status,
    accreditation_expiry: seed.accreditation_expiry,
    reviewed_at: seed.reviewed_at,
    nda_status: seed.nda_status,
    eam_firm: seed.eam_firm,
    internal_notes: seed.internal_notes,
    committed_amount: committedAmountFor(seed.id),
    open_subscriptions: openSubscriptionsFor(seed.id),
    created_at: seed.onboarding_completed_at ?? daysAgo((seed.onboarding_step ?? 0) * 5 + 10),
  }));
}

export function findAdminInvestorSeed(id: number): AdminInvestorSeed | undefined {
  return adminInvestorSeeds.find((s) => s.id === id);
}

export const verificationDocumentsByInvestor: Record<
  number,
  Array<{
    id: number;
    document_type: string;
    status: string;
    notes: string | null;
    has_file: boolean;
    created_at: string;
  }>
> = {
  2: [
    {
      id: 1,
      document_type: "passport",
      status: "approved",
      notes: null,
      has_file: true,
      created_at: daysAgo(298),
    },
    {
      id: 2,
      document_type: "proof_of_address",
      status: "approved",
      notes: null,
      has_file: true,
      created_at: daysAgo(298),
    },
  ],
  11: [
    {
      id: 3,
      document_type: "passport",
      status: "approved",
      notes: null,
      has_file: true,
      created_at: daysAgo(157),
    },
  ],
  12: [
    {
      id: 4,
      document_type: "passport",
      status: "in_review",
      notes: "Awaiting clearer scan.",
      has_file: true,
      created_at: daysAgo(3),
    },
  ],
  15: [
    {
      id: 5,
      document_type: "accreditation_letter",
      status: "rejected",
      notes: "Letter did not meet accreditation threshold.",
      has_file: true,
      created_at: daysAgo(81),
    },
  ],
  20: [
    {
      id: 6,
      document_type: "passport",
      status: "in_review",
      notes: null,
      has_file: true,
      created_at: daysAgo(13),
    },
  ],
};

// Made-up verification files for the new investors, to match their onboarding stage.
{
  type VerificationDoc = (typeof verificationDocumentsByInvestor)[number][number];
  let docId = 5000;
  const doc = (
    document_type: string,
    status: string,
    ageDays: number,
    notes: string | null = null,
  ): VerificationDoc => ({
    id: docId++,
    document_type,
    status,
    notes,
    has_file: true,
    created_at: daysAgo(ageDays),
  });
  const complete = (age: number) => [
    doc("passport", "approved", age),
    doc("proof_of_address", "approved", age),
    doc("accreditation_letter", "approved", age),
  ];
  for (const [id, age] of [
    [34, 208],
    [22, 94],
    [24, 59],
    [26, 129],
    [27, 79],
    [30, 148],
    [33, 69],
  ] as const)
    verificationDocumentsByInvestor[id] = complete(age);
  verificationDocumentsByInvestor[23] = [
    doc("passport", "approved", 12),
    doc("proof_of_address", "approved", 12),
    doc("accreditation_letter", "pending", 6, "Awaiting LUCA review."),
  ];
  verificationDocumentsByInvestor[25] = [doc("passport", "pending", 4)];
  verificationDocumentsByInvestor[28] = [
    doc("passport", "rejected", 42, "Document did not match the application."),
    doc("proof_of_address", "approved", 42),
  ];
  verificationDocumentsByInvestor[29] = [
    doc("certificate_of_incorporation", "pending", 9),
    doc("trust_deed", "pending", 9),
  ];
  verificationDocumentsByInvestor[31] = [
    doc("passport", "approved", 358),
    doc("proof_of_address", "approved", 358),
    doc("accreditation_letter", "rejected", 10, "Letter expired; a renewed letter is required."),
  ];
  verificationDocumentsByInvestor[32] = [
    doc("passport", "approved", 7),
    doc("proof_of_address", "pending", 7),
  ];
}

// Partner firms
export type MockPartner = AdminPartner & { clientInvestorIds: number[] };

export const partners: MockPartner[] = [
  {
    id: 1,
    firm_name: "Meridian Capital Advisors",
    display_name: "Aisha Tan",
    contact_email: "eam@akula.vc",
    client_subscription_fee_pct: "4",
    eam_revenue_share_pct: "30",
    client_count: 0,
    verified_client_count: 0,
    allocated_volume: "0",
    accrued_revenue: "0",
    paid_revenue: "0",
    created_at: daysAgo(220),
    clientInvestorIds: [11, 12, 13, 19, 24],
  },
  {
    id: 2,
    firm_name: "Straits Family Office",
    display_name: "Nadia Farouk",
    contact_email: "dual@akula.vc",
    client_subscription_fee_pct: "3.5",
    eam_revenue_share_pct: "25",
    client_count: 0,
    verified_client_count: 0,
    allocated_volume: "0",
    accrued_revenue: "0",
    paid_revenue: "0",
    created_at: daysAgo(210),
    clientInvestorIds: [18, 27],
  },
  {
    id: 3,
    firm_name: "Nimbus Wealth Partners",
    display_name: "Oscar Bennett",
    contact_email: "partners@nimbuswealth.example.com",
    client_subscription_fee_pct: "4",
    eam_revenue_share_pct: "28",
    client_count: 0,
    verified_client_count: 0,
    allocated_volume: "0",
    accrued_revenue: "0",
    paid_revenue: "0",
    created_at: daysAgo(300),
    clientInvestorIds: [16, 22],
  },
  {
    id: 4,
    firm_name: "Orchard Peak Advisory",
    display_name: "Miriam Solberg",
    contact_email: "hello@orchardpeak.example.com",
    client_subscription_fee_pct: "3",
    eam_revenue_share_pct: "25",
    client_count: 0,
    verified_client_count: 0,
    allocated_volume: "0",
    accrued_revenue: "0",
    paid_revenue: "0",
    created_at: daysAgo(180),
    clientInvestorIds: [17, 32],
  },
];

export function partnerSummary(partner: MockPartner): AdminPartner {
  const investorSeeds = partner.clientInvestorIds
    .map((id) => findAdminInvestorSeed(id))
    .filter((s): s is AdminInvestorSeed => Boolean(s));
  const verified = investorSeeds.filter((s) => s.verification_status === "approved").length;
  const allocatedVolume = subscriptions
    .filter((s) => partner.clientInvestorIds.includes(s.investor_id) && s.status === "allocated")
    .reduce((sum, s) => sum + (s.allocated_principal ?? parseFloat(s.amount)), 0);
  const accrued = allocatedVolume * (parseFloat(partner.eam_revenue_share_pct ?? "0") / 100) * 0.6;
  const paid = allocatedVolume * (parseFloat(partner.eam_revenue_share_pct ?? "0") / 100) * 0.4;
  return {
    ...partner,
    client_count: partner.clientInvestorIds.length,
    verified_client_count: verified,
    allocated_volume: allocatedVolume.toFixed(2),
    accrued_revenue: accrued.toFixed(2),
    paid_revenue: paid.toFixed(2),
  };
}

export function partnerClientsFor(partner: MockPartner): PartnerClient[] {
  return partner.clientInvestorIds.map((investorId) => {
    const seed = findAdminInvestorSeed(investorId);
    const adviserClient = adviserClients.find((c) => c.investor_id === investorId);
    return {
      id: adviserClient?.id ?? investorId,
      investor_id: investorId,
      name: seed?.full_name ?? adviserClient?.client_name ?? "Unknown",
      email: seed?.email ?? adviserClient?.client_email ?? "",
      stage: adviserClient?.stage ?? "active",
      onboarding_completed: Boolean(seed?.onboarding_completed_at),
      authority_in_force: Boolean(seed && seed.verification_status === "approved"),
    };
  });
}

export function findPartnerById(id: number): MockPartner | undefined {
  return partners.find((p) => p.id === id);
}

// ---------------------------------------------------------------------------
// Communications (LUCA -> investor announcements)
// ---------------------------------------------------------------------------

export type CommunicationAudienceType = "fund" | "individual" | "filtered_group";
export type CommunicationRouting = "direct" | "through_rm";
export type CommunicationStatus = "draft" | "scheduled" | "sent";

export type MockCommunication = {
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
  created_at: string;
};

export type MockCommunicationRecipient = {
  email_status?: "pending_integration" | "scheduled";
  id: number;
  communication_id: number;
  investor_id: number;
  investor_name: string;
  investor_email: string;
  eam_firm: string | null;
  routed_via: "investor" | "eam";
  delivered_at: string | null;
  opened_at: string | null;
  downloaded_document_ids: number[];
};

export const communications: MockCommunication[] = [];
export const communicationRecipients: MockCommunicationRecipient[] = [];

let communicationAutoId = 1;
export function nextCommunicationId(): number {
  return communicationAutoId++;
}
let communicationRecipientAutoId = 1;
export function nextCommunicationRecipientId(): number {
  return communicationRecipientAutoId++;
}

export function communicationSummary(id: number): {
  recipient_count: number;
  delivered_count: number;
  opened_count: number;
} {
  const recipients = communicationRecipients.filter((r) => r.communication_id === id);
  return {
    recipient_count: recipients.length,
    delivered_count: recipients.filter((r) => r.delivered_at).length,
    opened_count: recipients.filter((r) => r.opened_at).length,
  };
}

function seedCommunications() {
  const solaraRecipients = [
    { investor: { id: 2, name: "Elena Cross", email: "investor@akula.vc" }, eamFirm: null },
    {
      investor: { id: 14, name: "Julian Ortiz", email: "julian.ortiz@example.com" },
      eamFirm: null,
    },
    {
      investor: { id: 20, name: "Felix Wong", email: "felix.wong@example.com" },
      eamFirm: null,
    },
  ];
  const q3UpdateId = nextCommunicationId();
  communications.push({
    id: q3UpdateId,
    subject: "Q3 Investor Update — Solara Grid",
    body: "Solara Grid closed Q3 with 480MWh of contracted capacity in operation, up from 410MWh last quarter. Net revenue retention held at 118%. The full statement is attached.\n\nNo action is needed from you at this time.",
    audience_type: "fund",
    audience_description: "All investors in Solara Grid SPV I (3 investors)",
    fund_id: 1,
    routing: "direct",
    attachment_document_ids: [2],
    status: "sent",
    scheduled_at: null,
    sent_at: daysAgo(10),
    created_at: daysAgo(10),
  });
  solaraRecipients.forEach((r, i) => {
    communicationRecipients.push({
      id: nextCommunicationRecipientId(),
      communication_id: q3UpdateId,
      investor_id: r.investor.id,
      investor_name: r.investor.name,
      investor_email: r.investor.email,
      eam_firm: r.eamFirm,
      routed_via: "investor",
      delivered_at: daysAgo(10),
      opened_at: i === 2 ? null : daysAgo(9),
      downloaded_document_ids: i === 0 ? [1] : [],
    });
  });

  // A request message linked to the demo investor's open document requests, and a funding
  // reminder, so her inbox shows the whole story.
  const requestMsgId = nextCommunicationId();
  communications.push({
    id: requestMsgId,
    subject: "Documents we need from you",
    body: "Hello,\n\nTo keep your account in good standing and to process your Quanta Compute subscription, we need the following:\n\n- Source of funds declaration\n- Accredited investor evidence (your current approval expires soon)\n- Bank confirmation for returns and distributions\n\nYou can upload each one from the **Documents** page in your portal. If anything is unclear, reply to this message and we will help.\n\nThank you,\nLUCA SGP",
    audience_type: "individual",
    audience_description: "Elena Cross",
    fund_id: null,
    routing: "direct",
    attachment_document_ids: [],
    status: "sent",
    scheduled_at: null,
    sent_at: daysAgo(2),
    created_at: daysAgo(2),
  });
  communicationRecipients.push({
    id: nextCommunicationRecipientId(),
    communication_id: requestMsgId,
    investor_id: 2,
    investor_name: "Elena Cross",
    investor_email: "investor@akula.vc",
    eam_firm: null,
    routed_via: "investor",
    delivered_at: daysAgo(2),
    opened_at: null,
    downloaded_document_ids: [],
  });
  for (const r of documentRequests)
    if (r.investor_id === 2 && r.status === "requested") r.communication_id = requestMsgId;

  const reminderId = nextCommunicationId();
  communications.push({
    id: reminderId,
    subject: "Quanta Compute closes in 3 days",
    body: "Hello,\n\nQuanta Compute SPV I closes to new subscriptions on 5 October. Your subscription is waiting for the payment to be matched. If you have already sent the transfer, please upload proof of payment from the **Subscription Activity** tab so we can match it.\n\nThank you,\nLUCA SGP",
    audience_type: "fund",
    audience_description: "Investors in Quanta Compute SPV I with funding outstanding (1 investor)",
    fund_id: 8,
    routing: "direct",
    attachment_document_ids: [],
    status: "sent",
    scheduled_at: null,
    sent_at: daysAgo(1),
    created_at: daysAgo(1),
  });
  communicationRecipients.push({
    id: nextCommunicationRecipientId(),
    communication_id: reminderId,
    investor_id: 2,
    investor_name: "Elena Cross",
    investor_email: "investor@akula.vc",
    eam_firm: null,
    routed_via: "investor",
    delivered_at: daysAgo(1),
    opened_at: null,
    downloaded_document_ids: [],
  });

  const navRecipients = [
    { id: 2, name: "Elena Cross", email: "investor@akula.vc", eamFirm: null },
    {
      id: 11,
      name: "Priya Nair",
      email: "priya.nair@example.com",
      eamFirm: "Meridian Capital Advisors",
    },
    {
      id: 12,
      name: "Marcus Webb",
      email: "marcus.webb@example.com",
      eamFirm: "Meridian Capital Advisors",
    },
    {
      id: 18,
      name: "Henry Osei",
      email: "henry.osei@example.com",
      eamFirm: "Straits Family Office",
    },
  ];
  const navUpdateId = nextCommunicationId();
  communications.push({
    id: navUpdateId,
    subject: "Upcoming NAV statements — all approved investors",
    body: "Quarter-end NAV statements will be issued to all approved investors this week. Institution-routed clients will receive theirs through their RM.",
    audience_type: "filtered_group",
    audience_description:
      "Approved investors, routed through their RM where applicable (4 investors)",
    fund_id: null,
    routing: "through_rm",
    attachment_document_ids: [],
    status: "scheduled",
    scheduled_at: daysFromNow(3),
    sent_at: null,
    created_at: daysAgo(1),
  });
  navRecipients.forEach((r) => {
    communicationRecipients.push({
      id: nextCommunicationRecipientId(),
      communication_id: navUpdateId,
      investor_id: r.id,
      investor_name: r.name,
      investor_email: r.email,
      eam_firm: r.eamFirm,
      routed_via: r.eamFirm ? "eam" : "investor",
      delivered_at: null,
      opened_at: null,
      downloaded_document_ids: [],
    });
  });

  communications.push({
    id: nextCommunicationId(),
    subject: "New deal — Fenwick AI",
    body: "Fenwick AI is opening for subscriptions next week. Draft — audience and routing still to be confirmed.",
    audience_type: "individual",
    audience_description: "Not yet selected",
    fund_id: null,
    routing: "direct",
    attachment_document_ids: [],
    status: "draft",
    scheduled_at: null,
    sent_at: null,
    created_at: daysAgo(0),
  });
}
seedCommunications();

// ---------------------------------------------------------------------------
// Public ticker
// ---------------------------------------------------------------------------

export function tickerItems() {
  return funds.map((f) => ({
    asset_name: f.asset.name,
    class_type: f.share_class.class_type,
    currency: "USD",
    price_per_share: f.price,
    price_type: "last acquisition price",
    as_of_date: f.opened_at ?? daysAgo(30),
  }));
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

export function tokenFor(userId: number): string {
  return `mock-token-${userId}`;
}

export function userIdFromToken(authHeader: string | null): number | null {
  if (!authHeader) return null;
  const match = /^Bearer mock-token-(\d+)$/.exec(authHeader.trim());
  return match ? Number(match[1]) : null;
}

export function currentUser(request: Request): MockUser | null {
  const id = userIdFromToken(request.headers.get("Authorization"));
  if (id === null) return null;
  return findUserById(id) ?? null;
}

// ---------------------------------------------------------------------------
// Public user shape (mirrors auth-context.tsx's User type)
// ---------------------------------------------------------------------------

export type PublicUser = {
  id: number;
  email: string;
  role: string;
  onboarding_completed: boolean;
  onboarding_step: number;
  verified: boolean;
  two_factor_enabled: boolean;
  has_investor_profile: boolean;
  has_eam_profile: boolean;
  nda_status: "not_started" | "pending" | "signed";
  kyc_status: "not_started" | "pending" | "approved" | "failed";
};

export function investorOnboardingComplete(profile: MockInvestorProfile, user: MockUser): boolean {
  if (
    profile.skipped ||
    (profile.completed && user.nda_status === "signed" && user.kyc_status === "approved")
  )
    return true;
  return (
    profile.channel !== null &&
    profile.eligibility_confirmed_at !== null &&
    profile.onboarding_step >= 4 &&
    user.nda_status === "signed" &&
    user.kyc_status === "approved" &&
    allRequiredConsentsGranted(profile.user_id)
  );
}

export function publicUser(user: MockUser): PublicUser {
  const profile = findInvestorProfileByUserId(user.id);
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    onboarding_completed: profile ? investorOnboardingComplete(profile, user) : true,
    onboarding_step: profile ? profile.onboarding_step : 0,
    verified: user.verified,
    two_factor_enabled: user.two_factor_enabled,
    has_investor_profile: user.has_investor_profile,
    has_eam_profile: user.has_eam_profile,
    nda_status: user.nda_status,
    kyc_status: user.kyc_status,
  };
}

const demoArrays = {
  users,
  investorProfiles,
  eamProfiles,
  funds,
  subscriptions,
  platformEvents,
  bankTransfers,
  holdings,
  documents,
  watchlist,
  adviserClients,
  highlights,
  discussions,
  adminInvestorSeeds,
  partners,
  communications,
  communicationRecipients,
  investorPricing,
  documentRequests,
};
export function exportDemoState() {
  return structuredClone({
    arrays: demoArrays,
    consents: [...consentGrants],
    verification: verificationDocumentsByInvestor,
  });
}
export function restoreDemoState(saved: ReturnType<typeof exportDemoState>) {
  // Tables added after a demo was saved are optional; keep their seed data.
  const OPTIONAL_TABLES = ["investorPricing", "documentRequests"];
  if (
    !saved ||
    !saved.arrays ||
    !Object.keys(demoArrays).every(
      (k) =>
        Array.isArray(saved.arrays[k as keyof typeof demoArrays]) || OPTIONAL_TABLES.includes(k),
    )
  )
    throw new Error("Invalid saved database");
  for (const key of Object.keys(demoArrays) as (keyof typeof demoArrays)[]) {
    const savedRows = saved.arrays[key];
    if (!Array.isArray(savedRows)) continue;
    const target = demoArrays[key] as unknown[];
    target.splice(0, target.length, ...structuredClone(savedRows));
  }
  if (!users.some((user) => user.role === "investment_team"))
    users.push(structuredClone(investmentTeamSeed));
  consentGrants.clear();
  for (const [key, value] of saved.consents) consentGrants.set(key, value);
  for (const key of Object.keys(verificationDocumentsByInvestor))
    delete verificationDocumentsByInvestor[Number(key)];
  Object.assign(verificationDocumentsByInvestor, structuredClone(saved.verification));
  const high =
    Math.max(
      10000,
      ...Object.values(demoArrays)
        .flat()
        .map((x) => x.id),
    ) + 1;
  subscriptionAutoId = high;
  eventAutoId = high;
  bankTransferAutoId = high;
  holdingAutoId = high;
  documentAutoId = high;
  watchlistAutoId = high;
  highlightAutoId = high;
  discussionAutoId = high;
  discussionMessageAutoId = high;
  communicationAutoId = high;
  communicationRecipientAutoId = high;
}
