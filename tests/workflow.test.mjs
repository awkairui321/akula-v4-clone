import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
// Compile the actual API/model modules, not an imitation of their rules.
const out = path.resolve(".test-runtime");
for (const file of [
  "src/lib/types.ts",
  "src/lib/file-upload.ts",
  "src/lib/permissions.ts",
  "src/lib/investor-access.ts",
  "src/mocks/investor-access.ts",
  "src/lib/client-onboarding.ts",
  "src/lib/rm-onboarding.ts",
  "src/features/partners/partner-data.ts",
  "src/features/admin/client-funds-data.ts",
  "src/features/admin/analytics-data.ts",
  "src/lib/document-catalogue.ts",
  "src/lib/format-date.ts",
  "src/lib/accredited-investor.ts",
  "src/lib/accredited-evidence.ts",
  "src/lib/subscription-readiness.ts",
  "src/lib/distributions.ts",
  "src/lib/offering.ts",
  "src/lib/receipts.ts",
  "src/lib/acclime.ts",
  "src/mocks/acclime.ts",
  "src/mocks/handlers/acclime.ts",
  "src/lib/capital-call.ts",
  "src/lib/investor-status.ts",
  "src/lib/currency.ts",
  "src/lib/demo-cohort.ts",
  "src/mocks/communications.ts",
  "src/features/eam/revenue-statement.ts",
  "src/mocks/db.ts",
  "src/mocks/distribution-seed.ts",
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
const communicationModel = await import("../.test-runtime/src/mocks/communications.mjs");
const { revenueStatement } =
  await import("../.test-runtime/src/features/eam/revenue-statement.mjs");
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
/** LUCA verifies the funds, then confirms the allocation: the two decisions are separate commands. */
function allocateVerified(user, command) {
  w.command(user, { type: "verify-funds", id: command.id });
  return w.command(user, command);
}

test("Ops completes reconciliation before the manager allocates and Ops issues", async () => {
  const s = db.subscriptions.find(
    (row) => row.investor_id === investor().id && row.status === "awaiting_funds",
  );
  const post = (user, body) => request("workflows", user, "POST", { id: s.id, ...body });
  const required = Number(s.amount) + Number(s.subscription_fee);
  assert.equal((await post(ops(), { type: "complete-reconciliation" })).status, 422);
  await post(ops(), { type: "receipt", amount: required, currency: s.currency, text: "HANDOFF" });
  const receipt = w.workflow.receipts.find((row) => row.reference === "HANDOFF");
  assert.equal((await post(ops(), { type: "match", target: receipt.id })).status, 200);
  assert.equal(db.findSubscriptionById(s.id).status, "reconciliation");
  const terms = w.allocationTerms(db.findSubscriptionById(s.id));
  assert.equal(
    (await post(manager(), { type: "allocate", amount: terms.capital, price: terms.price })).status,
    422,
  );
  // Funds cannot be verified until Ops has completed the reconciliation.
  assert.equal((await post(manager(), { type: "verify-funds" })).status, 422);
  for (const user of [
    manager(),
    investor(),
    rm(),
    db.users.find((u) => u.role === "investment_team"),
  ])
    assert.equal((await post(user, { type: "complete-reconciliation" })).status, 422);
  assert.equal((await post(ops(), { type: "complete-reconciliation" })).status, 200);
  const handed = db.findSubscriptionById(s.id);
  assert.equal(handed.status, "allocation_pending");
  assert.equal(handed.owner, "luca");
  assert.equal(handed.next_action, "allocate_units");
  assert.equal((await post(ops(), { type: "complete-reconciliation" })).status, 200);
  assert.equal(w.workflow.allocations.filter((a) => a.subscriptionId === s.id).length, 0);
  const oldHoldings = db.holdings.length;
  // Gate 1: only the Fund Manager verifies the funds, and nothing is allocated before they do.
  assert.equal(
    (await post(manager(), { type: "allocate", amount: terms.capital, price: terms.price })).status,
    422,
  );
  for (const user of [ops(), investor(), rm(), db.users.find((u) => u.role === "investment_team")])
    assert.equal((await post(user, { type: "verify-funds" })).status, 422, user.role);
  assert.equal(db.findSubscriptionById(s.id).funds_verified ?? null, null);
  assert.equal((await post(manager(), { type: "verify-funds" })).status, 200);
  const verified = db.findSubscriptionById(s.id);
  assert.equal(verified.status, "allocation_pending", "verifying funds does not allocate");
  assert.equal(verified.funds_verified.by_id, manager().id);
  assert.equal(verified.allocation_confirmed ?? null, null);
  assert.equal((await post(manager(), { type: "verify-funds" })).status, 200, "idempotent");
  // Gate 2: the allocation is a separate decision, recorded as its own event.
  assert.equal(
    (await post(manager(), { type: "allocate", amount: terms.capital, price: terms.price })).status,
    200,
  );
  assert.equal(db.findSubscriptionById(s.id).allocation_confirmed.by_id, manager().id);
  assert.equal(db.holdings.length, oldHoldings);
  assert.equal((await post(ops(), { type: "issue" })).status, 200);
  assert.equal(db.holdings.length, oldHoldings + 1);
  assert.equal((await post(ops(), { type: "complete-reconciliation" })).status, 422);
});

test("reconciliation rejects shortfalls, unmatched corrections, holds and stale eligibility", () => {
  const s = db.subscriptions.find(
    (row) => row.investor_id === investor().id && row.status === "awaiting_funds",
  );
  const send = (body) => w.command(ops(), { id: s.id, ...body });
  const required = Number(s.amount) + Number(s.subscription_fee);
  send({ type: "receipt", amount: required - 100, currency: s.currency, text: "PART" });
  send({ type: "match", target: w.workflow.receipts.at(-1).id });
  assert.throws(() => send({ type: "complete-reconciliation" }), /full requested funding/);
  send({ type: "receipt", amount: 100, currency: "SGD", text: "BAD-CURRENCY" });
  const original = w.workflow.receipts.at(-1).id;
  assert.throws(() => send({ type: "complete-reconciliation" }), /unmatched receipts/);
  send({
    type: "correct-receipt",
    target: original,
    amount: 100,
    currency: s.currency,
    text: "FIXED-CURRENCY",
  });
  const replacement = w.workflow.receipts.at(-1).id;
  assert.throws(() => send({ type: "complete-reconciliation" }), /unmatched receipts/);
  send({ type: "match", target: replacement });
  w.command(manager(), { type: "subscription-hold", id: s.id, status: "held" });
  assert.throws(() => send({ type: "complete-reconciliation" }), /hold/);
  w.command(manager(), { type: "subscription-hold", id: s.id, status: "released" });
  const current = db.findSubscriptionById(s.id);
  current.needs_review_version_id = 999;
  assert.throws(() => send({ type: "complete-reconciliation" }), /acknowledge/);
  delete db.findSubscriptionById(s.id).needs_review_version_id;
  const signature = w.workflow.signatures.find((row) => row.subscriptionId === s.id);
  w.workflow.signatures = w.workflow.signatures.filter((row) => row.subscriptionId !== s.id);
  assert.throws(() => send({ type: "complete-reconciliation" }), /signature/);
  w.workflow.signatures.push(signature);
  db.findUserById(s.investor_id).kyc_status = "not_started";
  assert.throws(() => send({ type: "complete-reconciliation" }), /eligibility/);
  assert.equal(db.findSubscriptionById(s.id).status, "reconciliation");
});

test("new receipts after handoff cannot bypass reconciliation or allocation checks", () => {
  const s = funded();
  w.command(ops(), { type: "receipt", id: s.id, amount: 100, currency: s.currency, text: "LATER" });
  const receipt = w.workflow.receipts.at(-1).id;
  assert.throws(
    () =>
      allocateVerified(manager(), {
        type: "allocate",
        id: s.id,
        amount: Number(s.amount),
        price: 100,
      }),
    /unmatched/,
  );
  w.command(ops(), { type: "match", id: s.id, target: receipt });
  assert.equal(db.findSubscriptionById(s.id).status, "reconciliation");
  assert.equal(db.findSubscriptionById(s.id).owner, "akula_ops");
  w.command(ops(), { type: "complete-reconciliation", id: s.id });
  assert.equal(db.findSubscriptionById(s.id).status, "allocation_pending");
});

test("offering audience exposes only approved-client selection fields to authorized authors", async () => {
  const team = db.users.find((u) => u.role === "investment_team");
  for (const user of [team, manager()]) {
    const response = await request("admin/offering-audience", user);
    assert.equal(response.status, 200);
    const { clients } = await response.json();
    const expected = db.adminInvestors().filter((c) => c.verification_status === "approved");
    assert.ok(clients.length > 0);
    assert.deepEqual(
      clients.map((c) => c.id),
      expected.map((c) => c.id),
    );
    for (const client of clients)
      assert.deepEqual(
        Object.keys(client).sort(),
        [
          "id",
          "full_name",
          "client_code",
          "reference",
          "investor_type",
          "segment",
          "partner",
        ].sort(),
      );
    assert.ok(clients.some((c) => c.partner));
  }
  for (const user of [investor(), rm(), ops(), db.users.find((u) => u.has_eam_profile)])
    assert.equal((await request("admin/offering-audience", user)).status, 403);
  assert.equal((await request("admin/investors", team)).status, 403);
  assert.equal((await request("admin/offering-audience", team, "POST", {})).status, 403);
});

test("drafts resume in place without delivering; sent messages are immutable", async () => {
  const file = { name: "draft.pdf", file_data_url: "data:application/pdf;base64,JVBERi0xLjQ=" };
  const payload = {
    subject: "Saved draft",
    body: "Original message",
    investor_ids: [2],
    save_draft: true,
    uploaded_attachments: [file],
    editor_state: { kind: "investor", investorId: "2" },
  };
  const created = await (await request("admin/communications", manager(), "POST", payload)).json();
  const id = created.communication.id;
  assert.equal(created.communication.status, "draft");
  assert.ok(!db.communicationRecipients.find((r) => r.communication_id === id).delivered_at);
  const updated = await (
    await request(`admin/communications/${id}`, manager(), "PATCH", {
      ...payload,
      body: "Edited draft",
    })
  ).json();
  assert.equal(updated.communication.id, id);
  assert.equal(updated.communication.body, "Edited draft");
  assert.deepEqual(updated.communication.uploaded_attachments, [file]);
  assert.equal(db.communications.filter((c) => c.id === id).length, 1);
  assert.equal((await request(`admin/communications/${id}`, rm(), "PATCH", payload)).status, 403);
  assert.equal(
    (
      await request(`admin/communications/${id}`, manager(), "PATCH", {
        ...payload,
        save_draft: false,
      })
    ).status,
    200,
  );
  const before = structuredClone(db.communications.find((c) => c.id === id));
  assert.equal(
    (await request(`admin/communications/${id}`, manager(), "PATCH", payload)).status,
    422,
  );
  assert.deepEqual(
    db.communications.find((c) => c.id === id),
    before,
  );
});

test("scheduled inbox delivery is due-only, persistent and idempotent; cancellation retains a draft", async () => {
  const date = new Date(Date.now() + 3600000);
  const payload = {
    subject: "Scheduled update",
    body: "Demo update",
    investor_ids: [2],
    purpose: "general",
    send_at: date.toISOString(),
  };
  const created = await (await request("admin/communications", manager(), "POST", payload)).json();
  const id = created.communication.id;
  communicationModel.deliverDueCommunications(new Date(date.getTime() - 1));
  assert.ok(!db.communicationRecipients.find((r) => r.communication_id === id).delivered_at);
  db.restoreDemoState(db.exportDemoState());
  communicationModel.deliverDueCommunications(date);
  const recipient = db.communicationRecipients.find((r) => r.communication_id === id);
  assert.equal(recipient.delivered_at, date.toISOString());
  const delivered = structuredClone(recipient);
  communicationModel.deliverDueCommunications(new Date(date.getTime() + 1000));
  assert.deepEqual(
    db.communicationRecipients.find((r) => r.id === recipient.id),
    delivered,
  );
  assert.ok(
    (await (await request("messages", investor())).json()).messages.some((m) => m.id === id),
  );
  const another = await (await request("admin/communications", manager(), "POST", payload)).json();
  assert.equal(
    (
      await request(`admin/communications/${another.communication.id}`, manager(), "PATCH", {
        cancel_schedule: true,
      })
    ).status,
    200,
  );
  communicationModel.deliverDueCommunications(date);
  assert.equal(db.communications.find((c) => c.id === another.communication.id).status, "draft");
  assert.ok(
    !db.communicationRecipients.find((r) => r.communication_id === another.communication.id)
      .delivered_at,
  );
  assert.equal(
    (
      await request("admin/communications", manager(), "POST", {
        ...payload,
        investor_ids: [999999],
      })
    ).status,
    422,
  );
});

test("revenue CSV matches scoped totals, escapes quotes and neutralizes formulas", async () => {
  const eam = db.users.find((u) => u.id === 4);
  const data = await (await request("eam/revenue", eam)).json();
  data.transactions[0].client_name = '=HYPERLINK("bad")';
  const csv = revenueStatement(data);
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
  assert.ok(csv.includes('"Simulated paid","' + data.paid + '"'));
  assert.ok(csv.includes("fictional demo"));
  assert.equal((await request("eam/revenue", investor())).status, 403);
});

test("scheduled document requests activate only when due and never on draft save or cancellation", async () => {
  const user = investor();
  const kind = "passport";
  db.documentRequests.splice(0, db.documentRequests.length);
  const date = new Date(Date.now() + 3600000);
  const payload = {
    subject: "Documents required",
    body: "Please provide the requested document.",
    investor_ids: [user.id],
    purpose: "request",
    send_at: date.toISOString(),
    editor_state: { docKinds: [kind], dueDate: "2026-11-30" },
  };
  const count = db.communications.length;
  assert.equal(
    (
      await request("admin/communications", manager(), "POST", {
        ...payload,
        editor_state: { docKinds: ["invalid"] },
      })
    ).status,
    422,
  );
  assert.equal(db.communications.length, count);
  const draft = await (
    await request("admin/communications", manager(), "POST", { ...payload, save_draft: true })
  ).json();
  assert.equal(db.documentRequests.length, 0);
  const result = await (
    await request(`admin/communications/${draft.communication.id}`, manager(), "PATCH", payload)
  ).json();
  assert.equal(result.communication.status, "scheduled");
  assert.equal(db.documentRequests.length, 0);
  communicationModel.deliverDueCommunications(date);
  assert.equal(db.documentRequests.length, 1);
  assert.equal(db.documentRequests[0].communication_id, draft.communication.id);
  assert.equal(db.documentRequests[0].investor_id, user.id);
  communicationModel.deliverDueCommunications(date);
  assert.equal(db.documentRequests.length, 1);
});

test("approved showcase is shared across adviser and RM views without removing scoped history", async () => {
  const eam = db.users.find((u) => u.id === 4);
  const clients = await (await request("eam/clients", eam)).json();
  const approved = clients.filter((c) => c.showcase);
  assert.ok(approved.length > 0);
  for (const client of approved) {
    const record = db.adminInvestors().find((i) => i.id === client.investor_user_id);
    assert.equal(record.verification_status, "approved");
  }
  const dashboard = await (await request("eam/dashboard", eam)).json();
  assert.equal(dashboard.total_clients, approved.length);
  const view = w.view(rm());
  const excluded = clients.find((c) => !c.showcase);
  assert.ok(excluded);
  assert.equal((await request(`eam/clients/${excluded.id}`, eam)).status, 200);
  for (const client of view.clients.filter((c) => c.showcase))
    assert.equal(
      db.adminInvestors().find((i) => i.id === client.id).verification_status,
      "approved",
    );
  assert.ok(view.clients.some((c) => !c.showcase));
});

test("advisers see published terms and never unpublished working changes", async () => {
  const eam = db.users.find((u) => u.id === 4);
  const fund = db.funds.find((f) => f.id === 1201);
  const published = structuredClone(w.currentVersion(fund.id).snapshot);
  fund.subscription_fee_pct = "97";
  fund.hook = "Unpublished wording";
  const listing = await (await request("eam/opportunities", eam)).json();
  const detail = await (await request(`eam/opportunities/${fund.id}`, eam)).json();
  assert.equal(
    listing.funds.find((f) => f.id === fund.id).subscription_fee_pct,
    published.subscription_fee_pct,
  );
  assert.equal(detail.fund.hook, published.hook);
  const draft = db.funds.find((f) => f.state === "draft");
  assert.ok(draft);
  assert.equal((await request(`eam/opportunities/${draft.id}`, eam)).status, 404);
  assert.ok(!listing.funds.some((f) => f.id === draft.id));
});

test("staff overview documents include fund materials but exclude private client files", async () => {
  const fundId = 1201;
  const materials = db.documents.filter(
    (d) => d.fund_id === fundId && d.owner_name === "LUCA SGP" && d.subscription_id === null,
  );
  assert.equal(materials.length, 3);
  const privateFile = structuredClone(materials[0]);
  privateFile.id = db.nextDocumentId();
  privateFile.owner_id = investor().id;
  privateFile.owner_name = "Elena Cross";
  privateFile.subscription_id = 59;
  db.documents.push(privateFile);
  for (const user of [manager(), ops(), db.users.find((u) => u.role === "investment_team")]) {
    const response = await request(`documents?fund_id=${fundId}`, user);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.documents.length, 3);
    assert.ok(!result.documents.some((d) => d.id === privateFile.id));
  }
});

test("payment evidence retains bytes without creating cash or changing allocation", async () => {
  const user = investor();
  const sub = db.subscriptions.find(
    (s) => s.investor_id === user.id && s.status === "payment_unmatched" && !s.on_hold,
  );
  assert.ok(sub);
  const count = db.documents.length;
  const oldStatus = sub.status;
  const oldCash = structuredClone(w.workflow.receipts);
  assert.equal(
    (await request(`subscriptions/${sub.id}/payment_proof`, user, "POST", { name: "receipt.pdf" }))
      .status,
    422,
  );
  assert.equal(db.documents.length, count);
  const file = { name: "receipt.pdf", file_data_url: "data:application/pdf;base64,JVBERi0xLjQ=" };
  const foreign = db.subscriptions.find((s) => s.investor_id !== user.id);
  assert.equal(
    (await request(`subscriptions/${foreign.id}/payment_proof`, user, "POST", file)).status,
    404,
  );
  assert.equal(
    (await request(`subscriptions/${sub.id}/payment_proof`, user, "POST", file)).status,
    200,
  );
  const evidence = db.documents.at(-1);
  assert.equal(evidence.owner_id, user.id);
  assert.equal(evidence.subscription_id, sub.id);
  assert.equal(evidence.fund_id, sub.fund_id);
  assert.equal(evidence.file_data_url, file.file_data_url);
  assert.equal(sub.status, oldStatus);
  assert.deepEqual(w.workflow.receipts, oldCash);
  assert.equal(
    w
      .view(ops())
      .subscriptions.find((s) => s.id === sub.id)
      .paymentProofs.at(-1).file_data_url,
    file.file_data_url,
  );
  const saved = db.exportDemoState();
  db.restoreDemoState(saved);
  assert.equal(db.documents.find((d) => d.id === evidence.id).file_data_url, file.file_data_url);
});
test("document uploads retain bytes, stay owner scoped and require LUCA review", async () => {
  const file = { name: "Evidence.pdf", file_data_url: "data:application/pdf;base64,JVBERi0xLjQ=" };
  const user = investor();
  const before = db.documents.length;
  assert.equal(
    (
      await request("documents", user, "POST", {
        ...file,
        kind: "passport",
        file_data_url: "data:text/html;base64,AAAA",
      })
    ).status,
    422,
  );
  assert.equal(db.documents.length, before);
  const result = await request("documents", user, "POST", { ...file, kind: "passport" });
  assert.equal(result.status, 200);
  const { document } = await result.json();
  assert.equal(document.owner_id, user.id);
  assert.equal(document.review_state, "received");
  assert.equal(document.file_data_url, file.file_data_url);
  assert.ok(
    !(
      await (
        await request(
          "documents",
          db.users.find((u) => u.id === 3),
        )
      ).json()
    ).documents.some((d) => d.id === document.id),
  );
  const req = db.documentRequests.find(
    (r) => r.investor_id === user.id && r.status === "requested",
  );
  assert.ok(req);
  assert.equal(
    (
      await request(
        `document_requests/${req.id}/upload`,
        db.users.find((u) => u.id === 3),
        "POST",
        file,
      )
    ).status,
    404,
  );
  assert.equal(
    (await request(`document_requests/${req.id}/upload`, user, "POST", file)).status,
    200,
  );
  assert.equal(
    db.documents.find((d) => d.id === req.received_document_id).file_data_url,
    file.file_data_url,
  );
  assert.equal(
    (await request(`document_requests/${req.id}/upload`, user, "POST", file)).status,
    409,
  );
});
test("uploaded communication attachments reach only delivered recipients and persist", async () => {
  const file = { name: "Update.pdf", file_data_url: "data:application/pdf;base64,JVBERi0xLjQ=" };
  const payload = {
    subject: "Critical update",
    body: "See attached.",
    purpose: "deal_update",
    investor_ids: [investor().id],
    uploaded_attachments: [file],
  };
  const count = db.communications.length;
  assert.equal(
    (
      await request("admin/communications", manager(), "POST", {
        ...payload,
        uploaded_attachments: [{ ...file, file_data_url: "bad" }],
      })
    ).status,
    422,
  );
  assert.equal(db.communications.length, count);
  const { communication } = await (
    await request("admin/communications", manager(), "POST", payload)
  ).json();
  const mine = (await (await request("messages", investor())).json()).messages.find(
    (m) => m.id === communication.id,
  );
  assert.equal(mine.attachments[0].file_data_url, file.file_data_url);
  assert.ok(
    !(
      await (
        await request(
          "messages",
          db.users.find((u) => u.id === 3),
        )
      ).json()
    ).messages.some((m) => m.id === communication.id),
  );
  assert.deepEqual(
    db.exportDemoState().arrays.communications.find((c) => c.id === communication.id)
      .uploaded_attachments,
    [file],
  );
});
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
    [1, 3, 4, 1201],
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
  allocateVerified(manager(), { type: "allocate", id: s.id, amount: capital, price: 1000 });
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
  allocateVerified(manager(), { type: "allocate", id: s.id, amount: 0, price: 1000 });
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
    () => allocateVerified(manager(), { type: "allocate", id: s.id, amount: 1000, price: 1000 }),
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
  w.command(manager(), { type: "verify-funds", id: s.id });
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
    () => allocateVerified(manager(), { type: "allocate", id: s.id, amount: 1000, price: 1000 }),
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
    () => allocateVerified(manager(), { type: "allocate", id: s.id, amount: 1000, price: 1000 }),
    /review/,
  );
  assert.throws(
    () => w.command(ops(), { type: "acknowledge", id: s.id, target: v.id }),
    /investor/,
  );
  w.command(investor(), { type: "acknowledge", id: s.id, target: v.id });
  allocateVerified(manager(), { type: "allocate", id: s.id, amount: 1000, price: 1000 });
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
  // Publishing fixes where investors pay, so it waits for the Fund Manager's transfer account.
  assert.throws(
    () => w.command(manager(), { type: "approve", id: v.id }),
    /Enter the transfer account/,
  );
  assert.equal(
    (
      await request(`admin/funds/${created.id}/transfer_account`, team, "PUT", {
        transfer_account: { bank_name: "Not allowed" },
      })
    ).status,
    403,
    "only the Fund Manager sets the transfer account",
  );
  const account = {
    account_name: "DAS VCC II Serapong Subscription Account",
    bank_name: "Test Bank",
    bank_address: "1 Test Street",
    account_number: "123-456",
    swift_bic: "TESTSGSG",
  };
  assert.equal(
    (
      await request(`admin/funds/${created.id}/transfer_account`, manager(), "PUT", {
        transfer_account: account,
      })
    ).status,
    200,
  );
  w.command(manager(), { type: "approve", id: v.id });
  assert.equal((await request(`funds/${created.id}`, investor())).status, 200);
  // Once published the details are fixed.
  const locked = await request(`admin/funds/${created.id}/transfer_account`, manager(), "PUT", {
    transfer_account: { ...account, account_number: "999-999" },
  });
  assert.equal(locked.status, 422);
  assert.match((await locked.json()).error, /cannot be changed once the deal is published/);
  assert.equal(
    (await (await request(`admin/funds/${created.id}/transfer_account`, manager())).json()).locked,
    true,
  );
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
test("the adviser's sign-off releases a partner subscription straight to funding; LUCA has no review step", async () => {
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
  const released = db.findSubscriptionById(sub.id);
  assert.equal(released.status, "approved");
  assert.equal(released.next_action, "proceed_to_funding");
  assert.ok(released.approved_at);
  // The retired review step cannot be entered any more, and old saved data moves on.
  assert.ok(!db.TRANSITIONS.documents_pending.includes("under_luca_review"));
  assert.ok(
    !db.subscriptions.some((s) =>
      ["under_luca_review", "information_requested"].includes(s.status),
    ),
  );
  const legacy = db.exportDemoState();
  legacy.arrays.subscriptions.find((s) => s.id === sub.id).status = "under_luca_review";
  db.restoreDemoState(legacy);
  assert.equal(db.findSubscriptionById(sub.id).status, "approved");
});

test("LUCA can decline an allocation: funds return, the investor is told and Ops gets the return", () => {
  const s = db.subscriptions.find((x) => x.status === "allocation_pending");
  assert.ok(s);
  const messagesBefore = db.communicationRecipients.filter(
    (r) => r.investor_id === s.investor_id,
  ).length;
  assert.throws(
    () => w.command(manager(), { type: "decline-allocation", id: s.id }),
    /description/,
  );
  assert.throws(
    () => w.command(ops(), { type: "decline-allocation", id: s.id, text: "x" }),
    /another role/,
  );
  w.command(manager(), { type: "decline-allocation", id: s.id, text: "Fund is over-subscribed." });
  const declined = db.findSubscriptionById(s.id);
  assert.equal(declined.status, "not_allocated");
  assert.equal(declined.owner, "akula_ops");
  assert.equal(declined.rejection_note, "Fund is over-subscribed.");
  assert.ok(w.workflow.returns.some((r) => r.subscriptionId === s.id && r.status === "required"));
  assert.equal(
    db.communicationRecipients.filter((r) => r.investor_id === s.investor_id).length,
    messagesBefore + 1,
  );
  assert.throws(
    () => w.command(manager(), { type: "decline-allocation", id: s.id, text: "again" }),
    /waiting for allocation/,
  );
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
      allocateVerified(manager(), {
        type: "allocate",
        id: s.id,
        amount: Number(s.amount),
        price: 100,
      }),
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
  // Subscriptions move in steps of $1,000.
  for (const amount of ["25500", "25000.50"])
    assert.equal(
      (await request("subscriptions", user, "POST", { fund_id: 1, amount })).status,
      422,
      amount,
    );
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
  w.command(ops(), { type: "complete-reconciliation", id: sub.id });
  allocateVerified(manager(), { type: "allocate", id: sub.id, amount: 12500, price: 100 });
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
    () => allocateVerified(manager(), { type: "allocate", id: sub.id, amount: 10000, price: 100 }),
    /eligibility/,
  );
  user = db.findUserById(sub.investor_id);
  user.kyc_status = "approved";
  const signature = w.workflow.signatures.find((row) => row.subscriptionId === sub.id);
  w.workflow.signatures = w.workflow.signatures.filter((row) => row.subscriptionId !== sub.id);
  assert.throws(
    () => allocateVerified(manager(), { type: "allocate", id: sub.id, amount: 10000, price: 100 }),
    /signature/,
  );
  w.workflow.signatures.push(signature);
  allocateVerified(manager(), { type: "allocate", id: sub.id, amount: 10000, price: 100 });
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
  allocateVerified(manager(), {
    type: "allocate",
    id: sub.id,
    amount: Number(sub.amount),
    price: 100,
  });
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

test("recommendations are retired while private follow-ups remain scoped", () => {
  w.command(manager(), { type: "note", id: 2, text: "Call about the offering", due: "2026-10-10" });
  assert.equal(w.view(manager()).notes.at(-1).text, "Call about the offering");
  assert.equal(w.view(investor()).notes.length, 0);
  for (const user of [manager(), rm(), investor()])
    for (const type of ["highlight", "open-highlight"])
      assert.throws(
        () => w.command(user, { type, id: 2, target: 1, text: "Consider offering" }),
        /retired/,
      );
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
  assert.equal(client.stage, "preparing");
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

  // Issue the link after uploading, then activate and confirm as the investor.
  await request(`rm/clients/${client.id}/invite`, rm(), "POST");
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
  user.invitation_ready = true;
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

test("RM prepares files before issuing a unique client invitation", async () => {
  const { client } = await (
    await request("rm/clients", rm(), "POST", newClient({ defer_invite: true }))
  ).json();
  const user = db.findUserById(client.id);
  assert.equal(client.stage, "preparing");
  let detail = await (await request(`rm/clients/${client.id}/onboarding`, rm())).json();
  assert.equal(detail.invite_path, null);
  assert.equal(
    (await request("public/activation?token=" + user.invite_token, investor())).status,
    404,
  );
  assert.equal((await request(`rm/clients/${client.id}/invite`, rm(), "POST")).status, 422);
  await request(`rm/clients/${client.id}/documents`, rm(), "POST", {
    name: "passport.pdf",
    kind: "passport",
    file_data_url: PDF,
  });
  detail = await (await request(`rm/clients/${client.id}/invite`, rm(), "POST")).json();
  assert.ok(detail.invite_path);
  assert.equal(detail.client.stage, "invited");
  const first = user.invite_token;
  await request(`rm/clients/${client.id}/invite`, rm(), "POST");
  assert.notEqual(user.invite_token, first);
  assert.equal((await request("public/activation?token=" + first, investor())).status, 404);
  assert.equal(db.findAdminInvestorSeed(client.id).verification_status, "pending");
  assert.equal(user.nda_status, "not_started");
});
test("RM messages preserve attachments and cannot reach another RM's client", async () => {
  const mine = w.clientsFor(rm())[0];
  const foreign = db.adminInvestors().find((c) => !w.clientsFor(rm()).includes(c.id));
  const payload = {
    investor_id: mine,
    subject: "Client documents",
    body: "Please review.",
    uploaded_attachments: [{ name: "document.pdf", file_data_url: PDF }],
  };
  const response = await request("rm/communications", rm(), "POST", payload);
  assert.equal(response.status, 201);
  const { communication } = await response.json();
  assert.equal(communication.uploaded_attachments[0].file_data_url, PDF);
  assert.equal(
    (await request("rm/communications", rm(), "POST", { ...payload, investor_id: foreign.id }))
      .status,
    403,
  );
  assert.equal((await request("rm/communications", investor(), "POST", payload)).status, 403);
  const other = db.users.find((u) => u.id === 8);
  const list = await (await request("rm/communications", other)).json();
  assert.equal(list.communications.length, 0);
  const messages = await (await request("messages", db.findUserById(mine))).json();
  assert.ok(messages.messages.some((m) => m.subject === payload.subject));
});

test("RM-prepared approval waits for client ownership confirmations, NDA and consents", async () => {
  const { client } = await (await request("rm/clients", rm(), "POST", newClient())).json();
  const me = db.findUserById(client.id);
  const profile = db.findInvestorProfileByUserId(client.id);
  const payload = { decision: "approve", identity: "verified", accreditation: "accredited" };
  assert.equal(
    (await request(`admin/investors/${client.id}/review`, manager(), "POST", payload)).status,
    422,
  );
  assert.equal((await request("onboarding/skip", me, "POST")).status, 422);
  await request(`rm/clients/${client.id}/documents`, rm(), "POST", {
    name: "passport.pdf",
    kind: "passport",
    file_data_url: PDF,
  });
  me.invite_token = null;
  me.invitation_ready = true;
  profile.prepared_by_rm.confirmed_at = new Date().toISOString();
  profile.eligibility_confirmed_at = new Date().toISOString();
  profile.onboarding_step = 4;
  me.nda_status = "signed";
  me.kyc_status = "pending";
  for (const consent of db.consentsForUser(client.id)) db.grantConsent(client.id, consent.id);
  assert.equal(
    (await request(`admin/investors/${client.id}/review`, manager(), "POST", payload)).status,
    422,
  );
  const doc = db.documents.find((d) => d.owner_id === client.id);
  const visible = await (await request("onboarding/documents", me)).json();
  assert.equal(visible.documents[0].file_data_url, PDF);
  await request(`onboarding/documents/${doc.id}/confirm`, me, "POST");
  const detail = await (await request(`rm/clients/${client.id}/onboarding`, rm())).json();
  assert.equal(detail.client.stage, "pending_approval");
  assert.equal(
    (await request(`admin/investors/${client.id}/review`, manager(), "POST", payload)).status,
    200,
  );
  assert.equal(db.findAdminInvestorSeed(client.id).verification_status, "approved");
});

test("Quanta variants have separate audiences, fees, documents and funded client allocations", async () => {
  const direct = db.findFundById(1201),
    partner = db.findFundById(8);
  assert.equal(direct.asset.id, partner.asset.id);
  assert.deepEqual(
    [direct.subscription_fee_pct, direct.management_fee_pct, direct.carried_interest_pct],
    ["2", "1", "10"],
  );
  assert.deepEqual(
    [partner.subscription_fee_pct, partner.management_fee_pct, partner.carried_interest_pct],
    ["4", "2", "20"],
  );
  const examples = db.subscriptions.filter((sub) =>
    sub.payment_reference?.startsWith("FUND-VARIANT-DEMO-"),
  );
  assert.equal(examples.length, 4);
  for (const sub of examples) {
    assert.equal(w.matched(sub.id), Number(sub.amount) + Number(sub.subscription_fee));
    assert.ok(w.signedVersion(sub.id));
    if (sub.status === "allocated")
      assert.ok(
        db.holdings.some((h) => h.id === sub._convertedToHoldingId && h.fund_id === sub.fund_id),
      );
  }
  const user = investor();
  await request("demo/investor-segment", user, "PATCH", { segment: "independent" });
  let shelf = await (await request("funds", user)).json();
  assert.ok(shelf.funds.some((f) => f.id === 1201));
  assert.ok(!shelf.funds.some((f) => f.id === 8));
  const created = await (
    await request("subscriptions", user, "POST", { fund_id: 1201, amount: "25000" })
  ).json();
  assert.equal(created.subscription.subscription_fee, "500.00");
  const directDocs = await (await request("documents?fund_id=1201", user)).json();
  assert.equal(directDocs.documents.length, 3);
  assert.ok(directDocs.documents.every((d) => d.fund_id === 1201));
  await request("demo/investor-segment", user, "PATCH", { segment: "partner_referred" });
  shelf = await (await request("funds", user)).json();
  assert.ok(shelf.funds.some((f) => f.id === 8));
  assert.ok(!shelf.funds.some((f) => f.id === 1201));
  assert.equal(
    (await request("subscriptions", user, "POST", { fund_id: 1201, amount: "25000" })).status,
    403,
  );
  const partnerDocs = await (await request("documents?fund_id=8", user)).json();
  assert.ok(partnerDocs.documents.some((d) => d.name.includes("Partner offering memorandum")));
  assert.ok(!partnerDocs.documents.some((d) => d.fund_id === 1201));
  const pending = examples.find(
    (sub) => sub.fund_id === 1201 && sub.status === "allocation_pending",
  );
  w.command(manager(), { type: "verify-funds", id: pending.id });
  w.command(manager(), {
    type: "allocate",
    id: pending.id,
    amount: 50000,
    price: Number(direct.price),
  });
  assert.equal(w.workflow.allocations.find((a) => a.subscriptionId === pending.id).fee, 1000);
});

test("client audience edits require exact Fund Manager publication and never change sibling funds", async () => {
  const user = investor(),
    team = db.users.find((u) => u.role === "investment_team");
  const upload = await (
    await request("admin/documents", team, "POST", {
      document: {
        name: "Direct variant revised terms.pdf",
        kind: "factsheet",
        fund_id: 1201,
        file_data_url: db.documents.find((d) => d.fund_id === 1201 && d.file_data_url)
          .file_data_url,
      },
    })
  ).json();
  assert.equal(upload.document.review_state, "received");
  assert.ok(
    !(await (await request("documents?fund_id=1201", user)).json()).documents.some(
      (d) => d.id === upload.document.id,
    ),
  );
  await request("demo/investor-segment", user, "PATCH", { segment: "partner_referred" });
  for (const segments of [[], ["unknown"], "independent"])
    assert.equal(
      (await request("funds/1201", team, "PATCH", { fund: { eligible_segments: segments } }))
        .status,
      422,
    );
  assert.equal(
    (
      await request("funds/1201", team, "PATCH", {
        fund: { eligible_segments: ["partner_referred"] },
      })
    ).status,
    200,
  );
  const hasDirect = async () =>
    (await (await request("funds", user)).json()).funds.some((f) => f.id === 1201);
  assert.equal(await hasDirect(), false);
  w.command(team, { type: "prepare", id: 1201 });
  const version = w.workflow.versions.at(-1);
  w.command(team, { type: "review", id: version.id });
  assert.equal(await hasDirect(), false);
  assert.throws(() => w.command(team, { type: "approve", id: version.id }));
  w.command(manager(), { type: "approve", id: version.id });
  assert.equal(db.documents.find((d) => d.id === upload.document.id).review_state, "filed");
  assert.ok(
    (await (await request("documents?fund_id=1201", user)).json()).documents.some(
      (d) => d.id === upload.document.id,
    ),
  );
  assert.equal(await hasDirect(), true);
  assert.deepEqual(w.currentVersion(8).snapshot.eligible_segments, ["partner_referred"]);
  assert.equal(w.currentVersion(8).snapshot.subscription_fee_pct, "4");
});

test("saved demos gain the two-fund example once while preserving edits and historical records", () => {
  const saved = db.exportDemoState();
  saved.arrays.funds = saved.arrays.funds.filter((f) => f.id !== 1201);
  delete saved.arrays.funds.find((f) => f.id === 8).eligible_segments;
  saved.arrays.subscriptions = saved.arrays.subscriptions.filter(
    (s) => !s.payment_reference?.startsWith("FUND-VARIANT-DEMO-"),
  );
  saved.arrays.holdings = saved.arrays.holdings.filter(
    (h) =>
      ![1201].includes(h.fund_id) &&
      !(h.fund_id === 8 && h.investor_id === 19 && h.committed_amount === "150000.00"),
  );
  saved.arrays.documents = saved.arrays.documents.filter(
    (d) => ![1201].includes(d.fund_id) && !d.name.startsWith("Quanta Compute SPV I · Partner"),
  );
  saved.arrays.users.find((u) => u.id === 2).email = "preserved@example.com";
  db.restoreDemoState(saved);
  const oldIds = db.subscriptions.map((s) => s.id);
  w.workflow.versions = w.workflow.versions.filter((v) => v.fundId !== 1201);
  delete w.currentVersion(8).snapshot.eligible_segments;
  w.seedWorkflow();
  assert.equal(db.users.find((u) => u.id === 2).email, "preserved@example.com");
  assert.ok(oldIds.every((id) => db.subscriptions.some((s) => s.id === id)));
  assert.ok(w.currentVersion(1201));
  const counts = [
    db.funds.length,
    db.subscriptions.length,
    db.documents.length,
    db.holdings.length,
    w.workflow.receipts.length,
    w.workflow.versions.length,
  ];
  w.seedWorkflow();
  assert.deepEqual(
    [
      db.funds.length,
      db.subscriptions.length,
      db.documents.length,
      db.holdings.length,
      w.workflow.receipts.length,
      w.workflow.versions.length,
    ],
    counts,
  );
});

test("a deal's audience combines client classes, partner firms and named clients, and newly included clients are told on publication", async () => {
  const fm = manager();
  assert.equal(db.adminInvestors().find((c) => c.id === 2).segment, "independent");
  // Fund 6 follows the original rule, so a direct client cannot see it yet.
  const before = await (await request("funds", investor())).json();
  assert.ok(!before.funds.some((f) => f.id === 6));

  // Validation: an audience cannot be empty, and unknown classes are refused.
  const bad = (fund) => request("funds/6", fm, "PATCH", { fund });
  assert.equal((await bad({ eligible_segments: [] })).status, 422);
  assert.equal((await bad({ eligible_segments: ["nobody"] })).status, 422);
  assert.equal((await bad({ eligible_segments: [], audience_partners: "Meridian" })).status, 422);

  const saved = await bad({
    eligible_segments: [],
    audience_partners: ["Straits Family Office"],
    audience_investors: [2],
  });
  assert.equal(saved.status, 200);
  // Nothing changes for investors until the version is approved and published.
  assert.ok(!(await (await request("funds", investor())).json()).funds.some((f) => f.id === 6));
  w.command(fm, { type: "stage", id: 6 });
  const version = w.workflow.versions.find((v) => v.fundId === 6 && v.status === "review");
  assert.ok(version);
  const told = () =>
    db.communicationRecipients.filter(
      (r) =>
        r.investor_id === 2 &&
        db.communications
          .find((c) => c.id === r.communication_id)
          ?.subject.startsWith("New opportunity"),
    ).length;
  const messages = told();
  w.command(fm, { type: "approve", id: version.id });
  assert.equal(told(), messages + 1);
  const after = await (await request("funds", investor())).json();
  assert.ok(
    after.funds.some((f) => f.id === 6),
    "the named client now sees the deal",
  );
  // A client outside every selector still cannot.
  const other = db.users.find((u) => u.id === 3);
  assert.ok(!(await (await request("funds", other)).json()).funds?.some?.((f) => f.id === 6));
  // The partner firm's clients are included by name of the firm.
  const straits = db
    .adminInvestors()
    .filter((c) => c.partner === "Straits Family Office" && c.verification_status === "approved");
  assert.ok(straits.length > 0);
});

test("an allocation is fixed by the subscription: the subscribed capital at the signed unit price", async () => {
  const s = funded();
  const terms = w.allocationTerms(s);
  assert.equal(terms.capital, Number(s.amount));
  assert.ok(terms.price > 0);
  const view = await (await request("workflows", manager())).json();
  assert.equal(view.subscriptions.find((x) => x.id === s.id).allocationPrice, terms.price);
  const attempt = (body) =>
    request("workflows", manager(), "POST", { type: "allocate", id: s.id, ...body });
  for (const body of [
    { amount: terms.capital / 2, price: terms.price },
    { amount: terms.capital, price: terms.price + 1 },
    { amount: 0, price: terms.price },
  ])
    assert.equal((await attempt(body)).status, 422);
  assert.equal(db.findSubscriptionById(s.id).status, "allocation_pending");
  w.command(manager(), { type: "verify-funds", id: s.id });
  assert.equal((await attempt({ amount: terms.capital, price: terms.price })).status, 200);
  assert.equal(db.findSubscriptionById(s.id).status, "allocated");
});

test("an excluded client never sees a deal, whatever else would include them, and is not told about it", async () => {
  const fm = manager();
  const patch = (fund) => request("funds/6", fm, "PATCH", { fund });
  assert.equal((await patch({ audience_excluded: "2" })).status, 422);
  // Everyone onboarded, except client 2 (Elena Cross, a direct client).
  assert.equal(
    (
      await patch({
        eligible_segments: ["independent", "partner_referred"],
        audience_partners: [],
        audience_investors: [2],
        audience_excluded: [2],
      })
    ).status,
    200,
  );
  w.command(fm, { type: "stage", id: 6 });
  const version = w.workflow.versions.find((v) => v.fundId === 6 && v.status === "review");
  const told = (id) =>
    db.communicationRecipients.filter(
      (r) =>
        r.investor_id === id &&
        db.communications
          .find((c) => c.id === r.communication_id)
          ?.subject.startsWith("New opportunity"),
    ).length;
  const others = db
    .adminInvestors()
    // Direct clients could not see fund 6 before, so they are newly included.
    .filter(
      (c) => c.verification_status === "approved" && c.id !== 2 && c.segment === "independent",
    );
  assert.ok(others.length > 0);
  const [excludedBefore, otherBefore] = [told(2), told(others[0].id)];
  w.command(fm, { type: "approve", id: version.id });
  // Named and excluded at once: exclusion wins, and no message is sent.
  assert.ok(!(await (await request("funds", investor())).json()).funds.some((f) => f.id === 6));
  assert.equal(told(2), excludedBefore);
  // A client who is not excluded and is newly included is told.
  assert.ok(told(others[0].id) > otherBefore);
  assert.equal((await request("funds/6", investor())).status, 403);
});

test("dates read as people write them and are stored as plain dates; free text is left alone", async () => {
  const { friendlyDate, storedDate } = await import("../.test-runtime/src/lib/format-date.mjs");
  assert.equal(friendlyDate("2026-09-19T03:42:57.144Z"), "19 Sep 2026");
  assert.equal(friendlyDate("2026-09-19"), "19 Sep 2026");
  for (const free of ["Nov 2021", "H2 2024", "Q3", ""]) assert.equal(friendlyDate(free), free);
  assert.equal(storedDate("19 Sep 2026"), "2026-09-19");
  assert.equal(storedDate("5 Jan 2027"), "2027-01-05");
  // Not a real day, or not in the written form: unchanged rather than guessed.
  for (const odd of ["31 Feb 2026", "Mar 2025", "2026-09-19", "19 September 2026"])
    assert.equal(storedDate(odd), odd);
  assert.equal(storedDate(friendlyDate("2026-12-01T00:00:00.000Z")), "2026-12-01");
});

test("subscribe access follows the whole audience: named clients can subscribe; excluded ones can only continue", async () => {
  const fm = manager();
  const publish = async (fundId, fund) => {
    assert.equal((await request(`funds/${fundId}`, fm, "PATCH", { fund })).status, 200);
    w.command(fm, { type: "stage", id: fundId });
    const v = w.workflow.versions.find((v) => v.fundId === fundId && v.status === "review");
    w.command(fm, { type: "approve", id: v.id });
  };
  // Included by name only, not by class: they can subscribe.
  await publish(6, { eligible_segments: [], audience_investors: [2] });
  const named = (await (await request("funds/6", investor())).json()).fund.investor_access;
  assert.equal(named.canSubscribe, true);
  // Excluded with a subscription already under way: cannot start another, can continue it.
  const open = db.subscriptions.find(
    (s) =>
      s.investor_id === 2 &&
      s.fund_id === 1 &&
      !s._convertedToHoldingId &&
      !["cancelled", "rejected", "funds_returned", "not_allocated"].includes(s.status),
  );
  assert.ok(open, "the client has an open subscription in fund 1");
  await publish(1, {
    eligible_segments: ["independent", "partner_referred"],
    audience_excluded: [2],
  });
  const excluded = (await (await request("funds/1", investor())).json()).fund.investor_access;
  assert.equal(excluded.canSubscribe, false);
  assert.equal(excluded.continueSubscriptionId, open.id);
  assert.equal(
    (await request("subscriptions", investor(), "POST", { fund_id: 1, amount: "25000" })).status,
    403,
  );
});

test("the accredited investor declaration needs one basis, its proof, a declaration and consent", async () => {
  const evidence = await import("../.test-runtime/src/lib/accredited-evidence.mjs");
  const user = investor();
  const declare = (body) => request("investor/declaration", user, "POST", body);
  const file = "data:application/pdf;base64,JVBERi0xLjQK";
  const upload = (kind) =>
    request("onboarding/documents", user, "POST", {
      name: `${kind}.pdf`,
      kind,
      file_data_url: file,
    });
  const full = { declared: true, consented: true };

  // Nothing is accepted without exactly one known basis, the declaration and the consent.
  for (const incomplete of [
    { basis: [], ...full },
    { basis: ["lottery_win"], ...full },
    { basis: ["income", "net_financial_assets"], ...full },
    { basis: ["income"], declared: true, consented: false },
    { basis: ["income"], declared: false, consented: true },
  ])
    assert.equal((await declare(incomplete)).status, 422);

  // The proof is part of the gate: none, or only some of it, is not enough.
  const noProof = await declare({ basis: ["net_personal_assets"], ...full });
  assert.equal(noProof.status, 422);
  assert.match((await noProof.json()).error, /Upload your proof/);
  for (const kind of ["bank_statement", "source_of_wealth"]) await upload(kind);
  const recorded = w.workflow.events.length;
  const partial = await declare({ basis: ["net_personal_assets"], ...full });
  assert.equal(partial.status, 422);
  assert.match((await partial.json()).error, /property deed/);
  // Proof for a different basis does not count towards this one.
  assert.equal((await declare({ basis: ["income"], ...full })).status, 422);
  assert.equal(w.workflow.events.length, recorded, "rejected declarations leave no record");
  assert.equal(db.latestAccreditedDeclaration(user.id), null);

  await upload("property_deed");
  const before = w.workflow.events.length;
  const timeline = db.clientEvents.length;
  const ok = await declare({ basis: ["net_personal_assets"], ...full });
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).basis, ["net_personal_assets"]);
  assert.equal(w.workflow.events.length, before + 1);
  assert.match(w.workflow.events.at(-1).label, /declared accredited investor status/);
  assert.match(w.workflow.events.at(-1).label, /3 supporting documents/);
  const entry = db.clientEvents.at(-1);
  assert.equal(db.clientEvents.length, timeline + 1);
  assert.equal(entry.investor_id, user.id);
  assert.ok(entry.audience.includes("luca") && !entry.audience.includes("partner"));

  // The last choice is remembered, so the next sign-in starts from it.
  const last = (await (await request("investor/declaration", user)).json()).declaration;
  assert.equal(last.basis, "net_personal_assets");
  assert.deepEqual(last.evidence, evidence.optionFor("net_personal_assets").evidence);

  // Proof on file stays valid for six months, then fresh copies are needed.
  assert.equal((await declare({ basis: ["net_personal_assets"], ...full })).status, 200);
  const old = new Date();
  old.setMonth(old.getMonth() - 7);
  for (const doc of db.verificationDocumentsByInvestor[user.id]) doc.created_at = old.toISOString();
  const stale = await declare({ basis: ["net_personal_assets"], ...full });
  assert.equal(stale.status, 422);
  assert.match((await stale.json()).error, /Upload your proof/);

  assert.equal((await request("investor/declaration", manager(), "POST", {})).status, 401);
});

test("a new subscription is paid with a sub-fund reference, and a second one stays distinguishable", async () => {
  const user = investor();
  const first = (
    await (await request("subscriptions", user, "POST", { fund_id: 1, amount: "25000" })).json()
  ).subscription;
  assert.equal(first.payment_reference, "DASVCCII-SERAPONG-002");
  const second = (
    await (await request("subscriptions", user, "POST", { fund_id: 1, amount: "30000" })).json()
  ).subscription;
  assert.equal(second.payment_reference, "DASVCCII-SERAPONG-002-2");
  // Seeded subscriptions keep the references Ops already matches payments against.
  assert.match(db.subscriptions[0].payment_reference, /^AK-/);
});

test("confirmations: three statements, nothing gates them, each is logged against the two documents", async () => {
  const user = investor();
  const sub = (
    await (await request("subscriptions", user, "POST", { fund_id: 1, amount: "25000" })).json()
  ).subscription;
  const ack = () => request(`subscriptions/${sub.id}/acknowledgements`, user);
  const start = (await (await ack()).json()).acknowledgements;
  assert.deepEqual(
    start.documents.map((d) => d.kind),
    ["ppm", "term_sheet"],
    "the offering documents are the PPM and the term sheet",
  );
  assert.deepEqual(
    start.terms.map((t) => t.key),
    ["high_risk_illiquid", "acceptance_discretion", "accredited_status"],
  );
  assert.equal(start.required_count, 3);
  assert.doesNotMatch(JSON.stringify(start.terms), /reduced/);
  assert.doesNotMatch(JSON.stringify(start.terms), /right of first refusal/i);
  assert.doesNotMatch(
    start.terms.find((t) => t.key === "accredited_status").body,
    /retail/i,
    "the accredited confirmation no longer carries the retail-protections clause",
  );

  const accept = (term) =>
    request(`subscriptions/${sub.id}/acknowledgements`, user, "POST", {
      acknowledgement: { acknowledgement_term_id: term.id },
    });
  // A confirmation from an earlier version of the checkout is ignored, not required.
  const record = db.findSubscriptionById(sub.id);
  record.acknowledgements.unshift({ ...start.terms[0], id: 99, key: "read_documents" });
  const withRetired = (await (await ack()).json()).acknowledgements;
  assert.equal(withRetired.required_count, 3);
  assert.ok(!withRetired.terms.some((t) => t.key === "read_documents"));

  const events = w.workflow.events.length;
  for (const term of start.terms) assert.equal((await accept(term)).status, 200);
  assert.equal(
    (await (await ack()).json()).acknowledgements.complete,
    true,
    "all three ticked completes the step",
  );

  // Opening a document is still recorded, against the version the investor saw.
  const opened = await request(`subscriptions/${sub.id}/document_opened`, user, "POST", {
    kind: "term_sheet",
  });
  assert.ok(
    (await opened.json()).acknowledgements.documents.find((d) => d.kind === "term_sheet").opened_at,
  );
  assert.equal(
    (await request(`subscriptions/${sub.id}/document_opened`, user, "POST", { kind: "nonsense" }))
      .status,
    404,
  );

  // Who, when and against which document versions is kept on every confirmation.
  const kept = db
    .findSubscriptionById(sub.id)
    .acknowledgements.find((t) => t.key === "high_risk_illiquid");
  assert.equal(kept.accepted_by.email, user.email);
  assert.ok(kept.accepted_at);
  assert.deepEqual(Object.keys(kept.document_versions).sort(), ["ppm", "term_sheet"]);
  assert.ok(w.workflow.events.length > events);
  // Another investor cannot open documents on this subscription.
  assert.equal(
    (
      await request(
        `subscriptions/${sub.id}/document_opened`,
        db.users.find((u) => u.id === 3),
        "POST",
        {
          kind: "ppm",
        },
      )
    ).status,
    404,
  );
});

test("the transfer account and capital call reach the investor only once the agreement is signed", async () => {
  const user = investor();
  const sub = (
    await (await request("subscriptions", user, "POST", { fund_id: 1, amount: "25000" })).json()
  ).subscription;
  assert.equal(sub.transfer_account ?? null, null);
  assert.equal((await request(`subscriptions/${sub.id}/capital_call`, user)).status, 404);

  const record = db.findSubscriptionById(sub.id);
  w.recordSignature(record, "Fictional investor signature");
  record.status = "awaiting_funds";
  const shown = (await (await request(`subscriptions/${sub.id}`, user)).json()).subscription;
  assert.equal(
    shown.transfer_account.placeholder,
    true,
    "seeded accounts are labelled placeholders",
  );
  assert.match(shown.transfer_account.bank_name, /not a real bank/i);

  const call = (await (await request(`subscriptions/${sub.id}/capital_call`, user)).json())
    .capital_call;
  assert.equal(call.wire_reference, "DASVCCII-SERAPONG-002");
  assert.equal(call.commitment, "25000.00");
  assert.equal(Number(call.amount_due), Number(sub.amount) + Number(sub.subscription_fee));
  assert.match(call.fee_label, /^Placement Fee \(\d+(\.\d+)?%\)$/);
  assert.match(call.purpose, /acquisition of an interest in/);
  assert.doesNotMatch(call.purpose, /\.\./, "no doubled full stops in the purpose");
  assert.ok(new Date(call.due_date) > new Date(call.call_date));
  // The capital call is for the investor who owns it and the Fund Manager.
  assert.equal((await request(`subscriptions/${sub.id}/capital_call`, manager())).status, 200);
  assert.equal(
    (
      await request(
        `subscriptions/${sub.id}/capital_call`,
        db.users.find((u) => u.id === 3),
      )
    ).status,
    404,
  );
});

test("investor-facing status wording, offering defaults and US$ amounts", async () => {
  const { investorStatusLabel } = await import("../.test-runtime/src/lib/investor-status.mjs");
  const offering = await import("../.test-runtime/src/lib/offering.mjs");
  const currency = await import("../.test-runtime/src/lib/currency.mjs");
  const labels = Object.fromEntries(
    [
      "reserved",
      "documents_pending",
      "approved",
      "awaiting_funds",
      "payment_unmatched",
      "reconciliation",
      "allocation_pending",
      "not_allocated",
      "rejected",
      "funds_returned",
    ].map((status) => [status, investorStatusLabel(status)]),
  );
  assert.deepEqual(labels, {
    reserved: "Draft",
    documents_pending: "Draft",
    approved: "Agreement signed",
    awaiting_funds: "Awaiting funds",
    payment_unmatched: "Awaiting funds",
    reconciliation: "Funds received",
    allocation_pending: "Funds received",
    not_allocated: "Not accepted",
    rejected: "Not accepted",
    funds_returned: "Refund processed",
  });
  assert.equal(investorStatusLabel("allocation_pending", false, false), "Funds received");
  assert.equal(investorStatusLabel("allocation_pending", false, true), "Under review");
  assert.equal(investorStatusLabel("allocated", false), "Allocation confirmed");
  assert.equal(investorStatusLabel("allocated", true), "Accepted");

  const fund = db.findFundById(1);
  assert.equal(offering.fundLabel(fund), "DAS VCC II | Serapong Subfund");
  assert.equal(offering.offeringOf(fund).fund_code, "DASVCCII-SERAPONG");
  assert.equal(offering.paymentReferenceFor("DASVCCII-SERAPONG", 7), "DASVCCII-SERAPONG-007");
  assert.equal(offering.paymentReferenceFor("DASVCCII-SERAPONG", 1234), "DASVCCII-SERAPONG-1234");
  assert.match(
    offering.disclaimerText("DAS VCC II | Serapong Subfund"),
    /fund manager of DAS VCC II \| Serapong Subfund\./,
  );
  assert.match(offering.disclaimerText(), /funds offered on this platform/);

  // No cents on amounts; only distributions and per-unit rates carry them.
  assert.equal(currency.formatUsdPrecise(25000), "$25,000");
  assert.equal(currency.formatUsdCode(25000), "USD 25,000");
  assert.equal(currency.formatUsdPrecise("1234567.5"), "$1,234,568");
  assert.equal(currency.formatPricePrecise(338.13), "$338");
  assert.equal(currency.formatPriceCents(338.13), "$338.13");
  assert.equal(currency.formatAmountInput("25000"), "25,000");
  assert.equal(currency.formatPct("2"), "2.0%");
  assert.equal(currency.formatPct(1.55), "1.6%");
  assert.equal(currency.formatPct(null), "—");
  assert.equal(currency.isWholeThousands(26000), true);
  assert.equal(currency.isWholeThousands(25500), false);
  assert.equal(currency.isWholeThousands(25000.5), false);
  assert.equal(currency.formatAmountInput(""), "");
});

test("funds verified and allocation confirmed are two recorded decisions that only LUCA's console makes", async () => {
  const s = funded();
  const label = () => labelOf(db.toSubscription(db.findSubscriptionById(s.id)));
  const { subscriptionStatusLabel: labelOf } =
    await import("../.test-runtime/src/lib/investor-status.mjs");
  assert.equal(label(), "Funds received");
  // Nothing in the platform verifies funds or confirms an allocation by itself.
  w.command(ops(), { type: "complete-reconciliation", id: s.id });
  assert.equal(db.gatesOf(db.findSubscriptionById(s.id)).funds_verified, null);
  assert.equal(label(), "Funds received");

  const note = "Acclime confirmation received 14 Oct";
  w.command(manager(), { type: "verify-funds", id: s.id, text: note });
  const gates = db.gatesOf(db.findSubscriptionById(s.id));
  assert.equal(gates.funds_verified.note, note);
  assert.equal(gates.allocation_confirmed, null);
  assert.equal(label(), "Under review");
  assert.ok(db.toSubscription(db.findSubscriptionById(s.id)).funds_verified_at);
  assert.equal(db.toSubscription(db.findSubscriptionById(s.id)).allocation_confirmed_at, null);
  assert.ok(w.workflow.events.some((e) => /verified the funds for subscription/.test(e.label)));
  const inbox = (
    await (
      await request(
        "messages",
        db.users.find((u) => u.id === s.investor_id),
      )
    ).json()
  ).messages;
  assert.ok(inbox.some((m) => /funds are verified/.test(m.subject)));

  w.command(manager(), {
    type: "allocate",
    id: s.id,
    ...{ amount: Number(s.amount), price: w.allocationTerms(s).price },
  });
  const after = db.gatesOf(db.findSubscriptionById(s.id));
  assert.ok(after.allocation_confirmed.at && after.funds_verified.at);
  assert.equal(label(), "Allocation confirmed");
  assert.ok(
    w.workflow.events.some((e) => /confirmed the allocation for subscription/.test(e.label)),
  );
});

test("a late receipt reopens verification; declining needs no verification; history carries both gates", async () => {
  // A receipt matched after the funds were verified means they have to be verified again.
  const s = funded();
  w.command(manager(), { type: "verify-funds", id: s.id });
  const amount = 1000;
  w.command(ops(), {
    type: "receipt",
    id: s.id,
    amount,
    currency: s.currency,
    text: "LATE-TOP-UP",
  });
  const receipt = w.workflow.receipts.find((r) => r.reference === "LATE-TOP-UP");
  w.command(ops(), { type: "match", id: s.id, target: receipt.id });
  const reopened = db.findSubscriptionById(s.id);
  assert.equal(reopened.status, "reconciliation");
  assert.equal(db.gatesOf(reopened).funds_verified, null);
  assert.throws(
    () => w.command(manager(), { type: "verify-funds", id: s.id }),
    /complete reconciliation/,
  );

  // LUCA can decline a subscription it has not verified: nothing is accepted.
  const other = db.subscriptions.find((x) => x.status === "allocation_pending" && x.id !== s.id);
  w.command(manager(), { type: "decline-allocation", id: other.id, text: "Over-subscribed" });
  assert.equal(db.findSubscriptionById(other.id).status, "not_allocated");
  assert.equal(db.gatesOf(db.findSubscriptionById(other.id)).allocation_confirmed, null);

  // Subscriptions allocated before the gates existed carry them as recorded at allocation.
  const old = db.subscriptions.find((x) => x.status === "allocated" && !x.funds_verified);
  assert.ok(old);
  const gates = db.gatesOf(old);
  assert.ok(gates.funds_verified && gates.allocation_confirmed);
  assert.match(gates.funds_verified.by_name, /before the gates/);
  const admin = db.toAdminSubscription(old);
  assert.ok(admin.funds_verified && admin.allocation_confirmed);
});

test("receipts say who reported the funds, so Acclime's confirmation can be told from Ops' entry", async () => {
  const { receiptSource, receiptLabel, ACCLIME_CONFIRMATION_LABEL } =
    await import("../.test-runtime/src/lib/receipts.mjs");
  // Funds the demo already holds are the administrator's confirmation, not an Ops entry.
  const seeded = w.workflow.receipts.filter((r) => r.reference.startsWith("MIGRATED-"));
  assert.ok(seeded.length > 0);
  for (const r of seeded) {
    assert.equal(receiptSource(r), "acclime");
    assert.equal(receiptLabel(r), ACCLIME_CONFIRMATION_LABEL);
    assert.equal(r.acclimeMessageId, null, "ready to point at the Acclime message when it exists");
  }
  assert.equal(ACCLIME_CONFIRMATION_LABEL, "Acclime fund admin confirmation");
  // Saved states from before receipts carried a source resolve the same way.
  assert.equal(receiptSource({ reference: "MIGRATED-9" }), "acclime");
  assert.equal(receiptSource({ reference: "WIRE-12345" }), "ops");

  // A receipt Ops keys in keeps the reference Ops typed.
  const s = db.subscriptions.find((x) => x.status === "awaiting_funds");
  w.command(ops(), {
    type: "receipt",
    id: s.id,
    amount: 100,
    currency: s.currency,
    text: "WIRE-12345",
  });
  const keyed = w.workflow.receipts.find((r) => r.reference === "WIRE-12345");
  assert.equal(keyed.source, "ops");
  assert.equal(receiptLabel(keyed), "WIRE-12345");
});

/* ─── Acclime: the pack, the messages, refunds and NAV ─── */

async function submittedSubscription(amount = "25000") {
  const user = investor();
  const created = (
    await (await request("subscriptions", user, "POST", { fund_id: 1, amount })).json()
  ).subscription;
  const record = db.findSubscriptionById(created.id);
  w.recordSignature(record, "Fictional investor signature");
  record.status = "awaiting_funds";
  return record;
}
const acclime = (message, user = manager()) =>
  request("admin/acclime/messages", user, "POST", message);
const payable = (s) => Number(s.amount) + Number(s.subscription_fee);

test("submitting a subscription records the pack sent to Acclime and LUCA, once", async () => {
  const s = await submittedSubscription();
  assert.equal(w.workflow.packs.length, 0);
  const submit = () =>
    request(`subscriptions/${s.id}`, investor(), "PATCH", { payment_declared: true });
  assert.equal((await submit()).status, 200);
  const pack = w.workflow.packs.find((p) => p.subscriptionId === s.id);
  assert.ok(pack);
  assert.deepEqual(
    pack.items.map((i) => i.kind),
    ["signed_agreement", "kyc", "cdd", "payment_reference"],
  );
  assert.equal(pack.items.find((i) => i.kind === "payment_reference").detail, s.payment_reference);
  assert.match(pack.items[0].detail, /Signed by Fictional investor signature/);
  assert.deepEqual(
    pack.recipients.map((r) => r.name),
    ["Acclime", "LUCA SGP"],
  );
  await submit();
  assert.equal(w.workflow.packs.filter((p) => p.subscriptionId === s.id).length, 1);
  // Only the Fund Manager reads what Acclime sent and received.
  assert.equal((await (await request("workflows", investor())).json()).packs.length, 0);
  assert.equal((await (await request("workflows", ops())).json()).acclimeMessages.length, 0);
  assert.ok((await (await request("workflows", manager())).json()).packs.length > 0);
});

test("Acclime funds, acceptance and duplicates: LUCA's two decisions stay LUCA's", async () => {
  const s = await submittedSubscription();
  const total = payable(s);
  const funds = (over = {}) => ({
    type: "funds_confirmed",
    external_id: "ACC-F-1",
    channel: "feed",
    payload: {
      payment_reference: s.payment_reference,
      amount: total,
      bank_reference: "ACC-RCPT-1",
      ...over,
    },
  });

  // Only the Fund Manager's console receives messages; nothing malformed is kept.
  assert.equal((await acclime(funds(), ops())).status, 403);
  assert.equal((await acclime(funds(), investor())).status, 403);
  const before = w.workflow.acclimeMessages.length;
  assert.equal(
    (await acclime({ type: "funds_confirmed", payload: { payment_reference: "X" } })).status,
    422,
  );
  assert.equal((await acclime({ type: "nonsense", payload: {} })).status, 422);
  assert.equal(w.workflow.acclimeMessages.length, before);

  // A reference nobody has, and a wrong currency, are kept but applied to nothing.
  const unknown = (await (await acclime(funds({ payment_reference: "NOPE-1" }))).json()).message;
  assert.equal(unknown.status, "needs_attention");
  assert.equal(db.findSubscriptionById(s.id).status, "awaiting_funds");
  const wrongCurrency = (
    await (await acclime({ ...funds({ currency: "SGD" }), external_id: "ACC-F-2" })).json()
  ).message;
  assert.equal(wrongCurrency.status, "needs_attention");

  // Full funds: a receipt from Acclime, reconciliation complete, ready for LUCA, nothing decided.
  const ok = (await (await acclime(funds())).json()).message;
  assert.equal(ok.status, "applied");
  const record = db.findSubscriptionById(s.id);
  assert.equal(record.status, "allocation_pending");
  const receipt = w.workflow.receipts.find((r) => r.reference === "ACC-RCPT-1");
  assert.equal(receipt.source, "acclime");
  assert.equal(receipt.acclimeMessageId, ok.id, "the receipt points at the message it came from");
  assert.equal(db.gatesOf(record).funds_verified, null);
  assert.equal(db.gatesOf(record).allocation_confirmed, null);

  // A message that could not be applied can be sent again under the same id once it can.
  assert.equal(unknown.external_id, "ACC-F-1");
  assert.equal(ok.external_id, "ACC-F-1", "the retry used the id of the failed attempt");

  // The same Acclime id, or the same bank reference, is never applied twice.
  const again = (await (await acclime(funds())).json()).message;
  assert.equal(again.status, "duplicate");
  const sameBank = (await (await acclime({ ...funds(), external_id: "ACC-F-3" })).json()).message;
  assert.equal(sameBank.status, "duplicate");
  assert.equal(w.workflow.receipts.filter((r) => r.subscriptionId === s.id).length, 1);

  // Acceptance means nothing until LUCA has confirmed the allocation.
  const accept = (over = {}, id = "ACC-A-1") => ({
    type: "acceptance",
    external_id: id,
    channel: "feed",
    payload: {
      payment_reference: s.payment_reference,
      units: Number(s.amount) / w.allocationTerms(record).price,
      price: w.allocationTerms(record).price,
      ...over,
    },
  });
  assert.equal(
    (await (await acclime(accept({}, "ACC-A-0"))).json()).message.status,
    "needs_attention",
  );
  assert.ok(!db.findSubscriptionById(s.id)._convertedToHoldingId);
  w.command(manager(), { type: "verify-funds", id: s.id });
  const terms = w.allocationTerms(record);
  w.command(manager(), { type: "allocate", id: s.id, amount: terms.capital, price: terms.price });

  // Units that do not match what LUCA allocated are not issued.
  const wrong = (await (await acclime(accept({ units: 1 }, "ACC-A-2"))).json()).message;
  assert.equal(wrong.status, "needs_attention");
  assert.match(wrong.outcome, /Nothing was issued/);
  assert.ok(!db.findSubscriptionById(s.id)._convertedToHoldingId);
  const issued = (await (await acclime(accept({}, "ACC-A-3"))).json()).message;
  assert.equal(issued.status, "applied");
  assert.ok(
    db.findSubscriptionById(s.id)._convertedToHoldingId,
    "Acclime's acceptance issues the holding",
  );
  assert.equal((await (await acclime(accept({}, "ACC-A-4"))).json()).message.status, "duplicate");
});

test("Ops' own receipts and Acclime's confirmation never double-count", async () => {
  const s = await submittedSubscription();
  const total = payable(s);
  w.command(ops(), {
    type: "receipt",
    id: s.id,
    amount: total,
    currency: s.currency,
    text: "WIRE-77",
  });
  const receipt = w.workflow.receipts.find((r) => r.reference === "WIRE-77");
  w.command(ops(), { type: "match", id: s.id, target: receipt.id });
  w.command(ops(), { type: "complete-reconciliation", id: s.id });
  assert.equal(db.findSubscriptionById(s.id).status, "allocation_pending");
  // Acclime then confirms the same money under its own reference: shown, flagged, and the
  // subscription is reopened for verification rather than silently counted twice.
  const late = (
    await (
      await acclime({
        type: "funds_confirmed",
        external_id: "ACC-F-9",
        payload: {
          payment_reference: s.payment_reference,
          amount: total,
          bank_reference: "ACC-RCPT-9",
        },
      })
    ).json()
  ).message;
  assert.equal(late.status, "needs_attention");
  assert.match(late.outcome, /more than the .* payable/);
});

test("Acclime's due diligence result blocks, clears or asks for more", async () => {
  const s = await submittedSubscription();
  await acclime({
    type: "funds_confirmed",
    external_id: "ACC-F-C",
    payload: {
      payment_reference: s.payment_reference,
      amount: payable(s),
      bank_reference: "ACC-RCPT-C",
    },
  });
  const cdd = (result, note, id) =>
    acclime({
      type: "cdd_result",
      external_id: id,
      payload: { payment_reference: s.payment_reference, result, note },
    });

  assert.equal(
    (await (await cdd("fail", "Source of wealth not evidenced", "C-1")).json()).message.status,
    "needs_attention",
  );
  assert.throws(
    () => w.command(manager(), { type: "verify-funds", id: s.id }),
    /due diligence check failed: Source of wealth not evidenced/,
  );
  assert.equal(
    (await (await cdd("fail", "Source of wealth not evidenced", "C-1b")).json()).message.status,
    "duplicate",
  );

  // More documents: a request goes to the investor, and acceptance waits for them.
  const more = (
    await (await cdd("more_documents", "Bank statement for the last 6 months", "C-2")).json()
  ).message;
  assert.equal(more.status, "needs_attention");
  const request_ = db.documentRequests.find(
    (r) => r.id === db.findSubscriptionById(s.id).cdd.request_id,
  );
  assert.equal(request_.status, "requested");
  assert.throws(
    () => w.command(manager(), { type: "verify-funds", id: s.id }),
    /additional due diligence documents/,
  );
  request_.status = "received";
  const cleared = (await (await cdd("pass", null, "C-3")).json()).message;
  assert.equal(cleared.status, "applied");
  w.command(manager(), { type: "verify-funds", id: s.id });
  assert.ok(db.gatesOf(db.findSubscriptionById(s.id)).funds_verified);
});

test("a declined subscription is refunded in full, and Acclime's confirmation marks it paid", async () => {
  const s = await submittedSubscription();
  const total = payable(s);
  await acclime({
    type: "funds_confirmed",
    external_id: "ACC-F-R",
    payload: {
      payment_reference: s.payment_reference,
      amount: total,
      bank_reference: "ACC-RCPT-R",
    },
  });
  w.command(manager(), {
    type: "decline-allocation",
    id: s.id,
    text: "The underlying share transaction did not complete",
  });
  const refund = (over = {}, id = "ACC-R-1") =>
    acclime({
      type: "refund_processed",
      external_id: id,
      payload: {
        payment_reference: s.payment_reference,
        amount: total,
        bank_reference: "ACC-REF-1",
        ...over,
      },
    });
  let summary = w.refundSummaryOf(s.id);
  assert.equal(summary.status, "due");
  assert.equal(summary.amount, total, "the subscription fee is refunded with the capital");

  // The wrong amount is flagged and nothing is marked paid.
  assert.equal(
    (await (await refund({ amount: total - 100 })).json()).message.status,
    "needs_attention",
  );
  assert.equal(w.refundSummaryOf(s.id).status, "due");

  const paid = (await (await refund({}, "ACC-R-2")).json()).message;
  assert.equal(paid.status, "applied");
  summary = w.refundSummaryOf(s.id);
  assert.equal(summary.status, "processed");
  assert.equal(summary.confirmed_by, "acclime");
  assert.equal(summary.reference, "ACC-REF-1");
  assert.equal(db.findSubscriptionById(s.id).status, "funds_returned");
  const { subscriptionStatusLabel } = await import("../.test-runtime/src/lib/investor-status.mjs");
  assert.equal(
    subscriptionStatusLabel(db.toSubscription(db.findSubscriptionById(s.id))),
    "Refund processed",
  );
  assert.equal((await (await refund({}, "ACC-R-3")).json()).message.status, "duplicate");
  // The investor is told, in the platform.
  const inbox = (await (await request("messages", investor())).json()).messages;
  assert.ok(inbox.some((m) => /refund has been processed/.test(m.subject)));
});

test("Ops confirming a refund through its own screens reads as processed, by Ops", async () => {
  const s = await submittedSubscription();
  await acclime({
    type: "funds_confirmed",
    external_id: "ACC-F-O",
    payload: {
      payment_reference: s.payment_reference,
      amount: payable(s),
      bank_reference: "ACC-RCPT-O",
    },
  });
  w.command(manager(), { type: "decline-allocation", id: s.id, text: "Over-subscribed" });
  const obligation = w.workflow.returns.find((r) => r.subscriptionId === s.id);
  w.command(ops(), { type: "return", id: s.id, target: obligation.id, status: "processing" });
  assert.equal(w.refundSummaryOf(s.id).status, "processing");
  w.command(ops(), { type: "return", id: s.id, target: obligation.id, status: "confirmed" });
  const summary = w.refundSummaryOf(s.id);
  assert.equal(summary.status, "processed");
  assert.equal(summary.confirmed_by, "ops");
  // A later Acclime message for the same refund changes nothing.
  const late = (
    await (
      await acclime({
        type: "refund_processed",
        external_id: "ACC-R-LATE",
        payload: {
          payment_reference: s.payment_reference,
          amount: payable(s),
          bank_reference: "ACC-REF-L",
        },
      })
    ).json()
  ).message;
  assert.equal(late.status, "duplicate");
});

test("the monthly NAV updates every issued holding in the sub-fund, once a month", async () => {
  const held = db.holdings.filter((h) => h.fund_id === 1 && h.state === "held");
  assert.ok(held.length > 0);
  const nav = (navPerUnit, as_of, id) =>
    acclime({
      type: "nav",
      external_id: id,
      channel: "feed",
      payload: { fund_id: 1, as_of, nav_per_unit: navPerUnit },
    });
  const applied = (await (await nav(210, "2026-09-30", "NAV-2026-09")).json()).message;
  assert.equal(applied.status, "applied");
  for (const h of held) {
    assert.equal(Number(h.current_nav), Math.round(Number(h.units) * 210 * 100) / 100);
    assert.equal(h.nav_as_of.slice(0, 10), "2026-09-30");
  }
  assert.equal(w.workflow.navRecords.at(-1).holdingsUpdated, held.length);
  // The investor's own history carries the new month.
  const history = w.portfolioHistory(db.users.find((u) => u.id === held[0].investor_id));
  assert.ok(JSON.stringify(history).includes("2026-09-30"));

  assert.equal(
    (await (await nav(210, "2026-09-30", "NAV-2026-09-b")).json()).message.status,
    "duplicate",
  );
  const changed = (await (await nav(215, "2026-09-30", "NAV-2026-09-c")).json()).message;
  assert.equal(changed.status, "needs_attention");
  assert.equal(Number(held[0].current_nav), Math.round(Number(held[0].units) * 210 * 100) / 100);
  assert.equal(
    (await (await nav(220, "2026-10-31", "NAV-2026-10")).json()).message.status,
    "applied",
  );
  assert.equal(
    (
      await (
        await acclime({
          type: "nav",
          payload: { fund_id: 9999, as_of: "2026-10-31", nav_per_unit: 1 },
        })
      ).json()
    ).message.status,
    "needs_attention",
  );
  assert.equal(
    (await acclime({ type: "nav", payload: { fund_id: 1, as_of: "not a date", nav_per_unit: 1 } }))
      .status,
    422,
  );
});

test("the Clients tab compares each client's latest NAV with the capital committed to their holdings", async () => {
  const { buildPartnerBook } =
    await import("../.test-runtime/src/features/partners/partner-data.mjs");
  await acclime({
    type: "nav",
    channel: "feed",
    external_id: "NAV-CLIENTS",
    payload: { fund_id: 1, as_of: "2026-09-30", nav_per_unit: 250 },
  });
  const view = await (await request("workflows", manager())).json();
  const book = buildPartnerBook(view);
  const mine = (id) => db.holdings.filter((h) => h.investor_id === id);
  const holder = book.all.clients.find((c) =>
    mine(c.id).some((h) => h.fund_id === 1 && h.state === "held"),
  );
  assert.ok(holder);
  const round2 = (n) => Math.round(n * 100) / 100;
  // Measured against the capital committed to every holding the client has issued.
  assert.equal(
    holder.navCost,
    mine(holder.id).reduce((n, h) => n + Number(h.committed_amount), 0),
  );
  assert.equal(
    round2(holder.navValue),
    round2(mine(holder.id).reduce((n, h) => n + Number(h.current_nav), 0)),
  );
  // The monthly NAV is what values the holdings in that sub-fund.
  for (const h of mine(holder.id).filter((h) => h.fund_id === 1 && h.state === "held"))
    assert.equal(Number(h.current_nav), round2(Number(h.units) * 250));
  // The totals above a client (fund, project, everyone) add the same figures up.
  const fund = book.all.projects.flatMap((p) => p.funds).find((f) => f.fundId === 1);
  assert.equal(
    Math.round(fund.navValue * 100) / 100,
    Math.round(fund.clients.reduce((n, c) => n + c.navValue, 0) * 100) / 100,
  );
  // A client with nothing issued has no NAV to compare.
  const none = book.all.clients.find((c) => c.holdings.length === 0);
  assert.equal(none.navCost, 0);
  assert.equal(none.navValue, 0);
});

test("accredited investor evidence: one choice, its own documents, and what reaches the Fund Manager", async () => {
  const evidence = await import("../.test-runtime/src/lib/accredited-evidence.mjs");
  const catalogue = await import("../.test-runtime/src/lib/document-catalogue.mjs");

  // Each way of qualifying has its own list, and every list ends with the source of wealth.
  assert.deepEqual(evidence.optionFor("income").evidence, [
    "notice_of_assessment",
    "source_of_wealth",
  ]);
  assert.deepEqual(evidence.optionFor("net_financial_assets").evidence, [
    "bank_statement",
    "source_of_wealth",
  ]);
  assert.deepEqual(evidence.optionFor("net_personal_assets").evidence, [
    "bank_statement",
    "property_deed",
    "source_of_wealth",
  ]);
  assert.deepEqual(evidence.optionFor("entity_net_assets").evidence, [
    "financial_statements",
    "source_of_wealth",
  ]);
  for (const option of evidence.QUALIFYING_OPTIONS) {
    assert.ok(option.evidence.at(-1) === "source_of_wealth");
    for (const kind of option.evidence)
      assert.notEqual(catalogue.documentKindLabel(kind), kind, `${kind} has a readable name`);
  }

  // What is missing depends on the choice, and an older upload is replaced by a newer one.
  const now = Date.parse("2026-10-16T00:00:00Z");
  const docs = [
    { document_type: "bank_statement", created_at: "2026-09-01T00:00:00Z" },
    { document_type: "property_deed", created_at: "2026-03-01T00:00:00Z" },
    { document_type: "property_deed", created_at: "2026-10-01T00:00:00Z" },
  ];
  assert.deepEqual(evidence.missingEvidence("net_personal_assets", docs, now), [
    "source_of_wealth",
  ]);
  assert.deepEqual(evidence.missingEvidence("income", docs, now), [
    "notice_of_assessment",
    "source_of_wealth",
  ]);
  assert.deepEqual(evidence.missingEvidence("unknown", docs, now), []);
  assert.equal(evidence.isCurrent("2026-04-17T00:00:00Z", now), true);
  assert.equal(evidence.isCurrent("2026-04-15T00:00:00Z", now), false, "older than six months");

  // Uploads of every kind are accepted, anything else is not, and each reaches LUCA's queue.
  const user = investor();
  const file = "data:application/pdf;base64,JVBERi0xLjQK";
  const upload = (kind) =>
    request("onboarding/documents", user, "POST", {
      name: `${kind}.pdf`,
      kind,
      file_data_url: file,
    });
  for (const kind of evidence.EVIDENCE_KINDS) assert.equal((await upload(kind)).status, 200, kind);
  assert.equal((await upload("not_a_document")).status, 422);
  const mine = db.documents.filter(
    (d) => d.owner_id === user.id && evidence.EVIDENCE_KINDS.includes(d.kind),
  );
  assert.deepEqual(mine.map((d) => d.kind).sort(), [...evidence.EVIDENCE_KINDS].sort());
  assert.ok(
    mine.every((d) => d.review_state === "received"),
    "each waits for LUCA's review",
  );
  const listed = (await (await request("admin/documents", manager())).json()).documents;
  for (const doc of mine)
    assert.ok(
      listed.some((d) => d.id === doc.id),
      `${doc.kind} is listed`,
    );
  assert.equal(catalogue.documentKindLabel("source_of_wealth"), "Source of wealth declaration");
});

test("eligibility, NDA and consents: caught before a subscription starts, and at allocation rather than when verifying funds", async () => {
  const readiness = await import("../.test-runtime/src/lib/subscription-readiness.mjs");
  assert.deepEqual(
    readiness.readinessIssues({
      kyc_status: "approved",
      nda_status: "signed",
      missing_consents: [],
    }),
    [],
  );
  const everything = readiness.readinessIssues({
    kyc_status: "pending",
    nda_status: "not_started",
    missing_consents: ["Privacy notice", "Electronic delivery"],
  });
  assert.deepEqual(
    everything.map((i) => i.key),
    ["identity", "nda", "consents"],
  );
  assert.match(everything[2].detail, /Privacy notice, Electronic delivery/);

  // Before: an investor missing a required consent cannot start, and is told which one.
  const user = investor();
  const status = async () => (await request("investor/subscription_readiness", user)).json();
  assert.equal((await status()).ready, true);
  const consent = db.consentsForUser(user.id).find((c) => c.required && c.granted);
  db.withdrawConsent(user.id, consent.id);
  const blocked = await status();
  assert.equal(blocked.ready, false);
  assert.deepEqual(
    blocked.issues.map((i) => i.key),
    ["consents"],
  );
  assert.ok(blocked.issues[0].detail.includes(consent.title));
  const attempt = await request("subscriptions", user, "POST", { fund_id: 1, amount: "25000" });
  assert.equal(attempt.status, 422);
  const refused = await attempt.json();
  assert.match(refused.error, /cannot subscribe yet/);
  assert.equal(refused.issues.length, 1);
  db.grantConsent(user.id, consent.id);
  assert.equal((await status()).ready, true);
  assert.equal(
    (await request("subscriptions", user, "POST", { fund_id: 1, amount: "25000" })).status,
    200,
  );
  assert.equal((await request("investor/subscription_readiness", manager())).status, 401);

  // After: if it lapses while the funds are in, verifying the funds still works and the
  // allocation is what stops.
  const s = funded();
  const owner = db.users.find((u) => u.id === s.investor_id);
  const lapsed = db.consentsForUser(owner.id).find((c) => c.required && c.granted);
  db.withdrawConsent(owner.id, lapsed.id);
  const live = (await (await request("workflows", manager())).json()).subscriptions.find(
    (x) => x.id === s.id,
  );
  assert.ok(!live.verificationBlockers.some((b) => /remain approved/.test(b)));
  assert.ok(live.allocationBlockers.some((b) => /remain approved/.test(b)));
  const command = (body) => request("workflows", manager(), "POST", { id: s.id, ...body });
  assert.equal((await command({ type: "verify-funds" })).status, 200);
  const terms = w.allocationTerms(db.findSubscriptionById(s.id));
  const stopped = await command({ type: "allocate", amount: terms.capital, price: terms.price });
  assert.equal(stopped.status, 422);
  assert.match((await stopped.json()).error, /remain approved/);
  db.grantConsent(owner.id, lapsed.id);
  assert.equal(
    (await command({ type: "allocate", amount: terms.capital, price: terms.price })).status,
    200,
  );
});

test("an expired accreditation proof stops a subscription and an allocation, not the verification of funds", async () => {
  const readiness = await import("../.test-runtime/src/lib/subscription-readiness.mjs");
  const lapsed = readiness.readinessIssues({
    kyc_status: "approved",
    nda_status: "signed",
    missing_consents: [],
    accreditation_lapsed: true,
  });
  assert.deepEqual(
    lapsed.map((i) => i.key),
    ["accreditation"],
  );
  assert.equal(lapsed[0].to, "/accredited-investor?renew=1");

  const proof = (investorId, kinds, at) => {
    db.verificationDocumentsByInvestor[investorId] = kinds.map((document_type) => ({
      id: db.nextDocumentId(),
      document_type,
      status: "pending",
      notes: `${document_type}.pdf`,
      has_file: true,
      created_at: at,
    }));
  };
  const monthsAgo = (n) => {
    const d = new Date();
    d.setMonth(d.getMonth() - n);
    return d.toISOString();
  };
  const kinds = ["notice_of_assessment", "source_of_wealth"];

  // Starting a subscription: no declaration on record is not held up; a lapsed proof is.
  const user = investor();
  const ready = async () => (await request("investor/subscription_readiness", user)).json();
  assert.equal((await ready()).ready, true, "no declaration on record");
  db.recordAccreditedDeclaration(user.id, "income", kinds);
  proof(user.id, kinds, monthsAgo(1));
  assert.equal((await ready()).ready, true, "current proof");
  proof(user.id, kinds, monthsAgo(7));
  const stale = await ready();
  assert.deepEqual(
    stale.issues.map((i) => i.key),
    ["accreditation"],
  );
  const attempt = await request("subscriptions", user, "POST", { fund_id: 1, amount: "25000" });
  assert.equal(attempt.status, 422);
  assert.match((await attempt.json()).error, /accreditation proof has expired/);
  proof(user.id, kinds, monthsAgo(0));
  assert.equal((await ready()).ready, true, "renewed proof");

  // Confirming an allocation: the proof lapsed while the funds were in.
  const s = funded();
  const owner = db.users.find((u) => u.id === s.investor_id);
  db.recordAccreditedDeclaration(owner.id, "income", kinds);
  proof(owner.id, kinds, monthsAgo(8));
  const live = async () =>
    (await (await request("workflows", manager())).json()).subscriptions.find((x) => x.id === s.id);
  let view = await live();
  assert.ok(!view.verificationBlockers.some((b) => /accreditation proof/.test(b)));
  assert.ok(view.allocationBlockers.some((b) => /accreditation proof has expired/.test(b)));
  const command = (body) => request("workflows", manager(), "POST", { id: s.id, ...body });
  assert.equal((await command({ type: "verify-funds" })).status, 200);
  const terms = w.allocationTerms(db.findSubscriptionById(s.id));
  const stopped = await command({ type: "allocate", amount: terms.capital, price: terms.price });
  assert.equal(stopped.status, 422);
  assert.match((await stopped.json()).error, /accreditation proof has expired/);
  proof(owner.id, kinds, monthsAgo(0));
  assert.equal(
    (await command({ type: "allocate", amount: terms.capital, price: terms.price })).status,
    200,
  );
});

test("the Fund Manager sees Acclime's acceptance of the investor once it is recorded", async () => {
  const s = funded();
  const view = async () =>
    (await (await request("workflows", manager())).json()).subscriptions.find((x) => x.id === s.id);
  assert.equal((await view()).acclimeDueDiligence, null, "nothing recorded yet");
  const sent = await request("admin/acclime/messages", manager(), "POST", {
    type: "cdd_result",
    payload: { payment_reference: s.payment_reference, result: "pass" },
  });
  assert.equal(sent.status, 201);
  const accepted = (await view()).acclimeDueDiligence;
  assert.equal(accepted.result, "pass");
  assert.ok(accepted.at);
  await request("admin/acclime/messages", manager(), "POST", {
    type: "cdd_result",
    payload: { payment_reference: s.payment_reference, result: "fail", note: "Adverse media" },
  });
  assert.equal((await view()).acclimeDueDiligence.result, "fail");
});

test("distributions: the Fund Manager records them, each payment is confirmed, and the investor's holdings follow", async () => {
  const dist = await import("../.test-runtime/src/lib/distributions.mjs");
  assert.deepEqual(
    dist
      .planDistribution(
        [
          { holdingId: 1, investorId: 2, units: 80.4 },
          { holdingId: 2, investorId: 3, units: 0.001 },
        ],
        1.25,
      )
      .map((l) => l.amount),
    [100.5],
    "pro rata to the cent, and nobody is paid nothing",
  );

  // A fund with issued holdings.
  const byFund = new Map();
  for (const h of db.holdings.filter((x) => x.state === "held"))
    byFund.set(h.fund_id, [...(byFund.get(h.fund_id) ?? []), h]);
  // A fund the demo investor holds, so the result can be read back through their own session.
  const [fundId, held] = [...byFund.entries()].find(([, rows]) =>
    rows.some((h) => h.investor_id === investor().id),
  );
  const record = (user, distribution, id = fundId) =>
    request("workflows", user, "POST", { type: "record-distribution", id, distribution });
  const income = {
    kind: "income",
    perUnit: 1.25,
    recordDate: "2026-09-30",
    fullExit: false,
    exitRoute: null,
    note: "Q3",
  };

  // Only the Fund Manager records them, with sensible details.
  for (const user of [investor(), ops(), rm(), db.users.find((u) => u.role === "investment_team")])
    assert.equal((await record(user, income)).status, 422, user.role);
  assert.equal((await record(manager(), { ...income, perUnit: 0 })).status, 422);
  assert.equal((await record(manager(), { ...income, recordDate: "soon" })).status, 422);
  assert.equal((await record(manager(), { ...income, kind: "bonus" })).status, 422);
  assert.equal((await record(manager(), income, 999999)).status, 422);
  assert.equal((await record(manager(), income)).status, 200);

  const events = async (user) => (await (await request("workflows", user)).json()).distributions;
  const event = (await events(manager())).at(-1);
  assert.equal(event.lines.length, held.length);
  for (const line of event.lines) {
    const holding = held.find((h) => h.id === line.holdingId);
    assert.equal(line.amount, Math.round(Number(holding.units) * 1.25 * 100) / 100);
    assert.equal(line.status, "due");
  }
  for (const user of [investor(), ops(), rm()])
    assert.deepEqual(await events(user), [], `${user.role} does not see the ledger`);

  // Confirming one payment updates that holder's holding and tells them.
  const first = event.lines.find((l) => l.investorId === investor().id);
  const owner = investor();
  const holding = db.holdings.find((h) => h.id === first.holdingId);
  const before = Number(holding.distributions);
  const confirm = (body) =>
    request("workflows", manager(), "POST", {
      type: "confirm-distribution",
      id: event.id,
      ...body,
    });
  assert.equal((await confirm({ target: first.id })).status, 422, "a reference is needed");
  assert.equal((await confirm({ target: first.id, text: "ACC-PAY-1" })).status, 200);
  assert.equal(
    Number(db.holdings.find((h) => h.id === first.holdingId).distributions),
    before + first.amount,
  );
  const shown = (await (await request("holdings", owner)).json()).holdings.find(
    (h) => h.id === holding.id,
  );
  assert.equal(shown.distribution_payments[0].amount, first.amount);
  assert.equal(shown.distribution_payments[0].kind, "income");
  assert.equal(shown.state, "held", "income does not close a holding");
  const mail = (await (await request("messages", owner)).json()).messages;
  assert.match(mail[0].subject, /Income distribution paid/);
  assert.equal((await confirm({ target: first.id, text: "ACC-PAY-1" })).status, 422, "only once");

  // The rest, in one go.
  if (event.lines.length > 1) assert.equal((await confirm({ text: "ACC-BATCH" })).status, 200);
  assert.ok(dist.eventTotals((await events(manager()))[0]).settled || event.lines.length === 1);

  // Exit proceeds close the holding in the investor's portfolio.
  const exit = {
    kind: "exit_proceeds",
    perUnit: 2,
    recordDate: "2026-10-10",
    fullExit: true,
    exitRoute: "acquisition",
    note: null,
  };
  assert.equal((await record(manager(), exit)).status, 200);
  const exitEvent = (await events(manager())).findLast((e) => e.kind === "exit_proceeds");
  assert.equal((await confirm2(exitEvent.id, { text: "ACC-EXIT" })).status, 200);
  function confirm2(id, body) {
    return request("workflows", manager(), "POST", { type: "confirm-distribution", id, ...body });
  }
  const closed = db.holdings.find((h) => h.id === exitEvent.lines[0].holdingId);
  assert.equal(closed.state, "realized");
  assert.equal(closed.exit_type, "acquisition");
  assert.ok(closed.exit_date);
  assert.equal(Number(closed.final_proceeds), exitEvent.lines[0].amount);
  assert.equal(
    closed.moic,
    (Number(closed.distributions) / Number(closed.committed_amount)).toFixed(2),
  );
  const exited = db.users.find((u) => u.id === closed.investor_id);
  const shownExit = (await (await request("holdings", exited)).json()).holdings.find(
    (h) => h.id === closed.id,
  );
  assert.equal(shownExit.state, "realized");
  assert.ok(shownExit.distribution_payments.some((p) => p.kind === "exit_proceeds"));
  assert.match(
    (await (await request("messages", exited)).json()).messages[0].subject,
    /holding has been realised/,
  );
  // Nothing is left to pay on a fund whose holdings have all been sold.
  assert.equal((await record(manager(), income)).status, 422);
});

test("seeded payouts: past distributions are already paid and match each investor's holdings", async () => {
  const dist = await import("../.test-runtime/src/lib/distributions.mjs");
  const seeded = w.workflow.distributions.filter((e) => e.id >= 9001 && e.id <= 9004);
  assert.equal(seeded.length, 4);
  assert.ok(seeded.every((e) => dist.eventTotals(e).settled && e.lines.every((l) => l.reference)));
  const received = new Map();
  for (const e of seeded)
    for (const l of e.lines) received.set(l.holdingId, (received.get(l.holdingId) ?? 0) + l.amount);
  for (const [holdingId, total] of received) {
    const holding = db.holdings.find((h) => h.id === holdingId);
    // Holdings seeded before this test file's other cases may have received later payments too.
    assert.ok(
      Number(holding.distributions) >= total - 0.005,
      `holding ${holdingId} ${holding.distributions} ${total}`,
    );
  }
  const exit = seeded.find((e) => e.kind === "exit_proceeds");
  const closed = db.holdings.find((h) => h.id === exit.lines[0].holdingId);
  assert.equal(closed.state, "realized");
  assert.equal(Number(closed.final_proceeds), exit.lines[0].amount);
  // The demo investor sees those payments against their own holdings.
  const mine = (await (await request("holdings", investor())).json()).holdings;
  assert.ok(mine.some((h) => h.distribution_payments.some((p) => p.kind === "exit_proceeds")));
  assert.ok(mine.find((h) => h.id === 2).distribution_payments.length >= 2);
});
