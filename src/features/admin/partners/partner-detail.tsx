import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/currency";
import { STATUS_LABELS, type PartnerDetailResponse } from "../types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeftIcon } from "lucide-react";

export default function AdminPartnerDetailPage() {
  const { id } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "partners", id],
    queryFn: () => api<PartnerDetailResponse>(`/api/v1/admin/partners/${id}`),
    enabled: Boolean(id),
  });

  if (isLoading) {
    return <p className="py-12 text-center text-muted-foreground">Loading...</p>;
  }

  if (!data) {
    return <p className="py-12 text-center text-muted-foreground">Partner not found.</p>;
  }

  const { partner, clients, subscriptions, revenue_periods } = data;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link
        to="/luca/partners"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Back to partners
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">{partner.firm_name}</h1>
          <p className="text-muted-foreground">
            {partner.display_name} · {partner.contact_email}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link to={`/luca/subscriptions?q=${encodeURIComponent(partner.firm_name)}`} />}
          >
            View subscriptions
          </Button>
          <Button
            size="sm"
            nativeButton={false}
            render={
              <Link
                to={`/luca/communications/new?audience=partner:${encodeURIComponent(partner.firm_name)}`}
              />
            }
          >
            Message partner
          </Button>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile label="Clients" value={String(partner.client_count)} />
        <SummaryTile label="Verified" value={String(partner.verified_client_count)} />
        <SummaryTile label="Allocated volume" value={formatPrice(partner.allocated_volume)} />
        <SummaryTile label="Accrued revenue" value={formatPrice(partner.accrued_revenue)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Clients</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {clients.length === 0 && <p className="text-muted-foreground">No clients yet.</p>}
            {clients.map((client) => (
              <div key={client.id} className="flex items-center justify-between gap-4">
                <span className="truncate">
                  <Link
                    to={`/luca/investors/${client.investor_id}`}
                    className="block font-medium hover:underline"
                  >
                    {client.name}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">
                    {client.email}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {client.authority_in_force && (
                    <Badge variant="outline" className="text-[10px]">
                      Authority
                    </Badge>
                  )}
                  <Badge
                    variant={client.onboarding_completed ? "default" : "secondary"}
                    className="text-[10px]"
                  >
                    {client.onboarding_completed ? "Verified" : client.stage}
                  </Badge>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue periods</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {revenue_periods.length === 0 && (
              <p className="text-muted-foreground">No revenue recorded.</p>
            )}
            {revenue_periods.map((period) => (
              <div key={period.id} className="flex items-center justify-between gap-4">
                <span>{period.period}</span>
                <span className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {period.status}
                  </Badge>
                  <span className="font-medium">{formatPrice(period.amount)}</span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Subscriptions placed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {subscriptions.length === 0 && (
              <p className="text-muted-foreground">No subscriptions placed.</p>
            )}
            {subscriptions.map((subscription) => (
              <div key={subscription.id} className="flex items-center justify-between gap-4">
                <span className="truncate">
                  <Link
                    to={`/luca/investors/${subscription.investor_id}`}
                    className="block font-medium hover:underline"
                  >
                    {subscription.investor_name}
                  </Link>
                  <Link
                    to={`/luca/deals/${subscription.fund_id}`}
                    className="block truncate text-xs text-muted-foreground hover:underline"
                  >
                    {subscription.asset_name}
                  </Link>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {STATUS_LABELS[subscription.status]}
                  </Badge>
                  <span className="font-medium">{formatPrice(subscription.amount)}</span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
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
