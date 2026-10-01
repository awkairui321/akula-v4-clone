import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/currency";
import { CLOSED_SUBSCRIPTION_STATUSES } from "@/lib/types";
import type { PartnersResponse } from "../types";
import type { SubscriptionsResponse } from "../types";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SearchIcon } from "lucide-react";

export default function AdminPartnersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const params = new URLSearchParams();
  if (search.trim()) params.set("q", search.trim());

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "partners", search],
    queryFn: () => api<PartnersResponse>(`/api/v1/admin/partners?${params}`),
  });

  const partners = data?.partners ?? [];
  const summary = data?.summary;

  return (
    <div className="w-full space-y-5">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Partners</h1>
        <p className="text-muted-foreground">
          EAM firms distributing on the platform, and the book of business behind each.
        </p>
      </div>

      {summary && (
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryTile label="Partner firms" value={String(summary.total)} />
          <SummaryTile label="Clients under advice" value={String(summary.total_clients)} />
          <SummaryTile label="Accrued revenue" value={formatPrice(summary.accrued_revenue)} />
        </div>
      )}

      <PartnerDistribution partners={partners} />

      <div className="relative mb-4">
        <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search partners by firm name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading && <p className="py-12 text-center text-muted-foreground">Loading...</p>}

      {!isLoading && partners.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">No partners yet.</p>
      )}

      {partners.length > 0 && (
        <div className="rounded-lg border">
          <div className="grid grid-cols-5 gap-4 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground">
            <span>Firm</span>
            <span>Contact</span>
            <span className="text-right">Clients</span>
            <span className="text-right">Allocated</span>
            <span className="text-right">Accrued</span>
          </div>
          {partners.map((partner) => (
            <button
              key={partner.id}
              className="grid w-full grid-cols-5 gap-4 border-b px-4 py-3 text-left text-sm transition-colors last:border-0 hover:bg-muted/50"
              onClick={() => navigate(`/luca/partners/${partner.id}`)}
            >
              <span className="truncate font-medium">{partner.firm_name}</span>
              <span className="truncate text-muted-foreground">{partner.contact_email}</span>
              <span className="text-right">
                {partner.verified_client_count}/{partner.client_count} verified
              </span>
              <span className="text-right font-medium">
                {formatPrice(partner.allocated_volume)}
              </span>
              <span className="text-right text-muted-foreground">
                {formatPrice(partner.accrued_revenue)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PartnerDistribution({ partners }: { partners: PartnersResponse["partners"] }) {
  const { data } = useQuery({
    queryKey: ["admin", "subscriptions", "partner-distribution"],
    queryFn: () => api<SubscriptionsResponse>("/api/v1/admin/subscriptions"),
  });
  const subscriptions = data?.subscriptions ?? [];
  const firmBuckets = [
    { label: "1–5 clients", count: partners.filter((p) => p.client_count >= 1 && p.client_count <= 5).length },
    { label: "6–10 clients", count: partners.filter((p) => p.client_count >= 6 && p.client_count <= 10).length },
    { label: "11+ clients", count: partners.filter((p) => p.client_count >= 11).length },
  ];
  const clientBuckets = [
    { label: "$1–100K", min: 1, max: 100_000 },
    { label: "$100K–$1M", min: 100_000, max: 1_000_000 },
    { label: "$1M–$10M", min: 1_000_000, max: 10_000_000 },
    { label: "$10M+", min: 10_000_000, max: Infinity },
  ].map((bucket) => {
    const amounts = new Map<number, number>();
    for (const sub of subscriptions) if (sub.eam_firm && !CLOSED_SUBSCRIPTION_STATUSES.includes(sub.status)) amounts.set(sub.investor_id, (amounts.get(sub.investor_id) ?? 0) + Number(sub.amount));
    return { label: bucket.label, count: [...amounts.values()].filter((amount) => amount >= bucket.min && amount < bucket.max).length };
  });
  return <div className="grid gap-3 lg:grid-cols-2">
    <DistributionCard title="Partner firm size" subtitle="Firms grouped by number of advised clients" rows={firmBuckets} />
    <DistributionCard title="Client open subscriptions" subtitle="Clients grouped by open recorded subscription amount" rows={clientBuckets} />
  </div>;
}

function DistributionCard({ title, subtitle, rows }: { title: string; subtitle: string; rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return <Card><CardContent className="space-y-3 pt-4"><div><h2 className="font-semibold">{title}</h2><p className="text-xs text-muted-foreground">{subtitle}</p></div>{rows.map((row) => <div key={row.label} className="grid grid-cols-[90px_1fr_28px] items-center gap-3 text-sm"><span className="text-muted-foreground">{row.label}</span><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(row.count / max) * 100}%` }} /></div><span className="text-right tabular-nums">{row.count}</span></div>)}</CardContent></Card>;
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
