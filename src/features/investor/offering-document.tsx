import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { documentLabel, fundLabel, offeringOf, type OfferingDocumentKind } from "@/lib/offering";
import type { Fund } from "@/lib/types";
import DisclaimerFooter from "@/components/disclaimer-footer";

/**
 * Where an offering document opens. Until LUCA SGP attaches the signed-off PDF, this page stands
 * in for it and says so, so nobody mistakes it for the document itself.
 */
export default function OfferingDocumentPage() {
  const { fundId, kind } = useParams<{ fundId: string; kind: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ["fund", Number(fundId)],
    queryFn: () => api<{ fund: Fund }>(`/api/v1/funds/${fundId}`),
    enabled: Boolean(fundId),
  });

  const fund = data?.fund;
  const documentKind = kind as OfferingDocumentKind;
  const offering = fund ? offeringOf(fund) : null;
  const document = offering?.documents[documentKind];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {fund && document && (
          <>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {fundLabel(fund)}
            </p>
            <h1 className="mt-2 text-2xl font-semibold">{documentLabel(documentKind)}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Version {document.version}</p>

            {document.url ? (
              <p className="mt-8 text-sm">
                <a
                  className="text-primary underline-offset-4 hover:underline"
                  href={document.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open the document
                </a>
              </p>
            ) : (
              <p className="mt-8 rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
                Placeholder. LUCA SGP has not yet attached the signed-off{" "}
                {documentLabel(documentKind).toLowerCase()} for this sub-fund. The document will
                open here once it is attached.
              </p>
            )}
            <button
              type="button"
              onClick={() => window.close()}
              className="mt-8 text-sm text-muted-foreground hover:underline"
            >
              Close this tab
            </button>
          </>
        )}
        {!isLoading && (!fund || !document) && (
          <p className="text-sm text-muted-foreground">This document is not available.</p>
        )}
      </main>
      <DisclaimerFooter label={fund ? fundLabel(fund) : undefined} />
    </div>
  );
}
