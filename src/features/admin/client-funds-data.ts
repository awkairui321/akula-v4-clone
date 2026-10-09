import { DEAL_MATERIAL_KINDS } from "@/lib/document-catalogue";
import type { WorkflowView } from "@/lib/workflow-types";
import { buildPartnerBook } from "@/features/partners/partner-data";
import type { AdminDocument, AdminInvestor, DocumentRequestRow } from "./types";

/** Client ownership comes first; infer a document's fund from its subscription when needed. */
export function buildClientFunds(
  investors: AdminInvestor[],
  workflow: WorkflowView,
  documents: AdminDocument[],
  requests: DocumentRequestRow[],
) {
  const book = buildPartnerBook(workflow);
  return investors
    .map((investor) => {
      const docs = documents.filter(
        (d) => d.owner_id === investor.id && !DEAL_MATERIAL_KINDS.includes(d.kind),
      );
      const asked = requests.filter(
        (r) => r.investor_id === investor.id && r.status === "requested",
      );
      const subs = workflow.subscriptions.filter((s) => s.investor_id === investor.id);
      const fundOf = (d: AdminDocument) =>
        d.fund_id ?? subs.find((s) => s.id === d.subscription_id)?.fund_id ?? null;
      const signatures = workflow.signatures.filter((s) =>
        subs.some((sub) => sub.id === s.subscriptionId),
      );
      const fundIds = new Set([
        ...subs.map((s) => s.fund_id),
        ...workflow.holdings.filter((h) => h.investor_id === investor.id).map((h) => h.fund_id),
        ...docs.map(fundOf).filter((id): id is number => id !== null),
        ...asked.map((r) => r.fund_id).filter((id): id is number => id !== null),
      ]);
      const funds = [...fundIds]
        .map((id) => {
          const fund = workflow.funds.find((f) => f.id === id);
          const ownDocs = docs.filter((d) => fundOf(d) === id);
          const ownRequests = asked.filter((r) => r.fund_id === id);
          const capital = book.all.projects
            .flatMap((p) => p.funds)
            .find((f) => f.fundId === id)
            ?.clients.find((c) => c.id === investor.id);
          const papers = subs
            .filter((sub) => sub.fund_id === id && !["cancelled", "rejected"].includes(sub.status))
            .map((sub) => {
              const total = Number(sub.amount) + Number(sub.subscription_fee);
              const receipts = workflow.receipts.filter(
                (r) => r.subscriptionId === sub.id && r.matched && !r.supersededBy,
              );
              return {
                subscription: sub,
                signature: signatures.find((x) => x.subscriptionId === sub.id),
                agreement: ownDocs.find(
                  (d) => d.kind === "agreement" && d.subscription_id === sub.id,
                ),
                call: {
                  principal: Number(sub.amount),
                  fee: Number(sub.subscription_fee),
                  total,
                  // The call goes out once the subscription is signed off for funding.
                  issued: !["reserved", "documents_pending", "institution_review"].includes(
                    sub.status,
                  ),
                  issuedAt: (sub as { approved_at?: string | null }).approved_at ?? null,
                  received: receipts.reduce((n, r) => n + r.amount, 0),
                  receivedAt: receipts.at(-1)?.at ?? null,
                },
              };
            });
          const agreementIds = new Set(
            papers.flatMap((p) => (p.agreement ? [p.agreement.id] : [])),
          );
          return {
            id,
            papers,
            otherCount: ownDocs.filter((d) => !agreementIds.has(d.id)).length + ownRequests.length,
            name:
              fund?.fundName ?? ownDocs[0]?.fund_name ?? ownRequests[0]?.fund_name ?? `Fund #${id}`,
            project: fund?.name ?? subs.find((s) => s.fund_id === id)?.asset_name ?? "",
            capital,
            docs: ownDocs,
            requests: ownRequests,
            signatures: signatures.filter(
              (s) => subs.find((sub) => sub.id === s.subscriptionId)?.fund_id === id,
            ),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      return {
        investor,
        capital: book.all.clients.find((c) => c.id === investor.id),
        funds,
        accountDocs: docs.filter((d) => fundOf(d) === null),
        accountRequests: asked.filter((r) => r.fund_id === null),
      };
    })
    .sort((a, b) => a.investor.full_name.localeCompare(b.investor.full_name));
}
