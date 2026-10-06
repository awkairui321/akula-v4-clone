import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, apiAsDemo } from "@/lib/api";
import type { WorkflowView } from "@/lib/workflow-types";
import { Button } from "@/components/ui/button";
import { formatPricePrecise } from "@/lib/currency";

export default function FundingShortfall({ id, personaId }: { id: number; personaId?: number }) {
  const qc = useQueryClient();
  const request =
    personaId === undefined
      ? api
      : <T,>(path: string, options?: Parameters<typeof api>[1]) =>
          apiAsDemo<T>(personaId, path, options);
  const { data } = useQuery({
    queryKey: ["fundingShortfall", personaId, id],
    queryFn: () => request<WorkflowView>("/api/v1/workflows"),
    refetchInterval: 2000,
  });
  const declaration = useMutation({
    mutationFn: () =>
      request("/api/v1/workflows", { method: "POST", body: { type: "declare-topup", id } }),
    onSuccess: () => qc.invalidateQueries(),
  });
  const sub = data?.subscriptions.find((s) => s.id === id);
  if (!sub || sub.investor_id !== data?.actor.id || sub.status !== "reconciliation") return null;
  const receipts = data.receipts.filter((r) => r.subscriptionId === id && !r.supersededBy);
  const matched = receipts.filter((r) => r.matched).reduce((sum, r) => sum + r.amount, 0);
  const missing =
    Math.round((Number(sub.amount) + Number(sub.subscription_fee) - matched) * 100) / 100;
  if (missing <= 0 || matched <= 0) return null;
  const unresolved = receipts.some((r) => !r.matched);
  const pending = !!sub.topup_declared_at && sub.topup_matched_amount === matched;
  return (
    <section className="my-3 space-y-2 rounded-lg border bg-card p-3 text-left text-sm">
      <h3 className="font-semibold">Additional funding needed</h3>
      <p>
        Ops has matched {formatPricePrecise(matched)}. The remaining amount including your agreed
        fee is {formatPricePrecise(missing)}.
      </p>
      <p>
        {unresolved
          ? "Ops is still checking another receipt. Wait for that check before declaring an additional transfer."
          : pending
            ? "Your additional transfer is declared. Ops must record and match the receipt."
            : "Use the same escrow instructions and payment reference as your original transfer. This declaration does not create a cash receipt."}
      </p>
      <Button
        disabled={unresolved || pending || sub.on_hold || declaration.isPending}
        onClick={() => declaration.mutate()}
      >
        Declare additional transfer sent
      </Button>
      {sub.on_hold && <p>LUCA must release the hold first.</p>}
      {declaration.isError && <p role="alert">{declaration.error.message}</p>}
    </section>
  );
}
