import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SECTOR_LABELS } from "@/lib/types";
import type { Fund } from "@/lib/types";
import { daysUntil, formatClose, allocationOf, StateBadge } from "./deal-status";
import { formatPrice, formatPriceCompact, formatPricePrecise } from "@/lib/currency";
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

/** Last reported round valuation is free text on the asset (e.g. "$157B"). */
function lastRoundValuation(fund: Fund): string {
  const rounds = fund.asset.funding_rounds;
  return rounds.length > 0 ? rounds[rounds.length - 1].valuation : "—";
}

/** Whole card is the link: click anywhere to open the deal. */
function VehicleCard({ fund, tagCount }: { fund: Fund; tagCount: number }) {
  const days = daysUntil(fund.closes_at);
  const { allocated, total, pct } = allocationOf(fund);

  return (
    <Link
      to={`/luca/deals/${fund.id}`}
      aria-label={`Open ${fund.codename}`}
      className="group block h-full rounded-xl focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
    >
      <Card className="flex h-full flex-col transition-shadow group-hover:ring-2 group-hover:ring-primary/30">
        <CardContent className="flex flex-1 flex-col gap-3 pt-6">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">{fund.codename}</p>
              <p className="truncate text-sm text-muted-foreground">
                {fund.asset.name} · {fund.fund_manager.name}
              </p>
            </div>
            <StateBadge fund={fund} />
          </div>

          <p className="line-clamp-2 text-sm text-muted-foreground">
            {fund.hook || fund.asset.description}
          </p>

          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="text-[10px]">
              {SECTOR_LABELS[fund.asset.sector] ?? fund.asset.sector}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {fund.deal_type === "primary" ? "Primary" : "Secondary"}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {tagCount} tag{tagCount === 1 ? "" : "s"}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <span className="text-muted-foreground">Company valuation</span>
            <span className="text-right font-medium">{lastRoundValuation(fund)}</span>
            <span className="text-muted-foreground">Acquired valuation</span>
            <span className="text-right font-medium">
              {fund.implied_valuation ? formatPriceCompact(fund.implied_valuation) : "—"}
            </span>
            <span className="text-muted-foreground">Price / share</span>
            <span className="text-right font-medium">{formatPricePrecise(fund.price)}</span>
            <span className="text-muted-foreground">Minimum</span>
            <span className="text-right font-medium">{formatPrice(fund.min_subscription)}</span>
          </div>

          <div className="mt-auto space-y-2 pt-1">
            {pct !== null && total !== null ? (
              <div className="space-y-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted-foreground/20">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>
                    {formatPrice(allocated)} of {formatPrice(total)} committed
                  </span>
                  <span>{pct}%</span>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {formatPrice(allocated)} committed · no cap set
              </p>
            )}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <ClockIcon className="size-3.5" />
                {fund.closes_at && days !== null && days > 0
                  ? `Closes ${formatCloseDate(fund.closes_at)} · ${formatClose(days)}`
                  : formatClose(days)}
              </span>
              <span className="flex items-center gap-1 text-primary group-hover:underline">
                Open deal
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
            <p className="tracking-wide text-muted-foreground uppercase">New deal</p>
            <DialogTitle className="mt-1">Add a deal under LUCA's terms</DialogTitle>
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

  const filtered = useMemo(() => {
    let result = funds;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((f) => {
        const sectorLabel = SECTOR_LABELS[f.asset.sector] ?? f.asset.sector;
        return (
          f.name.toLowerCase().includes(q) ||
          f.codename.toLowerCase().includes(q) ||
          f.asset.name.toLowerCase().includes(q) ||
          sectorLabel.toLowerCase().includes(q) ||
          f.hook?.toLowerCase().includes(q)
        );
      });
    }
    if (statusFilter === "live") {
      result = result.filter((f) => f.state === "open");
    } else if (statusFilter === "closing_soon") {
      result = result.filter((f) => f.state === "open" && isClosingSoon(f));
    }
    if (sectorFilter) {
      result = result.filter((f) => f.asset.sector === sectorFilter);
    }
    return [...result].sort(compareByClosing);
  }, [funds, search, statusFilter, sectorFilter]);

  const sectorCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of funds) {
      counts[f.asset.sector] = (counts[f.asset.sector] ?? 0) + 1;
    }
    return counts;
  }, [funds]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="tracking-wide text-muted-foreground uppercase">Deal state management</p>
          <h1 className="text-3xl tracking-tight">Vehicles and opportunities</h1>
          <p className="text-muted-foreground">
            Prepare the canonical opportunity review and materials shared with EAMs and investors.
          </p>
        </div>
        <Button onClick={() => setNewDealOpen(true)}>
          <PlusIcon className="size-4" />
          New deal
        </Button>
      </div>

      <NewDealDialog
        open={newDealOpen}
        onOpenChange={setNewDealOpen}
        onCreated={(fund) => navigate(`/luca/deals/${fund.id}`)}
      />

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
          <span className="ml-1.5 text-muted-foreground">{funds.length}</span>
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

      {isLoading && <p className="py-12 text-center text-muted-foreground">Loading vehicles...</p>}

      {!isLoading && funds.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">No vehicles found.</p>
      )}

      {!isLoading && funds.length > 0 && filtered.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">No vehicles match your filters.</p>
      )}

      {filtered.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((fund) => (
            <VehicleCard key={fund.id} fund={fund} tagCount={fund.tags.length} />
          ))}
        </div>
      )}
    </div>
  );
}
