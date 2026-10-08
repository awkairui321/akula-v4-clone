import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/currency";
import type { EamRevenueData } from "./types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DownloadIcon } from "lucide-react";
import { revenueStatement } from "./revenue-statement";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  accrued: "outline",
  paid: "default",
  pending: "secondary",
};

export default function RevenuePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["eamRevenue"],
    queryFn: () => api<EamRevenueData>("/api/v1/eam/revenue"),
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Referral economics
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Revenue share</h1>
          <p className="text-muted-foreground">
            Illustrative attribution for your firm’s allocated client investments. Settlement
            statuses are simulated.
          </p>
        </div>
        {data ? (
          <a
            className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
            href={"data:text/csv;charset=utf-8," + encodeURIComponent(revenueStatement(data))}
            download={`akula-demo-revenue-${new Date().toISOString().slice(0, 10)}.csv`}
          >
            <DownloadIcon className="mr-2 size-4" />
            Download statement (CSV)
          </a>
        ) : (
          <Button variant="outline" disabled>
            Download statement (CSV)
          </Button>
        )}
      </div>

      {isLoading && <p className="py-12 text-center text-muted-foreground">Loading...</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {error.message}
        </p>
      )}

      {!isLoading && data && (
        <>
          {/* Metrics */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Simulated accrued
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatPrice(data.accrued)}</div>
                <p className="text-xs text-muted-foreground">
                  Calculated on the client subscription fee
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Simulated paid
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatPrice(data.paid)}</div>
                <p className="text-xs text-muted-foreground">Demo status, not a payment record</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Pending share
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatPrice(data.pending)}</div>
                <p className="text-xs text-muted-foreground">Demo status awaiting confirmation</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Revenue share
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.revenue_share_pct != null ? `${data.revenue_share_pct}%` : "—"}
                </div>
                <p className="text-xs text-muted-foreground">
                  Share of the client fee after allocation
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Periods + Terms side by side */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Illustrative share by period</CardTitle>
                <span className="text-xs text-muted-foreground">USD</span>
              </CardHeader>
              <CardContent>
                {data.periods.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No periods recorded.</p>
                ) : (
                  <div className="space-y-3">
                    {data.periods.map((p) => (
                      <div key={p.id} className="flex items-center justify-between">
                        <span className="text-sm">
                          {p.period} · {p.status}
                        </span>
                        <span className="text-sm font-medium">{formatPrice(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Commercial terms</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Client subscription fee</span>
                    <span className="text-sm font-medium">
                      {data.client_subscription_fee_pct != null
                        ? `${data.client_subscription_fee_pct}% upfront`
                        : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">EAM revenue share</span>
                    <span className="text-sm font-medium">
                      {data.revenue_share_pct != null
                        ? `${data.revenue_share_pct}% of client fee`
                        : "—"}
                    </span>
                  </div>
                  <p className="border-t pt-3 text-xs text-muted-foreground">
                    Example: allocated capital × client subscription fee × EAM revenue share. On
                    $100,000 at 4% and 30%, the EAM share is $1,200. Figures and statuses are
                    simulated.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Attributed transactions */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Attributed transactions
              </h2>
              <span className="text-xs text-muted-foreground">
                Derived only from allocated holdings
              </span>
            </div>

            {data.transactions.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No transactions yet.
                </CardContent>
              </Card>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <div className="min-w-[750px]">
                  <div className="grid grid-cols-6 gap-4 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground">
                    <span>Opportunity / client</span>
                    <span>Allocated volume</span>
                    <span>Client fee base</span>
                    <span>EAM share</span>
                    <span>Allocation date</span>
                    <span className="text-right">Demo status</span>
                  </div>
                  {data.transactions.map((t) => (
                    <div
                      key={t.id}
                      className="grid grid-cols-6 gap-4 border-b px-4 py-3 text-sm last:border-0"
                    >
                      <span>
                        <p className="font-medium">{t.project_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.client_name}
                          {t.reference ? ` · ${t.reference}` : ""}
                        </p>
                      </span>
                      <span className="font-medium">{formatPrice(t.allocated_volume)}</span>
                      <span>{formatPrice(t.fee_base_amount)}</span>
                      <span className="font-medium">
                        {formatPrice(t.share_amount)} · {t.share_pct}%
                      </span>
                      <span className="text-muted-foreground">
                        {t.settlement_date
                          ? new Date(t.settlement_date).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </span>
                      <span className="text-right">
                        <Badge
                          variant={STATUS_VARIANT[t.status] ?? "outline"}
                          className="text-[10px]"
                        >
                          {t.status.charAt(0).toUpperCase() + t.status.slice(1)}
                        </Badge>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
