import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SearchIcon } from "lucide-react";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/currency";
import type { WorkflowView } from "@/lib/workflow-types";
import { useAuth } from "@/contexts/auth-context";
import type { AdminInvestor, InvestorsResponse } from "./types";
import { clientStage, type ClientStage } from "./client-stage";
import { OnboardingReviewDialog } from "./onboarding-review";
import { SummaryFigure } from "./summary-figure";
import WorkflowPage from "@/features/workspace/workflow-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Tab = "clients" | "onboarding" | "tools";
const TABS: { key: Tab; label: string }[] = [
  { key: "clients", label: "Clients" },
  { key: "onboarding", label: "Onboarding" },
  { key: "tools", label: "RM assignments and follow-ups" },
];

const RM_LABELS: Record<number, string> = { 6: "rm@akula.vc", 8: "rm2@akula.vc" };
const DAY = 24 * 60 * 60 * 1000;
const ageDays = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY));

const STAGE_TONE: Record<ClientStage["waitingOn"], string> = {
  client: "text-amber-700",
  luca: "text-blue-700",
  none: "text-muted-foreground",
};

type Row = { investor: AdminInvestor; stage: ClientStage; rm: string | null };

/** Every client, where each is in onboarding, and who it is waiting on. */
export default function ClientsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const tab: Tab = TABS.some((t) => t.key === requested) ? (requested as Tab) : "clients";
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"all" | "individual" | "institutional">("all");
  const [reviewing, setReviewing] = useState<AdminInvestor | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "investors", "all"],
    queryFn: () => api<InvestorsResponse>("/api/v1/admin/investors"),
  });
  const { data: workflow } = useQuery({
    queryKey: ["workflows", user?.id],
    queryFn: () => api<WorkflowView>("/api/v1/workflows"),
    staleTime: 0,
  });

  const rows: Row[] = useMemo(
    () =>
      (data?.investors ?? []).map((investor) => {
        const staff = workflow?.assignments.find((a) => a.investorId === investor.id)?.staffId;
        return {
          investor,
          stage: clientStage(investor),
          rm: staff ? (RM_LABELS[staff] ?? `RM #${staff}`) : null,
        };
      }),
    [data, workflow],
  );

  const q = search.trim().toLowerCase();
  const filtered = rows
    .filter(
      (r) =>
        (type === "all" || r.investor.investor_type === type) &&
        (!q ||
          `${r.investor.full_name} ${r.investor.client_code} ${r.investor.email} ${r.investor.eam_firm ?? ""}`
            .toLowerCase()
            .includes(q)),
    )
    .sort((a, b) => a.investor.full_name.localeCompare(b.investor.full_name));

  const inOnboarding = rows.filter((r) => ["client", "luca"].includes(r.stage.waitingOn));
  const waitingLuca = inOnboarding.filter((r) => r.stage.waitingOn === "luca");
  const waitingClient = inOnboarding.filter((r) => r.stage.waitingOn === "client");
  const counts: Record<Tab, number | null> = {
    clients: rows.length,
    onboarding: inOnboarding.length,
    tools: null,
  };

  return (
    <div className="w-full space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
        <p className="text-muted-foreground">
          Everyone investing through LUCA, where each is in onboarding, and who it is waiting on.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-4 border-y py-5 sm:grid-cols-4">
        <SummaryFigure label="Clients" value={String(rows.length)} />
        <SummaryFigure
          label="Onboarded"
          value={String(rows.filter((r) => r.stage.key === "onboarded").length)}
        />
        <SummaryFigure label="Waiting on LUCA" value={String(waitingLuca.length)} />
        <SummaryFigure label="Waiting on the client" value={String(waitingClient.length)} />
      </div>

      <div role="tablist" aria-label="Clients" className="flex flex-wrap gap-x-6 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setSearchParams(t.key === "clients" ? {} : { tab: t.key })}
            className={`-mb-px flex items-center gap-2 border-b-2 px-1 pb-3 text-sm transition-colors ${
              tab === t.key
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {counts[t.key] !== null && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
                {counts[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "tools" ? (
        <WorkflowPage surface="Relationships" compact />
      ) : isLoading ? (
        <p className="py-12 text-center text-muted-foreground">Loading clients...</p>
      ) : tab === "clients" ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-sm">
              <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name, code, email or partner"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {(["all", "individual", "institutional"] as const).map((t) => (
              <Button
                key={t}
                size="sm"
                variant={type === t ? "secondary" : "outline"}
                className="rounded-full"
                onClick={() => setType(t)}
              >
                {t === "all" ? "All" : t === "individual" ? "Individuals" : "Entities"}
              </Button>
            ))}
          </div>
          {filtered.length === 0 ? (
            <p className="border-y py-12 text-center text-sm text-muted-foreground">
              No clients match.
            </p>
          ) : (
            <div>
              <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.6fr)_7rem] gap-x-4 border-b pb-2 text-xs text-muted-foreground lg:grid">
                <span>Client</span>
                <span>Partner</span>
                <span>RM</span>
                <span>Onboarding</span>
                <span className="text-right">Committed</span>
              </div>
              <ul className="divide-y border-b">
                {filtered.map(({ investor, stage, rm }) => (
                  <li key={investor.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/luca/investors/${investor.id}`)}
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 text-left hover:bg-muted/40 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.6fr)_7rem]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {investor.full_name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {investor.client_code} ·{" "}
                          {investor.investor_type === "institutional" ? "Entity" : "Individual"}
                          {investor.prepared_by_rm
                            ? ` · prepared by ${investor.prepared_by_rm}`
                            : ""}
                        </span>
                      </span>
                      <span className="hidden truncate text-sm lg:block">
                        {investor.eam_firm ?? "Direct"}
                      </span>
                      <span className="hidden truncate text-sm text-muted-foreground lg:block">
                        {rm ?? "—"}
                      </span>
                      <span
                        className={`order-3 col-span-2 text-sm lg:order-none lg:col-span-1 ${STAGE_TONE[stage.waitingOn]}`}
                      >
                        {stage.label}
                      </span>
                      <span className="text-right text-sm tabular-nums">
                        {formatPrice(Number(investor.committed_amount))}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-8">
          <Queue
            title="Waiting on LUCA"
            note="Identity and accreditation decisions."
            rows={waitingLuca}
            empty="Nothing is waiting for your decision."
            action={(r) => (
              <Button size="sm" onClick={() => setReviewing(r.investor)}>
                Review
              </Button>
            )}
          />
          <Queue
            title="Waiting on the client"
            note="Started but not yet finished by the client."
            rows={waitingClient}
            empty="No clients are mid-onboarding."
            action={(r) => (
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={
                  <Link
                    to={`/luca/communications/new?audience=investor:${r.investor.id}&purpose=request&docs=`}
                  />
                }
              >
                Send a reminder
              </Button>
            )}
          />
        </div>
      )}

      {reviewing && (
        <OnboardingReviewDialog
          investor={reviewing}
          onClose={() => setReviewing(null)}
          onReviewed={() => queryClient.invalidateQueries({ queryKey: ["admin", "investors"] })}
        />
      )}
    </div>
  );
}

function Queue({
  title,
  note,
  rows,
  empty,
  action,
}: {
  title: string;
  note: string;
  rows: Row[];
  empty: string;
  action: (row: Row) => React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {title} ({rows.length})
        </h2>
        <p className="text-sm text-muted-foreground">{note}</p>
      </div>
      {rows.length === 0 ? (
        <p className="border-y py-6 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y border-y">
          {rows
            .sort((a, b) => ageDays(b.investor.created_at) - ageDays(a.investor.created_at))
            .map((r) => (
              <li
                key={r.investor.id}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3"
              >
                <span className="min-w-0">
                  <Link
                    to={`/luca/investors/${r.investor.id}`}
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {r.investor.full_name}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">
                    {r.investor.client_code} ·{" "}
                    {r.investor.investor_type === "institutional" ? "Entity" : "Individual"} ·{" "}
                    {r.investor.eam_firm ?? "Direct"}
                    {r.investor.prepared_by_rm ? ` · prepared by ${r.investor.prepared_by_rm}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-4 text-sm">
                  <span className={STAGE_TONE[r.stage.waitingOn]}>{r.stage.label}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {ageDays(r.investor.created_at)}d
                  </span>
                  {action(r)}
                </span>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
