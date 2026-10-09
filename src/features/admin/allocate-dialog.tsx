import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { formatPrice, formatPricePrecise } from "@/lib/currency";
import type { WorkflowCommand, WorkflowView } from "@/lib/workflow-types";
import type { AdminSubscription } from "./types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * The allocation decision for one subscription: confirm it, or decline it and return the funds.
 * Both go to Akula Ops (issue the holding, or return the money) and to the investor.
 */
export function AllocateDialog({
  subscription,
  onClose,
}: {
  subscription: AdminSubscription;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");

  const { data: workflow } = useQuery({
    queryKey: ["workflows", user?.id],
    queryFn: () => api<WorkflowView>("/api/v1/workflows"),
  });
  const live = workflow?.subscriptions.find((s) => s.id === subscription.id);
  const blockers = live?.allocationBlockers ?? [];
  const received =
    workflow?.receipts
      .filter((r) => r.subscriptionId === subscription.id && r.matched && !r.supersededBy)
      .reduce((n, r) => n + r.amount, 0) ?? 0;

  // Fixed by the subscription: the capital subscribed, at the unit price the investor signed.
  const capital = Number(subscription.amount);
  const unitPrice = live?.allocationPrice ?? 0;
  const units = unitPrice > 0 ? capital / unitPrice : 0;
  const ready = capital > 0 && unitPrice > 0;

  const run = useMutation({
    mutationFn: (command: WorkflowCommand) =>
      api<WorkflowView>("/api/v1/workflows", { method: "POST", body: command }),
    onSuccess: (_, command) => {
      toast.success(
        command.type === "allocate"
          ? "Allocation confirmed. Akula Ops will issue the holding."
          : "Allocation declined. Akula Ops will return the funds and the investor has been told.",
      );
      queryClient.invalidateQueries();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{declining ? "Decline this allocation" : "Allocate subscription"}</DialogTitle>
        <DialogDescription>
          <span className="font-medium text-foreground">{subscription.investor_name}</span> ·{" "}
          {subscription.fund_name} · #{subscription.id}
        </DialogDescription>

        <dl className="grid grid-cols-3 gap-4 border-y py-3 text-sm">
          {[
            ["Subscribed", subscription.amount],
            ["Funds received", received],
            ["Subscription fee", subscription.subscription_fee],
          ].map(([label, value]) => (
            <div key={label as string}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 font-medium tabular-nums">{formatPrice(value as number)}</dd>
            </div>
          ))}
        </dl>

        {blockers.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}

        {declining ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="decline-reason">Reason for the investor</Label>
              <Textarea
                id="decline-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="For example: the fund was over-subscribed"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              The funds received, including the subscription fee, go back to the investor. Akula Ops
              is asked to return them and the investor receives your reason in their messages.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setDeclining(false)}>
                Back
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={!reason.trim() || run.isPending}
                onClick={() =>
                  run.mutate({ type: "decline-allocation", id: subscription.id, text: reason })
                }
              >
                Decline and return funds
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Class unit price</dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  {unitPrice > 0 ? formatPricePrecise(unitPrice) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Units to allocate</dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  {units.toLocaleString("en-GB", { maximumFractionDigits: 2 })}
                </dd>
              </div>
            </dl>
            <p className="text-sm text-muted-foreground">
              The full subscribed capital, at the unit price in the offering version the investor
              signed. You confirm it, or decline and return the funds.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setDeclining(true)}>
                Decline
              </Button>
              <Button
                className="flex-1"
                disabled={!ready || blockers.length > 0 || run.isPending}
                onClick={() =>
                  run.mutate({
                    type: "allocate",
                    id: subscription.id,
                    amount: capital,
                    price: unitPrice,
                  })
                }
              >
                Confirm allocation
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
