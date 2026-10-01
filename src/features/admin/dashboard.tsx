import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import type { Fund } from "@/lib/types";
import { LUCA_PIPELINE_STAGES } from "@/lib/types";
import { formatPrice } from "@/lib/currency";
import type {
  ActivityResponse,
  AdminSubscription,
  DocumentsResponse,
  InvestorsResponse,
  SubscriptionsResponse,
} from "./types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, CreditCard, UsersIcon, BanknoteIcon, ClockIcon } from "lucide-react";

/** Statuses that count as "funded" — money is confirmed on its way to escrow
 * or already there. Distinct from AUM, which is broader (see below). */
const FUNDED_STATUSES = ["reconciliation", "allocation_pending", "allocated"];
/** AUM: committed capital that's either moving toward funding or already an
 * active holding — the LUCA dashboard's "funded or in active holding" definition. */
const AUM_STATUSES = [...FUNDED_STATUSES, "awaiting_funds", "payment_unmatched"];
const STAGE_OWNER: Record<string, string> = {
  draft: "Investor",
  awaiting_signature: "Investor",
  institution_review: "EAM / institution",
  under_luca_review: "LUCA",
  information_requested: "Investor / EAM",
  approved: "Investor",
  funded: "Investor → Akula Ops → LUCA",
  active_holding: "Akula Ops",
};

function daysSince(iso: string | null): number {
  if (!iso) return -1;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString();
}

export default function AdminDashboard() {
  const { data: fundsData, isLoading: fundsLoading } = useQuery({
    queryKey: ["admin", "funds"],
    queryFn: () => api<{ funds: Fund[] }>("/api/v1/funds"),
  });

  // Unfiltered — used to compute AUM, the pipeline bar and the stuck-item lists.
  const { data: allSubsData, isLoading: allSubsLoading } = useQuery({
    queryKey: ["admin", "subscriptions", "all"],
    queryFn: () => api<SubscriptionsResponse>("/api/v1/admin/subscriptions"),
  });

  const { data: investorsData, isLoading: investorsLoading } = useQuery({
    queryKey: ["admin", "investors", "summary"],
    queryFn: () => api<InvestorsResponse>("/api/v1/admin/investors?needs_review=true"),
  });

  const { data: documentsData, isLoading: documentsLoading } = useQuery({
    queryKey: ["admin", "documents", "summary"],
    queryFn: () => api<DocumentsResponse>("/api/v1/admin/documents?review_state=received"),
  });

  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ["admin", "activity"],
    queryFn: () => api<ActivityResponse>("/api/v1/admin/activity"),
  });

  const funds = fundsData?.funds ?? [];
  const activeDeals = funds.filter((f) => f.state === "open" || f.state === "closing").length;

  const allSubs = allSubsData?.subscriptions ?? [];
  const aum = allSubs
    .filter((s) => AUM_STATUSES.includes(s.status))
    .reduce((sum, s) => sum + parseFloat(s.amount), 0);
  const funded = allSubs
    .filter((s) => FUNDED_STATUSES.includes(s.status))
    .reduce((sum, s) => sum + parseFloat(s.amount), 0);
  const pendingReview = allSubs.filter((s) => s.status === "under_luca_review").length;

  const investors = investorsData?.summary;
  const documents = documentsData?.summary;
  const events = activityData?.events ?? [];

  const stuckInReview = allSubs
    .filter((s) => s.status === "under_luca_review" && daysSince(s.institution_reviewed_at) > 5)
    .sort((a, b) => daysSince(b.institution_reviewed_at) - daysSince(a.institution_reviewed_at));
  const stuckAwaitingInstitution = allSubs
    .filter(
      (s) => s.status === "information_requested" && daysSince(s.information_requested_at) > 5,
    )
    .sort((a, b) => daysSince(b.information_requested_at) - daysSince(a.information_requested_at));

  const isLoading =
    fundsLoading || allSubsLoading || investorsLoading || documentsLoading || activityLoading;

  if (isLoading) {
    return <p className="py-12 text-center text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-4">
        <div>
          <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
            LUCA · Fund manager
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Operations overview</h1>
          <p className="mt-1 text-muted-foreground">
            A clear view of capital, live deals and decisions requiring attention.
          </p>
        </div>
        <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
          <div>
            <span className="text-muted-foreground">Needs attention </span>
            <strong>
              {pendingReview + (investors?.needs_review ?? 0) + (documents?.received ?? 0)}
            </strong>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <Link to="/luca/onboarding" className="underline underline-offset-2">
              Investor reviews · {investors?.needs_review ?? 0}
            </Link>
            <Link
              to="/luca/subscriptions?status=under_luca_review"
              className="underline underline-offset-2"
            >
              LUCA decisions · {pendingReview}
            </Link>
            <Link to="/luca/documents" className="underline underline-offset-2">
              New documents · {documents?.received ?? 0}
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Capital in motion"
          icon={BanknoteIcon}
          value={formatPrice(aum)}
          note="Funded and active commitments"
          to="/luca/subscriptions?stage=funded"
        />
        <StatCard
          title="Funding & reconciliation"
          icon={CreditCard}
          value={formatPrice(funded)}
          note="Transfers through allocation"
          to="/luca/subscriptions?stage=funded"
        />
        <StatCard
          title="Active deals"
          icon={TrendingUp}
          value={String(activeDeals)}
          note={`${funds.length} total`}
          to="/luca/deals"
        />
        <StatCard
          title="Awaiting LUCA review"
          icon={UsersIcon}
          value={String(pendingReview)}
          note="Open the review queue"
          to="/luca/subscriptions?status=under_luca_review"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subscription pipeline</CardTitle>
          <p className="text-sm text-muted-foreground">
            Select a stage to see its subscriptions, next owner, and available actions.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {LUCA_PIPELINE_STAGES.map((stage) => {
              const count = allSubs.filter((s) => stage.statuses.includes(s.status)).length;
              const to = `/luca/subscriptions?stage=${stage.key}`;
              return (
                <Link
                  key={stage.key}
                  to={to}
                  className="rounded-lg border p-3 text-center transition-colors hover:bg-muted/50"
                >
                  <div className="text-xl font-bold">{count}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{stage.label}</div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    Next: {STAGE_OWNER[stage.key] ?? "Review record"}
                  </div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <StuckList
          title="Waiting on LUCA (>5 days)"
          empty="Nothing is stuck in LUCA review."
          items={stuckInReview}
          dayField="institution_reviewed_at"
        />
        <StuckList
          title="Waiting on institution (>5 days)"
          empty="No overdue information requests."
          items={stuckAwaitingInstitution}
          dayField="information_requested_at"
        />
      </div>

      {investors && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-base">Accreditation expiring</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3">
            <ExpiryBand days={30} count={investors.accreditation_expiring_30} />
            <ExpiryBand days={60} count={investors.accreditation_expiring_60} />
            <ExpiryBand days={90} count={investors.accreditation_expiring_90} />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {events.length === 0 && (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            )}
            {events.map((event) => (
              <div key={event.id} className="flex items-start justify-between gap-4 text-sm">
                <span>{event.message}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDate(event.created_at)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Received</span>
              <span className="font-medium">{documents?.received ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Filed</span>
              <span className="font-medium">{documents?.filed ?? 0}</span>
            </div>
            <Link
              to="/luca/documents"
              className="mt-2 inline-block text-xs text-muted-foreground underline hover:text-foreground"
            >
              Open Documents
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

type IconType = typeof CreditCard;

function StatCard({
  title,
  icon: Icon,
  value,
  note,
  to,
}: {
  title: string;
  icon: IconType;
  value: string;
  note?: string;
  to: string;
}) {
  return (
    <Link to={to}>
      <Card className="h-full transition-colors hover:bg-muted/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
            <Icon className="size-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{value}</div>
          {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
        </CardContent>
      </Card>
    </Link>
  );
}

function StuckList({
  title,
  empty,
  items,
  dayField,
}: {
  title: string;
  empty: string;
  items: AdminSubscription[];
  dayField: "institution_reviewed_at" | "information_requested_at";
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClockIcon className="size-4 text-amber-600" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 && <p className="text-sm text-muted-foreground">{empty}</p>}
        {items.map((sub) => (
          <Link
            key={sub.id}
            to={`/luca/subscriptions?status=${sub.status}`}
            className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm transition-colors hover:bg-muted/50"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{sub.investor_name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {sub.asset_name} · {sub.eam_firm ?? "Direct"}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-medium">{formatPrice(sub.amount)}</p>
              <p className="text-xs text-muted-foreground">{daysSince(sub[dayField])}d</p>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function ExpiryBand({ days, count }: { days: number; count: number }) {
  return (
    <Link
      to="/luca/onboarding"
      className="rounded-lg border p-3 text-center transition-colors hover:bg-muted/50"
    >
      <div className="text-xl font-bold">{count}</div>
      <div className="mt-1 text-xs text-muted-foreground">Next {days} days</div>
    </Link>
  );
}
