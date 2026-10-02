import { Link } from "react-router-dom";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  REVIEW_STATE_LABELS,
  type AdminDocument,
  type DocumentReviewState,
  type DocumentsResponse,
  type InvestorsResponse,
} from "./types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SummaryFigure } from "./summary-figure";
import { Input } from "@/components/ui/input";
import { SearchIcon } from "lucide-react";

const REVIEW_VARIANT: Record<DocumentReviewState, "default" | "secondary" | "outline"> = {
  received: "outline",
  reviewing: "secondary",
  on_hold: "outline",
  filed: "default",
};

/** Where an operator can move a document from each intake state. */
const NEXT_STATES: Record<DocumentReviewState, DocumentReviewState[]> = {
  received: ["reviewing", "on_hold"],
  reviewing: ["filed", "on_hold"],
  on_hold: ["reviewing", "received"],
  filed: [],
};

export default function AdminDocumentsPage() {
  const queryClient = useQueryClient();
  const [reviewFilter, setReviewFilter] = useState<DocumentReviewState>("received");
  const [search, setSearch] = useState("");
  const [partnerFilter, setPartnerFilter] = useState("all");
  const [investorFilter, setInvestorFilter] = useState("all");
  const [fundFilter, setFundFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [archiveSearch, setArchiveSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "documents", "all"],
    queryFn: () => api<DocumentsResponse>("/api/v1/admin/documents"),
  });
  const { data: investorData } = useQuery({
    queryKey: ["admin", "investors", "documents"],
    queryFn: () => api<InvestorsResponse>("/api/v1/admin/investors"),
  });

  const advance = useMutation({
    mutationFn: ({ id, to }: { id: number; to: DocumentReviewState }) =>
      api<{ document: AdminDocument }>(`/api/v1/admin/documents/${id}`, {
        method: "PATCH",
        body: { document: { review_state: to } },
      }),
    onSuccess: (_result, { to }) => {
      toast.success(`Moved to ${REVIEW_STATE_LABELS[to].toLowerCase()}.`);
      queryClient.invalidateQueries({ queryKey: ["admin", "documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const documents = data?.documents ?? [];
  const clientRows = investorData?.investors ?? [];
  const partners = [
    ...new Set(
      clientRows.map((row) => row.eam_firm).filter((firm): firm is string => Boolean(firm)),
    ),
  ].sort();
  const clients = clientRows
    .filter((row) =>
      partnerFilter === "individual"
        ? !row.eam_firm
        : partnerFilter === "all"
          ? true
          : row.eam_firm === partnerFilter,
    )
    .map((row) => ({ id: row.id, name: row.full_name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const funds = [
    ...new Set(
      documents
        .map((document) => document.fund_name)
        .filter((name): name is string => Boolean(name)),
    ),
  ].sort();
  const visibleDocuments = documents.filter((document) => {
    const client = clientRows.find((row) => row.id === document.owner_id);
    const partnerMatches =
      partnerFilter === "all" ||
      (partnerFilter === "individual"
        ? Boolean(client && !client.eam_firm)
        : client?.eam_firm === partnerFilter);
    const textMatches =
      !search.trim() ||
      `${document.name} ${document.owner_name} ${document.fund_name ?? ""}`
        .toLowerCase()
        .includes(search.trim().toLowerCase());
    return (
      document.review_state === reviewFilter &&
      partnerMatches &&
      (investorFilter === "all" || document.owner_id === Number(investorFilter)) &&
      (fundFilter === "all" || document.fund_name === fundFilter) &&
      textMatches
    );
  });
  const archivedDocuments = documents.filter(
    (document) =>
      document.review_state === "filed" &&
      `${document.name} ${document.owner_name} ${document.fund_name ?? ""}`
        .toLowerCase()
        .includes(archiveSearch.toLowerCase()),
  );
  const pageCount = Math.max(1, Math.ceil(visibleDocuments.length / 20));
  const pageDocuments = visibleDocuments.slice(
    Math.min(page, pageCount - 1) * 20,
    (Math.min(page, pageCount - 1) + 1) * 20,
  );
  const summary = data?.summary;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-6 space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Documents</h1>
        <p className="text-muted-foreground">
          Triage new arrivals, review assigned items, and keep completed records in the archive.
        </p>
      </div>

      {summary && (
        <div className="mb-4 grid gap-x-8 gap-y-4 border-y py-5 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryFigure label="New arrivals" value={String(summary.received)} />
          <SummaryFigure label="To review" value={String(summary.reviewing)} />
          <SummaryFigure label="On hold" value={String(summary.on_hold)} />
          <SummaryFigure label="Archived" value={String(summary.filed)} />
        </div>
      )}

      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search documents by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        <select
          aria-label="Filter by partner or investor group"
          className="h-9 rounded-md border bg-background px-2"
          value={partnerFilter}
          onChange={(event) => {
            setPartnerFilter(event.target.value);
            setInvestorFilter("all");
            setPage(0);
          }}
        >
          <option value="all">All client groups</option>
          <option value="individual">Individual investors</option>
          {partners.map((partner) => (
            <option key={partner} value={partner}>
              {partner}
            </option>
          ))}
        </select>
        {partnerFilter !== "all" && (
          <select
            aria-label="Filter by investor under selected partner"
            className="h-9 rounded-md border bg-background px-2"
            value={investorFilter}
            onChange={(event) => {
              setInvestorFilter(event.target.value);
              setPage(0);
            }}
          >
            <option value="all">All investors in group</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="Filter by deal"
          className="h-9 rounded-md border bg-background px-2"
          value={fundFilter}
          onChange={(event) => {
            setFundFilter(event.target.value);
            setPage(0);
          }}
        >
          <option value="all">All deals</option>
          {funds.map((fund) => (
            <option key={fund}>{fund}</option>
          ))}
        </select>
        <span className="self-center text-xs text-muted-foreground">
          {visibleDocuments.length} matching documents
        </span>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(["received", "reviewing", "on_hold"] as const).map((state) => (
          <Button
            key={state}
            variant={reviewFilter === state ? "secondary" : "outline"}
            size="sm"
            className="rounded-full text-xs"
            onClick={() => setReviewFilter(state)}
          >
            {REVIEW_STATE_LABELS[state]}
          </Button>
        ))}
      </div>

      {isLoading && <p className="py-12 text-center text-muted-foreground">Loading...</p>}

      {!isLoading && visibleDocuments.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">No documents match these filters.</p>
      )}

      {pageDocuments.length > 0 && (
        <div className="rounded-lg border">
          <div className="grid grid-cols-5 gap-4 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground">
            <span>Document</span>
            <span>Owner</span>
            <span>Vehicle</span>
            <span>Intake</span>
            <span className="text-right">Move to</span>
          </div>
          {pageDocuments.map((document) => (
            <div
              key={document.id}
              className="grid grid-cols-5 items-center gap-4 border-b px-4 py-3 text-sm last:border-0"
            >
              <span className="truncate">
                <span className="block font-medium">{document.name}</span>
                <span className="block text-xs text-muted-foreground">{document.kind}</span>
              </span>
              <OwnerLink document={document} />
              <DealLink document={document} />
              <span>
                <Badge variant={REVIEW_VARIANT[document.review_state]} className="text-[10px]">
                  {REVIEW_STATE_LABELS[document.review_state]}
                </Badge>
              </span>
              <span className="flex justify-end gap-2">
                {NEXT_STATES[document.review_state].map((to) => (
                  <Button
                    key={to}
                    size="sm"
                    variant="outline"
                    disabled={advance.isPending}
                    onClick={() => advance.mutate({ id: document.id, to })}
                  >
                    {to === "filed"
                      ? "Mark reviewed · archive"
                      : to === "reviewing"
                        ? "Move to review"
                        : to === "on_hold"
                          ? "Place on hold"
                          : "Return to new arrivals"}
                  </Button>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
      {visibleDocuments.length > 20 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-xs">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <span>
            Page {Math.min(page, pageCount - 1) + 1} of {pageCount}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= pageCount - 1}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
      <details className="mt-5 rounded-lg border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
          Archive · {summary?.filed ?? 0} completed documents
        </summary>
        <div className="space-y-3 border-t p-3">
          <div className="relative">
            <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search archived documents by name, investor or deal"
              value={archiveSearch}
              onChange={(event) => setArchiveSearch(event.target.value)}
            />
          </div>
          {archivedDocuments.length ? (
            <div className="divide-y rounded-md border">
              {archivedDocuments.map((document) => (
                <div
                  key={document.id}
                  className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_180px_180px]"
                >
                  <span className="truncate font-medium">
                    {document.name}
                    <small className="ml-2 text-xs font-normal text-muted-foreground">
                      {document.kind}
                    </small>
                  </span>
                  <OwnerLink document={document} />
                  <DealLink document={document} />
                </div>
              ))}
            </div>
          ) : (
            <p className="py-5 text-center text-sm text-muted-foreground">
              No archived documents match your search.
            </p>
          )}
        </div>
      </details>
    </div>
  );
}

/** Investor-owned documents link to the investor's file; LUCA's own materials do not. */
function OwnerLink({ document }: { document: AdminDocument }) {
  if (document.owner_name === "LUCA SGP")
    return <span className="truncate text-muted-foreground">{document.owner_name}</span>;
  return (
    <Link
      to={`/luca/investors/${document.owner_id}`}
      className="truncate text-muted-foreground hover:text-foreground hover:underline"
    >
      {document.owner_name}
    </Link>
  );
}

function DealLink({ document }: { document: AdminDocument }) {
  if (!document.fund_id || !document.fund_name)
    return <span className="truncate text-muted-foreground">—</span>;
  return (
    <Link
      to={`/luca/deals/${document.fund_id}?tab=documents`}
      className="truncate text-muted-foreground hover:text-foreground hover:underline"
    >
      {document.fund_name}
    </Link>
  );
}
