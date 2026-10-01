import { useState, type ReactNode, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";
import type { WorkflowView, WorkflowCommand, Version } from "@/lib/workflow-types";
import { Button } from "@/components/ui/button";
import DemoResetButton from "@/components/demo-reset-button";
import { Input } from "@/components/ui/input";
import "./workflow.css";

const money = (v: number | string, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(v));
const date = (v: string) =>
  new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
function useWorkspace() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["workflows", user?.id],
    queryFn: () => api<WorkflowView>("/api/v1/workflows"),
    staleTime: 0,
  });
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
}: {
  label: string;
  command: WorkflowCommand;
  children?: ReactNode;
}) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (body: WorkflowCommand) =>
      api<WorkflowView>("/api/v1/workflows", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries(),
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    const body = { ...command, ...fields } as WorkflowCommand;
    for (const key of ["id", "target", "amount", "price"] as const) {
      if (key in fields) {
        if (fields[key] === "") delete body[key];
        else body[key] = Number(fields[key]);
      }
    }
    mutation.mutate(body, { onSuccess: () => form.reset() });
  }
  return (
    <form className="wf-action" onSubmit={submit}>
      {children}
      <Button disabled={mutation.isPending} type="submit">
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
}: {
  label: string;
  name: string;
  items: { id: number | string; name: string }[];
}) {
  return (
    <label className="wf-field">
      <span>{label}</span>
      <select name={name} required>
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

export function ServiceDesk() {
  const q = useWorkspace();
  if (q.isLoading)
    return (
      <p role="status" className="py-8 text-sm text-muted-foreground">
        Loading your support requests…
      </p>
    );
  if (q.error || !q.data)
    return (
      <div className="space-y-2">
        <p role="alert" className="text-sm text-muted-foreground">
          We couldn’t load your support requests. Your signed-in session is still active.
        </p>
        <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
          Try again
        </Button>
      </div>
    );
  return (
    <div className="wf-content">
      <Cases data={q.data} />
    </div>
  );
}
function Cases({ data: d }: { data: WorkflowView }) {
  const staff = ["luca", "ops", "rm"].includes(d.actor.role) || d.actor.role === "eam";
  return (
    <>
      <Panel title="Raise a tracked case">
        <p>
          A reference appears immediately in your case history and the responsible team’s workspace.
        </p>
        <Action label="Create case" command={{ type: "case", target: d.actor.id }}>
          {staff && <Choice label="Client" name="target" items={d.clients} />}
          <Choice
            label="Route to"
            name="status"
            items={[
              { id: "ops", name: "Akula Ops · processing" },
              { id: "luca", name: "LUCA · fund manager" },
              { id: "rm", name: "Assigned LUCA RM" },
              { id: "eam", name: "Assigned external institution" },
            ]}
          />
          <Choice
            label="Investment (optional)"
            name="id"
            items={[
              { id: "", name: "Account question" },
              ...d.subscriptions.map((s) => ({
                id: s.id,
                name: `#${s.id} · ${s.investor_name} · ${s.asset_name}`,
              })),
            ]}
          />
          <Field label="Question or issue" name="text" />
        </Action>
      </Panel>
      <Panel title="Case history & inbox">
        {!d.cases.length && <p>No cases yet.</p>}
        {d.cases.map((c) => (
          <article className="wf-record" key={c.id}>
            <h3>
              Case #{c.id} · {c.subject}
            </h3>
            <p>
              {c.owner === "luca"
                ? "LUCA manager"
                : c.owner === "ops"
                  ? "Akula Ops"
                  : c.owner.toUpperCase()}{" "}
              · {c.status} · {date(c.at)}
              {c.subscriptionId && ` · Investment #${c.subscriptionId}`}
            </p>
            {c.messages.map((m, i) => (
              <blockquote key={i}>
                <span>
                  Identity #{m.actorId} · {date(m.at)}
                </span>
                <p>{m.text}</p>
              </blockquote>
            ))}
            <Action label="Reply" command={{ type: "reply", id: c.id }}>
              <Field label="Message" name="text" />
            </Action>
            {staff && c.status === "open" && (
              <Action label="Resolve case" command={{ type: "resolve", id: c.id }} />
            )}
          </article>
        ))}
      </Panel>
    </>
  );
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

export default function WorkflowPage() {
  const q = useWorkspace(),
    { logout } = useAuth();
  const [tab, setTab] = useState("Overview");
  const [sid, setSid] = useState("");
  const [preview, setPreview] = useState<number | null>(null);
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
    rm = d.actor.role === "rm",
    staff = manager || ops || rm,
    privileged = manager || ops;
  const sub = d.subscriptions.find((s) => String(s.id) === sid) || d.subscriptions[0];
  const receipts = d.receipts.filter((r) => r.subscriptionId === sub?.id);
  const allocation = d.allocations.find((a) => a.subscriptionId === sub?.id && !a.voided);
  const returns = d.returns.filter((r) => r.subscriptionId === sub?.id);
  const tabs = [
    "Overview",
    "Investments",
    "Documents",
    "Support",
    ...(privileged ? ["Publication", "Demand"] : []),
    ...(rm || manager ? ["Relationships"] : []),
    "Reporting",
    ...(!staff ? ["Company requests"] : []),
  ];
  const home = manager ? "/luca" : d.actor.role === "eam" ? "/eam" : "/portfolio";
  return (
    <div className="wf-shell">
      <aside className="wf-sidebar">
        <Link to={staff && !manager ? "/workflows" : home} className="wf-brand">
          akula<span> / LUCA Beta</span>
        </Link>
        <p>
          {manager
            ? "LUCA fund manager"
            : ops
              ? "Akula Operations"
              : rm
                ? "LUCA relationship manager"
                : "Investor & institution services"}
        </p>
        <nav aria-label="Workflow navigation">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} aria-current={tab === t ? "page" : undefined}>
              {t}
            </button>
          ))}
        </nav>
        {(!staff || manager) && <Link to={home}>← Existing portal</Link>}
        <button onClick={logout}>Sign out</button>
      </aside>
      <main className="wf-main">
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
        <div className="wf-banner">
          SIMULATION · Fictional processing · Browser-local records · No real money or signatures
        </div>
        {d.storageWarning && (
          <p role="alert" className="wf-error">
            {d.storageWarning}
          </p>
        )}
        {tab === "Overview" && (
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
                <span>Open cases</span>
                <strong>{d.cases.filter((c) => c.status === "open").length}</strong>
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
                  ["Support", "Review routed cases and reply using the shared reference."],
                  ["Documents", "Read the exact version behind a simulated signature."],
                  ["Reporting", "Check stale reports and separate experimental observations."],
                ].map(([title, text]) => (
                  <button className="wf-tile" key={title} onClick={() => setTab(title)}>
                    <h3>{title} →</h3>
                    <p>{text}</p>
                  </button>
                ))}
              </div>
            </Panel>
            {d.highlights.length > 0 && (
              <Panel title="LUCA RM highlights · full shelf remains available">
                {d.highlights.map((h) => {
                  const v = d.versions.find((v) => v.id === h.versionId);
                  return (
                    <article className="wf-record" key={h.id}>
                      <h3>
                        {v?.snapshot.codename} · v{v?.number}
                      </h3>
                      <p>{h.note}</p>
                      {h.investorId === d.actor.id && (
                        <Action
                          label={h.openedAt ? "Reviewed" : "Record opening"}
                          command={{ type: "open-highlight", id: h.id }}
                        />
                      )}
                      <Link to={`/funds/${v?.fundId}`}>Review opportunity →</Link>
                    </article>
                  );
                })}
              </Panel>
            )}
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
                    JSON.stringify(await api("/api/v1/workflows/export"), null, 2),
                  )
                }
              >
                Export demo records
              </Button>
              <DemoResetButton />
            </Panel>
          </>
        )}
        {tab === "Investments" && (
          <>
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
            {sub && (
              <>
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
                <Panel title="Allocation & registry">
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
                      <Action label="Approve allocation" command={{ type: "allocate", id: sub.id }}>
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
        {tab === "Support" && <Cases data={d} />}
        {tab === "Documents" && (
          <Panel title="Versioned investment documents">
            <p>
              Signed snapshots remain available after revisions or consent withdrawal. Downloads and
              previews use this same immutable version.
            </p>
            {d.versions.map((v) => (
              <article key={v.id} className="wf-record">
                <h3>
                  {v.snapshot.codename} · version {v.number}
                </h3>
                <p>
                  {v.status} · {date(v.at)}
                  {d.signatures
                    .filter((s) => s.versionId === v.id)
                    .map((s) => ` · Signed for investment #${s.subscriptionId} by ${s.name}`)
                    .join("")}
                </p>
                <Button
                  variant="outline"
                  onClick={() => setPreview(preview === v.id ? null : v.id)}
                >
                  Preview
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    download(
                      `term-sheet-${v.fundId}-v${v.number}.doc`,
                      documentHtml(v),
                      "application/msword",
                    )
                  }
                >
                  Download Word (.doc)
                </Button>
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
          </Panel>
        )}
        {tab === "Publication" && privileged && (
          <>
            <Panel title="Offering preparation">
              <p>
                Use the existing <Link to="/luca/deals">deal editor</Link> to author content.
                Prepare a version, request review, obtain LUCA approval, then publish as Ops.
              </p>
              <Action label="Prepare draft version" command={{ type: "prepare" }}>
                <Choice name="id" label="Offering" items={d.funds} />
              </Action>
            </Panel>
            <Panel title="Publication queue">
              {d.versions
                .filter((v) => v.status !== "published")
                .map((v) => (
                  <article className="wf-record" key={v.id}>
                    <h3>
                      {v.snapshot.codename} · version {v.number}
                    </h3>
                    <p>{v.status}</p>
                    {ops && v.status === "draft" && (
                      <Action
                        label="Submit for LUCA review"
                        command={{ type: "review", id: v.id }}
                      />
                    )}
                    {manager && v.status === "review" && (
                      <Action
                        label="Approve exact version"
                        command={{ type: "approve", id: v.id }}
                      />
                    )}
                    {ops && v.status === "approved" && (
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
        {tab === "Relationships" && (rm || manager) && (
          <>
            <Panel title={manager ? "Assign LUCA relationship managers" : "Assigned clients"}>
              {manager && (
                <Action label="Record mock eligibility decision" command={{ type: "eligibility" }}>
                  <Choice name="id" label="Investor identity" items={d.clients} />
                  <Choice
                    name="status"
                    label="Manager decision"
                    items={[
                      { id: "approved", name: "Approved" },
                      { id: "failed", name: "Declined" },
                    ]}
                  />
                </Action>
              )}
              {manager && (
                <Action label="Assign RM" command={{ type: "assign" }}>
                  <Choice name="id" label="Client" items={d.clients} />
                  <Choice
                    name="target"
                    label="LUCA employee"
                    items={[
                      { id: 6, name: "LUCA RM · rm@akula.vc" },
                      { id: 8, name: "LUCA RM · rm2@akula.vc" },
                    ]}
                  />
                </Action>
              )}
              {d.clients.map((c) => (
                <article className="wf-record" key={c.id}>
                  <h3>{c.name}</h3>
                  <p>
                    Client #{c.id} · LUCA RM #
                    {d.assignments.find((a) => a.investorId === c.id)?.staffId || "unassigned"}
                  </p>
                  {rm && (
                    <>
                      <Action
                        label="Highlight approved opportunity"
                        command={{ type: "highlight", id: c.id }}
                      >
                        <Choice
                          name="target"
                          label="Opportunity"
                          items={d.funds.filter((f) => f.state === "open")}
                        />
                        <Field name="text" label="Client-facing note" />
                      </Action>
                      <Action label="Save private follow-up" command={{ type: "note", id: c.id }}>
                        <Field name="text" label="Internal note (not visible to investor)" />
                        <Field name="due" label="Follow-up date" type="date" required={false} />
                      </Action>
                    </>
                  )}
                </article>
              ))}
            </Panel>
            {rm && (
              <Panel title="Private follow-ups">
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
            <Panel
              title={privileged ? "Company demand · unique investors" : "Request another company"}
            >
              <p>
                Indications are nonbinding and do not reserve allocation. Different currencies
                remain separate.
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
              {Array.from(new Set(d.requests.map((r) => r.key))).map((key) => {
                const rows = d.requests.filter((r) => r.key === key),
                  r = rows[0];
                return (
                  <article className="wf-record" key={key}>
                    <h3>{r.company}</h3>
                    <p>
                      {new Set(rows.map((r) => r.investorId)).size} requesting investor(s) ·{" "}
                      {r.status}
                    </p>
                    {rows.map((x) => (
                      <p key={x.id}>
                        Request #{x.id}:{" "}
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
        {tab === "Reporting" && (
          <>
            <Panel title="Holdings & sourced reports">
              {d.holdings.map((h) => {
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
                        {stale ? "Stale / missing report" : "Current within demo 90-day threshold"}
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
              })}
            </Panel>
            <Panel title="EXPERIMENTAL · Secondary-market pricing indicator">
              <p>
                Illustrative underlying-security observations only. Not a VCC/class NAV, executable
                quote or liquidity promise. These observations never enter holding totals or
                returns.
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
          </>
        )}
        <footer>
          LUCA owns investment decisions. Akula Ops records processing. External institutions and
          LUCA employees have separate scopes.
        </footer>
      </main>
    </div>
  );
}
