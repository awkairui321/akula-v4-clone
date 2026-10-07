import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatPrice } from "@/lib/currency";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePartnerBook } from "./use-partner-book";

const pct = (part: number, whole: number) =>
  whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";

/** Every partner firm and how much capital comes through it. */
export default function PartnerBookPage() {
  const navigate = useNavigate();
  const { book, base, manager, termsFor, isLoading } = usePartnerBook();
  const [search, setSearch] = useState("");

  if (isLoading || !book)
    return <p className="py-12 text-center text-muted-foreground">Loading partner book...</p>;

  const q = search.trim().toLowerCase();
  const rows = book.partners.filter(
    (p) => !q || `${p.firm} ${p.clients.map((c) => c.name).join(" ")}`.toLowerCase().includes(q),
  );
  const via = book.partners.reduce(
    (t, p) => ({
      committed: t.committed + p.committed,
      funded: t.funded + p.funded,
      allocated: t.allocated + p.allocated,
    }),
    { committed: 0, funded: 0, allocated: 0 },
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Partner client book</h1>
        <p className="mt-1 max-w-3xl text-muted-foreground">
          Adviser firms and the capital that comes through them.{" "}
          {manager ? "Covers every client." : "Covers the clients assigned to you."} Committed is
          subscribed and still live, funded is cash confirmed received for the investment (fees
          excluded), allocated is what LUCA has allocated.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-5 border-y py-5 lg:grid-cols-4">
        {(
          [
            [
              "Partner firms",
              String(book.partners.length),
              `${book.partners.reduce((n, p) => n + p.clientCount, 0)} linked clients`,
            ],
            [
              "Committed via partners",
              formatPrice(via.committed),
              `${pct(via.committed, via.committed + book.direct.committed)} of all committed`,
            ],
            ["Funded", formatPrice(via.funded), `${pct(via.funded, via.committed)} of committed`],
            [
              "Allocated",
              formatPrice(via.allocated),
              `${pct(via.allocated, via.funded)} of funded`,
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

      <div className="space-y-3">
        <Input
          aria-label="Search partner firms or clients"
          placeholder="Search a firm or client"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        {rows.length === 0 ? (
          <p className="border-y py-6 text-sm text-muted-foreground">
            No partner firms in this client scope.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partner</TableHead>
                <TableHead className="text-right">Clients</TableHead>
                <TableHead className="text-right">Committed</TableHead>
                <TableHead className="text-right">Funded</TableHead>
                <TableHead className="text-right">Allocated</TableHead>
                <TableHead className="text-right">Waiting on a client</TableHead>
                {manager && <TableHead className="text-right">Revenue share</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => {
                const terms = termsFor(p.firm);
                return (
                  <TableRow
                    key={p.firm}
                    className="cursor-pointer"
                    onClick={() => navigate(`${base}/partners/${encodeURIComponent(p.firm)}`)}
                  >
                    <TableCell>
                      <Link
                        to={`${base}/partners/${encodeURIComponent(p.firm)}`}
                        className="font-medium hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {p.firm}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {p.projects.length} project{p.projects.length === 1 ? "" : "s"} ·{" "}
                        {p.activeApplications} active application
                        {p.activeApplications === 1 ? "" : "s"}
                      </p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.clientCount}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPrice(p.committed)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPrice(p.funded)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPrice(p.allocated)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${p.needsAction ? "text-amber-700" : "text-muted-foreground"}`}
                    >
                      {p.needsAction || "None"}
                    </TableCell>
                    {manager && (
                      <TableCell className="text-right tabular-nums">
                        {terms?.eam_revenue_share_pct ? `${terms.eam_revenue_share_pct}%` : "—"}
                        {terms && (
                          <span className="block text-xs text-muted-foreground">
                            {formatPrice(terms.accrued_revenue)} accrued
                          </span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {book.direct.clientCount > 0 && (
          <p className="text-xs text-muted-foreground">
            For comparison, {book.direct.clientCount} direct client
            {book.direct.clientCount === 1 ? "" : "s"} (no partner) have committed{" "}
            {formatPrice(book.direct.committed)}.
          </p>
        )}
      </div>
    </div>
  );
}
