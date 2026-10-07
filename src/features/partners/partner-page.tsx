import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeftIcon, ChevronRightIcon } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { STATUS_LABELS } from "@/lib/types";
import type { SubscriptionStatus } from "@/lib/types";
import { usePartnerBook } from "./use-partner-book";
import type { Capital, ClientLine, FundLine, PartnerLine } from "./partner-data";

const COLUMNS =
  "grid grid-cols-[minmax(0,2.4fr)_repeat(3,minmax(5.5rem,1fr))] items-center gap-x-4 max-md:grid-cols-[minmax(0,1fr)_minmax(5.5rem,auto)]";
const SECTION_LABEL = "text-xs font-medium tracking-wide text-muted-foreground uppercase";
const dateText = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "no report";

function Figures({ c, muted }: { c: Capital; muted?: boolean }) {
  const cls = `text-right tabular-nums ${muted ? "text-muted-foreground" : ""}`;
  return (
    <>
      <span className={cls}>{formatPrice(c.committed)}</span>
      <span className={`${cls} max-md:hidden`}>{formatPrice(c.funded)}</span>
      <span className={`${cls} max-md:hidden`}>{formatPrice(c.allocated)}</span>
    </>
  );
}

function Row({
  depth,
  open,
  onToggle,
  title,
  note,
  figures,
  strong,
}: {
  depth: number;
  open?: boolean;
  onToggle?: () => void;
  title: string;
  note?: string;
  figures: Capital;
  strong?: boolean;
}) {
  return (
    <div
      role={onToggle ? "button" : undefined}
      tabIndex={onToggle ? 0 : undefined}
      aria-expanded={onToggle ? open : undefined}
      onClick={onToggle}
      onKeyDown={(e) => onToggle && (e.key === "Enter" || e.key === " ") && onToggle()}
      className={`${COLUMNS} py-2.5 text-sm ${onToggle ? "cursor-pointer hover:bg-muted/40" : ""}`}
      style={{ paddingLeft: `${depth * 1.5}rem` }}
    >
      <span className="flex min-w-0 items-center gap-2">
        {onToggle ? (
          <ChevronRightIcon
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
          />
        ) : (
          <span className="size-4 shrink-0" />
        )}
        <span className="min-w-0">
          <span className={`block truncate ${strong ? "font-semibold" : "font-medium"}`}>
            {title}
          </span>
          {note && <span className="block truncate text-xs text-muted-foreground">{note}</span>}
        </span>
      </span>
      <Figures c={figures} muted={!strong && depth > 1} />
    </div>
  );
}

/** A client's holdings in a fund, or where their application stands if nothing is issued yet. */
function Holdings({ client, depth }: { client: ClientLine; depth: number }) {
  return (
    <div
      className="space-y-1 pb-2 text-xs text-muted-foreground"
      style={{ paddingLeft: `${depth * 1.5 + 1.5}rem` }}
    >
      {client.holdings.map((h) => (
        <p key={h.id} className="flex flex-wrap justify-between gap-x-4">
          <span>
            Holding #{h.id} · {Number(h.units).toLocaleString("en-GB")} units · cost{" "}
            {formatPrice(h.cost)}
          </span>
          <span className="tabular-nums">
            reported value {formatPrice(h.value)} ({dateText(h.valueAt)})
          </span>
        </p>
      ))}
      {client.applications.map((a) => (
        <p key={a.id} className="flex flex-wrap justify-between gap-x-4">
          <span>
            Application #{a.id} ·{" "}
            {STATUS_LABELS[a.status as SubscriptionStatus] ?? a.status.replaceAll("_", " ")}
          </span>
          <span className="tabular-nums">{formatPrice(a.amount)}</span>
        </p>
      ))}
      {!client.holdings.length && !client.applications.length && <p>Nothing held or pending.</p>}
    </div>
  );
}

function ClientRows({
  clients,
  depth,
  open,
  toggle,
  keyPrefix,
}: {
  clients: ClientLine[];
  depth: number;
  open: Set<string>;
  toggle: (key: string) => void;
  keyPrefix: string;
}) {
  return (
    <>
      {clients.map((c) => {
        const key = `${keyPrefix}-c${c.id}`;
        return (
          <div key={key}>
            <Row
              depth={depth}
              open={open.has(key)}
              onToggle={() => toggle(key)}
              title={c.name}
              note={`${c.code}${c.needsAction ? ` · ${c.needsAction} waiting on the client` : ""}`}
              figures={c}
            />
            {open.has(key) && <Holdings client={c} depth={depth} />}
          </div>
        );
      })}
    </>
  );
}

function ByProject({
  partner,
  open,
  toggle,
}: {
  partner: PartnerLine;
  open: Set<string>;
  toggle: (k: string) => void;
}) {
  return (
    <>
      {partner.projects.map((project) => {
        const pkey = `p${project.key}`;
        return (
          <div key={pkey} className="border-b last:border-b-0">
            <Row
              depth={0}
              strong
              open={open.has(pkey)}
              onToggle={() => toggle(pkey)}
              title={project.codename}
              note={`${project.company} · ${project.funds.length} fund${project.funds.length === 1 ? "" : "s"}`}
              figures={project}
            />
            {open.has(pkey) &&
              project.funds.map((fund: FundLine) => {
                const fkey = `${pkey}-f${fund.fundId}`;
                return (
                  <div key={fkey}>
                    <Row
                      depth={1}
                      open={open.has(fkey)}
                      onToggle={() => toggle(fkey)}
                      title={fund.label}
                      note={`${fund.clients.length} client${fund.clients.length === 1 ? "" : "s"}`}
                      figures={fund}
                    />
                    {open.has(fkey) && (
                      <ClientRows
                        clients={fund.clients}
                        depth={2}
                        open={open}
                        toggle={toggle}
                        keyPrefix={fkey}
                      />
                    )}
                  </div>
                );
              })}
          </div>
        );
      })}
    </>
  );
}

function ByClient({
  partner,
  open,
  toggle,
}: {
  partner: PartnerLine;
  open: Set<string>;
  toggle: (k: string) => void;
}) {
  return (
    <ClientRows clients={partner.clients} depth={0} open={open} toggle={toggle} keyPrefix="all" />
  );
}

/** One partner firm: what it raised, by project and fund, then by client and holding. */
export default function PartnerPage() {
  const { firm: encoded } = useParams<{ firm: string }>();
  const firm = decodeURIComponent(encoded ?? "");
  const { book, base, manager, termsFor, isLoading } = usePartnerBook();
  const [view, setView] = useState<"project" | "client">("project");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  if (isLoading || !book)
    return <p className="py-12 text-center text-muted-foreground">Loading partner...</p>;
  const partner = book.partners.find((p) => p.firm === firm);
  if (!partner)
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-muted-foreground">This partner is not in your client book.</p>
        <Link to={`${base}/partners`} className="text-sm underline">
          Partner client book
        </Link>
      </div>
    );
  const terms = manager ? termsFor(firm) : undefined;

  return (
    <div className="flex flex-col gap-8">
      <div className="space-y-6">
        <Link
          to={`${base}/partners`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Partner client book
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{partner.firm}</h1>
          <p className="mt-1 text-muted-foreground">
            {partner.clientCount} client{partner.clientCount === 1 ? "" : "s"} ·{" "}
            {partner.projects.length} project{partner.projects.length === 1 ? "" : "s"} ·{" "}
            {partner.activeApplications} active application
            {partner.activeApplications === 1 ? "" : "s"}
            {terms && ` · ${terms.display_name}, ${terms.contact_email}`}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 border-y py-5 lg:grid-cols-4">
          {(
            [
              ["Committed", formatPrice(partner.committed), "Subscribed and still live"],
              ["Funded", formatPrice(partner.funded), "Cash received, fees excluded"],
              ["Allocated", formatPrice(partner.allocated), "Allocated by LUCA"],
              manager
                ? [
                    "Revenue share",
                    terms?.eam_revenue_share_pct ? `${terms.eam_revenue_share_pct}%` : "—",
                    terms
                      ? `${formatPrice(terms.accrued_revenue)} accrued · ${formatPrice(terms.paid_revenue)} paid`
                      : "",
                  ]
                : [
                    "Waiting on a client",
                    String(partner.needsAction),
                    "Applications needing client action",
                  ],
            ] as const
          ).map(([label, value, note]) => (
            <div key={label}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{note}</p>
            </div>
          ))}
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className={SECTION_LABEL}>
            {view === "project" ? "Raised by project and fund" : "Raised by client"}
          </h2>
          <div className="flex items-center rounded-lg border bg-background p-0.5 text-sm">
            {(["project", "client"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1 ${view === v ? "bg-secondary font-medium" : "text-muted-foreground"}`}
              >
                {v === "project" ? "By project" : "By client"}
              </button>
            ))}
          </div>
        </div>
        <div className="border-y">
          <div className={`${COLUMNS} py-2 text-xs text-muted-foreground`}>
            <span>{view === "project" ? "Project, fund, client" : "Client"}</span>
            <span className="text-right">Committed</span>
            <span className="text-right max-md:hidden">Funded</span>
            <span className="text-right max-md:hidden">Allocated</span>
          </div>
          <div className="divide-y">
            {view === "project" ? (
              <ByProject partner={partner} open={open} toggle={toggle} />
            ) : (
              <div className="divide-y">
                <ByClient partner={partner} open={open} toggle={toggle} />
              </div>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Open a project to see its funds, a fund to see this partner&apos;s clients in it, and a
          client to see their holdings at cost and latest reported value. Only LUCA publishes
          valuations.
        </p>
      </section>
    </div>
  );
}
