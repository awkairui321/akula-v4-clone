import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/currency";
import type { DashboardData, EamProfile, ServicingQueueItem } from "./types";
import { STAGE_LABELS } from "./types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [progressFilter, setProgressFilter] = useState("action");
  const [progressSearch, setProgressSearch] = useState("");
  const [page, setPage] = useState(0);

  const { data: profile } = useQuery({
    queryKey: ["eamProfile"],
    queryFn: () => api<EamProfile>("/api/v1/eam/profile"),
  });

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["eamDashboard"],
    queryFn: () => api<DashboardData>("/api/v1/eam/dashboard"),
  });

  const firstName = profile?.display_name?.split(" ")[0];
  const actionStatuses = [
    "reserved",
    "documents_pending",
    "approved",
    "awaiting_funds",
    "not_allocated",
    "rejected",
  ];
  const reviewStatuses = ["institution_review"];
  const progress = dashboard?.investment_progress ?? [];
  const actionCount = new Set(
    progress
      .filter((item) => actionStatuses.includes(item.status))
      .map((item) => item.adviser_client_id),
  ).size;
  const reviewCount = new Set(
    progress
      .filter((item) => reviewStatuses.includes(item.status))
      .map((item) => item.adviser_client_id),
  ).size;
  const stageProgress = progress.filter((item) => {
    const matchesStage =
      progressFilter === "all" ||
      (progressFilter === "action" && actionStatuses.includes(item.status)) ||
      (progressFilter === "review" && reviewStatuses.includes(item.status)) ||
      (progressFilter === "other" &&
        !actionStatuses.includes(item.status) &&
        !reviewStatuses.includes(item.status));
    return matchesStage;
  });
  const groupedProgress = Array.from(
    stageProgress.reduce((groups, item) => {
      const group = groups.get(item.adviser_client_id) ?? [];
      group.push(item);
      groups.set(item.adviser_client_id, group);
      return groups;
    }, new Map<number, typeof stageProgress>()),
  )
    .map(([clientId, items]) => ({ clientId, items, clientName: items[0].client_name }))
    .filter(({ clientName, items }) =>
      `${clientName} ${items.map((item) => `${item.asset_name} ${item.id}`).join(" ")}`
        .toLowerCase()
        .includes(progressSearch.toLowerCase()),
    );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">
            {firstName ? `${getGreeting()}, ${firstName}.` : getGreeting() + "."}
          </h1>
          <p className="text-muted-foreground">
            Follow your client book from prospect to active investor, with shared records for each
            step.
          </p>
        </div>
        <Link to="/eam/opportunities">
          <Button>Browse opportunities</Button>
        </Link>
      </div>

      {isLoading && <p className="py-12 text-center text-muted-foreground">Loading...</p>}

      {!isLoading && dashboard && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Link to="/eam/clients">
              <Card className="h-full hover:bg-muted/40">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Clients
                  </CardTitle>
                  <UsersIcon className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{dashboard.total_clients}</div>
                  <p className="text-xs text-muted-foreground">Your firm’s client book</p>
                </CardContent>
              </Card>
            </Link>
            <button
              className="text-left"
              onClick={() => {
                setProgressFilter("action");
                setPage(0);
                document.getElementById("eam-progress")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <Card className="h-full hover:bg-muted/40">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Client follow-ups
                  </CardTitle>
                  <ShieldCheckIcon className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{actionCount}</div>
                  <p className="text-xs text-muted-foreground">View immediate actions →</p>
                </CardContent>
              </Card>
            </button>
            <button
              className="text-left"
              onClick={() => {
                setProgressFilter("review");
                setPage(0);
                document.getElementById("eam-progress")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <Card className="h-full hover:bg-muted/40">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    With LUCA or institution
                  </CardTitle>
                  <DollarSignIcon className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{reviewCount}</div>
                  <p className="text-xs text-muted-foreground">View review stages →</p>
                </CardContent>
              </Card>
            </button>
          </div>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Client stages</h2>
            <div className="grid gap-2 sm:grid-cols-4">
              {(["prospect", "onboarding", "active", "inactive"] as const).map((stage) => (
                <Link
                  key={stage}
                  to={`/eam/clients?stage=${stage}`}
                  className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm hover:bg-muted/50"
                >
                  <span>{STAGE_LABELS[stage]}</span>
                  <strong>{dashboard.clients_by_stage[stage]}</strong>
                </Link>
              ))}
            </div>
          </section>

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

          <section id="eam-progress" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Immediate actions & investment progress</h2>
              <Link className="text-sm text-primary hover:underline" to="/eam/reports">
                View client reports →
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">
              Investment processing is handled by the investor, LUCA and Akula Ops. Your firm can
              follow the stage and help clients with questions.
            </p>
            <div className="flex flex-wrap gap-3">
              <select
                aria-label="Filter investment progress"
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={progressFilter}
                onChange={(event) => {
                  setProgressFilter(event.target.value);
                  setPage(0);
                }}
              >
                <option value="action">Client follow-ups ({actionCount})</option>
                <option value="review">With LUCA or institution ({reviewCount})</option>
                <option value="other">Other stages</option>
                <option value="all">All investment records</option>
              </select>
              <Input
                className="max-w-sm"
                aria-label="Search investment progress"
                placeholder="Search client, company or investment #"
                value={progressSearch}
                onChange={(event) => {
                  setProgressSearch(event.target.value);
                  setPage(0);
                }}
              />
            </div>
            {groupedProgress.length === 0 ? (
              <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                No clients with matching investment tasks.
              </p>
            ) : (
              <div className="space-y-2">
                {groupedProgress
                  .slice(page * 8, (page + 1) * 8)
                  .map(({ clientId, clientName, items }) => (
                    <details key={clientId} className="rounded-lg border bg-card">
                      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
                        <span className="font-medium">
                          {clientName}
                          <small className="ml-2 font-mono text-xs text-muted-foreground">
                            {items.length} deal action{items.length === 1 ? "" : "s"}
                          </small>
                        </span>
                        <Link
                          className="text-sm text-primary hover:underline"
                          to={`/eam/clients/${clientId}?tab=activity`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          View client activity →
                        </Link>
                      </summary>
                      <div className="space-y-2 border-t px-4 py-3">
                        {items.map((item) => (
                          <div
                            key={item.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/30 px-3 py-2 text-sm"
                          >
                            <span>
                              <strong>{item.asset_name}</strong>
                              <small className="ml-2 text-muted-foreground">
                                #{item.id} · {formatPrice(Number(item.amount))}
                              </small>
                            </span>
                            <span className="text-muted-foreground">
                              {item.status.replaceAll("_", " ")}
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
              </div>
            )}
            {groupedProgress.length > 8 && (
              <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
                <span>
                  {page * 8 + 1}–{Math.min((page + 1) * 8, groupedProgress.length)} of{" "}
                  {groupedProgress.length} clients
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(page + 1) * 8 >= groupedProgress.length}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            )}
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

          <div className="grid gap-3 sm:grid-cols-3">
            <Link className="rounded-lg border p-4 text-sm hover:bg-muted/50" to="/eam/documents">
              <strong>Client documents →</strong>
              <p className="mt-1 text-muted-foreground">Find deal-linked material.</p>
            </Link>
            <Link className="rounded-lg border p-4 text-sm hover:bg-muted/50" to="/eam/revenue">
              <strong>Revenue share →</strong>
              <p className="mt-1 text-muted-foreground">Review illustrative attribution.</p>
            </Link>
          </div>

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
