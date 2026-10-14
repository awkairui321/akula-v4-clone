import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { formatPricePrecise } from "@/lib/currency";
import type { WorkflowCommand, WorkflowView } from "@/lib/workflow-types";
import type { AdminSubscription } from "./types";
import { Button } from "@/components/ui/button";
import { DialogFacts } from "./dialog-facts";
import { receiptLabel, receiptSource } from "@/lib/receipts";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

const when = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * LUCA's first decision on a subscription: that the funds have been received and verified.
 * It is recorded in the Fund Manager's name, separately from the allocation that follows it.
 */
export function VerifyFundsDialog({
  subscription,
  onClose,
  onDecline,
}: {
  subscription: AdminSubscription;
  onClose: () => void;
  /** Declining needs no verification: it returns whatever was paid. */
  onDecline?: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: workflow } = useQuery({
    queryKey: ["workflows", user?.id],
    queryFn: () => api<WorkflowView>("/api/v1/workflows"),
  });
  const live = workflow?.subscriptions.find((s) => s.id === subscription.id);
  const receipts =
    workflow?.receipts.filter(
      (r) => r.subscriptionId === subscription.id && r.matched && !r.supersededBy,
    ) ?? [];
  const received = receipts.reduce((n, r) => n + r.amount, 0);
  const payable = Number(subscription.amount) + Number(subscription.subscription_fee);
  // The allocation step has its own check; only what stops the funds being verified shows here.
  const blockers = (live?.allocationBlockers ?? []).filter(
    (b) => b !== "Verify the funds before confirming the allocation.",
  );

  const run = useMutation({
    mutationFn: (command: WorkflowCommand) =>
      api<WorkflowView>("/api/v1/workflows", { method: "POST", body: command }),
    onSuccess: () => {
      toast.success("Funds verified. The subscription is now under review for allocation.");
      queryClient.invalidateQueries();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Verify funds</DialogTitle>
        <DialogDescription>
          <span className="font-medium text-foreground">{subscription.investor_name}</span> ·{" "}
          {subscription.fund_name} · #{subscription.id}
        </DialogDescription>
        <div className="mt-4 space-y-4">
          <DialogFacts
            rows={[
              { label: "Total payable", value: formatPricePrecise(payable) },
              { label: "Received and matched", value: formatPricePrecise(received) },
              { label: "Payment reference", value: subscription.payment_reference, mono: true },
            ]}
          />

          {receipts.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Matched receipts</p>
              <ul className="divide-y border-y text-sm">
                {receipts.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                    <span
                      className={`min-w-0 truncate ${receiptSource(r) === "ops" ? "font-mono text-xs" : ""}`}
                    >
                      {receiptLabel(r)}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatPricePrecise(r.amount)}
                      <span className="ml-2 text-xs text-muted-foreground">{when(r.at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {blockers.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}

          {onDecline && (
            <button
              type="button"
              onClick={onDecline}
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Decline this subscription instead
            </button>
          )}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              disabled={blockers.length > 0 || run.isPending}
              onClick={() => run.mutate({ type: "verify-funds", id: subscription.id })}
            >
              Confirm funds verified
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
