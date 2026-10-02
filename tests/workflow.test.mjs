import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
// Compile the actual API/model modules, not an imitation of their rules.
const out = path.resolve(".test-runtime");
for (const file of [
  "src/lib/types.ts",
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
  assert.equal(w.view(fresh).versions.length, 0);
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
