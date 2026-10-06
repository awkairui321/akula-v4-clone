import * as db from "./db";
import { segmentCanAccess, type InvestorSegment } from "../lib/investor-access";

export function segmentFor(user: db.MockUser): InvestorSegment {
  if (user.investor_segment) return user.investor_segment;
  const channel = db.findInvestorProfileByUserId(user.id)?.channel;
  if (channel) return channel === "eam_referred" ? "partner_referred" : "independent";
  return db.adviserClients.some((client) => client.investor_id === user.id)
    ? "partner_referred"
    : "independent";
}
export function investorAudience(user: db.MockUser) {
  return user.has_investor_profile && !["luca", "ops", "rm"].includes(user.role);
}
export function mayDiscover(user: db.MockUser, fundId: number) {
  return !investorAudience(user) || segmentCanAccess(segmentFor(user), fundId);
}
export function hasInvestmentHistory(user: db.MockUser, fundId: number) {
  return (
    db.subscriptions.some((s) => s.investor_id === user.id && s.fund_id === fundId) ||
    db.holdings.some((h) => h.investor_id === user.id && h.fund_id === fundId)
  );
}
