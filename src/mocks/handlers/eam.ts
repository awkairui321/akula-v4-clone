import { mayDiscover } from "../investor-access";
import { currentVersion } from "../workflow";
import { inDemoClientCohort } from "../../lib/demo-cohort";
import { findUserById } from "../db";
import { partnerOnboarding } from "../onboarding";
import { http, HttpResponse } from "msw";
import {
  referenceFor,
  currentUser,
  findEamProfileByUserId,
  adviserClients,
  adminInvestors,
  findAdviserClientById,
  highlights,
  nextHighlightId,
  discussions,
  funds,
  findFundById,
  holdings,
  subscriptions,
  documents,
  findAdminInvestorSeed,
  type MockAdviserClient,
} from "../db";
import type { ClientStage } from "@/features/eam/types";

function unauthorized() {
  return HttpResponse.json({ error: "Not authenticated" }, { status: 401 });
}

function stripClient(client: MockAdviserClient) {
  const { eam_user_id: _eam_user_id, investor_id: _investor_id, ...rest } = client;
  const investor = adminInvestors().find((row) => row.id === _investor_id);
  return {
    ...rest,
    investor_user_id: _investor_id,
    client_code: referenceFor(_investor_id),
    showcase: inDemoClientCohort(
      _investor_id,
      investor?.verification_status === "approved",
      Boolean(investor?.prepared_by_rm),
    ),
  };
}

function myClients(eamUserId: number): MockAdviserClient[] {
  return adviserClients.filter((c) => c.eam_user_id === eamUserId);
}

function clientHoldings(investorId: number) {
  return holdings
    .filter((h) => h.investor_id === investorId)
    .map((h) => ({
      id: h.id,
      fund_id: h.fund_id,
      fund_name: h.fund_name,
      fund_codename: h.fund_codename,
      asset_name: h.asset_name,
      sector: h.sector,
      units: h.units,
      committed_amount: h.committed_amount,
      current_nav: h.current_nav,
      nav_as_of: h.nav_as_of,
      distributions: h.distributions,
      entry_price_per_share: h.entry_price_per_share,
      state: h.state,
      subscribed_at: h.subscribed_at,
      moic: h.moic,
    }));
}

function clientSubscriptions(investorId: number) {
  return subscriptions
    .filter((s) => s.investor_id === investorId)
    .map((s) => ({
      id: s.id,
      fund_id: s.fund_id,
      fund_name: s.fund_name,
      asset_name: s.asset_name,
      amount: s.amount,
      status: s.status,
      subscription_fee: s.subscription_fee,
      holding_id: s._convertedToHoldingId,
      on_hold: s.on_hold,
      information_request_note: s.information_request_note,
      reserved_at: s.reserved_at,
      confirmed_at: s.confirmed_at,
    }));
}

function clientDocuments(investorId: number) {
  return documents
    .filter((d) => d.owner_id === investorId && d.fund_id !== null)
    .map((d) => ({
      id: d.id,
      fund_id: d.fund_id,
      subscription_id: d.subscription_id,
      name: d.name,
      kind: d.kind,
      status: d.status,
      has_file: d.has_file,
      file_data_url: d.file_data_url ?? null,
      created_at: d.created_at,
    }));
}

function clientDetailFor(client: MockAdviserClient, viewer?: ReturnType<typeof findUserById>) {
  return {
    onboarding: viewer ? partnerOnboarding(viewer, client.investor_id) : null,
    client: stripClient(client),
    holdings: clientHoldings(client.investor_id),
    subscriptions: clientSubscriptions(client.investor_id),
    documents: clientDocuments(client.investor_id),
  };
}

function participationFor(investorId: number): number {
  const heldCost = holdings
    .filter((h) => h.investor_id === investorId && h.state !== "realized")
    .reduce((sum, h) => sum + parseFloat(h.committed_amount), 0);
  const activeSubs = subscriptions
    .filter(
      (s) =>
        s.investor_id === investorId &&
        !s._convertedToHoldingId &&
        !["cancelled", "rejected", "funds_returned", "not_allocated"].includes(s.status),
    )
    .reduce((sum, s) => sum + (s.allocated_principal ?? parseFloat(s.amount)), 0);
  return heldCost + activeSubs;
}

export const eamHandlers = [
  // GET /api/v1/eam/profile
  http.get("*/api/v1/eam/profile", ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const profile = findEamProfileByUserId(user.id);
    if (!profile) return HttpResponse.json({ error: "No EAM profile" }, { status: 404 });
    return HttpResponse.json(profile);
  }),

  // PATCH /api/v1/eam/profile
  http.patch("*/api/v1/eam/profile", async ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const profile = findEamProfileByUserId(user.id);
    if (!profile) return HttpResponse.json({ error: "No EAM profile" }, { status: 404 });
    const body = (await request.json()) as {
      eam_profile?: { firm_name?: string; display_name?: string };
    };
    if (body.eam_profile?.firm_name) profile.firm_name = body.eam_profile.firm_name;
    if (body.eam_profile?.display_name) profile.display_name = body.eam_profile.display_name;
    return HttpResponse.json(profile);
  }),

  // GET /api/v1/eam/dashboard
  http.get("*/api/v1/eam/dashboard", ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const clients = myClients(user.id).filter((client) => stripClient(client).showcase);

    const clients_by_stage: Record<ClientStage, number> = {
      prospect: 0,
      onboarding: 0,
      active: 0,
      inactive: 0,
    };
    for (const c of clients) clients_by_stage[c.stage] += 1;

    const verified_clients = clients.filter(
      (c) => findAdminInvestorSeed(c.investor_id)?.verification_status === "approved",
    ).length;

    const total_participation = clients.reduce(
      (sum, c) => sum + participationFor(c.investor_id),
      0,
    );

    const myHighlights = highlights.filter((h) =>
      clients.some((c) => c.id === h.adviser_client_id),
    );

    const servicing_queue = clients.map((c) => ({
      id: c.id,
      client_name: c.client_name,
      stage: c.stage,
      verification: findAdminInvestorSeed(c.investor_id)?.verification_status ?? "pending",
      highlights: myHighlights.filter((h) => h.adviser_client_id === c.id).map((h) => h.fund_name),
      participation: participationFor(c.investor_id),
      updated_at: c.updated_at,
    }));

    const investment_progress = subscriptions
      .filter((subscription) =>
        clients.some((client) => client.investor_id === subscription.investor_id),
      )
      .map((subscription) => {
        const client = clients.find((item) => item.investor_id === subscription.investor_id)!;
        return {
          id: subscription.id,
          adviser_client_id: client.id,
          client_name: client.client_name,
          asset_name: subscription.asset_name,
          amount: subscription.amount,
          status: subscription.status,
        };
      });
    const open_discussions = discussions.filter(
      (discussion) =>
        discussion.status === "open" &&
        clients.some((client) => client.id === discussion.adviser_client_id),
    ).length;

    return HttpResponse.json({
      total_clients: clients.length,
      verified_clients,
      total_participation,
      clients_by_stage,
      total_highlights: myHighlights.length,
      recent_highlights: [...myHighlights]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5),
      servicing_queue,
      investment_progress,
      open_discussions,
    });
  }),

  // Aggregated, client-scoped records for the shared EAM document and report views.
  http.get("*/api/v1/eam/documents", ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const clients = myClients(user.id);
    return HttpResponse.json(
      clients.flatMap((client) =>
        documents
          .filter(
            (document) => document.owner_id === client.investor_id && document.fund_id !== null,
          )
          .map((document) => ({
            id: document.id,
            adviser_client_id: client.id,
            client_name: client.client_name,
            fund_id: document.fund_id,
            fund_name: document.fund_name,
            subscription_id: document.subscription_id,
            name: document.name,
            kind: document.kind,
            status: document.status,
            has_file: document.has_file,
            file_data_url: document.file_data_url ?? null,
            created_at: document.created_at,
          })),
      ),
    );
  }),

  http.get("*/api/v1/eam/reports", ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    return HttpResponse.json(
      myClients(user.id).flatMap((client) =>
        clientHoldings(client.investor_id).map((holding) => ({
          ...holding,
          adviser_client_id: client.id,
          client_name: client.client_name,
          client_code: referenceFor(client.investor_id),
        })),
      ),
    );
  }),

  // GET /api/v1/eam/revenue
  http.get("*/api/v1/eam/revenue", ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const profile = findEamProfileByUserId(user.id);
    if (!profile) return HttpResponse.json({ error: "No EAM profile" }, { status: 404 });
    const clients = myClients(user.id);
    const investorIds = clients.map((c) => c.investor_id);

    const sharePct = profile.revenue_share_pct;
    const clientFeePct = profile.client_subscription_fee_pct;

    const heldOrAllocated = [
      ...holdings
        .filter((h) => investorIds.includes(h.investor_id))
        .map((h) => ({
          project_name: h.fund_codename,
          fund_id: h.fund_id,
          client_name: clients.find((c) => c.investor_id === h.investor_id)?.client_name ?? "",
          reference: null as string | null,
          allocated_volume: parseFloat(h.committed_amount),
          settlement_date: h.subscribed_at,
        })),
      ...subscriptions
        .filter(
          (s) =>
            investorIds.includes(s.investor_id) &&
            s.status === "allocated" &&
            !s._convertedToHoldingId,
        )
        .map((s) => {
          const fund = findFundById(s.fund_id);
          return {
            project_name: fund?.codename ?? s.fund_name,
            fund_id: s.fund_id,
            client_name: clients.find((c) => c.investor_id === s.investor_id)?.client_name ?? "",
            reference: s.payment_reference as string | null,
            allocated_volume: s.allocated_principal ?? parseFloat(s.amount),
            settlement_date: s.allocated_at,
          };
        }),
    ];

    const transactions = heldOrAllocated.map((row, i) => {
      const status: "accrued" | "paid" | "pending" =
        i % 3 === 0 ? "paid" : i % 3 === 1 ? "accrued" : "pending";
      return {
        id: i + 1,
        project_name: row.project_name,
        client_name: row.client_name,
        reference: row.reference,
        allocated_volume: row.allocated_volume,
        fee_base_amount: row.allocated_volume * (clientFeePct / 100),
        share_pct: sharePct,
        share_amount: row.allocated_volume * (clientFeePct / 100) * (sharePct / 100),
        status,
        settlement_date: row.settlement_date,
        period: row.settlement_date ? row.settlement_date.slice(0, 7) : null,
      };
    });

    const paid = transactions
      .filter((t) => t.status === "paid")
      .reduce((s, t) => s + t.share_amount, 0);
    const accrued = transactions
      .filter((t) => t.status === "accrued")
      .reduce((s, t) => s + t.share_amount, 0);
    const pending = transactions
      .filter((t) => t.status === "pending")
      .reduce((s, t) => s + t.share_amount, 0);

    const periodMap = new Map<string, { paid: number; accrued: number }>();
    for (const t of transactions) {
      if (!t.period) continue;
      const entry = periodMap.get(t.period) ?? { paid: 0, accrued: 0 };
      if (t.status === "paid") entry.paid += t.share_amount;
      if (t.status === "accrued") entry.accrued += t.share_amount;
      periodMap.set(t.period, entry);
    }
    const periods = [...periodMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([period, amounts], i) => {
        const rows: Array<{
          id: number;
          period: string;
          status: "accrued" | "paid";
          amount: number;
        }> = [];
        if (amounts.paid > 0)
          rows.push({ id: i * 2 + 1, period, status: "paid", amount: amounts.paid });
        if (amounts.accrued > 0)
          rows.push({ id: i * 2 + 2, period, status: "accrued", amount: amounts.accrued });
        return rows;
      });

    const participation_volume = clients.reduce(
      (sum, c) => sum + participationFor(c.investor_id),
      0,
    );

    return HttpResponse.json({
      accrued,
      paid,
      pending,
      participation_volume,
      revenue_share_pct: profile.revenue_share_pct,
      client_subscription_fee_pct: profile.client_subscription_fee_pct,
      periods,
      transactions,
    });
  }),

  // GET /api/v1/eam/clients
  http.get("*/api/v1/eam/clients", ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    return HttpResponse.json(myClients(user.id).map(stripClient));
  }),

  // GET /api/v1/eam/clients/:id
  http.get("*/api/v1/eam/clients/:id", ({ request, params }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const client = findAdviserClientById(Number(params.id));
    if (!client || client.eam_user_id !== user.id) {
      return HttpResponse.json({ error: "Client not found" }, { status: 404 });
    }
    return HttpResponse.json(clientDetailFor(client, user));
  }),

  // PATCH /api/v1/eam/clients/:id
  http.patch("*/api/v1/eam/clients/:id", async ({ request, params }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const client = findAdviserClientById(Number(params.id));
    if (!client || client.eam_user_id !== user.id) {
      return HttpResponse.json({ error: "Client not found" }, { status: 404 });
    }
    const body = (await request.json()) as { adviser_client?: { notes?: string; stage?: string } };
    if (body.adviser_client?.notes !== undefined) client.notes = body.adviser_client.notes;
    if (body.adviser_client?.stage) client.stage = body.adviser_client.stage as ClientStage;
    client.updated_at = new Date().toISOString();
    return HttpResponse.json(clientDetailFor(client, user));
  }),

  // GET /api/v1/eam/opportunities
  http.get("*/api/v1/eam/opportunities", ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const openFunds = funds
      .filter((f) => f.state === "open" && currentVersion(f.id))
      .map((f) => ({ ...structuredClone(currentVersion(f.id)!.snapshot), state: f.state }));
    const eamFunds = openFunds.map((f) => ({
      id: f.id,
      name: f.name,
      codename: f.codename,
      descriptor: f.descriptor,
      hook: f.hook,
      state: f.state,
      deal_type: f.deal_type,
      price: f.price,
      currency: "USD",
      min_subscription: f.min_subscription,
      supply_total: f.supply_total,
      supply_allocated: f.supply_allocated,
      subscription_fee_pct: f.subscription_fee_pct,
      management_fee_pct: f.management_fee_pct,
      carried_interest_pct: f.carried_interest_pct,
      closes_at: f.closes_at,
      asset: {
        id: f.asset.id,
        name: f.asset.name,
        sector: f.asset.sector,
        sub_sector: f.asset.sub_sector,
        funding_stage: f.asset.funding_stage,
        country: f.asset.country,
        description: f.asset.description,
        about: f.asset.about,
      },
      fund_manager: f.fund_manager,
    }));
    return HttpResponse.json({ funds: eamFunds });
  }),

  // GET /api/v1/eam/opportunities/:id
  http.get("*/api/v1/eam/opportunities/:id", ({ params, request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const working = findFundById(Number(params.id));
    const published = working && currentVersion(working.id);
    if (!working || working.state === "draft" || !published)
      return HttpResponse.json({ error: "Published opportunity not found" }, { status: 404 });
    const fund = { ...structuredClone(published.snapshot), state: working.state };
    const fundHighlights = highlights.filter(
      (h) => h.fund_id === fund.id && myClients(user.id).some((c) => c.id === h.adviser_client_id),
    );
    return HttpResponse.json({ fund, highlights: fundHighlights });
  }),

  // GET /api/v1/eam/highlights?client_id=:id
  http.get("*/api/v1/eam/highlights", ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const url = new URL(request.url);
    const clientId = url.searchParams.get("client_id");
    const clientIds = myClients(user.id).map((c) => c.id);
    let mine = highlights.filter((h) => clientIds.includes(h.adviser_client_id));
    if (clientId) mine = mine.filter((h) => h.adviser_client_id === Number(clientId));
    return HttpResponse.json(mine);
  }),

  // POST /api/v1/eam/highlights
  http.post("*/api/v1/eam/highlights", async ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const body = (await request.json()) as {
      highlight?: { adviser_client_id?: number; fund_id?: number; rationale?: string };
    };
    const clientId = body.highlight?.adviser_client_id;
    const fundId = body.highlight?.fund_id;
    const client = clientId ? findAdviserClientById(clientId) : undefined;
    const fund = fundId ? findFundById(fundId) : undefined;
    if (!client || client.eam_user_id !== user.id || !fund || fund.state !== "open") {
      return HttpResponse.json({ error: "Client and fund are required" }, { status: 422 });
    }
    const recipient = findUserById(client.investor_id);
    if (!recipient || !mayDiscover(recipient, fund.id))
      return HttpResponse.json(
        { error: "This deal is unavailable under the client's investor profile." },
        { status: 422 },
      );
    const highlight = {
      id: nextHighlightId(),
      adviser_client_id: client.id,
      client_name: client.client_name,
      fund_id: fund.id,
      fund_name: fund.name,
      rationale: body.highlight?.rationale ?? "",
      created_at: new Date().toISOString(),
    };
    highlights.push(highlight);
    return HttpResponse.json({ highlight });
  }),

  // DELETE /api/v1/eam/highlights/:id
  http.delete("*/api/v1/eam/highlights/:id", ({ params, request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const record = highlights.find((h) => h.id === Number(params.id));
    if (!record || !myClients(user.id).some((c) => c.id === record.adviser_client_id))
      return HttpResponse.json({ error: "Highlight not found" }, { status: 404 });
    const index = highlights.findIndex((h) => h.id === Number(params.id));
    if (index !== -1) highlights.splice(index, 1);
    return HttpResponse.json({});
  }),

  // Retired informal discussions; stored history is preserved but no longer interactive.
  http.all("*/api/v1/eam/discussions", () =>
    HttpResponse.json({ error: "Informal discussions have been retired." }, { status: 410 }),
  ),
  http.all("*/api/v1/eam/discussions/*", () =>
    HttpResponse.json({ error: "Informal discussions have been retired." }, { status: 410 }),
  ),
];
