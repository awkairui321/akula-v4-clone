import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SECTOR_LABELS, DEAL_DOCUMENT_KINDS } from "@/lib/types";
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
import PublicationBar from "./publication-bar";
import DealReview from "./deal-review";
import DealVersions from "./deal-versions";
import { usePublication } from "./use-publication";
import { useAuth } from "@/contexts/auth-context";
import { StateBadge, daysUntil, formatClose } from "./deal-status";

const TABS = ["review", "overview", "subscriptions", "documents", "versions"] as const;
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
        backTo="/ops?surface=Publication"
        backLabel="Back to Ops publication"
        onEditDeal={() => setEditorOpen(true)}
      />
    </>
  );
}

/** One fund's workspace: overview (fees included), documents and versions; subscriptions are manager-only. */
function DealWorkspace({ fund }: { fund: Fund }) {
  const { user } = useAuth();
  const manager = user?.role === "luca";
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const tab: DealTab = (TABS as readonly string[]).includes(requested ?? "")
    ? (requested as DealTab)
    : "overview";
  const publication = usePublication();
  const dealVersions = publication.versions.filter((v) => v.fundId === fund.id);
  // The Fund Manager reviews what the Investment Team submitted; the deal opens on that review.
  const pending = manager ? dealVersions.find((v) => v.status === "review") : undefined;
  const hasTabParam = searchParams.has("tab");
  const visibleTab =
    tab === "review" && !pending
      ? "overview"
      : !manager && tab === "subscriptions"
        ? "overview"
        : pending && !hasTabParam
          ? "review"
          : tab;
  const [editorOpen, setEditorOpen] = useState(false);
  const [preview, setPreview] = useState<"eam" | "investor" | null>(null);

  const { data: docsData } = useQuery({
    queryKey: ["admin", "documents"],
    queryFn: () => api<{ documents: AdminDocument[] }>("/api/v1/admin/documents"),
  });
  const { data: subsData } = useQuery({
    queryKey: ["admin", "subscriptions", "board"],
    queryFn: () => api<SubscriptionsResponse>("/api/v1/admin/subscriptions"),
    enabled: manager,
  });
  const subscriptionCount = (subsData?.subscriptions ?? []).filter(
    (s) => s.fund_id === fund.id,
  ).length;
  const documentCount = (docsData?.documents ?? []).filter(
    (d) =>
      d.fund_id === fund.id &&
      d.subscription_id === null &&
      DEAL_DOCUMENT_KINDS.some((kind) => kind.value === d.kind),
  ).length;

  const days = daysUntil(fund.closes_at);

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
          to={`/luca/projects/${fund.asset.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          {fund.codename}
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{fund.name}</h1>
              <StateBadge fund={fund} />
            </div>
            <p className="mt-1 text-muted-foreground">
              {fund.codename} · {SECTOR_LABELS[fund.asset.sector] ?? fund.asset.sector}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setPreview("eam")}>
              Preview as EAM
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPreview("investor")}>
              Preview as investor
            </Button>
            <PublicationBar fund={fund} actionsOnly />
          </div>
        </div>
      </div>

      <PublicationBar fund={fund} onEdit={() => setEditorOpen(true)} />

      <Tabs
        value={visibleTab}
        onValueChange={(value) => {
          if (value !== visibleTab) setSearchParams({ tab: String(value) });
        }}
      >
        <TabsList variant="line" className="w-full justify-start border-b">
          {pending && (
            <TabsTrigger value="review" className="flex-none">
              <span className="flex items-center gap-2">
                Review <span className="size-2 rounded-full bg-amber-500" aria-hidden />
              </span>
            </TabsTrigger>
          )}
          <TabsTrigger value="overview" className="flex-none">
            Overview
          </TabsTrigger>
          {manager && (
            <TabsTrigger value="subscriptions" className="flex-none">
              <span className="flex items-center gap-2">
                Subscriptions <Count n={subscriptionCount} />
              </span>
            </TabsTrigger>
          )}
          <TabsTrigger value="documents" className="flex-none">
            <span className="flex items-center gap-2">
              Documents <Count n={documentCount} />
            </span>
          </TabsTrigger>
          <TabsTrigger value="versions" className="flex-none">
            Versions
          </TabsTrigger>
        </TabsList>
        {pending && (
          <TabsContent value="review" className="pt-6">
            <DealReview fund={fund} version={pending} onPreview={() => setPreview("investor")} />
          </TabsContent>
        )}
        <TabsContent value="versions" className="pt-6">
          <DealVersions versions={dealVersions} />
        </TabsContent>
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
          {manager && <DealSubscriptions fund={fund} />}
        </TabsContent>
        <TabsContent value="documents" className="pt-6">
          <DealDocuments fund={fund} />
        </TabsContent>
      </Tabs>
      <section aria-label="Investment terms">
        <h2 className="text-lg font-semibold">Investment terms</h2>{" "}
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 border-y py-5 lg:grid-cols-5">
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
            <p className="text-xs text-muted-foreground">Fees</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {fund.subscription_fee_pct}% · {fund.management_fee_pct}% ·{" "}
              {fund.carried_interest_pct}%
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Subscription · management · carry</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Readiness</p>
            <p className="mt-1 text-sm">
              {fund.asset.risks.length} risks · {documentCount} documents
            </p>
          </div>
        </div>
      </section>

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
        <Link to={ops ? "/ops?surface=Publication" : "/luca/deals"}>
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
