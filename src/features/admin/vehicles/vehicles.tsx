import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SECTOR_LABELS, DEAL_DOCUMENT_KINDS } from "@/lib/types";
import type { Fund, Tag } from "@/lib/types";
import type { AdminDocument } from "../types";
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
import {
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  FileTextIcon,
  PlusIcon,
  SearchIcon,
  UploadIcon,
} from "lucide-react";

/** Days remaining until a close date, or null when the fund is open-ended. */
function daysUntil(dateString: string | null): number | null {
  if (!dateString) return null;
  const diff = new Date(dateString).getTime() - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatClose(days: number | null): string {
  if (days === null) return "Open-ended";
  if (days === 0) return "Closed";
  return days === 1 ? "1 day" : `${days} days`;
}

type Allocation = {
  allocated: number;
  total: number | null;
  pct: number | null;
};

function allocationOf(fund: Fund): Allocation {
  const allocated = parseFloat(fund.supply_allocated);
  const total = fund.supply_total ? parseFloat(fund.supply_total) : null;
  return {
    allocated,
    total,
    pct: total && total > 0 ? Math.min(100, Math.round((allocated / total) * 100)) : null,
  };
}

/** Last reported round valuation is free text on the asset (e.g. "$157B"). */
function lastRoundValuation(fund: Fund): string {
  const rounds = fund.asset.funding_rounds;
  return rounds.length > 0 ? rounds[rounds.length - 1].valuation : "—";
}

function StateBadge({ days }: { days: number | null }) {
  const closingSoon = days !== null && days <= 7;
  return (
    <Badge variant={closingSoon ? "destructive" : "default"} className="text-[10px]">
      {closingSoon ? "Closing soon" : "Live"}
    </Badge>
  );
}

function VehicleCard({
  fund,
  tagCount,
  selected,
  onSelect,
}: {
  fund: Fund;
  tagCount: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const days = daysUntil(fund.closes_at);
  const { allocated, total, pct } = allocationOf(fund);
  const urgent = days !== null && days <= 7;

  return (
    <Card
      onClick={onSelect}
      className={`flex h-full cursor-pointer flex-col transition-shadow hover:ring-2 hover:ring-primary/20 ${
        selected ? "ring-2 ring-primary" : ""
      }`}
    >
      <CardContent className="flex flex-1 flex-col gap-3 pt-6">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{fund.codename}</p>
            <p className="truncate text-sm text-muted-foreground">
              {fund.asset.name} · {fund.fund_manager.name}
            </p>
          </div>
          <StateBadge days={days} />
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
                <div
                  className={`h-full rounded-full ${urgent ? "bg-destructive" : "bg-primary"}`}
                  style={{ width: `${pct}%` }}
                />
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
              {formatClose(days)}
            </span>
            <Link
              to={`/luca/deals/${fund.id}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-primary hover:underline"
            >
              Overview
              <ArrowRightIcon className="size-3.5" />
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function VehicleDetail({
  fund,
  library,
  onToggleTag,
  savingTags,
  tagError,
  documents,
  onUploaded,
}: {
  fund: Fund;
  library: Tag[];
  onToggleTag: (tag: Tag) => void;
  savingTags: boolean;
  tagError: string | null;
  documents: AdminDocument[];
  onUploaded: () => void;
}) {
  const tags = fund.tags;
  const applied = new Set(tags.map((t) => t.id));
  const [kind, setKind] = useState(DEAL_DOCUMENT_KINDS[0].value);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: (file: File) =>
      new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read the file"));
        reader.onload = async () => {
          try {
            await api("/api/v1/admin/documents", {
              method: "POST",
              body: {
                document: {
                  name: file.name,
                  kind,
                  fund_id: fund.id,
                  file_data_url: reader.result as string,
                },
              },
            });
            resolve();
          } catch (err) {
            reject(err as Error);
          }
        };
        reader.readAsDataURL(file);
      }),
    onSuccess: () => {
      setUploadError(null);
      onUploaded();
    },
    onError: (e: Error) => setUploadError(e.message),
  });

  const investorVisible = documents.length;

  return (
    <div className="@container mx-auto flex w-19/20 flex-col">
      {/* Published overview */}
      <Card className="drop-shadow-lg">
        <CardContent className="px-6 py-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="tracking-wide text-muted-foreground uppercase">Published overview</p>
              <h3 className="mt-1 text-2xl">{fund.codename}</h3>
              <p className="text-sm text-muted-foreground">
                Open the published deal to edit individual sections.
              </p>
            </div>
            <div className="gap- flex flex-wrap">
              <Button
                variant="outline"
                size="sm"
                disabled
                title="Preview API pending"
                //TODO
              >
                Preview as EAM
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled
                title="Preview API pending"
                //TODO
              >
                Preview as investor
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Materials & distribution */}
      <Card className="drop-shadow-lg">
        <CardContent className="space-y-4 px-6 py-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="tracking-wide text-muted-foreground uppercase">
                Materials &amp; distribution
              </p>
              <h3 className="mt-1 text-2xl">Deal documents</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Factsheet, offering memorandum, subscription agreement template, risk disclosure or
                other supporting material for this deal.
              </p>
            </div>
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              {investorVisible} uploaded
            </Badge>
          </div>

          <div className="flex flex-row items-center gap-6">
            <div className="space-y-1.5">
              <Label className="text-xs">Document kind</Label>
              <Select value={kind} onValueChange={(val) => setKind(val as string)}>
                <SelectTrigger className="w-full bg-muted sm:w-64">
                  <SelectValue>
                    {DEAL_DOCUMENT_KINDS.find((k) => k.value === kind)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {DEAL_DOCUMENT_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <label
              htmlFor="vehicle-material-upload"
              className="flex w-full cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed bg-muted px-4 py-8 text-center transition-colors hover:bg-muted/50"
            >
              <UploadIcon className="size-5 text-muted-foreground" />
              <span className="text-sm font-medium">
                {upload.isPending ? "Uploading..." : "Choose a PDF to upload"}
              </span>
              <span className="text-xs text-muted-foreground">
                Uploaded as: {DEAL_DOCUMENT_KINDS.find((k) => k.value === kind)?.label}
              </span>
              <input
                id="vehicle-material-upload"
                type="file"
                accept="application/pdf"
                className="hidden"
                disabled={upload.isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) upload.mutate(file);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}

          {documents.length > 0 && (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm"
                >
                  <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{doc.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {doc.kind.replace(/_/g, " ")}
                    </p>
                  </div>
                  {doc.file_data_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => window.open(doc.file_data_url!, "_blank")}
                    >
                      View
                    </Button>
                  )}
                  <Badge variant="outline" className="shrink-0 text-[10px] capitalize">
                    {doc.review_state}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          <p className="rounded-lg border bg-muted p-4 text-xs text-muted-foreground">
            Uploaded materials are visible to LUCA immediately and flow to the investor deal page
            and EAM overview from this same record.
          </p>
        </CardContent>
      </Card>

      {/* Shared tag library */}
      <Card className="drop-shadow-lg">
        <CardContent className="space-y-3 px-6 py-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="tracking-wide text-muted-foreground uppercase">Shared tag library</p>
              <h3 className="mt-1 text-2xl">Vehicle tags</h3>
            </div>
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              {tags.length} applied
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            These exact tags are compared with EAM client tags. Changes appear in adviser review
            prompts after publication.
          </p>

          <div className="grid gap-2 @md:grid-cols-2">
            {library.map((tag) => {
              const on = applied.has(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => onToggleTag(tag)}
                  disabled={savingTags}
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-60 ${
                    on ? "border-primary bg-muted" : "hover:bg-muted/50"
                  }`}
                >
                  <span className="text-muted-foreground">
                    {on ? (
                      <CheckIcon className="size-4 text-primary" />
                    ) : (
                      <PlusIcon className="size-4" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{tag.name}</span>
                    <span className="block text-xs text-muted-foreground">{tag.category}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {tagError && <p className="text-sm text-destructive">{tagError}</p>}

          {/* TODO: Add actual number of clients */}
          <p className="rounded-lg border bg-muted p-4 text-muted-foreground">
            2 referred clients currently share at least one tag. Akula surfaces the overlap to EAMs
            but does not recommend or highlight the vehicle.
          </p>
        </CardContent>
      </Card>

      {/* EAM launch packet */}
      <Card className="bg-muted/50 drop-shadow-lg">
        <CardContent className="space-y-3 px-6 py-2">
          <p className="tracking-wide text-muted-foreground uppercase">EAM launch packet</p>
          <div className="grid grid-cols-2 gap-4 @xl:grid-cols-4">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Terms and pricing</p>
              <p className="text-sm font-medium">TODO</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Risks and disclosure</p>
              <p className="text-sm font-medium">
                {fund.asset.risks.length > 0
                  ? `${fund.asset.risks.length} disclosed`
                  : "Not started"}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Vehicle tags</p>
              <p className="text-sm font-medium">{tags.length} applied</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Client materials</p>
              <p className="text-sm font-medium">{investorVisible} investor-visible</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
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
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newDealOpen, setNewDealOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);

  const { data: fundsData, isLoading } = useQuery({
    queryKey: ["admin", "funds"],
    queryFn: () => api<{ funds: Fund[] }>("/api/v1/funds"),
  });

  const { data: docsData } = useQuery({
    queryKey: ["admin", "documents"],
    queryFn: () => api<{ documents: AdminDocument[] }>("/api/v1/admin/documents"),
  });

  const { data: tagsData } = useQuery({
    queryKey: ["tags"],
    queryFn: () => api<{ tags: Tag[] }>("/api/v1/tags"),
  });

  const funds = fundsData?.funds ?? [];
  const documents = docsData?.documents ?? [];
  const library = tagsData?.tags ?? [];

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
    return result;
  }, [funds, search, statusFilter, sectorFilter]);

  const sectorCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of funds) {
      counts[f.asset.sector] = (counts[f.asset.sector] ?? 0) + 1;
    }
    return counts;
  }, [funds]);

  const selected = filtered.find((f) => f.id === selectedId) ?? filtered[0] ?? null;

  // The vehicle owns the complete tag set, so a toggle posts the whole list.
  const saveTags = useMutation({
    mutationFn: ({ fund, tagIds }: { fund: Fund; tagIds: number[] }) =>
      api<{ fund: Fund }>(`/api/v1/funds/${fund.id}`, {
        method: "PATCH",
        body: { fund: { tag_ids: tagIds } },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "funds"] }),
  });

  const toggleTag = (fund: Fund, tag: Tag) => {
    const current = fund.tags.map((t) => t.id);
    const tagIds = current.includes(tag.id)
      ? current.filter((id) => id !== tag.id)
      : [...current, tag.id];
    saveTags.mutate({ fund, tagIds });
  };

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
        onCreated={(fund) => setSelectedId(fund.id)}
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

      {selected && (
        <div className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((fund) => (
              <VehicleCard
                key={fund.id}
                fund={fund}
                tagCount={fund.tags.length}
                selected={fund.id === selected.id}
                onSelect={() => setSelectedId(fund.id)}
              />
            ))}
          </div>

          <VehicleDetail
            key={selected.id}
            fund={selected}
            library={library}
            onToggleTag={(tag) => toggleTag(selected, tag)}
            savingTags={saveTags.isPending}
            tagError={saveTags.isError ? saveTags.error.message : null}
            documents={documents.filter((d) => d.fund_id === selected.id)}
            onUploaded={() => queryClient.invalidateQueries({ queryKey: ["admin", "documents"] })}
          />
        </div>
      )}
    </div>
  );
}
