import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRightIcon, FolderIcon, FileTextIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/currency";
import { STATUS_LABELS, type SubscriptionStatus } from "@/lib/types";
import type { WorkflowView } from "@/lib/workflow-types";
import type { Capital } from "@/features/partners/partner-data";
import { Button } from "@/components/ui/button";
import { DocRow, RequestRow, type ClientActions } from "./compliance-clients";
import { formatDate, requestLink } from "./compliance-helpers";
import { buildClientFunds } from "./client-funds-data";
import type {
  AdminInvestor,
  DocumentsResponse,
  DocumentRequestRow,
  DocumentReviewState,
} from "./types";

export const SUMMARY =
  "flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden";
export const CHEVRON = "size-4 shrink-0 text-muted-foreground transition-transform";

export function Figures({ capital }: { capital?: Capital }) {
  return (
    <dl className="grid min-w-0 grid-cols-3 gap-2 sm:min-w-80 sm:gap-4">
      {(["committed", "funded", "allocated"] as const).map((key) => (
        <div key={key} className="min-w-0 border-l pl-2 sm:pl-3">
          <dt className="text-xs text-muted-foreground capitalize">{key}</dt>
          <dd className="mt-1 text-xs font-medium tabular-nums sm:text-sm">
            {formatPrice(capital?.[key] ?? 0)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

type ClientBookRow = ReturnType<typeof buildClientFunds>[number];
export type ClientRow = ClientBookRow;
export type ClientFund = ClientBookRow["funds"][number];

/** Documents a client still has waiting on LUCA: new arrivals and those under review. */
export const needsReview = (row: ClientBookRow) =>
  [...row.funds.flatMap((f) => f.docs), ...row.accountDocs].filter((d) =>
    ["received", "reviewing"].includes(d.review_state),
  ).length;

/** Every onboarded client with their funds, capital and documents, and the actions on a document. */
export function useClientBook(investors: AdminInvestor[], workflow?: WorkflowView) {
  const queryClient = useQueryClient();
  const documents = useQuery({
    queryKey: ["admin", "documents", "all"],
    queryFn: () => api<DocumentsResponse>("/api/v1/admin/documents"),
  });
  const requests = useQuery({
    queryKey: ["admin", "document-requests"],
    queryFn: () => api<{ requests: DocumentRequestRow[] }>("/api/v1/admin/document_requests"),
  });
  const update = useMutation({
    mutationFn: ({
      path,
      method,
      body,
    }: {
      path: string;
      method: "PATCH" | "POST" | "DELETE";
      body?: Record<string, unknown>;
    }) => api(path, { method, body }),
    onSuccess: () => {
      toast.success("Document updated.");
      queryClient.invalidateQueries({ queryKey: ["admin", "documents"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "document-requests"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const setState = (id: number, to: DocumentReviewState) =>
    update.mutate({
      path: `/api/v1/admin/documents/${id}`,
      method: "PATCH",
      body: { document: { review_state: to } },
    });
  const actions: ClientActions = {
    approve: (id) => setState(id, "filed"),
    hold: (id) => setState(id, "on_hold"),
    release: (id) => setState(id, "reviewing"),
    remind: (id) =>
      update.mutate({ path: `/api/v1/admin/document_requests/${id}/remind`, method: "POST" }),
    withdraw: (id) =>
      update.mutate({ path: `/api/v1/admin/document_requests/${id}`, method: "DELETE" }),
  };
  const rows = useMemo(
    () =>
      workflow
        ? buildClientFunds(
            investors,
            workflow,
            documents.data?.documents ?? [],
            requests.data?.requests ?? [],
          )
        : [],
    [investors, workflow, documents.data, requests.data],
  );
  return {
    rows,
    actions,
    isError: documents.isError || requests.isError,
    isLoading: !workflow || documents.isLoading || requests.isLoading,
  };
}

/** One fund for one client: capital, holdings, applications and the documents filed against it. */
export function FundSection({
  fund,
  workflow,
  actions,
  defaultOpen,
  flat,
}: {
  fund: ClientFund;
  workflow: WorkflowView;
  actions: ClientActions;
  defaultOpen?: boolean;
  /** Show only the contents, when the fund is already named by the surrounding page. */
  flat?: boolean;
}) {
  const count = fund.docs.length + fund.signatures.length + fund.requests.length;
  const content = (
    <div className={`space-y-4 px-4 py-4 ${flat ? "" : "border-t"}`}>
      {!!fund.capital?.holdings.length && (
        <div className="space-y-2">
          {fund.capital.holdings.map((h) => (
            <p
              key={h.id}
              className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"
            >
              <span>
                Holding #{h.id} · {Number(h.units).toLocaleString("en-GB")} units · Cost{" "}
                {formatPrice(h.cost)}
              </span>
              <span>
                Reported value {formatPrice(h.value)}
                {h.valueAt ? ` · ${formatDate(h.valueAt)}` : ""}
              </span>
            </p>
          ))}
        </div>
      )}
      {!!fund.capital?.applications.length && (
        <div className="space-y-2">
          {fund.capital.applications.map((a) => (
            <p
              key={a.id}
              className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"
            >
              <span>
                Application #{a.id} · {STATUS_LABELS[a.status as SubscriptionStatus] ?? a.status}
              </span>
              <span>Subscription {formatPrice(a.amount)}</span>
            </p>
          ))}
        </div>
      )}
      <h4 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <FileTextIcon className="size-4" />
        Documents
      </h4>
      {count === 0 ? (
        <p className="text-sm text-muted-foreground">No documents on file for this fund.</p>
      ) : (
        <ul className="divide-y rounded-md border px-3">
          {fund.docs.map((doc) => (
            <DocRow key={doc.id} doc={doc} actions={actions} />
          ))}
          {fund.signatures.map((sig) => {
            const version = workflow.versions.find((v) => v.id === sig.versionId);
            return (
              <li key={`signature-${sig.id}`}>
                <details className="py-3 text-sm">
                  <summary className="cursor-pointer font-medium">
                    Signed subscription · Version {version?.number ?? sig.versionId}
                  </summary>
                  <p className="py-3 pl-4 text-xs text-muted-foreground">
                    Signed {formatDate(sig.at)} · Exact offering version retained
                  </p>
                </details>
              </li>
            );
          })}
          {fund.requests.map((req) => (
            <RequestRow key={req.id} req={req} actions={actions} />
          ))}
        </ul>
      )}
    </div>
  );
  if (flat) return content;
  return (
    <details open={defaultOpen} className="group/fund rounded-md border">
      <summary className={`${SUMMARY} flex-wrap bg-muted/30 px-4 py-3 hover:bg-muted/50`}>
        <ChevronRightIcon className={`${CHEVRON} group-open/fund:rotate-90`} />
        <FolderIcon className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{fund.name}</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {fund.project} · {count} {count === 1 ? "document" : "documents"}
          </span>
        </span>
        <span className="w-full sm:w-auto">
          <Figures capital={fund.capital} />
        </span>
      </summary>
      {content}
    </details>
  );
}

/** What sits under a client: their funds (or just one), account documents and the request action. */
export function ClientBody({
  row,
  workflow,
  actions,
  onlyFundId,
}: {
  row: ClientRow;
  workflow: WorkflowView;
  actions: ClientActions;
  /** Show a single fund, as when browsing by project and fund. */
  onlyFundId?: number;
}) {
  const funds = onlyFundId === undefined ? row.funds : row.funds.filter((f) => f.id === onlyFundId);
  return (
    <div className="space-y-4 border-t px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {onlyFundId === undefined ? "Funds" : "Holdings and documents"}
        </h3>
        <Link
          to={`/luca/investors/${row.investor.id}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          Open client record
        </Link>
      </div>
      {funds.length === 0 && (
        <p className="text-sm text-muted-foreground">No fund subscriptions or holdings yet.</p>
      )}
      {funds.map((fund) => (
        <FundSection
          key={fund.id}
          fund={fund}
          workflow={workflow}
          actions={actions}
          defaultOpen={onlyFundId !== undefined}
          flat={onlyFundId !== undefined}
        />
      ))}
      {onlyFundId === undefined && (
        <details className="group/account rounded-md border">
          <summary className={`${SUMMARY} px-4 py-3 hover:bg-muted/30`}>
            <ChevronRightIcon className={`${CHEVRON} group-open/account:rotate-90`} />
            <span className="flex-1 text-sm font-medium">Account & identity documents</span>
            <span className="text-xs text-muted-foreground">
              {row.accountDocs.length + row.accountRequests.length} documents
            </span>
          </summary>
          <div className="border-t px-4 py-3">
            {row.accountDocs.length + row.accountRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No account documents on file.</p>
            ) : (
              <ul className="divide-y">
                {row.accountDocs.map((doc) => (
                  <DocRow key={doc.id} doc={doc} actions={actions} />
                ))}
                {row.accountRequests.map((req) => (
                  <RequestRow key={req.id} req={req} actions={actions} />
                ))}
              </ul>
            )}
          </div>
        </details>
      )}
      <Button
        size="sm"
        variant="outline"
        nativeButton={false}
        render={<Link to={requestLink(row.investor.id, "")} />}
      >
        Request documents
      </Button>
    </div>
  );
}
