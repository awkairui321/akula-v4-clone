/**
 * What an investor is told about the vehicle they are subscribing to: the fund and sub-fund, the
 * documents that govern it, how to pay it and the confirmations they give. Kept in one place so
 * the checkout, the capital call notice and the Fund Manager's editor cannot drift apart.
 */
import type { Fund } from "./types";

export const MANAGER_LEGAL_NAME = "LUCA SGP Pte. Ltd.";
export const PLATFORM_LEGAL_NAME = "Akula Labs Pte. Ltd.";

export type OfferingDocumentKind = "ppm" | "supplement" | "agreement" | "risk_disclosure";

export const OFFERING_DOCUMENTS: { kind: OfferingDocumentKind; label: string }[] = [
  { kind: "ppm", label: "Private placement memorandum" },
  { kind: "supplement", label: "Sub-fund supplement" },
  { kind: "agreement", label: "Subscription agreement" },
  { kind: "risk_disclosure", label: "Risk Disclosure Statement" },
];

export const documentLabel = (kind: OfferingDocumentKind) =>
  OFFERING_DOCUMENTS.find((d) => d.kind === kind)?.label ?? kind;

export type OfferingDocument = { version: string; url: string | null };

/** Stored on the deal. Everything is optional so older deals fall back to the defaults below. */
export type Offering = {
  fund_name?: string;
  sub_fund_name?: string;
  fund_code?: string;
  exposure?: string;
  /** The governing agreement named in the capital call notice, and its date. */
  agreement_name?: string;
  agreement_date?: string | null;
  documents?: Partial<Record<OfferingDocumentKind, OfferingDocument>>;
};

export type ResolvedOffering = Required<Omit<Offering, "documents" | "agreement_date">> & {
  agreement_date: string | null;
  documents: Record<OfferingDocumentKind, OfferingDocument>;
};

export const DEFAULT_FUND_NAME = "DAS VCC II";
export const DEFAULT_SUB_FUND_NAME = "Serapong Subfund";
export const DEFAULT_FUND_CODE = "DASVCCII-SERAPONG";
export const INVESTMENT_DESCRIPTION = "Participating shares in the sub-fund";

/** The deal's offering details with the platform defaults filled in. */
export function offeringOf(
  fund: Pick<Fund, "asset" | "share_class"> & { offering?: Offering },
): ResolvedOffering {
  const stored = fund.offering ?? {};
  const company = fund.asset.legal_name ?? fund.asset.name;
  return {
    fund_name: stored.fund_name?.trim() || DEFAULT_FUND_NAME,
    sub_fund_name: stored.sub_fund_name?.trim() || DEFAULT_SUB_FUND_NAME,
    fund_code: stored.fund_code?.trim() || DEFAULT_FUND_CODE,
    exposure:
      stored.exposure?.trim() ||
      `Indirect exposure to ${company} through its ${fund.share_class.name} shares`,
    agreement_name: stored.agreement_name?.trim() || "Limited Partnership Agreement",
    agreement_date: stored.agreement_date === undefined ? "2026-05-14" : stored.agreement_date,
    documents: Object.fromEntries(
      OFFERING_DOCUMENTS.map(({ kind }) => [
        kind,
        {
          version: stored.documents?.[kind]?.version?.trim() || "1.0",
          url: stored.documents?.[kind]?.url ?? null,
        },
      ]),
    ) as Record<OfferingDocumentKind, OfferingDocument>,
  };
}

/** "DAS VCC II | Serapong Subfund" */
export function fundLabel(fund: Parameters<typeof offeringOf>[0]): string {
  const offering = offeringOf(fund);
  return `${offering.fund_name} | ${offering.sub_fund_name}`;
}

/** The reference the investor quotes on the wire, e.g. DASVCCII-SERAPONG-002. */
export function paymentReferenceFor(fundCode: string, investorId: number): string {
  return `${fundCode}-${String(investorId).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// Where the investor sends their money
// ---------------------------------------------------------------------------

export type TransferAccount = {
  fund_id: number;
  account_name: string;
  bank_name: string;
  bank_address: string;
  account_number: string;
  swift_bic: string;
  routing_aba: string;
  intermediary_bank_name: string;
  intermediary_swift: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  /** True for the stand-in details seeded for the demo. Never a real account. */
  placeholder: boolean;
  updated_at: string | null;
  updated_by: string | null;
};

export const TRANSFER_ACCOUNT_FIELDS: {
  key: keyof Omit<TransferAccount, "fund_id" | "placeholder" | "updated_at" | "updated_by">;
  label: string;
  required: boolean;
  hint?: string;
}[] = [
  {
    key: "account_name",
    label: "Beneficiary account name",
    required: true,
    hint: "Exactly as the bank holds it",
  },
  { key: "bank_name", label: "Beneficiary bank name", required: true },
  { key: "bank_address", label: "Beneficiary bank address", required: true },
  { key: "account_number", label: "Beneficiary account number", required: true },
  { key: "swift_bic", label: "SWIFT / BIC code", required: true },
  { key: "routing_aba", label: "Routing / ABA", required: false, hint: "US dollar wires only" },
  { key: "intermediary_bank_name", label: "Intermediary bank name", required: false },
  { key: "intermediary_swift", label: "Intermediary SWIFT code", required: false },
  { key: "contact_name", label: "Investor contact name", required: false },
  { key: "contact_email", label: "Investor contact email", required: false },
  { key: "contact_phone", label: "Investor contact phone", required: false },
];

export const TRANSFER_DETAIL_KEYS = TRANSFER_ACCOUNT_FIELDS.map((f) => f.key);

/** What is still missing before the account can be shown to investors. */
export function missingTransferFields(account: Partial<TransferAccount> | null | undefined) {
  return TRANSFER_ACCOUNT_FIELDS.filter(
    (f) => f.required && !String(account?.[f.key] ?? "").trim(),
  ).map((f) => f.label);
}

export const blankTransferAccount = (fundId: number): TransferAccount => ({
  fund_id: fundId,
  account_name: "",
  bank_name: "",
  bank_address: "",
  account_number: "",
  swift_bic: "",
  routing_aba: "",
  intermediary_bank_name: "",
  intermediary_swift: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  placeholder: false,
  updated_at: null,
  updated_by: null,
});

/** Obviously fake details for deals that have none yet, so no one mistakes them for a real account. */
export const placeholderTransferAccount = (fundId: number, fundName: string): TransferAccount => ({
  ...blankTransferAccount(fundId),
  account_name: `${fundName} Subscription Account (placeholder)`,
  bank_name: "Placeholder Bank (not a real bank)",
  bank_address: "1 Placeholder Street, Singapore 000000",
  account_number: "000-000000-000",
  swift_bic: "XXXXXXXX",
  routing_aba: "000000000",
  contact_name: "LUCA SGP investor relations",
  contact_email: "xxx@luca.inc",
  contact_phone: "+65 xxxx xxxx",
  placeholder: true,
});

// ---------------------------------------------------------------------------
// Confirmations and notices
// ---------------------------------------------------------------------------

/** The four confirmations an investor gives before signing. Wording is subject to counsel's sign-off. */
export const ACKNOWLEDGEMENT_STATEMENTS: { key: string; body: string }[] = [
  {
    key: "read_documents",
    body: "I have read and understood the private placement memorandum, the sub-fund supplement, the subscription agreement and the risk disclosure statement. I have made my own investment decision and have not relied on advice from LUCA SGP or Akula Labs.",
  },
  {
    key: "high_risk_illiquid",
    body: "I understand that this is a high-risk, illiquid investment. I may not be able to sell or redeem my shares for an extended period, there is no guaranteed exit and I could lose all of the money I invest.",
  },
  {
    key: "acceptance_discretion",
    body: "I understand that my subscription is not accepted until LUCA SGP confirms my allocation. LUCA SGP may accept or reject any subscription at its sole discretion, including where the underlying share transaction does not complete. If my subscription is not accepted, the full amount I have paid will be returned to the account it came from, without interest.",
  },
  {
    key: "accredited_status",
    body: "I confirm that I remain an accredited investor, that the status and opt-in recorded during my onboarding are still accurate and that I understand I will not receive certain protections that apply to retail investors.",
  },
];

/** The statement that stays unavailable until the Risk Disclosure Statement has been opened. */
export const DOCUMENT_GATED_STATEMENT = "read_documents";

export function disclaimerText(label?: string): string {
  return `This platform is operated by ${PLATFORM_LEGAL_NAME} as technology provider to ${MANAGER_LEGAL_NAME}, the fund manager of ${label ?? "the funds offered on this platform"}. Akula Labs does not provide investment advice, does not arrange or deal in investments and does not receive or hold investor money. Investments are offered only to accredited investors under the fund's offering documents.`;
}

export const FEE_FOOTNOTE =
  "Fees are charged by the fund and are set out in full in the private placement memorandum. Your allocation is subject to availability and confirmation by LUCA SGP.";

export const PAYMENT_NOTICE =
  "Please make the transfer from a bank account held in your own name and quote the payment reference exactly as shown. Payments from third parties or without the correct reference cannot be accepted and may be returned. Any bank charges are your responsibility, so please make sure the full amount is received. Your funds will be held in the fund's account and will not be invested until your subscription is accepted.";

export const PAYMENT_DECLARATION =
  "I have made the transfer from an account in my own name and included the payment reference.";

export const SUBMITTED_NOTE =
  "Acceptance is at the discretion of LUCA SGP. If your subscription is not accepted, the full amount you paid will be returned to the account it came from.";
