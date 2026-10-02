/**
 * What a private-markets fund manager collects from clients, and why. Shared by the
 * Compliance page, the communication composer and the investor's "requested from you"
 * list so everyone uses the same names.
 */

export type DocumentRequestKind = {
  key: string;
  label: string;
  /** Why we ask: shown to the investor and the fund manager. */
  reason: string;
  group: "Identity" | "Eligibility" | "Source of funds" | "Tax" | "Payments" | "Entity";
  /** Who it applies to. */
  appliesTo: "individual" | "entity" | "both";
};

export const DOCUMENT_REQUEST_KINDS: DocumentRequestKind[] = [
  {
    key: "passport",
    label: "Passport or national ID",
    reason: "Identity verification (KYC). A certified copy that is in date.",
    group: "Identity",
    appliesTo: "individual",
  },
  {
    key: "proof_of_address",
    label: "Proof of address",
    reason: "Address verification. Dated within the last 3 months.",
    group: "Identity",
    appliesTo: "individual",
  },
  {
    key: "accreditation_letter",
    label: "Accredited investor evidence",
    reason:
      "Eligibility to invest. A bank or portfolio statement, tax return or adviser letter. Renewed every year.",
    group: "Eligibility",
    appliesTo: "both",
  },
  {
    key: "source_of_funds",
    label: "Source of funds declaration",
    reason: "Anti-money-laundering check on where the money for this investment comes from.",
    group: "Source of funds",
    appliesTo: "both",
  },
  {
    key: "source_of_wealth",
    label: "Source of wealth statement",
    reason:
      "Anti-money-laundering check on how the investor’s wealth was built. Needed for larger tickets.",
    group: "Source of funds",
    appliesTo: "both",
  },
  {
    key: "pep_declaration",
    label: "PEP declaration",
    reason: "Whether the investor or a close associate holds a prominent public role.",
    group: "Source of funds",
    appliesTo: "both",
  },
  {
    key: "tax",
    label: "Tax self-certification (W-8BEN, W-9 or CRS)",
    reason: "Tax residency reporting required for every investor.",
    group: "Tax",
    appliesTo: "both",
  },
  {
    key: "bank_details",
    label: "Bank confirmation for returns and distributions",
    reason:
      "Where refunds, distributions and exit proceeds are paid. Must match the investor’s name.",
    group: "Payments",
    appliesTo: "both",
  },
  {
    key: "certificate_of_incorporation",
    label: "Certificate of incorporation",
    reason: "Proof the entity exists and who it is.",
    group: "Entity",
    appliesTo: "entity",
  },
  {
    key: "constitutional_documents",
    label: "Constitution or articles of association",
    reason: "Confirms the entity’s powers to invest.",
    group: "Entity",
    appliesTo: "entity",
  },
  {
    key: "ubo_declaration",
    label: "Ultimate beneficial owner declaration",
    reason: "Names every person who owns or controls 25% or more of the entity.",
    group: "Entity",
    appliesTo: "entity",
  },
  {
    key: "authorised_signatories",
    label: "Authorised signatory list",
    reason: "Who can sign and instruct on the entity’s behalf.",
    group: "Entity",
    appliesTo: "entity",
  },
  {
    key: "trust_deed",
    label: "Trust deed and trustee list",
    reason: "For trusts: the deed and the people who act for the trust.",
    group: "Entity",
    appliesTo: "entity",
  },
];

const OTHER_KIND_LABELS: Record<string, string> = {
  agreement: "Signed subscription agreement",
  statement: "Account statement",
};

export const documentKindLabel = (key: string) =>
  DOCUMENT_REQUEST_KINDS.find((k) => k.key === key)?.label ??
  OTHER_KIND_LABELS[key] ??
  key.replace(/_/g, " ");

/** Deal materials live in each deal’s workspace; the Compliance page covers everything else. */
export const DEAL_MATERIAL_KINDS = [
  "factsheet",
  "offering_memorandum",
  "subscription_agreement_template",
  "risk_disclosure",
  "termsheet",
  "deck",
  "memo",
  "other",
];

/** The default document set for each kind of request. */
export const REQUEST_PRESETS: { key: string; label: string; kinds: string[] }[] = [
  {
    key: "onboarding",
    label: "Complete onboarding",
    kinds: ["passport", "proof_of_address", "accreditation_letter", "tax"],
  },
  { key: "renewal", label: "Renew accreditation", kinds: ["accreditation_letter"] },
  {
    key: "large_ticket",
    label: "Large ticket checks",
    kinds: ["source_of_funds", "source_of_wealth"],
  },
  {
    key: "entity",
    label: "Entity onboarding",
    kinds: [
      "certificate_of_incorporation",
      "constitutional_documents",
      "ubo_declaration",
      "authorised_signatories",
    ],
  },
];
