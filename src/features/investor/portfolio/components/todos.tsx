import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Subscription } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatPricePrecise } from "@/lib/currency";

const TASKS: Partial<Record<Subscription["status"], { title: string; detail: string }>> = {
  reserved: {
    title: "Complete investment documents",
    detail: "Review and sign the documents for this investment.",
  },
  documents_pending: {
    title: "Sign investment documents",
    detail: "Your subscription is waiting for your signature.",
  },
  information_requested: {
    title: "Respond to an information request",
    detail: "LUCA needs additional information to continue review.",
  },
  approved: {
    title: "Arrange your funds transfer",
    detail: "Your investment is approved and ready for funding.",
  },
  payment_unmatched: {
    title: "Confirm your payment",
    detail: "Upload proof of payment so the team can match your transfer.",
  },
};

export default function InvestorTodos() {
  const { data, isLoading } = useQuery({
    queryKey: ["subscriptions"],
    queryFn: () => api<{ subscriptions: Subscription[] }>("/api/v1/subscriptions"),
  });
  const tasks = (data?.subscriptions ?? []).flatMap((subscription) => {
    const task = TASKS[subscription.status];
    return task ? [{ subscription, ...task }] : [];
  });

  return (
    <div className="space-y-3 py-3">
      <div>
        <h2 className="text-lg font-semibold">Tasks to do</h2>
        <p className="text-sm text-muted-foreground">
          Administrative steps for your active investments.
        </p>
      </div>
      {isLoading && (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading your tasks…</p>
      )}
      {!isLoading && tasks.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            You’re all caught up. New signing or account actions will appear here.
          </CardContent>
        </Card>
      )}
      {tasks.map(({ subscription, title, detail }) => (
        <Card key={subscription.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 !py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{title}</strong>
                <Badge variant="secondary">{STATUS_LABELS[subscription.status]}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {subscription.fund_name} · {subscription.asset_name} ·{" "}
                {formatPricePrecise(subscription.amount)}
              </p>
              <p className="text-xs text-muted-foreground">
                {subscription.information_request_note || detail}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                window.location.assign(
                  `/portfolio?section=subscriptions#subscription-${subscription.id}`,
                )
              }
            >
              Open investment
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
