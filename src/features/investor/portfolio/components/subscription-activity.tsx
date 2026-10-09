import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDownIcon } from "lucide-react";
import { api } from "@/lib/api";
import { readUpload } from "@/lib/file-upload";
import FileDropzone from "@/components/file-dropzone";
import type { Subscription, SubscriptionStatus } from "@/lib/types";
import {
  STATUS_LABELS,
  CLOSED_SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_STAGES,
  HOLDING_ISSUED_LABEL,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { StepTracker, type StepState } from "@/components/ui/step-tracker";
import { formatPricePrecise } from "@/lib/currency";

/* ─── Subscription journey: the same stages LUCA and advisers see ─── */

const SUBSCRIPTION_STEPS = [
  ...SUBSCRIPTION_STAGES.map((stage) => ({ key: stage.key, label: stage.milestone })),
  { key: "holding", label: HOLDING_ISSUED_LABEL },
];

function stepStateFor(subscription: Subscription): (stepKey: string) => StepState {
  const current = subscription.holding_id
    ? SUBSCRIPTION_STEPS.length
    : subscription.status === "allocated"
      ? SUBSCRIPTION_STEPS.length - 1
      : (stageIndexOf(subscription.status) ?? -1);
  return (stepKey) => {
    const index = SUBSCRIPTION_STEPS.findIndex((step) => step.key === stepKey);
    // Allocation completes its stage; only registry issuance completes the holding.
    return index < current ? "done" : index === current ? "active" : "upcoming";
  };
}

function stageIndexOf(status: SubscriptionStatus): number | undefined {
  const index = SUBSCRIPTION_STAGES.findIndex((stage) => stage.statuses.includes(status));
  return index === -1 ? undefined : index;
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
  const getState = stepStateFor(subscription);
  const isClosed = CLOSED_SUBSCRIPTION_STATUSES.includes(subscription.status);

  const refundMutation = useMutation({
    mutationFn: () =>
      api<{ subscription: Subscription }>(
        `/api/v1/subscriptions/${subscription.id}/refund_request`,
        { method: "POST" },
      ),
    onSuccess: () => {
      toast.success("Application cancelled. Akula Ops will process any confirmed funds due back.");
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runAction = () => {
    if (!action) return;
    if (action.kind === "proof") setUploadOpen(true);
    else navigate(`/checkout/${subscription.fund_id}?subscription_id=${subscription.id}`);
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

      {!isClosed && (
        <div className="overflow-x-auto pb-2">
          <StepTracker
            variant="flow"
            steps={SUBSCRIPTION_STEPS}
            getState={getState}
            className="min-w-144 sm:min-w-0"
          />
        </div>
      )}

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
            onClick={() =>
              navigate(`/checkout/${subscription.fund_id}?subscription_id=${subscription.id}`)
            }
          >
            View funding instructions
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refundMutation.mutate()}
            disabled={refundMutation.isPending}
          >
            {refundMutation.isPending ? "Cancelling..." : "Cancel unissued application"}
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

      {!isClosed && !action && subscription.status !== "awaiting_funds" && (
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            navigate(`/checkout/${subscription.fund_id}?subscription_id=${subscription.id}`)
          }
        >
          View application
        </Button>
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
    mutationFn: async () => {
      if (!file) throw new Error("Choose a file first.");
      const upload = await readUpload(file);
      return api(`/api/v1/subscriptions/${subscriptionId}/payment_proof`, {
        method: "POST",
        body: upload,
      });
    },
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
        <FileDropzone
          disabled={uploadMutation.isPending}
          onFiles={async (files) => {
            setFile(files[0] ?? null);
          }}
        />
        {file && <p className="text-sm">{file.name}</p>}
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
    !!s.holding_id || CLOSED_SUBSCRIPTION_STATUSES.includes(s.status);
  const actionRequired = subscriptions.filter((s) => !isDone(s) && REQUIRED_ACTIONS[s.status]);
  const inProgress = subscriptions.filter((s) => !isDone(s) && !REQUIRED_ACTIONS[s.status]);
  const completed = subscriptions.filter(isDone);

  return (
    <div className="flex flex-col gap-8 py-2">
      <p className="text-sm text-muted-foreground">
        Track each subscription from signature to holding issuance. A subscription moves to Holdings
        once Akula Ops has issued the registry holding.
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
    </div>
  );
}
