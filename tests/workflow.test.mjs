import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
// Compile the actual API/model modules, not an imitation of their rules.
const out = path.resolve(".test-runtime");
for (const file of [
  "src/lib/types.ts",
  "src/lib/investor-access.ts",
  "src/mocks/investor-access.ts",
  "src/lib/client-code.ts",
  "src/mocks/db.ts",
  "src/mocks/workflow.ts",
  "src/mocks/handlers/workflow.ts",
  "src/mocks/handlers/guard.ts",
  "src/mocks/handlers/investor.ts",
  "src/mocks/handlers/eam.ts",
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
  assert.equal((await request(`eam/discussions/${foreign.id}`, user)).status, 404);
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
test("support persists a scoped reference and actual staff reply", () => {
  w.command(investor(), { type: "case", text: "Where is my issuance?", status: "ops" });
  const c = w.workflow.cases.at(-1);
  assert.ok(c.id);
  assert.equal(w.view(ops()).cases.at(-1).id, c.id);
  w.command(ops(), { type: "reply", id: c.id, text: "We are checking registry evidence." });
  assert.equal(w.view(investor()).cases.at(-1).messages.length, 2);
  assert.equal(w.view(db.users.find((u) => u.id === 3)).cases.length, 0);
});
test("exact approved publication retains earlier signed snapshots", () => {
  const f = db.funds[0];
  const old = structuredClone(w.currentVersion(f.id));
  w.command(ops(), { type: "prepare", id: f.id });
  const v = w.workflow.versions.at(-1);
  assert.throws(() => w.command(ops(), { type: "publish", id: v.id }));
  w.command(ops(), { type: "review", id: v.id });
  w.command(manager(), { type: "approve", id: v.id });
  w.command(ops(), { type: "publish", id: v.id });
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
  w.command(ops(), { type: "prepare", id: f.id });
  const v = w.workflow.versions.at(-1);
  w.command(ops(), { type: "review", id: v.id });
  w.command(manager(), { type: "approve", id: v.id });
  w.command(ops(), { type: "publish", id: v.id });
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

test("legacy EAM discussions and shared cases exchange the same messages", async () => {
  const user = db.users.find((u) => u.id === 4),
    discussion = db.discussions[0];
  const linked = w.workflow.cases.find((c) => c.discussionId === discussion.id);
  assert.ok(linked);
  assert.equal(
    (
      await request(`eam/discussions/${discussion.id}/messages`, user, "POST", {
        message: { body: "Checking documents" },
      })
    ).status,
    200,
  );
  assert.equal(linked.messages.at(-1).text, "Checking documents");
  w.command(user, { type: "reply", id: linked.id, text: "Shared servicing reply" });
  assert.equal(discussion.messages.at(-1).body, "Shared servicing reply");
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
  w.command(ops(), { type: "prepare", id: created.id });
  const v = w.workflow.versions.at(-1);
  w.command(ops(), { type: "review", id: v.id });
  assert.throws(() => w.command(ops(), { type: "approve", id: v.id }), /role/);
  w.command(manager(), { type: "approve", id: v.id });
  w.command(ops(), { type: "publish", id: v.id });
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

test("client tags are stable and unique across the seeded investor book", () => {
  const investors = db.adminInvestors();
  assert.equal(new Set(investors.map((investor) => investor.client_code)).size, investors.length);
  assert.ok(investors.every((investor) => /^[A-Z0-9]{5}$/.test(investor.client_code)));
  const rmClients = w.view(rm()).clients;
  assert.ok(
    rmClients.every(
      (client) =>
        client.code === investors.find((investor) => investor.id === client.id)?.client_code,
    ),
  );
});

test("adviser cases may link an owned holding but reject another client's holding", () => {
  const adviser = db.users.find((user) => user.id === 4);
  const own = db.holdings.find((holding) =>
    db.adviserClients.some(
      (client) => client.eam_user_id === adviser.id && client.investor_id === holding.investor_id,
    ),
  );
  assert.ok(own);
  w.command(adviser, {
    type: "case",
    target: own.investor_id,
    holdingId: own.id,
    status: "ops",
    text: "Please check this holding",
  });
  assert.equal(w.workflow.cases.at(-1).holdingId, own.id);
  const foreign = db.holdings.find((holding) => holding.investor_id !== own.investor_id);
  assert.ok(foreign);
  assert.throws(
    () =>
      w.command(adviser, {
        type: "case",
        target: own.investor_id,
        holdingId: foreign.id,
        status: "ops",
        text: "Wrong record",
      }),
    /Holding not found/,
  );
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
