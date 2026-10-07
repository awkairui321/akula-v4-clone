import { Children, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRightIcon } from "lucide-react";
import { documentKindLabel, DEAL_MATERIAL_KINDS } from "@/lib/document-catalogue";
import type { Version } from "@/lib/workflow-types";
import type { AdminDocument, AdminInvestor, DocumentRequestRow } from "./types";
import { Button } from "@/components/ui/button";
import {
  EXPIRY_WINDOW_DAYS,
  daysBetween,
  dueLabel,
  formatDate,
  requestLink,
} from "./compliance-helpers";

type Signature = { subscriptionId: number; versionId: number; at: string };
type SubscriptionRef = { id: number; investor_id: number; asset_name: string; fund_id: number };

export type ClientActions = {
  approve: (id: number) => void;
  hold: (id: number) => void;
  release: (id: number) => void;
  remind: (id: number) => void;
  withdraw: (id: number) => void;
};

type Filter = "all" | "attention" | "requested" | "expiring";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All clients" },
  { key: "attention", label: "Needs attention" },
  { key: "requested", label: "Waiting on client" },
  { key: "expiring", label: "Expiring" },
];

const STATE_LABEL: Record<string, string> = {
  received: "Received",
  reviewing: "Reviewing",
  on_hold: "On hold",
  filed: "Filed",
};

/** Where a client stands on verification and accreditation, in one line. */
function complianceChip(i: AdminInvestor): { text: string; tone: "ok" | "warn" | "bad" | "wait" } {
  if (i.verification_status === "rejected") return { text: "Rejected", tone: "bad" };
  if (i.verification_status !== "approved") return { text: "Awaiting LUCA review", tone: "wait" };
  if (i.accreditation_status === "not_accredited")
    return { text: "Accreditation lapsed", tone: "warn" };
  if (i.accreditation_expiry) {
    const days = daysBetween(Date.now(), new Date(i.accreditation_expiry).getTime());
    if (days <= 0) return { text: "Accreditation expired", tone: "warn" };
    return {
      text: `Verified · accreditation expires in ${days}d`,
      tone: days <= 30 ? "warn" : "ok",
    };
  }
  return { text: "Verified", tone: "ok" };
}

const TONE: Record<string, string> = {
  ok: "text-green-700",
  warn: "text-amber-700",
  bad: "text-destructive",
  wait: "text-blue-700",
};

/** Every client in one list; open one to see all of their documents in one place. */
export default function ComplianceClients({
  investors,
  docs,
  requests,
  signatures,
  subscriptions,
  versions,
  search,
  focusId,
  actions,
}: {
  investors: AdminInvestor[];
  docs: AdminDocument[];
  requests: DocumentRequestRow[];
  signatures: Signature[];
  subscriptions: SubscriptionRef[];
  versions: Version[];
  search: string;
  focusId?: number;
  actions: ClientActions;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Set<number>>(new Set(focusId ? [focusId] : []));
  const focusRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (focusId) focusRef.current?.scrollIntoView({ block: "center" });
  }, [focusId, investors.length]);

  const rows = useMemo(
    () =>
      investors.map((investor) => {
        const own = docs.filter(
          (d) => d.owner_id === investor.id && !DEAL_MATERIAL_KINDS.includes(d.kind),
        );
        const statements = own.filter((d) => d.kind === "statement");
        const offering = own.filter(
          (d) =>
            d.kind !== "statement" &&
            (d.kind === "agreement" || d.fund_id !== null || d.subscription_id !== null),
        );
        const identity = own.filter((d) => !statements.includes(d) && !offering.includes(d));
        const signed = signatures
          .map((sig) => ({ sig, sub: subscriptions.find((s) => s.id === sig.subscriptionId) }))
          .filter((x) => x.sub?.investor_id === investor.id)
          .map(({ sig, sub }) => ({
            key: `${sig.subscriptionId}-${sig.versionId}`,
            fundId: sub!.fund_id,
            fundName:
              versions.find((v) => v.id === sig.versionId)?.snapshot.name ?? sub!.asset_name,
            text: `${sub!.asset_name} offering, version ${versions.find((v) => v.id === sig.versionId)?.number ?? "?"}`,
            at: sig.at,
          }));
        const asked = requests.filter(
          (r) => r.investor_id === investor.id && r.status === "requested",
        );
        const toReview = own.filter((d) => d.review_state !== "filed").length;
        const days = investor.accreditation_expiry
          ? daysBetween(Date.now(), new Date(investor.accreditation_expiry).getTime())
          : null;
        const expiring =
          (days !== null && days <= EXPIRY_WINDOW_DAYS) ||
          (investor.verification_status === "approved" &&
            investor.accreditation_status === "not_accredited");
        return {
          investor,
          identity,
          offering,
          statements,
          signed,
          asked,
          toReview,
          expiring,
          total: own.length,
        };
      }),
    [investors, docs, requests, signatures, subscriptions, versions],
  );

  const q = search.trim().toLowerCase();
  const visible = rows
    .filter(
      (r) =>
        !q ||
        `${r.investor.full_name} ${r.investor.reference ?? ""} ${r.investor.client_code} ${r.investor.eam_firm ?? ""}`
          .toLowerCase()
          .includes(q),
    )
    .filter((r) =>
      filter === "all"
        ? true
        : filter === "requested"
          ? r.asked.length > 0
          : filter === "expiring"
            ? r.expiring
            : r.toReview > 0 || r.asked.length > 0 || r.expiring,
    )
    .sort(
      (a, b) =>
        b.toReview +
          b.asked.length +
          Number(b.expiring) -
          (a.toReview + a.asked.length + Number(a.expiring)) ||
        a.investor.full_name.localeCompare(b.investor.full_name),
    );

  const toggle = (id: number) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? "secondary" : "outline"}
            className="rounded-full"
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="border-y py-12 text-center text-sm text-muted-foreground">
          No clients match.
        </p>
      ) : (
        <div>
          <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,2.2fr)_9rem] gap-x-4 border-b pb-2 pl-6 text-xs text-muted-foreground lg:grid">
            <span>Client</span>
            <span>Compliance</span>
            <span className="text-right">Documents</span>
          </div>
          <ul className="divide-y border-b">
            {visible.map((r) => {
              const { investor } = r;
              const chip = complianceChip(investor);
              const isOpen = open.has(investor.id);
              return (
                <li key={investor.id} ref={investor.id === focusId ? focusRef : undefined}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => toggle(investor.id)}
                    className="grid w-full grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-3 text-left hover:bg-muted/40 lg:grid-cols-[1.25rem_minmax(0,2fr)_minmax(0,2.2fr)_9rem]"
                  >
                    <ChevronRightIcon
                      className={`size-4 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {investor.full_name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {investor.client_code} · {investor.eam_firm ?? "Direct"}
                      </span>
                    </span>
                    <span
                      className={`order-3 col-span-3 truncate pl-7 text-sm lg:order-none lg:col-span-1 lg:pl-0 ${TONE[chip.tone]}`}
                    >
                      {chip.text}
                    </span>
                    <span className="text-right text-sm tabular-nums">
                      {r.total}
                      <span className="block text-xs text-muted-foreground">
                        {[
                          r.toReview ? `${r.toReview} to review` : "",
                          r.asked.length ? `${r.asked.length} requested` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ") || "all filed"}
                      </span>
                    </span>
                  </button>

                  {isOpen && (
                    <div className="space-y-5 pb-5 pl-7">
                      <Group
                        title="Account and identity documents"
                        empty="No account documents on file."
                      >
                        {r.identity.map((d) => (
                          <DocRow key={d.id} doc={d} actions={actions} />
                        ))}
                        {r.asked
                          .filter((req) => !req.fund_id)
                          .map((req) => (
                            <RequestRow key={req.id} req={req} actions={actions} />
                          ))}
                      </Group>
                      {[
                        ...new Set(
                          [
                            ...r.offering.map((d) => d.fund_id),
                            ...r.statements.map((d) => d.fund_id),
                            ...r.signed.map((s) => s.fundId),
                            ...r.asked.map((req) => req.fund_id),
                          ].filter((id): id is number => id != null),
                        ),
                      ].map((fundId) => {
                        const fundDocs = [...r.offering, ...r.statements].filter(
                          (d) => d.fund_id === fundId,
                        );
                        const fundSignatures = r.signed.filter((s) => s.fundId === fundId);
                        const fundRequests = r.asked.filter((req) => req.fund_id === fundId);
                        const fundName =
                          fundDocs[0]?.fund_name ??
                          fundRequests[0]?.fund_name ??
                          fundSignatures[0]?.fundName ??
                          "Fund #" + fundId;
                        return (
                          <Group key={fundId} title={fundName} empty="No documents.">
                            {fundDocs.map((d) => (
                              <DocRow key={d.id} doc={d} actions={actions} />
                            ))}
                            {fundSignatures.map((s) => (
                              <li key={s.key}>
                                <details className="py-2 text-sm">
                                  <summary className="cursor-pointer">
                                    Signed subscription · {s.text}
                                  </summary>
                                  <p className="py-3 pl-4 text-muted-foreground">
                                    Signed {formatDate(s.at)} · Exact offering version retained
                                  </p>
                                </details>
                              </li>
                            ))}
                            {fundRequests.map((req) => (
                              <RequestRow key={req.id} req={req} actions={actions} />
                            ))}
                          </Group>
                        );
                      })}
                      {[...r.offering, ...r.statements].filter((d) => d.fund_id === null).length >
                        0 && (
                        <Group title="Other subscription documents" empty="">
                          {r.offering
                            .filter((d) => d.fund_id === null)
                            .map((d) => (
                              <DocRow key={d.id} doc={d} actions={actions} />
                            ))}
                        </Group>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          nativeButton={false}
                          render={<Link to={requestLink(investor.id, "")} />}
                        >
                          Request documents
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          nativeButton={false}
                          render={<Link to={`/luca/investors/${investor.id}`} />}
                        >
                          Open client record
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function Group({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const hasItems = Children.toArray(children).length > 0;
  return (
    <details className="border-t py-2">
      <summary className="cursor-pointer text-sm font-medium">{title}</summary>
      <div className="mt-2 pl-4">
        {hasItems ? (
          <ul className="divide-y border-y">{children}</ul>
        ) : (
          <p className="text-sm text-muted-foreground">{empty}</p>
        )}
      </div>
    </details>
  );
}

export function DocRow({ doc, actions }: { doc: AdminDocument; actions: ClientActions }) {
  return (
    <li>
      <details className="py-2 text-sm">
        <summary className="cursor-pointer font-medium">
          {doc.name}{" "}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {STATE_LABEL[doc.review_state] ?? doc.review_state} · {formatDate(doc.created_at)}
          </span>
        </summary>
        <div className="flex flex-wrap items-center justify-between gap-3 py-3 pl-4">
          <p className="text-xs text-muted-foreground">
            {documentKindLabel(doc.kind)} · {formatDate(doc.created_at)}
            {doc.uploaded_by?.role === "rm" &&
              ` · supplied by ${doc.uploaded_by.name}, ${doc.confirmed_at ? "confirmed by the client" : "awaiting client confirmation"}`}
          </p>
          {doc.review_state !== "filed" && (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => actions.approve(doc.id)}>
                Approve
              </Button>
              {doc.review_state === "on_hold" ? (
                <Button size="sm" variant="ghost" onClick={() => actions.release(doc.id)}>
                  Release hold
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => actions.hold(doc.id)}>
                  Hold
                </Button>
              )}
            </div>
          )}
        </div>
      </details>
    </li>
  );
}

export function RequestRow({ req, actions }: { req: DocumentRequestRow; actions: ClientActions }) {
  const due = dueLabel(req.due_at);
  return (
    <li>
      <details className="py-2 text-sm">
        <summary className="cursor-pointer">
          Requested · {documentKindLabel(req.kind)}{" "}
          <span className="ml-2 text-xs text-muted-foreground">{due.text}</span>
        </summary>
        <div className="flex flex-wrap items-center justify-between gap-3 py-3 pl-4">
          <p className="text-xs text-muted-foreground">
            Requested {formatDate(req.requested_at)}
            {req.note && ` · ${req.note}`}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => actions.remind(req.id)}>
              Remind
            </Button>
            <Button size="sm" variant="ghost" onClick={() => actions.withdraw(req.id)}>
              Withdraw
            </Button>
          </div>
        </div>
      </details>
    </li>
  );
}
