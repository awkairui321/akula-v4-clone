import * as db from "./db";
import { CLOSED_SUBSCRIPTION_STATUSES } from "../lib/types";
import { audienceIncludes, type InvestorSegment } from "../lib/investor-access";

export function segmentFor(user: db.MockUser): InvestorSegment {
  if (user.investor_segment) return user.investor_segment;
  const channel = db.findInvestorProfileByUserId(user.id)?.channel;
  if (channel) return channel === "eam_referred" ? "partner_referred" : "independent";
  return db.adviserClients.some((client) => client.investor_id === user.id)
    ? "partner_referred"
    : "independent";
}
/** The investor as a deal's audience sees them: id, client class and partner firm. */
export function audienceMember(user: db.MockUser) {
  return {
    id: user.id,
    segment: segmentFor(user),
    partner: db.findInvestorProfileByUserId(user.id)?.eam_firm ?? null,
  };
}
/** An investor's open subscription in a fund (not yet a holding, not closed), if they have one. */
export function openSubscriptionId(userId: number, fundId: number): number | null {
  return (
    db.subscriptions.find(
      (s) =>
        s.investor_id === userId &&
        s.fund_id === fundId &&
        !s._convertedToHoldingId &&
        !CLOSED_SUBSCRIPTION_STATUSES.includes(s.status),
    )?.id ?? null
  );
}
export function investorAudience(user: db.MockUser) {
  return user.has_investor_profile && !["luca", "ops", "rm"].includes(user.role);
}
export function mayDiscover(user: db.MockUser, fundId: number) {
  // Read the approved audience, never an unpublished edit to the working fund.
  const fund = publishedAudienceFund?.(fundId) ?? db.findFundById(fundId);
  if (!investorAudience(user)) return true;
  return audienceIncludes(fund, audienceMember(user), fundId);
}
let publishedAudienceFund: ((id: number) => import("../lib/types").Fund | undefined) | undefined;
export function setPublishedAudienceReader(read: NonNullable<typeof publishedAudienceFund>) {
  publishedAudienceFund = read;
}
export function hasInvestmentHistory(user: db.MockUser, fundId: number) {
  return (
    db.subscriptions.some((s) => s.investor_id === user.id && s.fund_id === fundId) ||
    db.holdings.some((h) => h.investor_id === user.id && h.fund_id === fundId)
  );
}
