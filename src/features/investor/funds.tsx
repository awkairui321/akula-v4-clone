import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { SECTOR_LABELS } from "@/lib/types";
import type { Fund } from "@/lib/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { formatPrice, formatPriceCompact, formatPricePrecise } from "@/lib/currency";
import { ArrowRightIcon, ClockIcon, SearchIcon, CompassIcon } from "lucide-react";
import "./opportunities.css";

function formatCountdown(dateString: string | null): string | null {
  if (!dateString) return null;
  const target = new Date(dateString);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return "Closed";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days > 1) return `${days} days left`;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  return `${hours}h left`;
}

function FundCard({ fund }: { fund: Fund }) {
  const countdown = formatCountdown(fund.closes_at);
  const allocated = parseFloat(fund.supply_allocated);
  const total = fund.supply_total ? parseFloat(fund.supply_total) : null;
  const pct = total && total > 0 ? Math.min(100, Math.round((allocated / total) * 100)) : null;
  const remaining = total ? total - allocated : null;

  return (
    <Link to={`/funds/${fund.id}`} className="opportunity-link">
      <Card className="opportunity-card flex h-full flex-col transition-shadow hover:ring-2 hover:ring-primary/20">
        <div className="opportunity-card-art">
          <span>{fund.asset.name.slice(0, 1)}</span>
          <small>{SECTOR_LABELS[fund.asset.sector] ?? fund.asset.sector}</small>
        </div>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="truncate">{fund.codename}</CardTitle>
              <CardDescription className="truncate">
                {fund.asset.name} · {fund.fund_manager.name}
              </CardDescription>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Badge variant="outline" className="text-[10px]">
                {fund.deal_type === "primary" ? "Primary" : "Secondary"}
              </Badge>
              <Badge variant="default" className="text-[10px]">
                Open
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 space-y-3">
          {fund.hook && <p className="line-clamp-2 text-sm text-muted-foreground">{fund.hook}</p>}

          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="text-[10px]">
              {SECTOR_LABELS[fund.asset.sector] ?? fund.asset.sector}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {fund.share_class.class_type.replace(/_/g, " ")}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {fund.asset.funding_rounds?.length > 0 && (
              <>
                <span className="text-muted-foreground">Company valuation</span>
                <span className="text-right font-medium">
                  {fund.asset.funding_rounds[fund.asset.funding_rounds.length - 1].valuation}
                </span>
              </>
            )}
            {fund.implied_valuation && (
              <>
                <span className="text-muted-foreground">Acquired valuation</span>
                <span className="text-right font-medium">
                  {formatPriceCompact(fund.implied_valuation!)}
                </span>
              </>
            )}
            <span className="text-muted-foreground">Price / share</span>
            <span className="text-right font-medium">{formatPricePrecise(fund.price)}</span>
            <span className="text-muted-foreground">Min. ticket</span>
            <span className="text-right font-medium">{formatPrice(fund.min_subscription)}</span>
          </div>
        </CardContent>
        <CardFooter className="flex-col gap-2">
          {pct !== null && remaining !== null && (
            <div className="w-full space-y-1">
              <Progress value={pct} className="h-1.5" />
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{formatPrice(remaining)} available</span>
                <span>{pct}% allocated</span>
              </div>
            </div>
          )}
          <div className="flex w-full justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <ClockIcon className="size-3.5" />
              {countdown ?? "Open-ended"}
            </span>
            <ArrowRightIcon className="size-4" />
          </div>
        </CardFooter>
      </Card>
    </Link>
  );
}

type StatusFilter = "all" | "live" | "closing_soon";

function isClosingSoon(fund: Fund): boolean {
  if (!fund.closes_at) return false;
  const diff = new Date(fund.closes_at).getTime() - Date.now();
  return diff > 0 && diff <= 30 * 24 * 60 * 60 * 1000; // within 30 days
}

export default function FundsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["funds"],
    queryFn: () => api<{ funds: Fund[] }>("/api/v1/funds"),
  });

  const funds = data?.funds ?? [];

  const filtered = useMemo(() => {
    let result = funds;

    // Text search across name, codename, asset name, sector label, fund manager
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((f) => {
        const sectorLabel = SECTOR_LABELS[f.asset.sector] ?? f.asset.sector;
        return (
          f.name.toLowerCase().includes(q) ||
          f.codename.toLowerCase().includes(q) ||
          f.asset.name.toLowerCase().includes(q) ||
          sectorLabel.toLowerCase().includes(q) ||
          f.fund_manager.name.toLowerCase().includes(q) ||
          f.hook?.toLowerCase().includes(q)
        );
      });
    }

    // Status filter
    if (statusFilter === "live") {
      result = result.filter((f) => f.state === "open");
    } else if (statusFilter === "closing_soon") {
      result = result.filter((f) => f.state === "open" && isClosingSoon(f));
    }

    // Sector filter
    if (sectorFilter) {
      result = result.filter((f) => f.asset.sector === sectorFilter);
    }

    return result;
  }, [funds, search, statusFilter, sectorFilter]);

  // Sector counts from current status-filtered funds (not sector-filtered)
  const sectorCounts = useMemo(() => {
    let base = funds;
    if (search.trim()) {
      const q = search.toLowerCase();
      base = base.filter((f) => {
        const sectorLabel = SECTOR_LABELS[f.asset.sector] ?? f.asset.sector;
        return (
          f.name.toLowerCase().includes(q) ||
          f.codename.toLowerCase().includes(q) ||
          f.asset.name.toLowerCase().includes(q) ||
          sectorLabel.toLowerCase().includes(q) ||
          f.fund_manager.name.toLowerCase().includes(q) ||
          f.hook?.toLowerCase().includes(q)
        );
      });
    }
    if (statusFilter === "live") {
      base = base.filter((f) => f.state === "open");
    } else if (statusFilter === "closing_soon") {
      base = base.filter((f) => f.state === "open" && isClosingSoon(f));
    }

    const counts: Record<string, number> = {};
    for (const f of base) {
      const s = f.asset.sector;
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return counts;
  }, [funds, search, statusFilter]);

  const totalAfterStatusSearch = Object.values(sectorCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="opportunities-view flex flex-col gap-4">
      <div className="space-y-1">
        <p className="opportunities-eyebrow">YOUR INVESTMENT WORKSPACE</p>
        <h1 className="text-4xl font-medium tracking-tight">Find your next opportunity.</h1>
        <p className="max-w-2xl text-muted-foreground">
          The full published LUCA shelf, with terms and source-backed company information for every
          available deal.
        </p>
      </div>

      <p className="rounded-lg bg-muted/50 px-4 py-2 text-sm text-muted-foreground">
        All figures on this page, including minimums, valuations and fees, are shown in US dollars
        (USD).
      </p>

      {/* Search + status filter */}
      <div className="opportunity-filters flex gap-3">
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
          <span className="ml-1.5 text-muted-foreground">{totalAfterStatusSearch}</span>
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

      {/* Summary line */}
      {!isLoading && filtered.length > 0 && (
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>
            <strong className="text-foreground">
              {filtered.length} deal{filtered.length !== 1 ? "s" : ""}
            </strong>
          </span>
          <span>Minimum new subscription · $25,000</span>
        </div>
      )}

      {isLoading && (
        <p className="py-12 text-center text-muted-foreground">Loading opportunities...</p>
      )}

      {!isLoading && funds.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">
          No opportunities available right now. Check back soon.
        </p>
      )}

      {!isLoading && funds.length > 0 && filtered.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">
          No opportunities match your filters.
        </p>
      )}

      {filtered.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((fund) => (
            <FundCard key={fund.id} fund={fund} />
          ))}
        </div>
      )}

      {/* Discover link */}
      <div className="mt-8 text-center">
        <Link
          to="/discover"
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <CompassIcon className="size-4" />
          Explore companies Akula is tracking
        </Link>
      </div>
    </div>
  );
}
