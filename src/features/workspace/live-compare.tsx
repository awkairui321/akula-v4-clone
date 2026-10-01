import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiAsDemo } from "@/lib/api";
import { isMocking } from "@/mocks/browser";
import type { WorkflowCommand, WorkflowView } from "@/lib/workflow-types";
import DemoResetButton from "@/components/demo-reset-button";
import { Button } from "@/components/ui/button";
import "./workflow.css";

type Persona = { id: number; label: string; role: string };
const personas: Persona[] = [
  { id: 2, label: "Investor · Elena", role: "investor" },
  { id: 1, label: "LUCA · Fund manager", role: "luca" },
  { id: 7, label: "Akula Ops", role: "ops" },
  { id: 4, label: "External intermediary", role: "eam" },
];
const money = (n: number | string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n) || 0);

function RolePane({
  persona,
  counterpart,
  investmentId,
  investments,
  changed,
}: {
  persona: Persona;
  counterpart: WorkflowView | undefined;
  investmentId: number;
  investments: { id: number; name: string }[];
  changed: (kind: "persona" | "investment", id: number) => void;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["live-compare", persona.id],
    queryFn: () => apiAsDemo<WorkflowView>(persona.id, "/api/v1/workflows"),
    refetchInterval: 1200,
  });
  const d = q.data;
  const s = d?.subscriptions.find((x) => x.id === investmentId);
  const allocation = d?.allocations.find((x) => x.subscriptionId === investmentId && !x.voided);
  const receipts = d?.receipts.filter((x) => x.subscriptionId === investmentId) ?? [];
  const returns = d?.returns.filter((x) => x.subscriptionId === investmentId) ?? [];
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("1000");
  const [receipt, setReceipt] = useState("");
  const [caseText, setCaseText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send(command: WorkflowCommand) {
    setBusy(true);
    setError("");
    try {
      await apiAsDemo<WorkflowView>(persona.id, "/api/v1/workflows", {
        method: "POST",
        body: command as unknown as Record<string, unknown>,
      });
      await qc.invalidateQueries({ queryKey: ["live-compare"] });
      changed("investment", investmentId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save demo action.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="live-pane">
      <header>
        <p className="wf-eyebrow">{persona.role.toUpperCase()} VIEW</p>
        <h2>{persona.label}</h2>
        <span>{d?.actor.email ?? (q.isLoading ? "Connecting…" : "Unavailable")}</span>
      </header>
      {s ? (
        <>
          <div className="live-record-title">
            <small>SHARED INVESTMENT #{s.id}</small>
            <h3>{s.asset_name}</h3>
            <p>
              {s.investor_name} · {s.status.replaceAll("_", " ")}
            </p>
          </div>
          <dl className="live-facts">
            <div>
              <dt>Requested</dt>
              <dd>{money(s.amount)}</dd>
            </div>
            <div>
              <dt>Matched cash</dt>
              <dd>
                {money(
                  receipts
                    .filter((x) => x.matched && !x.supersededBy)
                    .reduce((n, x) => n + x.amount, 0),
                )}
              </dd>
            </div>
            <div>
              <dt>Allocated principal / fee</dt>
              <dd>
                {allocation
                  ? `${money(allocation.principal)} / ${money(allocation.fee)}`
                  : "Awaiting manager"}
              </dd>
            </div>
            <div>
              <dt>Registry holding</dt>
              <dd>
                {s.holdingId
                  ? `Issued · #${s.holdingId}`
                  : allocation?.principal
                    ? "Issuance pending"
                    : "Not issued"}
              </dd>
            </div>
            <div>
              <dt>Return obligation</dt>
              <dd>
                {returns.length
                  ? returns.map((x) => `${money(x.amount)} · ${x.status}`).join("; ")
                  : "None recorded"}
              </dd>
            </div>
          </dl>
          {persona.role === "luca" &&
            !allocation &&
            ["allocation_pending", "reconciliation"].includes(s.status) && (
              <div className="live-action">
                <label>
                  Allocate principal{" "}
                  <input
                    type="number"
                    min="0"
                    value={amount || s.amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <label>
                  Illustrative class price{" "}
                  <input
                    type="number"
                    min="1"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </label>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void send({
                      type: "allocate",
                      id: s.id,
                      amount: Number(amount || s.amount),
                      price: Number(price),
                    })
                  }
                >
                  Allocate as LUCA
                </Button>
              </div>
            )}
          {persona.role === "ops" &&
            !receipts.some((x) => x.matched && !x.supersededBy) &&
            receipts.length === 0 && (
              <div className="live-action">
                <label>
                  Fictional receipt amount{" "}
                  <input
                    type="number"
                    min="0"
                    value={receipt || s.amount}
                    onChange={(e) => setReceipt(e.target.value)}
                  />
                </label>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void send({
                      type: "receipt",
                      id: s.id,
                      amount: Number(receipt || s.amount),
                      currency: s.currency,
                      text: `LIVE-DEMO-${s.id}`,
                    })
                  }
                >
                  Record cash as Ops
                </Button>
              </div>
            )}
          {persona.role === "ops" && allocation?.principal && !s.holdingId && (
            <Button disabled={busy} onClick={() => void send({ type: "issue", id: s.id })}>
              Issue holding as Ops
            </Button>
          )}
          {persona.role === "ops" &&
            returns
              .filter((x) => x.status === "required" || x.status === "failed")
              .map((r) => (
                <Button
                  key={r.id}
                  disabled={busy}
                  onClick={() =>
                    void send({ type: "return", id: s.id, target: r.id, status: "processing" })
                  }
                >
                  Process {money(r.amount)} return
                </Button>
              ))}
          {persona.role === "ops" &&
            returns
              .filter((x) => x.status === "processing")
              .map((r) => (
                <Button
                  key={r.id}
                  disabled={busy}
                  onClick={() =>
                    void send({ type: "return", id: s.id, target: r.id, status: "confirmed" })
                  }
                >
                  Confirm {money(r.amount)} return
                </Button>
              ))}
          {persona.role === "investor" && (
            <div className="live-action">
              <label>
                Ask about this investment{" "}
                <input
                  value={caseText}
                  onChange={(e) => setCaseText(e.target.value)}
                  placeholder="Add a question to the shared case record"
                />
              </label>
              <Button
                disabled={busy || !caseText.trim()}
                onClick={() =>
                  void send({ type: "case", target: persona.id, id: s.id, text: caseText })
                }
              >
                Create shared case
              </Button>
            </div>
          )}
          {persona.role === "eam" && s.status === "institution_review" && (
            <Button
              disabled={busy}
              onClick={() => void send({ type: "institution-review", id: s.id })}
            >
              Complete institution review
            </Button>
          )}
          {error && (
            <p className="wf-error" role="alert">
              {error}
            </p>
          )}
          <p className="live-refresh">
            This pane refreshes from the same browser-local records every second.{" "}
            {counterpart?.subscriptions.some((x) => x.id === s.id)
              ? "The other pane is in this record’s visibility scope."
              : "The other persona has a different record scope."}
          </p>
        </>
      ) : (
        <p>
          {q.isLoading
            ? "Loading shared records…"
            : "This investment is not in this persona’s access scope. Choose an overlapping record above."}
        </p>
      )}
      <label className="wf-field live-select">
        This persona can view
        <select value={persona.id} onChange={(e) => changed("persona", Number(e.target.value))}>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      {investments.length > 0 && (
        <label className="wf-field live-select">
          Shared investment
          <select
            value={investmentId}
            onChange={(e) => changed("investment", Number(e.target.value))}
          >
            {investments.map((x) => (
              <option value={x.id} key={x.id}>
                #{x.id} · {x.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}

export default function LiveComparePage() {
  const [leftId, setLeftId] = useState(2),
    [rightId, setRightId] = useState(1),
    [investmentId, setInvestmentId] = useState(6),
    [revision, setRevision] = useState(0);
  const left = personas.find((x) => x.id === leftId)!,
    right = personas.find((x) => x.id === rightId)!;
  const leftData = useQuery({
    queryKey: ["live-compare", left.id],
    queryFn: () => apiAsDemo<WorkflowView>(left.id, "/api/v1/workflows"),
    refetchInterval: 1200,
  });
  const rightData = useQuery({
    queryKey: ["live-compare", right.id],
    queryFn: () => apiAsDemo<WorkflowView>(right.id, "/api/v1/workflows"),
    refetchInterval: 1200,
  });
  const shared = useMemo(() => {
    const a = leftData.data?.subscriptions ?? [],
      b = new Map((rightData.data?.subscriptions ?? []).map((s) => [s.id, s]));
    return a
      .filter((s) => b.has(s.id))
      .map((s) => ({ id: s.id, name: `${s.investor_name} · ${s.asset_name}` }));
  }, [leftData.data, rightData.data, revision]);
  const investment = shared.find((x) => x.id === investmentId) ?? shared[0];
  if (!isMocking)
    return (
      <main className="wf-main">
        <p>The live comparison is available in the fictional demo.</p>
      </main>
    );
  return (
    <div className="live-compare-wrap">
      <header className="live-top">
        <div>
          <p className="wf-eyebrow">SIMULATION CONTROL ROOM</p>
          <h1>Watch one record cross roles</h1>
          <p>
            Choose two demo personas. Actions taken in either pane update the shared record for both
            sides.
          </p>
        </div>
        <div className="live-tools">
          <Link to="/workflows">Connected records →</Link>
          <DemoResetButton compact />
        </div>
      </header>
      <div className="live-banner">
        DEMO PERSONA VIEW · These selectors represent fictional demo identities. Every action
        remains simulated and browser-local.
      </div>
      <div className="live-split">
        <RolePane
          key={`${left.id}-${investment?.id ?? 0}`}
          persona={left}
          counterpart={rightData.data}
          investmentId={investment?.id ?? investmentId}
          investments={shared}
          changed={(kind, id) => {
            if (kind === "persona") setLeftId(id);
            else setInvestmentId(id);
            setRevision((x) => x + 1);
          }}
        />
        <RolePane
          key={`${right.id}-${investment?.id ?? 0}`}
          persona={right}
          counterpart={leftData.data}
          investmentId={investment?.id ?? investmentId}
          investments={shared}
          changed={(kind, id) => {
            if (kind === "persona") setRightId(id);
            else setInvestmentId(id);
            setRevision((x) => x + 1);
          }}
        />
      </div>
    </div>
  );
}
