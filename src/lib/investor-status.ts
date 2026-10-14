import type { SubscriptionStatus } from "./types";

/**
 * The wording the investor and the Fund Manager see for where a subscription stands. It is a
 * display layer over the statuses the platform stores, so the Ops screens keep their own wording.
 */
export const INVESTOR_STATUS_SEQUENCE = [
  "Draft",
  "Agreement signed",
  "Awaiting funds",
  "Funds received",
  "Under review",
  "Allocation confirmed",
  "Accepted",
] as const;

export function investorStatusLabel(status: SubscriptionStatus, issued = false): string {
  switch (status) {
    case "reserved":
    case "documents_pending":
      return "Draft";
    case "institution_review":
    case "approved":
      return "Agreement signed";
    case "awaiting_funds":
    case "payment_unmatched":
      return "Awaiting funds";
    case "reconciliation":
      return "Funds received";
    case "allocation_pending":
      return "Under review";
    case "allocated":
      return issued ? "Accepted" : "Allocation confirmed";
    case "not_allocated":
    case "rejected":
      return "Not accepted";
    case "funds_returned":
      return "Refund processed";
    case "cancelled":
      return "Cancelled";
  }
}
