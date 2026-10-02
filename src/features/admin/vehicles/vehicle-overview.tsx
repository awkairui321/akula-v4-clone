import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SECTOR_LABELS } from "@/lib/types";
import type { Fund } from "@/lib/types";
import type { AdminDocument, SubscriptionsResponse } from "../types";
import { formatPrice, formatPricePrecise } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeftIcon } from "lucide-react";
import DealOverviewPage from "@/components/deal-overview-page";
import PublishedDealEditor from "@/features/admin/vehicles/published-deal-editor";
import DealDocuments from "./deal-documents";
import DealSubscriptions from "./deal-subscriptions";
import DealTags from "./deal-tags";
import InvestorPricing from "./investor-pricing";
import { StateBadge, allocationOf, daysUntil, formatClose } from "./deal-status";

const TABS = ["overview", "subscriptions", "documents", "tags", "pricing"] as const;
type DealTab = (typeof TABS)[number];

function Count({ n }: { n: number }) {
  return (
    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
      {n}
    </span>
  );
}

/** Ops publication keeps the plain published-deal view. */
function OpsVehicleOverview({ fund }: { fund: Fund }) {
  const [editorOpen, setEditorOpen] = useState(false);
  return (
    <>
      <PublishedDealEditor
        key={`${fund.id}-${editorOpen}`}
        fund={fund}
        open={editorOpen}
        onOpenChange={setEditorOpen}
      />
      <DealOverviewPage
        key={fund.id}
        fund={fund}
        viewer="ops"
        backTo="/workflows"
        backLabel="Back to Ops publication"
        onEditDeal={() => setEditorOpen(true)}
      />
    </>
  );
}

/** The fund manager's workspace for one deal: overview, documents, tags and investor pricing. */
function DealWorkspace({ fund }: { fund: Fund }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const tab: DealTab = (TABS as readonly string[]).includes(requested ?? "")
    ? (requested as DealTab)
    : "overview";
  const [editorOpen, setEditorOpen] = useState(false);
  const [preview, setPreview] = useState<"eam" | "investor" | null>(null);

  const { data: docsData } = useQuery({
    queryKey: ["admin", "documents"],
    queryFn: () => api<{ documents: AdminDocument[] }>("/api/v1/admin/documents"),
  });
  const { data: pricingData } = useQuery({
    queryKey: ["admin", "investor-pricing", fund.id],
    queryFn: () => api<{ overrides: unknown[] }>(`/api/v1/admin/funds/${fund.id}/investor_pricing`),
  });
  const { data: subsData } = useQuery({
    queryKey: ["admin", "subscriptions", "board"],
    queryFn: () => api<SubscriptionsResponse>("/api/v1/admin/subscriptions"),
  });
  const subscriptionCount = (subsData?.subscriptions ?? []).filter(
    (s) => s.fund_id === fund.id,
  ).length;
  const documentCount = (docsData?.documents ?? []).filter(
    (d) => d.fund_id === fund.id && d.subscription_id === null,
  ).length;
  const pricingCount = pricingData?.overrides.length ?? 0;

  const days = daysUntil(fund.closes_at);
  const { allocated, total, pct } = allocationOf(fund);

  return (
    <div className="flex w-full flex-col gap-8">
      <PublishedDealEditor
        key={`${fund.id}-${editorOpen}`}
        fund={fund}
        open={editorOpen}
        onOpenChange={setEditorOpen}
      />

      <div className="space-y-6">
        <Link
          to="/luca/deals"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          All deals
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{fund.codename}</h1>
              <StateBadge fund={fund} />
            </div>
            <p className="mt-1 text-muted-foreground">
              {fund.asset.name} · {SECTOR_LABELS[fund.asset.sector] ?? fund.asset.sector} ·{" "}
              {fund.name}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setPreview("eam")}>
              Preview as EAM
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPreview("investor")}>
              Preview as investor
            </Button>
            <Button size="sm" onClick={() => setEditorOpen(true)}>
              Edit published overview
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-5 border-y py-5 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
          <div className="col-span-2 lg:col-span-1">
            <p className="text-xs text-muted-foreground">Committed</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {formatPrice(allocated)}
              {total !== null && (
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  of {formatPrice(total)}
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
            <p className="text-xs text-muted-foreground">Closes</p>
            <p className="mt-1 text-xl font-semibold">
              {fund.closes_at && days !== null && days > 0
                ? new Date(fund.closes_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })
                : formatClose(days)}
            </p>
            {days !== null && days > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">in {formatClose(days)}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Price / unit</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {formatPricePrecise(fund.price)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Minimum</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {formatPrice(fund.min_subscription)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Readiness</p>
            <p className="mt-1 text-sm">
              {fund.asset.risks.length} risks · {fund.tags.length} tags · {documentCount} docs
            </p>
          </div>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setSearchParams({ tab: String(value) }, { replace: true })}
      >
        <TabsList variant="line" className="w-full justify-start border-b">
          <TabsTrigger value="overview" className="flex-none">
            Overview
          </TabsTrigger>
          <TabsTrigger value="subscriptions" className="flex-none">
            <span className="flex items-center gap-2">
              Subscriptions <Count n={subscriptionCount} />
            </span>
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex-none">
            <span className="flex items-center gap-2">
              Documents <Count n={documentCount} />
            </span>
          </TabsTrigger>
          <TabsTrigger value="tags" className="flex-none">
            <span className="flex items-center gap-2">
              Tags <Count n={fund.tags.length} />
            </span>
          </TabsTrigger>
          <TabsTrigger value="pricing" className="flex-none">
            <span className="flex items-center gap-2">
              Investor pricing <Count n={pricingCount} />
            </span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="pt-6">
          <DealOverviewPage
            key={fund.id}
            fund={fund}
            viewer="luca"
            backTo="/luca/deals"
            backLabel="All deals"
            onEditDeal={() => setEditorOpen(true)}
            embedded
          />
        </TabsContent>
        <TabsContent value="subscriptions" className="pt-6">
          <DealSubscriptions fund={fund} />
        </TabsContent>
        <TabsContent value="documents" className="pt-6">
          <DealDocuments fund={fund} />
        </TabsContent>
        <TabsContent value="tags" className="pt-6">
          <DealTags fund={fund} />
        </TabsContent>
        <TabsContent value="pricing" className="pt-6">
          <InvestorPricing fund={fund} />
        </TabsContent>
      </Tabs>

      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-h-[94vh] max-w-[96vw] overflow-y-auto p-4 sm:max-w-6xl">
          <DialogTitle className="sr-only">
            {preview === "eam" ? "EAM" : "Investor"} opportunity preview
          </DialogTitle>
          {preview && (
            <DealOverviewPage
              key={`${fund.id}-${preview}`}
              fund={fund}
              viewer={preview}
              backTo=""
              backLabel=""
              preview
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminVehicleOverviewPage({ ops = false }: { ops?: boolean }) {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ["fund", Number(id)],
    queryFn: () => api<{ fund: Fund }>(`/api/v1/funds/${id}`),
    enabled: !!id,
  });

  if (isLoading) {
    return <p className="py-12 text-center text-muted-foreground">Loading deal...</p>;
  }

  const fund = data?.fund;
  if (!fund) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">Deal not found.</p>
        <Link to={ops ? "/workflows" : "/luca/deals"}>
          <Button variant="outline" size="sm" className="mt-4">
            <ArrowLeftIcon className="mr-1 size-4" />
            Back to deals
          </Button>
        </Link>
      </div>
    );
  }

  return ops ? (
    <OpsVehicleOverview key={fund.id} fund={fund} />
  ) : (
    <DealWorkspace key={fund.id} fund={fund} />
  );
}
