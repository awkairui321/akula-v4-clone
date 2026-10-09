import { Link } from "react-router-dom";
import { DEAL_MATERIAL_KINDS } from "@/lib/document-catalogue";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocRow, RequestRow } from "./compliance-clients";
import { requestLink } from "./compliance-helpers";
import { useDocumentActions } from "./client-funds";

/**
 * A client's own documents: identity, accreditation and account papers, and what has been asked
 * of them. Fund papers (the signed form and capital call) sit with each fund on the Clients page.
 */
export function ClientDocuments({ investorId }: { investorId: number }) {
  const { actions, documents, requests, isLoading } = useDocumentActions();
  const own = documents.filter(
    (d) =>
      d.owner_id === investorId &&
      !DEAL_MATERIAL_KINDS.includes(d.kind) &&
      d.fund_id === null &&
      d.subscription_id === null,
  );
  const asked = requests.filter(
    (r) => r.investor_id === investorId && r.status === "requested" && r.fund_id === null,
  );
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="text-base">Account and identity documents</CardTitle>
          <p className="text-sm text-muted-foreground">
            Identity, accreditation and account papers for this client, and anything still requested
            from them.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={<Link to={requestLink(investorId, "")} />}
        >
          Request documents
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading documents...</p>
        ) : own.length + asked.length === 0 ? (
          <p className="text-sm text-muted-foreground">No account documents on file.</p>
        ) : (
          <ul className="divide-y">
            {own.map((doc) => (
              <DocRow key={doc.id} doc={doc} actions={actions} />
            ))}
            {asked.map((req) => (
              <RequestRow key={req.id} req={req} actions={actions} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
