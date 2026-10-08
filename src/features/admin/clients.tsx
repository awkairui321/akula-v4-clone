import { demoClientBook } from "@/lib/demo-client-book";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRightIcon, FolderIcon, SearchIcon } from "lucide-react";
import { api } from "@/lib/api";
import type { WorkflowView } from "@/lib/workflow-types";
import { useAuth } from "@/contexts/auth-context";
import type { Capital } from "@/features/partners/partner-data";
import type { InvestorsResponse } from "./types";
import { useRms } from "./use-rms";
import {
  CHEVRON,
  ClientBody,
  Figures,
  SUMMARY,
  needsReview,
  useClientBook,
  type ClientFund,
  type ClientRow,
} from "./client-funds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Group = "name" | "project";
type Kind = "all" | "individual" | "institutional";
const GROUPS: { key: Group; label: string }[] = [
  { key: "name", label: "Name A–Z" },
  { key: "project", label: "Project & fund" },
];
const KINDS: { key: Kind; label: string }[] = [
  { key: "all", label: "All" },
  { key: "individual", label: "Individuals" },
  { key: "institutional", label: "Entities" },
];

const empty = (): Capital => ({ committed: 0, funded: 0, allocated: 0 });
const sum = (items: (Capital | undefined)[]): Capital =>
  items.reduce<Capital>(
    (t, c) => ({
      committed: t.committed + (c?.committed ?? 0),
      funded: t.funded + (c?.funded ?? 0),
      allocated: t.allocated + (c?.allocated ?? 0),
    }),
    empty(),
  );

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Attention({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
      {count} to review
    </span>
  );
}

/** Every onboarded client: browse by name or by project and fund, and open their documents in place. */
export default function ClientsPage() {
  const { user } = useAuth();
  const { label: rmLabel } = useRms();
  const [params, setParams] = useSearchParams();
  const group: Group = params.get("group") === "project" ? "project" : "name";
  const kind: Kind = KINDS.some((k) => k.key === params.get("type"))
    ? (params.get("type") as Kind)
    : "all";
  const [search, setSearch] = useState("");
  const setParam = (key: string, value: string, fallback: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === fallback) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );

  const { data, isLoading: loadingInvestors } = useQuery({
    queryKey: ["admin", "investors", "all"],
    queryFn: () => api<InvestorsResponse>("/api/v1/admin/investors"),
  });
  const { data: workflow } = useQuery({
    queryKey: ["workflows", user?.id],
    queryFn: () => api<WorkflowView>("/api/v1/workflows"),
    staleTime: 0,
  });
  const clients = useMemo(
    () => demoClientBook(data?.investors ?? []).filter((i) => i.verification_status === "approved"),
    [data],
  );
  const book = useClientBook(clients, workflow);

  const q = search.trim().toLowerCase();
  const matches = (row: ClientRow) =>
    `${row.investor.full_name} ${row.investor.reference ?? ""} ${row.investor.client_code} ${row.investor.email}`
      .toLowerCase()
      .includes(q);
  const inKind = (row: ClientRow, k: Kind) => k === "all" || row.investor.investor_type === k;
  const visible = book.rows.filter((r) => matches(r) && inKind(r, kind));
  const count = (k: Kind) => book.rows.filter((r) => matches(r) && inKind(r, k)).length;

  const source = (row: ClientRow) => {
    const i = row.investor;
    const partner = i.referral?.partner_firm ?? i.eam_firm;
    const referred = Boolean(partner || i.referral?.via === "rm_invite");
    const staff = workflow?.assignments.find((a) => a.investorId === i.id)?.staffId ?? i.rm_id;
    return {
      text: partner ?? (referred ? "RM referral" : "Direct"),
      rm: referred && staff ? rmLabel(staff) : null,
    };
  };
  const meta = (row: ClientRow) => {
    const s = source(row);
    return [
      row.investor.reference ?? row.investor.client_code,
      row.investor.investor_type === "institutional" ? "Entity" : "Individual",
      s.text,
      s.rm,
    ]
      .filter(Boolean)
      .join(" · ");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
        <p className="mt-1 text-muted-foreground">
          Your onboarded clients, their funds and their documents.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search clients"
            placeholder="Search client name, reference or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div role="group" aria-label="Group by" className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Group by</span>
            <div className="flex items-center rounded-lg border bg-background p-0.5 text-sm">
              {GROUPS.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  aria-pressed={group === g.key}
                  onClick={() => setParam("group", g.key, "name")}
                  className={`rounded-md px-3 py-1 ${group === g.key ? "bg-secondary font-medium" : "text-muted-foreground"}`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
          <div role="group" aria-label="Client type" className="flex gap-2">
            {KINDS.map((k) => (
              <Button
                key={k.key}
                size="sm"
                variant={kind === k.key ? "secondary" : "outline"}
                aria-pressed={kind === k.key}
                onClick={() => setParam("type", k.key, "all")}
              >
                {k.label} {count(k.key)}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Committed: live subscriptions · Funded: cash received after fees · Allocated: capital
        allocated by LUCA
      </p>

      {book.isError ? (
        <p className="py-6 text-sm text-destructive">
          Unable to load client documents. Please refresh to try again.
        </p>
      ) : loadingInvestors || book.isLoading || !workflow ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading clients...</p>
      ) : visible.length === 0 ? (
        <p className="rounded-lg border py-12 text-center text-sm text-muted-foreground">
          No clients match.
        </p>
      ) : group === "name" ? (
        <ByName rows={visible} workflow={workflow} actions={book.actions} meta={meta} />
      ) : (
        <ByProject rows={visible} workflow={workflow} actions={book.actions} meta={meta} />
      )}
    </div>
  );
}

type ViewProps = {
  rows: ClientRow[];
  workflow: WorkflowView;
  actions: ReturnType<typeof useClientBook>["actions"];
  meta: (row: ClientRow) => string;
};

/** Clients under A, B, C… headings. */
function ByName({ rows, workflow, actions, meta }: ViewProps) {
  const sorted = [...rows].sort((a, b) => a.investor.full_name.localeCompare(b.investor.full_name));
  const letters = [...new Set(sorted.map((r) => r.investor.full_name[0]?.toUpperCase() ?? "#"))];
  return (
    <div className="space-y-6">
      {letters.map((letter) => (
        <section key={letter} className="space-y-3">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {letter}
          </h2>
          {sorted
            .filter((r) => (r.investor.full_name[0]?.toUpperCase() ?? "#") === letter)
            .map((row) => (
              <details
                key={row.investor.id}
                className="group/client overflow-hidden rounded-lg border bg-background"
              >
                <summary
                  className={`${SUMMARY} flex-wrap px-4 py-4 hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-primary sm:px-5`}
                >
                  <ChevronRightIcon className={`${CHEVRON} group-open/client:rotate-90`} />
                  <span className="min-w-0 flex-1 basis-48">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold">{row.investor.full_name}</span>
                      <Attention count={needsReview(row)} />
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {meta(row)} · {plural(row.funds.length, "fund")}
                    </span>
                  </span>
                  <span className="w-full sm:w-auto">
                    <Figures capital={row.capital} />
                  </span>
                </summary>
                <ClientBody row={row} workflow={workflow} actions={actions} />
              </details>
            ))}
        </section>
      ))}
    </div>
  );
}

type FundGroup = {
  id: number;
  name: string;
  clients: { row: ClientRow; fund: ClientFund }[];
};

/** Project, then each fund in it, then who is in that fund. */
function ByProject({ rows, workflow, actions, meta }: ViewProps) {
  const projects = useMemo(() => {
    const byProject = new Map<string, Map<number, FundGroup>>();
    for (const row of rows)
      for (const fund of row.funds) {
        const project = fund.project || fund.name;
        const funds = byProject.get(project) ?? new Map<number, FundGroup>();
        const group = funds.get(fund.id) ?? { id: fund.id, name: fund.name, clients: [] };
        group.clients.push({ row, fund });
        funds.set(fund.id, group);
        byProject.set(project, funds);
      }
    return [...byProject.entries()]
      .map(([name, funds]) => {
        const list = [...funds.values()].map((f) => ({
          ...f,
          capital: sum(f.clients.map((c) => c.fund.capital)),
          clients: f.clients.sort((a, b) =>
            a.row.investor.full_name.localeCompare(b.row.investor.full_name),
          ),
        }));
        return {
          name,
          funds: list.sort((a, b) => a.name.localeCompare(b.name)),
          capital: sum(list.map((f) => f.capital)),
        };
      })
      .sort((a, b) => b.capital.committed - a.capital.committed || a.name.localeCompare(b.name));
  }, [rows]);
  const withoutFunds = rows.filter((r) => r.funds.length === 0);

  return (
    <div className="space-y-3">
      {projects.map((project) => (
        <details
          key={project.name}
          className="group/project overflow-hidden rounded-lg border bg-background"
        >
          <summary
            className={`${SUMMARY} flex-wrap px-4 py-4 hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-primary sm:px-5`}
          >
            <ChevronRightIcon className={`${CHEVRON} group-open/project:rotate-90`} />
            <FolderIcon className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 basis-48">
              <span className="block text-base font-semibold">{project.name}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {plural(project.funds.length, "fund")}
              </span>
            </span>
            <span className="w-full sm:w-auto">
              <Figures capital={project.capital} />
            </span>
          </summary>
          <div className="space-y-3 border-t px-4 py-4 sm:px-5">
            {project.funds.map((fund) => (
              <details key={fund.id} className="group/fund rounded-md border">
                <summary className={`${SUMMARY} flex-wrap bg-muted/30 px-4 py-3 hover:bg-muted/50`}>
                  <ChevronRightIcon className={`${CHEVRON} group-open/fund:rotate-90`} />
                  <span className="min-w-0 flex-1 basis-40">
                    <span className="block text-sm font-medium">{fund.name}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {plural(fund.clients.length, "client")}
                    </span>
                  </span>
                  <span className="w-full sm:w-auto">
                    <Figures capital={fund.capital} />
                  </span>
                </summary>
                <div className="space-y-2 border-t p-3">
                  {fund.clients.map(({ row, fund: own }) => (
                    <details
                      key={row.investor.id}
                      className="group/client overflow-hidden rounded-md border bg-background"
                    >
                      <summary className={`${SUMMARY} flex-wrap px-4 py-3 hover:bg-muted/30`}>
                        <ChevronRightIcon className={`${CHEVRON} group-open/client:rotate-90`} />
                        <span className="min-w-0 flex-1 basis-40">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold">{row.investor.full_name}</span>
                            <Attention
                              count={
                                [...own.docs].filter((d) =>
                                  ["received", "reviewing"].includes(d.review_state),
                                ).length
                              }
                            />
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {meta(row)}
                          </span>
                        </span>
                        <span className="w-full sm:w-auto">
                          <Figures capital={own.capital} />
                        </span>
                      </summary>
                      <ClientBody
                        row={row}
                        workflow={workflow}
                        actions={actions}
                        onlyFundId={own.id}
                      />
                    </details>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </details>
      ))}
      {withoutFunds.length > 0 && (
        <p className="pt-2 text-xs text-muted-foreground">
          Not yet in any fund: {withoutFunds.map((r) => r.investor.full_name).join(", ")}. Switch to
          Name A–Z to open them.
        </p>
      )}
    </div>
  );
}
