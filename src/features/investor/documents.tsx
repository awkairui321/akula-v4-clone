import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Document } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DownloadIcon, FileTextIcon } from "lucide-react";

const KIND_LABELS: Record<string, string> = {
  agreement: "Agreement",
  termsheet: "Term Sheet",
  factsheet: "Factsheet",
  deck: "Pitch Deck",
  memo: "Memo",
  tax: "Tax Document",
  statement: "Statement",
};

const STATUS_LABELS: Record<string, string> = {
  issued: "Issued",
  signed: "Signed",
  available: "Available",
  action_required: "Action required",
};

const ACCOUNT_DOCUMENTS_LABEL = "Account documents";

function DocumentRow({ doc }: { doc: Document }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 first:pt-4 last:pb-4">
      <div className="flex min-w-0 items-center gap-3">
        <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{doc.name}</p>
          <p className="text-xs text-muted-foreground">
            {KIND_LABELS[doc.kind] ?? doc.kind} · {new Date(doc.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant="secondary">{STATUS_LABELS[doc.status] ?? doc.status}</Badge>
        {doc.has_file && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              window.open(
                `${import.meta.env.VITE_API_URL ?? "http://localhost:3000"}/api/v1/documents/${doc.id}/download`,
                "_blank",
              );
            }}
          >
            <DownloadIcon className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default function DocumentsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: () => api<{ documents: Document[] }>("/api/v1/documents"),
  });

  const documents = data?.documents ?? [];

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; docs: Document[] }>();
    for (const doc of documents) {
      const key = doc.fund_id !== null ? `fund-${doc.fund_id}` : "account";
      const label =
        doc.fund_id !== null ? (doc.fund_name ?? "Other fund") : ACCOUNT_DOCUMENTS_LABEL;
      if (!map.has(key)) map.set(key, { label, docs: [] });
      map.get(key)!.docs.push(doc);
    }
    // Funds first (alphabetically), account documents last.
    return [...map.values()].sort((a, b) => {
      if (a.label === ACCOUNT_DOCUMENTS_LABEL) return 1;
      if (b.label === ACCOUNT_DOCUMENTS_LABEL) return -1;
      return a.label.localeCompare(b.label);
    });
  }, [documents]);

  return (
    <div className="flex flex-col gap-6">
      <div className="mb-2 space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Documents</h1>
        <p className="text-muted-foreground">
          Subscription agreements, statements, and account documents, grouped by fund.
        </p>
      </div>

      {isLoading && <p className="py-12 text-center text-muted-foreground">Loading documents...</p>}

      {!isLoading && documents.length === 0 && (
        <Card className="border-2 border-dashed ring-0">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
            <FileTextIcon className="size-8 text-muted-foreground" />
            <p className="text-muted-foreground">No documents yet.</p>
          </CardContent>
        </Card>
      )}

      {groups.length > 0 && (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <div key={group.label} className="space-y-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {group.label}
              </p>
              <Card className="p-0">
                <CardContent className="divide-y p-0">
                  {group.docs.map((doc) => (
                    <DocumentRow key={doc.id} doc={doc} />
                  ))}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
