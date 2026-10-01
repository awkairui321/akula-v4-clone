import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/currency";
import type {
  AdminSubscription,
  PartnerClient,
  PartnerDetailResponse,
  PartnersResponse,
} from "../types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchModeSelect } from "../onboarding";

export default function InvestorsByEamPage() {
  const navigate = useNavigate();
  const [partnerId, setPartnerId] = useState<string | null>(null);

  const { data: partnersData } = useQuery({
    queryKey: ["admin", "partners", "all"],
    queryFn: () => api<PartnersResponse>("/api/v1/admin/partners"),
  });
  const partners = partnersData?.partners ?? [];

  const { data: detail, isLoading } = useQuery({
    queryKey: ["admin", "partners", partnerId],
    queryFn: () => api<PartnerDetailResponse>(`/api/v1/admin/partners/${partnerId}`),
    enabled: Boolean(partnerId),
  });

  const clients = detail?.clients ?? [];
  const subs = detail?.subscriptions ?? [];

  const byFund = new Map<string, number>();
  for (const s of subs) {
    byFund.set(s.fund_name, (byFund.get(s.fund_name) ?? 0) + parseFloat(s.amount));
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Search by EAM</h1>
        <p className="text-muted-foreground">
          Pick an EAM or RM to see their clients and how much they've placed.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Select value={partnerId ?? undefined} onValueChange={setPartnerId}>
          <SelectTrigger className="w-full sm:flex-1">
            <SelectValue placeholder="Select an EAM…">
              {(value: string | null) => {
                const partner = partners.find((p) => String(p.id) === value);
                return partner
                  ? `${partner.display_name} · ${partner.firm_name}`
                  : "Select an EAM…";
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {partners.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.display_name} · {p.firm_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SearchModeSelect mode="eam" />
      </div>

      {!partnerId && (
        <p className="py-12 text-center text-muted-foreground">
          Select an EAM above to see their clients and analytics.
        </p>
      )}

      {partnerId && isLoading && (
        <p className="py-12 text-center text-muted-foreground">Loading...</p>
      )}

      {detail && !isLoading && (
        <>
          <Card>
            <CardContent className="grid grid-cols-2 gap-4 pt-6 sm:grid-cols-4">
              <SummaryStat label="Clients" value={String(detail.partner.client_count)} />
              <SummaryStat
                label="Verified clients"
                value={String(detail.partner.verified_client_count)}
              />
              <SummaryStat
                label="Allocated volume"
                value={formatPrice(detail.partner.allocated_volume)}
              />
              <SummaryStat
                label="Accrued revenue"
                value={formatPrice(detail.partner.accrued_revenue)}
              />
            </CardContent>
          </Card>

          {byFund.size > 0 && (
            <Card>
              <CardContent className="space-y-2 pt-6">
                <p className="text-sm font-medium">Capital by fund</p>
                {[...byFund.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([fundName, amount]) => (
                    <div key={fundName} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{fundName}</span>
                      <span className="font-medium">{formatPrice(amount)}</span>
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="space-y-2 pt-6">
              <p className="text-sm font-medium">Clients</p>
              {clients.length === 0 ? (
                <p className="text-sm text-muted-foreground">No clients on file.</p>
              ) : (
                <div className="divide-y">
                  {clients.map((client: PartnerClient) => {
                    const clientSubs = subs.filter(
                      (s: AdminSubscription) => s.investor_id === client.investor_id,
                    );
                    const committed = clientSubs.reduce((sum, s) => sum + parseFloat(s.amount), 0);
                    return (
                      <button
                        key={client.id}
                        onClick={() => navigate(`/luca/investors/${client.investor_id}`)}
                        className="flex w-full items-center justify-between gap-4 py-2.5 text-left text-sm first:pt-0 last:pb-0 hover:text-primary"
                      >
                        <span className="truncate font-medium">{client.name}</span>
                        <Badge variant="outline" className="shrink-0 text-[10px] capitalize">
                          {client.stage}
                        </Badge>
                        <span className="shrink-0 text-right font-medium">
                          {formatPrice(committed)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
