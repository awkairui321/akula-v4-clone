import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Fund } from "@/lib/types";
import { LUCA_PIPELINE_STAGES } from "@/lib/types";
import { formatPrice } from "@/lib/currency";
import type { AdminSubscription, InvestorsResponse, SubscriptionsResponse } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { SearchModeSelect } from "../onboarding";

function daysUntil(dateString: string | null): number | null {
  if (!dateString) return null;
  const diff = new Date(dateString).getTime() - Date.now();
  return diff <= 0 ? 0 : Math.ceil(diff / (1000 * 60 * 60 * 24));
}

const TICKET_BUCKETS = [
  { label: "< $25k", max: 25000 },
  { label: "$25k–$50k", max: 50000 },
  { label: "$50k–$100k", max: 100000 },
  { label: "$100k–$250k", max: 250000 },
  { label: "$250k+", max: Infinity },
];

export default function InvestorsByFundPage() {
  const navigate = useNavigate();
  const [fundId, setFundId] = useState<string | null>(null);

  const { data: fundsData } = useQuery({
    queryKey: ["admin", "funds"],
    queryFn: () => api<{ funds: Fund[] }>("/api/v1/funds"),
  });
  const funds = fundsData?.funds ?? [];
  const fund = funds.find((f) => String(f.id) === fundId) ?? null;

  const { data: subsData, isLoading: subsLoading } = useQuery({
    queryKey: ["admin", "subscriptions", "by-fund", fundId],
    queryFn: () => api<SubscriptionsResponse>(`/api/v1/admin/subscriptions?fund_id=${fundId}`),
    enabled: Boolean(fundId),
  });

  const { data: investorsData } = useQuery({
    queryKey: ["admin", "investors", "all"],
    queryFn: () => api<InvestorsResponse>("/api/v1/admin/investors"),
    enabled: Boolean(fundId),
  });

  const fundSubs = subsData?.subscriptions ?? [];
  const investorsById = new Map((investorsData?.investors ?? []).map((i) => [i.id, i]));

  const uniqueInvestorIds = [...new Set(fundSubs.map((s) => s.investor_id))];
  const totalSubscribed = fundSubs.reduce((sum, s) => sum + parseFloat(s.amount), 0);
  const totalFunded = fundSubs
    .filter((s) => ["reconciliation", "allocation_pending", "allocated"].includes(s.status))
    .reduce((sum, s) => sum + parseFloat(s.amount), 0);
  const avgTicket = fundSubs.length > 0 ? totalSubscribed / fundSubs.length : 0;
  const allocated = fund ? parseFloat(fund.supply_allocated) : 0;
  const total = fund?.supply_total ? parseFloat(fund.supply_total) : null;
  const remaining = total !== null ? Math.max(0, total - allocated) : null;
  const daysToClose = fund ? daysUntil(fund.closes_at) : null;

  const byInstitution = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of fundSubs) {
      const key = s.eam_firm ?? "Direct";
      map.set(key, (map.get(key) ?? 0) + parseFloat(s.amount));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [fundSubs]);
  const maxInstitutionAmount = Math.max(1, ...byInstitution.map(([, amount]) => amount));

  const ticketDistribution = useMemo(() => {
    return TICKET_BUCKETS.map((bucket, i) => {
      const min = i === 0 ? 0 : TICKET_BUCKETS[i - 1].max;
      const count = fundSubs.filter((s) => {
        const amount = parseFloat(s.amount);
        return amount > min && amount <= bucket.max;
      }).length;
      return { label: bucket.label, count };
    });
  }, [fundSubs]);
  const maxTicketCount = Math.max(1, ...ticketDistribution.map((b) => b.count));

  const expiryTimeline = useMemo(() => {
    const months: { key: string; label: string; count: number }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      months.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
        count: 0,
      });
    }
    for (const id of uniqueInvestorIds) {
      const expiry = investorsById.get(id)?.accreditation_expiry;
      if (!expiry) continue;
      const d = new Date(expiry);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const bucket = months.find((m) => m.key === key);
      if (bucket) bucket.count += 1;
    }
    return months;
  }, [uniqueInvestorIds, investorsById]);
  const maxExpiryCount = Math.max(1, ...expiryTimeline.map((m) => m.count));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Search by fund</h1>
        <p className="text-muted-foreground">
          Pick a fund to see who's in it, how much has been raised, and where demand is coming from.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Select value={fundId ?? undefined} onValueChange={setFundId}>
          <SelectTrigger className="w-full sm:flex-1">
            <SelectValue placeholder="Select a fund…">
              {() => (fund ? `${fund.codename} · ${fund.asset.name}` : "Select a fund…")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {funds.map((f) => (
              <SelectItem key={f.id} value={String(f.id)}>
                {f.codename} · {f.asset.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SearchModeSelect mode="fund" />
      </div>

      {!fundId && (
        <p className="py-12 text-center text-muted-foreground">
          Select a fund above to see its investors and analytics.
        </p>
      )}

      {fundId && subsLoading && (
        <p className="py-12 text-center text-muted-foreground">Loading...</p>
      )}

      {fund && !subsLoading && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {fund.codename} · {fund.asset.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <SummaryStat
                label="Total allocation"
                value={total !== null ? formatPrice(total) : "No cap"}
              />
              <SummaryStat label="Total subscribed" value={formatPrice(totalSubscribed)} />
              <SummaryStat label="Total funded" value={formatPrice(totalFunded)} />
              <SummaryStat
                label="Remaining allocation"
                value={remaining !== null ? formatPrice(remaining) : "—"}
              />
              <SummaryStat label="Investors" value={String(uniqueInvestorIds.length)} />
              <SummaryStat label="Average ticket" value={formatPrice(avgTicket)} />
              <SummaryStat
                label="Days to closing"
                value={daysToClose !== null ? String(daysToClose) : "Open-ended"}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Investors in this fund</CardTitle>
            </CardHeader>
            <CardContent>
              {fundSubs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No subscriptions on this fund yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Investor</TableHead>
                      <TableHead>Institution / EAM</TableHead>
                      <TableHead className="text-right">Committed</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Accreditation expiry</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fundSubs.map((s: AdminSubscription) => (
                      <TableRow
                        key={s.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/luca/investors/${s.investor_id}`)}
                      >
                        <TableCell className="font-medium">{s.investor_name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {s.eam_firm ?? "Direct"}
                        </TableCell>
                        <TableCell className="text-right">{formatPrice(s.amount)}</TableCell>
                        <TableCell className="text-muted-foreground">{s.status}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {investorsById.get(s.investor_id)?.accreditation_expiry
                            ? new Date(
                                investorsById.get(s.investor_id)!.accreditation_expiry!,
                              ).toLocaleDateString()
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Subscription pipeline</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-4 gap-2">
                {LUCA_PIPELINE_STAGES.map((stage) => {
                  const count = fundSubs.filter((s) => stage.statuses.includes(s.status)).length;
                  return (
                    <div key={stage.key} className="rounded-lg border p-2 text-center">
                      <div className="text-lg font-bold">{count}</div>
                      <div className="text-[10px] text-muted-foreground">{stage.label}</div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Capital by institution</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {byInstitution.length === 0 && (
                  <p className="text-sm text-muted-foreground">No capital committed yet.</p>
                )}
                {byInstitution.map(([name, amount]) => (
                  <div key={name} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>{name}</span>
                      <span className="text-muted-foreground">{formatPrice(amount)}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(amount / maxInstitutionAmount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ticket size distribution</CardTitle>
              </CardHeader>
              <CardContent className="flex h-32 items-end gap-2">
                {ticketDistribution.map((b) => (
                  <div key={b.label} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-primary"
                      style={{
                        height: `${(b.count / maxTicketCount) * 100}%`,
                        minHeight: b.count > 0 ? 4 : 0,
                      }}
                    />
                    <span className="text-[10px] text-muted-foreground">{b.count}</span>
                    <span className="text-center text-[9px] text-muted-foreground">{b.label}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Accreditation expiry timeline</CardTitle>
              </CardHeader>
              <CardContent className="flex h-32 items-end gap-1">
                {expiryTimeline.map((m) => (
                  <div key={m.key} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-amber-500"
                      style={{
                        height: `${(m.count / maxExpiryCount) * 100}%`,
                        minHeight: m.count > 0 ? 4 : 0,
                      }}
                    />
                    <span className="text-[9px] text-muted-foreground">{m.count || ""}</span>
                    <span className="text-center text-[8px] text-muted-foreground">{m.label}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
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
