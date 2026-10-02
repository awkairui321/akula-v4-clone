import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/currency";
import { CLOSED_SUBSCRIPTION_STATUSES, LUCA_PIPELINE_STAGES } from "@/lib/types";
import {
  STATUS_LABELS,
  OWNER_LABELS,
  NEXT_ACTION_LABELS,
  type AdminSubscription,
  type SubscriptionStatus,
  type SubscriptionsResponse,
  type BankTransfer,
  type BankTransfersResponse,
  type InvestorDetailResponse,
  type DocumentsResponse,
} from "./types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { StepTracker, type StepState } from "@/components/ui/step-tracker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2Icon,
  XCircleIcon,
  ClockIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "lucide-react";

const STATUS_VARIANT: Record<
  SubscriptionStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  reserved: "outline",
  documents_pending: "outline",
  institution_review: "secondary",
  under_luca_review: "secondary",
  information_requested: "secondary",
  approved: "default",
  awaiting_funds: "secondary",
  payment_unmatched: "destructive",
  reconciliation: "secondary",
  allocation_pending: "secondary",
  allocated: "default",
  not_allocated: "destructive",
  funds_returned: "destructive",
  rejected: "destructive",
  cancelled: "destructive",
};

const CLOSING_TRANSITIONS: SubscriptionStatus[] = [
  "cancelled",
  "not_allocated",
  "funds_returned",
  "rejected",
];

/** Matching a payment is the one move that carries a bank reference with it. */
const NEEDS_REFERENCE: SubscriptionStatus[] = ["payment_unmatched"];

const STAGE_GUIDANCE: Record<SubscriptionStatus, string> = {
  reserved:
    "The investor started an application. They need to confirm the required acknowledgements.",
  documents_pending:
    "The investor needs to sign the subscription documents before review can begin.",
  institution_review:
    "The external institution or EAM reviews the investor before LUCA makes its decision.",
  under_luca_review:
    "LUCA reviews eligibility and the investor file. Choose approve, request information, or decline below.",
  information_requested:
    "The investor or their adviser must provide the requested information before LUCA can continue.",
  approved: "LUCA approved the subscription. The investor now follows the funding instructions.",
  awaiting_funds:
    "The investor is arranging the transfer. Akula Ops records and matches the incoming funds.",
  payment_unmatched:
    "Akula Ops must match the incoming transfer to this subscription before reconciliation.",
  reconciliation:
    "Akula Ops checks the escrow receipt. Once reconciled, LUCA can decide the allocation.",
  allocation_pending:
    "Funding is reconciled. LUCA records the allocated principal and class unit price.",
  allocated:
    "The allocation is recorded. The operations team completes any remaining registry steps.",
  not_allocated: "This subscription was not allocated. Confirm any return of funds if one is due.",
  funds_returned: "Funds have been returned and this subscription is complete.",
  rejected: "LUCA declined this application. No funding action is expected.",
  cancelled: "This subscription was cancelled and no further action is expected.",
};

const TRANSITION_LABELS: Partial<Record<SubscriptionStatus, string>> = {
  institution_review: "Route to institution review",
  under_luca_review: "Send to LUCA review",
  information_requested: "Request missing information",
  approved: "Approve subscription",
  awaiting_funds: "Confirm approval and notify investor",
  reconciliation: "Record funds reconciled",
  allocation_pending: "Start allocation",
  allocated: "Record allocation",
  not_allocated: "Do not allocate",
  funds_returned: "Confirm funds returned",
  rejected: "Decline application",
  cancelled: "Cancel subscription",
};

export const REJECTION_REASONS = [
  { value: "accreditation_lapsed", label: "Accreditation lapsed or insufficient" },
  { value: "incomplete_documents", label: "Incomplete or missing documents" },
  { value: "failed_kyc_aml", label: "Failed KYC/AML screening" },
  { value: "institution_compliance_hold", label: "Institution compliance hold" },
  { value: "duplicate_subscription", label: "Duplicate subscription" },
  { value: "investor_withdrew", label: "Investor withdrew" },
  { value: "other", label: "Other" },
];

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : "—";
}

/* Use the same lifecycle labels and status groups on the dashboard and the
 * subscription workspace so every overview link lands on a matching stage. */
const BOARD_STAGES = [
  ...LUCA_PIPELINE_STAGES,
  { key: "closed", label: "Closed", statuses: CLOSED_SUBSCRIPTION_STATUSES },
];
/** The dialog's stepper only shows the open stages — "Closed" isn't a step
 *  to progress through, it's a terminal state handled separately. */
const STEPPER_STAGES = BOARD_STAGES.filter((s) => s.key !== "closed");

export function KanbanCard({
  subscription,
  onClick,
}: {
  subscription: AdminSubscription;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full space-y-1.5 rounded-lg border bg-card p-3 text-left text-sm shadow-sm transition-shadow hover:shadow-md hover:ring-2 hover:ring-primary/20"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="truncate font-medium">{subscription.investor_name}</span>
        {subscription.on_hold && (
          <Badge variant="outline" className="shrink-0 text-[9px]">
            Hold
          </Badge>
        )}
      </div>
      <p className="truncate text-xs text-muted-foreground">
        {subscription.asset_name} · {subscription.eam_firm ?? "Direct"}
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium tabular-nums">{formatPrice(subscription.amount)}</span>
        {subscription.payment_claimed && (
          <Badge variant="secondary" className="shrink-0 text-[9px]">
            Claimed
          </Badge>
        )}
      </div>
    </button>
  );
}

type ChecklistStatus = "present" | "pending" | "missing";

type ChecklistItem = {
  label: string;
  status: ChecklistStatus;
  detail?: string | null;
};

function buildChecklist(
  investor: InvestorDetailResponse | undefined,
  subscriptionDocs: DocumentsResponse | undefined,
): ChecklistItem[] {
  const inv = investor?.investor;
  const agreement = subscriptionDocs?.documents.find((d) => d.kind === "agreement");

  return [
    {
      label: "Identity (KYC)",
      status:
        inv?.identity_status === "verified"
          ? "present"
          : inv?.identity_status === "failed"
            ? "missing"
            : "pending",
      detail: investor?.verification_documents.find((d) => d.document_type === "passport")?.notes,
    },
    {
      label: "Accreditation",
      status:
        inv?.accreditation_status === "accredited"
          ? "present"
          : inv?.accreditation_status === "not_accredited"
            ? "missing"
            : "pending",
      detail: investor?.verification_documents.find(
        (d) => d.document_type === "accreditation_letter",
      )?.notes,
    },
    {
      label: "CDD (NDA)",
      status:
        inv?.nda_status === "signed"
          ? "present"
          : inv?.nda_status === "not_started"
            ? "missing"
            : "pending",
    },
    {
      label: "Subscription agreement",
      status: agreement?.status === "signed" ? "present" : agreement ? "pending" : "missing",
      detail: agreement ? agreement.name : "Not yet on file for this subscription",
    },
  ];
}

function ChecklistRow({ item }: { item: ChecklistItem }) {
  const Icon =
    item.status === "present"
      ? CheckCircle2Icon
      : item.status === "missing"
        ? XCircleIcon
        : ClockIcon;
  const color =
    item.status === "present"
      ? "text-emerald-600"
      : item.status === "missing"
        ? "text-destructive"
        : "text-muted-foreground";
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} />
      <div className="min-w-0">
        <p className="font-medium">{item.label}</p>
        {item.detail && <p className="truncate text-xs text-muted-foreground">{item.detail}</p>}
      </div>
    </div>
  );
}

function verificationSummary(investor: InvestorDetailResponse | undefined): string {
  if (!investor) return "Loading…";
  const inv = investor.investor;
  const mark = (ok: boolean, pending: boolean) => (ok ? "✓" : pending ? "…" : "✕");
  return [
    `KYC ${mark(inv.identity_status === "verified", inv.identity_status === "pending")}`,
    `Accreditation ${mark(inv.accreditation_status === "accredited", inv.accreditation_status === "pending")}`,
    `CDD ${mark(inv.nda_status === "signed", inv.nda_status === "pending")}`,
  ].join(" · ");
}

export function SubscriptionDialog({
  subscription,
  onClose,
  onMoved,
}: {
  subscription: AdminSubscription;
  onClose: () => void;
  onMoved: (updated: AdminSubscription) => void;
}) {
  const { data: investorDetail } = useQuery({
    queryKey: ["admin", "investor-detail", subscription.investor_id],
    queryFn: () =>
      api<InvestorDetailResponse>(`/api/v1/admin/investors/${subscription.investor_id}`),
  });
  const { data: subscriptionDocs } = useQuery({
    queryKey: ["admin", "documents", "subscription", subscription.id],
    queryFn: () =>
      api<DocumentsResponse>(`/api/v1/admin/documents?subscription_id=${subscription.id}`),
  });
  const checklist = buildChecklist(investorDetail, subscriptionDocs);
  const otherSubscriptions = (investorDetail?.subscriptions ?? []).filter(
    (s) => s.id !== subscription.id,
  );

  const isClosed = CLOSED_SUBSCRIPTION_STATUSES.includes(subscription.status);
  const stageIndex = STEPPER_STAGES.findIndex((st) =>
    (st.statuses as string[]).includes(subscription.status),
  );

  // The verification checklist is most relevant while LUCA is actively
  // deciding on this investor — auto-open it then, keep it tucked away
  // otherwise rather than always taking up space regardless of context.
  const [showVerification, setShowVerification] = useState(
    subscription.status === "under_luca_review",
  );
  const [showTimeline, setShowTimeline] = useState(false);

  const [reference, setReference] = useState(subscription.payment_reference ?? "");
  const [pendingAllocation, setPendingAllocation] = useState(false);
  const [units, setUnits] = useState("");
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [pendingInfoRequest, setPendingInfoRequest] = useState(false);
  const [infoRequestNote, setInfoRequestNote] = useState("");
  const [pendingRejection, setPendingRejection] = useState(false);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [rejectionNote, setRejectionNote] = useState("");

  const transition = useMutation({
    mutationFn: (to: SubscriptionStatus) =>
      api<{ subscription: AdminSubscription }>(
        `/api/v1/admin/subscriptions/${subscription.id}/transition`,
        {
          method: "POST",
          body: {
            to,
            payment_reference: NEEDS_REFERENCE.includes(subscription.status)
              ? reference.trim()
              : undefined,
            units: to === "allocated" ? units.trim() || undefined : undefined,
            price_per_unit: to === "allocated" ? pricePerUnit.trim() || undefined : undefined,
            information_request_note:
              to === "information_requested" ? infoRequestNote.trim() : undefined,
            rejection_reason: to === "rejected" ? (rejectionReason ?? undefined) : undefined,
            rejection_note: to === "rejected" ? rejectionNote.trim() || undefined : undefined,
          },
        },
      ),
    onSuccess: (result) => {
      toast.success(`Moved to ${STATUS_LABELS[result.subscription.status].toLowerCase()}.`);
      setPendingAllocation(false);
      setPendingInfoRequest(false);
      setPendingRejection(false);
      onMoved(result.subscription);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hold = useMutation({
    mutationFn: (on_hold: boolean) =>
      api<{ subscription: AdminSubscription }>(
        `/api/v1/admin/subscriptions/${subscription.id}/hold`,
        { method: "PATCH", body: { on_hold } },
      ),
    onSuccess: (result) => {
      toast.success(result.subscription.on_hold ? "Subscription held." : "Hold released.");
      onMoved(result.subscription);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <DialogTitle>{subscription.investor_name}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {subscription.asset_name} · {formatPrice(subscription.amount)}
              {subscription.payment_reference && (
                <>
                  {" "}
                  · <span className="font-mono text-xs">{subscription.payment_reference}</span>
                </>
              )}
            </p>
          </div>
          <Badge variant={STATUS_VARIANT[subscription.status]} className="shrink-0">
            {STATUS_LABELS[subscription.status]}
            {subscription.on_hold ? " · On hold" : ""}
          </Badge>
        </div>

        {/* Current lifecycle position */}
        {isClosed ? (
          <p className="text-sm text-muted-foreground">
            {subscription.status === "rejected" && subscription.rejection_reason
              ? `Rejected — ${
                  REJECTION_REASONS.find((r) => r.value === subscription.rejection_reason)?.label ??
                  subscription.rejection_reason
                }`
              : STATUS_LABELS[subscription.status]}
            {" · "}
            {formatDate(
              subscription.rejected_at ?? subscription.cancelled_at ?? subscription.allocated_at,
            )}
          </p>
        ) : (
          <StepTracker
            variant="bar"
            showLabels={false}
            steps={STEPPER_STAGES.map((s) => ({ key: s.key, label: s.label }))}
            getState={(key): StepState => {
              const idx = STEPPER_STAGES.findIndex((s) => s.key === key);
              return idx < stageIndex ? "done" : idx === stageIndex ? "active" : "upcoming";
            }}
          />
        )}

        <details className="rounded-lg border bg-muted/20 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">
            View full subscription lifecycle
          </summary>
          <ol className="mt-3 space-y-2 border-l pl-4 text-sm">
            {BOARD_STAGES.map((stage, index) => {
              const current = stage.statuses.includes(subscription.status);
              const complete = !isClosed && stageIndex >= 0 && index < stageIndex;
              return (
                <li
                  key={stage.key}
                  className={`relative ${current ? "font-semibold text-foreground" : complete ? "text-muted-foreground" : "text-muted-foreground/80"}`}
                >
                  <span
                    className={`absolute top-1.5 -left-[21px] size-2 rounded-full ${current ? "bg-primary ring-2 ring-primary/20" : complete ? "bg-primary/45" : "bg-border"}`}
                  />
                  {stage.label}
                  {current && (
                    <Badge className="ml-2 text-[9px]" variant="secondary">
                      Current stage
                    </Badge>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            Investor, EAM, LUCA, and Akula Ops take turns at different stages. A stage only advances
            after its owner completes the listed step.
          </p>
        </details>

        {/* The action owner and next step stay explicit at every lifecycle stage. */}
        <div className="space-y-3 rounded-lg border-2 border-primary/15 bg-primary/[0.03] p-4">
          <div className="space-y-1 text-sm">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Current stage ·{" "}
              {BOARD_STAGES.find((stage) => stage.statuses.includes(subscription.status))?.label ??
                STATUS_LABELS[subscription.status]}
            </p>
            <p className="font-semibold">
              Next step: {NEXT_ACTION_LABELS[subscription.next_action] || "No further action"}
            </p>
            <p className="text-muted-foreground">
              Action owner: {OWNER_LABELS[subscription.owner]}
            </p>
            <p className="text-muted-foreground">{STAGE_GUIDANCE[subscription.status]}</p>
          </div>

          {subscription.information_request_note && (
            <div className="rounded-lg border border-dashed p-3 text-sm">
              <p className="font-medium">Information requested</p>
              <p className="mt-1 text-muted-foreground">{subscription.information_request_note}</p>
            </div>
          )}

          {subscription.payment_claimed && (
            <div className="rounded-lg border border-dashed p-3 text-sm">
              <p className="font-medium">The investor says they sent the transfer.</p>
              <p className="mt-1 text-muted-foreground">
                A claim is not a receipt. Confirm the funds actually landed in the escrow account
                before moving this on.
              </p>
            </div>
          )}

          {NEEDS_REFERENCE.includes(subscription.status) && (
            <div className="space-y-2">
              <Label htmlFor="payment-reference">Bank reference</Label>
              <Input
                id="payment-reference"
                value={reference}
                placeholder="Reference from the bank statement"
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          )}

          {pendingAllocation && (
            <div className="space-y-3 rounded-lg border bg-card p-3">
              <p className="text-sm font-medium">Record the allocation</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="units">Units</Label>
                  <Input id="units" value={units} onChange={(e) => setUnits(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="price-per-unit">Price per unit</Label>
                  <Input
                    id="price-per-unit"
                    value={pricePerUnit}
                    onChange={(e) => setPricePerUnit(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {pendingInfoRequest && (
            <div className="space-y-2 rounded-lg border bg-card p-3">
              <Label htmlFor="info-request-note">What's missing or needed?</Label>
              <Textarea
                id="info-request-note"
                value={infoRequestNote}
                onChange={(e) => setInfoRequestNote(e.target.value)}
                placeholder="e.g. Updated proof of address dated within the last 3 months"
              />
            </div>
          )}

          {pendingRejection && (
            <div className="space-y-3 rounded-lg border bg-card p-3">
              <div className="space-y-1.5">
                <Label>Rejection reason</Label>
                <Select value={rejectionReason ?? undefined} onValueChange={setRejectionReason}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a reason…" />
                  </SelectTrigger>
                  <SelectContent>
                    {REJECTION_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rejection-note">
                  Note <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="rejection-note"
                  value={rejectionNote}
                  onChange={(e) => setRejectionNote(e.target.value)}
                />
              </div>
            </div>
          )}

          {subscription.status === "rejected" && (
            <div className="rounded-lg border border-dashed p-3 text-sm">
              <p className="font-medium">
                Rejected ·{" "}
                {REJECTION_REASONS.find((r) => r.value === subscription.rejection_reason)?.label ??
                  subscription.rejection_reason}
              </p>
              {subscription.rejection_note && (
                <p className="mt-1 text-muted-foreground">{subscription.rejection_note}</p>
              )}
            </div>
          )}

          {subscription.available_transitions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This subscription is in a terminal state and cannot be moved.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {subscription.available_transitions.map((to) => {
                const label =
                  to === "allocated" && pendingAllocation
                    ? "Confirm allocation"
                    : to === "information_requested" && pendingInfoRequest
                      ? "Send information request"
                      : to === "rejected" && pendingRejection
                        ? "Confirm rejection"
                        : (TRANSITION_LABELS[to] ?? `Continue to ${STATUS_LABELS[to]}`);
                const disabled =
                  transition.isPending ||
                  (to === "information_requested" &&
                    pendingInfoRequest &&
                    !infoRequestNote.trim()) ||
                  (to === "rejected" && pendingRejection && !rejectionReason);
                return (
                  <Button
                    key={to}
                    size="sm"
                    variant={CLOSING_TRANSITIONS.includes(to) ? "outline" : "default"}
                    disabled={disabled}
                    onClick={() => {
                      if (to === "allocated" && !pendingAllocation) {
                        setPendingAllocation(true);
                        return;
                      }
                      if (to === "information_requested" && !pendingInfoRequest) {
                        setPendingInfoRequest(true);
                        return;
                      }
                      if (to === "rejected" && !pendingRejection) {
                        setPendingRejection(true);
                        return;
                      }
                      transition.mutate(to);
                    }}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
          )}
        </div>

        {!isClosed && (
          <button
            onClick={() => hold.mutate(!subscription.on_hold)}
            disabled={hold.isPending}
            className="w-fit text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {subscription.on_hold ? "Release hold" : "Put on hold"}
          </button>
        )}

        {/* Investor verification — collapsed one-liner by default */}
        <div>
          <button
            onClick={() => setShowVerification((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-sm hover:text-foreground"
          >
            <span className="flex items-center gap-2">
              <span className="font-medium">Investor verification</span>
              <span className="text-xs text-muted-foreground">
                {verificationSummary(investorDetail)}
              </span>
            </span>
            {showVerification ? (
              <ChevronUpIcon className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
            )}
          </button>
          {showVerification && (
            <div className="mt-3 space-y-3 rounded-lg bg-muted/30 p-3">
              <div className="space-y-1 text-sm">
                <Row label="Email" value={subscription.investor_email} />
                <Row label="Placed by" value={subscription.eam_firm ?? "Direct (self-serve)"} />
                <Row label="Other open subscriptions" value={String(otherSubscriptions.length)} />
              </div>
              <Link
                to={`/luca/investors/${subscription.investor_id}`}
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                View full investor profile
              </Link>
              <Separator />
              <div className="space-y-2.5">
                {checklist.map((item) => (
                  <ChecklistRow key={item.label} item={item} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Full timeline — collapsed by default */}
        <div>
          <button
            onClick={() => setShowTimeline((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-sm hover:text-foreground"
          >
            <span className="font-medium">Full timeline</span>
            {showTimeline ? (
              <ChevronUpIcon className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
            )}
          </button>
          {showTimeline && (
            <div className="mt-3 space-y-1 rounded-lg bg-muted/30 p-3 text-sm">
              <Row label="Subscription fee" value={formatPrice(subscription.subscription_fee)} />
              <Row label="Reserved" value={formatDate(subscription.reserved_at)} />
              <Row label="Documents signed" value={formatDate(subscription.confirmed_at)} />
              <Row
                label="Institution reviewed"
                value={formatDate(subscription.institution_reviewed_at)}
              />
              <Row label="Approved" value={formatDate(subscription.approved_at)} />
              <Row label="Payment claimed" value={formatDate(subscription.payment_declared_at)} />
              <Row label="Funds received" value={formatDate(subscription.funds_received_at)} />
              <Row label="Reconciled" value={formatDate(subscription.reconciled_at)} />
              <Row label="Allocated" value={formatDate(subscription.allocated_at)} />
              {subscription.status === "rejected" && (
                <Row label="Rejected" value={formatDate(subscription.rejected_at)} />
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PaymentMatchingDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "bank-transfers"],
    queryFn: () => api<BankTransfersResponse>("/api/v1/admin/bank_transfers?matched=false"),
  });

  const { data: subsData } = useQuery({
    queryKey: ["admin", "subscriptions", "payment_unmatched", "for-matching"],
    queryFn: () =>
      api<SubscriptionsResponse>("/api/v1/admin/subscriptions?status=payment_unmatched"),
  });

  const unmatchedSubs = subsData?.subscriptions ?? [];
  const transfers = data?.bank_transfers ?? [];

  const match = useMutation({
    mutationFn: ({ transferId, subscriptionId }: { transferId: number; subscriptionId: number }) =>
      api(`/api/v1/admin/bank_transfers/${transferId}/match`, {
        method: "POST",
        body: { subscription_id: subscriptionId },
      }),
    onSuccess: () => {
      toast.success("Payment matched. Subscription moved to reconciliation.");
      queryClient.invalidateQueries({ queryKey: ["admin", "bank-transfers"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogTitle>Match incoming payments</DialogTitle>
        <p className="text-sm text-muted-foreground">
          Unmatched bank transfers on one side, subscriptions waiting on a payment match on the
          other. Pick the subscription each transfer belongs to.
        </p>

        {isLoading && <p className="py-8 text-center text-muted-foreground">Loading...</p>}

        {!isLoading && transfers.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No unmatched transfers right now.
          </p>
        )}

        <div className="space-y-3">
          {transfers.map((transfer) => (
            <TransferRow
              key={transfer.id}
              transfer={transfer}
              candidates={unmatchedSubs}
              onMatch={(subscriptionId) =>
                match.mutate({ transferId: transfer.id, subscriptionId })
              }
              isPending={match.isPending}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TransferRow({
  transfer,
  candidates,
  onMatch,
  isPending,
}: {
  transfer: BankTransfer;
  candidates: AdminSubscription[];
  onMatch: (subscriptionId: number) => void;
  isPending: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
      <div>
        <p className="font-medium">
          {formatPrice(transfer.amount)} {transfer.currency}
        </p>
        <p className="font-mono text-xs text-muted-foreground">{transfer.raw_reference}</p>
        <p className="text-xs text-muted-foreground">
          {transfer.sender_name ?? "Unknown sender"} · {formatDate(transfer.received_at)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Select value={selected ?? undefined} onValueChange={(val) => setSelected(val)}>
          <SelectTrigger size="sm" className="w-56">
            <SelectValue placeholder="Select subscription…" />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.investor_name} · {formatPrice(s.amount)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          disabled={!selected || isPending}
          onClick={() => selected && onMatch(Number(selected))}
        >
          Match
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right font-medium">{value}</span>
    </div>
  );
}
