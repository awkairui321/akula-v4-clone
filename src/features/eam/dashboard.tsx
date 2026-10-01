import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/currency";
import type { DashboardData, EamProfile, ServicingQueueItem } from "./types";
import { STAGE_LABELS } from "./types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  UsersIcon,
  ShieldCheckIcon,
  DollarSignIcon,
  ArrowRightIcon,
  CircleIcon,
} from "lucide-react";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const DOT_COLORS: Record<string, string> = {
  blue: "fill-blue-500 text-blue-500",
  amber: "fill-amber-500 text-amber-500",
  green: "fill-green-500 text-green-500",
};

function ActionRow({
  dot,
  title,
  body,
  tag,
  onClick,
}: {
  dot: "blue" | "amber" | "green";
  title: string;
  body: string;
  tag: string;
  onClick: () => void;
}) {
  return (
    <button
      className="flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-muted/50"
      onClick={onClick}
    >
      <CircleIcon className={`size-2 shrink-0 ${DOT_COLORS[dot]}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{body}</p>
      </div>
      <Badge variant="secondary" className="shrink-0 text-[10px]">
        {tag}
      </Badge>
      <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

const VERIFICATION_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  approved: "default",
  in_review: "secondary",
  pending: "outline",
  rejected: "destructive",
};

export default function EamDashboard() {
  const navigate = useNavigate();

  const { data: profile } = useQuery({
    queryKey: ["eamProfile"],
    queryFn: () => api<EamProfile>("/api/v1/eam/profile"),
  });

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["eamDashboard"],
    queryFn: () => api<DashboardData>("/api/v1/eam/dashboard"),
  });

  const firstName = profile?.display_name?.split(" ")[0];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">
            {firstName ? `${getGreeting()}, ${firstName}.` : getGreeting() + "."}
          </h1>
          <p className="text-muted-foreground">
            Your clients, current opportunities and servicing tasks.
          </p>
        </div>
        <Link to="/eam/opportunities">
          <Button>Browse opportunities</Button>
        </Link>
      </div>

      {isLoading && <p className="py-12 text-center text-muted-foreground">Loading...</p>}

      {!isLoading && dashboard && (
        <>
          {/* Metrics row */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Clients</CardTitle>
                <UsersIcon className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboard.total_clients}</div>
                <p className="text-xs text-muted-foreground">Referred book</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Verified
                </CardTitle>
                <ShieldCheckIcon className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboard.verified_clients}</div>
                <p className="text-xs text-muted-foreground">
                  of {dashboard.total_clients} clients
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Participation
                </CardTitle>
                <DollarSignIcon className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatPrice(dashboard.total_participation)}
                </div>
                <p className="text-xs text-muted-foreground">Total committed</p>
              </CardContent>
            </Card>
          </div>

          {/* Needs your attention */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Needs your attention</h2>
              <Link to="/eam/clients">
                <Button variant="link" size="sm" className="text-xs">
                  View all clients
                  <ArrowRightIcon className="ml-1 size-3" />
                </Button>
              </Link>
            </div>
            <div className="space-y-2">
              {dashboard.servicing_queue
                .filter((item) => item.verification === "pending")
                .map((item) => (
                  <ActionRow
                    key={`verify-${item.id}`}
                    dot="amber"
                    title={`${item.client_name} · verification pending`}
                    body="Client has not completed onboarding yet."
                    tag="Client action required"
                    onClick={() => navigate(`/eam/clients/${item.id}`)}
                  />
                ))}
              {dashboard.servicing_queue.length === 0 && dashboard.total_clients === 0 && (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    No action items right now. Browse opportunities to get started.
                  </CardContent>
                </Card>
              )}
              {dashboard.total_clients > 0 &&
                dashboard.servicing_queue.filter((item) => item.verification === "pending")
                  .length === 0 && (
                  <Card>
                    <CardContent className="py-6 text-center text-sm text-muted-foreground">
                      All caught up — no action items right now.
                    </CardContent>
                  </Card>
                )}
            </div>
          </section>

          {/* Opportunity highlights */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Opportunity highlights</h2>
              <Link to="/eam/opportunities">
                <Button variant="link" size="sm" className="text-xs">
                  Open shelf
                  <ArrowRightIcon className="ml-1 size-3" />
                </Button>
              </Link>
            </div>
            <div className="space-y-2">
              <ActionRow
                dot="amber"
                title="Highlight a current opportunity"
                body="Select a client, add an optional message and publish it to their investor overview."
                tag="Create highlight"
                onClick={() => navigate("/eam/opportunities")}
              />
              {dashboard.total_highlights > 0 && (
                <ActionRow
                  dot="green"
                  title={`${dashboard.total_highlights} highlight${dashboard.total_highlights !== 1 ? "s" : ""} active`}
                  body="Published across your client book."
                  tag="Published"
                  onClick={() => navigate("/eam/clients")}
                />
              )}
              {dashboard.recent_highlights.map((h) => (
                <ActionRow
                  key={h.id}
                  dot="blue"
                  title={`Highlight sent for ${h.client_name}`}
                  body={`${h.fund_name}${h.rationale ? ` — ${h.rationale}` : ""}`}
                  tag={new Date(h.created_at).toLocaleDateString()}
                  onClick={() => navigate(`/eam/clients/${h.adviser_client_id}`)}
                />
              ))}
            </div>
          </section>

          {/* Client servicing queue */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Client servicing queue</h2>
              <Link to="/eam/clients">
                <Button variant="link" size="sm" className="text-xs">
                  Open client book
                  <ArrowRightIcon className="ml-1 size-3" />
                </Button>
              </Link>
            </div>
            {dashboard.servicing_queue.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No clients yet. Add clients from the admin panel.
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-lg border">
                <div className="grid grid-cols-5 gap-4 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground">
                  <span>Client</span>
                  <span>Verification</span>
                  <span>Highlights</span>
                  <span>Participation</span>
                  <span>Stage</span>
                </div>
                {dashboard.servicing_queue.map((item: ServicingQueueItem) => (
                  <button
                    key={item.id}
                    className="grid w-full grid-cols-5 gap-4 border-b px-4 py-3 text-left text-sm transition-colors last:border-0 hover:bg-muted/50"
                    onClick={() => navigate(`/eam/clients/${item.id}`)}
                  >
                    <span className="truncate font-medium">{item.client_name}</span>
                    <span>
                      <Badge
                        variant={VERIFICATION_VARIANT[item.verification] ?? "outline"}
                        className="text-[10px]"
                      >
                        {item.verification}
                      </Badge>
                    </span>
                    <span className="truncate text-muted-foreground">
                      {item.highlights.length > 0 ? item.highlights.join(", ") : "No highlight"}
                    </span>
                    <span className="font-medium">{formatPrice(item.participation)}</span>
                    <span>
                      <Badge variant="outline" className="text-[10px]">
                        {STAGE_LABELS[item.stage]}
                      </Badge>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
