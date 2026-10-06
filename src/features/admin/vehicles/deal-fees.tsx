import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";
import type { Fund } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import InvestorPricing from "./investor-pricing";

const FIELDS = [
  ["subscription_fee_pct", "Subscription fee"],
  ["management_fee_pct", "Annual management fee"],
  ["carried_interest_pct", "Carried interest"],
] as const;

export default function DealFees({ fund }: { fund: Fund }) {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [fees, setFees] = useState(() =>
    Object.fromEntries(FIELDS.map(([key]) => [key, fund[key]])),
  );
  const save = useMutation({
    mutationFn: () => api(`/api/v1/funds/${fund.id}`, { method: "PATCH", body: { fund: fees } }),
    onSuccess: () => {
      cache.invalidateQueries();
    },
  });
  const valid = FIELDS.every(
    ([key]) =>
      fees[key].trim() !== "" &&
      Number.isFinite(Number(fees[key])) &&
      Number(fees[key]) >= 0 &&
      Number(fees[key]) <= 100,
  );
  return (
    <div className="space-y-10">
      <section className="space-y-5">
        <div>
          <h2 className="text-xl font-semibold">Fees by investor type</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Set the offering fee baseline here. Publish an approved version to make it available to
            investors. Existing applications keep their recorded fees.
          </p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) save.mutate();
          }}
          className="space-y-5"
        >
          <div className="grid gap-5 sm:grid-cols-3">
            {FIELDS.map(([key, label]) => (
              <label key={key} className="space-y-2 text-sm">
                <span>{label} %</span>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  required
                  value={fees[key]}
                  onChange={(event) => setFees({ ...fees, [key]: event.target.value })}
                />
              </label>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-y text-muted-foreground">
                <tr>
                  <th className="py-3">Investor type</th>
                  <th>Subscription fee</th>
                  <th>Annual management</th>
                  <th>Carry</th>
                </tr>
              </thead>
              <tbody className="divide-y border-b">
                <tr>
                  <td className="py-4">Partner referred</td>
                  <td>{fees.subscription_fee_pct}%</td>
                  <td>{fees.management_fee_pct}%</td>
                  <td>{fees.carried_interest_pct}%</td>
                </tr>
                <tr>
                  <td className="py-4">Independent</td>
                  <td>{(Number(fees.subscription_fee_pct) + 1).toFixed(2)}%</td>
                  <td>{fees.management_fee_pct}%</td>
                  <td>{fees.carried_interest_pct}%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Independent subscriptions add one percentage point to the applicable baseline. Investor
            specific terms override the baseline before that adjustment.
          </p>
          {save.error && (
            <p role="alert" className="text-sm text-destructive">
              {save.error.message}
            </p>
          )}
          {save.isSuccess && (
            <p role="status" className="text-sm">
              Working fees saved. Submit the offering version for approval and publication.
            </p>
          )}
          <Button type="submit" disabled={!valid || save.isPending}>
            {save.isPending ? "Saving…" : "Save working fees"}
          </Button>
        </form>
      </section>
      {user?.role === "luca" && <InvestorPricing fund={fund} />}
    </div>
  );
}
