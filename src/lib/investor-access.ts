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

// Illustrative commercial policy, separate from KYC, record ownership and sourcing tags.
// The guide's independent demo shelf is explicit. Other published deals remain partner-only.
export const INDEPENDENT_FUND_IDS = [1, 3, 4];
export function segmentCanAccess(segment: InvestorSegment, fundId: number) {
  return segment === "partner_referred" || INDEPENDENT_FUND_IDS.includes(fundId);
}
export function commercialTerms(segment: InvestorSegment, fund: Fund): CommercialTerms {
  return {
    segment,
    subscriptionFeePct: String(
      Number(fund.subscription_fee_pct) + (segment === "independent" ? 1 : 0),
    ),
    allocationPriority: segment === "partner_referred" ? "partner_priority" : "standard",
  };
}
export function fundForSegment(fund: Fund, segment: InvestorSegment): Fund {
  const terms = commercialTerms(segment, fund);
  return {
    ...fund,
    subscription_fee_pct: terms.subscriptionFeePct,
    investor_access: { ...terms, canSubscribe: segmentCanAccess(segment, fund.id) },
  };
}
