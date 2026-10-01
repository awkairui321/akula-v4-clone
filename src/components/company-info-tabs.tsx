import { type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatPricePrecise } from "@/lib/currency";
import {
  ShieldAlertIcon,
  TrendingUpIcon,
  SparklesIcon,
  BarChart3Icon,
  FileTextIcon,
  DownloadIcon,
  FolderLockIcon,
} from "lucide-react";
import type { Fund, Document } from "@/lib/types";
import { SECTOR_LABELS, STAGE_LABELS } from "@/lib/types";

/* ─── Fact Row ─── */
function FactRow({ label, value }: { label: string; value: ReactNode | undefined | null }) {
  return (
    <div className="flex justify-between py-2.5 first:pt-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value ?? "Not disclosed"}</span>
    </div>
  );
}

/* ─── Tab Callout ─── */
function TabCallout({ text }: { text: string }) {
  return (
    <div className="rounded-r-md border-l-4 border-primary bg-muted/50 p-4">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

/* ─── Company Overview Tab ─── */
function OverviewTab({ fund }: { fund: Fund }) {
  const { asset } = fund;
  const lastRound =
    asset.funding_rounds?.length > 0 ? asset.funding_rounds[asset.funding_rounds.length - 1] : null;

  return (
    <div className="space-y-6">
      {(asset.about || asset.description) && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">What the company does</h3>
          {asset.description && <p className="text-sm font-semibold">{asset.description}</p>}
          {asset.about && (
            <div className="space-y-3 text-sm text-muted-foreground">
              {asset.about.split("\n\n").map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Company facts</h3>
        <div className="divide-y text-sm">
          <FactRow label="Legal name" value={asset.legal_name ?? asset.name} />
          <FactRow label="Founded" value={asset.founded_year?.toString()} />
          <FactRow label="Headquarters" value={asset.headquarters} />
          <FactRow label="Country of incorporation" value={asset.country_of_incorporation} />
          <FactRow
            label="Employees"
            value={asset.employee_count ? asset.employee_count.toLocaleString() : "Not disclosed"}
          />
          <FactRow label="Sector" value={SECTOR_LABELS[asset.sector] ?? asset.sector} />
          {asset.sub_sector && <FactRow label="Sub-sector" value={asset.sub_sector} />}
          <FactRow label="Stage" value={STAGE_LABELS[asset.funding_stage] ?? asset.funding_stage} />
          {lastRound && (
            <FactRow label="Last round" value={`${lastRound.round} · ${lastRound.date}`} />
          )}
          {lastRound?.valuation && (
            <FactRow label="Post-money valuation at last round" value={lastRound.valuation} />
          )}
          {asset.total_capital_raised && (
            <FactRow label="Total capital raised to date" value={asset.total_capital_raised} />
          )}
          {asset.company_structure && (
            <FactRow label="Company structure" value={asset.company_structure} />
          )}
          {asset.website && (
            <FactRow
              label="Website"
              value={
                <a
                  href={asset.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  {asset.website.replace(/^https?:\/\//, "")}
                </a>
              }
            />
          )}
        </div>
      </div>

      {asset.notable_investors?.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Notable investors</h3>
          <div className="flex flex-wrap gap-1.5">
            {asset.notable_investors.map((inv) => (
              <Badge key={inv} variant="outline">
                {inv}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {asset.team?.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Management team</h3>
          <div className="divide-y text-sm">
            {asset.team.map((t, i) => (
              <div key={i} className="flex justify-between py-2.5 first:pt-0 last:pb-0">
                <span className="font-medium">{t.name}</span>
                <span className="text-muted-foreground">{t.role}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Market Tab ─── */
function MarketTab({ fund }: { fund: Fund }) {
  const { asset } = fund;
  const rounds = asset.funding_rounds ?? [];

  return (
    <div className="space-y-6">
      {rounds.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3Icon className="size-4" />
              Valuation history
            </CardTitle>
            <CardDescription>Primary rounds and reported valuations over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {rounds.map((r, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="relative flex flex-col items-center">
                    <div
                      className={`size-3 rounded-full ${
                        i === rounds.length - 1 ? "bg-primary" : "bg-muted-foreground/30"
                      }`}
                    />
                    {i < rounds.length - 1 && <div className="absolute top-3 h-8 w-px bg-border" />}
                  </div>
                  <div className="flex flex-1 items-baseline justify-between">
                    <div>
                      <span className="text-sm font-medium">{r.round}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{r.date}</span>
                      {r.lead && (
                        <span className="ml-2 text-xs text-muted-foreground">· {r.lead}</span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium">{r.valuation}</span>
                      {r.raised && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          raised {r.raised}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {fund.implied_valuation && (
              <>
                <Separator className="my-4" />
                <div className="flex items-center gap-3">
                  <div className="size-3 rounded-full bg-primary ring-2 ring-primary/20" />
                  <div className="flex flex-1 items-baseline justify-between">
                    <div>
                      <span className="text-sm font-medium">Fund entry basis</span>
                      <span className="ml-2 text-xs text-muted-foreground">Current</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium">
                        ${parseFloat(fund.implied_valuation).toLocaleString()}
                      </span>
                      {fund.premium_pct && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          +{fund.premium_pct}% to last round
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {asset.developments?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Deal activity</CardTitle>
            <CardDescription>
              Recent events and developments relevant to this opportunity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {asset.developments.map((d, i) => (
                <div key={i} className="flex gap-3">
                  <div className="relative flex flex-col items-center">
                    <div className="mt-1.5 size-2 rounded-full bg-primary" />
                    {i < asset.developments.length - 1 && (
                      <div className="mt-1 w-px flex-1 bg-border" />
                    )}
                  </div>
                  <div className="pb-4">
                    <p className="font-mono text-xs text-muted-foreground">{d.date}</p>
                    <p className="text-sm">{d.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ─── Business Tab ─── */
function BusinessTab({ fund }: { fund: Fund }) {
  const { asset } = fund;
  return (
    <div className="space-y-6">
      {asset.thesis && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SparklesIcon className="size-4" />
              Opportunity review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{asset.thesis}</p>
          </CardContent>
        </Card>
      )}

      {asset.highlights?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUpIcon className="size-4" />
              Potential strengths
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {asset.highlights.map((h, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="mt-0.5 shrink-0 text-green-600">•</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ─── Risks Tab ─── */
function RisksTab({ fund }: { fund: Fund }) {
  const { asset } = fund;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlertIcon className="size-4" />
            Key risks
          </CardTitle>
          <CardDescription>
            Private market investments carry material risk. Capital loss up to the full amount
            invested is possible.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-4">
            {asset.risks.map((r, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="mt-0.5 shrink-0 text-amber-500">!</span>
                <div>
                  <p className="font-medium">{r.title}</p>
                  <p className="mt-0.5 text-muted-foreground">{r.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>General risk factors</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span className="mt-0.5 shrink-0 text-amber-500">!</span>
              <span>
                Illiquid investment — no public market for these shares. Exit timing and pricing are
                uncertain.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 shrink-0 text-amber-500">!</span>
              <span>Right of first refusal (ROFR) may delay or prevent allocation of shares.</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 shrink-0 text-amber-500">!</span>
              <span>
                Private company valuations are subjective and may not reflect realizable value.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 shrink-0 text-amber-500">!</span>
              <span>
                Past performance and current valuation are not indicative of future results.
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Financials Tab ─── */
function FinancialsTab({ fund }: { fund: Fund }) {
  const { asset } = fund;
  const rounds = asset.funding_rounds ?? [];
  if (rounds.length === 0)
    return <p className="text-sm text-muted-foreground">No funding round data available.</p>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Funding rounds</CardTitle>
          <CardDescription>{rounds.length} rounds</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {rounds.map((r, i) => (
              <div key={i} className="space-y-1 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{r.round}</span>
                    <span className="text-xs text-muted-foreground">{r.date}</span>
                    {i === rounds.length - 1 && <Badge variant="secondary">Latest</Badge>}
                  </div>
                  <span className="text-sm font-medium">{r.valuation}</span>
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  {r.raised && <span>Raised {r.raised}</span>}
                  {r.lead && <span>Lead: {r.lead}</span>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {fund.implied_valuation && (
        <Card>
          <CardHeader>
            <CardTitle>Valuation context</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-y-3 text-sm">
              {rounds.length > 0 && (
                <>
                  <span className="text-muted-foreground">Last primary round</span>
                  <span className="text-right font-medium">
                    {rounds[rounds.length - 1].valuation}
                  </span>
                </>
              )}
              <span className="text-muted-foreground">Fund entry valuation</span>
              <span className="text-right font-medium">
                ${parseFloat(fund.implied_valuation).toLocaleString()}
              </span>
              {fund.premium_pct && (
                <>
                  <span className="text-muted-foreground">Premium to last round</span>
                  <span className="text-right font-medium">+{fund.premium_pct}%</span>
                </>
              )}
              <span className="text-muted-foreground">Price per share</span>
              <span className="text-right font-medium">{formatPricePrecise(fund.price)}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ─── Documents Tab ─── */
function DocumentsTab({ fund }: { fund: Fund }) {
  const { data, isLoading } = useQuery({
    queryKey: ["documents", { fund_id: fund.id }],
    queryFn: () => api<{ documents: Document[] }>(`/api/v1/documents?fund_id=${fund.id}`),
  });

  const documents = data?.documents ?? [];

  const KIND_LABELS: Record<string, string> = {
    agreement: "Agreement",
    termsheet: "Term Sheet",
    factsheet: "Factsheet",
    deck: "Pitch Deck",
    memo: "Memo",
    tax: "Tax Document",
    statement: "Statement",
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading documents...</p>;
  }

  return (
    <div className="space-y-6">
      {documents.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileTextIcon className="size-4" />
              Deal materials
            </CardTitle>
            <CardDescription>
              {documents.length} document{documents.length !== 1 && "s"} available for this
              opportunity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{doc.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {KIND_LABELS[doc.kind] ?? doc.kind} ·{" "}
                        {new Date(doc.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  {doc.has_file && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.open(`/api/v1/documents/${doc.id}/download`, "_blank")}
                    >
                      <DownloadIcon className="mr-1 size-4" />
                      Download
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-2 py-8 text-center">
            <FileTextIcon className="mx-auto size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No deal documents available yet.</p>
          </CardContent>
        </Card>
      )}

      <Card className="border-dashed">
        <CardContent className="py-6">
          <div className="flex items-center gap-3">
            <FolderLockIcon className="size-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Data room</p>
              <p className="text-xs text-muted-foreground">
                Additional due diligence materials may be available upon request. Contact Akula for
                access.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Main Exported Component ─── */
export function CompanyInfoTabs({ fund }: { fund: Fund }) {
  const hasBusinessContent = fund.asset.thesis || fund.asset.highlights?.length > 0;
  const hasRisks = fund.asset.risks?.length > 0;
  const hasMarketData =
    fund.asset.funding_rounds?.length > 0 || fund.asset.developments?.length > 0;
  const hasFinancials = fund.asset.funding_rounds?.length > 0;

  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        {hasMarketData && <TabsTrigger value="market">Market</TabsTrigger>}
        {hasBusinessContent && <TabsTrigger value="business">Business model</TabsTrigger>}
        {hasFinancials && <TabsTrigger value="financials">Financials</TabsTrigger>}
        {hasRisks && <TabsTrigger value="risks">Risks</TabsTrigger>}
        <TabsTrigger value="documents">Documents</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="mt-4 space-y-4">
        <TabCallout text="This tab describes what the company does, how it is structured and who has backed it." />
        <OverviewTab fund={fund} />
      </TabsContent>
      {hasMarketData && (
        <TabsContent value="market" className="mt-4 space-y-4">
          <TabCallout text="This tab shows the company's valuation history across primary funding rounds and how the fund's entry price compares." />
          <MarketTab fund={fund} />
        </TabsContent>
      )}
      {hasBusinessContent && (
        <TabsContent value="business" className="mt-4 space-y-4">
          <TabCallout text="This tab covers the investment thesis, potential strengths, and strategic positioning of the company." />
          <BusinessTab fund={fund} />
        </TabsContent>
      )}
      {hasFinancials && (
        <TabsContent value="financials" className="mt-4 space-y-4">
          <TabCallout text="This tab lists every funding round on record with the valuation, amount raised and lead investor." />
          <FinancialsTab fund={fund} />
        </TabsContent>
      )}
      {hasRisks && (
        <TabsContent value="risks" className="mt-4 space-y-4">
          <TabCallout text="This tab lists risks specific to this company and general risks that apply to all private-market investments." />
          <RisksTab fund={fund} />
        </TabsContent>
      )}
      <TabsContent value="documents" className="mt-4 space-y-4">
        <TabCallout text="Deal materials, term sheets and other documents available for this opportunity." />
        <DocumentsTab fund={fund} />
      </TabsContent>
    </Tabs>
  );
}
