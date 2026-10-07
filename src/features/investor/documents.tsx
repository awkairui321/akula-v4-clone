import DealOverviewPage from "@/components/deal-overview-page";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { WorkflowView } from "@/lib/workflow-types";
import type { Document } from "@/lib/types";
import FileDropzone from "@/components/file-dropzone";
import { readUpload, type UploadedFile } from "@/lib/file-upload";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DOCUMENT_REQUEST_KINDS, documentKindLabel } from "@/lib/document-catalogue";
import { DownloadIcon, FileTextIcon, ChevronRightIcon, SearchIcon } from "lucide-react";

const KIND_LABELS: Record<string, string> = {
  agreement: "Agreement",
  termsheet: "Term Sheet",
  factsheet: "Factsheet",
  deck: "Pitch Deck",
  memo: "Memo",
  tax: "Tax Document",
  statement: "Statement",
};

const ACCOUNT_DOCUMENTS_LABEL = "Account documents";

function RequiredVersionReviews() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["investorDocumentReviews"],
    queryFn: () => api<WorkflowView>("/api/v1/workflows"),
    refetchInterval: 2000,
  });
  const acknowledge = useMutation({
    mutationFn: ({ id, target }: { id: number; target: number }) =>
      api("/api/v1/workflows", { method: "POST", body: { type: "acknowledge", id, target } }),
    onSuccess: () => qc.invalidateQueries(),
  });
  const pending = data?.subscriptions.filter((s) => s.needsReview) ?? [];
  if (!pending.length) return null;
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="font-semibold">Updated investment documents to review</h2>
      {pending.map((sub) => {
        const version = data?.versions.find((v) => v.id === sub.needsReview);
        return (
          <div key={sub.id} className="rounded border p-3">
            <strong>
              {sub.asset_name} · subscription #{sub.id}
            </strong>
            <p className="text-sm">
              Version #{version?.number ?? sub.needsReview}. Allocation and issuance wait for your
              acknowledgement.
            </p>
            <details className="my-2">
              <summary>Read revised offering</summary>
              <div className="max-h-[70vh] overflow-auto">
                {version ? (
                  <DealOverviewPage
                    fund={version.snapshot}
                    viewer="investor"
                    preview
                    backTo="/documents"
                    backLabel="Back to documents"
                  />
                ) : (
                  "Version unavailable"
                )}
              </div>
            </details>
            <Button
              disabled={!version || acknowledge.isPending}
              onClick={() => acknowledge.mutate({ id: sub.id, target: sub.needsReview! })}
            >
              I reviewed this version — acknowledge
            </Button>
          </div>
        );
      })}
      {acknowledge.isError && <p role="alert">{acknowledge.error.message}</p>}
    </section>
  );
}

function DocumentRow({ doc }: { doc: Document }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 first:pt-4 last:pb-4">
      <div className="flex min-w-0 items-center gap-3">
        <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{doc.name}</p>
          <p className="text-xs text-muted-foreground">
            {doc.status === "signed" && doc.kind === "agreement"
              ? "Signed subscription agreement"
              : doc.status === "submitted" && doc.review_state === "filed"
                ? "Reviewed by LUCA"
                : doc.status === "submitted"
                  ? "Awaiting LUCA review"
                  : (KIND_LABELS[doc.kind] ?? documentKindLabel(doc.kind))}{" "}
            ·{" "}
            {new Date(doc.created_at).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {doc.status === "action_required" && (
          <span className="text-xs font-medium text-amber-700">Action required</span>
        )}
        {doc.has_file &&
          (doc.file_data_url ? (
            <a
              href={doc.file_data_url}
              download={doc.name}
              aria-label={`Download ${doc.name}`}
              className="rounded-md p-2 hover:bg-muted"
            >
              <DownloadIcon className="size-4" />
            </a>
          ) : (
            <Button
              aria-label={`Download ${doc.name}`}
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
          ))}
      </div>
    </div>
  );
}

type DocumentRequest = {
  id: number;
  kind: string;
  note: string | null;
  due_at: string | null;
  fund_name: string | null;
};

/** What LUCA has asked this investor to provide, with an upload for each. */
function RequestedFromYou() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["document-requests"],
    queryFn: () => api<{ requests: DocumentRequest[] }>("/api/v1/document_requests"),
  });
  const upload = useMutation({
    mutationFn: ({ id, file }: { id: number; file: UploadedFile }) =>
      api(`/api/v1/document_requests/${id}/upload`, { method: "POST", body: file }),
    onSuccess: () => {
      toast.success("Sent to LUCA for review.");
      queryClient.invalidateQueries({ queryKey: ["document-requests"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const requests = data?.requests ?? [];
  if (requests.length === 0) return null;

  return (
    <section className="space-y-2">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Requested from you ({requests.length})
      </p>
      <ul className="space-y-2">
        {requests.map((r) => {
          const overdue = r.due_at ? new Date(r.due_at).getTime() < Date.now() : false;
          const reason = DOCUMENT_REQUEST_KINDS.find((k) => k.key === r.kind)?.reason;
          return (
            <li key={r.id}>
              <details className="group/request rounded-lg border">
                <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground group-open/request:rotate-90" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{documentKindLabel(r.kind)}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.note ?? reason}
                      {r.fund_name ? ` · for ${r.fund_name}` : ""}
                    </p>
                    {r.due_at && (
                      <p
                        className={`text-xs ${overdue ? "font-medium text-amber-700" : "text-muted-foreground"}`}
                      >
                        {overdue ? "Overdue · was due " : "Due "}
                        {new Date(r.due_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                  <span className="text-xs font-medium text-primary">Provide document</span>
                </summary>
                <div className="border-t p-4">
                  <FileDropzone
                    label={`Upload ${documentKindLabel(r.kind)}`}
                    disabled={upload.isPending}
                    onFiles={async ([file]) => {
                      await upload.mutateAsync({ id: r.id, file: await readUpload(file) });
                    }}
                  />
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function DocumentsPage() {
  const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [kind, setKind] = useState("passport");
  const [fundId, setFundId] = useState("");
  const queryClient = useQueryClient();
  const upload = useMutation({
    mutationFn: (file: UploadedFile) =>
      api("/api/v1/documents", {
        method: "POST",
        body: { ...file, kind, fund_id: fundId ? Number(fundId) : null },
      }),
    onSuccess: () => {
      toast.success("Sent to LUCA for review.");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });
  const { data, isLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: () => api<{ documents: Document[] }>("/api/v1/documents"),
  });

  const documents = useMemo(() => data?.documents ?? [], [data]);

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; docs: Document[] }>();
    for (const doc of documents) {
      if (
        search.trim() &&
        !`${doc.name} ${doc.fund_name ?? "Account documents"} ${documentKindLabel(doc.kind)}`
          .toLowerCase()
          .includes(search.trim().toLowerCase())
      )
        continue;
      const key = doc.fund_id !== null ? `fund-${doc.fund_id}` : "account";
      const label =
        doc.fund_id !== null ? (doc.fund_name ?? "Other fund") : ACCOUNT_DOCUMENTS_LABEL;
      if (!map.has(key)) map.set(key, { key, label, docs: [] });
      map.get(key)!.docs.push(doc);
    }
    // Funds first (alphabetically), account documents last.
    return [...map.values()].sort((a, b) => {
      if (a.label === ACCOUNT_DOCUMENTS_LABEL) return 1;
      if (b.label === ACCOUNT_DOCUMENTS_LABEL) return -1;
      return a.label.localeCompare(b.label);
    });
  }, [documents, search]);

  return (
    <div className="flex flex-col gap-6">
      <RequiredVersionReviews />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Documents</h1>
          <p className="text-muted-foreground">
            Subscription agreements, statements, and account documents, grouped by fund.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setUploadOpen(!uploadOpen)}
          aria-expanded={uploadOpen}
        >
          Upload document
        </Button>
      </div>

      {uploadOpen && (
        <section className="space-y-4 rounded-lg border p-4">
          <div>
            <h2 className="font-semibold">Submit a document to LUCA</h2>
            <p className="text-xs text-muted-foreground">
              Demo upload, saved in this browser for review. For an open request, use its upload
              above.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="block">Document type</span>
              <select
                className="h-9 w-full rounded-md border bg-background px-3"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                {DOCUMENT_REQUEST_KINDS.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="block">For</span>
              <select
                className="h-9 w-full rounded-md border bg-background px-3"
                value={fundId}
                onChange={(e) => setFundId(e.target.value)}
              >
                <option value="">Account documents</option>
                {[
                  ...new Map(
                    documents.filter((d) => d.fund_id != null).map((d) => [d.fund_id, d.fund_name]),
                  ).entries(),
                ].map(([id, name]) => (
                  <option key={id} value={String(id)}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <FileDropzone
            label="Choose document"
            disabled={upload.isPending}
            onFiles={async ([file]) => {
              await upload.mutateAsync(await readUpload(file));
            }}
          />
        </section>
      )}

      <RequestedFromYou />
      <div className="relative max-w-sm">
        <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search documents"
          placeholder="Search fund or document"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
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
        <div className="space-y-3">
          {groups.map((group) => (
            <details
              key={group.key}
              open={search.trim() ? true : undefined}
              className="group/folder overflow-hidden rounded-lg border bg-background"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground group-open/folder:rotate-90" />
                <span className="flex-1 text-sm font-semibold">{group.label}</span>
                <span className="text-xs text-muted-foreground">
                  {group.docs.length} {group.docs.length === 1 ? "document" : "documents"}
                </span>
              </summary>
              <div className="divide-y border-t">
                {group.docs.map((doc) => (
                  <DocumentRow key={doc.id} doc={doc} />
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
      {!isLoading && documents.length > 0 && groups.length === 0 && (
        <p className="py-8 text-sm text-muted-foreground">No documents match your search.</p>
      )}
    </div>
  );
}
