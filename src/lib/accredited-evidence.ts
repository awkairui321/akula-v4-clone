/**
 * How an investor proves they are accredited. An investor chooses ONE way they qualify, and each
 * way has its own list of documents. Kept in one place so the sign-in declaration, the upload
 * endpoint and the Fund Manager's Compliance queue all name and require the same things.
 */

export type EvidenceKind =
  | "notice_of_assessment"
  | "bank_statement"
  | "property_deed"
  | "financial_statements"
  | "source_of_wealth";

export type EvidenceDocument = {
  kind: EvidenceKind;
  label: string;
  /** What to upload, in the investor's words. */
  description: string;
};

export const EVIDENCE_DOCUMENTS: EvidenceDocument[] = [
  {
    kind: "notice_of_assessment",
    label: "Notice of assessment",
    description: "Your income tax notice of assessment from the tax authority.",
  },
  {
    kind: "bank_statement",
    label: "Bank account statement",
    description: "A statement showing the balance of your deposits and investment accounts.",
  },
  {
    kind: "property_deed",
    label: "Property deed",
    description: "A deed or title document showing the value of the property.",
  },
  {
    kind: "financial_statements",
    label: "Latest financial statements",
    description: "The company's latest financial statements, showing its net assets.",
  },
  {
    kind: "source_of_wealth",
    label: "Source of wealth declaration",
    description:
      "A signed statement of how your wealth was built, for example from employment, a business sale or an inheritance.",
  },
];

export const EVIDENCE_KINDS = EVIDENCE_DOCUMENTS.map((d) => d.kind);

export const evidenceLabel = (kind: string) =>
  EVIDENCE_DOCUMENTS.find((d) => d.kind === kind)?.label ?? kind;

export type QualifyingOption = {
  /** Matches the basis recorded on the declaration. */
  value: string;
  title: string;
  /** The test, in one line. */
  test: string;
  note: string;
  /** Every document this choice needs. */
  evidence: EvidenceKind[];
};

export const QUALIFYING_OPTIONS: QualifyingOption[] = [
  {
    value: "income",
    title: "Income",
    test: "At least S$300,000 in the last 12 months",
    note: "Or the equivalent in a foreign currency.",
    evidence: ["notice_of_assessment", "source_of_wealth"],
  },
  {
    value: "net_personal_assets",
    title: "Net personal assets",
    test: "More than S$2,000,000",
    note: "Your primary residence counts for no more than S$1,000,000 of this.",
    evidence: ["bank_statement", "property_deed", "source_of_wealth"],
  },
  {
    value: "net_financial_assets",
    title: "Net financial assets",
    test: "More than S$1,000,000",
    note: "Deposits and investments, less related liabilities.",
    evidence: ["bank_statement", "source_of_wealth"],
  },
  {
    value: "entity_net_assets",
    title: "Investing through a company",
    test: "Company net assets above S$10,000,000",
    note: "The company must be the investor on the subscription.",
    evidence: ["financial_statements", "source_of_wealth"],
  },
];

export const optionFor = (basis: string | null | undefined) =>
  QUALIFYING_OPTIONS.find((o) => o.value === basis);

export const EVIDENCE_RULES = {
  /** A document must be dated no earlier than this many months before it is uploaded. */
  maxAgeMonths: 3,
  /** Evidence on file stays valid for this long before fresh copies are asked for. */
  validForMonths: 6,
  maxFileMb: 2,
};

/** Whether evidence uploaded at this time is still within its validity period. */
export function isCurrent(uploadedAt: string | undefined, now: number = Date.now()): boolean {
  if (!uploadedAt) return false;
  const limit = new Date(now);
  limit.setMonth(limit.getMonth() - EVIDENCE_RULES.validForMonths);
  return new Date(uploadedAt).getTime() >= limit.getTime();
}

type UploadedEvidence = { document_type: string; created_at?: string };

/** The newest upload of each kind, so a replaced document supersedes the old one. */
export function latestByKind<T extends UploadedEvidence>(docs: T[]): Map<string, T> {
  const latest = new Map<string, T>();
  for (const doc of docs) {
    const earlier = latest.get(doc.document_type);
    if (!earlier || (doc.created_at ?? "") >= (earlier.created_at ?? "")) {
      latest.set(doc.document_type, doc);
    }
  }
  return latest;
}

/** What this choice still needs: documents never uploaded, or uploaded too long ago. */
export function missingEvidence(
  basis: string | null | undefined,
  docs: UploadedEvidence[],
  now: number = Date.now(),
): EvidenceKind[] {
  const option = optionFor(basis);
  if (!option) return [];
  const latest = latestByKind(docs);
  return option.evidence.filter((kind) => !isCurrent(latest.get(kind)?.created_at, now));
}
