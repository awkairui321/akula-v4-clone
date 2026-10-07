import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, PlusIcon } from "lucide-react";
import { api } from "@/lib/api";
import { SECTOR_LABELS } from "@/lib/types";
import type { Fund } from "@/lib/types";
import { formatPrice, formatPricePrecise } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StateBadge, allocationOf, daysUntil, formatClose } from "./deal-status";
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
  const { assetId } = useParams<{ assetId: string }>();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const publication = usePublication();

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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fund</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Price / unit</TableHead>
              <TableHead className="text-right">Fees</TableHead>
              <TableHead className="text-right">Committed</TableHead>
              <TableHead className="text-right">Closes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {project.funds.map((fund) => {
              const { allocated, total, pct: fundPct } = allocationOf(fund);
              const days = daysUntil(fund.closes_at);
              const status = publicationStatus(
                fund.id,
                publication.versions,
                publication.unpublished,
              );
              return (
                <TableRow
                  key={fund.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/luca/deals/${fund.id}`)}
                >
                  <TableCell>
                    <Link
                      to={`/luca/deals/${fund.id}`}
                      className="font-medium hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {fundLabel(fund)}
                    </Link>
                    <p className="text-xs text-muted-foreground">{fund.name}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <StateBadge fund={fund} />
                      {status && <span className="text-xs text-amber-700">{status.label}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPricePrecise(fund.price)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fund.subscription_fee_pct}% · {fund.management_fee_pct}% ·{" "}
                    {fund.carried_interest_pct}%
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPrice(allocated)}
                    {total !== null && (
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        of {formatPrice(total)}
                        {fundPct !== null && ` · ${fundPct}%`}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {fund.closes_at && days !== null && days > 0
                      ? `${formatDate(fund.closes_at)} · ${formatClose(days)}`
                      : formatClose(days)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
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
