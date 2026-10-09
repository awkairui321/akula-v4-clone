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
import type { ClientActions } from "./compliance-clients";
import { formatDate } from "./compliance-helpers";
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

/** Documents and document requests, with the actions on them: approve, hold, remind, withdraw. */
export function useDocumentActions() {
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
  return {
    actions,
    documents: documents.data?.documents ?? [],
    requests: requests.data?.requests ?? [],
    isError: documents.isError || requests.isError,
    isLoading: documents.isLoading || requests.isLoading,
  };
}

/** Every onboarded client with their funds, capital and documents, and the actions on a document. */
export function useClientBook(investors: AdminInvestor[], workflow?: WorkflowView) {
  const docs = useDocumentActions();
  const rows = useMemo(
    () => (workflow ? buildClientFunds(investors, workflow, docs.documents, docs.requests) : []),
    [investors, workflow, docs.documents, docs.requests],
  );
  return {
    rows,
    actions: docs.actions,
    isError: docs.isError,
    isLoading: !workflow || docs.isLoading,
  };
}

type FundPaper = ClientFund["papers"][number];

const paperRow = "group/paper";

/** One subscription's two papers: the signed subscription form and the capital call. */
function Papers({
  paper,
  actions,
  workflow,
  heading,
}: {
  paper: FundPaper;
  actions: ClientActions;
  workflow: WorkflowView;
  heading: boolean;
}) {
  const { subscription: sub, signature, agreement, call } = paper;
  const version = workflow.versions.find((v) => v.id === signature?.versionId);
  const paid = call.issued && call.received >= call.total - 0.005;
  return (
    <div className="space-y-1">
      {heading && (
        <p className="text-xs text-muted-foreground">
          Subscription #{sub.id} · {formatPrice(call.principal)}
        </p>
      )}
      <ul className="divide-y rounded-md border px-3 text-sm">
        <li>
          <details className={`${paperRow} py-3`}>
            <summary className={`${SUMMARY} flex-wrap`}>
              <ChevronRightIcon className={`${CHEVRON} group-open/paper:rotate-90`} />
              <span className="font-medium">Signed subscription form</span>
              <span className="text-xs text-muted-foreground">
                {signature
                  ? `Signed ${formatDate(signature.at)}${version ? ` · version ${version.number}` : ""}`
                  : "Not signed yet"}
              </span>
            </summary>
            <div className="space-y-2 py-3 pl-7 text-xs text-muted-foreground">
              {signature ? (
                <p>
                  Signed on {formatDate(signature.at)} ({signature.name}). The exact offering
                  version is retained.
                </p>
              ) : (
                <p>The investor has not signed the subscription form.</p>
              )}
              {agreement && (
                <div className="flex flex-wrap items-center gap-3">
                  {agreement.file_data_url && (
                    <a
                      href={agreement.file_data_url}
                      download={agreement.name}
                      className="font-medium text-primary underline underline-offset-2"
                    >
                      Download signed form
                    </a>
                  )}
                  {agreement.review_state !== "filed" && (
                    <>
                      <Button size="sm" onClick={() => actions.approve(agreement.id)}>
                        Approve
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => actions.hold(agreement.id)}>
                        Hold
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </details>
        </li>
        <li>
          <details className={`${paperRow} py-3`}>
            <summary className={`${SUMMARY} flex-wrap`}>
              <ChevronRightIcon className={`${CHEVRON} group-open/paper:rotate-90`} />
              <span className="font-medium">Capital call</span>
              <span className="text-xs text-muted-foreground">
                {!call.issued
                  ? "Not issued yet"
                  : paid
                    ? `${formatPrice(call.total)} · paid${call.receivedAt ? ` ${formatDate(call.receivedAt)}` : ""}`
                    : `${formatPrice(call.total)} · awaiting funds`}
              </span>
            </summary>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 py-3 pl-7 text-xs sm:grid-cols-3">
              {[
                ["Capital", formatPrice(call.principal)],
                ["Subscription fee", formatPrice(call.fee)],
                ["Total called", formatPrice(call.total)],
                ["Payment reference", sub.payment_reference || "—"],
                [
                  "Issued",
                  call.issuedAt ? formatDate(call.issuedAt) : call.issued ? "—" : "After sign-off",
                ],
                ["Received", call.received ? formatPrice(call.received) : "Nothing yet"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 text-sm font-medium text-foreground tabular-nums">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        </li>
      </ul>
    </div>
  );
}

/** One fund for one client: capital, holdings, applications and the documents filed against it. */
export function FundSection({
  fund,
  clientId,
  workflow,
  actions,
  defaultOpen,
  flat,
}: {
  fund: ClientFund;
  clientId: number;
  workflow: WorkflowView;
  actions: ClientActions;
  defaultOpen?: boolean;
  /** Show only the contents, when the fund is already named by the surrounding page. */
  flat?: boolean;
}) {
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
        Subscription papers
      </h4>
      {fund.papers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No subscription in this fund yet.</p>
      ) : (
        <div className="space-y-4">
          {fund.papers.map((paper) => (
            <Papers
              key={paper.subscription.id}
              paper={paper}
              actions={actions}
              workflow={workflow}
              heading={fund.papers.length > 1}
            />
          ))}
        </div>
      )}
      {fund.otherCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {fund.otherCount} other document{fund.otherCount === 1 ? "" : "s"} and requests are on the{" "}
          <Link
            to={`/luca/investors/${clientId}#documents`}
            className="text-foreground underline underline-offset-2"
          >
            client record
          </Link>
          .
        </p>
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
            {fund.project} ·{" "}
            {fund.papers.length === 0
              ? "no active subscription"
              : `${fund.papers.length} ${fund.papers.length === 1 ? "subscription" : "subscriptions"}`}
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

/** What sits under a client: their funds (or just one), each with its subscription papers. */
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
          clientId={row.investor.id}
          workflow={workflow}
          actions={actions}
          defaultOpen={onlyFundId !== undefined}
          flat={onlyFundId !== undefined}
        />
      ))}
    </div>
  );
}
