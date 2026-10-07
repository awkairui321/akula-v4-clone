import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import type { WorkflowView } from "@/lib/workflow-types";
import { formatPrice } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AllocationPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["workflows", user?.id],
    queryFn: () => api<WorkflowView>("/api/v1/workflows"),
  });
  const sub = data?.subscriptions.find((s) => s.id === Number(id));
  const allocation = data?.allocations.find((a) => a.subscriptionId === sub?.id && !a.voided);
  const run = useMutation({
    mutationFn: () =>
      api<WorkflowView>("/api/v1/workflows", {
        method: "POST",
        body: {
          type: "allocate",
          id: sub!.id,
          amount: Number(amount ?? sub!.amount),
          price: Number(price),
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });
  if (isLoading) return <p>Loading allocation...</p>;
  if (!sub) return <p role="alert">Subscription not found.</p>;
  const ready =
    !allocation &&
    !sub.holdingId &&
    ["allocation_pending", "reconciliation"].includes(sub.status) &&
    !sub.allocationBlockers.length;
  const valid =
    (amount ?? sub.amount).toString().trim() !== "" &&
    Number(amount ?? sub.amount) >= 0 &&
    Number(amount ?? sub.amount) <= Number(sub.amount) &&
    Number(price) > 0;
  return (
    <div className="space-y-6">
      <Link to="/luca/subscriptions" className="text-sm text-primary hover:underline">
        ← Subscriptions
      </Link>
      <div>
        <h1 className="text-3xl font-bold">Allocate subscription</h1>
        <p className="mt-1 text-muted-foreground">
          Review confirmed funding, then record the capital to allocate. Akula Ops issues the
          holding afterwards.
        </p>
      </div>
      <section className="rounded-lg border p-5">
        <h2 className="font-semibold">
          {sub.investor_name} · {sub.asset_name}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Subscription #{sub.id} · {sub.currency}
        </p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Subscribed capital</dt>
            <dd className="mt-1 font-medium">{formatPrice(sub.amount)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Confirmed receipts</dt>
            <dd className="mt-1 font-medium">
              {formatPrice(
                data!.receipts
                  .filter((r) => r.subscriptionId === sub.id && r.matched && !r.supersededBy)
                  .reduce((sum, r) => sum + r.amount, 0),
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Subscription fee</dt>
            <dd className="mt-1 font-medium">{formatPrice(sub.subscription_fee)}</dd>
          </div>
        </dl>
      </section>
      <section className="space-y-3 rounded-lg border p-5">
        <h2 className="font-semibold">Allocation readiness</h2>
        {allocation ? (
          <p>
            Allocation recorded: {formatPrice(allocation.principal)}.{" "}
            {sub.holdingId ? `Holding #${sub.holdingId} issued.` : "Awaiting Akula Ops issuance."}
          </p>
        ) : sub.allocationBlockers.length ? (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {sub.allocationBlockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">
            {ready
              ? "Funding and required approvals are complete. Ready to allocate."
              : "This subscription has not reached allocation yet."}
          </p>
        )}
      </section>
      {!allocation && (
        <form
          className="space-y-4 rounded-lg border p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready && valid) run.mutate();
          }}
        >
          <h2 className="font-semibold">Record allocation</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="principal">Allocated capital</Label>
              <Input
                id="principal"
                type="number"
                min="0"
                max={sub.amount}
                step="0.01"
                value={amount ?? sub.amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit-price">Class unit price</Label>
              <Input
                id="unit-price"
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            A zero allocation records that no units will be issued. Any unallocated capital follows
            the return workflow.
          </p>
          {run.isError && (
            <p role="alert" className="text-sm text-destructive">
              {run.error.message}
            </p>
          )}
          <Button disabled={!ready || !valid || run.isPending}>Confirm allocation</Button>
        </form>
      )}
    </div>
  );
}
