/**
 * Money paid out of a fund to its investors other than refunds: income, a return of capital, or the
 * proceeds when a holding is sold. The Fund Manager records each event for a fund, the platform
 * works out what every holder is owed, and each payment is confirmed once it has been made.
 */

export type DistributionKind = "income" | "return_of_capital" | "exit_proceeds";

export const DISTRIBUTION_KINDS: { value: DistributionKind; label: string; hint: string }[] = [
  { value: "income", label: "Income distribution", hint: "A share of the fund's income." },
  {
    value: "return_of_capital",
    label: "Return of capital",
    hint: "Part of the invested capital paid back. The holdings stay open.",
  },
  {
    value: "exit_proceeds",
    label: "Exit proceeds",
    hint: "What the holding is sold for. A full exit closes the holding.",
  },
];

export const distributionKindLabel = (kind: DistributionKind) =>
  DISTRIBUTION_KINDS.find((k) => k.value === kind)?.label ?? kind;

export type DistributionLineStatus = "due" | "processed";

export const DISTRIBUTION_STATUS_LABELS: Record<DistributionLineStatus, string> = {
  due: "Payment due",
  processed: "Paid",
};

/** What one holder is owed from one event. */
export type DistributionLine = {
  id: number;
  holdingId: number;
  investorId: number;
  investorName: string;
  units: number;
  amount: number;
  status: DistributionLineStatus;
  paidAt: string | null;
  /** The bank's or Acclime's reference for the payment, once it is confirmed. */
  reference: string | null;
};

export type DistributionEvent = {
  id: number;
  fundId: number;
  fundName: string;
  assetName: string;
  kind: DistributionKind;
  /** US dollars paid for each unit held on the record date. */
  perUnit: number;
  recordDate: string;
  /** For exit proceeds: whether the whole holding is sold, which closes it. */
  fullExit: boolean;
  /** How the exit happened, for example an acquisition. */
  exitRoute: string | null;
  note: string | null;
  recordedBy: string;
  recordedAt: string;
  lines: DistributionLine[];
};

/** What the Fund Manager enters. */
export type DistributionInput = {
  kind: DistributionKind;
  perUnit: number;
  recordDate: string;
  fullExit: boolean;
  exitRoute: string | null;
  note: string | null;
};

const cents = (n: number) => Math.round(n * 100) / 100;

/** Each holder's share: their units at the amount per unit, to the cent. */
export function planDistribution(
  holders: { holdingId: number; investorId: number; units: number }[],
  perUnit: number,
) {
  return holders
    .map((holder) => ({ ...holder, amount: cents(holder.units * perUnit) }))
    .filter((line) => line.amount > 0);
}

export function eventTotals(event: Pick<DistributionEvent, "lines">) {
  const total = event.lines.reduce((n, l) => n + l.amount, 0);
  const paid = event.lines.filter((l) => l.status === "processed");
  const paidAmount = paid.reduce((n, l) => n + l.amount, 0);
  return {
    total: cents(total),
    paidAmount: cents(paidAmount),
    owed: cents(total - paidAmount),
    paidCount: paid.length,
    count: event.lines.length,
    settled: paid.length === event.lines.length,
  };
}
