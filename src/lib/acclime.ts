/**
 * What Acclime, the fund administrator, reports to LUCA, and the subscription pack LUCA sends it.
 * Every message reaches the platform the same way, whether it arrives on the feed or the Fund
 * Manager types it in from an email, so the two can never apply differently.
 */

export type AcclimeMessageType =
  | "funds_confirmed"
  | "cdd_result"
  | "acceptance"
  | "refund_processed"
  | "nav";

export const ACCLIME_MESSAGE_TYPES: {
  type: AcclimeMessageType;
  label: string;
  /** What the message does once it is applied. */
  effect: string;
}[] = [
  {
    type: "funds_confirmed",
    label: "Funds confirmed",
    effect:
      "Records the receipt against the subscription and completes reconciliation when the funds are in full.",
  },
  {
    type: "cdd_result",
    label: "CDD result",
    effect:
      "Records Acclime's due diligence result. A failure or a request for documents blocks acceptance.",
  },
  {
    type: "acceptance",
    label: "Acceptance and share issuance",
    effect: "Issues the holding once LUCA has confirmed the allocation and the units agree.",
  },
  {
    type: "refund_processed",
    label: "Refund processed",
    effect: "Marks the refund as paid to the investor's own account.",
  },
  {
    type: "nav",
    label: "Monthly NAV",
    effect: "Updates the value of every issued holding in the sub-fund on the investor dashboard.",
  },
];

export const acclimeTypeLabel = (type: AcclimeMessageType) =>
  ACCLIME_MESSAGE_TYPES.find((t) => t.type === type)?.label ?? type;

export type FundsConfirmedPayload = {
  payment_reference: string;
  amount: number;
  currency?: string;
  /** The bank's or Acclime's own reference for the receipt. */
  bank_reference: string;
  received_on?: string;
};
export type CddResultPayload = {
  payment_reference: string;
  result: "pass" | "fail" | "more_documents";
  note?: string;
};
export type AcceptancePayload = {
  payment_reference: string;
  units: number;
  price: number;
  issued_on?: string;
  reference?: string;
};
export type RefundProcessedPayload = {
  payment_reference: string;
  amount: number;
  bank_reference: string;
  processed_on?: string;
};
export type NavPayload = {
  fund_id: number;
  /** The month the NAV is struck for, as a date: the month end. */
  as_of: string;
  nav_per_unit: number;
};

export type AcclimePayload =
  | FundsConfirmedPayload
  | CddResultPayload
  | AcceptancePayload
  | RefundProcessedPayload
  | NavPayload;

/** What the feed (or the manual form) sends. */
export type AcclimeInbound = {
  /** Acclime's own id for the message. Receiving the same id twice applies it once. */
  external_id?: string;
  type: AcclimeMessageType;
  /** "feed" for what Acclime sends, "manual" for what LUCA keys in from an email. */
  channel?: "feed" | "manual";
  payload: Record<string, unknown>;
};

export type AcclimeStatus = "applied" | "needs_attention" | "duplicate";

export const ACCLIME_STATUS_LABELS: Record<AcclimeStatus, string> = {
  applied: "Applied",
  needs_attention: "Needs attention",
  duplicate: "Already received",
};

export type AcclimeMessage = {
  id: number;
  external_id: string;
  type: AcclimeMessageType;
  channel: "feed" | "manual";
  /** The account that keyed it in; null for the feed. */
  entered_by: string | null;
  received_at: string;
  subscription_id: number | null;
  fund_id: number | null;
  payload: Record<string, unknown>;
  status: AcclimeStatus;
  /** What happened, or why nothing did, in words. */
  outcome: string;
};

/** The monthly NAV Acclime struck for a sub-fund, and what it updated. */
export type NavRecord = {
  id: number;
  fundId: number;
  asOf: string;
  navPerUnit: number;
  messageId: number;
  holdingsUpdated: number;
};

export type PackItemKind = "signed_agreement" | "kyc" | "cdd" | "payment_reference";

export type PackItem = {
  kind: PackItemKind;
  label: string;
  detail: string;
  /** Whether there is something to send for it. */
  available: boolean;
};

/** What goes to Acclime and LUCA when the investor submits: a manifest of the papers and the reference. */
export type SubscriptionPack = {
  id: number;
  subscriptionId: number;
  createdAt: string;
  paymentReference: string;
  items: PackItem[];
  recipients: { name: string; status: "sent"; sentAt: string }[];
};

/** Where a subscription's refund stands, for the investor and the Fund Manager. */
export type RefundSummary = {
  amount: number;
  status: "due" | "processing" | "failed" | "processed";
  processed_at: string | null;
  /** Who confirmed it: Ops through their own screens, or Acclime. */
  confirmed_by: "ops" | "acclime" | null;
  reference: string | null;
};

export const REFUND_STATUS_LABELS: Record<RefundSummary["status"], string> = {
  due: "Refund due",
  processing: "Refund in progress",
  failed: "Refund failed",
  processed: "Refund processed",
};
