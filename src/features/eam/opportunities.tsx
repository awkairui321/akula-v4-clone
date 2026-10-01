import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatPrice, formatPricePrecise } from "@/lib/currency";
import { SECTOR_LABELS, STAGE_LABELS } from "@/lib/types";
import type { EamFund, AdviserClient } from "./types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  SearchIcon,
  StarIcon,
  ClockIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FileTextIcon,
} from "lucide-react";

function formatCountdown(dateString: string | null): string | null {
  if (!dateString) return null;
  const target = new Date(dateString);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return "Closed";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days > 1) return `${days} days`;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  return `${hours}h`;
}

function InlineHighlightComposer({ fund }: { fund: EamFund }) {
  const queryClient = useQueryClient();
  const [selectedClientName, setSelectedClientName] = useState<string | null>(null);
  const [rationale, setRationale] = useState("");

  const { data: clients } = useQuery({
    queryKey: ["eamClients"],
    queryFn: () => api<AdviserClient[]>("/api/v1/eam/clients"),
  });

  const clientList = clients ?? [];
  const selectedClient = clientList.find((c) => c.client_name === selectedClientName);

  const mutation = useMutation({
    mutationFn: () =>
      api("/api/v1/eam/highlights", {
        method: "POST",
        body: {
          highlight: {
            adviser_client_id: selectedClient?.id,
            fund_id: fund.id,
            rationale,
          },
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eamDashboard"] });
      queryClient.invalidateQueries({ queryKey: ["eamHighlights"] });
      setSelectedClientName(null);
      setRationale("");
    },
  });

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-center gap-2">
          <StarIcon className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Highlight to a client</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Client</Label>
            <Select
              value={selectedClientName ?? undefined}
              onValueChange={(val) => setSelectedClientName(val)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a client" />
              </SelectTrigger>
              <SelectContent>
                {clientList.map((c) => (
                  <SelectItem key={c.id} value={c.client_name}>
                    {c.client_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Rationale</Label>
            <Textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Why is this a good fit?"
              rows={1}
              className="min-h-9"
            />
          </div>
        </div>
        <Button
          size="sm"
          disabled={!selectedClient || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Sending..." : "Publish highlight"}
        </Button>
      </CardContent>
    </Card>
  );
}

function TermGrid({ fund }: { fund: EamFund }) {
  const countdown = formatCountdown(fund.closes_at);

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div>
        <p className="text-xs text-muted-foreground">Minimum</p>
        <p className="text-sm font-medium">{formatPricePrecise(fund.min_subscription)}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Closes</p>
        <p className="text-sm font-medium">{countdown ?? "Open-ended"}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Entry price</p>
        <p className="text-sm font-medium">{formatPricePrecise(fund.price)}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Upfront fee</p>
        <p className="text-sm font-medium">
          {fund.subscription_fee_pct ? `${fund.subscription_fee_pct}%` : "—"}
        </p>
      </div>
    </div>
  );
}

function DealRow({
  fund,
  expanded,
  onToggle,
}: {
  fund: EamFund;
  expanded: boolean;
  onToggle: () => void;
}) {
  const countdown = formatCountdown(fund.closes_at);
  const allocated = parseFloat(fund.supply_allocated);
  const total = fund.supply_total ? parseFloat(fund.supply_total) : null;
  const pct = total && total > 0 ? Math.min(100, Math.round((allocated / total) * 100)) : null;

  return (
    <div className="border-b last:border-0">
      {/* Row header — always visible */}
      <button
        className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-muted/50"
        onClick={onToggle}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{fund.codename}</span>
            <span className="text-xs text-muted-foreground">{fund.asset.name}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Badge variant="secondary" className="text-[10px]">
            {SECTOR_LABELS[fund.asset.sector] ?? fund.asset.sector}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {fund.deal_type === "primary" ? "Primary" : "Secondary"}
          </Badge>
          {countdown && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ClockIcon className="size-3" />
              {countdown}
            </span>
          )}
          {pct !== null && <span className="text-xs text-muted-foreground">{pct}%</span>}
          {expanded ? (
            <ChevronUpIcon className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDownIcon className="size-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="space-y-5 border-t bg-muted/30 px-4 py-5">
          {/* Overview */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs tracking-wide text-muted-foreground uppercase">
                Selected opportunity
              </p>
              <h3 className="mt-1 text-lg font-semibold">{fund.codename}</h3>
              <p className="text-sm text-muted-foreground">
                Underlying holding: {fund.asset.name}
                {fund.fund_manager?.name ? ` · ${fund.fund_manager.name}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link to={`/eam/opportunities/${fund.id}`}>
                <Button variant="outline" size="sm">
                  Open full overview
                </Button>
              </Link>
              <Badge variant="default" className="text-[10px]">
                {fund.state === "open" ? "Open" : fund.state}
              </Badge>
            </div>
          </div>

          {/* About */}
          {(fund.asset.about || fund.asset.description || fund.hook) && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {fund.asset.about || fund.asset.description || fund.hook}
            </p>
          )}

          {/* Term grid */}
          <TermGrid fund={fund} />

          {/* Allocation progress */}
          {pct !== null && total && (
            <div className="space-y-1.5">
              <Progress value={pct} className="h-1.5" />
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{formatPrice(total - allocated)} available</span>
                <span>{pct}% allocated</span>
              </div>
            </div>
          )}

          {/* Vehicle tags */}
          <div>
            <p className="mb-2 text-xs tracking-wide text-muted-foreground uppercase">
              Vehicle tags
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary" className="text-[10px]">
                {SECTOR_LABELS[fund.asset.sector] ?? fund.asset.sector}
              </Badge>
              {fund.asset.sub_sector && (
                <Badge variant="secondary" className="text-[10px]">
                  {fund.asset.sub_sector}
                </Badge>
              )}
              {fund.asset.funding_stage && (
                <Badge variant="secondary" className="text-[10px]">
                  {STAGE_LABELS[fund.asset.funding_stage] ?? fund.asset.funding_stage}
                </Badge>
              )}
              {fund.asset.country && (
                <Badge variant="secondary" className="text-[10px]">
                  {fund.asset.country}
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px]">
                {fund.deal_type === "primary" ? "Primary" : "Secondary"}
              </Badge>
            </div>
          </div>

          <Separator />

          {/* Inline highlight composer */}
          <InlineHighlightComposer fund={fund} />

          <Separator />

          {/* Launch materials placeholder */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs tracking-wide text-muted-foreground uppercase">
                  Launch materials
                </p>
                <p className="mt-1 text-sm font-medium">Documents for {fund.codename}</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm">
                <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">Factsheet</p>
                  <p className="text-xs text-muted-foreground">Fund overview and key terms</p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  EAM + investor
                </Badge>
              </div>
              <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm">
                <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">Pitch deck</p>
                  <p className="text-xs text-muted-foreground">
                    Company overview and investment thesis
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  EAM only
                </Badge>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OpportunitiesPage() {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [autoExpanded, setAutoExpanded] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["eamOpportunities"],
    queryFn: () => api<{ funds: EamFund[] }>("/api/v1/eam/opportunities"),
  });

  const funds = data?.funds ?? [];

  // Auto-expand first fund once data loads
  if (funds.length > 0 && expandedId === null && !autoExpanded) {
    setExpandedId(funds[0].id);
    setAutoExpanded(true);
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return funds;
    const q = search.toLowerCase();
    return funds.filter(
      (f) =>
        f.codename.toLowerCase().includes(q) ||
        f.asset.name.toLowerCase().includes(q) ||
        f.fund_manager.name.toLowerCase().includes(q) ||
        (SECTOR_LABELS[f.asset.sector] ?? f.asset.sector).toLowerCase().includes(q),
    );
  }, [funds, search]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Opportunities</h1>
          <p className="text-muted-foreground">
            Explore and highlight opportunities for your clients.
          </p>
        </div>
        {funds.length > 0 && <Badge variant="default">{funds.length} available</Badge>}
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search funds, companies or sectors"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {isLoading && (
        <p className="py-12 text-center text-muted-foreground">Loading opportunities...</p>
      )}

      {!isLoading && funds.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">
          No opportunities available right now.
        </p>
      )}

      {!isLoading && funds.length > 0 && filtered.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">
          No opportunities match your search.
        </p>
      )}

      {filtered.length > 0 && (
        <div className="rounded-lg border">
          {filtered.map((fund) => (
            <DealRow
              key={fund.id}
              fund={fund}
              expanded={expandedId === fund.id}
              onToggle={() => setExpandedId((current) => (current === fund.id ? null : fund.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
