import FundingShortfall from "@/components/funding-shortfall";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { StepTracker, type StepState } from "@/components/ui/step-tracker";
import { formatPricePrecise } from "@/lib/currency";
import { isMocking } from "@/mocks/browser";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  ClockIcon,
  LoaderIcon,
  HourglassIcon,
  XCircleIcon,
  CopyIcon,
  CheckIcon,
} from "lucide-react";
import type {
  Fund,
  Subscription,
  SubscriptionStatus,
  AcknowledgementsResponse,
  SubscriptionShowResponse,
} from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SignResponse = {
  status: string;
  signing_url?: string;
  subscription_id: number;
  packet: {
    complete: boolean;
    signed_count: number;
    total_count: number;
  };
};

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const STEP_LABELS: Record<Step, string> = {
  1: "Amount",
  2: "Terms",
  3: "Sign",
  4: "Review",
  5: "Funding",
  6: "Escrow",
  7: "Allocation",
};

/** Statuses where the subscription is still moving through ops review. */
const IN_FLIGHT_STATUSES: SubscriptionStatus[] = [
  "awaiting_funds",
  "payment_unmatched",
  "reconciliation",
  "allocation_pending",
];

/** Statuses shown on the Review step: the client's adviser has not signed it off yet. */
const REVIEW_IN_FLIGHT_STATUSES: SubscriptionStatus[] = ["institution_review"];

// ---------------------------------------------------------------------------
// SignWell script loader
// ---------------------------------------------------------------------------

const SIGNWELL_EMBED_SRC = "https://static.signwell.com/assets/embedded.js";

function useSignWellScript() {
  const [loaded, setLoaded] = useState(
    () => typeof window !== "undefined" && "SignWellEmbed" in window,
  );

  useEffect(() => {
    if (loaded) return;
    if (isMocking) return;
    const existing = document.querySelector(`script[src="${SIGNWELL_EMBED_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => setLoaded(true));
      return;
    }
    const script = document.createElement("script");
    script.src = SIGNWELL_EMBED_SRC;
    script.async = true;
    script.onload = () => setLoaded(true);
    document.head.appendChild(script);
  }, [loaded]);

  return loaded;
}

// ---------------------------------------------------------------------------
// Progress Indicator
// ---------------------------------------------------------------------------

function StepProgress({ currentStep }: { currentStep: Step }) {
  const steps: Step[] = [1, 2, 3, 4, 5, 6, 7];

  const getState = (key: string): StepState => {
    const step = Number(key) as Step;
    if (step === currentStep) return "active";
    return step < currentStep ? "done" : "upcoming";
  };

  return (
    <StepTracker
      className="mb-8"
      steps={steps.map((step) => ({ key: String(step), label: STEP_LABELS[step] }))}
      getState={getState}
    />
  );
}

// ---------------------------------------------------------------------------
// Copy-to-clipboard row (funding instructions)
// ---------------------------------------------------------------------------

function CopyableRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — please copy it manually");
    }
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <button
        type="button"
        onClick={handleCopy}
        className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 font-medium hover:bg-muted ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
        {copied ? (
          <CheckIcon className="size-3.5 shrink-0 text-green-600" />
        ) : (
          <CopyIcon className="size-3.5 shrink-0 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Amount
// ---------------------------------------------------------------------------

function AmountStep({
  fund,
  amount,
  onAmountChange,
  onContinue,
  isPending,
  error,
}: {
  fund: Fund;
  amount: string;
  onAmountChange: (val: string) => void;
  onContinue: () => void;
  isPending: boolean;
  error: string | null;
}) {
  const numAmount = parseFloat(amount) || 0;
  const minSub = parseFloat(fund.min_subscription);
  const maxSub = fund.max_subscription ? parseFloat(fund.max_subscription) : null;
  const feePct = parseFloat(fund.subscription_fee_pct);
  const fee = numAmount * (feePct / 100);
  const total = numAmount + fee;
  const valid = numAmount >= minSub && (!maxSub || numAmount <= maxSub);

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Choose your investment amount</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {fund.codename} &middot; {fund.asset.name} &middot;{" "}
          {fund.deal_type === "primary" ? "Primary" : "Secondary"} deal
        </p>
      </div>

      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="space-y-2">
            <Label htmlFor="checkout-amount">Investment amount (USD)</Label>
            <Input
              id="checkout-amount"
              type="number"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
              min={fund.min_subscription}
              max={fund.max_subscription ?? undefined}
              step={fund.subscription_increment}
            />
            <p className="text-xs text-muted-foreground">
              Min {formatPricePrecise(fund.min_subscription)}
              {fund.max_subscription && ` · Max ${formatPricePrecise(fund.max_subscription)}`}
            </p>
          </div>

          <Separator />

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subscription amount</span>
              <span>{formatPricePrecise(numAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Subscription fee ({fund.subscription_fee_pct}%)
              </span>
              <span>{formatPricePrecise(fee)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 font-medium">
              <span>Total due</span>
              <span>{formatPricePrecise(total)}</span>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-sm font-medium">Fee schedule</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subscription fee</span>
                <span>{fund.subscription_fee_pct}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Management fee</span>
                <span>{fund.management_fee_pct}% p.a.</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Carried interest</span>
                <span>{fund.carried_interest_pct}%</span>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button className="w-full" onClick={onContinue} disabled={!valid || isPending}>
            {isPending ? "Creating subscription..." : "Continue to terms"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Terms & Risk Acknowledgement
// ---------------------------------------------------------------------------

function TermsStep({
  fund,
  subscription,
  onContinue,
  onBack,
}: {
  fund: Fund;
  subscription: Subscription;
  onContinue: () => void;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const numAmount = parseFloat(subscription.amount);
  const fee = parseFloat(subscription.subscription_fee);
  const total = numAmount + fee;

  const { data, isLoading } = useQuery({
    queryKey: ["acknowledgements", subscription.id],
    queryFn: () =>
      api<{ acknowledgements: AcknowledgementsResponse }>(
        `/api/v1/subscriptions/${subscription.id}/acknowledgements`,
      ),
  });

  const acceptMutation = useMutation({
    mutationFn: (termId: number) =>
      api<{ acknowledgements: AcknowledgementsResponse }>(
        `/api/v1/subscriptions/${subscription.id}/acknowledgements`,
        { method: "POST", body: { acknowledgement: { acknowledgement_term_id: termId } } },
      ),
    onSuccess: (res) => {
      queryClient.setQueryData(["acknowledgements", subscription.id], res);
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: (termId: number) =>
      api<{ acknowledgements: AcknowledgementsResponse }>(
        `/api/v1/subscriptions/${subscription.id}/acknowledgements/${termId}`,
        { method: "DELETE" },
      ),
    onSuccess: (res) => {
      queryClient.setQueryData(["acknowledgements", subscription.id], res);
    },
  });

  const ack = data?.acknowledgements;
  const terms = ack?.terms ?? [];
  const allComplete = ack?.complete ?? false;

  function handleToggle(termId: number, accepted: boolean) {
    if (accepted) {
      withdrawMutation.mutate(termId);
    } else {
      acceptMutation.mutate(termId);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Terms & Risk Acknowledgement</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review the deal summary and acknowledge each item before proceeding.
        </p>
      </div>

      {/* Deal summary */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Deal summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Vehicle</span>
            <span>Akula VCC &middot; dedicated sub-fund</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Underlying company</span>
            <span>{fund.asset.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Security type</span>
            <span className="capitalize">{fund.share_class.class_type.replace(/_/g, " ")}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subscription amount</span>
            <span>{formatPricePrecise(numAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Fee (
              {subscription.commercial_terms?.subscriptionFeePct ??
                (
                  (Number(subscription.subscription_fee) / Number(subscription.amount)) *
                  100
                ).toFixed(2)}
              %)
            </span>
            <span>{formatPricePrecise(fee)}</span>
          </div>
          <div className="flex justify-between border-t pt-2 font-medium">
            <span>Total</span>
            <span>{formatPricePrecise(total)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Acknowledgement terms */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Risk acknowledgements</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {isLoading && (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <LoaderIcon className="size-4 animate-spin" />
              Loading...
            </div>
          )}
          {terms.map((term) => (
            <label
              key={term.id}
              className="flex cursor-pointer items-start gap-3 rounded-lg p-3 hover:bg-muted/50"
            >
              <input
                type="checkbox"
                checked={term.accepted}
                onChange={() => handleToggle(term.id, term.accepted)}
                disabled={acceptMutation.isPending || withdrawMutation.isPending}
                className="mt-0.5 size-4 rounded border-border"
              />
              <span className="text-sm">{term.body}</span>
            </label>
          ))}
          {ack && (
            <p className="pt-2 text-xs text-muted-foreground">
              {ack.accepted_count} of {ack.required_count} required acknowledgements accepted
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button className="flex-1" onClick={onContinue} disabled={!allComplete}>
          Continue to signing
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Sign Subscription Agreement
// ---------------------------------------------------------------------------

function SignStep({
  subscription,
  onSigned,
  onBack,
}: {
  subscription: Subscription;
  onSigned: () => void;
  onBack: () => void;
}) {
  const [signed, setSigned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollProgress, setPollProgress] = useState(0);
  const embedRef = useRef<unknown>(null);
  const scriptReady = useSignWellScript();
  const containerId = "signwell-subscription-embed";
  const onSignedRef = useRef(onSigned);
  onSignedRef.current = onSigned;

  const initMutation = useMutation({
    mutationFn: () =>
      api<SignResponse>("/api/v1/signwell/sign_subscription", {
        method: "POST",
        body: { subscription_id: subscription.id },
      }),
    onSuccess: (res) => {
      if (res.status === "signed") {
        onSignedRef.current();
      }
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  // Start signing session on mount
  useEffect(() => {
    initMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open embed once URL + script are ready
  useEffect(() => {
    if (!scriptReady || initMutation.isPending || initMutation.isIdle) return;
    if (!initMutation.data || initMutation.isError) return;
    if (initMutation.data.status === "signed") return;
    if (embedRef.current) return;

    const SignWellEmbed = (window as unknown as Record<string, unknown>)["SignWellEmbed"] as new (
      opts: Record<string, unknown>,
    ) => { open: () => void };

    const embed = new SignWellEmbed({
      url: initMutation.data.signing_url,
      containerId,
      allowClose: false,
      events: {
        completed: () => setSigned(true),
        error: () => setError("Something went wrong during signing."),
      },
    });

    embedRef.current = embed;
    embed.open();
  }, [
    scriptReady,
    initMutation.data,
    initMutation.isPending,
    initMutation.isIdle,
    initMutation.isError,
  ]);

  // Poll for signing completion after user signs
  useEffect(() => {
    if (!signed) return;

    const progressInterval = setInterval(() => {
      setPollProgress((prev) => Math.min(prev + 1, 95));
    }, 200);

    const poll = async () => {
      try {
        const res = await api<SignResponse>("/api/v1/signwell/check_subscription", {
          method: "POST",
          body: { subscription_id: subscription.id },
        });
        if (res.status === "signed") {
          setPollProgress(100);
          clearInterval(progressInterval);
          onSignedRef.current();
          return true;
        }
      } catch {
        // ignore polling errors
      }
      return false;
    };

    poll();

    const pollInterval = setInterval(async () => {
      const done = await poll();
      if (done) clearInterval(pollInterval);
    }, 5000);

    return () => {
      clearInterval(progressInterval);
      clearInterval(pollInterval);
    };
  }, [signed, subscription.id]);

  // Polling UI after user has signed
  if (signed) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-amber-500/10">
          <ClockIcon className="size-6 text-amber-600" />
        </div>
        <h2 className="text-xl font-semibold">Confirming signature</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Your subscription agreement has been signed. We are confirming everything on our end.
        </p>
        <div className="mx-auto mt-6 h-1.5 max-w-xs overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-amber-500 transition-all duration-200"
            style={{ width: `${pollProgress}%` }}
          />
        </div>
      </div>
    );
  }

  // No live SignWell account is reachable in this environment — offer a
  // simulated signature instead of trying to load a real hosted iframe.
  if (isMocking) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center">
        <h2 className="text-xl font-semibold">Sign subscription agreement</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          No live e-signature provider is connected in this environment. Simulate signing to
          continue through the flow.
        </p>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button onClick={() => setSigned(true)} disabled={initMutation.isPending}>
            Simulate signing
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Sign subscription agreement</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review and sign your subscription agreement to continue.
        </p>
      </div>

      {error && (
        <div className="mb-4 space-y-2">
          <p className="text-sm text-destructive">{error}</p>
          <Button
            variant="outline"
            onClick={() => {
              setError(null);
              embedRef.current = null;
              initMutation.mutate();
            }}
          >
            Retry
          </Button>
        </div>
      )}

      {(initMutation.isPending || (!scriptReady && !error)) && (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Preparing your agreement...</p>
        </div>
      )}

      <div
        id={containerId}
        className="overflow-hidden rounded-lg [&_iframe]:!h-[70vh] [&_iframe]:!min-h-[500px]"
        style={{
          minHeight: initMutation.data && !signed ? "70vh" : 0,
        }}
      />

      <div className="mt-4">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4: Review (institution review, then LUCA review)
// ---------------------------------------------------------------------------

function ReviewStep({
  subscription: initial,
  onProceed,
}: {
  subscription: Subscription;
  onProceed: (sub: Subscription) => void;
}) {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["subscription", initial.id],
    queryFn: () => api<SubscriptionShowResponse>(`/api/v1/subscriptions/${initial.id}`),
    initialData: {
      subscription: initial,
      wizard_step: "review",
      acknowledgements_complete: true,
    },
    refetchInterval: (query) => {
      const status = query.state.data?.subscription.status;
      return status && REVIEW_IN_FLIGHT_STATUSES.includes(status) ? 6000 : false;
    },
  });

  const subscription = data.subscription;
  const proceedMutation = useMutation({
    mutationFn: () =>
      api<SubscriptionShowResponse>(`/api/v1/subscriptions/${subscription.id}/proceed_to_funding`, {
        method: "POST",
      }),
    onSuccess: (res) => {
      queryClient.setQueryData(["subscription", subscription.id], res);
      onProceed(res.subscription);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (subscription.status === "rejected") {
    return (
      <div className="mx-auto max-w-lg py-12 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-destructive/10">
          <XCircleIcon className="size-7 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold">Subscription not approved</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          This subscription was reviewed and not approved. No funds have been requested from you.
        </p>
      </div>
    );
  }

  if (subscription.status === "approved") {
    return (
      <div className="mx-auto max-w-lg py-12 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-green-500/10">
          <CheckCircle2Icon className="size-7 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold">Approved</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Your subscription has been approved. Continue to fund it whenever you're ready.
        </p>
        <Button
          className="mt-6"
          onClick={() => proceedMutation.mutate()}
          disabled={proceedMutation.isPending}
        >
          {proceedMutation.isPending ? "Continuing..." : "Continue to funding"}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg py-12 text-center">
      <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-amber-500/10">
        <ClockIcon className="size-7 text-amber-600" />
      </div>
      <h2 className="text-2xl font-bold">Your adviser is reviewing</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        Your adviser signs off on this subscription before funding instructions are released to you.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5: Funding Instructions
// ---------------------------------------------------------------------------

function FundingStep({
  subscription,
  investorName,
  onContinue,
  onBack,
}: {
  subscription: Subscription;
  investorName: string;
  onContinue: () => void;
  onBack: () => void;
}) {
  const numAmount = parseFloat(subscription.amount);
  const fee = parseFloat(subscription.subscription_fee);
  const total = numAmount + fee;

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Funding instructions</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Transfer the total amount to the escrow account below. Copy each field exactly.
        </p>
      </div>

      <Card className="mb-6">
        <CardContent className="space-y-3 pt-6 text-sm">
          <CopyableRow label="Beneficiary" value="Akula VCC · Client Money / Escrow Account" />
          <Separator />
          <CopyableRow label="Amount" value={formatPricePrecise(total)} />
          <div className="flex justify-between">
            <span className="text-muted-foreground">Currency</span>
            <span>USD</span>
          </div>
          <CopyableRow label="Unique reference" value={subscription.payment_reference} mono />
          <div className="flex justify-between">
            <span className="text-muted-foreground">Expected sender</span>
            <span>{investorName}</span>
          </div>
        </CardContent>
      </Card>

      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        <p>
          All amounts are denominated in USD. Your transfer will be held in a segregated escrow
          account until allocation is confirmed. Please include the unique reference exactly as
          shown to ensure timely reconciliation.
        </p>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button className="flex-1" onClick={onContinue}>
          Continue to escrow confirmation
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 6: Escrow Confirmation
// ---------------------------------------------------------------------------

function EscrowStep({
  subscription,
  onContinue,
  onBack,
}: {
  subscription: Subscription;
  onContinue: () => void;
  onBack: () => void;
}) {
  const [transferred, setTransferred] = useState(false);

  const declareMutation = useMutation({
    mutationFn: () =>
      api<SubscriptionShowResponse>(`/api/v1/subscriptions/${subscription.id}`, {
        method: "PATCH",
        body: { payment_declared: true },
      }),
    onSuccess: () => {
      onContinue();
    },
  });

  const total = parseFloat(subscription.amount) + parseFloat(subscription.subscription_fee);

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Confirm your transfer</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Let us know once you've sent the funds so we can watch for them in escrow.
        </p>
      </div>

      <Card className="mb-6">
        <CardContent className="space-y-2 pt-6 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Reference to match</span>
            <span className="font-mono text-xs">{subscription.payment_reference}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-medium">{formatPricePrecise(total)}</span>
          </div>
        </CardContent>
      </Card>

      <label className="mb-6 flex cursor-pointer items-start gap-3 rounded-lg border p-4">
        <input
          type="checkbox"
          checked={transferred}
          onChange={(e) => setTransferred(e.target.checked)}
          className="mt-0.5 size-4 rounded border-border"
        />
        <span className="text-sm">I have initiated the bank transfer.</span>
      </label>

      {declareMutation.isError && (
        <p className="mb-4 text-sm text-destructive">{(declareMutation.error as Error).message}</p>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} disabled={declareMutation.isPending}>
          Back
        </Button>
        <Button
          className="flex-1"
          onClick={() => declareMutation.mutate()}
          disabled={!transferred || declareMutation.isPending}
        >
          {declareMutation.isPending ? "Confirming..." : "Confirm transfer sent"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 7: Allocation
// ---------------------------------------------------------------------------

function AllocationStep({ subscription: initial }: { subscription: Subscription }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["subscription", initial.id],
    queryFn: () => api<SubscriptionShowResponse>(`/api/v1/subscriptions/${initial.id}`),
    initialData: {
      subscription: initial,
      wizard_step: "payment",
      acknowledgements_complete: true,
    },
    refetchInterval: (query) => {
      const status = query.state.data?.subscription.status;
      return status &&
        (IN_FLIGHT_STATUSES.includes(status) ||
          (status === "allocated" && !query.state.data?.subscription.holding_id))
        ? 8000
        : false;
    },
  });

  const subscription = data.subscription;
  const isAllocated = subscription.status === "allocated";
  const isIssued = !!subscription.holding_id;
  const isRejected =
    subscription.status === "not_allocated" || subscription.status === "funds_returned";

  const refundMutation = useMutation({
    mutationFn: () =>
      api<SubscriptionShowResponse>(`/api/v1/subscriptions/${subscription.id}/refund_request`, {
        method: "POST",
      }),
    onSuccess: (res) => {
      queryClient.setQueryData(["subscription", subscription.id], res);
      toast.success("Application cancelled. Akula Ops will process any confirmed funds due back.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-lg py-8 text-center">
      <div
        className={`mx-auto mb-4 flex size-14 items-center justify-center rounded-full ${
          isAllocated ? "bg-green-500/10" : isRejected ? "bg-destructive/10" : "bg-amber-500/10"
        }`}
      >
        {isAllocated ? (
          <CheckCircle2Icon className="size-7 text-green-600" />
        ) : isRejected ? (
          <XCircleIcon className="size-7 text-destructive" />
        ) : (
          <HourglassIcon className="size-7 text-amber-600" />
        )}
      </div>

      <h2 className="text-2xl font-bold">
        {isAllocated
          ? "Allocation confirmed"
          : isRejected
            ? "Subscription not completed"
            : "Awaiting allocation"}
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        {isAllocated
          ? isIssued
            ? "Your holding has been issued and now appears in your portfolio."
            : "LUCA has recorded your allocation. Akula Ops must issue the holding before it appears in your portfolio."
          : isRejected
            ? "This subscription did not complete. Any funds received will be returned to your account of origin."
            : "Akula Ops records and matches your transfer. This page updates as cash is matched, LUCA records allocation and Ops issues the holding."}
      </p>

      <Card className="mx-auto mt-8 max-w-sm text-left">
        <CardContent className="space-y-3 pt-6 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <span className="font-medium">{STATUS_LABELS[subscription.status]}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Reference</span>
            <span className="font-mono text-xs">{subscription.payment_reference}</span>
          </div>
          {isAllocated && subscription.allocated_at && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Allocated</span>
              <span className="text-xs">
                {new Date(subscription.allocated_at).toLocaleDateString()}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <FundingShortfall id={subscription.id} />
      {subscription.status === "awaiting_funds" && (
        <Button
          variant="outline"
          className="mx-auto mt-4 w-full max-w-sm"
          onClick={() => refundMutation.mutate()}
          disabled={refundMutation.isPending}
        >
          {refundMutation.isPending ? "Requesting refund..." : "Cancel unissued application"}
        </Button>
      )}

      <div className="mt-8 flex gap-3">
        <Button variant="outline" className="flex-1" onClick={() => navigate("/funds")}>
          Back to opportunities
        </Button>
        <Button className="flex-1" onClick={() => navigate("/portfolio")}>
          View in portfolio
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wizardStepToStep(wizardStep: string, sub?: Subscription): Step {
  switch (wizardStep) {
    case "amount":
      return 1;
    case "terms":
      return 2;
    case "documents":
      return 3;
    case "review":
      return 4;
    case "payment":
      return sub?.payment_declared_at ? 7 : 5;
    case "completed":
    case "closed":
      return 7;
    default:
      return 1;
  }
}

// ---------------------------------------------------------------------------
// Main Checkout Page
// ---------------------------------------------------------------------------

export default function CheckoutPage() {
  const { fundId } = useParams<{ fundId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>(1);
  const [amount, setAmount] = useState(searchParams.get("amount") ?? "");
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  // Fetch fund data
  const { data: fundData, isLoading: fundLoading } = useQuery({
    queryKey: ["fund", Number(fundId)],
    queryFn: () => api<{ fund: Fund }>(`/api/v1/funds/${fundId}`),
    enabled: !!fundId,
  });

  // Fetch investor name for payment step
  const { data: profileData } = useQuery({
    queryKey: ["investorProfile"],
    queryFn: () =>
      api<{
        investor_profile: { first_name: string; last_name: string } | null;
      }>("/api/v1/investor_profile"),
  });

  const fund = useMemo(() => {
    if (subscription?.effective_terms) return subscription.effective_terms;
    if (subscription && fundData?.fund && Number(subscription.amount) > 0)
      return {
        ...fundData.fund,
        subscription_fee_pct: String(
          (Number(subscription.subscription_fee) / Number(subscription.amount)) * 100,
        ),
      };
    return fundData?.fund;
  }, [subscription, fundData?.fund]);
  const investorName = profileData?.investor_profile
    ? `${profileData.investor_profile.first_name} ${profileData.investor_profile.last_name}`
    : "Verified investor";

  // Set default amount from fund if not provided via search params
  useEffect(() => {
    if (fund && !amount) {
      setAmount(fund.min_subscription);
    }
  }, [fund, amount]);

  // Resume an existing subscription from search params
  const resumeSubId = searchParams.get("subscription_id");

  const { data: resumeData } = useQuery({
    queryKey: ["subscription", Number(resumeSubId)],
    queryFn: () => api<SubscriptionShowResponse>(`/api/v1/subscriptions/${resumeSubId}`),
    enabled: !!resumeSubId && !subscription,
  });

  useEffect(() => {
    if (resumeData && !subscription) {
      setSubscription(resumeData.subscription);
      setStep(wizardStepToStep(resumeData.wizard_step, resumeData.subscription));
    }
  }, [resumeData, subscription]);

  // Create subscription mutation
  const createSubscription = useMutation({
    mutationFn: (subscribeAmount: string) =>
      api<SubscriptionShowResponse>("/api/v1/subscriptions", {
        method: "POST",
        body: { fund_id: fund!.id, amount: subscribeAmount },
      }),
    onSuccess: (res) => {
      setSubscription(res.subscription);
      setCreateError(null);
      setStep(2);
    },
    onError: (err: Error) => {
      setCreateError(err.message);
    },
  });

  const handleContinueFromAmount = useCallback(() => {
    setCreateError(null);
    createSubscription.mutate(amount);
  }, [amount, createSubscription]);

  // After signing completes, refetch the subscription to get updated status
  const handleSigned = useCallback(async () => {
    if (!subscription) return;
    try {
      const res = await api<SubscriptionShowResponse>(`/api/v1/subscriptions/${subscription.id}`);
      setSubscription(res.subscription);
    } catch {
      // continue anyway
    }
    setStep(4);
  }, [subscription]);

  if (fundLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!fund) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Fund not found.</p>
      </div>
    );
  }

  if (fund.state !== "open" && !subscription) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">This fund is no longer accepting subscriptions.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/funds")}>
            Back to opportunities
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (step === 1) {
                navigate(`/funds/${fund.id}`);
              }
            }}
          >
            <ArrowLeftIcon className="mr-1 size-4" />
            {step === 1 ? "Back to fund" : fund.codename}
          </Button>
          {step === 7 && (
            <div className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle2Icon className="size-4" />
              Submitted
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-3xl px-6 py-8">
        <StepProgress currentStep={step} />

        {step === 1 && (
          <AmountStep
            fund={fund}
            amount={amount}
            onAmountChange={setAmount}
            onContinue={handleContinueFromAmount}
            isPending={createSubscription.isPending}
            error={createError}
          />
        )}

        {step === 2 && subscription && (
          <TermsStep
            fund={fund}
            subscription={subscription}
            onContinue={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}

        {step === 3 && subscription && (
          <SignStep subscription={subscription} onSigned={handleSigned} onBack={() => setStep(2)} />
        )}

        {step === 4 && subscription && (
          <ReviewStep
            subscription={subscription}
            onProceed={(updated) => {
              setSubscription(updated);
              setStep(5);
            }}
          />
        )}

        {step === 5 && subscription && (
          <FundingStep
            subscription={subscription}
            investorName={investorName}
            onContinue={() => setStep(6)}
            onBack={() => setStep(4)}
          />
        )}

        {step === 6 && subscription && (
          <EscrowStep
            subscription={subscription}
            onContinue={() => setStep(7)}
            onBack={() => setStep(5)}
          />
        )}

        {step === 7 && subscription && <AllocationStep subscription={subscription} />}
      </div>
    </div>
  );
}
