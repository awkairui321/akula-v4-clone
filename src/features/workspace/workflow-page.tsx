import FundingShortfall from "@/components/funding-shortfall";
import InvestorSegmentControl from "@/components/investor-segment-control";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { api, apiAsDemo } from "@/lib/api";
import type { WorkflowView, WorkflowCommand, Version } from "@/lib/workflow-types";
import { SECTOR_LABELS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import DemoResetButton from "@/components/demo-reset-button";
import { Input } from "@/components/ui/input";
import {
  PanelLeft,
  Circle,
  LayoutDashboard,
  TrendingUp,
  FileTextIcon,
  UsersIcon,
  ChartNoAxesColumnIncreasing,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import "./workflow.css";

const money = (v: number | string, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(v));
const RM_TAB_ICONS: Record<string, typeof Circle> = {
  Overview: LayoutDashboard,
  Opportunities: TrendingUp,
  Documents: FileTextIcon,
  Relationships: UsersIcon,
  "Client reports": ChartNoAxesColumnIncreasing,
  Reports: ChartNoAxesColumnIncreasing,
  Investments: TrendingUp,
  Publication: FileTextIcon,
  Demand: UsersIcon,
  Reporting: ChartNoAxesColumnIncreasing,
};
const date = (v: string) =>
  new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const DemoPersonaContext = createContext<number | undefined>(undefined);
function personaApi<T>(
  personaId: number | undefined,
  path: string,
  options?: { method?: string; body?: Record<string, unknown> },
) {
  return personaId === undefined ? api<T>(path, options) : apiAsDemo<T>(personaId, path, options);
}
function useWorkspace() {
  const { user } = useAuth();
  const demoPersonaId = useContext(DemoPersonaContext);
  return useQuery({
    queryKey: ["workflows", demoPersonaId ?? user?.id],
    queryFn: () => personaApi<WorkflowView>(demoPersonaId, "/api/v1/workflows"),
    staleTime: 0,
    refetchInterval: demoPersonaId === undefined ? false : 1200,
  });
}
function InvestorSubscriptionActions({
  subscriptionId,
  status,
}: {
  subscriptionId: number;
  status: string;
}) {
  const persona = useContext(DemoPersonaContext);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["comparisonTerms", persona, subscriptionId],
    queryFn: () =>
      personaApi<{
        acknowledgements: {
          terms: { id: number; key: string; body: string; accepted: boolean }[];
          complete: boolean;
        };
      }>(persona, `/api/v1/subscriptions/${subscriptionId}/acknowledgements`),
    enabled: ["reserved", "documents_pending"].includes(status),
  });
  const action = useMutation({
    mutationFn: async (operation: string) => {
      if (operation.startsWith("accept:"))
        return personaApi(persona, `/api/v1/subscriptions/${subscriptionId}/acknowledgements`, {
          method: "POST",
          body: { acknowledgement: { acknowledgement_term_id: Number(operation.split(":")[1]) } },
        });
      if (operation === "sign") {
        await personaApi(persona, "/api/v1/signwell/sign_subscription", {
          method: "POST",
          body: { subscription_id: subscriptionId },
        });
        await personaApi(persona, "/api/v1/signwell/check_subscription", {
          method: "POST",
          body: { subscription_id: subscriptionId },
        });
        return personaApi(persona, "/api/v1/signwell/check_subscription", {
          method: "POST",
          body: { subscription_id: subscriptionId },
        });
      }
      if (operation === "fund")
        return personaApi(persona, `/api/v1/subscriptions/${subscriptionId}/proceed_to_funding`, {
          method: "POST",
        });
      return personaApi(persona, `/api/v1/subscriptions/${subscriptionId}`, {
        method: "PATCH",
        body: { payment_declared: true },
      });
    },
    onSuccess: () => qc.invalidateQueries(),
  });
  return (
    <div className="space-y-3">
      {data?.acknowledgements.terms.map((term) => (
        <details key={term.id}>
          <summary>
            {term.key.replaceAll("_", " ")} {term.accepted ? "— accepted" : ""}
          </summary>
          <p>{term.body}</p>
          {!term.accepted && (
            <Button disabled={action.isPending} onClick={() => action.mutate(`accept:${term.id}`)}>
              Accept acknowledgement
            </Button>
          )}
        </details>
      ))}
      {["reserved", "documents_pending"].includes(status) && (
        <Button
          disabled={!data?.acknowledgements.complete || action.isPending}
          onClick={() => action.mutate("sign")}
        >
          Complete simulated signing
        </Button>
      )}
      {status === "approved" && (
        <Button disabled={action.isPending} onClick={() => action.mutate("fund")}>
          Continue to funding
        </Button>
      )}
      {["awaiting_funds", "payment_unmatched"].includes(status) && (
        <Button disabled={action.isPending} onClick={() => action.mutate("declare")}>
          Declare transfer sent
        </Button>
      )}
      {action.isError && <p role="alert">{action.error.message}</p>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="wf-panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Action({
  label,
  command,
  children,
  disabled = false,
}: {
  label: string;
  command: WorkflowCommand;
  children?: ReactNode;
  disabled?: boolean;
}) {
  const qc = useQueryClient();
  const demoPersonaId = useContext(DemoPersonaContext);
  const mutation = useMutation({
    mutationFn: (body: WorkflowCommand) =>
      personaApi<WorkflowView>(demoPersonaId, "/api/v1/workflows", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries(),
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    const body = { ...command, ...fields } as WorkflowCommand;
    for (const key of ["id", "target", "amount", "price", "holdingId"] as const) {
      if (key in fields) {
        if (fields[key] === "") delete body[key];
        else body[key] = Number(fields[key]);
      }
    }
    if (typeof fields.exposure === "string") {
      const [kind, rawId] = fields.exposure.split(":");
      if (kind === "sub") body.id = Number(rawId);
      if (kind === "holding") body.holdingId = Number(rawId);
      delete body.exposure;
    }
    mutation.mutate(body, { onSuccess: () => form.reset() });
  }
  return (
    <form className="wf-action" onSubmit={submit}>
      {children}
      <Button disabled={mutation.isPending || disabled} type="submit">
        {mutation.isPending ? "Saving…" : label}
      </Button>
      {mutation.error && (
        <p role="alert" className="wf-error">
          {mutation.error.message}
        </p>
      )}
      {mutation.isSuccess && (
        <p role="status" className="wf-success">
          Recorded in the shared demo.
        </p>
      )}
    </form>
  );
}
function DemandAnalytics({ d, ops, manager }: { d: WorkflowView; ops: boolean; manager: boolean }) {
  const companies = Array.from(new Set(d.requests.map((request) => request.key)))
    .map((key) => {
      const rows = d.requests.filter((request) => request.key === key);
      const totals = rows.reduce<Record<string, number>>((result, row) => {
        if (row.amount !== undefined)
          result[row.currency] = (result[row.currency] || 0) + row.amount;
        return result;
      }, {});
      return {
        key,
        rows,
        total: rows.length,
        investors: new Set(rows.map((row) => row.investorId)).size,
        totals,
      };
    })
    .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
  const uniqueInvestors = new Set(d.requests.map((request) => request.investorId)).size;
  const usdIndications = d.requests.filter(
    (request) => request.amount !== undefined && request.currency === "USD",
  );
  const usdTotal = usdIndications.reduce((sum, request) => sum + (request.amount || 0), 0);
  return (
    <>
      {ops && (
        <div className="wf-demand-handoff">
          <strong>Ops → LUCA supply pipeline</strong>
          <span>
            Share a company signal when investor interest may justify sourcing an offering. LUCA
            then records the sourcing decision here.
          </span>
        </div>
      )}
      <div className="wf-demand-stats">
        <div>
          <span>Companies requested</span>
          <strong>{companies.length}</strong>
        </div>
        <div>
          <span>Total indications</span>
          <strong>{d.requests.length}</strong>
        </div>
        <div>
          <span>Distinct investors</span>
          <strong>{uniqueInvestors}</strong>
        </div>
        <div>
          <span>Indicative USD interest</span>
          <strong>{money(usdTotal)}</strong>
          <small>{usdIndications.length} stated amounts</small>
        </div>
      </div>
      <div className="wf-demand-company-list">
        {companies.map(({ key, rows, total, investors, totals }) => {
          const request = rows[0];
          const statuses = Array.from(new Set(rows.map((row) => row.status)));
          const amountSummary = Object.entries(totals)
            .map(([currency, amount]) => money(amount, currency))
            .join(" · ");
          return (
            <details className="wf-demand-company" key={key}>
              <summary>
                <span className="wf-demand-company-name">
                  <strong>{request.company}</strong>
                  <small>
                    {total} indications · {investors} investors
                  </small>
                </span>
                <span className="wf-demand-company-total">
                  <strong>{amountSummary || "Amount not stated"}</strong>
                  <small>{statuses.join(" · ")}</small>
                </span>
              </summary>
              <div className="wf-demand-company-body">
                {ops && statuses.length === 1 && statuses[0] !== "Shared with LUCA" && (
                  <div className="wf-demand-share">
                    <span>Ready for LUCA to assess sourcing capacity?</span>
                    <Action
                      label="Share sourcing brief with LUCA"
                      command={{
                        type: "request-status",
                        id: request.id,
                        status: "Shared with LUCA",
                      }}
                    />
                  </div>
                )}
                {manager && (
                  <p className="wf-demand-luca-note">
                    {statuses.includes("Shared with LUCA")
                      ? "Ops has shared this signal. Record whether LUCA will review, source, or pass."
                      : "No Ops sourcing brief has been shared for this company yet."}
                  </p>
                )}
                <div className="wf-demand-indications">
                  {rows.map((row) => {
                    const client = d.clients.find((item) => item.id === row.investorId);
                    return (
                      <div className="wf-demand-indication" key={row.id}>
                        <span>
                          {client?.name || `Investor #${row.investorId}`}{" "}
                          <small>{client?.code}</small>
                        </span>
                        <strong>
                          {row.amount === undefined
                            ? "Amount not stated"
                            : money(row.amount, row.currency)}
                        </strong>
                        <small>{row.status}</small>
                      </div>
                    );
                  })}
                </div>
                {manager && (
                  <Action
                    label="Record LUCA sourcing decision"
                    command={{ type: "request-status", id: request.id }}
                  >
                    <Choice
                      name="status"
                      label="Decision for all indications"
                      items={[
                        "Under review",
                        "Not currently available",
                        "Opportunity available",
                      ].map((name) => ({ id: name, name }))}
                    />
                    <Choice
                      name="target"
                      label="Published offering (when available)"
                      items={[
                        { id: "", name: "Select an offering" },
                        ...d.funds.filter((fund) => fund.state === "open"),
                      ]}
                    />
                  </Action>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </>
  );
}
function Field({
  label,
  name,
  type = "text",
  required = true,
  value,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  value?: string | number;
}) {
  return (
    <label className="wf-field">
      <span>{label}</span>
      <Input
        name={name}
        type={type}
        required={required}
        defaultValue={value}
        step={type === "number" ? "0.01" : undefined}
        min={type === "number" ? 0 : undefined}
      />
    </label>
  );
}
function Choice({
  label,
  name,
  items,
  required = true,
}: {
  label: string;
  name: string;
  items: { id: number | string; name: string }[];
  required?: boolean;
}) {
  return (
    <label className="wf-field">
      <span>{label}</span>
      <select name={name} required={required}>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
    </label>
  );
}
function download(name: string, data: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const esc = (s: unknown) =>
  String(s ?? "Undisclosed").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
function documentHtml(v: Version) {
  const f = v.snapshot;
  return `<html><head><meta charset="utf-8"></head><body><h1>${esc(f.codename)} · Investment term sheet</h1><p>SIMULATION · Version ${v.number} · ${esc(v.at)}</p><h2>Overview</h2><p>${esc(f.asset.name)} · ${esc(f.asset.about || f.asset.description)}</p><h2>Structure & terms</h2><p>${esc(f.name)} / ${esc(f.share_class.name)} · ${esc(f.security_type)}</p><p>Minimum USD ${esc(f.min_subscription)}; increment ${esc(f.subscription_increment)}; subscription fee ${esc(f.subscription_fee_pct)}%; management fee ${esc(f.management_fee_pct)}%; carry ${esc(f.carried_interest_pct)}%.</p><h2>Timeline</h2><p>Close: ${esc(f.closes_at || "Undisclosed")}. ${esc(f.holding_period_note || "Duration undisclosed")}</p><h2>Parties</h2><p>${esc(f.fund_manager.name)}: fund manager. Akula: technology and operational infrastructure. Administrator and custody: undisclosed in this demo.</p><h2>Risks</h2>${f.asset.risks.map((r) => `<h3>${esc(r.title)}</h3><p>${esc(r.body)}</p>`).join("")}<p>Illustrative only. No real signatures, payment or liquidity. Company share prices are not class unit prices.</p></body></html>`;
}

function Analytics({ data: d }: { data: WorkflowView }) {
  const [fund, setFund] = useState("all");
  const subs = d.subscriptions.filter((s) => fund === "all" || s.fund_id === Number(fund)),
    ids = new Set(subs.map((s) => s.id));
  const allocations = d.allocations.filter((a) => ids.has(a.subscriptionId) && !a.voided),
    receipts = d.receipts.filter((r) => ids.has(r.subscriptionId) && !r.supersededBy),
    returns = d.returns.filter((r) => ids.has(r.subscriptionId));
  const currencies = [...new Set(subs.map((s) => s.currency))];
  const currencyFor = (id: number) => subs.find((s) => s.id === id)?.currency;
  return (
    <Panel title="Operational analytics">
      <label className="wf-field">
        Offering cohort
        <select value={fund} onChange={(e) => setFund(e.target.value)}>
          <option value="all">All offerings in my scope</option>
          {d.funds.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <p>
        Cumulative records in this browser, including seeded history. Counts describe workflow
        stages, not measured conversion or investment performance. Cash totals include fees;
        allocated capital excludes fees.
      </p>
      <div className="wf-stats">
        {[
          [
            "Awaiting signature",
            subs.filter((s) => ["reserved", "documents_pending"].includes(s.status)).length,
          ],
          [
            "Manager / institution review",
            subs.filter((s) =>
              ["under_luca_review", "institution_review", "information_requested"].includes(
                s.status,
              ),
            ).length,
          ],
          [
            "Issuance pending",
            subs.filter(
              (s) =>
                allocations.some((a) => a.subscriptionId === s.id && a.principal > 0) &&
                !s.holdingId,
            ).length,
          ],
          ["Issued holdings", subs.filter((s) => s.holdingId).length],
        ].map(([label, count]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{count}</strong>
          </div>
        ))}
      </div>
      {currencies.map((currency) => (
        <div className="wf-record" key={currency}>
          <h3>{currency} · reconciliation totals</h3>
          <p>
            Matched cash{" "}
            {money(
              receipts
                .filter((r) => r.matched && r.currency === currency)
                .reduce((n, r) => n + r.amount, 0),
              currency,
            )}{" "}
            · Allocated capital{" "}
            {money(
              allocations
                .filter((a) => currencyFor(a.subscriptionId) === currency)
                .reduce((n, a) => n + a.principal, 0),
              currency,
            )}{" "}
            · Actual allocated fees{" "}
            {money(
              allocations
                .filter((a) => currencyFor(a.subscriptionId) === currency)
                .reduce((n, a) => n + a.fee, 0),
              currency,
            )}
          </p>
          <p>
            Confirmed returns{" "}
            {money(
              returns
                .filter(
                  (r) => r.status === "confirmed" && currencyFor(r.subscriptionId) === currency,
                )
                .reduce((n, r) => n + r.amount, 0),
              currency,
            )}{" "}
            · Outstanding returns{" "}
            {money(
              returns
                .filter(
                  (r) => r.status !== "confirmed" && currencyFor(r.subscriptionId) === currency,
                )
                .reduce((n, r) => n + r.amount, 0),
              currency,
            )}
          </p>
        </div>
      ))}
    </Panel>
  );
}

const RM_STAGE_GUIDANCE: Record<string, { next: string; rm: string }> = {
  reserved: { next: "Client completes application", rm: "Check in with the client if needed." },
  documents_pending: { next: "Client signs documents", rm: "Remind the client if helpful." },
  institution_review: {
    next: "Institution reviews the file",
    rm: "No action while review is in progress.",
  },
  under_luca_review: {
    next: "LUCA reviews the file",
    rm: "Wait for LUCA's decision or information request.",
  },
  information_requested: {
    next: "Client or adviser provides information",
    rm: "Help the client respond to the request.",
  },
  approved: {
    next: "Client follows funding instructions",
    rm: "Remind the client about the next step if needed.",
  },
  awaiting_funds: {
    next: "Client arranges the transfer",
    rm: "Check in if the transfer is overdue.",
  },
  payment_unmatched: {
    next: "Akula Ops matches the transfer",
    rm: "No processing action for the RM.",
  },
  reconciliation: { next: "Akula Ops reconciles funds", rm: "No processing action for the RM." },
  allocation_pending: {
    next: "LUCA records the allocation",
    rm: "No allocation action for the RM.",
  },
  allocated: { next: "Investment recorded", rm: "Share an update with the client when useful." },
  not_allocated: {
    next: "Allocation not completed",
    rm: "Contact the client if a follow-up is needed.",
  },
  funds_returned: { next: "Funds returned", rm: "The subscription is complete." },
  rejected: {
    next: "Application declined by LUCA",
    rm: "Contact the client if a follow-up is needed.",
  },
  cancelled: { next: "Application cancelled", rm: "No further action is expected." },
};
const RM_STATUS_LABELS: Record<string, string> = {
  reserved: "Application started",
  documents_pending: "Awaiting client signature",
  institution_review: "Institution review",
  under_luca_review: "LUCA review",
  information_requested: "Information needed",
  approved: "Approved",
  awaiting_funds: "Awaiting client transfer",
  payment_unmatched: "Payment matching",
  reconciliation: "Funds reconciliation",
  allocation_pending: "Allocation in progress",
  allocated: "Allocation recorded",
  not_allocated: "Not allocated",
  funds_returned: "Funds returned",
  rejected: "Declined by LUCA",
  cancelled: "Cancelled",
};
const RM_ACTION_STATUSES = [
  "reserved",
  "documents_pending",
  "information_requested",
  "approved",
  "awaiting_funds",
  "not_allocated",
  "rejected",
];
const RM_REVIEW_STATUSES = ["institution_review", "under_luca_review"];

function RMOverview({
  data: d,
  onNavigate,
  onFollowUps,
  onReview,
  reviewSignal,
}: {
  data: WorkflowView;
  onNavigate: (tab: string) => void;
  onFollowUps: () => void;
  onReview: () => void;
  reviewSignal: number;
}) {
  const [progressFilter, setProgressFilter] = useState("action");
  const [progressSearch, setProgressSearch] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (reviewSignal > 0) {
      setProgressFilter("review");
      setPage(0);
    }
  }, [reviewSignal]);
  const clientActions = new Set(
    d.subscriptions
      .filter((subscription) => RM_ACTION_STATUSES.includes(subscription.status))
      .map((subscription) => subscription.investor_id),
  ).size;
  const awaitingDecision = d.subscriptions.filter((subscription) =>
    RM_REVIEW_STATUSES.includes(subscription.status),
  ).length;
  const filtered = d.subscriptions.filter((subscription) => {
    const bucket =
      progressFilter === "all" ||
      (progressFilter === "action" && RM_ACTION_STATUSES.includes(subscription.status)) ||
      (progressFilter === "review" && RM_REVIEW_STATUSES.includes(subscription.status)) ||
      (progressFilter === "other" &&
        !RM_ACTION_STATUSES.includes(subscription.status) &&
        !RM_REVIEW_STATUSES.includes(subscription.status));
    return (
      bucket &&
      `${subscription.investor_name} ${subscription.asset_name} ${subscription.id}`
        .toLowerCase()
        .includes(progressSearch.toLowerCase())
    );
  });
  const visible = filtered.slice(page * 8, (page + 1) * 8);

  return (
    <>
      <Panel title="Client follow-ups">
        <p>
          Use this workspace to support assigned individual investors. Client signatures and
          transfers belong to the client; LUCA and Akula Ops handle their own review and processing
          steps.
        </p>
        <div className="wf-stats wf-clickable-stats">
          <button onClick={onFollowUps}>
            <span>Client follow-ups</span>
            <strong>{clientActions}</strong>
            <small>Open task list →</small>
          </button>
          <button onClick={onReview}>
            <span>With LUCA or institution</span>
            <strong>{awaitingDecision}</strong>
            <small>View review stages →</small>
          </button>
        </div>
      </Panel>
      <Panel title="Immediate actions & investment progress">
        <p>
          Start with client follow-ups. Filter or search the wider pipeline when you need another
          record.
        </p>
        <div className="wf-progress-controls">
          <label className="wf-field">
            <span>Show</span>
            <select
              value={progressFilter}
              onChange={(event) => {
                setProgressFilter(event.target.value);
                setPage(0);
              }}
            >
              <option value="action">Client follow-ups ({clientActions})</option>
              <option value="review">With LUCA or institution ({awaitingDecision})</option>
              <option value="other">Other stages</option>
              <option value="all">All investment records</option>
            </select>
          </label>
          <label className="wf-field">
            <span>Find a client or company</span>
            <Input
              value={progressSearch}
              onChange={(event) => {
                setProgressSearch(event.target.value);
                setPage(0);
              }}
              placeholder="Search name, company or investment #"
            />
          </label>
        </div>
        {!d.subscriptions.length ? (
          <div className="wf-empty">
            <p>No investment applications are currently linked to your client book.</p>
            <Button variant="outline" onClick={() => onNavigate("Opportunities")}>
              Browse published opportunities
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="wf-empty">No records match these filters.</p>
        ) : (
          <div className="wf-table-wrap">
            <table className="wf-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Opportunity</th>
                  <th>Stage</th>
                  <th>Next step / owner</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((subscription) => {
                  const guidance = RM_STAGE_GUIDANCE[subscription.status] ?? {
                    next: subscription.status.replaceAll("_", " "),
                    rm: "Review with the client if needed.",
                  };
                  return (
                    <tr key={subscription.id}>
                      <td>
                        {subscription.investor_name}
                        <small>
                          {d.clients.find((client) => client.id === subscription.investor_id)?.code}
                        </small>
                      </td>
                      <td>
                        {subscription.asset_name}
                        <small>Investment #{subscription.id}</small>
                      </td>
                      <td>
                        {RM_STATUS_LABELS[subscription.status] ??
                          subscription.status.replaceAll("_", " ")}
                      </td>
                      <td>
                        {guidance.next}
                        <small>
                          {guidance.rm} · {money(subscription.amount, subscription.currency)}{" "}
                          requested
                        </small>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > 8 && (
          <div className="wf-pagination">
            <span>
              {page * 8 + 1}–{Math.min((page + 1) * 8, filtered.length)} of {filtered.length}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={(page + 1) * 8 >= filtered.length}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </Panel>
      <Panel title="RM shortcuts">
        <div className="wf-shortcuts">
          <button onClick={() => onNavigate("Opportunities")}>
            <strong>Browse opportunities →</strong>
            <span>Review the open LUCA shelf before advising clients.</span>
          </button>
          <button onClick={() => onNavigate("Relationships")}>
            <strong>Client follow-ups →</strong>
            <span>Search client actions and record private follow-up notes.</span>
          </button>
          <Link to="/rm/communications">
            <strong>Communicate with a client →</strong>
            <span>Send a message and attach documents.</span>
          </Link>
        </div>
      </Panel>
    </>
  );
}

function RMOpportunities({ data: d }: { data: WorkflowView }) {
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState("all");
  const openFunds = d.funds.filter((fund) => fund.state === "open");
  const filteredFunds = openFunds.filter(
    (fund) =>
      (sector === "all" || fund.sector === sector) &&
      `${fund.name} ${fund.company} ${fund.descriptor} ${fund.hook} ${SECTOR_LABELS[fund.sector] || fund.sector}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );

  return (
    <>
      <Panel title="Published opportunities">
        <p>Open a deal to view its published overview, terms and documents.</p>
        <label className="wf-field wf-search">
          <span>Search the opportunity shelf</span>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by company or strategy"
          />
        </label>
        <div className="wf-sector-filters">
          <Button
            size="sm"
            variant={sector === "all" ? "secondary" : "outline"}
            onClick={() => setSector("all")}
          >
            All sectors <small>{openFunds.length}</small>
          </Button>
          {Array.from(new Set(openFunds.map((fund) => fund.sector))).map((key) => (
            <Button
              key={key}
              size="sm"
              variant={sector === key ? "secondary" : "outline"}
              onClick={() => setSector(sector === key ? "all" : key)}
            >
              {SECTOR_LABELS[key] || key}
              <small>{openFunds.filter((fund) => fund.sector === key).length}</small>
            </Button>
          ))}
        </div>
        <p className="wf-result-count">
          Showing {filteredFunds.length} of {openFunds.length} open opportunities
        </p>
        {!filteredFunds.length ? (
          <p className="wf-empty">No open opportunities match this search.</p>
        ) : (
          <div className="wf-opportunity-grid">
            {filteredFunds.map((fund) => (
              <article className="wf-opportunity" key={fund.id}>
                <div className="wf-opportunity-art">
                  <span>{fund.company.slice(0, 1)}</span>
                  <small>{fund.descriptor}</small>
                </div>
                <div className="wf-opportunity-head">
                  <div>
                    <span className="wf-eyebrow">{fund.name}</span>
                    <h3>{fund.company}</h3>
                  </div>
                  <span className="wf-status">Open</span>
                </div>
                <p className="wf-opportunity-descriptor">{fund.descriptor}</p>
                <p>{fund.hook}</p>
                <Link
                  to={
                    d.actor.role === "rm"
                      ? `/rm/opportunities/${fund.id}`
                      : `/luca/deals/${fund.id}`
                  }
                  className="inline-flex rounded-md border px-3 py-2 text-sm"
                >
                  View deal →
                </Link>
                <div className="wf-opportunity-meta">
                  <span>Minimum</span>
                  <strong>{money(fund.minimum)}</strong>
                  <span>Closing date</span>
                  <strong>{fund.closesAt ? date(fund.closesAt) : "To be announced"}</strong>
                </div>
                {fund.risks.length > 0 && (
                  <details>
                    <summary>Key risk areas</summary>
                    <ul>
                      {fund.risks.map((risk) => (
                        <li key={risk}>{risk}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </article>
            ))}
          </div>
        )}
      </Panel>
      <Panel title="Recently closed or in preparation">
        <p>These offerings are not open for new client interest.</p>
        {!d.funds.some((fund) => fund.state !== "open") ? (
          <p>No other published offerings.</p>
        ) : (
          <div className="wf-closed-list">
            {d.funds
              .filter((fund) => fund.state !== "open")
              .map((fund) => (
                <div key={fund.id}>
                  <strong>{fund.company}</strong>
                  <span>
                    {fund.name} · {fund.state.replaceAll("_", " ")}
                  </span>
                </div>
              ))}
          </div>
        )}
      </Panel>
    </>
  );
}

function RMReports({ data: d }: { data: WorkflowView }) {
  const [search, setSearch] = useState("");
  const groups = [...new Set(d.holdings.map((holding) => holding.asset_name))]
    .sort((left, right) => left.localeCompare(right))
    .map((company) => ({
      company,
      rows: d.holdings.filter((holding) => holding.asset_name === company),
    }))
    .filter((group) =>
      `${group.company} ${group.rows.map((holding) => d.clients.find((client) => client.id === holding.investor_id)?.name ?? "").join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  return (
    <>
      <label className="wf-field wf-search">
        <span>Find company or client</span>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search holdings"
        />
      </label>
      {groups.length === 0 ? (
        <p className="wf-empty">No issued holdings match this search.</p>
      ) : (
        <div className="wf-company-groups">
          {groups.map(({ company, rows }) => (
            <details key={company}>
              <summary>
                <strong>{company}</strong>
                <span>
                  {rows.length} holding{rows.length === 1 ? "" : "s"} ·{" "}
                  {new Set(rows.map((row) => row.investor_id)).size} client
                  {new Set(rows.map((row) => row.investor_id)).size === 1 ? "" : "s"}
                </span>
              </summary>
              <div className="wf-table-wrap">
                <table className="wf-table">
                  <thead>
                    <tr>
                      <th>Holding</th>
                      <th>Client</th>
                      <th>Class units</th>
                      <th>Cost</th>
                      <th>Reported value</th>
                      <th>As of / source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((holding) => {
                      const valuation = d.valuations
                        .filter((item) => item.holdingId === holding.id)
                        .at(-1);
                      const at = valuation?.at || holding.nav_as_of;
                      const client = d.clients.find((item) => item.id === holding.investor_id);
                      return (
                        <tr key={holding.id}>
                          <td>#{holding.id}</td>
                          <td>
                            {client?.name ?? "Investor"}
                            <small>{client?.code}</small>
                          </td>
                          <td>{holding.units}</td>
                          <td>{money(holding.committed_amount)}</td>
                          <td>
                            {money(
                              valuation?.amount ?? holding.current_nav,
                              valuation?.currency ?? "USD",
                            )}
                          </td>
                          <td>
                            {at ? date(at) : "Date unavailable"}
                            <small>{valuation?.source || "Legacy mock administrator report"}</small>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      )}
    </>
  );
}

const archivedInvestment = (s: WorkflowView["subscriptions"][number]) =>
  !!s.holdingId || ["not_allocated", "funds_returned", "cancelled", "rejected"].includes(s.status);

function OpsInvestmentQueue({
  data,
  selectedId,
  onSelect,
  onArchiveChange,
}: {
  data: WorkflowView;
  selectedId: string;
  onSelect: (id: string) => void;
  onArchiveChange: (archived: boolean) => void;
}) {
  const [archive, setArchive] = useState(false);
  const [vehicle, setVehicle] = useState("all");
  const [channel, setChannel] = useState("all");
  const [query, setQuery] = useState("");
  const channels = Array.from(
    new Set(data.clients.map((c) => c.eamFirm || "Direct / LUCA")),
  ).sort();
  const rows = data.subscriptions.filter((s) => {
    const client = data.clients.find((c) => c.id === s.investor_id);
    return (
      archivedInvestment(s) === archive &&
      (vehicle === "all" || String(s.fund_id) === vehicle) &&
      (channel === "all" || (client?.eamFirm || "Direct / LUCA") === channel) &&
      `${s.investor_name} ${client?.code || ""} ${s.asset_name} ${s.id}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
    );
  });
  return (
    <Panel title="Investment processing">
      <p>
        Choose a vehicle, distribution channel, then final investor. Open work stays in the task
        list; issued and closed records remain searchable in the archive.
      </p>
      <div className="wf-queue-tabs">
        <Button
          variant={!archive ? "default" : "outline"}
          onClick={() => {
            setArchive(false);
            onArchiveChange(false);
          }}
        >
          Task list · {data.subscriptions.filter((s) => !archivedInvestment(s)).length}
        </Button>
        <Button
          variant={archive ? "default" : "outline"}
          onClick={() => {
            setArchive(true);
            onArchiveChange(true);
          }}
        >
          Completed archive · {data.subscriptions.filter(archivedInvestment).length}
        </Button>
      </div>
      <div className="wf-queue-filters">
        <label className="wf-field">
          Investment vehicle
          <select value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
            <option value="all">All vehicles</option>
            {data.funds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} · {f.company}
              </option>
            ))}
          </select>
        </label>
        <label className="wf-field">
          Channel / client group
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="all">All channels</option>
            {channels.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="wf-field">
          Final investor
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, client tag or record #"
          />
        </label>
      </div>
      <p className="wf-result-count">
        {rows.length} matching {archive ? "archived records" : "tasks"}
      </p>
      <div className="wf-queue-list">
        {rows.map((s) => {
          const client = data.clients.find((c) => c.id === s.investor_id);
          const active = selectedId === String(s.id);
          return (
            <button
              className={`wf-queue-row ${active ? "wf-queue-row-active" : ""}`}
              key={s.id}
              onClick={() => onSelect(String(s.id))}
            >
              <span>
                <strong>{s.asset_name}</strong>
                <small>
                  #{s.id} · {client?.eamFirm || "Direct / LUCA"}
                </small>
              </span>
              <span>
                <strong>{s.investor_name}</strong>
                <small>{client?.code}</small>
              </span>
              <span>
                <strong>{money(s.amount, s.currency)}</strong>
                <small>
                  {s.holdingId ? `Holding #${s.holdingId}` : s.status.replaceAll("_", " ")}
                </small>
              </span>
            </button>
          );
        })}
        {!rows.length && (
          <p className="wf-empty">
            No records match. Change the vehicle, channel or investor search.
          </p>
        )}
      </div>
    </Panel>
  );
}

function WorkflowPageContent({
  surface,
  compact = false,
  onSurfaceChange,
}: {
  surface?: string;
  compact?: boolean;
  onSurfaceChange?: (surface: string) => void;
}) {
  const q = useWorkspace(),
    { logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSurface = onSurfaceChange ? surface : searchParams.get("surface") || surface;
  const routeSurface =
    requestedSurface === "Support" ||
    (q.data?.actor.role === "rm" && ["Documents", "Reports"].includes(requestedSurface ?? "")) ||
    (q.data?.actor.role === "luca" && requestedSurface === "Relationships")
      ? "Overview"
      : requestedSurface;
  const [tab, setTab] = useState(routeSurface || "Overview");
  const [sid, setSid] = useState("");
  const [preview, setPreview] = useState<number | null>(null);
  const [documentSearch, setDocumentSearch] = useState("");
  const [documentHistory, setDocumentHistory] = useState(false);
  const [opsArchive, setOpsArchive] = useState(false);
  const [relationshipSearch, setRelationshipSearch] = useState("");
  const [relationshipView, setRelationshipView] = useState("tasks");
  const [reviewSignal, setReviewSignal] = useState(0);
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 768);
  const demoPersonaId = useContext(DemoPersonaContext);
  const chooseTab = (value: string) => {
    setTab(value);
    if (onSurfaceChange) onSurfaceChange(value);
    else
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous);
        next.set("surface", value);
        return next;
      });
  };
  useEffect(() => {
    setTab(routeSurface || "Overview");
  }, [routeSurface]);
  useEffect(() => {
    const screen = window.matchMedia("(max-width: 767px)");
    const collapse = () => {
      if (screen.matches) setCollapsed(true);
    };
    screen.addEventListener("change", collapse);
    return () => screen.removeEventListener("change", collapse);
  }, []);
  const d = q.data;
  if (!d)
    return (
      <main className="wf-loading">
        <h1>Connected workflows</h1>
        <p role={q.error ? "alert" : undefined}>{q.error?.message || "Loading records…"}</p>
        <Link to="/login">Sign in</Link>
      </main>
    );
  const manager = d.actor.role === "luca",
    ops = d.actor.role === "ops",
    team = d.actor.role === "investment_team",
    rm = d.actor.role === "rm" || manager,
    staff = manager || ops || rm,
    privileged = manager || ops || team;
  const sub =
    d.subscriptions.find(
      (s) => String(s.id) === sid && (!ops || archivedInvestment(s) === opsArchive),
    ) || d.subscriptions.find((s) => !ops || archivedInvestment(s) === opsArchive);
  const receipts = d.receipts.filter((r) => r.subscriptionId === sub?.id);
  const allocation = d.allocations.find((a) => a.subscriptionId === sub?.id && !a.voided);
  const returns = d.returns.filter((r) => r.subscriptionId === sub?.id);
  const visibleVersions = d.versions
    .filter((version) => {
      if (
        !documentHistory &&
        d.versions.some((other) => other.fundId === version.fundId && other.number > version.number)
      )
        return false;
      const query = documentSearch.trim().toLowerCase();
      const title =
        `${version.snapshot.codename} ${version.snapshot.name} ${version.status} ${version.number}`.toLowerCase();
      return !query || title.includes(query);
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const visibleClients = d.clients
    .filter(
      (client) =>
        client.name !== "Newly Registered" &&
        (relationshipView !== "tasks" ||
          d.subscriptions.some(
            (subscription) =>
              subscription.investor_id === client.id &&
              RM_ACTION_STATUSES.includes(subscription.status),
          ) ||
          d.notes.some((note) => note.investorId === client.id && !note.done)),
    )
    .filter((client) =>
      `${client.name} ${client.code} ${client.type}`
        .toLowerCase()
        .includes(relationshipSearch.trim().toLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const tabs = team
    ? ["Publication", "Documents"]
    : manager
      ? [
          "Overview",
          "Investments",
          "Opportunities",
          "Documents",
          "Publication",
          "Demand",
          "Partners",
          "Reports",
          "Reporting",
        ]
      : rm
        ? ["Overview", "Opportunities", "Relationships", "Partners"]
        : ops
          ? ["Overview", "Investments", "Documents", "Publication", "Demand", "Reporting"]
          : [
              "Overview",
              "Investments",
              "Documents",
              ...(privileged ? ["Publication", "Demand"] : []),
              ...(manager ? ["Relationships"] : []),
              "Reporting",
              ...(!staff ? ["Company requests"] : []),
            ];
  const home = manager ? "/luca" : d.actor.role === "eam" ? "/eam" : "/portfolio";
  return (
    <div className={`${compact ? "wf-embed" : "wf-shell"} ${rm || ops ? "rm-shell" : ""}`}>
      {d.actor.role === "investor" && <InvestorSegmentControl personaId={demoPersonaId} />}
      {!compact && (
        <>
          <aside
            className={`wf-sidebar ${rm || ops ? `rm-sidebar ${collapsed ? "rm-sidebar-collapsed" : ""}` : ""}`}
          >
            {rm || ops ? (
              <>
                <Link
                  to={ops ? "/ops" : "/workflows"}
                  className={`rm-brand ${collapsed ? "justify-center" : ""}`}
                >
                  <Circle className="size-5 shrink-0" />
                  {!collapsed && (
                    <span>{ops ? "AKULA · OPERATIONS" : "LUCA · RELATIONSHIP MANAGER"}</span>
                  )}
                </Link>
                <nav aria-label={`${ops ? "Akula Ops" : "RM"} workspace navigation`}>
                  {tabs.map((t) => {
                    const TabIcon = RM_TAB_ICONS[t] ?? Circle;
                    return (
                      <Button
                        key={t}
                        variant={tab === t ? "secondary" : "ghost"}
                        size="lg"
                        title={collapsed ? t : undefined}
                        aria-label={t}
                        aria-current={tab === t ? "page" : undefined}
                        className={`rm-nav-item w-full ${collapsed ? "justify-center px-0" : "justify-start px-4"}`}
                        onClick={() => chooseTab(t)}
                      >
                        <TabIcon className="size-4 shrink-0" />
                        {!collapsed && t}
                      </Button>
                    );
                  })}
                </nav>
                <div className="rm-sidebar-foot">
                  {collapsed
                    ? ops
                      ? "OPS"
                      : "RM"
                    : `${ops ? "Akula Ops" : "LUCA Beta"} · Simulated workspace`}
                </div>
              </>
            ) : (
              <>
                <Link to={staff && !manager ? "/workflows" : home} className="wf-brand">
                  akula<span> / LUCA Beta</span>
                </Link>
                <p>
                  {manager
                    ? "LUCA fund manager"
                    : ops
                      ? "Akula Operations"
                      : "Investor & institution services"}
                </p>
                <nav aria-label="Workflow navigation">
                  {tabs.map((t) => (
                    <button
                      key={t}
                      onClick={() => chooseTab(t)}
                      aria-current={tab === t ? "page" : undefined}
                    >
                      {t}
                    </button>
                  ))}
                </nav>
                {(!staff || manager) && <Link to={home}>← Existing portal</Link>}
                <button onClick={logout}>Sign out</button>
              </>
            )}
          </aside>
        </>
      )}
      <main className={`wf-main ${rm || ops ? "rm-main" : ""}`}>
        {!compact && (
          <>
            {rm || ops ? (
              <header className="rm-header">
                <div className="rm-header-title">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setCollapsed((value) => !value)}
                    aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                  >
                    <PanelLeft />
                  </Button>
                  <span>{tab}</span>
                </div>
                <div className="rm-header-tools">
                  <Button variant="outline" size="sm" onClick={() => navigate("/live-demo")}>
                    Compare roles live
                  </Button>
                  <DemoResetButton compact />
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" className="border-border">
                          {d.actor.email[0]?.toUpperCase() ?? "R"}
                        </Button>
                      }
                    />
                    <DropdownMenuContent>
                      <DropdownMenuGroup>
                        <DropdownMenuItem onClick={logout}>Sign out</DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </header>
            ) : (
              <header>
                <div>
                  <p className="wf-eyebrow">CONNECTED RECORDS</p>
                  <h1>{tab}</h1>
                </div>
                <div className="wf-header-tools">
                  <Link to="/live-demo">View roles live →</Link>
                  <DemoResetButton compact />
                  <span>{d.actor.email}</span>
                </div>
              </header>
            )}
            <div className={`wf-banner ${rm || ops ? "rm-banner" : ""}`}>
              SIMULATION · Fictional processing · Browser-local records · No real money or
              signatures
            </div>
            {d.storageWarning && (
              <p role="alert" className="wf-error">
                {d.storageWarning}
              </p>
            )}
          </>
        )}
        {tab === "Overview" &&
          (rm ? (
            <RMOverview
              data={d}
              onNavigate={(value) => {
                if (value === "Relationships") setRelationshipView("clients");
                chooseTab(value);
              }}
              reviewSignal={reviewSignal}
              onReview={() => setReviewSignal((value) => value + 1)}
              onFollowUps={() => {
                setRelationshipView("tasks");
                chooseTab("Relationships");
              }}
            />
          ) : ops ? (
            <>
              <Panel title="Operations at a glance">
                <p>
                  Start with the live processing queue. LUCA decides allocations; Akula Ops matches
                  cash, issues approved holdings and publishes approved materials.
                </p>
                <div className="wf-grid">
                  <button className="wf-tile" onClick={() => chooseTab("Investments")}>
                    <h3>
                      {d.subscriptions.filter((s) => !archivedInvestment(s)).length} investment
                      tasks →
                    </h3>
                    <p>Receipts, matching, registry issuance and returns</p>
                  </button>
                  <button className="wf-tile" onClick={() => chooseTab("Publication")}>
                    <h3>
                      {d.versions.filter((v) => v.status !== "published").length} publication
                      versions →
                    </h3>
                    <p>Edit the overview and advance approved materials</p>
                  </button>
                  <button className="wf-tile" onClick={() => chooseTab("Reporting")}>
                    <h3>{d.holdings.length} issued holdings →</h3>
                    <p>Inspect vehicle owners, investors and reported values</p>
                  </button>
                </div>
              </Panel>
              <Analytics data={d} />
            </>
          ) : (
            <>
              <Analytics data={d} />
              <div className="wf-stats">
                <div>
                  <span>Investments in scope</span>
                  <strong>{d.subscriptions.length}</strong>
                </div>
                <div>
                  <span>Unmatched receipts</span>
                  <strong>{d.receipts.filter((r) => !r.matched && !r.supersededBy).length}</strong>
                </div>
                <div>
                  <span>Returns awaiting settlement</span>
                  <strong>{d.returns.filter((r) => r.status !== "confirmed").length}</strong>
                </div>
              </div>
              <Panel title="Your next steps">
                <div className="wf-grid">
                  {[
                    ["Investments", "Follow cash exceptions, allocation, issuance and returns."],
                    ["Review routed cases and reply using the shared reference."],
                    ["Documents", "Read the exact version behind a simulated signature."],
                    ["Reporting", "Check stale reports and separate experimental observations."],
                  ].map(([title, text]) => (
                    <button className="wf-tile" key={title} onClick={() => chooseTab(title)}>
                      <h3>{title} →</h3>
                      <p>{text}</p>
                    </button>
                  ))}
                </div>
              </Panel>
              <Panel title="Demo controls">
                <p>
                  All screens use the same records in this browser. Exports contain fictional demo
                  data. There is no live backend or multi-user synchronization.
                </p>
                <Button
                  variant="outline"
                  onClick={async () =>
                    download(
                      "akula-v4-demo.json",
                      JSON.stringify(
                        await personaApi(demoPersonaId, "/api/v1/workflows/export"),
                        null,
                        2,
                      ),
                    )
                  }
                >
                  Export demo records
                </Button>
                <DemoResetButton />
              </Panel>
            </>
          ))}
        {rm && tab === "Opportunities" && <RMOpportunities data={d} />}
        {tab === "Investments" && (
          <>
            {ops && (
              <OpsInvestmentQueue
                data={d}
                selectedId={String(sub?.id || "")}
                onSelect={setSid}
                onArchiveChange={(archived) => {
                  setOpsArchive(archived);
                  setSid("");
                }}
              />
            )}
            {!ops && (
              <Panel title="Investment record">
                <label className="wf-field">
                  Choose investment
                  <select value={sub?.id || ""} onChange={(e) => setSid(e.target.value)}>
                    {d.subscriptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        #{s.id} · {s.investor_name} · {s.asset_name} · {s.status}
                      </option>
                    ))}
                  </select>
                </label>
                {sub ? (
                  <>
                    <h3>
                      #{sub.id} · {sub.asset_name}
                    </h3>
                    <p>
                      {sub.investor_name} · {sub.status.replaceAll("_", " ")}
                      {sub.holdingId
                        ? " · Holding issued"
                        : allocation?.principal
                          ? " · Registry issuance pending"
                          : ""}
                    </p>
                    <div className="wf-stats">
                      <div>
                        <span>Requested capital</span>
                        <strong>{money(sub.amount, sub.currency)}</strong>
                      </div>
                      <div>
                        <span>Matched cash</span>
                        <strong>
                          {money(
                            receipts
                              .filter((r) => r.matched && !r.supersededBy)
                              .reduce((n, r) => n + r.amount, 0),
                            sub.currency,
                          )}
                        </strong>
                      </div>
                      <div>
                        <span>Allocated capital / fee</span>
                        <strong>
                          {allocation ? money(allocation.principal, sub.currency) : "Pending"}
                        </strong>
                        <small>{allocation ? money(allocation.fee, sub.currency) : ""}</small>
                      </div>
                    </div>
                    {manager && !sub.holdingId && (
                      <Action
                        label="Cancel unissued investment & record return obligation"
                        command={{ type: "cancel", id: sub.id }}
                      />
                    )}
                  </>
                ) : (
                  <p>No investments in scope.</p>
                )}
              </Panel>
            )}
            {sub && (
              <>
                {ops && (
                  <Panel title={`Record #${sub.id} · ${sub.asset_name}`}>
                    <p>
                      {sub.investor_name} · {d.clients.find((c) => c.id === sub.investor_id)?.code}{" "}
                      · {sub.status.replaceAll("_", " ")}
                    </p>
                    <div className="wf-stats">
                      <div>
                        <span>Requested capital</span>
                        <strong>{money(sub.amount, sub.currency)}</strong>
                      </div>
                      <div>
                        <span>Matched cash</span>
                        <strong>
                          {money(
                            receipts
                              .filter((r) => r.matched && !r.supersededBy)
                              .reduce((total, r) => total + r.amount, 0),
                            sub.currency,
                          )}
                        </strong>
                      </div>
                      <div>
                        <span>Allocated principal</span>
                        <strong>
                          {allocation ? money(allocation.principal, sub.currency) : "Awaiting LUCA"}
                        </strong>
                      </div>
                    </div>
                  </Panel>
                )}
                {(!ops || !opsArchive) && (
                  <Panel title="Cash receipts & matching">
                    {sub.needsReview && (
                      <div className="wf-banner">
                        Updated offering document requires investor acknowledgment. Review version #
                        {sub.needsReview} in Documents.
                        {sub.investor_id === d.actor.id && (
                          <Action
                            label="Acknowledge reviewed version"
                            command={{ type: "acknowledge", id: sub.id, target: sub.needsReview }}
                          />
                        )}
                      </div>
                    )}
                    {ops && (
                      <Action
                        label="Record fictional receipt"
                        command={{ type: "receipt", id: sub.id }}
                      >
                        <Field name="amount" label="Received amount" type="number" />
                        <Field name="currency" label="Currency" value={sub.currency} />
                        <Field name="text" label="Unique bank reference" />
                      </Action>
                    )}
                    {receipts.map((r) => (
                      <div className="wf-record" key={r.id}>
                        <h3>
                          Receipt #{r.id} · {money(r.amount, r.currency)}
                        </h3>
                        <p>
                          {r.reference} ·{" "}
                          {r.supersededBy ? "Corrected" : r.matched ? "Matched" : "Unmatched"} ·{" "}
                          {date(r.at)}
                        </p>
                        {ops && !r.matched && !r.supersededBy && (
                          <>
                            <Action
                              label="Match receipt"
                              command={{ type: "match", id: sub.id, target: r.id }}
                            />
                            <details>
                              <summary>Correct erroneous receipt</summary>
                              <Action
                                label="Append correction"
                                command={{ type: "correct-receipt", id: sub.id, target: r.id }}
                              >
                                <Field name="amount" label="Correct amount" type="number" />
                                <Field
                                  name="currency"
                                  label="Correct currency"
                                  value={sub.currency}
                                />
                                <Field name="text" label="Correction reference / source" />
                              </Action>
                            </details>
                          </>
                        )}
                      </div>
                    ))}
                  </Panel>
                )}
                {(manager || sub.investor_id === d.actor.id || d.actor.role === "eam") && (
                  <Panel title="Subscription review & follow-up">
                    <p>
                      {sub.on_hold
                        ? "On hold by LUCA"
                        : `Current stage: ${sub.status.replaceAll("_", " ")}`}
                    </p>
                    {sub.information_request_note && (
                      <p>
                        <strong>Information requested:</strong> {sub.information_request_note}
                      </p>
                    )}
                    {sub.information_response_note && (
                      <p>
                        <strong>Submitted response:</strong> {sub.information_response_note}
                      </p>
                    )}
                    {manager && sub.status === "under_luca_review" && !sub.on_hold && (
                      <>
                        <Action
                          label="Approve subscription"
                          command={{
                            type: "subscription-decision",
                            id: sub.id,
                            status: "approved",
                          }}
                        />
                        <Action
                          label="Request missing information"
                          command={{
                            type: "subscription-decision",
                            id: sub.id,
                            status: "information_requested",
                          }}
                        >
                          <Field name="text" label="Information needed" />
                        </Action>
                        <Action
                          label="Decline application"
                          command={{
                            type: "subscription-decision",
                            id: sub.id,
                            status: "rejected",
                          }}
                        >
                          <Field name="text" label="Reason for declining" />
                        </Action>
                      </>
                    )}
                    {manager &&
                      !sub.holdingId &&
                      !["not_allocated", "cancelled", "rejected", "funds_returned"].includes(
                        sub.status,
                      ) && (
                        <Action
                          label={sub.on_hold ? "Release hold" : "Put on hold"}
                          command={{
                            type: "subscription-hold",
                            id: sub.id,
                            status: sub.on_hold ? "released" : "held",
                          }}
                        />
                      )}
                    {(sub.investor_id === d.actor.id || d.actor.role === "eam") &&
                      sub.status === "information_requested" && (
                        <Action
                          label="Submit response to LUCA"
                          disabled={sub.on_hold}
                          command={{ type: "respond-information", id: sub.id }}
                        >
                          <Field name="text" label="Response to information request" />
                        </Action>
                      )}
                    {sub.investor_id === d.actor.id && (
                      <>
                        {["awaiting_funds", "payment_unmatched", "reconciliation"].includes(
                          sub.status,
                        ) && (
                          <div className="rounded border p-3 text-sm">
                            <strong>Simulated funding instructions</strong>
                            <p>
                              Total including agreed fee:{" "}
                              {money(
                                Number(sub.amount) + Number(sub.subscription_fee),
                                sub.currency,
                              )}
                            </p>
                            <p>Beneficiary: Akula VCC - Client Money / Escrow Account</p>
                            <p>Payment reference: {sub.payment_reference}</p>
                            <p>
                              Ops records and matches receipts; declaring a transfer does not
                              confirm funds.
                            </p>
                          </div>
                        )}
                        <InvestorSubscriptionActions subscriptionId={sub.id} status={sub.status} />
                        <FundingShortfall id={sub.id} personaId={demoPersonaId} />
                      </>
                    )}
                  </Panel>
                )}
                <Panel title="Allocation & registry">
                  {!sub.holdingId && (manager || ops) && (
                    <div className="rounded border p-3">
                      <strong>{ops ? "Issuance readiness" : "Allocation readiness"}</strong>
                      {(ops ? sub.issuanceBlockers : sub.allocationBlockers).length ? (
                        <ul>
                          {(ops ? sub.issuanceBlockers : sub.allocationBlockers).map((blocker) => (
                            <li key={blocker}>{blocker}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>Ready for {ops ? "Ops issuance" : "LUCA allocation decision"}.</p>
                      )}
                    </div>
                  )}

                  {ops && (
                    <p>
                      {sub.holdingId
                        ? `Holding #${sub.holdingId} is issued. The archive preserves its allocation and registry trail.`
                        : allocation?.principal
                          ? "LUCA approved the allocation. Akula Ops can now confirm simulated registry issuance below."
                          : "LUCA records the allocation after funds reconciliation. Akula Ops issues the holding only after that approval; until then, use the cash receipt and matching task above where applicable."}
                    </p>
                  )}
                  {d.actor.role === "eam" && sub.status === "institution_review" && (
                    <Action
                      label="Complete institution review"
                      command={{ type: "institution-review", id: sub.id }}
                    />
                  )}
                  {manager &&
                    !allocation &&
                    !sub.holdingId &&
                    ["allocation_pending", "reconciliation"].includes(sub.status) && (
                      <Action
                        label="Approve allocation"
                        disabled={sub.allocationBlockers.length > 0}
                        command={{ type: "allocate", id: sub.id }}
                      >
                        <Field
                          name="amount"
                          type="number"
                          label="Allocated principal (zero permitted)"
                          value={sub.amount}
                        />
                        <Field name="price" type="number" label="Illustrative class unit price" />
                        <p>
                          Class units use this explicit class price, not an underlying company share
                          price.
                        </p>
                      </Action>
                    )}
                  {ops && !!allocation?.principal && !sub.holdingId && (
                    <Action
                      label="Confirm simulated registry issuance"
                      disabled={sub.issuanceBlockers.length > 0}
                      command={{ type: "issue", id: sub.id }}
                    />
                  )}
                  <p>
                    Allocation alone does not create a holding. Issuance is a separate Ops action.
                  </p>
                </Panel>
                <Panel title="Independent return obligations">
                  {!returns.length && <p>No recorded return obligation.</p>}
                  {returns.map((r) => (
                    <article className="wf-record" key={r.id}>
                      <h3>
                        Return #{r.id} · {money(r.amount, sub.currency)}
                      </h3>
                      <p>
                        {r.status} · {date(r.at)}
                      </p>
                      {ops && r.status !== "confirmed" && (
                        <Action
                          label="Update return"
                          command={{ type: "return", id: sub.id, target: r.id }}
                        >
                          <Choice
                            name="status"
                            label="Settlement status"
                            items={
                              r.status === "processing"
                                ? [
                                    { id: "confirmed", name: "Confirmed" },
                                    { id: "failed", name: "Failed" },
                                  ]
                                : [{ id: "processing", name: "Processing / retry" }]
                            }
                          />
                        </Action>
                      )}
                    </article>
                  ))}
                </Panel>
              </>
            )}
          </>
        )}
        {tab === "Documents" && (
          <Panel title="Versioned investment documents">
            <p>
              Search published offering versions and the signed copies linked to your client
              investments. Latest versions appear first; turn on history to see earlier revisions.
            </p>
            <div className="wf-toolbar">
              <label className="wf-field">
                <span>Search documents</span>
                <Input
                  value={documentSearch}
                  onChange={(event) => setDocumentSearch(event.target.value)}
                  placeholder="Company, version or status"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={documentHistory}
                  onChange={(event) => setDocumentHistory(event.target.checked)}
                />
                Show version history
              </label>
              <span className="wf-result-count">{visibleVersions.length} documents</span>
            </div>
            {!visibleVersions.length ? (
              <p className="wf-empty">No documents match these filters.</p>
            ) : (
              <div className="wf-doc-list">
                {visibleVersions.map((v) => (
                  <article key={v.id} className="wf-doc-row">
                    <div>
                      <h3>
                        {v.snapshot.codename} · v{v.number}
                      </h3>
                      <p>
                        {v.status} · {date(v.at)}
                      </p>
                      {d.signatures.some((signature) => signature.versionId === v.id) && (
                        <details className="mt-2 text-sm">
                          <summary className="cursor-pointer text-muted-foreground">
                            Signed copies (
                            {
                              d.signatures.filter((signature) => signature.versionId === v.id)
                                .length
                            }
                            )
                          </summary>
                          <ul className="mt-2 space-y-1 text-muted-foreground">
                            {d.signatures
                              .filter((signature) => signature.versionId === v.id)
                              .map((signature) => (
                                <li key={signature.id}>
                                  Investment #{signature.subscriptionId} · {signature.name} ·{" "}
                                  {date(signature.at)}
                                </li>
                              ))}
                          </ul>
                        </details>
                      )}
                    </div>
                    <div className="wf-doc-actions">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPreview(preview === v.id ? null : v.id)}
                      >
                        {preview === v.id ? "Close preview" : "Preview"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          download(
                            `term-sheet-${v.fundId}-v${v.number}.doc`,
                            documentHtml(v),
                            "application/msword",
                          )
                        }
                      >
                        Download
                      </Button>
                    </div>
                    {preview === v.id && (
                      <iframe
                        title={`${v.snapshot.codename} version ${v.number}`}
                        sandbox=""
                        srcDoc={documentHtml(v)}
                        className="wf-document"
                      />
                    )}
                  </article>
                ))}
              </div>
            )}
          </Panel>
        )}
        {tab === "Publication" && privileged && (
          <>
            <Panel title="Offering preparation">
              <p>
                {ops
                  ? "Akula Ops edits to a deal go to the LUCA Investment Team, who decide what to include when they submit it. The Fund Manager sees only what the Investment Team submits."
                  : team
                    ? "Prepare the offering, then submit it to the Fund Manager. Edits from Akula Ops appear below and are included when you submit."
                    : "The Investment Team prepares and submits each offering. You review it, edit anything you want changed, and approve. Approval publishes it to investors."}
              </p>
              <div className="wf-publication-grid">
                {d.funds.map((fund) => (
                  <Link
                    key={fund.id}
                    className="wf-publication-link"
                    to={ops ? `/ops/publication/${fund.id}` : `/luca/deals/${fund.id}`}
                  >
                    <strong>{fund.company}</strong>
                    <span>
                      {fund.name} · {fund.state}
                    </span>
                    <small>{ops ? "Edit deal →" : "Open deal →"}</small>
                  </Link>
                ))}
              </div>
              {(team || manager) && (
                <Action label="Prepare draft version" command={{ type: "prepare" }}>
                  <Choice name="id" label="Offering" items={d.funds} />
                </Action>
              )}
            </Panel>
            {(team || ops) && (
              <Panel
                title={ops ? "Your edits, routed to the Investment Team" : "Edits from Akula Ops"}
              >
                {d.dealChanges.filter((change) => change.byRole === "ops").length === 0 ? (
                  <p className="wf-empty">No Akula Ops edits to deals.</p>
                ) : (
                  d.dealChanges
                    .filter((change) => change.byRole === "ops")
                    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
                    .map((change) => (
                      <article className="wf-record" key={change.id}>
                        <h3>
                          {d.funds.find((fund) => fund.id === change.fundId)?.company ??
                            `Offering ${change.fundId}`}
                        </h3>
                        <p>
                          {change.fields.join(", ")} · {date(change.at)}
                        </p>
                        <p>
                          {change.includedInVersion
                            ? `Submitted to the Fund Manager in version ${
                                d.versions.find((v) => v.id === change.includedInVersion)?.number ??
                                ""
                              }.`
                            : "Not yet submitted. Included in the next version the Investment Team submits."}
                        </p>
                      </article>
                    ))
                )}
              </Panel>
            )}
            <Panel title="Publication queue">
              {d.versions.filter((v) => v.status !== "published").length === 0 && (
                <p className="wf-empty">Nothing is waiting for publication.</p>
              )}
              {d.versions
                .filter((v) => v.status !== "published")
                .map((v) => (
                  <article className="wf-record" key={v.id}>
                    <h3>
                      {v.snapshot.codename} · version {v.number}
                    </h3>
                    <p>
                      {v.status === "draft"
                        ? "Draft with the Investment Team"
                        : v.status === "review"
                          ? `Awaiting Fund Manager approval · submitted ${date(v.at)}`
                          : "Approved, not yet published"}
                    </p>
                    {v.decision?.outcome === "returned" && v.status === "draft" && (
                      <p>Returned by the Fund Manager: {v.decision.text}</p>
                    )}
                    {v.status === "review" && v.note && (
                      <p>Note from the Investment Team: {v.note}</p>
                    )}
                    {v.status === "review" && (
                      <p>
                        {v.changed?.length
                          ? `Changed from the published version: ${v.changed.join(", ")}.`
                          : "No earlier published version to compare with."}
                      </p>
                    )}
                    {(team || manager) && v.status === "draft" && (
                      <Action label="Submit to Fund Manager" command={{ type: "review", id: v.id }}>
                        <Field
                          name="text"
                          label="Note for the Fund Manager (optional)"
                          required={false}
                        />
                      </Action>
                    )}
                    {manager && v.status === "review" && (
                      <>
                        <Action
                          label="Approve and publish to investors"
                          command={{ type: "approve", id: v.id }}
                        />
                        <Action
                          label="Return to Investment Team"
                          command={{ type: "send-back", id: v.id }}
                        >
                          <Field name="text" label="Reason" />
                        </Action>
                      </>
                    )}
                    {manager && v.status === "approved" && (
                      <Action
                        label="Publish approved version"
                        command={{ type: "publish", id: v.id }}
                      />
                    )}
                  </article>
                ))}
            </Panel>
          </>
        )}
        {tab === "Relationships" && rm && !manager && (
          <>
            <Panel title="Client follow-ups">
              <p>Client actions and private follow-up notes. Expand a client to record a note.</p>
              {rm && relationshipView === "tasks" && (
                <div className="wf-task-summary">
                  {visibleClients.map((client) => {
                    const tasks = d.subscriptions.filter(
                      (subscription) =>
                        subscription.investor_id === client.id &&
                        RM_ACTION_STATUSES.includes(subscription.status),
                    );
                    const notes = d.notes.filter(
                      (note) => note.investorId === client.id && !note.done,
                    );
                    if (!tasks.length && !notes.length) return null;
                    return (
                      <details key={client.id} className="wf-client-task-group">
                        <summary>
                          <strong>
                            {client.name} <small>· {client.code}</small>
                          </strong>
                          <span>
                            {tasks.length} deal action{tasks.length === 1 ? "" : "s"}
                            {notes.length
                              ? ` · ${notes.length} private follow-up${notes.length === 1 ? "" : "s"}`
                              : ""}
                          </span>
                        </summary>
                        <div className="wf-client-task-content">
                          {tasks.map((subscription) => (
                            <div className="wf-client-task-item" key={subscription.id}>
                              <strong>
                                {subscription.asset_name} · #{subscription.id}
                              </strong>
                              <span>
                                {RM_STATUS_LABELS[subscription.status] ??
                                  subscription.status.replaceAll("_", " ")}{" "}
                                · {RM_STAGE_GUIDANCE[subscription.status]?.rm}
                              </span>
                            </div>
                          ))}
                          {notes.map((note) => (
                            <div className="wf-client-task-item" key={`note-${note.id}`}>
                              <strong>Private follow-up · {note.due || "No due date"}</strong>
                              <span>{note.text}</span>
                              <Action
                                label="Complete private follow-up"
                                command={{ type: "complete-note", id: note.id }}
                              />
                            </div>
                          ))}
                        </div>
                      </details>
                    );
                  })}
                  {!visibleClients.some(
                    (client) =>
                      d.subscriptions.some(
                        (subscription) =>
                          subscription.investor_id === client.id &&
                          RM_ACTION_STATUSES.includes(subscription.status),
                      ) || d.notes.some((note) => note.investorId === client.id && !note.done),
                  ) && <p className="wf-empty">No open client actions or private follow-ups.</p>}
                </div>
              )}
              <label className="wf-field wf-search">
                <span>Search by client name</span>
                <Input
                  value={relationshipSearch}
                  onChange={(event) => setRelationshipSearch(event.target.value)}
                  placeholder="Type a client name"
                />
              </label>
              {!visibleClients.length && <p className="wf-empty">No clients match this search.</p>}
              {visibleClients.map((c) => (
                <details className="wf-record wf-client-record" key={c.id}>
                  <summary>
                    <strong>{c.name}</strong> <small>· {c.code}</small>
                  </summary>
                  <p>
                    Client #{c.id} · LUCA RM #
                    {d.assignments.find((a) => a.investorId === c.id)?.staffId || "unassigned"}
                  </p>
                  {rm && (
                    <>
                      <Action label="Save private follow-up" command={{ type: "note", id: c.id }}>
                        <Field name="text" label="Internal note (not visible to investor)" />
                        <Field name="due" label="Follow-up date" type="date" required={false} />
                      </Action>
                    </>
                  )}
                </details>
              ))}
            </Panel>
            {rm && (
              <Panel title="Private follow-ups">
                {!d.notes.length && (
                  <p className="wf-empty">
                    No private follow-up notes yet. Add one from a client in Relationships.
                  </p>
                )}
                {d.notes.map((n) => (
                  <article className="wf-record" key={n.id}>
                    <p>{n.text}</p>
                    <small>
                      Client #{n.investorId} · {n.due || "No due date"} ·{" "}
                      {n.done ? "Completed" : "Open"}
                    </small>
                    {!n.done && (
                      <Action
                        label="Complete follow-up"
                        command={{ type: "complete-note", id: n.id }}
                      />
                    )}
                  </article>
                ))}
              </Panel>
            )}
          </>
        )}
        {(tab === "Demand" || tab === "Company requests") && (
          <>
            <Panel title={privileged ? "Investor demand signals" : "Request another company"}>
              <p>
                {privileged
                  ? "Illustrative, nonbinding investor interest helps LUCA decide which companies to source. It is a demand signal, not an order book or allocation."
                  : "Indications are nonbinding and do not reserve allocation. Different currencies remain separate."}
              </p>
              {!staff && (
                <Action label="Submit company request" command={{ type: "request" }}>
                  <Field name="text" label="Company name" />
                  <Field
                    name="amount"
                    type="number"
                    label="Optional indicative amount"
                    required={false}
                  />
                  <Field name="currency" label="Currency" value="USD" />
                </Action>
              )}
              {privileged && <DemandAnalytics d={d} ops={ops} manager={manager} />}
              {!privileged &&
                Array.from(new Set(d.requests.map((r) => r.key))).map((key) => {
                  const rows = d.requests.filter((r) => r.key === key),
                    r = rows[0];
                  return (
                    <article className="wf-record" key={key}>
                      <h3>{r.company}</h3>
                      <p>
                        {new Set(rows.map((r) => r.investorId)).size} requesting investor(s) ·{" "}
                        {r.status}
                      </p>
                      {privileged && (
                        <p>
                          Illustrative demand:{" "}
                          {
                            rows.filter((x) => x.amount !== undefined && x.currency === "USD")
                              .length
                          }{" "}
                          USD indications totalling{" "}
                          {money(
                            rows
                              .filter((x) => x.currency === "USD")
                              .reduce((total, x) => total + (x.amount || 0), 0),
                          )}
                          . Nonbinding; not an order book.
                        </p>
                      )}
                      {rows.map((x) => (
                        <p key={x.id}>
                          {privileged
                            ? `${d.clients.find((client) => client.id === x.investorId)?.name || `Investor #${x.investorId}`} · ${d.clients.find((client) => client.id === x.investorId)?.code || ""}`
                            : `Request #${x.id}`}
                          :{" "}
                          {x.amount === undefined
                            ? "No amount indicated"
                            : money(x.amount, x.currency)}
                          {x.fundId && (
                            <Link to={`/funds/${x.fundId}`}> · Opportunity available →</Link>
                          )}
                        </p>
                      ))}
                      {privileged && (
                        <Action
                          label="Update all requesters"
                          command={{ type: "request-status", id: r.id }}
                        >
                          <Choice
                            name="status"
                            label="Sourcing status"
                            items={[
                              "Under review",
                              "Shared with LUCA",
                              "Not currently available",
                              "Opportunity available",
                            ].map((name) => ({ id: name, name }))}
                          />
                          <Choice
                            name="target"
                            label="Published offering (only when available)"
                            items={[
                              { id: "", name: "None" },
                              ...d.funds.filter((f) => f.state === "open"),
                            ]}
                          />
                        </Action>
                      )}
                    </article>
                  );
                })}
            </Panel>
          </>
        )}
        {(tab === "Reporting" || (rm && tab === "Reports")) && (
          <>
            <Panel
              title={
                tab === "Reports"
                  ? "Client holdings & reported values"
                  : "Holdings & sourced reports"
              }
            >
              <p>
                {rm
                  ? "This is a read-only view of investments held by your assigned clients and their latest reported values. It helps you prepare client conversations; only LUCA publishes sourced valuations."
                  : "Reported holding values are separate from experimental security-price observations."}
              </p>
              {!d.holdings.length && (
                <p className="wf-empty">
                  No holdings have been issued to your client book yet. Once Akula Ops records an
                  issuance, its reported value will appear here.
                </p>
              )}
              {tab === "Reports" ? (
                <RMReports data={d} />
              ) : ops ? (
                d.funds
                  .filter((fund) => d.holdings.some((holding) => holding.fund_id === fund.id))
                  .map((fund) => {
                    const holdings = d.holdings.filter((holding) => holding.fund_id === fund.id);
                    return (
                      <details key={fund.id} className="wf-report-group">
                        <summary>
                          <strong>
                            {fund.company} · {fund.name}
                          </strong>
                          <span>
                            {holdings.length} holdings ·{" "}
                            {money(
                              holdings.reduce(
                                (total, holding) => total + Number(holding.committed_amount),
                                0,
                              ),
                            )}{" "}
                            invested
                          </span>
                        </summary>
                        <div className="wf-report-table">
                          <div className="wf-report-head">
                            <span>Holding / investor</span>
                            <span>Vehicle owner / channel</span>
                            <span>Buy-in</span>
                            <span>Reported value</span>
                          </div>
                          {holdings.map((holding) => {
                            const client = d.clients.find((c) => c.id === holding.investor_id);
                            const valuation = d.valuations
                              .filter((v) => v.holdingId === holding.id)
                              .at(-1);
                            return (
                              <div key={holding.id} className="wf-report-row">
                                <span>
                                  <strong>
                                    #{holding.id} ·{" "}
                                    {client?.name || `Investor #${holding.investor_id}`}
                                  </strong>
                                  <small>
                                    {client?.code} · {holding.units} units
                                  </small>
                                </span>
                                <span>{client?.eamFirm || "Direct / LUCA"}</span>
                                <span>{money(holding.committed_amount)}</span>
                                <span>
                                  {money(valuation?.amount ?? holding.current_nav)}
                                  <small>
                                    {valuation?.at || holding.nav_as_of
                                      ? date(valuation?.at || holding.nav_as_of || "")
                                      : "No report"}
                                  </small>
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    );
                  })
              ) : (
                d.holdings.map((h) => {
                  const v = d.valuations.filter((v) => v.holdingId === h.id).at(-1);
                  const at = v?.at || h.nav_as_of;
                  const stale = !at || Date.now() - Date.parse(at) > 90 * 86400000;
                  return (
                    <article key={h.id} className="wf-record">
                      <h3>
                        {h.asset_name} · Holding #{h.id}
                      </h3>
                      <p>
                        {h.units} class units · Cost {money(h.committed_amount)} · Reported value{" "}
                        {money(v?.amount ?? h.current_nav, v?.currency || "USD")}
                      </p>
                      <p>
                        {at ? date(at) : "Missing report date"} ·{" "}
                        {v?.source || "Legacy mock administrator report"} ·{" "}
                        <strong>
                          {stale
                            ? "Stale / missing report"
                            : "Current within demo 90-day threshold"}
                        </strong>
                      </p>
                      {manager && (
                        <Action
                          label="Append sourced valuation"
                          command={{ type: "valuation", id: h.id }}
                        >
                          <Field name="amount" label="Reported value" type="number" />
                          <Field name="currency" label="Currency" value="USD" />
                          <Field name="text" label="Report source" />
                          <Field name="due" label="As-of date" type="date" />
                        </Action>
                      )}
                    </article>
                  );
                })
              )}
            </Panel>
            {(manager || ops) && (
              <Panel title="EXPERIMENTAL · Secondary-market pricing indicator">
                <p>
                  Illustrative underlying-security observations only. Not a VCC/class NAV,
                  executable quote or liquidity promise. These observations never enter holding
                  totals or returns.
                </p>
                {manager && (
                  <Action label="Append illustrative observation" command={{ type: "secondary" }}>
                    <Choice name="id" label="Company offering" items={d.funds} />
                    <Field name="amount" label="Price per underlying security" type="number" />
                    <Field name="currency" label="Currency" value="USD" />
                    <Field name="text" label="Source and comparability notes" />
                  </Action>
                )}
                {!d.secondary.length && (
                  <p>No observation supplied. Nothing is inferred from company valuations.</p>
                )}
                {d.secondary.map((s) => (
                  <article className="wf-record" key={s.id}>
                    <h3>
                      {d.funds.find((f) => f.id === s.fundId)?.name} · {money(s.amount, s.currency)}
                    </h3>
                    <p>
                      {date(s.at)} · {s.source}
                    </p>
                  </article>
                ))}
              </Panel>
            )}
          </>
        )}
        {!rm && (
          <footer>
            LUCA owns investment decisions. Akula Ops records processing. External institutions and
            LUCA employees have separate scopes.
          </footer>
        )}
      </main>
    </div>
  );
}

export default function WorkflowPage(props: {
  demoPersonaId?: number;
  surface?: string;
  compact?: boolean;
  onSurfaceChange?: (surface: string) => void;
}) {
  return (
    <DemoPersonaContext.Provider value={props.demoPersonaId}>
      <WorkflowPageContent
        surface={props.surface}
        compact={props.compact}
        onSurfaceChange={props.onSurfaceChange}
      />
    </DemoPersonaContext.Provider>
  );
}
