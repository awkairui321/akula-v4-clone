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

export function investorStatusLabel(
  status: SubscriptionStatus,
  issued = false,
  fundsVerified = false,
): string {
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
    // Ops has matched the funds; LUCA's first decision moves it to review.
    case "allocation_pending":
      return fundsVerified ? "Under review" : "Funds received";
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

/** The label for a subscription as the investor or the Fund Manager sees it. */
export function subscriptionStatusLabel(sub: {
  status: SubscriptionStatus;
  holding_id?: number | null;
  funds_verified_at?: string | null;
  /** The Fund Manager's own view carries the whole record rather than its date. */
  funds_verified?: unknown;
}): string {
  return investorStatusLabel(
    sub.status,
    Boolean(sub.holding_id),
    Boolean(sub.funds_verified_at ?? sub.funds_verified),
  );
}
