import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { SearchIcon } from "lucide-react";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/currency";
import type { WorkflowView } from "@/lib/workflow-types";
import { useAuth } from "@/contexts/auth-context";
import ClientFunds from "./client-funds";
import type { AdminInvestor, InvestorsResponse } from "./types";
import { clientStage, PIPELINE, type ClientStage, type StageKey } from "./client-stage";
import { useRms } from "./use-rms";
import { SummaryFigure } from "./summary-figure";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Tab = "projects" | "directory" | "onboarding";
const TABS: { key: Tab; label: string }[] = [
  { key: "projects", label: "Funds & documents" },
  { key: "directory", label: "Directory" },
  { key: "onboarding", label: "Onboarding" },
];

const DAY = 24 * 60 * 60 * 1000;
const ageDays = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY));
const dateText = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "—";
const SECTION = "text-xs font-medium tracking-wide text-muted-foreground uppercase";

const STAGE_TONE: Record<ClientStage["waitingOn"], string> = {
  client: "text-amber-700",
  luca: "text-blue-700",
  none: "text-muted-foreground",
};

type Row = { investor: AdminInvestor; stage: ClientStage; rm: string | null };

const kind = (i: AdminInvestor) => (i.investor_type === "institutional" ? "Entity" : "Individual");
const partnerOf = (i: AdminInvestor) => i.referral?.partner_firm ?? i.eam_firm ?? null;

/** Where the client came from, in one phrase. */
const sourceOf = (i: AdminInvestor) =>
  partnerOf(i) ?? (i.referral?.via === "rm_invite" ? "Referred by RM" : "Direct");

/** What compliance has established, in words an operator can scan. */
function complianceOf(i: AdminInvestor) {
  if (i.identity_status === "failed" || i.accreditation_status === "not_accredited")
    return { text: "Failed checks", tone: "text-destructive" };
  const parts = [
    i.identity_status === "verified" ? "KYC verified" : "KYC open",
    i.accreditation_status === "accredited"
      ? `Accredited${i.accreditation_expiry ? ` to ${dateText(i.accreditation_expiry)}` : ""}`
      : "Accreditation open",
  ];
  const done = i.identity_status === "verified" && i.accreditation_status === "accredited";
  return { text: parts.join(" · "), tone: done ? "text-muted-foreground" : "text-amber-700" };
}

/** Every client: by project and fund, as a directory, and through onboarding. */
export default function ClientsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const tab: Tab = TABS.some((t) => t.key === requested) ? (requested as Tab) : "projects";
  const { label: rmLabel } = useRms();

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
        const staff =
          workflow?.assignments.find((a) => a.investorId === investor.id)?.staffId ??
          investor.rm_id;
        return { investor, stage: clientStage(investor), rm: staff ? rmLabel(staff) : null };
      }),
    [data, workflow, rmLabel],
  );

  const waitingLuca = rows.filter((r) => r.stage.waitingOn === "luca").length;
  const waitingClient = rows.filter((r) => r.stage.waitingOn === "client").length;
  const counts: Record<Tab, number> = {
    projects: 0,
    directory: rows.length,
    onboarding: waitingLuca + waitingClient,
  };

  return (
    <div className="w-full space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
        <p className="text-muted-foreground">
          Who is invested where, who every client is, and who is waiting on whom to get onboarded.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-4 border-y py-5 sm:grid-cols-4">
        <SummaryFigure label="Clients" value={String(rows.length)} />
        <SummaryFigure
          label="Onboarded"
          value={String(rows.filter((r) => r.stage.key === "onboarded").length)}
        />
        <SummaryFigure label="Waiting on LUCA" value={String(waitingLuca)} />
        <SummaryFigure label="Waiting on the client" value={String(waitingClient)} />
      </div>

      <div role="tablist" aria-label="Clients" className="flex flex-wrap gap-x-6 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setSearchParams(t.key === "projects" ? {} : { tab: t.key })}
            className={`-mb-px flex items-center gap-2 border-b-2 px-1 pb-3 text-sm transition-colors ${
              tab === t.key
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {counts[t.key] > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
                {counts[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "projects" ? (
        <ClientFunds investors={data?.investors ?? []} workflow={workflow} isLoading={isLoading} />
      ) : isLoading ? (
        <p className="py-12 text-center text-muted-foreground">Loading clients...</p>
      ) : tab === "directory" ? (
        <DirectoryTab rows={rows} />
      ) : (
        <OnboardingTab rows={rows} />
      )}
    </div>
  );
}

const GRID =
  "lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1.6fr)_7rem]";

/** Everyone, with individuals and entities one toggle apart rather than separate pages. */
function DirectoryTab({ rows }: { rows: Row[] }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"all" | "individual" | "institutional">("all");
  const q = search.trim().toLowerCase();
  const filtered = rows
    .filter(
      (r) =>
        (type === "all" || r.investor.investor_type === type) &&
        (!q ||
          `${r.investor.full_name} ${r.investor.reference ?? ""} ${r.investor.email} ${sourceOf(r.investor)} ${r.rm ?? ""}`
            .toLowerCase()
            .includes(q)),
    )
    .sort((a, b) => a.investor.full_name.localeCompare(b.investor.full_name));
  const count = (t: typeof type) =>
    rows.filter((r) => t === "all" || r.investor.investor_type === t).length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, reference, email, partner or RM"
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
            {t === "all" ? "All" : t === "individual" ? "Individuals" : "Entities"} {count(t)}
          </Button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="border-y py-12 text-center text-sm text-muted-foreground">
          No clients match.
        </p>
      ) : (
        <div>
          <div
            className={`hidden gap-x-4 border-b pb-2 text-xs text-muted-foreground lg:grid ${GRID}`}
          >
            <span>Client</span>
            <span>Source</span>
            <span>RM</span>
            <span>Onboarding</span>
            <span>Compliance</span>
            <span className="text-right">Committed</span>
          </div>
          <ul className="divide-y border-b">
            {filtered.map(({ investor, stage, rm }) => {
              const compliance = complianceOf(investor);
              return (
                <li key={investor.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/luca/investors/${investor.id}`)}
                    className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 text-left hover:bg-muted/40 ${GRID}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {investor.full_name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        <span className="font-mono">
                          {investor.reference ?? "No reference yet"}
                        </span>{" "}
                        · {kind(investor)}
                      </span>
                    </span>
                    <span className="hidden truncate text-sm lg:block">{sourceOf(investor)}</span>
                    <span className="hidden truncate text-sm text-muted-foreground lg:block">
                      {rm ?? "—"}
                    </span>
                    <span
                      className={`order-3 col-span-2 text-sm lg:order-none lg:col-span-1 ${STAGE_TONE[stage.waitingOn]}`}
                    >
                      {stage.label}
                    </span>
                    <span className={`hidden truncate text-xs lg:block ${compliance.tone}`}>
                      {compliance.text}
                    </span>
                    <span className="text-right text-sm tabular-nums">
                      {formatPrice(Number(investor.committed_amount))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

/** The pipeline in order, then everyone who is onboarded. */
function OnboardingTab({ rows }: { rows: Row[] }) {
  const byStage = (key: StageKey) =>
    rows
      .filter((r) => r.stage.key === key)
      .sort((a, b) => ageDays(b.investor.created_at) - ageDays(a.investor.created_at));
  const onboarded = byStage("onboarded").sort((a, b) =>
    (b.investor.approved_at ?? "").localeCompare(a.investor.approved_at ?? ""),
  );

  return (
    <div className="space-y-8">
      {PIPELINE.map((step) => {
        const list = byStage(step.key);
        return (
          <section key={step.key} className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <h2 className={SECTION}>
                {step.title} ({list.length})
              </h2>
              <p className="text-xs text-muted-foreground">{step.note}</p>
            </div>
            {list.length === 0 ? null : (
              <ul className="divide-y border-y">
                {list.map((r) => (
                  <PipelineRow key={r.investor.id} row={r} />
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <h2 className={SECTION}>Onboarded ({onboarded.length})</h2>
          <p className="text-xs text-muted-foreground">
            Approved by LUCA, each with a unique reference.
          </p>
        </div>
        {onboarded.length === 0 ? (
          <p className="border-y py-3 text-sm text-muted-foreground">Nobody is onboarded yet.</p>
        ) : (
          <div>
            <div className="hidden grid-cols-[7rem_minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_7rem_minmax(0,1fr)] gap-x-4 border-b pb-2 text-xs text-muted-foreground lg:grid">
              <span>Reference</span>
              <span>Client</span>
              <span>Source</span>
              <span>RM</span>
              <span>Approved</span>
              <span>By</span>
            </div>
            <ul className="divide-y border-b">
              {onboarded.map(({ investor, rm }) => (
                <li key={investor.id}>
                  <Link
                    to={`/luca/investors/${investor.id}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 py-2.5 text-sm hover:bg-muted/40 lg:grid-cols-[7rem_minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_7rem_minmax(0,1fr)]"
                  >
                    <span className="order-2 font-mono text-xs lg:order-none lg:text-sm">
                      {investor.reference ?? "—"}
                    </span>
                    <span className="min-w-0 truncate font-medium">
                      {investor.full_name}
                      <span className="font-normal text-muted-foreground"> · {kind(investor)}</span>
                    </span>
                    <span className="hidden truncate lg:block">{sourceOf(investor)}</span>
                    <span className="hidden truncate text-muted-foreground lg:block">
                      {rm ?? "—"}
                    </span>
                    <span className="hidden tabular-nums lg:block">
                      {dateText(investor.approved_at)}
                    </span>
                    <span className="hidden truncate text-muted-foreground lg:block">
                      {investor.reviewed_by ?? "—"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function PipelineRow({ row }: { row: Row }) {
  const { investor, stage, rm } = row;
  const reminder = (
    <Button
      size="sm"
      variant="outline"
      nativeButton={false}
      render={
        <Link
          to={`/luca/communications/new?audience=investor:${investor.id}&purpose=request&docs=`}
        />
      }
    >
      Send a reminder
    </Button>
  );
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
      <span className="min-w-0">
        <Link
          to={`/luca/investors/${investor.id}`}
          className="block truncate text-sm font-medium hover:underline"
        >
          {investor.full_name}
        </Link>
        <span className="block truncate text-xs text-muted-foreground">
          {kind(investor)} · {sourceOf(investor)}
          {rm ? ` · ${rm}` : ""}
          {investor.reapplied_at ? " · reapplied" : ""}
          {investor.prepared_by_rm ? ` · prepared by ${investor.prepared_by_rm}` : ""}
        </span>
        {(stage.key === "needs_info" || stage.key === "declined") && investor.decision_note && (
          <span className="block truncate text-xs text-muted-foreground">
            “{investor.decision_note}”
          </span>
        )}
      </span>
      <span className="flex items-center gap-4 text-sm">
        <span className="text-muted-foreground tabular-nums">{ageDays(investor.created_at)}d</span>
        {stage.key === "review" ? (
          <Button
            size="sm"
            nativeButton={false}
            render={<Link to={`/luca/clients/${investor.id}/review`} />}
          >
            Review application
          </Button>
        ) : stage.key === "declined" ? (
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<Link to={`/luca/clients/${investor.id}/review`} />}
          >
            View decision
          </Button>
        ) : (
          reminder
        )}
      </span>
    </li>
  );
}
