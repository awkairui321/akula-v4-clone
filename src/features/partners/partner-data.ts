import type { WorkflowView } from "@/lib/workflow-types";

/** Capital in the three states that matter, always shown together. */
export type Capital = {
  /** Subscribed and not cancelled, rejected or returned. */
  committed: number;
  /** Cash confirmed received for the investment, after the subscription fee. */
  funded: number;
  /** Allocated by LUCA. */
  allocated: number;
};

export type HoldingLine = {
  id: number;
  units: string;
  cost: number;
  value: number;
  valueAt: string | null;
};

export type ApplicationLine = { id: number; status: string; amount: number };

export type ClientLine = Capital & {
  id: number;
  name: string;
  code: string;
  holdings: HoldingLine[];
  /** Applications that have not become a holding yet. */
  applications: ApplicationLine[];
  needsAction: number;
};

export type FundLine = Capital & {
  fundId: number;
  label: string;
  state: string;
  clients: ClientLine[];
};

export type ProjectLine = Capital & {
  key: number;
  codename: string;
  company: string;
  funds: FundLine[];
};

export type PartnerLine = Capital & {
  firm: string;
  clientCount: number;
  activeApplications: number;
  needsAction: number;
  projects: ProjectLine[];
  clients: ClientLine[];
};

const INACTIVE = ["cancelled", "rejected", "not_allocated", "funds_returned"];
const WAITING_ON_CLIENT = [
  "institution_review",
  "information_requested",
  "documents_pending",
  "awaiting_funds",
];

const empty = (): Capital => ({ committed: 0, funded: 0, allocated: 0 });
const add = (a: Capital, b: Capital): Capital => ({
  committed: a.committed + b.committed,
  funded: a.funded + b.funded,
  allocated: a.allocated + b.allocated,
});

/** Partner firms, their funds and their clients, from the data the viewer is allowed to see. */
export function buildPartnerBook(data: WorkflowView): {
  partners: PartnerLine[];
  direct: Capital & { clientCount: number };
} {
  const capitalOfSub = (id: number, amount: string, fee: string, status: string): Capital => {
    if (INACTIVE.includes(status)) return empty();
    const received = data.receipts
      .filter((r) => r.subscriptionId === id && r.matched && !r.supersededBy)
      .reduce((n, r) => n + r.amount, 0);
    return {
      committed: Number(amount),
      // Cash covers the subscription fee as well; funded is what has arrived for the investment.
      funded: Math.min(Number(amount), Math.max(0, received - Number(fee))),
      allocated: data.allocations
        .filter((a) => a.subscriptionId === id && !a.voided)
        .reduce((n, a) => n + a.principal, 0),
    };
  };

  const clientLine = (clientId: number, fundId?: number): ClientLine => {
    const client = data.clients.find((c) => c.id === clientId)!;
    const subs = data.subscriptions.filter(
      (s) => s.investor_id === clientId && (fundId === undefined || s.fund_id === fundId),
    );
    const holdings = data.holdings
      .filter((h) => h.investor_id === clientId && (fundId === undefined || h.fund_id === fundId))
      .map((h) => {
        const latest = data.valuations.filter((v) => v.holdingId === h.id).at(-1);
        return {
          id: h.id,
          units: h.units,
          cost: Number(h.committed_amount),
          value: Number(latest?.amount ?? h.current_nav),
          valueAt: latest?.at ?? h.nav_as_of,
        };
      });
    const applications = subs
      .filter((s) => !s.holdingId && !INACTIVE.includes(s.status))
      .map((s) => ({ id: s.id, status: s.status, amount: Number(s.amount) }));
    return {
      ...subs.reduce(
        (total, s) => add(total, capitalOfSub(s.id, s.amount, s.subscription_fee, s.status)),
        empty() as Capital,
      ),
      id: client.id,
      name: client.name,
      code: client.code,
      holdings,
      applications,
      needsAction: subs.filter((s) => !s.holdingId && WAITING_ON_CLIENT.includes(s.status)).length,
    };
  };

  const firms = [
    ...new Set(data.clients.map((c) => c.eamFirm).filter((x): x is string => !!x)),
  ].sort();

  const partners = firms.map((firm): PartnerLine => {
    const clients = data.clients.filter((c) => c.eamFirm === firm);
    const clientIds = new Set(clients.map((c) => c.id));
    const subs = data.subscriptions.filter((s) => clientIds.has(s.investor_id));
    const fundIds = [...new Set(subs.map((s) => s.fund_id))];

    const funds = fundIds.map((fundId): FundLine => {
      const fund = data.funds.find((f) => f.id === fundId);
      const fundClients = clients
        .filter((c) => subs.some((s) => s.fund_id === fundId && s.investor_id === c.id))
        .map((c) => clientLine(c.id, fundId));
      return {
        ...fundClients.reduce((t, c) => add(t, c), empty() as Capital),
        fundId,
        label:
          fund?.fundName?.replace(fund.company, "").trim() || fund?.fundName || `Fund ${fundId}`,
        state: fund?.state ?? "",
        clients: fundClients,
      };
    });

    const projectKeys = [
      ...new Set(funds.map((f) => data.funds.find((x) => x.id === f.fundId)?.assetId ?? f.fundId)),
    ];
    const projects = projectKeys
      .map((key): ProjectLine => {
        const members = funds.filter(
          (f) => (data.funds.find((x) => x.id === f.fundId)?.assetId ?? f.fundId) === key,
        );
        const lead = data.funds.find((x) => x.id === members[0].fundId);
        return {
          ...members.reduce((t, f) => add(t, f), empty() as Capital),
          key,
          codename: lead?.name ?? "Project",
          company: lead?.company ?? "",
          funds: members,
        };
      })
      .sort((a, b) => b.committed - a.committed);

    const clientLines = clients
      .map((c) => clientLine(c.id))
      .sort((a, b) => b.committed - a.committed);
    return {
      ...clientLines.reduce((t, c) => add(t, c), empty() as Capital),
      firm,
      clientCount: clients.length,
      activeApplications: subs.filter((s) => !s.holdingId && !INACTIVE.includes(s.status)).length,
      needsAction: clientLines.reduce((n, c) => n + c.needsAction, 0),
      projects,
      clients: clientLines,
    };
  });

  const direct = data.clients.filter((c) => !c.eamFirm).map((c) => clientLine(c.id));
  return {
    partners: partners.sort((a, b) => b.committed - a.committed),
    direct: {
      ...direct.reduce((t, c) => add(t, c), empty() as Capital),
      clientCount: direct.length,
    },
  };
}
