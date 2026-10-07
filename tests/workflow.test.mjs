import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
// Compile the actual API/model modules, not an imitation of their rules.
const out = path.resolve(".test-runtime");
for (const file of [
  "src/lib/types.ts",
  "src/lib/permissions.ts",
  "src/lib/investor-access.ts",
  "src/mocks/investor-access.ts",
  "src/lib/client-onboarding.ts",
  "src/lib/rm-onboarding.ts",
  "src/features/partners/partner-data.ts",
  "src/features/admin/client-funds-data.ts",
  "src/features/admin/analytics-data.ts",
  "src/lib/document-catalogue.ts",
  "src/mocks/db.ts",
  "src/mocks/workflow.ts",
  "src/mocks/onboarding.ts",
  "src/mocks/handlers/workflow.ts",
  "src/mocks/handlers/guard.ts",
  "src/mocks/handlers/investor.ts",
  "src/mocks/handlers/eam.ts",
  "src/mocks/handlers/rm.ts",
  "src/mocks/handlers/client.ts",
  "src/mocks/handlers/admin.ts",
  "src/mocks/handlers/auth.ts",
  "src/mocks/handlers/public.ts",
  "src/mocks/handlers/index.ts",
]) {
  let code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  code = code.replace(/from (["'])([^"']+)\1/g, (all, q, name) => {
    if (!name.startsWith(".") && !name.startsWith("@/")) return all;
    const target = name.startsWith("@/")
      ? path.resolve("src", name.slice(2))
      : path.resolve(path.dirname(file), name);
    let relative = path.relative(path.dirname(path.resolve(file)), target).replaceAll("\\", "/");
    if (!relative.startsWith(".")) relative = "./" + relative;
    return `from ${q}${relative}.mjs${q}`;
  });
  const target = path.join(out, file.replace(/\.ts$/, ".mjs"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, code);
}
const db = await import("../.test-runtime/src/mocks/db.mjs");
const w = await import("../.test-runtime/src/mocks/workflow.mjs");
const { handlers } = await import("../.test-runtime/src/mocks/handlers/index.mjs");
const { buildAnalytics } = await import("../.test-runtime/src/features/admin/analytics-data.mjs");
const { buildPartnerBook } =
  await import("../.test-runtime/src/features/partners/partner-data.mjs");
const { buildClientFunds } =
  await import("../.test-runtime/src/features/admin/client-funds-data.mjs");
w.seedWorkflow();
const initialDb = db.exportDemoState(),
  initial = structuredClone(w.workflow);
test.beforeEach(() => {
  db.restoreDemoState(initialDb);
  Object.assign(w.workflow, structuredClone(initial));
});
const manager = () => db.users.find((u) => u.role === "luca"),
  ops = () => db.users.find((u) => u.role === "ops"),
  rm = () => db.users.find((u) => u.id === 6),
  investor = () => db.users.find((u) => u.id === 2);
const funded = () => db.subscriptions.find((s) => s.status === "allocation_pending");
test("client fund hierarchy keeps ownership, subscription-linked documents and empty clients", async () => {
  const { investors } = await (await request("admin/investors", manager())).json();
  const view = w.view(manager());
  const sub = view.subscriptions[0];
  const other = investors.find((i) => i.id !== sub.investor_id);
  const doc = {
    id: 99001,
    owner_id: sub.investor_id,
    kind: "agreement",
    fund_id: null,
    subscription_id: sub.id,
    name: "Subscription-linked agreement",
  };
  const account = { ...doc, id: 99002, kind: "identity", subscription_id: null };
  const rows = buildClientFunds(investors, view, [doc, account], []);
  const client = rows.find((r) => r.investor.id === sub.investor_id);
  assert.equal(rows.length, investors.length);
  assert.deepEqual(
    client.funds.find((f) => f.id === sub.fund_id).docs.map((d) => d.id),
    [doc.id],
  );
  assert.deepEqual(
    client.accountDocs.map((d) => d.id),
    [account.id],
  );
  assert.equal(rows.find((r) => r.investor.id === other.id).funds.flatMap((f) => f.docs).length, 0);
  assert.equal(new Set(client.funds.map((f) => f.id)).size, client.funds.length);
  const expected = buildPartnerBook(view).all.clients.find((c) => c.id === sub.investor_id);
  assert.equal(client.capital.committed, expected.committed);
  const noInvestment = { ...other, id: 99999, full_name: "No investments" };
  assert.equal(buildClientFunds([noInvestment], view, [], [])[0].funds.length, 0);
  const rmView = w.view(rm());
  const allowed = investors.filter((i) => rmView.clients.some((c) => c.id === i.id));
  const scoped = buildClientFunds(allowed, rmView, [doc], []);
  assert.ok(scoped.every((r) => rmView.clients.some((c) => c.id === r.investor.id)));
});
test("commercial profiles filter discovery and new subscriptions, preserving historic access and fees", async () => {
  const user = investor();
  const base = Number(w.currentVersion(1).snapshot.subscription_fee_pct);
  assert.equal(
    (await request("demo/investor-segment", user, "PATCH", { segment: "independent" })).status,
    200,
  );
  const shelf = await (await request("funds", user)).json();
  assert.deepEqual(
    shelf.funds.map((f) => f.id),
    [1, 3, 4],
  );
  assert.equal(Number(shelf.funds[0].subscription_fee_pct), base + 1);
  assert.equal(
    (await request("subscriptions", user, "POST", { fund_id: 2, amount: "25000" })).status,
    403,
  );
  const historical = await (await request("funds/2", user)).json();
  assert.equal(historical.fund.investor_access.canSubscribe, false);
  const created = await (
    await request("subscriptions", user, "POST", { fund_id: 1, amount: "25000" })
  ).json();
  assert.equal(Number(created.subscription.subscription_fee), (25000 * (base + 1)) / 100);
  await request("demo/investor-segment", user, "PATCH", { segment: "partner_referred" });
  const expanded = await (await request("funds", user)).json();
  assert.deepEqual(
    expanded.funds.map((f) => f.id),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
  assert.equal(Number(expanded.funds[0].subscription_fee_pct), base);
  const saved = await (await request(`subscriptions/${created.subscription.id}`, user)).json();
  assert.equal(saved.subscription.commercial_terms.segment, "independent");
  assert.equal(saved.subscription.subscription_fee, created.subscription.subscription_fee);
  assert.equal(Number(w.currentVersion(1).snapshot.subscription_fee_pct), base);
  const partner = await (
    await request("subscriptions", user, "POST", { fund_id: 2, amount: "25000" })
  ).json();
  assert.equal(partner.subscription.commercial_terms.allocationPriority, "partner_priority");
});
test("profile change cannot bypass KYC or client scope; onboarding channel controls profile", async () => {
  const user = investor();
  await request("demo/investor-segment", user, "PATCH", { segment: "partner_referred" });
  await request("investor_profile", user, "PATCH", { investor_profile: { channel: "direct" } });
  assert.equal(
    (await (await request("demo/investor-segment", user)).json()).segment,
    "independent",
  );
  await request("investor_profile", user, "PATCH", {
    investor_profile: { channel: "eam_referred", referral_code: "MERIDIAN" },
  });
  assert.equal(
    (await (await request("demo/investor-segment", user)).json()).segment,
    "partner_referred",
  );
  const before = w.clientsFor(user);
  await request("demo/investor-segment", user, "PATCH", { segment: "independent" });
  assert.deepEqual(w.clientsFor(user), before);
  user.kyc_status = "not_started";
  await request("demo/investor-segment", user, "PATCH", { segment: "partner_referred" });
  assert.equal((await request("funds", user)).status, 403);
  assert.equal(
    (await request("subscriptions", user, "POST", { fund_id: 2, amount: "25000" })).status,
    422,
  );
});
async function request(route, user, method = "GET", body) {
  const request = new Request("http://localhost:3000/api/v1/" + route, {
    method,
    headers: {
      Authorization: `Bearer ${db.tokenFor(user.id)}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  for (const h of handlers) {
    if (await h.test({ request: request.clone() })) {
      const result = await h.run({ request: request.clone(), requestId: crypto.randomUUID() });
      if (result?.response) return result.response;
    }
  }
  throw new Error("No API handler");
}
test("partial allocation is independent of idempotent issuance and reconciles residual fee/cash", () => {
  const s = funded(),
    cash = w.matched(s.id),
    capital = Number(s.amount) / 2;
  const old = db.holdings.length;
  w.command(manager(), { type: "allocate", id: s.id, amount: capital, price: 1000 });
  assert.equal(db.holdings.length, old);
  const a = w.workflow.allocations.find((a) => a.subscriptionId === s.id);
  assert.equal(
    a.principal +
      a.fee +
      w.workflow.returns.filter((r) => r.subscriptionId === s.id).reduce((n, r) => n + r.amount, 0),
    cash,
  );
  w.command(ops(), { type: "issue", id: s.id });
  w.command(ops(), { type: "issue", id: s.id });
  assert.equal(db.holdings.length, old + 1);
  assert.equal(Number(db.holdings.at(-1).committed_amount), capital);
});
test("zero allocation never issues and returns require explicit processing/confirmation", () => {
  const s = funded();
  w.command(manager(), { type: "allocate", id: s.id, amount: 0, price: 1000 });
  assert.throws(() => w.command(ops(), { type: "issue", id: s.id }));
  let r = w.workflow.returns.find((r) => r.subscriptionId === s.id);
  assert.throws(() =>
    w.command(ops(), { type: "return", id: s.id, target: r.id, status: "confirmed" }),
  );
  w.command(ops(), { type: "return", id: s.id, target: r.id, status: "processing" });
  w.command(ops(), { type: "return", id: s.id, target: r.id, status: "failed" });
  w.command(ops(), { type: "return", id: s.id, target: r.id, status: "processing" });
  w.command(ops(), { type: "return", id: s.id, target: r.id, status: "confirmed" });
  assert.equal(w.workflow.returns.find((x) => x.id === r.id).status, "confirmed");
});
test("late cash appends a new obligation without rewriting settled history", () => {
  const s = db.subscriptions.find((s) => s.status === "funds_returned");
  const old = structuredClone(w.workflow.returns.filter((r) => r.subscriptionId === s.id));
  w.command(ops(), {
    type: "receipt",
    id: s.id,
    amount: 123,
    currency: s.currency,
    text: "LATE-1",
  });
  const r = w.workflow.receipts.at(-1);
  w.command(ops(), { type: "match", id: s.id, target: r.id });
  assert.deepEqual(
    w.workflow.returns.filter((r) => old.some((o) => o.id === r.id)),
    old,
  );
  assert.equal(w.workflow.returns.at(-1).amount, 123);
});
test("unmatched and wrong-currency receipts block allocation; corrections preserve originals", () => {
  const s = funded();
  w.command(ops(), { type: "receipt", id: s.id, amount: 100, currency: "SGD", text: "WRONG" });
  const receipt = w.workflow.receipts.at(-1);
  assert.throws(
    () => w.command(ops(), { type: "match", id: s.id, target: receipt.id }),
    /currency/,
  );
  assert.throws(
    () => w.command(manager(), { type: "allocate", id: s.id, amount: 1000, price: 1000 }),
    /unmatched/,
  );
  w.command(ops(), {
    type: "correct-receipt",
    id: s.id,
    target: receipt.id,
    amount: 100,
    currency: s.currency,
    text: "CORRECTION",
  });
  assert.ok(w.workflow.receipts.find((r) => r.id === receipt.id).supersededBy);
});
test("failed commands are atomic", () => {
  const s = funded();
  const before = structuredClone(w.workflow);
  assert.throws(() =>
    w.command(manager(), { type: "allocate", id: s.id, amount: 1e9, price: 1000 }),
  );
  assert.deepEqual(w.workflow, before);
});
test("cancelled offerings cannot allocate or issue", () => {
  const s = funded();
  db.findFundById(s.fund_id).state = "cancelled";
  assert.throws(
    () => w.command(manager(), { type: "allocate", id: s.id, amount: 1000, price: 1000 }),
    /terminal/,
  );
});
test("roles cannot impersonate manager decisions or Ops issuance", () => {
  const s = funded();
  assert.throws(
    () => w.command(ops(), { type: "allocate", id: s.id, amount: 0, price: 1000 }),
    /role/,
  );
  assert.throws(
    () => w.command(manager(), { type: "receipt", id: s.id, amount: 10, text: "NO" }),
    /role/,
  );
  assert.throws(
    () => w.command(rm(), { type: "allocate", id: s.id, amount: 0, price: 1000 }),
    /role/,
  );
});
test("investor API guards foreign read, write, acknowledgment, signature and refund IDs", async () => {
  const foreign = db.subscriptions.find((s) => s.investor_id !== 2);
  for (const [route, method, body] of [
    [`subscriptions/${foreign.id}`, "GET"],
    [`subscriptions/${foreign.id}`, "PATCH", { payment_declared: true }],
    [`subscriptions/${foreign.id}/refund_request`, "POST"],
    ["signwell/sign_subscription", "POST", { subscription_id: foreign.id }],
    ["signwell/check_subscription", "POST", { subscription_id: foreign.id }],
  ]) {
    const r = await request(route, investor(), method, body);
    assert.equal(r.status, 404, route);
  }
});
test("EAM cannot read another institution discussion or delete their highlight", async () => {
  const user = db.users.find((u) => u.id === 5);
  const foreign = db.discussions.find(
    (d) => db.adviserClients.find((c) => c.id === d.adviser_client_id)?.eam_user_id !== 5,
  );
  assert.equal((await request(`eam/discussions/${foreign.id}`, user)).status, 410);
  const h = db.highlights.find(
    (h) => db.adviserClients.find((c) => c.id === h.adviser_client_id)?.eam_user_id !== 5,
  );
  assert.equal((await request(`eam/highlights/${h.id}`, user, "DELETE")).status, 404);
});
test("refund API creates a cancellation/obligation without claiming money returned", async () => {
  const s = db.subscriptions.find((s) => s.investor_id === 2 && s.status === "awaiting_funds");
  const r = await request(`subscriptions/${s.id}/refund_request`, investor(), "POST");
  assert.equal(r.status, 200);
  assert.equal(s.status, "cancelled");
});
test("exact approved publication retains earlier signed snapshots", () => {
  const f = db.funds[0];
  const old = structuredClone(w.currentVersion(f.id));
  const team = db.users.find((u) => u.role === "investment_team");
  w.command(team, { type: "prepare", id: f.id });
  const v = w.workflow.versions.at(-1);
  assert.throws(() => w.command(team, { type: "publish", id: v.id }));
  w.command(team, { type: "review", id: v.id });
  w.command(manager(), { type: "approve", id: v.id });
  assert.deepEqual(
    w.workflow.versions.find((v) => v.id === old.id),
    old,
  );
  assert.equal(w.currentVersion(f.id).number, 2);
});
test("RM private notes and assignments never become investor messages", () => {
  w.command(rm(), { type: "note", id: 2, text: "Internal follow-up", due: "2026-10-10" });
  assert.equal(w.view(investor()).notes.length, 0);
  w.command(manager(), { type: "assign", id: 2, target: 8 });
  assert.ok(!w.clientsFor(rm()).includes(2));
  assert.throws(() => w.command(rm(), { type: "note", id: 2, text: "No access" }));
});
test("company requests deduplicate and reject linking unrelated companies", () => {
  const before = w.workflow.requests.length;
  w.command(investor(), { type: "request", text: "Canva", amount: 100, currency: "SGD" });
  w.command(investor(), { type: "request", text: "CANVA" });
  assert.equal(w.workflow.requests.length, before + 1);
  const canva = w.workflow.requests.find((request) => request.key === "canva");
  assert.throws(() =>
    w.command(ops(), {
      type: "request-status",
      id: canva.id,
      status: "Opportunity available",
      target: db.funds[0].id,
    }),
  );
});
test("secondary indication does not change official holding values", () => {
  const before = structuredClone(db.holdings);
  w.command(manager(), {
    type: "secondary",
    id: db.funds[0].id,
    amount: 112,
    currency: "USD",
    text: "Illustrative source; different security",
  });
  assert.deepEqual(db.holdings, before);
});
test("database round-trip preserves records and advances ID counters", () => {
  const saved = db.exportDemoState();
  db.restoreDemoState(saved);
  assert.deepEqual(db.exportDemoState(), saved);
  assert.ok(db.nextHoldingId() > Math.max(...db.holdings.map((h) => h.id)));
});

test("revised published version gates allocation until exact investor acknowledgment", () => {
  const s = funded();
  const f = db.findFundById(s.fund_id);
  const team = db.users.find((u) => u.role === "investment_team");
  w.command(team, { type: "prepare", id: f.id });
  const v = w.workflow.versions.at(-1);
  w.command(team, { type: "review", id: v.id });
  w.command(manager(), { type: "approve", id: v.id });
  assert.throws(
    () => w.command(manager(), { type: "allocate", id: s.id, amount: 1000, price: 1000 }),
    /review/,
  );
  assert.throws(
    () => w.command(ops(), { type: "acknowledge", id: s.id, target: v.id }),
    /investor/,
  );
  w.command(investor(), { type: "acknowledge", id: s.id, target: v.id });
  w.command(manager(), { type: "allocate", id: s.id, amount: 1000, price: 1000 });
  assert.ok(w.signedVersion(s.id).id !== v.id);
});

test("new identities cannot read published documents before disclosure access", () => {
  const fresh = db.users.find((u) => u.id === 3);
  fresh.investor_segment = "partner_referred";
  assert.equal(w.view(fresh).versions.length, 0);
  investor().investor_segment = "partner_referred";
  assert.equal(
    w.view(investor()).versions.length,
    db.funds.filter((f) => f.state !== "draft").length,
  );
});

test("signed acknowledgments are immutable and profile patch cannot change identity", async () => {
  const signed = db.subscriptions.find((s) => s.investor_id === 2 && s.status === "allocated");
  assert.equal(
    (await request(`subscriptions/${signed.id}/acknowledgements/1`, investor(), "DELETE")).status,
    422,
  );
  await request("investor_profile", investor(), "PATCH", {
    investor_profile: { user_id: 11, id: 999, first_name: "Demo", onboarding_step: 0 },
  });
  assert.equal(db.findInvestorProfileByUserId(2).first_name, "Demo");
  assert.notEqual(db.findInvestorProfileByUserId(2).id, 999);
  assert.equal(db.findInvestorProfileByUserId(2).onboarding_step, 4);
});

test("drafts stay hidden, require manager approval, and appear only after Ops publication", async () => {
  investor().investor_segment = "partner_referred";
  const res = await request("funds", manager(), "POST", {
    fund: { company_name: "Canva", codename: "Canva Demo", target_amount: 100000 },
  });
  assert.equal(res.status, 200);
  const created = (await res.json()).fund;
  assert.equal(created.state, "draft");
  assert.equal((await request(`funds/${created.id}`, investor())).status, 404);
  const team = db.users.find((u) => u.role === "investment_team");
  w.command(team, { type: "prepare", id: created.id });
  const v = w.workflow.versions.at(-1);
  w.command(team, { type: "review", id: v.id });
  assert.throws(() => w.command(ops(), { type: "approve", id: v.id }), /role/);
  w.command(manager(), { type: "approve", id: v.id });
  assert.equal((await request(`funds/${created.id}`, investor())).status, 200);
});

test("EAM aggregate documents and reports stay within the adviser client book", async () => {
  const eam = db.users.find((user) => user.id === 4);
  const clientIds = new Set(
    db.adviserClients
      .filter((client) => client.eam_user_id === eam.id)
      .map((client) => client.investor_id),
  );
  const docs = await (await request("eam/documents", eam)).json();
  const reports = await (await request("eam/reports", eam)).json();
  assert.ok(docs.length > 0);
  assert.ok(reports.length > 0);
  for (const row of docs) {
    const owner = db.documents.find((document) => document.id === row.id)?.owner_id;
    assert.ok(clientIds.has(owner));
    assert.ok(row.fund_id);
  }
  for (const row of reports) {
    const owner = db.holdings.find((holding) => holding.id === row.id)?.investor_id;
    assert.ok(clientIds.has(owner));
  }
});

test("EAM revenue share is calculated on the subscription fee base", async () => {
  const eam = db.users.find((user) => user.id === 4);
  const data = await (await request("eam/revenue", eam)).json();
  assert.ok(data.transactions.length > 0);
  for (const row of data.transactions) {
    assert.equal(
      row.fee_base_amount,
      (row.allocated_volume * data.client_subscription_fee_pct) / 100,
    );
    assert.equal(row.share_amount, (row.fee_base_amount * data.revenue_share_pct) / 100);
  }
  assert.equal(
    data.pending,
    data.transactions
      .filter((row) => row.status === "pending")
      .reduce((sum, row) => sum + row.share_amount, 0),
  );
});

test("every client has one covering RM and references are issued only on approval", () => {
  const investors = db.adminInvestors();
  const issued = investors.filter((i) => i.reference && /^LC-\d{6}$/.test(i.reference));
  assert.equal(new Set(issued.map((i) => i.reference)).size, issued.length);
  for (const i of investors) {
    assert.equal(w.workflow.assignments.filter((a) => a.investorId === i.id).length, 1);
    assert.equal(Boolean(i.reference), i.verification_status === "approved");
  }
});
async function signup(email, ref) {
  const res = await handlers
    .find((h) => h.info.path === "*/api/v1/public/signup")
    .run({
      request: new Request("http://localhost:3000/api/v1/public/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: { email, password: "password1", password_confirmation: "password1" },
          ref,
        }),
      }),
      requestId: crypto.randomUUID(),
    });
  assert.equal(res.response.status, 200);
  return db.users.find((u) => u.email === email);
}
test("a referral link tags the client to the RM and partner and lands them in LUCA's book", async () => {
  const user = await signup("new.client@example.com", "meridian");
  const seed = db.findAdminInvestorSeed(user.id);
  assert.ok(seed, "the new signup is in LUCA's client list");
  assert.equal(seed.referral.partner_firm, "Meridian Capital Advisors");
  assert.equal(seed.referral.rm_id, 6);
  assert.equal(w.workflow.assignments.find((a) => a.investorId === user.id).staffId, 6);
  assert.equal(db.findInvestorProfileByUserId(user.id).channel, "eam_referred");
  assert.ok(
    seed.reference === undefined || seed.reference === null,
    "no reference before approval",
  );
  const partner = db.users.find(
    (u) =>
      u.has_eam_profile &&
      u.email ===
        db.partners.find((p) => p.firm_name === "Meridian Capital Advisors").contact_email,
  );
  assert.ok(
    db.adviserClients.some((c) => c.investor_id === user.id && c.eam_user_id === partner.id),
  );
  // The client cannot switch to direct after being referred.
  await request("investor_profile", user, "PATCH", { investor_profile: { channel: "direct" } });
  assert.equal(db.findInvestorProfileByUserId(user.id).channel, "eam_referred");
  // A plain signup is direct and still gets an RM.
  const direct = await signup("direct.client@example.com");
  assert.equal(db.findAdminInvestorSeed(direct.id).referral.via, "direct");
  assert.equal(w.workflow.assignments.filter((a) => a.investorId === direct.id).length, 1);
});
test("approval needs both checks, issues a sequential reference and reaches every portal", async () => {
  const user = await signup("review.client@example.com", "MERIDIAN");
  const fm = manager();
  const bad = await request(`admin/investors/${user.id}/review`, fm, "POST", {
    decision: "approve",
    identity: "verified",
    accreditation: "pending",
  });
  assert.equal(bad.status, 422);
  assert.equal(db.findAdminInvestorSeed(user.id).verification_status !== "approved", true);
  const before = db.nextReference();
  const ok = await request(`admin/investors/${user.id}/review`, fm, "POST", {
    decision: "approve",
    identity: "verified",
    accreditation: "accredited",
    note: "Passport and broker letter checked.",
  });
  assert.equal(ok.status, 200);
  const seed = db.findAdminInvestorSeed(user.id);
  assert.equal(seed.reference, before);
  assert.equal(seed.verification_status, "approved");
  assert.equal(db.findUserById(user.id).kyc_status, "approved");
  const status = await (await request("onboarding/review", user)).json();
  assert.equal(status.status, "approved");
  assert.equal(status.reference, before);
  const next = db.nextReference();
  assert.equal(Number(next.slice(3)), Number(before.slice(3)) + 1);
  // Events: each audience sees its own slice.
  const asRm = await (await request(`clients/${user.id}/events`, rm())).json();
  assert.ok(asRm.events.some((e) => e.kind === "approved"));
  const eam = db.users.find((u) => u.id === 4);
  const asPartner = await (await request(`clients/${user.id}/events`, eam)).json();
  assert.ok(asPartner.events.some((e) => e.kind === "approved"));
  const asOther = await (await request(`clients/${user.id}/events`, investor())).json();
  assert.equal(asOther.events.length, 0);
  const own = await (await request(`clients/${user.id}/events`, user)).json();
  assert.ok(own.events.some((e) => e.kind === "approved"));
  assert.ok(db.clientEvents.some((e) => e.investor_id === user.id && e.kind === "approved"));
  // The partner's client detail now carries the onboarding record, with no private notes.
  const detail = await (
    await request(`eam/clients/${db.adviserClients.find((c) => c.investor_id === user.id).id}`, eam)
  ).json();
  assert.equal(detail.onboarding.investor.reference, before);
  assert.equal(detail.onboarding.investor.decision_note, null);
});
test("a declined or incomplete client can reapply; requesting information opens a document request", async () => {
  const user = await signup("reapply.client@example.com");
  const fm = manager();
  const info = await request(`admin/investors/${user.id}/review`, fm, "POST", {
    decision: "request_info",
    note: "Please send a proof of address.",
    request_kinds: ["proof_of_address"],
  });
  assert.equal(info.status, 200);
  assert.equal((await (await request("onboarding/review", user)).json()).status, "needs_info");
  assert.ok(db.documentRequests.some((r) => r.investor_id === user.id));
  const declined = await request(`admin/investors/${user.id}/review`, fm, "POST", {
    decision: "decline",
    note: "Accreditation evidence has expired.",
  });
  assert.equal(declined.status, 200);
  const review = await (await request("onboarding/review", user)).json();
  assert.equal(review.status, "declined");
  assert.equal(review.can_reapply, true);
  assert.equal(
    (await request(`admin/investors/${user.id}/review`, user, "POST", { decision: "approve" }))
      .status,
    403,
  );
  assert.equal(
    (await request("onboarding/resubmit", user, "POST", { note: "New letter." })).status,
    200,
  );
  assert.equal((await (await request("onboarding/review", user)).json()).status, "in_review");
  assert.ok(db.clientEvents.some((e) => e.investor_id === user.id && e.kind === "reapplied"));
});
test("reassigning an RM is recorded and an RM only sees their own clients", async () => {
  const clients = await (await request("rm/clients", rm())).json();
  assert.ok(clients.clients.length > 0);
  assert.ok(clients.clients.every((c) => c.rm_id === rm().id));
  const mine = clients.clients[0];
  const other = db.users.find((u) => u.role === "rm" && u.id !== rm().id);
  assert.equal((await request(`rm/clients/${mine.id}/status`, other)).status, 403);
  w.command(manager(), { type: "assign", id: mine.id, target: other.id });
  assert.equal(w.workflow.assignments.find((a) => a.investorId === mine.id).staffId, other.id);
  assert.equal((await request(`rm/clients/${mine.id}/status`, rm())).status, 403);
  assert.equal((await request(`rm/clients/${mine.id}/status`, other)).status, 200);
});
test("institution review and information-response loop respect client ownership and holds", async () => {
  const adviser = db.users.find((u) => u.id === 4);
  const sub = db.subscriptions.find(
    (s) =>
      s.status === "institution_review" &&
      db.adviserClients.some(
        (c) => c.investor_id === s.investor_id && c.eam_user_id === adviser.id,
      ),
  );
  assert.ok(sub);
  assert.throws(() => w.command(rm(), { type: "institution-review", id: sub.id }), /institution/);
  db.findSubscriptionById(sub.id).on_hold = true;
  assert.throws(
    () => w.command(adviser, { type: "institution-review", id: sub.id }),
    /not available/,
  );
  db.findSubscriptionById(sub.id).on_hold = false;
  w.command(adviser, { type: "institution-review", id: sub.id });
  assert.equal(db.findSubscriptionById(sub.id).status, "under_luca_review");
  w.command(manager(), {
    type: "subscription-decision",
    id: sub.id,
    status: "information_requested",
    text: "Please explain the source of funds",
  });
  assert.throws(
    () =>
      w.command(investor(), { type: "respond-information", id: sub.id, text: "Wrong investor" }),
    /not found|Assigned|Investor/,
  );
  assert.throws(
    () => w.command(adviser, { type: "respond-information", id: sub.id, text: " " }),
    /description/,
  );
  // Failed commands restore records; reload the object reference.
  const current = db.findSubscriptionById(sub.id);
  const owner = { ...investor(), id: current.investor_id, email: current.investor_email };
  db.users.push(owner);
  const result = await request(`subscriptions/${current.id}/information_response`, owner, "POST", {
    text: "Proceeds from employment savings",
  });
  assert.equal(result.status, 200);
  const updated = db.findSubscriptionById(current.id);
  assert.equal(updated.status, "under_luca_review");
  assert.equal(updated.information_response_note, "Proceeds from employment savings");
  assert.ok(updated.information_responded_at);
  assert.equal(
    (
      await request(`subscriptions/${updated.id}/information_response`, owner, "POST", {
        text: "Duplicate",
      })
    ).status,
    422,
  );
  w.command(manager(), { type: "subscription-decision", id: updated.id, status: "approved" });
  assert.equal(db.findSubscriptionById(updated.id).status, "approved");
});

test("validated referral binds new client to the matching institution without granting eligibility", async () => {
  const fresh = db.users.find((u) => u.id === 3);
  const invalid = await request("investor_profile", fresh, "PATCH", {
    investor_profile: { channel: "eam_referred", referral_code: "INVALID" },
  });
  assert.equal(invalid.status, 422);
  assert.ok(!db.adviserClients.some((c) => c.investor_id === fresh.id));
  const valid = await request("investor_profile", fresh, "PATCH", {
    investor_profile: { channel: "eam_referred", referral_code: "meridian" },
  });
  assert.equal(valid.status, 200);
  assert.equal(db.findInvestorProfileByUserId(fresh.id).eam_firm, "Meridian Capital Advisors");
  assert.ok(db.adviserClients.some((c) => c.investor_id === fresh.id && c.eam_user_id === 4));
  assert.equal(fresh.kyc_status, "not_started");
  assert.equal((await request("funds", fresh)).status, 403);
  assert.equal(
    (
      await request("investor_profile", fresh, "PATCH", {
        investor_profile: { referral_code: "STRAITS-FO" },
      })
    ).status,
    422,
  );
});

test("reported NAV history is investor scoped and backdated observations do not replace newer values", async () => {
  const h = db.holdings.find((h) => h.investor_id === investor().id && h.state !== "realized");
  const old = Number(h.current_nav);
  w.command(manager(), {
    type: "valuation",
    id: h.id,
    amount: old + 1000,
    text: "Latest report",
    due: new Date().toISOString(),
  });
  w.command(manager(), {
    type: "valuation",
    id: h.id,
    amount: old - 1000,
    text: "Earlier report",
    due: "2025-12-01T00:00:00.000Z",
  });
  assert.equal(Number(db.holdings.find((row) => row.id === h.id).current_nav), old + 1000);
  const result = await (await request("portfolio/history", investor())).json();
  const latest = result.history.at(-1);
  assert.equal(
    latest.nav,
    db.holdings
      .filter((row) => row.investor_id === investor().id && row.state !== "realized")
      .reduce((sum, row) => sum + Number(row.current_nav), 0),
  );
  const foreign = db.users.find((u) => u.id === 3);
  assert.equal((await (await request("portfolio/history", foreign)).json()).history.at(-1).nav, 0);
});

test("readiness blockers are exposed and hold prevents approval or allocation", () => {
  const s = funded();
  w.command(manager(), { type: "subscription-hold", id: s.id, status: "held" });
  assert.ok(
    w
      .view(manager())
      .subscriptions.find((row) => row.id === s.id)
      .allocationBlockers.some((text) => text.includes("hold")),
  );
  assert.throws(
    () =>
      w.command(manager(), { type: "allocate", id: s.id, amount: Number(s.amount), price: 100 }),
    /hold/,
  );
  w.command(manager(), { type: "subscription-hold", id: s.id, status: "released" });
  assert.equal(w.investmentBlockers(db.findSubscriptionById(s.id)).length, 0);
});

test("funding top-up declaration requires confirmed shortfall and does not create cash", () => {
  const sub = db.subscriptions.find(
    (s) => s.investor_id === investor().id && s.status === "awaiting_funds",
  );
  const reference = `partial-${sub.id}`;
  w.command(ops(), { type: "receipt", id: sub.id, amount: 1000, currency: "USD", text: reference });
  const receipt = w.workflow.receipts.find((r) => r.reference === reference);
  w.command(ops(), { type: "match", id: sub.id, target: receipt.id });
  const count = w.workflow.receipts.length;
  w.command(investor(), { type: "declare-topup", id: sub.id });
  assert.equal(w.workflow.receipts.length, count);
  assert.equal(w.matched(sub.id), 1000);
  assert.ok(db.findSubscriptionById(sub.id).topup_declared_at);
  assert.throws(
    () => w.command(investor(), { type: "declare-topup", id: sub.id }),
    /already awaiting/,
  );
});

test("onboarding document submission preserves bytes, reaches LUCA and grants no eligibility", async () => {
  const user = db.users.find((u) => u.id === 3);
  const content = "data:application/pdf;base64,JVBERi0xLjQ=";
  const uploaded = await request("onboarding/documents", user, "POST", {
    name: "fictional-identity.pdf",
    kind: "passport",
    file_data_url: content,
  });
  assert.equal(uploaded.status, 200);
  const id = (await uploaded.json()).document.id;
  assert.equal(db.documents.find((doc) => doc.id === id).file_data_url, content);
  assert.ok(db.verificationDocumentsByInvestor[user.id].some((doc) => doc.id === id));
  assert.equal(user.kyc_status, "not_started");
  const luca = await (await request(`admin/investors/${user.id}`, manager())).json();
  assert.ok(luca.verification_documents.some((doc) => doc.id === id));
  const foreign = await (await request("onboarding/documents", investor())).json();
  assert.ok(!foreign.documents.some((doc) => doc.id === id));
  assert.equal(
    (
      await request("onboarding/documents", user, "POST", {
        name: "bad",
        kind: "passport",
        file_data_url: "invalid",
      })
    ).status,
    422,
  );
});

test("custom commercial fee is displayed, saved and retained through allocation and returns", async () => {
  const user = investor();
  db.investorPricing.push({
    id: 999,
    fund_id: 1,
    investor_id: user.id,
    price: "80",
    subscription_fee_pct: "2.5",
    management_fee_pct: null,
    carried_interest_pct: null,
    implied_valuation: null,
    note: "Fictional custom terms",
    updated_at: new Date().toISOString(),
  });
  await request("demo/investor-segment", user, "PATCH", { segment: "independent" });
  const displayed = (await (await request("funds/1", user)).json()).fund;
  assert.equal(Number(displayed.subscription_fee_pct), 3.5);
  const response = await request("subscriptions", user, "POST", { fund_id: 1, amount: "25000" });
  assert.equal(response.status, 200);
  const created = (await response.json()).subscription;
  assert.equal(Number(created.subscription_fee), 875);
  assert.equal(Number(created.effective_terms.price), 80);
  assert.equal(created.commercial_terms.subscriptionFeePct, displayed.subscription_fee_pct);
  db.investorPricing.find((p) => p.id === 999).subscription_fee_pct = "1";
  await request("demo/investor-segment", user, "PATCH", { segment: "partner_referred" });
  const saved = (await (await request(`subscriptions/${created.id}`, user)).json()).subscription;
  assert.equal(Number(saved.effective_terms.subscription_fee_pct), 3.5);
  assert.equal(Number(saved.subscription_fee), 875);
  const sub = db.findSubscriptionById(created.id);
  w.recordSignature(sub, "Fictional investor signature");
  sub.status = "awaiting_funds";
  w.command(ops(), { type: "receipt", id: sub.id, amount: 25875, text: "CUSTOM-FEE-RECEIPT" });
  const receipt = w.workflow.receipts.find((r) => r.reference === "CUSTOM-FEE-RECEIPT");
  w.command(ops(), { type: "match", id: sub.id, target: receipt.id });
  w.command(manager(), { type: "allocate", id: sub.id, amount: 12500, price: 100 });
  const allocation = w.workflow.allocations.find((a) => a.subscriptionId === sub.id);
  assert.equal(allocation.fee, 437.5);
  assert.equal(w.workflow.returns.find((r) => r.subscriptionId === sub.id).amount, 12937.5);
  w.command(ops(), { type: "issue", id: sub.id });
  assert.equal(
    db.holdings.find((h) => h.id === db.findSubscriptionById(sub.id)._convertedToHoldingId).units,
    "125.00",
  );
});

test("allocation and issuance recheck eligibility, signatures and insufficient confirmed cash", () => {
  const sub = funded();
  let user = db.findUserById(sub.investor_id);
  user.kyc_status = "pending";
  assert.throws(
    () => w.command(manager(), { type: "allocate", id: sub.id, amount: 10000, price: 100 }),
    /eligibility/,
  );
  user = db.findUserById(sub.investor_id);
  user.kyc_status = "approved";
  const signature = w.workflow.signatures.find((row) => row.subscriptionId === sub.id);
  w.workflow.signatures = w.workflow.signatures.filter((row) => row.subscriptionId !== sub.id);
  assert.throws(
    () => w.command(manager(), { type: "allocate", id: sub.id, amount: 10000, price: 100 }),
    /signature/,
  );
  w.workflow.signatures.push(signature);
  w.command(manager(), { type: "allocate", id: sub.id, amount: 10000, price: 100 });
  assert.equal(db.toAdminSubscription(db.findSubscriptionById(sub.id)).holding_id, null);
  user = db.findUserById(sub.investor_id);
  user.kyc_status = "pending";
  assert.throws(() => w.command(ops(), { type: "issue", id: sub.id }), /eligibility/);
  user = db.findUserById(sub.investor_id);
  user.kyc_status = "approved";
  const receipt = w.workflow.receipts.find((row) => row.subscriptionId === sub.id && row.matched);
  // Simulate an inconsistent restored funding record; issuance must still fail closed.
  receipt.amount = 100;
  assert.throws(() => w.command(ops(), { type: "issue", id: sub.id }), /Confirmed funding/);
  assert.equal(db.findSubscriptionById(sub.id)._convertedToHoldingId, null);
});

test("communications stay unread until an actual direct recipient reads; scheduled messages cannot be read", async () => {
  const response = await request("admin/communications", manager(), "POST", {
    subject: "Fictional update",
    body: "Audit test",
    investor_ids: [2, 3],
    routing: "direct",
  });
  assert.equal(response.status, 200);
  const id = (await response.json()).communication.id;
  const recipients = db.communicationRecipients.filter((r) => r.communication_id === id);
  assert.equal(recipients.length, 2);
  assert.ok(recipients.every((r) => r.delivered_at && r.opened_at === null));
  assert.ok(
    (await (await request("messages", investor())).json()).messages.some(
      (m) => m.id === id && !m.read,
    ),
  );
  assert.equal((await request(`messages/${id}/read`, investor(), "POST")).status, 200);
  const readAt = recipients.find((r) => r.investor_id === 2).opened_at;
  assert.ok(readAt);
  await request(`messages/${id}/read`, investor(), "POST");
  assert.equal(recipients.find((r) => r.investor_id === 2).opened_at, readAt);
  assert.equal(recipients.find((r) => r.investor_id === 3).opened_at, null);
  const scheduled = (
    await (
      await request("admin/communications", manager(), "POST", {
        subject: "Future fictional update",
        body: "Scheduled only",
        investor_ids: [2],
        routing: "direct",
        send_at: new Date(Date.now() + 86400000).toISOString(),
      })
    ).json()
  ).communication;
  assert.equal((await request(`messages/${scheduled.id}/read`, investor(), "POST")).status, 404);
});

test("LUCA can hold an allocated unissued subscription and release it without changing allocation", async () => {
  const sub = funded();
  w.command(manager(), { type: "allocate", id: sub.id, amount: Number(sub.amount), price: 100 });
  assert.equal(
    (await request(`admin/subscriptions/${sub.id}/hold`, manager(), "PATCH", { on_hold: true }))
      .status,
    200,
  );
  assert.equal(db.findSubscriptionById(sub.id).status, "allocated");
  assert.throws(() => w.command(ops(), { type: "issue", id: sub.id }), /hold/);
  assert.equal(
    (await request(`admin/subscriptions/${sub.id}/hold`, manager(), "PATCH", { on_hold: false }))
      .status,
    200,
  );
  w.command(ops(), { type: "issue", id: sub.id });
  assert.ok(db.findSubscriptionById(sub.id)._convertedToHoldingId);
  assert.equal(
    (await request(`admin/subscriptions/${sub.id}/hold`, manager(), "PATCH", { on_hold: true }))
      .status,
    422,
  );
  assert.equal(db.findSubscriptionById(sub.id).on_hold, false);
});

test("existing declaration API supports a confirmed shortfall without recording cash", async () => {
  const sub = db.subscriptions.find((s) => s.investor_id === 2 && s.status === "awaiting_funds");
  w.command(ops(), { type: "receipt", id: sub.id, amount: 100, text: "API-TOPUP-RECEIPT" });
  w.command(ops(), {
    type: "match",
    id: sub.id,
    target: w.workflow.receipts.find((r) => r.reference === "API-TOPUP-RECEIPT").id,
  });
  const count = w.workflow.receipts.length;
  assert.equal(
    (await request(`subscriptions/${sub.id}`, investor(), "PATCH", { payment_declared: true }))
      .status,
    200,
  );
  assert.equal(w.workflow.receipts.length, count);
  assert.equal(w.matched(sub.id), 100);
  assert.equal(
    (await request(`subscriptions/${sub.id}`, investor(), "PATCH", { payment_declared: true }))
      .status,
    422,
  );
});

test("Investment Team publishes only after Fund Manager approval and cannot access client records", async () => {
  const team = db.users.find((u) => u.role === "investment_team");
  assert.deepEqual(w.clientsFor(team), []);
  assert.equal(w.view(team).subscriptions.length, 0);
  assert.equal(w.view(team).notes.length, 0);
  assert.equal(
    (await request("funds/1", team, "PATCH", { fund: { state: "closed" } })).status,
    403,
  );
  w.command(team, { type: "prepare", id: 1 });
  const version = w.workflow.versions.at(-1);
  w.command(team, { type: "review", id: version.id });
  assert.throws(() => w.command(team, { type: "approve", id: version.id }));
  assert.throws(() => w.command(team, { type: "publish", id: version.id }));
  assert.throws(() =>
    w.command(team, { type: "allocate", id: funded().id, amount: 100, price: 100 }),
  );
  assert.equal((await request("admin/investors", team)).status, 403);
  w.command(manager(), { type: "approve", id: version.id });
  assert.equal(w.currentVersion(1).id, version.id);
});

test("Fund Manager has RM recommendations and private follow-ups", () => {
  w.command(manager(), { type: "note", id: 2, text: "Call about the offering", due: "2026-10-10" });
  assert.equal(w.view(manager()).notes.at(-1).text, "Call about the offering");
  assert.equal(w.view(investor()).notes.length, 0);
  w.command(manager(), {
    type: "highlight",
    id: 2,
    target: 1,
    text: "Consider this published offering",
  });
  const recommendation = w.view(investor()).highlights.at(-1);
  assert.equal(recommendation.staffId, manager().id);
  w.command(investor(), { type: "open-highlight", id: recommendation.id });
  assert.ok(w.view(manager()).highlights.find((h) => h.id === recommendation.id).openedAt);
});

test("LUCA investor requests are email-only, while updates use email and inbox", async () => {
  for (const purpose of ["request", "remind_sign", "remind_fund", "update"]) {
    const response = await request("admin/communications", manager(), "POST", {
      subject: `Delivery ${purpose}`,
      body: "Demo message",
      investor_ids: [2],
      purpose,
      delivery_channels: ["inbox"],
      routing: "direct",
    });
    assert.equal(response.status, 200);
    const communication = (await response.json()).communication;
    const emailOnly = purpose !== "update";
    assert.deepEqual(communication.delivery_channels, emailOnly ? ["email"] : ["email", "inbox"]);
    const recipient = db.communicationRecipients.find(
      (r) => r.communication_id === communication.id,
    );
    assert.equal(recipient.email_status, "pending_integration");
    assert.equal(Boolean(recipient.delivered_at), !emailOnly);
    const messages = (await (await request("messages", investor())).json()).messages;
    assert.equal(
      messages.some((m) => m.id === communication.id),
      !emailOnly,
    );
    assert.equal(
      (await request(`messages/${communication.id}/read`, investor(), "POST")).status,
      emailOnly ? 404 : 200,
    );
  }
});

test("restoring an existing demo adds the Investment Team without resetting client data", () => {
  const saved = db.exportDemoState();
  saved.arrays.users = saved.arrays.users.filter((u) => u.role !== "investment_team");
  saved.arrays.users.find((u) => u.id === 2).email = "preserved@example.com";
  db.restoreDemoState(saved);
  assert.equal(db.users.find((u) => u.id === 2).email, "preserved@example.com");
  assert.equal(db.users.filter((u) => u.role === "investment_team").length, 1);
});

test("only the Fund Manager publishes: the Investment Team submits and approval puts the offering live", () => {
  const team = db.users.find((u) => u.role === "investment_team");
  assert.throws(() => w.command(ops(), { type: "prepare", id: 1 }));
  w.command(team, { type: "prepare", id: 1 });
  const version = w.workflow.versions.at(-1);
  w.command(team, { type: "review", id: version.id, text: "Updated risks." });
  assert.equal(w.workflow.versions.at(-1).status, "review");
  assert.equal(w.workflow.versions.at(-1).submittedBy, team.id);
  for (const type of ["approve", "publish", "send-back"])
    for (const actor of [team, ops(), rm()])
      assert.throws(() => w.command(actor, { type, id: version.id, text: "x" }));
  w.command(manager(), { type: "approve", id: version.id });
  assert.equal(w.currentVersion(1).id, version.id);
  assert.equal(w.currentVersion(1).decision.outcome, "published");
});

test("Fund Manager can return a submitted version with a reason", () => {
  const team = db.users.find((u) => u.role === "investment_team");
  w.command(team, { type: "prepare", id: 1 });
  const version = w.workflow.versions.at(-1);
  w.command(team, { type: "review", id: version.id });
  assert.throws(() => w.command(manager(), { type: "send-back", id: version.id }));
  w.command(manager(), { type: "send-back", id: version.id, text: "Fee wording unclear." });
  const after = w.workflow.versions.find((v) => v.id === version.id);
  assert.equal(after.status, "draft");
  assert.equal(after.decision.outcome, "returned");
  assert.notEqual(w.currentVersion(1).id, version.id);
});

test("Ops deal edits are visible to the Investment Team but not the Fund Manager", async () => {
  const team = db.users.find((u) => u.role === "investment_team");
  const res = await request("funds/1", ops(), "PATCH", { fund: { hook: "Edited by Ops" } });
  assert.equal(res.status, 200);
  assert.equal(db.findFundById(1).hook, "Edited by Ops");
  const seenBy = (user) => w.view(user).dealChanges.filter((c) => c.fundId === 1);
  assert.equal(seenBy(team).length, 1);
  assert.equal(seenBy(team)[0].byRole, "ops");
  assert.equal(seenBy(ops()).length, 1);
  assert.equal(seenBy(manager()).length, 0);
  assert.equal(seenBy(rm()).length, 0);
  assert.equal(seenBy(investor()).length, 0);
  // Ops activity does not reach the Fund Manager's audit or activity feed either.
  assert.ok(!w.view(manager()).events.some((e) => /ops/i.test(e.label) && /edit/i.test(e.label)));
  // What the Investment Team submits is what the Fund Manager reviews, without the Ops attribution.
  await request("funds/1", team, "PATCH", { fund: { descriptor: "Team wording" } });
  w.command(team, { type: "prepare", id: 1 });
  const version = w.workflow.versions.at(-1);
  w.command(team, { type: "review", id: version.id });
  assert.ok(version.changed.length > 0);
  assert.ok(seenBy(manager()).every((c) => c.byRole !== "ops"));
  assert.equal(seenBy(team).find((c) => c.byRole === "ops").includedInVersion, version.id);
  assert.ok(seenBy(manager()).some((c) => c.byRole === "investment_team"));
});

test("while a version is with the Fund Manager only the Fund Manager can edit it", async () => {
  const team = db.users.find((u) => u.role === "investment_team");
  w.command(team, { type: "prepare", id: 1 });
  const version = w.workflow.versions.at(-1);
  w.command(team, { type: "review", id: version.id });
  assert.equal((await request("funds/1", team, "PATCH", { fund: { hook: "Late" } })).status, 422);
  assert.equal((await request("funds/1", ops(), "PATCH", { fund: { hook: "Late" } })).status, 422);
  assert.equal(
    (await request("funds/1", manager(), "PATCH", { fund: { hook: "Manager wording" } })).status,
    200,
  );
  w.command(manager(), { type: "approve", id: version.id });
  assert.equal(w.currentVersion(1).snapshot.hook, "Manager wording");
});

test("restoring a demo without Ops preserves client data and restores operational access", () => {
  const saved = db.exportDemoState();
  saved.arrays.users = saved.arrays.users.filter((u) => u.role !== "ops");
  saved.arrays.users.find((u) => u.id === 2).email = "preserved@example.com";
  db.restoreDemoState(saved);
  assert.equal(ops().email, "ops@akula.vc");
  assert.equal(investor().email, "preserved@example.com");
  db.restoreDemoState(db.exportDemoState());
  assert.equal(db.users.filter((u) => u.role === "ops").length, 1);
});

const PDF = "data:application/pdf;base64,JVBERi0xLjQK";
const newClient = (overrides = {}) => ({
  email: "client.one@example.com",
  first_name: "Clara",
  last_name: "Weston",
  nationality: "British",
  date_of_birth: "1980-02-03",
  country: "United Kingdom",
  ...overrides,
});

test("RM prepares an account that is assigned to them, invitation-only and audited", async () => {
  const before = w.workflow.events.length;
  const res = await request("rm/clients", rm(), "POST", newClient());
  assert.equal(res.status, 201);
  const { client } = await res.json();
  const created = db.findUserById(client.id);
  assert.equal(created.role, "investor");
  assert.equal(created.password, "");
  assert.ok(created.invite_token);
  assert.equal(client.stage, "invited");
  assert.ok(w.clientsFor(rm()).includes(client.id));
  assert.ok(!w.clientsFor(db.users.find((u) => u.id === 8)).includes(client.id));
  assert.ok(db.adminInvestors().some((i) => i.id === client.id && i.prepared_by_rm));
  assert.ok(w.workflow.events.length > before);
  // The password-less account cannot sign in until the client activates it.
  const login = await request("login", investor(), "POST", {
    user: { email: "client.one@example.com", password: "anything" },
  });
  assert.equal(login.status, 401);
});

test("RM onboarding rejects other roles, duplicates, other RMs' clients and invalid input", async () => {
  assert.equal((await request("rm/clients", investor(), "POST", newClient())).status, 403);
  assert.equal((await request("rm/clients", ops(), "POST", newClient())).status, 403);
  assert.equal(
    (await request("rm/clients", rm(), "POST", newClient({ email: "bad" }))).status,
    422,
  );
  assert.equal(
    (await request("rm/clients", rm(), "POST", newClient({ date_of_birth: "2015-01-01" }))).status,
    422,
  );
  assert.equal(
    (await request("rm/clients", rm(), "POST", newClient({ email: "investor@akula.vc" }))).status,
    422,
  );
  const { client } = await (await request("rm/clients", rm(), "POST", newClient())).json();
  const other = db.users.find((u) => u.id === 8);
  assert.equal((await request(`rm/clients/${client.id}/onboarding`, other)).status, 403);
  assert.equal((await request("rm/clients", rm(), "POST", newClient())).status, 422);
  assert.equal((await request(`rm/clients/${client.id}/onboarding`, manager())).status, 200);
});

test("RM-supplied documents are attributed, confirmed only by the investor and never auto-approved", async () => {
  const { client } = await (await request("rm/clients", rm(), "POST", newClient())).json();
  const bad = await request(`rm/clients/${client.id}/documents`, rm(), "POST", {
    name: "agreement.pdf",
    kind: "agreement",
    file_data_url: PDF,
  });
  assert.equal(bad.status, 422);
  const ok = await request(`rm/clients/${client.id}/documents`, rm(), "POST", {
    name: "passport.pdf",
    kind: "passport",
    file_data_url: PDF,
  });
  assert.equal(ok.status, 201);
  const row = db.documents.find((d) => d.owner_id === client.id);
  assert.equal(row.uploaded_by.role, "rm");
  assert.equal(row.confirmed_at, null);
  assert.equal(db.findAdminInvestorSeed(client.id).verification_status, "pending");

  // Activate, then confirm as the investor.
  const token = db.findUserById(client.id).invite_token;
  const activated = await request("public/activate", investor(), "POST", {
    token,
    password: "a-long-password",
    password_confirmation: "a-long-password",
  });
  assert.equal(activated.status, 200);
  assert.equal(db.findUserById(client.id).invite_token, null);
  const reuse = await request("public/activate", investor(), "POST", {
    token,
    password: "another-password",
    password_confirmation: "another-password",
  });
  assert.equal(reuse.status, 404);
  const me = db.findUserById(client.id);
  const docs = await (await request("onboarding/documents", me)).json();
  assert.equal(docs.documents[0].uploaded_by.role, "rm");
  assert.equal((await request(`onboarding/documents/${row.id}/confirm`, me, "POST")).status, 200);
  assert.ok(db.documents.find((d) => d.id === row.id).confirmed_at);
  // The RM can no longer remove a document the investor has confirmed.
  assert.equal(
    (await request(`rm/clients/${client.id}/documents/${row.id}`, rm(), "DELETE")).status,
    422,
  );
  // Another investor cannot confirm it.
  assert.equal(
    (await request(`onboarding/documents/${row.id}/confirm`, investor(), "POST")).status,
    404,
  );
});

test("investor's own declarations stay with the investor; RM edits lock after confirmation", async () => {
  const { client } = await (await request("rm/clients", rm(), "POST", newClient())).json();
  const user = db.findUserById(client.id);
  const profile = db.findInvestorProfileByUserId(client.id);
  // Nothing the RM does completes eligibility, NDA, KYC or consents.
  await request(`rm/clients/${client.id}/onboarding`, rm(), "PATCH", { phone: "+441234567890" });
  assert.equal(profile.eligibility_confirmed_at, null);
  assert.equal(user.nda_status, "not_started");
  assert.equal(user.kyc_status, "not_started");
  assert.equal(profile.phone, "+441234567890");

  user.password = "a-long-password";
  user.invite_token = null;
  assert.equal(profile.prepared_by_rm.confirmed_at, null);
  await request("investor_profile", user, "PATCH", { investor_profile: { onboarding_step: 4 } });
  assert.ok(profile.prepared_by_rm.confirmed_at);
  const locked = await request(`rm/clients/${client.id}/onboarding`, rm(), "PATCH", {
    phone: "+440000000000",
  });
  assert.equal(locked.status, 422);
  assert.equal(profile.phone, "+441234567890");
  const detail = await (await request(`rm/clients/${client.id}/onboarding`, rm())).json();
  assert.equal(detail.editable, false);
  assert.equal(detail.client.stage, "verifying");
});

test("an RM-referred client is partner-referred, tagged to the RM, and cannot switch to direct", async () => {
  const { client } = await (await request("rm/clients", rm(), "POST", newClient())).json();
  const user = db.findUserById(client.id);
  const profile = db.findInvestorProfileByUserId(client.id);
  assert.equal(profile.channel, "eam_referred");
  assert.equal(profile.prepared_by_rm.rm_id, rm().id);
  assert.ok(
    w.workflow.assignments.some((a) => a.investorId === client.id && a.staffId === rm().id),
  );
  assert.equal(
    (await (await request("demo/investor-segment", user)).json()).segment,
    "partner_referred",
  );
  // The client keeps the channel when they continue; no partner code is required.
  const keep = await request("investor_profile", user, "PATCH", {
    investor_profile: { channel: "eam_referred" },
  });
  assert.equal(keep.status, 200);
  const direct = await request("investor_profile", user, "PATCH", {
    investor_profile: { channel: "direct" },
  });
  assert.equal(direct.status, 422);
  assert.equal(profile.channel, "eam_referred");
});

test("Fund Manager review shows what changed against the live version, including their own edits", async () => {
  const team = db.users.find((u) => u.role === "investment_team");
  await request("funds/1", team, "PATCH", { fund: { hook: "New headline", price: "199.00" } });
  w.command(team, { type: "prepare", id: 1 });
  const version = w.workflow.versions.at(-1);
  w.command(team, { type: "review", id: version.id, text: "Pricing refresh." });
  await request("funds/1", manager(), "PATCH", { fund: { min_subscription: "40000" } });
  const seen = w.view(manager()).versions.find((v) => v.id === version.id);
  const row = (label) => seen.diff.find((r) => r.label === label);
  assert.equal(row("Headline").after, "New headline");
  assert.equal(row("Price per unit").material, true);
  assert.equal(row("Price per unit").editedByManager, false);
  assert.equal(row("Minimum subscription").editedByManager, true);
  assert.equal(seen.impact.newOffering, false);
  assert.ok(seen.impact.subscribers >= 0);
  // The Fund Manager sees no Ops attribution anywhere in the review.
  assert.ok(!JSON.stringify(seen).toLowerCase().includes('"byrole":"ops"'));
  assert.ok(!w.view(rm()).versions.some((v) => v.diff));
});

test("a never-published offering is reviewed against a completeness checklist", () => {
  const team = db.users.find((u) => u.role === "investment_team");
  const draft = db.funds.find((f) => f.state === "draft");
  const version = w.workflow.versions.find((v) => v.fundId === draft.id && v.status === "draft");
  w.command(team, { type: "review", id: version.id });
  const seen = w.view(manager()).versions.find((v) => v.id === version.id);
  assert.equal(seen.impact.newOffering, true);
  assert.ok(seen.checklist.length > 0);
});

test("Fund Manager stages their own edits for review in one step, and only they can", async () => {
  const team = db.users.find((u) => u.role === "investment_team");
  assert.equal(w.view(manager()).unpublished.length, 0);
  await request("funds/1", manager(), "PATCH", { fund: { hook: "Manager headline" } });
  assert.deepEqual(w.view(manager()).unpublished.find((u) => u.fundId === 1)?.fields, ["Headline"]);
  for (const actor of [team, ops(), rm()])
    assert.throws(() => w.command(actor, { type: "stage", id: 1 }));
  w.command(manager(), { type: "stage", id: 1 });
  const staged = w.workflow.versions.at(-1);
  assert.equal(staged.status, "review");
  assert.equal(staged.submittedBy, manager().id);
  assert.equal(w.view(manager()).unpublished.length, 0);
  w.command(manager(), { type: "approve", id: staged.id });
  assert.equal(w.currentVersion(1).snapshot.hook, "Manager headline");
});

test("a project holds several funds that share the company; only the new fund starts as a draft", async () => {
  const team = db.users.find((u) => u.role === "investment_team");
  const helios = db.funds.filter((f) => f.asset.id === db.findFundById(1).asset.id);
  assert.ok(helios.length >= 2);
  assert.ok(helios.every((f) => f.codename === "Project Helios"));
  // A draft sibling is invisible to investors.
  const shelf = await (await request("funds", investor())).json();
  assert.ok(!shelf.funds.some((f) => f.id !== 1 && f.asset.id === db.findFundById(1).asset.id));
  assert.equal(
    (await request(`funds/${helios.find((f) => f.id !== 1).id}`, investor())).status,
    404,
  );
  // Add a fund to the project.
  const added = await request("funds", team, "POST", {
    fund: { project_fund_id: 1, fund_label: "SPV III", target_amount: 2000000 },
  });
  assert.equal(added.status, 200);
  const fund = (await added.json()).fund;
  assert.equal(fund.name, "Solara Grid SPV III");
  assert.equal(fund.asset.id, db.findFundById(1).asset.id);
  assert.equal(fund.state, "draft");
  assert.equal(fund.supply_allocated, "0");
  assert.equal(
    (await request("funds", team, "POST", { fund: { project_fund_id: 1 } })).status,
    422,
  );
  assert.equal(
    (
      await request("funds", investor(), "POST", {
        fund: { project_fund_id: 1, fund_label: "x", target_amount: 1 },
      })
    ).status,
    401,
  );
  // Company information is shared across the project's funds.
  await request("funds/1", team, "PATCH", { fund: { asset: { tagline: "Shared tagline" } } });
  assert.equal(db.findFundById(fund.id).asset.tagline, "Shared tagline");
});

test("each fund has one fee schedule, edited with the fund and shown the same to every investor", async () => {
  const team = db.users.find((u) => u.role === "investment_team");
  assert.equal(db.investorPricing.length, 0);
  assert.equal(
    (await request("funds/1", team, "PATCH", { fund: { management_fee_pct: "101" } })).status,
    422,
  );
  assert.equal(
    (
      await request("funds/1", team, "PATCH", {
        fund: { subscription_fee_pct: "3", management_fee_pct: "2", carried_interest_pct: "20" },
      })
    ).status,
    200,
  );
  const fund = db.findFundById(1);
  assert.deepEqual(
    [fund.subscription_fee_pct, fund.management_fee_pct, fund.carried_interest_pct],
    ["3", "2", "20"],
  );
});

test("partner book adds up: partner = projects = funds = clients, and an RM only sees their own clients", () => {
  const { partners, direct } = buildPartnerBook(w.view(manager()));
  assert.ok(partners.length >= 2);
  for (const p of partners) {
    const sum = (rows, key) => Math.round(rows.reduce((n, r) => n + r[key], 0));
    for (const key of ["committed", "funded", "allocated"]) {
      assert.equal(sum(p.projects, key), Math.round(p[key]));
      assert.equal(sum(p.clients, key), Math.round(p[key]));
      for (const project of p.projects)
        assert.equal(sum(project.funds, key), Math.round(project[key]));
    }
    // Cash can only be confirmed against a live commitment, and allocation only against cash.
    assert.ok(p.funded <= p.committed + 0.01);
  }
  assert.ok(direct.clientCount >= 0);
  const mine = buildPartnerBook(w.view(rm()));
  const everyone = new Set(partners.flatMap((p) => p.clients.map((c) => c.id)));
  for (const p of mine.partners) for (const c of p.clients) assert.ok(everyone.has(c.id));
  assert.ok(
    mine.partners.reduce((n, p) => n + p.clientCount, 0) <=
      partners.reduce((n, p) => n + p.clientCount, 0),
  );
});

test("analytics are calculated from the records and stay consistent across periods", () => {
  const input = {
    subscriptions: db.subscriptions.map(db.toAdminSubscription),
    funds: db.funds,
    workflow: w.view(manager()),
    partners: db.partners.map(db.partnerSummary),
  };
  const all = buildAnalytics(input, "all");
  const sum = (rows, key) => Math.round(rows.reduce((n, r) => n + r[key], 0));
  for (const key of ["committed", "funded", "allocated"])
    assert.equal(sum(all.capital, key), Math.round(all.totals[key]));
  assert.ok(all.totals.funded <= all.totals.committed + 0.01);
  assert.equal(sum(all.sources, "committed"), Math.round(all.totals.committed));
  assert.ok(
    all.concentration.top1 <= all.concentration.top5 &&
      all.concentration.top5 <= all.concentration.top10,
  );
  assert.ok(all.concentration.top10 <= 1.0001);
  for (const s of all.speed) assert.ok(s.median === null || s.median >= 0);
  // A shorter period can only ever show less.
  const recent = buildAnalytics(input, "30d");
  assert.ok(recent.fees.subscriptionFees <= all.fees.subscriptionFees + 0.01);
});

test("fees link up: schedule frozen on the application, allocation fee, partner share and net income", () => {
  const input = {
    subscriptions: db.subscriptions.map(db.toAdminSubscription),
    funds: db.funds,
    workflow: w.view(manager()),
    partners: db.partners.map(db.partnerSummary),
  };
  const all = buildAnalytics(input, "all");
  // Subscription fees equal the sum of the fees recorded on the allocations.
  const recorded = w.workflow.allocations.filter((a) => !a.voided).reduce((n, a) => n + a.fee, 0);
  assert.ok(Math.abs(all.fees.subscriptionFees - recorded) < 0.01);
  // What we keep is what we charge less what we share with partners.
  assert.ok(Math.abs(all.fees.net - (all.fees.subscriptionFees - all.fees.revenueShare)) < 0.01);
  assert.ok(all.fees.revenueShare <= all.fees.subscriptionFees);
  // A partner's accrued plus paid share is its percentage of the fees on its clients' allocations.
  for (const p of input.partners) {
    const mock = db.partners.find((x) => x.id === p.id);
    const fees = db.subscriptions
      .filter((s) => mock.clientInvestorIds.includes(s.investor_id) && s.status === "allocated")
      .reduce((n, s) => n + db.subscriptionFeeOnAllocation(s), 0);
    const share = fees * (Number(p.eam_revenue_share_pct ?? 0) / 100);
    assert.ok(Math.abs(Number(p.accrued_revenue) + Number(p.paid_revenue) - share) < 0.02);
  }
  // Each fund row carries that fund's own schedule and a management-fee estimate from it.
  for (const row of all.fees.rows) {
    const fund = db.findFundById(row.fundId);
    assert.equal(row.schedule.management, fund.management_fee_pct);
    assert.ok(
      Math.abs(row.managementRunRate - (row.allocated * Number(fund.management_fee_pct)) / 100) <
        0.01,
    );
  }
});

test("retired informal messaging rejects all roles without changing saved case history", async () => {
  const before = structuredClone(w.workflow.cases);
  for (const user of [investor(), rm(), manager(), ops(), db.users.find((u) => u.id === 4)]) {
    for (const type of ["case", "reply", "resolve"])
      assert.throws(
        () =>
          w.command(user, { type, target: investor().id, id: before[0]?.id, text: "Check supply" }),
        /retired/,
      );
  }
  assert.deepEqual(w.workflow.cases, before);
  assert.equal(
    (
      await request(
        "eam/discussions",
        db.users.find((u) => u.id === 4),
      )
    ).status,
    410,
  );
  assert.equal(
    (
      await request(
        "eam/discussions/1/messages",
        db.users.find((u) => u.id === 4),
        "POST",
        { message: { body: "Check supply" } },
      )
    ).status,
    410,
  );
});
