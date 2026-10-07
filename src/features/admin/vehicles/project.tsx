import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, PlusIcon } from "lucide-react";
import { api } from "@/lib/api";
import { SECTOR_LABELS } from "@/lib/types";
import type { Fund } from "@/lib/types";
import { formatPrice, formatPricePrecise } from "@/lib/currency";
import { fundAudienceLabel } from "@/lib/investor-access";
import { useAuth } from "@/contexts/auth-context";
import { DEAL_DOCUMENT_KINDS } from "@/lib/types";
import type { AdminDocument, SubscriptionsResponse } from "../types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StateBadge, daysUntil, formatClose } from "./deal-status";
import { fundLabel, groupProjects, nextFundLabel, type Project } from "./projects";
import { usePublication, publicationStatus } from "./use-publication";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function AddFundDialog({
  project,
  open,
  onOpenChange,
}: {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState(() => nextFundLabel(project));
  const [target, setTarget] = useState("1000000");

  const create = useMutation({
    mutationFn: () =>
      api<{ fund: Fund }>("/api/v1/funds", {
        method: "POST",
        body: {
          fund: {
            project_fund_id: project.funds[0].id,
            fund_label: label.trim(),
            target_amount: Number(target),
          },
        },
      }),
    onSuccess: ({ fund }) => {
      queryClient.invalidateQueries();
      onOpenChange(false);
      navigate(`/luca/deals/${fund.id}`);
    },
  });

  const valid = label.trim() !== "" && Number(target) > 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>Add a fund to {project.codename}</DialogTitle>
        <p className="text-sm text-muted-foreground">
          The new fund shares {project.company}&apos;s company information and starts with this
          project&apos;s fee schedule. It stays a draft until the Fund Manager approves it.
        </p>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="fund-label">
              Fund name
            </Label>
            <Input id="fund-label" value={label} onChange={(e) => setLabel(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Shown as {project.company} {label.trim() || "…"}.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="fund-target">
              Target amount
            </Label>
            <Input
              id="fund-target"
              type="number"
              min="0"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>
        </div>
        {create.isError && <p className="text-sm text-destructive">{create.error.message}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!valid || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Adding..." : "Add fund"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** One company and every fund raising into it. */
export default function ProjectPage() {
  const { user } = useAuth();
  const { assetId } = useParams<{ assetId: string }>();
  const [adding, setAdding] = useState(false);
  const publication = usePublication();
  const { data: subscriptionData } = useQuery({
    queryKey: ["admin", "subscriptions", "board"],
    queryFn: () => api<SubscriptionsResponse>("/api/v1/admin/subscriptions"),
    enabled: user?.role === "luca",
  });
  const { data: documentData } = useQuery({
    queryKey: ["admin", "documents"],
    queryFn: () => api<{ documents: AdminDocument[] }>("/api/v1/admin/documents"),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "funds"],
    queryFn: () => api<{ funds: Fund[] }>("/api/v1/funds"),
  });
  const project = useMemo(
    () => groupProjects(data?.funds ?? []).find((p) => String(p.key) === assetId),
    [data, assetId],
  );

  if (isLoading)
    return <p className="py-12 text-center text-muted-foreground">Loading project...</p>;
  if (!project)
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-muted-foreground">Project not found.</p>
        <Link to="/luca/deals">
          <Button variant="outline" size="sm">
            All projects
          </Button>
        </Link>
      </div>
    );

  const pct =
    project.target && project.target > 0
      ? Math.min(100, Math.round((project.committed / project.target) * 100))
      : null;
  const closeDays = project.nextClose ? daysUntil(project.nextClose) : null;

  return (
    <div className="flex w-full flex-col gap-8">
      <div className="space-y-6">
        <Link
          to="/luca/deals"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          All projects
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{project.codename}</h1>
            <p className="mt-1 text-muted-foreground">
              {project.company} · {SECTOR_LABELS[project.sector] ?? project.sector}
            </p>
          </div>
          <Button size="sm" onClick={() => setAdding(true)}>
            <PlusIcon className="mr-1.5 size-4" />
            Add fund
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-5 border-y py-5 lg:grid-cols-[1fr_2fr_1fr]">
          <div>
            <p className="text-xs text-muted-foreground">Funds</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{project.funds.length}</p>
          </div>
          <div className="col-span-2 lg:col-span-1">
            <p className="text-xs text-muted-foreground">Committed across funds</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {formatPrice(project.committed)}
              {project.target !== null && (
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  of {formatPrice(project.target)}
                </span>
              )}
            </p>
            {pct !== null && (
              <div className="mt-2 flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
              </div>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Next close</p>
            <p className="mt-1 text-xl font-semibold">
              {project.nextClose && closeDays !== null && closeDays > 0
                ? formatDate(project.nextClose)
                : "None open"}
            </p>
            {closeDays !== null && closeDays > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">in {formatClose(closeDays)}</p>
            )}
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Funds in this project
        </h2>
        <div className="grid gap-6 xl:grid-cols-2">
          {project.funds.map((fund) => {
            const status = publicationStatus(
              fund.id,
              publication.versions,
              publication.unpublished,
            );
            const docs = (documentData?.documents ?? []).filter(
              (doc) =>
                doc.fund_id === fund.id &&
                doc.subscription_id === null &&
                DEAL_DOCUMENT_KINDS.some((kind) => kind.value === doc.kind),
            );
            const clients = (subscriptionData?.subscriptions ?? []).filter(
              (sub) =>
                sub.fund_id === fund.id && ["allocation_pending", "allocated"].includes(sub.status),
            );
            const clientGroups = [...new Set(clients.map((sub) => sub.investor_id))].map((id) => {
              const subscriptions = clients.filter((sub) => sub.investor_id === id);
              const pending = subscriptions.filter((sub) => sub.status === "allocation_pending");
              return {
                id,
                name: subscriptions[0].investor_name,
                pending,
                issued: subscriptions
                  .filter((sub) => sub.holding_id)
                  .reduce((sum, sub) => sum + Number(sub.allocated_principal ?? sub.amount), 0),
                recorded: subscriptions
                  .filter((sub) => sub.status === "allocated" && !sub.holding_id)
                  .reduce((sum, sub) => sum + Number(sub.allocated_principal ?? sub.amount), 0),
              };
            });
            return (
              <article
                key={fund.id}
                aria-label={fund.name}
                className="flex flex-col overflow-hidden rounded-xl border bg-card"
              >
                <header className="space-y-3 border-b px-6 py-5">
                  <div className="flex items-center justify-between gap-3">
                    <Link
                      to={`/luca/deals/${fund.id}`}
                      className="text-lg font-semibold hover:underline"
                    >
                      {fundLabel(fund)}
                    </Link>
                    <StateBadge fund={fund} />
                  </div>
                  <p className="text-sm text-muted-foreground">{fund.name}</p>
                  <span className="inline-flex rounded-full bg-muted px-3 py-1 text-xs">
                    {fundAudienceLabel(fund)}
                  </span>
                  <p className="min-h-4 text-xs text-amber-700">{status?.label ?? "\u00a0"}</p>
                </header>
                <div className="space-y-6 px-6 py-5">
                  <dl className="grid grid-cols-3 gap-3">
                    {[
                      ["Subscription", fund.subscription_fee_pct],
                      ["Management / year", fund.management_fee_pct],
                      ["Carried interest", fund.carried_interest_pct],
                    ].map(([label, fee]) => (
                      <div key={label}>
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd className="mt-1 text-lg font-semibold tabular-nums">{fee}%</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="text-xs text-muted-foreground">
                    {formatPricePrecise(fund.price)} / unit · Minimum{" "}
                    {formatPrice(fund.min_subscription)} · {formatClose(daysUntil(fund.closes_at))}
                  </p>
                  <div className="min-h-36 space-y-2">
                    <h3 className="text-sm font-medium">
                      Fund documents{" "}
                      <span className="ml-1 text-muted-foreground">{docs.length}</span>
                    </h3>
                    {docs.length ? (
                      <ul className="space-y-2 text-xs text-muted-foreground">
                        {docs.map((doc) => (
                          <li key={doc.id}>{doc.name.replace(fund.name + " · ", "")}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">No fund documents added yet.</p>
                    )}
                  </div>
                  {user?.role === "luca" && (
                    <div className="space-y-2 border-t pt-4">
                      <h3 className="text-sm font-medium">Client allocations</h3>
                      {clients.length ? (
                        <ul className="divide-y">
                          {clientGroups.map((client) => (
                            <li
                              key={client.id}
                              className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                            >
                              <div>
                                <Link
                                  to={`/luca/investors/${client.id}`}
                                  className="font-medium hover:underline"
                                >
                                  {client.name}
                                </Link>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {[
                                    client.issued > 0 &&
                                      `Holdings issued · ${formatPrice(client.issued)}`,
                                    client.recorded > 0 &&
                                      `Allocation recorded · ${formatPrice(client.recorded)}`,
                                    client.pending.length > 0 &&
                                      `Ready for allocation · ${formatPrice(client.pending.reduce((sum, sub) => sum + Number(sub.amount), 0))}`,
                                  ]
                                    .filter(Boolean)
                                    .join("; ")}
                                </p>
                              </div>
                              {client.pending.length > 0 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  nativeButton={false}
                                  render={
                                    <Link
                                      to={
                                        client.pending.length === 1
                                          ? `/luca/subscriptions/${client.pending[0].id}/allocate`
                                          : `/luca/subscriptions?deal=${fund.id}&stage=ready_allocation&q=${encodeURIComponent(client.name)}`
                                      }
                                    />
                                  }
                                >
                                  Allocate →
                                </Button>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No clients at allocation yet.
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4 text-sm">
                  <Link to={`/luca/deals/${fund.id}`} className="text-primary hover:underline">
                    Open fund →
                  </Link>
                  {user?.role === "luca" && (
                    <Link
                      to={`/luca/subscriptions?deal=${fund.id}`}
                      className="text-muted-foreground hover:underline"
                    >
                      All subscriptions
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Fees are subscription · management · carried interest. Each fund has one fee schedule, set
          in its overview editor. Company information is shared by every fund in the project.
        </p>
      </section>

      <AddFundDialog
        key={project.funds.length}
        project={project}
        open={adding}
        onOpenChange={setAdding}
      />
    </div>
  );
}
