import type { Receipt } from "./workflow-types";

/** How a receipt reached the platform: Ops keyed it in, or the fund administrator confirmed it. */
export type ReceiptSource = "ops" | "acclime";

export const ACCLIME_CONFIRMATION_LABEL = "Acclime fund admin confirmation";

// Receipts the demo seeded for funds already received, saved before receipts carried a source.
const SEEDED_REFERENCE = /^(MIGRATED-|FUND-VARIANT-DEMO)/;

export function receiptSource(receipt: Pick<Receipt, "source" | "reference">): ReceiptSource {
  return receipt.source ?? (SEEDED_REFERENCE.test(receipt.reference) ? "acclime" : "ops");
}

/** What a receipt is called wherever LUCA reads it: the administrator's confirmation, or Ops' reference. */
export function receiptLabel(receipt: Pick<Receipt, "source" | "reference">): string {
  return receiptSource(receipt) === "acclime" ? ACCLIME_CONFIRMATION_LABEL : receipt.reference;
}
