import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SECTOR_LABELS } from "@/lib/types";
import type { Fund } from "@/lib/types";
import type { Version } from "@/lib/workflow-types";
import { daysUntil, formatClose, StateBadge } from "./deal-status";
import { usePublication, publicationStatus } from "./use-publication";
import { groupProjects, fundLabel, type Project } from "./projects";
import { useAuth } from "@/contexts/auth-context";
import { formatPrice } from "@/lib/currency";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { ArrowRightIcon, ClockIcon, PlusIcon, SearchIcon } from "lucide-react";

/** Whole card is the link: click anywhere to open the project and see its funds. */
function ProjectCard({ project, status }: { project: Project; status?: string | null }) {
  const lead = project.funds[0];
  const closeDays = project.nextClose ? daysUntil(project.nextClose) : null;
  const pct =
    project.target && project.target > 0
      ? Math.min(100, Math.round((project.committed / project.target) * 100))
      : null;

  return (
    <Link
      to={`/luca/projects/${project.key}`}
      aria-label={`Open ${project.codename}`}
      className="group block h-full rounded-xl focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
    >
      <Card className="flex h-full flex-col transition-shadow group-hover:ring-2 group-hover:ring-primary/30">
        <CardContent className="flex flex-1 flex-col gap-3 pt-6">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">{project.codename}</p>
              <p className="truncate text-sm text-muted-foreground">
                {project.company} · {SECTOR_LABELS[project.sector] ?? project.sector}
              </p>
            </div>
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              {project.funds.length} fund{project.funds.length === 1 ? "" : "s"}
            </Badge>
          </div>
          {status && <p className="text-xs font-medium text-amber-700">{status}</p>}

          <p className="line-clamp-2 text-sm text-muted-foreground">
            {lead.hook || lead.asset.description}
          </p>

          <ul className="space-y-1 text-sm">
            {project.funds.map((fund) => (
              <li key={fund.id} className="flex items-center justify-between gap-3">
                <span className="truncate">{fundLabel(fund)}</span>
                <StateBadge fund={fund} />
              </li>
            ))}
          </ul>

          <div className="mt-auto space-y-2 pt-1">
            {pct !== null && project.target !== null ? (
              <div className="space-y-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted-foreground/20">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>
                    {formatPrice(project.committed)} of {formatPrice(project.target)} committed
                  </span>
                  <span>{pct}%</span>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {formatPrice(project.committed)} committed · no cap set
              </p>
            )}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <ClockIcon className="size-3.5" />
                {project.nextClose && closeDays !== null && closeDays > 0
                  ? `Next close ${formatCloseDate(project.nextClose)} · ${formatClose(closeDays)}`
                  : "No open close date"}
              </span>
              <span className="flex items-center gap-1 text-primary group-hover:underline">
                Open project
                <ArrowRightIcon className="size-3.5" />
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function formatCloseDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * Order deals by closing date: open deals closing soonest first, then open-ended
 * deals, then drafts, then closed deals (most recently closed first).
 */
function compareByClosing(a: Fund, b: Fund): number {
  const rank = (f: Fund): number => {
    const days = daysUntil(f.closes_at);
    if (f.state === "draft") return 2;
    if (["closed", "holding", "realized", "cancelled"].includes(f.state) || days === 0) return 3;
    return days === null ? 1 : 0;
  };
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  const ta = a.closes_at ? new Date(a.closes_at).getTime() : 0;
  const tb = b.closes_at ? new Date(b.closes_at).getTime() : 0;
  return ra === 3 ? tb - ta : ta - tb;
}

const SECTOR_OPTIONS = Object.entries(SECTOR_LABELS);

function NewDealDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (fund: Fund) => void;
}) {
  const queryClient = useQueryClient();
  const [companyName, setCompanyName] = useState("");
  const [codename, setCodename] = useState("");
  const [sector, setSector] = useState(SECTOR_OPTIONS[0][0]);
  const [targetAmount, setTargetAmount] = useState("500000");

  const reset = () => {
    setCompanyName("");
    setCodename("");
    setSector(SECTOR_OPTIONS[0][0]);
    setTargetAmount("500000");
  };

  const createDeal = useMutation({
    mutationFn: () =>
      api<{ fund: Fund }>("/api/v1/funds", {
        method: "POST",
        body: {
          fund: {
            company_name: companyName.trim(),
            codename: codename.trim(),
            sector,
            target_amount: Number(targetAmount),
          },
        },
      }),
    onSuccess: ({ fund }) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "funds"] });
      onCreated(fund);
      close();
    },
  });

  const close = () => {
    reset();
    createDeal.reset();
    onOpenChange(false);
  };

  const complete = companyName.trim() !== "" && codename.trim() !== "" && Number(targetAmount) > 0;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-md">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="tracking-wide text-muted-foreground uppercase">New project</p>
            <DialogTitle className="mt-1">Add a project under LUCA's terms</DialogTitle>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Company name</Label>
            <Input
              placeholder="e.g. Anthropic"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Project codename</Label>
            <Input
              placeholder="e.g. Project Sable"
              value={codename}
              onChange={(e) => setCodename(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Sector</Label>
            <Select value={sector} onValueChange={(val) => setSector(val as string)}>
              <SelectTrigger className="w-full">
                <SelectValue>{SECTOR_LABELS[sector]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SECTOR_OPTIONS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Target amount</Label>
            <Input
              type="number"
              min="0"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
            />
          </div>
        </div>

        {createDeal.isError && (
          <p className="mt-3 text-sm text-destructive">{createDeal.error.message}</p>
        )}

        <p className="mt-3.5 rounded-lg border bg-muted p-4 text-xs text-muted-foreground">
          Defaults to LUCA SGP as fund manager, {formatPrice(25000)} minimum, 4% upfront fee.
          Complete the rest in the published-deal editor.
        </p>

        <Button
          className="mt-4 w-full"
          disabled={!complete || createDeal.isPending}
          onClick={() => createDeal.mutate()}
        >
          {createDeal.isPending ? "Creating deal..." : "Create deal"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

type StatusFilter = "all" | "live" | "closing_soon";

function isClosingSoon(fund: Fund): boolean {
  const days = daysUntil(fund.closes_at);
  return days !== null && days <= 7;
}

const daysSince = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

/** What the Investment Team has sent to the Fund Manager, oldest first. */
function ApprovalBand({ waiting, funds }: { waiting: Version[]; funds: Fund[] }) {
  if (!waiting.length) return null;
  return (
    <section aria-label="Needs your approval" className="space-y-2">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Needs your approval ({waiting.length})
      </p>
      <ul className="divide-y border-y">
        {waiting.map((version) => {
          const fund = funds.find((f) => f.id === version.fundId);
          const days = daysSince(version.at);
          return (
            <li key={version.id}>
              <Link
                to={`/luca/deals/${version.fundId}?tab=review`}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-3 hover:bg-muted/40"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {fund?.name ?? `Offering ${version.fundId}`}
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      · {fund?.codename} · version {version.number}
                    </span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {version.changed?.length
                      ? `Changed: ${version.changed.slice(0, 4).join(", ")}${version.changed.length > 4 ? ` and ${version.changed.length - 4} more` : ""}`
                      : fund && version.impact?.newOffering
                        ? "New offering"
                        : "Review the changes"}
                  </span>
                </span>
                <span className="flex items-center gap-4 text-sm">
                  <span className={days >= 3 ? "text-amber-700" : "text-muted-foreground"}>
                    {days === 0 ? "Sent today" : `Waiting ${days} day${days === 1 ? "" : "s"}`}
                  </span>
                  <span className="flex items-center gap-1 font-medium">
                    Review <ArrowRightIcon className="size-4" />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** One line for a project: how many of its funds are waiting on someone. */
function projectStatus(
  project: Project,
  versions: Version[],
  unpublished: { fundId: number; fields: string[] }[],
): string | null {
  const labels = project.funds
    .map((f) => publicationStatus(f.id, versions, unpublished)?.key)
    .filter(Boolean);
  const waiting = labels.filter((k) => k === "update_waiting" || k === "awaiting_first").length;
  if (waiting) return `${waiting} fund${waiting === 1 ? "" : "s"} awaiting approval`;
  const team = labels.filter((k) => k === "with_team").length;
  if (team) return `${team} fund${team === 1 ? "" : "s"} with the Investment Team`;
  return labels.length ? "Unpublished edits" : null;
}

export default function AdminVehiclesPage() {
  const navigate = useNavigate();
  const [newDealOpen, setNewDealOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);

  const { data: fundsData, isLoading } = useQuery({
    queryKey: ["admin", "funds"],
    queryFn: () => api<{ funds: Fund[] }>("/api/v1/funds"),
  });

  const funds = fundsData?.funds ?? [];
  const { user } = useAuth();
  const publication = usePublication();

  const projects = useMemo(() => groupProjects(funds), [funds]);

  const filtered = useMemo(() => {
    let result = projects;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((project) => {
        const sectorLabel = SECTOR_LABELS[project.sector] ?? project.sector;
        return (
          project.codename.toLowerCase().includes(q) ||
          project.company.toLowerCase().includes(q) ||
          sectorLabel.toLowerCase().includes(q) ||
          project.funds.some(
            (f) => f.name.toLowerCase().includes(q) || f.hook?.toLowerCase().includes(q),
          )
        );
      });
    }
    if (statusFilter === "live") {
      result = result.filter((p) => p.funds.some((f) => f.state === "open"));
    } else if (statusFilter === "closing_soon") {
      result = result.filter((p) => p.funds.some((f) => f.state === "open" && isClosingSoon(f)));
    }
    if (sectorFilter) {
      result = result.filter((p) => p.sector === sectorFilter);
    }
    // A project sorts by its most urgent fund.
    const lead = (p: Project) => [...p.funds].sort(compareByClosing)[0];
    return [...result].sort((a, b) => compareByClosing(lead(a), lead(b)));
  }, [projects, search, statusFilter, sectorFilter]);

  const sectorCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const project of projects) {
      counts[project.sector] = (counts[project.sector] ?? 0) + 1;
    }
    return counts;
  }, [projects]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="tracking-wide text-muted-foreground uppercase">Deals</p>
          <h1 className="text-3xl tracking-tight">Projects and funds</h1>
          <p className="text-muted-foreground">
            Each project is one company. Open a project to see the funds raising into it.
          </p>
        </div>
        <Button onClick={() => setNewDealOpen(true)}>
          <PlusIcon className="size-4" />
          New project
        </Button>
      </div>

      <NewDealDialog
        open={newDealOpen}
        onOpenChange={setNewDealOpen}
        onCreated={(fund) => navigate(`/luca/deals/${fund.id}`)}
      />

      {user?.role === "luca" && <ApprovalBand waiting={publication.waiting} funds={funds} />}

      {/* Search + status filter */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <SearchIcon className="absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search projects, companies or sectors"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 pl-11 text-base"
          />
        </div>
        <div className="flex items-center rounded-lg border bg-background p-1">
          {(["all", "live", "closing_soon"] as StatusFilter[]).map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? "secondary" : "ghost"}
              onClick={() => setStatusFilter(s)}
              className="h-9 text-sm"
            >
              {s === "all" ? "All" : s === "live" ? "Live" : "Closing soon"}
            </Button>
          ))}
        </div>
      </div>

      {/* Sector pills */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={sectorFilter === null ? "secondary" : "outline"}
          onClick={() => setSectorFilter(null)}
          className="h-9 rounded-full text-sm"
        >
          All sectors
          <span className="ml-1.5 text-muted-foreground">{projects.length}</span>
        </Button>
        {Object.entries(sectorCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([sector, count]) => (
            <Button
              key={sector}
              variant={sectorFilter === sector ? "secondary" : "outline"}
              onClick={() => setSectorFilter(sectorFilter === sector ? null : sector)}
              className="h-9 rounded-full text-sm"
            >
              {SECTOR_LABELS[sector] ?? sector}
              <span className="ml-1.5 text-muted-foreground">{count}</span>
            </Button>
          ))}
      </div>

      {isLoading && <p className="py-12 text-center text-muted-foreground">Loading projects...</p>}

      {!isLoading && funds.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">No projects found.</p>
      )}

      {!isLoading && funds.length > 0 && filtered.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">No projects match your filters.</p>
      )}

      {filtered.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project) => (
            <ProjectCard
              key={project.key}
              project={project}
              status={projectStatus(project, publication.versions, publication.unpublished)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
