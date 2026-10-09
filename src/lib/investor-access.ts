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
/** Who a deal is for: client classes, named partner firms and named clients, combined. */
export type AudienceMember = {
  id: number;
  segment: InvestorSegment;
  /** The partner firm that brought the client in, if any. */
  partner: string | null;
};

export function fundAudienceLabel(fund: Fund) {
  if (!fund.eligible_segments) return "Existing client audience";
  const classes =
    fund.eligible_segments.length === 2
      ? "All client classes"
      : fund.eligible_segments[0] === "independent"
        ? "Direct clients"
        : fund.eligible_segments[0] === "partner_referred"
          ? "Partner-referred clients"
          : "";
  const partners = fund.audience_partners ?? [];
  const named = fund.audience_investors ?? [];
  const parts = [
    classes,
    partners.length === 1
      ? partners[0]
      : partners.length > 1
        ? `${partners.length} partner firms`
        : "",
    named.length ? `${named.length} named client${named.length === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  const excluded = fund.audience_excluded?.length ?? 0;
  const label = parts.length ? parts.join(" + ") : "No clients";
  return excluded ? `${label}, ${excluded} excluded` : label;
}

// Illustrative commercial policy, separate from KYC, record ownership and sourcing tags.
// The guide's independent demo shelf is explicit. Other published deals remain partner-only.
export const INDEPENDENT_FUND_IDS = [1, 3, 4];
export function segmentCanAccess(segment: InvestorSegment, fundId: number, fund?: Fund) {
  if (fund?.eligible_segments) return fund.eligible_segments.includes(segment);
  return segment === "partner_referred" || INDEPENDENT_FUND_IDS.includes(fundId);
}
/** Whether one client is in a deal's audience: their class, their partner firm, or by name, unless excluded. */
export function audienceIncludes(fund: Fund | undefined, who: AudienceMember, fundId: number) {
  // An exclusion wins over every other way of being included.
  if (fund?.audience_excluded?.includes(who.id)) return false;
  return (
    segmentCanAccess(who.segment, fundId, fund) ||
    Boolean(who.partner && fund?.audience_partners?.includes(who.partner)) ||
    Boolean(fund?.audience_investors?.includes(who.id))
  );
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
