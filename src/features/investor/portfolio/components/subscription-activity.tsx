import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDownIcon } from "lucide-react";
import { api } from "@/lib/api";
import type { Subscription, SubscriptionStatus } from "@/lib/types";
import { STATUS_LABELS, CLOSED_SUBSCRIPTION_STATUSES } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { StepTracker, type StepState } from "@/components/ui/step-tracker";
import { formatPricePrecise } from "@/lib/currency";

/* ─── Subscription flow: signature → funds → verification → holding ─── */

const SUBSCRIPTION_STEPS = [
  { key: "documents", label: "Subscription form signature" },
  { key: "funds", label: "Funds transfer" },
  { key: "verification", label: "Fund verification" },
  { key: "holding", label: "Holding issued" },
];

const DOCUMENTS_DONE: SubscriptionStatus[] = [
  "institution_review",
  "under_luca_review",
  "information_requested",
  "approved",
  "awaiting_funds",
  "payment_unmatched",
  "reconciliation",
  "allocation_pending",
  "allocated",
];
const FUNDS_DONE: SubscriptionStatus[] = ["reconciliation", "allocation_pending", "allocated"];
const VERIFICATION_DONE: SubscriptionStatus[] = ["allocated"];

function stepStateFor(status: SubscriptionStatus): (stepKey: string) => StepState {
  const done: Record<string, boolean> = {
    documents: DOCUMENTS_DONE.includes(status),
    funds: FUNDS_DONE.includes(status),
    verification: VERIFICATION_DONE.includes(status),
    holding: status === "allocated",
  };
  const active: Record<string, boolean> = {
    documents: status === "reserved" || status === "documents_pending",
    funds:
      status === "institution_review" ||
      status === "under_luca_review" ||
      status === "information_requested" ||
      status === "approved" ||
      status === "awaiting_funds" ||
      status === "payment_unmatched",
    verification: status === "reconciliation" || status === "allocation_pending",
  };
  return (stepKey) => (done[stepKey] ? "done" : active[stepKey] ? "active" : "upcoming");
}

/* ─── Actions the investor must take (replaces the old "Tasks to do" tab) ─── */

type RequiredAction = {
  title: string;
  detail: string;
  cta: string;
  /** "checkout" resumes the subscription flow; "proof" opens the proof-of-payment dialog. */
  kind: "checkout" | "proof";
};

const REQUIRED_ACTIONS: Partial<Record<SubscriptionStatus, RequiredAction>> = {
  reserved: {
    title: "Complete your subscription",
    detail: "Review and sign the subscription form for this investment.",
    cta: "Continue subscription",
    kind: "checkout",
  },
  documents_pending: {
    title: "Sign your subscription form",
    detail: "Your subscription is waiting for your signature.",
    cta: "Sign subscription form",
    kind: "checkout",
  },
  information_requested: {
    title: "Respond to an information request",
    detail: "LUCA needs additional information to continue its review.",
    cta: "Review request",
    kind: "checkout",
  },
  approved: {
    title: "Arrange your funds transfer",
    detail: "Your investment is approved and ready for funding.",
    cta: "View funding instructions",
    kind: "checkout",
  },
  payment_unmatched: {
    title: "Confirm your payment",
    detail: "Upload proof of payment so the team can match your transfer.",
    cta: "Upload proof of payment",
    kind: "proof",
  },
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const SECTION_LABEL = "text-xs font-medium tracking-wide text-muted-foreground uppercase";

function SubscriptionRow({
  subscription,
  action,
}: {
  subscription: Subscription;
  action?: RequiredAction;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const getState = stepStateFor(subscription.status);
  const isClosed = CLOSED_SUBSCRIPTION_STATUSES.includes(subscription.status);

  const refundMutation = useMutation({
    mutationFn: () =>
      api<{ subscription: Subscription }>(
        `/api/v1/subscriptions/${subscription.id}/refund_request`,
        { method: "POST" },
      ),
    onSuccess: () => {
      toast.success("Refund requested. Funds will be returned within 5 business days.");
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runAction = () => {
    if (!action) return;
    if (action.kind === "proof") setUploadOpen(true);
    else navigate(`/checkout/${subscription.fund_id}`);
  };

  return (
    <li id={`subscription-${subscription.id}`} className="scroll-mt-24 space-y-5 py-6">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{subscription.asset_name}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{subscription.fund_name}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {subscription.reserved_at && `Submitted ${formatDate(subscription.reserved_at)} · `}
            Ref {subscription.payment_reference}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-base font-semibold tabular-nums">
            {formatPricePrecise(subscription.amount)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {STATUS_LABELS[subscription.status] ?? subscription.status}
          </p>
        </div>
      </div>

      {!isClosed && <StepTracker variant="flow" steps={SUBSCRIPTION_STEPS} getState={getState} />}

      {action && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/50 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Action required</p>
            <p className="text-sm font-medium">{action.title}</p>
            <p className="text-xs text-muted-foreground">
              {subscription.information_request_note || action.detail}
            </p>
          </div>
          <Button size="sm" onClick={runAction}>
            {action.cta}
          </Button>
        </div>
      )}

      {subscription.status === "awaiting_funds" && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/checkout/${subscription.fund_id}`)}
          >
            View funding instructions
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refundMutation.mutate()}
            disabled={refundMutation.isPending}
          >
            {refundMutation.isPending ? "Requesting refund..." : "Request refund"}
          </Button>
        </div>
      )}

      {uploadOpen && (
        <UploadProofDialog
          subscriptionId={subscription.id}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            setUploadOpen(false);
            queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
          }}
        />
      )}
    </li>
  );
}

function UploadProofDialog({
  subscriptionId,
  onClose,
  onUploaded,
}: {
  subscriptionId: number;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);

  const uploadMutation = useMutation({
    mutationFn: () =>
      api(`/api/v1/subscriptions/${subscriptionId}/payment_proof`, {
        method: "POST",
        body: { filename: file?.name },
      }),
    onSuccess: () => {
      toast.success("Proof of payment uploaded. Ops will review it shortly.");
      onUploaded();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle>Upload proof of payment</DialogTitle>
        <p className="text-sm text-muted-foreground">
          Attach a bank transfer receipt or screenshot so ops can match your payment to this
          subscription.
        </p>
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:bg-transparent file:px-2 file:py-1 file:text-xs file:font-medium"
        />
        <Button
          className="w-full"
          disabled={!file || uploadMutation.isPending}
          onClick={() => uploadMutation.mutate()}
        >
          {uploadMutation.isPending ? "Uploading..." : "Upload"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Tab: action required → in progress → completed & closed (collapsed) ─── */

export default function SubscriptionActivity() {
  const navigate = useNavigate();
  const [showClosed, setShowClosed] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["subscriptions"],
    queryFn: () => api<{ subscriptions: Subscription[] }>("/api/v1/subscriptions"),
  });
  const subscriptions = data?.subscriptions ?? [];

  if (isLoading) {
    return (
      <p className="py-12 text-center text-muted-foreground">Loading subscription activity...</p>
    );
  }

  if (subscriptions.length === 0) {
    return (
      <Card className="mt-2 border-2 border-dashed ring-0">
        <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
          <p className="text-muted-foreground">No subscriptions yet.</p>
          <Button variant="outline" onClick={() => navigate("/funds")}>
            Browse opportunities
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isDone = (s: Subscription) =>
    s.status === "allocated" || CLOSED_SUBSCRIPTION_STATUSES.includes(s.status);
  const actionRequired = subscriptions.filter((s) => !isDone(s) && REQUIRED_ACTIONS[s.status]);
  const inProgress = subscriptions.filter((s) => !isDone(s) && !REQUIRED_ACTIONS[s.status]);
  const completed = subscriptions.filter(isDone);

  return (
    <div className="flex flex-col gap-8 py-2">
      <p className="text-sm text-muted-foreground">
        Track each subscription from signature to holding issuance. A subscription moves to Holdings
        once fund verification is complete.
      </p>

      {actionRequired.length > 0 ? (
        <section>
          <div className={SECTION_LABEL}>Action required ({actionRequired.length})</div>
          <ul className="mt-2 divide-y border-y">
            {actionRequired.map((s) => (
              <SubscriptionRow key={s.id} subscription={s} action={REQUIRED_ACTIONS[s.status]} />
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">
          You’re all caught up. No actions are required on your subscriptions.
        </p>
      )}

      {inProgress.length > 0 && (
        <section>
          <div className={SECTION_LABEL}>In progress ({inProgress.length})</div>
          <ul className="mt-2 divide-y border-y">
            {inProgress.map((s) => (
              <SubscriptionRow key={s.id} subscription={s} />
            ))}
          </ul>
        </section>
      )}

      {completed.length > 0 && (
        <section>
          <button
            type="button"
            aria-expanded={showClosed}
            onClick={() => setShowClosed((v) => !v)}
            className={`flex items-center gap-1.5 hover:text-foreground ${SECTION_LABEL}`}
          >
            Completed & closed ({completed.length})
            <ChevronDownIcon
              className={`size-3.5 transition-transform ${showClosed ? "rotate-180" : ""}`}
            />
          </button>
          {showClosed && (
            <ul className="mt-2 divide-y border-y">
              {completed.map((s) => (
                <SubscriptionRow key={s.id} subscription={s} />
              ))}
            </ul>
          )}
        </section>
      )}

      <div>
        <Button variant="outline" size="sm" onClick={() => navigate("/support?topic=allocation")}>
          Report an allocation or funding issue
        </Button>
      </div>
    </div>
  );
}
