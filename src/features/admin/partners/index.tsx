import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/currency";
import type { PartnersResponse } from "../types";
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
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-6 space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Partners</h1>
        <p className="text-muted-foreground">
          EAM firms distributing on the platform, and the book of business behind each.
        </p>
      </div>

      {summary && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <SummaryTile label="Partner firms" value={String(summary.total)} />
          <SummaryTile label="Clients under advice" value={String(summary.total_clients)} />
          <SummaryTile label="Accrued revenue" value={formatPrice(summary.accrued_revenue)} />
        </div>
      )}

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
