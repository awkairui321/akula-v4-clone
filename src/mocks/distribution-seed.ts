import {
  planDistribution,
  type DistributionEvent,
  type DistributionKind,
} from "../lib/distributions";

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

type SeedHolder = { holdingId: number; investorId: number; investorName: string; units: number };
type SeedEvent = {
  id: number;
  fundId: number;
  fundName: string;
  assetName: string;
  kind: DistributionKind;
  perUnit: number;
  recordedDaysAgo: number;
  paidDaysAgo: number;
  fullExit?: boolean;
  exitRoute?: string;
  note: string;
  reference: string;
  holders: SeedHolder[];
};

const orbis: SeedHolder[] = [
  { holdingId: 2, investorId: 2, investorName: "Elena Cross", units: 190 },
  { holdingId: 6, investorId: 18, investorName: "Henry Osei", units: 236 },
];
const solara: SeedHolder[] = [
  { holdingId: 1, investorId: 2, investorName: "Elena Cross", units: 270.5 },
  { holdingId: 7, investorId: 14, investorName: "Julian Ortiz", units: 189.7 },
];

/**
 * Illustrative history of money already paid out, so the Fund Manager's Payments out page and the
 * investor's portfolio have something to show. The totals match the seeded holdings' distributions.
 */
const SEED: SeedEvent[] = [
  {
    id: 9001,
    fundId: 3,
    fundName: "Orbis Space Systems SPV I",
    assetName: "Orbis Space Systems",
    kind: "income",
    perUnit: 5,
    recordedDaysAgo: 172,
    paidDaysAgo: 165,
    note: "H1 income",
    reference: "ACC-DIST-0001",
    holders: orbis,
  },
  {
    id: 9002,
    fundId: 3,
    fundName: "Orbis Space Systems SPV I",
    assetName: "Orbis Space Systems",
    kind: "income",
    perUnit: 3.5,
    recordedDaysAgo: 68,
    paidDaysAgo: 62,
    note: "H2 income",
    reference: "ACC-DIST-0002",
    holders: orbis,
  },
  {
    id: 9003,
    fundId: 1,
    fundName: "Solara Grid SPV I",
    assetName: "Solara Grid",
    kind: "income",
    perUnit: 2,
    recordedDaysAgo: 46,
    paidDaysAgo: 40,
    note: "Q2 income",
    reference: "ACC-DIST-0003",
    holders: solara,
  },
  {
    id: 9004,
    fundId: 4,
    fundName: "Ledgerline Financial SPV I",
    assetName: "Ledgerline Financial",
    kind: "exit_proceeds",
    perUnit: 106.42,
    recordedDaysAgo: 66,
    paidDaysAgo: 60,
    fullExit: true,
    exitRoute: "acquisition",
    note: "Sale of Ledgerline Financial",
    reference: "ACC-DIST-0004",
    holders: [{ holdingId: 3, investorId: 2, investorName: "Elena Cross", units: 770.5 }],
  },
];

export function seedDistributions(): DistributionEvent[] {
  return SEED.map((event) => {
    const names = new Map(event.holders.map((h) => [h.holdingId, h.investorName]));
    const paidAt = ago(event.paidDaysAgo);
    return {
      id: event.id,
      fundId: event.fundId,
      fundName: event.fundName,
      assetName: event.assetName,
      kind: event.kind,
      perUnit: event.perUnit,
      recordDate: ago(event.recordedDaysAgo),
      fullExit: event.fullExit ?? false,
      exitRoute: event.exitRoute ?? null,
      note: event.note,
      recordedBy: "LUCA Fund Manager",
      recordedAt: ago(event.recordedDaysAgo),
      lines: planDistribution(event.holders, event.perUnit).map((line, i) => ({
        id: event.id * 10 + i + 1,
        holdingId: line.holdingId,
        investorId: line.investorId,
        investorName: names.get(line.holdingId) ?? "Investor",
        units: line.units,
        amount: line.amount,
        status: "processed" as const,
        paidAt,
        reference: event.reference,
      })),
    };
  });
}
