import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/currency";
import type { WorkflowView } from "@/lib/workflow-types";

/** Only the already authorized client book enters this view. */
export default function PartnerBook({
  data,
  onClients,
}: {
  data: WorkflowView;
  onClients?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const firms = [
    ...new Set(data.clients.map((c) => c.eamFirm).filter((x): x is string => !!x)),
  ].sort();
  const rows = firms
    .map((name) => {
      const clients = data.clients.filter((c) => c.eamFirm === name);
      const ids = new Set(clients.map((c) => c.id));
      const investments = data.subscriptions.filter((s) => ids.has(s.investor_id));
      const holdings = data.holdings.filter((h) => ids.has(h.investor_id));
      const open = investments.filter(
        (s) =>
          !s.holdingId &&
          !["cancelled", "rejected", "not_allocated", "funds_returned"].includes(s.status),
      );
      return {
        name,
        clients,
        open,
        invested: holdings.reduce((sum, h) => sum + Number(h.committed_amount), 0),
        attention: open.filter((s) =>
          [
            "institution_review",
            "information_requested",
            "documents_pending",
            "awaiting_funds",
          ].includes(s.status),
        ),
      };
    })
    .filter((r) =>
      `${r.name} ${r.clients.map((c) => c.name).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Partner client book</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          See the adviser firms in your client book, their investments and the next client action.
          Figures cover the clients you can access.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-6 border-y py-5">
        {[
          ["Partner firms", firms.length],
          ["Linked clients", data.clients.filter((c) => c.eamFirm).length],
          ["Active applications", rows.reduce((n, r) => n + r.open.length, 0)],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <Input
        aria-label="Search partner firms or clients"
        placeholder="Search a firm or client"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />
      <div className="divide-y border-b">
        {rows.map((row) => (
          <section key={row.name} className="py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold">{row.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {row.clients.length} linked clients · {row.open.length} active applications
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExpanded(expanded === row.name ? null : row.name)}
              >
                {expanded === row.name ? "Hide clients" : "View clients"}
              </Button>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Recorded investment cost</p>
                <p className="mt-1 font-medium">{formatPrice(row.invested)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Next actions</p>
                <p className="mt-1 text-sm">
                  {row.attention.length
                    ? `${row.attention.length} applications awaiting client or institution action`
                    : "No client action outstanding"}
                </p>
              </div>
            </div>
            {expanded === row.name && (
              <div className="mt-5 divide-y border-t">
                {row.clients.map((client) => (
                  <div
                    key={client.id}
                    className="flex flex-wrap justify-between gap-2 py-3 text-sm"
                  >
                    <span>
                      {client.name}
                      <small className="ml-2 text-muted-foreground">{client.code}</small>
                    </span>
                    <span className="text-muted-foreground">
                      {data.subscriptions
                        .filter((s) => s.investor_id === client.id && !s.holdingId)
                        .map((s) => `${s.asset_name}: ${s.status.replaceAll("_", " ")}`)
                        .join(" · ") || "No unissued application"}
                    </span>
                  </div>
                ))}
                {onClients && (
                  <Button variant="ghost" size="sm" onClick={onClients}>
                    Open client follow ups →
                  </Button>
                )}
              </div>
            )}
          </section>
        ))}
        {!rows.length && (
          <p className="py-6 text-sm text-muted-foreground">
            No partner firms in this client scope.
          </p>
        )}
      </div>
    </div>
  );
}
