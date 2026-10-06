import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { SearchIcon } from "lucide-react";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/currency";
import { stageOfStatus } from "@/lib/types";
import type {
  DocumentRequestRow,
  InvestorsResponse,
  PartnersResponse,
  SubscriptionsResponse,
} from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SummaryFigure } from "../summary-figure";

const DAY = 24 * 60 * 60 * 1000;
const EXPIRY_DAYS = 60;

/** Partners: which advisers bring volume, what we owe them, and who is holding things up. */
export default function AdminPartnersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "partners", ""],
    queryFn: () => api<PartnersResponse>("/api/v1/admin/partners"),
  });
  const { data: investorsData } = useQuery({
    queryKey: ["admin", "investors", "all"],
    queryFn: () => api<InvestorsResponse>("/api/v1/admin/investors"),
  });
  const { data: subsData } = useQuery({
    queryKey: ["admin", "subscriptions", "board"],
    queryFn: () => api<SubscriptionsResponse>("/api/v1/admin/subscriptions"),
  });
  const { data: requestsData } = useQuery({
    queryKey: ["admin", "document-requests"],
    queryFn: () => api<{ requests: DocumentRequestRow[] }>("/api/v1/admin/document_requests"),
  });

  const rows = useMemo(() => {
    const investors = investorsData?.investors ?? [];
    const subs = subsData?.subscriptions ?? [];
    const requests = (requestsData?.requests ?? []).filter((r) => r.status === "requested");
    return (data?.partners ?? [])
      .filter(
        (p) => !search.trim() || p.firm_name.toLowerCase().includes(search.trim().toLowerCase()),
      )
      .map((partner) => {
        const clients = investors.filter((i) => i.eam_firm === partner.firm_name);
        const clientIds = new Set(clients.map((c) => c.id));
        const firmSubs = subs.filter((s) => s.eam_firm === partner.firm_name);
        const open = firmSubs.filter((s) => !s.holding_id && stageOfStatus(s.status) !== undefined);
        const waitingOnAdviser = open.filter((s) => s.owner === "eam");
        const now = Date.now();
        return {
          partner,
          clients,
          pipeline: open.reduce((n, s) => n + parseFloat(s.amount), 0),
          openCount: open.length,
          attention: [
            waitingOnAdviser.length > 0 && {
              key: "adviser",
              text: `${waitingOnAdviser.length} waiting on adviser`,
              to: `/luca/subscriptions?q=${encodeURIComponent(partner.firm_name)}&stage=approval`,
            },
            clients.filter((c) => ["pending", "in_review"].includes(c.verification_status)).length >
              0 && {
              key: "onboarding",
              text: `${clients.filter((c) => ["pending", "in_review"].includes(c.verification_status)).length} onboarding`,
              to: `/luca/onboarding`,
            },
            clients.filter(
              (c) =>
                c.accreditation_expiry &&
                new Date(c.accreditation_expiry).getTime() - now <= EXPIRY_DAYS * DAY,
            ).length > 0 && {
              key: "expiring",
              text: `${
                clients.filter(
                  (c) =>
                    c.accreditation_expiry &&
                    new Date(c.accreditation_expiry).getTime() - now <= EXPIRY_DAYS * DAY,
                ).length
              } accreditation expiring`,
              to: `/luca/compliance?tab=expiring`,
            },
            requests.filter(
              (r) => clientIds.has(r.investor_id) && r.due_at && new Date(r.due_at).getTime() < now,
            ).length > 0 && {
              key: "overdue",
              text: `${
                requests.filter(
                  (r) =>
                    clientIds.has(r.investor_id) && r.due_at && new Date(r.due_at).getTime() < now,
                ).length
              } overdue documents`,
              to: `/luca/compliance?tab=requests`,
            },
          ].filter((x): x is { key: string; text: string; to: string } => Boolean(x)),
        };
      })
      .sort(
        (a, b) => parseFloat(b.partner.allocated_volume) - parseFloat(a.partner.allocated_volume),
      );
  }, [data, investorsData, subsData, requestsData, search]);

  const all = data?.partners ?? [];
  const totalAllocated = all.reduce((n, p) => n + parseFloat(p.allocated_volume), 0);

  return (
    <div className="w-full space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Partners</h1>
        <p className="text-muted-foreground">
          Adviser firms that bring clients to the platform: how much they bring, what we owe them,
          and what needs chasing.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-4 border-y py-5 sm:grid-cols-4">
        <SummaryFigure label="Partner firms" value={String(data?.summary.total ?? 0)} />
        <SummaryFigure
          label="Clients under advice"
          value={String(data?.summary.total_clients ?? 0)}
        />
        <SummaryFigure label="Allocated through partners" value={formatPrice(totalAllocated)} />
        <SummaryFigure
          label="Revenue share owed"
          value={formatPrice(data?.summary.accrued_revenue ?? 0)}
        />
      </div>

      <div className="relative max-w-sm">
        <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search partner firms"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <p className="py-12 text-center text-muted-foreground">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="border-y py-12 text-center text-sm text-muted-foreground">
          No partners found.
        </p>
      ) : (
        <div>
          <div className="hidden grid-cols-[minmax(0,2fr)_6.5rem_8rem_8rem_8rem_minmax(0,2fr)_10rem] gap-x-4 border-b pb-2 text-xs text-muted-foreground xl:grid">
            <span>Firm</span>
            <span className="text-right">Clients</span>
            <span className="text-right">In progress</span>
            <span className="text-right">Allocated</span>
            <span className="text-right">Owed</span>
            <span>Needs attention</span>
            <span />
          </div>
          <ul className="divide-y border-b">
            {rows.map(({ partner, clients, pipeline, openCount, attention }) => (
              <li
                key={partner.id}
                className="grid grid-cols-2 items-center gap-x-4 gap-y-2 py-4 hover:bg-muted/40 xl:grid-cols-[minmax(0,2fr)_6.5rem_8rem_8rem_8rem_minmax(0,2fr)_10rem] xl:py-3.5"
              >
                <span className="col-span-2 min-w-0 xl:col-span-1">
                  <Link
                    to={`/luca/partners/${partner.id}`}
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {partner.firm_name}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">
                    {partner.display_name} · {partner.contact_email}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Client fee {partner.client_subscription_fee_pct ?? "—"}% · revenue share{" "}
                    {partner.eam_revenue_share_pct ?? "—"}%
                  </span>
                </span>
                <Metric
                  label="Clients"
                  value={`${partner.verified_client_count}/${partner.client_count} verified`}
                  sub={clients.length ? undefined : "No clients yet"}
                />
                <Metric
                  label="In progress"
                  value={openCount ? formatPrice(pipeline) : "—"}
                  sub={
                    openCount ? `${openCount} subscription${openCount === 1 ? "" : "s"}` : undefined
                  }
                />
                <Metric
                  label="Allocated"
                  value={
                    parseFloat(partner.allocated_volume)
                      ? formatPrice(partner.allocated_volume)
                      : "—"
                  }
                />
                <Metric
                  label="Owed"
                  value={
                    parseFloat(partner.accrued_revenue) ? formatPrice(partner.accrued_revenue) : "—"
                  }
                />
                <span className="col-span-2 flex flex-wrap gap-1.5 xl:col-span-1">
                  {attention.length === 0 ? (
                    <span className="text-xs text-muted-foreground">Nothing outstanding</span>
                  ) : (
                    attention.map((a) => (
                      <Link
                        key={a.key}
                        to={a.to}
                        className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 hover:underline"
                      >
                        {a.text}
                      </Link>
                    ))
                  )}
                </span>
                <span className="col-span-2 flex justify-end gap-2 xl:col-span-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      navigate(
                        `/luca/communications/new?audience=partner:${encodeURIComponent(partner.firm_name)}`,
                      )
                    }
                  >
                    Message
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => navigate(`/luca/partners/${partner.id}`)}
                  >
                    View
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <span className="text-sm xl:text-right">
      <span className="block text-xs text-muted-foreground xl:hidden">{label}</span>
      <span className="block font-medium tabular-nums">{value}</span>
      {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
    </span>
  );
}
