import fs from "node:fs";
import assert from "node:assert/strict";
import * as db from "../.test-runtime/src/mocks/db.mjs";
import * as w from "../.test-runtime/src/mocks/workflow.mjs";
import { handlers } from "../.test-runtime/src/mocks/handlers/index.mjs";
w.seedWorkflow();
const initial = db.exportDemoState(),
  workflow = structuredClone(w.workflow);
function reset() {
  db.restoreDemoState(initial);
  Object.assign(w.workflow, structuredClone(workflow));
}
async function request(route, role, method = "GET", body) {
  const user = db.users.find((u) => u.role === role);
  const request = new Request("http://localhost:3000/api/v1/" + route, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${db.tokenFor(user.id)}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  for (const h of handlers)
    if (await h.test({ request: request.clone() })) {
      const result = await h.run({ request: request.clone(), requestId: crypto.randomUUID() });
      if (result?.response) return result.response;
    }
  return null;
}
const findings = [];
// In-memory fixtures only. No app browser storage or published commercial data is changed.
reset();
const fund = db.findFundById(1201),
  approvedFee = w.currentVersion(1201).snapshot.subscription_fee_pct;
fund.subscription_fee_pct = "2.75";
const eamWorking = await (await request("eam/opportunities/1201", "eam")).json();
const investorApproved = await (await request("funds/1201", "investor")).json();
assert.equal(eamWorking.fund.subscription_fee_pct, "2.75");
assert.equal(investorApproved.fund.subscription_fee_pct, approvedFee);
findings.push({
  id: "A03",
  result: "reproduced",
  workingFee: "2.75",
  approvedFee,
  eamFee: eamWorking.fund.subscription_fee_pct,
  investorFee: investorApproved.fund.subscription_fee_pct,
});
reset();
const draft = db.funds.find((f) => f.state === "draft");
const eamDraft = await request(`eam/opportunities/${draft.id}`, "eam");
const investorDraft = await request(`funds/${draft.id}`, "investor");
assert.equal(eamDraft.status, 200);
assert.ok([403, 404].includes(investorDraft.status));
findings.push({
  id: "A03",
  result: "reproduced",
  draftFundId: draft.id,
  eamDraftStatus: eamDraft.status,
  investorDraftStatus: investorDraft.status,
});
reset();
const document = db.documents.find((d) => d.owner_id === 2 && d.has_file && !d.file_data_url);
const download = await request(`documents/${document.id}/download`, "investor");
assert.equal(download, null);
findings.push({
  id: "A04",
  result: "reproduced",
  documentId: document.id,
  name: document.name,
  handler: "missing",
});
reset();
const sub = db.subscriptions.find((s) => s.investor_id === 2 && s.status === "awaiting_funds");
const docCount = db.documents.length;
const proof = await request(`subscriptions/${sub.id}/payment_proof`, "investor", "POST", {
  filename: "audit-receipt.pdf",
});
assert.equal(proof.status, 200);
assert.equal(db.documents.length, docCount);
assert.equal(sub.payment_claimed, true);
findings.push({
  id: "A06",
  result: "reproduced",
  subscriptionId: sub.id,
  status: proof.status,
  newDocuments: db.documents.length - docCount,
  savedFilename: sub.payment_proof_filename ?? null,
  savedFileBytes: sub.file_data_url ?? null,
  paymentClaimed: sub.payment_claimed,
});
reset();
const teamDocuments = await (await request("admin/documents", "investment_team")).json();
assert.ok(
  teamDocuments.documents.every((d) => d.subscription_id === null && d.owner_name === "LUCA SGP"),
);
const investorBook = await request("admin/investors", "investor");
assert.equal(investorBook.status, 403);
const teamBook = await request("admin/investors", "investment_team");
assert.equal(teamBook.status, 403);
findings.push({
  id: "permission-check",
  result: "passed",
  investorClientBook: investorBook.status,
  teamClientBook: teamBook.status,
  teamDocumentScope: "fund materials only",
});
reset();
const scheduled = db.communications.find((c) => c.status === "scheduled");
scheduled.scheduled_at = new Date(Date.now() - 86400000).toISOString();
const messages = await (await request("messages", "investor")).json();
assert.equal(scheduled.status, "scheduled");
assert.ok(!messages.messages.some((m) => m.id === scheduled.id));
findings.push({
  id: "A10",
  result: "reproduced",
  scheduledAt: scheduled.scheduled_at,
  status: scheduled.status,
  inInvestorInbox: false,
});
reset();
const overviewDocs = await request("documents?fund_id=1201", "luca");
const managerDocs = await (await request("admin/documents?fund_id=1201", "luca")).json();
const managerFundDocuments = managerDocs.documents.filter(
  (d) => d.fund_id === 1201 && d.subscription_id === null,
);
assert.equal(managerFundDocuments.length, 3);
findings.push({
  id: "A17",
  result: "reproduced",
  overviewEndpointStatus: overviewDocs.status,
  overviewResponse: await overviewDocs.json(),
  managerFundDocumentCount: managerFundDocuments.length,
});
fs.writeFileSync("docs/audit/reproductions.json", JSON.stringify(findings, null, 2));
console.log(JSON.stringify(findings, null, 2));
