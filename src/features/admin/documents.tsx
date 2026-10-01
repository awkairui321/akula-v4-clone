import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  REVIEW_STATE_LABELS,
  type AdminDocument,
  type DocumentReviewState,
  type DocumentsResponse,
} from "./types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SearchIcon } from "lucide-react";

const REVIEW_VARIANT: Record<DocumentReviewState, "default" | "secondary" | "outline"> = {
  received: "outline",
  reviewing: "secondary",
  filed: "default",
};

/** Where an operator can move a document from each intake state. */
const NEXT_STATES: Record<DocumentReviewState, DocumentReviewState[]> = {
  received: ["reviewing", "filed"],
  reviewing: ["filed", "received"],
  filed: ["reviewing"],
};

export default function AdminDocumentsPage() {
  const queryClient = useQueryClient();
  const [reviewFilter, setReviewFilter] = useState<DocumentReviewState | "all">("all");
  const [search, setSearch] = useState("");

  const params = new URLSearchParams();
  if (reviewFilter !== "all") params.set("review_state", reviewFilter);
  if (search.trim()) params.set("q", search.trim());

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "documents", reviewFilter, search],
    queryFn: () => api<DocumentsResponse>(`/api/v1/admin/documents?${params}`),
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
  const summary = data?.summary;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-6 space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Documents</h1>
        <p className="text-muted-foreground">
          Platform-wide document intake: what has arrived, what has been checked, what is filed.
        </p>
      </div>

      {summary && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryTile label="Received" value={String(summary.received)} />
          <SummaryTile label="Reviewing" value={String(summary.reviewing)} />
          <SummaryTile label="Filed" value={String(summary.filed)} />
          <SummaryTile label="Total documents" value={String(summary.total)} />
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
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

      <div className="mb-4 flex flex-wrap gap-2">
        {(["all", "received", "reviewing", "filed"] as const).map((state) => (
          <Button
            key={state}
            variant={reviewFilter === state ? "secondary" : "outline"}
            size="sm"
            className="rounded-full text-xs"
            onClick={() => setReviewFilter(state)}
          >
            {state === "all" ? "All" : REVIEW_STATE_LABELS[state]}
          </Button>
        ))}
      </div>

      {isLoading && <p className="py-12 text-center text-muted-foreground">Loading...</p>}

      {!isLoading && documents.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">No documents match these filters.</p>
      )}

      {documents.length > 0 && (
        <div className="rounded-lg border">
          <div className="grid grid-cols-5 gap-4 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground">
            <span>Document</span>
            <span>Owner</span>
            <span>Vehicle</span>
            <span>Intake</span>
            <span className="text-right">Move to</span>
          </div>
          {documents.map((document) => (
            <div
              key={document.id}
              className="grid grid-cols-5 items-center gap-4 border-b px-4 py-3 text-sm last:border-0"
            >
              <span className="truncate">
                <span className="block font-medium">{document.name}</span>
                <span className="block text-xs text-muted-foreground">{document.kind}</span>
              </span>
              <span className="truncate text-muted-foreground">{document.owner_name}</span>
              <span className="truncate text-muted-foreground">{document.fund_name ?? "—"}</span>
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
                    {REVIEW_STATE_LABELS[to]}
                  </Button>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
