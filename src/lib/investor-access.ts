import type { Fund } from "./types";

export type InvestorSegment = "independent" | "partner_referred";
export type CommercialTerms = {
  segment: InvestorSegment;
  subscriptionFeePct: string;
  allocationPriority: "standard" | "partner_priority";
};
export type InvestorAccess = CommercialTerms & { canSubscribe: boolean };

export const SEGMENT_LABELS: Record<InvestorSegment, string> = {
  independent: "Independent investor",
  partner_referred: "Partner-referred investor",
};
export function fundAudienceLabel(fund: Fund) {
  if (!fund.eligible_segments) return "Existing client audience";
  return fund.eligible_segments.length === 2
    ? "All client classes"
    : fund.eligible_segments[0] === "independent"
      ? "Direct clients"
      : "Partner-referred clients";
}

// Illustrative commercial policy, separate from KYC, record ownership and sourcing tags.
// The guide's independent demo shelf is explicit. Other published deals remain partner-only.
export const INDEPENDENT_FUND_IDS = [1, 3, 4];
export function segmentCanAccess(segment: InvestorSegment, fundId: number, fund?: Fund) {
  if (fund?.eligible_segments) return fund.eligible_segments.includes(segment);
  return segment === "partner_referred" || INDEPENDENT_FUND_IDS.includes(fundId);
}
export function commercialTerms(segment: InvestorSegment, fund: Fund): CommercialTerms {
  return {
    segment,
    subscriptionFeePct: String(
      Number(fund.subscription_fee_pct) +
        (segment === "independent" && !fund.eligible_segments ? 1 : 0),
    ),
    allocationPriority: segment === "partner_referred" ? "partner_priority" : "standard",
  };
}
export function fundForSegment(fund: Fund, segment: InvestorSegment): Fund {
  const terms = commercialTerms(segment, fund);
  return {
    ...fund,
    subscription_fee_pct: terms.subscriptionFeePct,
    investor_access: { ...terms, canSubscribe: segmentCanAccess(segment, fund.id, fund) },
  };
}
