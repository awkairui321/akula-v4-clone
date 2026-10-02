import { Fragment, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/currency";
import {
  VERIFICATION_LABELS,
  type AccreditationStatus,
  type AdminInvestor,
  type AdminPartner,
  type AdminSubscription,
  type ActivityResponse,
  type IdentityStatus,
  type InvestorDetailResponse,
  type PlatformEvent,
} from "../types";
import { KanbanCard, SubscriptionDialog } from "../subscriptions";
import type { Holding } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CheckIcon,
  TriangleAlertIcon,
  FileTextIcon,
  RefreshCcwIcon,
  MailIcon,
  SendIcon,
} from "lucide-react";

const IDENTITY_CHOICES: IdentityStatus[] = ["pending", "verified", "failed"];
const ACCREDITATION_CHOICES: AccreditationStatus[] = ["pending", "accredited", "not_accredited"];

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : "—";
}

function daysUntil(value: string | null): number | null {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function AdminInvestorDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "investors", id],
    queryFn: () => api<InvestorDetailResponse>(`/api/v1/admin/investors/${id}`),
    enabled: Boolean(id),
  });

  const { data: partnersData } = useQuery({
    queryKey: ["admin", "partners", "all"],
    queryFn: () => api<{ partners: AdminPartner[] }>("/api/v1/admin/partners"),
  });

  if (isLoading) {
    return <p className="py-12 text-center text-muted-foreground">Loading...</p>;
  }

  if (!data) {
    return <p className="py-12 text-center text-muted-foreground">Investor not found.</p>;
  }

  const { investor, verification_documents, subscriptions, holdings } = data;
  const totalHoldingsCommitted = holdings.reduce(
    (sum, h) => sum + parseFloat(h.committed_amount),
    0,
  );
  const totalDistributions = holdings.reduce((sum, h) => sum + parseFloat(h.distributions), 0);
  const eamPartner = investor.eam_firm
    ? (partnersData?.partners ?? []).find((p) => p.firm_name === investor.eam_firm)
    : undefined;

  const expiryDays = daysUntil(investor.accreditation_expiry);
  const needsReview =
    investor.verification_status === "pending" || investor.verification_status === "in_review";
  const expirySoon =
    investor.accreditation_status === "accredited" && expiryDays !== null && expiryDays <= 60;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link
        to="/luca/onboarding"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Back to onboarding
      </Link>

      {/* Unified header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{investor.full_name}</h1>
            <p className="font-mono text-xs text-muted-foreground">
              Client tag {investor.client_code}
            </p>
            <Badge>{VERIFICATION_LABELS[investor.verification_status]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {investor.email} · {investor.investor_type} · {investor.country ?? "—"} ·{" "}
            {investor.eam_firm ?? "Direct"}
          </p>
        </div>
      </div>

      {(needsReview || expirySoon) && (
        <NeedsAttentionCallout
          investor={investor}
          needsReview={needsReview}
          expirySoon={expirySoon}
          expiryDays={expiryDays}
          onReviewed={() => queryClient.invalidateQueries({ queryKey: ["admin", "investors"] })}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        <div className="space-y-6">
          <IdentityPanel investor={investor} eamPartner={eamPartner} />
        </div>

        <div className="space-y-4">
          <Tabs defaultValue="holdings">
            <TabsList>
              <TabsTrigger value="holdings">Holdings</TabsTrigger>
              <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
              <TabsTrigger value="evidence">Evidence</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="notes">
                Notes
                {investor.internal_notes.trim() && (
                  <span className="ml-1.5 size-1.5 rounded-full bg-primary" />
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="holdings">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Holdings</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {formatPrice(totalHoldingsCommitted)} committed in issued holdings ·{" "}
                    {formatPrice(totalDistributions)} distributed to date
                  </p>
                </CardHeader>
                <CardContent>
                  {holdings.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No holdings.</p>
                  ) : (
                    <HoldingsTable holdings={holdings} />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="subscriptions">
              <SubscriptionsTab subscriptions={subscriptions} />
            </TabsContent>

            <TabsContent value="evidence">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Evidence</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {verification_documents.length === 0 && (
                    <p className="text-muted-foreground">No documents submitted.</p>
                  )}
                  {verification_documents.map((document) => (
                    <div key={document.id} className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <span className="block truncate">
                          {document.document_type.replace(/_/g, " ")}
                        </span>
                        {document.notes && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {document.notes}
                          </span>
                        )}
                      </div>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {document.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(document.created_at)}
                        </span>
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history">
              <TransactionHistory investorId={investor.id} />
            </TabsContent>

            <TabsContent value="notes">
              <NotesPanel investor={investor} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function NeedsAttentionCallout({
  investor,
  needsReview,
  expirySoon,
  expiryDays,
  onReviewed,
}: {
  investor: AdminInvestor;
  needsReview: boolean;
  expirySoon: boolean;
  expiryDays: number | null;
  onReviewed: () => void;
}) {
  return (
    <div className="mb-6 space-y-4 rounded-lg border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
      <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
        <TriangleAlertIcon className="size-4 shrink-0" />
        <p className="text-sm font-medium">Needs attention</p>
      </div>
      {expirySoon && (
        <p className="text-sm text-amber-900 dark:text-amber-200">
          Accreditation{" "}
          {expiryDays !== null && expiryDays < 0
            ? "expired"
            : `expires in ${expiryDays} day${expiryDays === 1 ? "" : "s"}`}{" "}
          ({formatDate(investor.accreditation_expiry)}).
        </p>
      )}
      {needsReview && <ReviewPanel investor={investor} onReviewed={onReviewed} />}
    </div>
  );
}

function IdentityPanel({
  investor,
  eamPartner,
}: {
  investor: AdminInvestor;
  eamPartner: AdminPartner | undefined;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-6 text-sm">
        <Row label="Investor type" value={investor.investor_type} capitalize />
        <Row label="Country" value={investor.country ?? "—"} />
        <Row label="Nationality" value={investor.nationality ?? "—"} />
        <Row
          label="Institution / EAM"
          value={
            investor.eam_firm && eamPartner ? (
              <Link to={`/luca/partners/${eamPartner.id}`} className="underline underline-offset-2">
                {investor.eam_firm}
              </Link>
            ) : (
              (investor.eam_firm ?? "Direct")
            )
          }
        />
        <Separator className="my-2" />
        <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Verification
        </p>
        <VerificationRow
          label="Identity (KYC)"
          ok={investor.identity_status === "verified"}
          failed={investor.identity_status === "failed"}
          value={investor.identity_status.replace(/_/g, " ")}
        />
        <VerificationRow
          label="Accreditation"
          ok={investor.accreditation_status === "accredited"}
          failed={investor.accreditation_status === "not_accredited"}
          value={investor.accreditation_status.replace(/_/g, " ")}
        />
        <Row label="Accreditation expiry" value={formatDate(investor.accreditation_expiry)} />
        <VerificationRow
          label="CDD (NDA)"
          ok={investor.nda_status === "signed"}
          failed={false}
          value={investor.nda_status}
        />
        <Separator className="my-2" />
        <Row label="Onboarding completed" value={formatDate(investor.onboarding_completed_at)} />
        <Row label="Last reviewed" value={formatDate(investor.reviewed_at)} />
        <Row label="Committed (all-time)" value={formatPrice(investor.committed_amount)} />
        <Row label="Open subscriptions" value={String(investor.open_subscriptions)} />
      </CardContent>
    </Card>
  );
}

function VerificationRow({
  label,
  ok,
  failed,
  value,
}: {
  label: string;
  ok: boolean;
  failed: boolean;
  value: string;
}) {
  const color = ok ? "text-emerald-600" : failed ? "text-destructive" : "text-muted-foreground";
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`flex items-center gap-1 truncate text-right font-medium capitalize ${color}`}
      >
        {ok && <CheckIcon className="size-3.5 shrink-0" />}
        {value}
      </span>
    </div>
  );
}

function HoldingsTable({ holdings }: { holdings: Holding[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Deal</TableHead>
          <TableHead>State</TableHead>
          <TableHead className="text-right">Committed</TableHead>
          <TableHead className="text-right">Current NAV</TableHead>
          <TableHead className="text-right">Distributions</TableHead>
          <TableHead className="w-8" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {holdings.map((h) => {
          const isOpen = expanded === h.id;
          return (
            <Fragment key={h.id}>
              <TableRow
                className="cursor-pointer"
                onClick={() => setExpanded(isOpen ? null : h.id)}
              >
                <TableCell className="font-medium">{h.asset_name}</TableCell>
                <TableCell className="text-muted-foreground capitalize">{h.state}</TableCell>
                <TableCell className="text-right">{formatPrice(h.committed_amount)}</TableCell>
                <TableCell className="text-right">{formatPrice(h.current_nav)}</TableCell>
                <TableCell className="text-right">{formatPrice(h.distributions)}</TableCell>
                <TableCell>
                  {isOpen ? (
                    <ChevronUpIcon className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronDownIcon className="size-4 text-muted-foreground" />
                  )}
                </TableCell>
              </TableRow>
              {isOpen && (
                <TableRow>
                  <TableCell colSpan={6} className="bg-muted/30">
                    <div className="grid grid-cols-2 gap-3 py-2 text-sm sm:grid-cols-3">
                      <Row label="Units" value={h.units} />
                      <Row label="Entry price/share" value={formatPrice(h.entry_price_per_share)} />
                      <Row label="Sector" value={h.sector} />
                      <Row label="Subscribed" value={formatDate(h.subscribed_at)} />
                      <Row label="NAV as of" value={h.nav_as_of ? formatDate(h.nav_as_of) : "—"} />
                      {h.state === "realized" ? (
                        <>
                          <Row label="Exit date" value={formatDate(h.exit_date)} />
                          <Row label="Exit type" value={h.exit_type ?? "—"} />
                          <Row
                            label="Final proceeds"
                            value={h.final_proceeds ? formatPrice(h.final_proceeds) : "—"}
                          />
                          <Row label="MOIC" value={h.moic ? `${h.moic}x` : "—"} />
                        </>
                      ) : (
                        <Row label="MOIC" value={h.moic ? `${h.moic}x` : "Not yet realized"} />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

function SubscriptionsTab({ subscriptions }: { subscriptions: AdminSubscription[] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<AdminSubscription | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Subscriptions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {subscriptions.length === 0 && (
          <p className="text-sm text-muted-foreground">No subscriptions.</p>
        )}
        {subscriptions.map((subscription) => (
          <KanbanCard
            key={subscription.id}
            subscription={subscription}
            onClick={() => setOpen(subscription)}
          />
        ))}
      </CardContent>
      {open && (
        <SubscriptionDialog
          subscription={open}
          onClose={() => setOpen(null)}
          onMoved={(updated) => {
            setOpen(updated);
            queryClient.invalidateQueries({ queryKey: ["admin", "investors"] });
          }}
        />
      )}
    </Card>
  );
}

const EVENT_ICON: Record<PlatformEvent["kind"], typeof FileTextIcon> = {
  subscription_submitted: SendIcon,
  status_change: RefreshCcwIcon,
  document_uploaded: FileTextIcon,
  communication_sent: MailIcon,
  deal_status_change: TriangleAlertIcon,
};

function TransactionHistory({ investorId }: { investorId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "activity", "investor", investorId],
    queryFn: () => api<ActivityResponse>(`/api/v1/admin/activity?investor_id=${investorId}`),
  });
  const events = data?.events ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Transaction history</CardTitle>
        <p className="text-sm text-muted-foreground">
          Every subscription, status change and document event LUCA has on record for this investor.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {!isLoading && events.length === 0 && (
          <p className="text-sm text-muted-foreground">No recorded events yet.</p>
        )}
        {events.map((event) => {
          const Icon = EVENT_ICON[event.kind] ?? RefreshCcwIcon;
          return (
            <div key={event.id} className="flex items-start gap-3 text-sm">
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1">{event.message}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDate(event.created_at)}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function NotesPanel({ investor }: { investor: AdminInvestor }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState(investor.internal_notes);

  const save = useMutation({
    mutationFn: () =>
      api<{ investor: AdminInvestor }>(`/api/v1/admin/investors/${investor.id}/notes`, {
        method: "PATCH",
        body: { notes },
      }),
    onSuccess: () => {
      toast.success("Notes saved.");
      queryClient.invalidateQueries({ queryKey: ["admin", "investors", String(investor.id)] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Internal notes</CardTitle>
        <p className="text-sm text-muted-foreground">
          Private to LUCA — never visible to the investor, their EAM or RM.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          rows={8}
          value={notes}
          placeholder="Anything worth remembering about this investor..."
          onChange={(e) => setNotes(e.target.value)}
        />
        <Button
          size="sm"
          disabled={save.isPending || notes === investor.internal_notes}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving..." : "Save notes"}
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Identity and accreditation are the two facts a reviewer establishes; the
 * overall verification status is derived from them server-side and is never
 * set directly here.
 */
function ReviewPanel({
  investor,
  onReviewed,
}: {
  investor: AdminInvestor;
  onReviewed: () => void;
}) {
  const [identity, setIdentity] = useState<IdentityStatus | null>(null);
  const [accreditation, setAccreditation] = useState<AccreditationStatus | null>(null);

  const review = useMutation({
    mutationFn: () =>
      api<{ investor: AdminInvestor }>(`/api/v1/admin/investors/${investor.id}/verification`, {
        method: "PATCH",
        body: {
          identity_status: identity ?? undefined,
          accreditation_status: accreditation ?? undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Decision recorded.");
      setIdentity(null);
      setAccreditation(null);
      onReviewed();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Identity</Label>
          <div className="flex flex-wrap gap-2">
            {IDENTITY_CHOICES.map((choice) => (
              <Button
                key={choice}
                size="sm"
                variant={identity === choice ? "secondary" : "outline"}
                onClick={() => setIdentity(choice === identity ? null : choice)}
              >
                {choice === investor.identity_status && (
                  <CheckIcon className="size-3.5 text-muted-foreground" />
                )}
                {choice.replace(/_/g, " ")}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Accreditation</Label>
          <div className="flex flex-wrap gap-2">
            {ACCREDITATION_CHOICES.map((choice) => (
              <Button
                key={choice}
                size="sm"
                variant={accreditation === choice ? "secondary" : "outline"}
                onClick={() => setAccreditation(choice === accreditation ? null : choice)}
              >
                {choice === investor.accreditation_status && (
                  <CheckIcon className="size-3.5 text-muted-foreground" />
                )}
                {choice.replace(/_/g, " ")}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <Button
        disabled={review.isPending || (!identity && !accreditation)}
        onClick={() => review.mutate()}
      >
        Record decision
      </Button>
    </div>
  );
}

function Row({
  label,
  value,
  capitalize,
}: {
  label: string;
  value: string | React.ReactNode;
  capitalize?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={`truncate text-right font-medium ${capitalize ? "capitalize" : ""}`}>
        {value}
      </span>
    </div>
  );
}
