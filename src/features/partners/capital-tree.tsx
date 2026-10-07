import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRightIcon } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { STATUS_LABELS } from "@/lib/types";
import type { SubscriptionStatus } from "@/lib/types";
import type { Capital, ClientLine, FundLine, ProjectLine } from "./partner-data";

export const COLUMNS =
  "grid grid-cols-[minmax(0,2.4fr)_repeat(3,minmax(5.5rem,1fr))] items-center gap-x-4 max-md:grid-cols-[minmax(0,1fr)_minmax(5.5rem,auto)]";
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
function Holdings({ client, depth, href }: { client: ClientLine; depth: number; href?: string }) {
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
      {href && (
        <p>
          <Link to={href} className="text-foreground underline underline-offset-2">
            Open client record
          </Link>
        </p>
      )}
    </div>
  );
}

export function ClientRows({
  clients,
  depth,
  open,
  toggle,
  keyPrefix,
  clientHref,
}: {
  clientHref?: (id: number) => string;
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
            {open.has(key) && <Holdings client={c} depth={depth} href={clientHref?.(c.id)} />}
          </div>
        );
      })}
    </>
  );
}

export function ByProject({
  projects,
  open,
  toggle,
  clientHref,
}: {
  clientHref?: (id: number) => string;
  projects: ProjectLine[];
  open: Set<string>;
  toggle: (k: string) => void;
}) {
  return (
    <>
      {projects.map((project) => {
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
                        clientHref={clientHref}
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

/** Open/closed state for a tree of rows, keyed by row. */
export function useOpenSet() {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  return { open, toggle };
}

/** Column headings for the capital tree. */
export function CapitalHeader({ first }: { first: string }) {
  return (
    <div className={`${COLUMNS} py-2 text-xs text-muted-foreground`}>
      <span>{first}</span>
      <span className="text-right">Committed</span>
      <span className="text-right max-md:hidden">Funded</span>
      <span className="text-right max-md:hidden">Allocated</span>
    </div>
  );
}
