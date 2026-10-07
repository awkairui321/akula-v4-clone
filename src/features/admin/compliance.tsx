import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SearchIcon } from "lucide-react";
import { api } from "@/lib/api";
import { DEAL_MATERIAL_KINDS, documentKindLabel } from "@/lib/document-catalogue";
import type {
  AdminDocument,
  DocumentRequestRow,
  DocumentReviewState,
  DocumentsResponse,
  InvestorsResponse,
} from "./types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SummaryFigure } from "./summary-figure";
import ComplianceClients from "./compliance-clients";
import type { WorkflowView } from "@/lib/workflow-types";
import { useAuth } from "@/contexts/auth-context";
import {
  EXPIRY_WINDOW_DAYS,
  daysBetween,
  dueLabel,
  formatDate,
  requestLink,
} from "./compliance-helpers";

type Tab = "review" | "requests" | "expiring" | "filed" | "clients";

const TABS: { key: Tab; label: string }[] = [
  { key: "review", label: "To review" },
  { key: "requests", label: "Requested from clients" },
  { key: "expiring", label: "Expiring" },
  { key: "filed", label: "Filed" },
  { key: "clients", label: "By client" },
];

/** Compliance: what to review, what we are waiting for, and what is about to expire. */
export default function AdminCompliancePage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const tab: Tab = TABS.some((t) => t.key === requested)
    ? (requested as Tab)
    : searchParams.get("client")
      ? "clients"
      : "review";
  const [search, setSearch] = useState("");

  const { data: docsData, isLoading } = useQuery({
    queryKey: ["admin", "documents", "all"],
    queryFn: () => api<DocumentsResponse>("/api/v1/admin/documents"),
  });
  const { data: requestsData } = useQuery({
    queryKey: ["admin", "document-requests"],
    queryFn: () => api<{ requests: DocumentRequestRow[] }>("/api/v1/admin/document_requests"),
  });
  const { data: investorsData } = useQuery({
    queryKey: ["admin", "investors", "all"],
    queryFn: () => api<InvestorsResponse>("/api/v1/admin/investors"),
  });

  const { user } = useAuth();
  const { data: workflowData } = useQuery({
    queryKey: ["workflows", user?.id],
    queryFn: () => api<WorkflowView>("/api/v1/workflows"),
    staleTime: 0,
  });
  const focusId = Number(searchParams.get("client")) || undefined;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "documents"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "document-requests"] });
  };

  const setState = useMutation({
    mutationFn: ({ id, to }: { id: number; to: DocumentReviewState }) =>
      api(`/api/v1/admin/documents/${id}`, {
        method: "PATCH",
        body: { document: { review_state: to } },
      }),
    onSuccess: (_r, { to }) => {
      toast.success(to === "filed" ? "Approved and filed." : "Document updated.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remind = useMutation({
    mutationFn: (id: number) =>
      api(`/api/v1/admin/document_requests/${id}/remind`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Reminder sent.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const withdraw = useMutation({
    mutationFn: (id: number) => api(`/api/v1/admin/document_requests/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Request withdrawn.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Deal brochures live in each deal's workspace; this page is about clients' paperwork.
  const compliance = useMemo(
    () => (docsData?.documents ?? []).filter((d) => !DEAL_MATERIAL_KINDS.includes(d.kind)),
    [docsData],
  );
  const toReview = compliance.filter((d) => d.review_state !== "filed");
  const filed = compliance.filter((d) => d.review_state === "filed");
  const open = (requestsData?.requests ?? []).filter((r) => r.status === "requested");
  const openKeys = new Set(open.map((r) => `${r.investor_id}:${r.kind}`));

  const now = Date.now();
  const expiring = (investorsData?.investors ?? [])
    .filter((i) => i.accreditation_expiry)
    .map((i) => ({
      investor: i,
      days: daysBetween(now, new Date(i.accreditation_expiry!).getTime()),
    }))
    .filter((x) => x.days <= EXPIRY_WINDOW_DAYS)
    .sort((a, b) => a.days - b.days);
  const lapsed = (investorsData?.investors ?? []).filter(
    (i) => i.verification_status === "approved" && i.accreditation_status === "not_accredited",
  );
  const expiringCount = expiring.length + lapsed.length;
  const overdue = open.filter((r) => dueLabel(r.due_at).overdue).length;
  const expiring30 = expiring.filter((x) => x.days <= 30).length + lapsed.length;

  const q = search.trim().toLowerCase();
  const matches = (text: string) => !q || text.toLowerCase().includes(q);
  const counts: Record<Tab, number> = {
    review: toReview.length,
    requests: open.length,
    expiring: expiringCount,
    filed: filed.length,
    clients: (investorsData?.investors ?? []).length,
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Compliance</h1>
          <p className="text-muted-foreground">
            Documents to review, documents we are waiting for and approvals about to expire. Open By
            client to see everything held for one client.
          </p>
        </div>
        <Button
          nativeButton={false}
          render={<Link to="/luca/communications/new?purpose=request" />}
        >
          Request documents
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-4 border-y py-5 sm:grid-cols-4">
        <SummaryFigure label="To review" value={String(toReview.length)} />
        <SummaryFigure
          label="Requested from clients"
          value={`${open.length}${overdue ? ` · ${overdue} overdue` : ""}`}
        />
        <SummaryFigure label="Expiring within 30 days" value={String(expiring30)} />
        <SummaryFigure label="Filed" value={String(filed.length)} />
      </div>

      <div role="tablist" aria-label="Compliance" className="flex flex-wrap gap-x-6 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setSearchParams({ tab: t.key })}
            className={`-mb-px flex items-center gap-2 border-b-2 px-1 pb-3 text-sm transition-colors ${
              tab === t.key
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      <div className="relative max-w-sm">
        <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search client or document"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <p className="py-12 text-center text-muted-foreground">Loading...</p>
      ) : tab === "review" ? (
        <DocumentTable
          docs={toReview.filter((d) => matches(`${d.name} ${d.owner_name}`))}
          empty="Nothing is waiting for review."
          actions={(d) => (
            <>
              <Button size="sm" onClick={() => setState.mutate({ id: d.id, to: "filed" })}>
                Approve
              </Button>
              {d.review_state === "on_hold" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setState.mutate({ id: d.id, to: "reviewing" })}
                >
                  Release hold
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() => setState.mutate({ id: d.id, to: "on_hold" })}
                >
                  Hold
                </Button>
              )}
            </>
          )}
          showStatus
        />
      ) : tab === "requests" ? (
        <RequestsTable
          rows={open
            .filter((r) => matches(`${r.investor_name} ${documentKindLabel(r.kind)}`))
            .sort(
              (a, b) =>
                new Date(a.due_at ?? "2100-01-01").getTime() -
                new Date(b.due_at ?? "2100-01-01").getTime(),
            )}
          onRemind={(id) => remind.mutate(id)}
          onWithdraw={(id) => withdraw.mutate(id)}
        />
      ) : tab === "expiring" ? (
        <ExpiringTable
          rows={[
            ...lapsed.map((i) => ({ investor: i, days: -1, lapsed: true })),
            ...expiring.map((x) => ({ ...x, lapsed: false })),
          ].filter((x) => matches(x.investor.full_name))}
          openKeys={openKeys}
        />
      ) : tab === "clients" ? (
        <ComplianceClients
          investors={investorsData?.investors ?? []}
          docs={docsData?.documents ?? []}
          requests={requestsData?.requests ?? []}
          signatures={workflowData?.signatures ?? []}
          subscriptions={workflowData?.subscriptions ?? []}
          versions={workflowData?.versions ?? []}
          search={search}
          focusId={focusId}
          actions={{
            approve: (id) => setState.mutate({ id, to: "filed" }),
            hold: (id) => setState.mutate({ id, to: "on_hold" }),
            release: (id) => setState.mutate({ id, to: "reviewing" }),
            remind: (id) => remind.mutate(id),
            withdraw: (id) => withdraw.mutate(id),
          }}
        />
      ) : (
        <DocumentTable
          docs={filed.filter((d) => matches(`${d.name} ${d.owner_name}`))}
          empty="No filed documents yet."
          actions={() => null}
        />
      )}
    </div>
  );
}

/* ─── Tables ─── */

function DocumentTable({
  docs,
  empty,
  actions,
  showStatus = false,
}: {
  docs: AdminDocument[];
  empty: string;
  actions: (doc: AdminDocument) => React.ReactNode;
  showStatus?: boolean;
}) {
  if (docs.length === 0)
    return <p className="border-y py-12 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <div>
      <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_7rem_8rem_12rem] gap-x-4 border-b pb-2 text-xs text-muted-foreground lg:grid">
        <span>Document</span>
        <span>From</span>
        <span>Received</span>
        <span>{showStatus ? "Status" : ""}</span>
        <span />
      </div>
      <ul className="divide-y border-b">
        {docs.map((d) => (
          <li
            key={d.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 hover:bg-muted/40 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_7rem_8rem_12rem]"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{d.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {documentKindLabel(d.kind)}
                {d.uploaded_by?.role === "rm" &&
                  ` · supplied by ${d.uploaded_by.name}, ${d.confirmed_at ? "confirmed by investor" : "awaiting investor confirmation"}`}
              </span>
            </span>
            <span className="order-3 col-span-2 min-w-0 lg:order-none lg:col-span-1">
              <Link
                to={`/luca/investors/${d.owner_id}`}
                className="block truncate text-sm hover:underline"
              >
                {d.owner_name}
              </Link>
              {d.fund_id && d.fund_name && (
                <Link
                  to={`/luca/deals/${d.fund_id}`}
                  className="block truncate text-xs text-muted-foreground hover:underline"
                >
                  {d.fund_name}
                </Link>
              )}
            </span>
            <span className="text-right text-sm text-muted-foreground tabular-nums lg:text-left">
              {formatDate(d.created_at)}
            </span>
            <span className="hidden text-sm text-muted-foreground capitalize lg:block">
              {showStatus ? d.review_state.replace("_", " ") : ""}
            </span>
            <span className="order-4 col-span-2 flex justify-end gap-2 lg:order-none lg:col-span-1">
              {actions(d)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RequestsTable({
  rows,
  onRemind,
  onWithdraw,
}: {
  rows: DocumentRequestRow[];
  onRemind: (id: number) => void;
  onWithdraw: (id: number) => void;
}) {
  if (rows.length === 0)
    return (
      <p className="border-y py-12 text-center text-sm text-muted-foreground">
        No outstanding requests. Use “Request documents” to ask a client for something.
      </p>
    );
  return (
    <div>
      <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,2fr)_7rem_8rem_11rem] gap-x-4 border-b pb-2 text-xs text-muted-foreground lg:grid">
        <span>Client</span>
        <span>Document</span>
        <span>Requested</span>
        <span>Due</span>
        <span />
      </div>
      <ul className="divide-y border-b">
        {rows.map((r) => {
          const due = dueLabel(r.due_at);
          return (
            <li
              key={r.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 hover:bg-muted/40 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,2fr)_7rem_8rem_11rem]"
            >
              <span className="min-w-0">
                <Link
                  to={`/luca/investors/${r.investor_id}`}
                  className="block truncate text-sm font-medium hover:underline"
                >
                  {r.investor_name}
                </Link>
                <span className="block truncate text-xs text-muted-foreground">
                  {r.eam_firm ?? "Direct"}
                </span>
              </span>
              <span className="order-3 col-span-2 min-w-0 lg:order-none lg:col-span-1">
                <span className="block truncate text-sm">{documentKindLabel(r.kind)}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {r.fund_name ? `${r.fund_name} · ` : ""}
                  {r.note ?? ""}
                </span>
              </span>
              <span className="text-right text-sm text-muted-foreground tabular-nums lg:text-left">
                {formatDate(r.requested_at)}
              </span>
              <span
                className={`text-sm tabular-nums ${due.overdue ? "font-medium text-amber-700" : "text-muted-foreground"}`}
              >
                {due.text}
                {r.reminded_at && (
                  <span className="block text-xs font-normal text-muted-foreground">
                    Reminded {formatDate(r.reminded_at)}
                  </span>
                )}
              </span>
              <span className="order-4 col-span-2 flex justify-end gap-2 lg:order-none lg:col-span-1">
                <Button size="sm" variant="outline" onClick={() => onRemind(r.id)}>
                  Remind
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => onWithdraw(r.id)}
                >
                  Withdraw
                </Button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ExpiringTable({
  rows,
  openKeys,
}: {
  rows: { investor: InvestorsResponse["investors"][number]; days: number; lapsed: boolean }[];
  openKeys: Set<string>;
}) {
  if (rows.length === 0)
    return (
      <p className="border-y py-12 text-center text-sm text-muted-foreground">
        No accreditations expire in the next {EXPIRY_WINDOW_DAYS} days.
      </p>
    );
  return (
    <div>
      <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,2fr)_8rem_11rem] gap-x-4 border-b pb-2 text-xs text-muted-foreground lg:grid">
        <span>Client</span>
        <span>Approval</span>
        <span>Expires</span>
        <span />
      </div>
      <ul className="divide-y border-b">
        {rows.map(({ investor, days, lapsed }) => {
          const asked = openKeys.has(`${investor.id}:accreditation_letter`);
          return (
            <li
              key={investor.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 hover:bg-muted/40 lg:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_8rem_11rem]"
            >
              <span className="min-w-0">
                <Link
                  to={`/luca/investors/${investor.id}`}
                  className="block truncate text-sm font-medium hover:underline"
                >
                  {investor.full_name}
                </Link>
                <span className="block truncate text-xs text-muted-foreground">
                  {investor.eam_firm ?? "Direct"}
                </span>
              </span>
              <span className="order-3 col-span-2 text-sm lg:order-none lg:col-span-1">
                Accredited investor status
              </span>
              <span
                className={`text-sm tabular-nums ${
                  lapsed || days <= 30 ? "font-medium text-amber-700" : "text-muted-foreground"
                }`}
              >
                {lapsed ? "Lapsed" : days <= 0 ? "Today" : `In ${days}d`}
              </span>
              <span className="order-4 col-span-2 flex justify-end lg:order-none lg:col-span-1">
                {asked ? (
                  <span className="text-xs text-muted-foreground">Renewal requested</span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    nativeButton={false}
                    render={<Link to={requestLink(investor.id, "accreditation_letter")} />}
                  >
                    Request renewal
                  </Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
