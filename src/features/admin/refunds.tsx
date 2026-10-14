import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { formatPricePrecise } from "@/lib/currency";
import { REFUND_STATUS_LABELS } from "@/lib/acclime";
import type { WorkflowView } from "@/lib/workflow-types";
import { Button } from "@/components/ui/button";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const REASONS: Record<string, string> = {
  not_allocated: "Not accepted",
  cancelled: "Cancelled",
  rejected: "Not accepted",
  funds_returned: "Not accepted",
  allocated: "Funds in excess of the allocation",
};

/** Every refund LUCA owes, and who confirmed each one was paid. */
export default function RefundsPage() {
  const { user } = useAuth();
  const { data: view, isLoading } = useQuery({
    queryKey: ["workflows", user?.id],
    queryFn: () => api<WorkflowView>("/api/v1/workflows"),
  });

  const rows = useMemo(
    () =>
      (view?.subscriptions ?? [])
        .filter((s) => s.refund)
        .sort((a, b) => {
          const open = (x: typeof a) => (x.refund?.status === "processed" ? 1 : 0);
          return (
            open(a) - open(b) ||
            (b.refund?.processed_at ?? "").localeCompare(a.refund?.processed_at ?? "") ||
            b.id - a.id
          );
        }),
    [view],
  );
  const owed = rows.filter((s) => s.refund?.status !== "processed");
  const owedTotal = owed.reduce((n, s) => n + (s.refund?.amount ?? 0), 0);

  return (
    <div className="w-full space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Refunds</h1>
        <p className="text-muted-foreground">
          {owed.length === 0
            ? "No refunds are waiting to be paid."
            : `${owed.length} refund${owed.length === 1 ? "" : "s"} waiting to be paid, ${formatPricePrecise(owedTotal)} in all.`}
        </p>
        <p className="max-w-3xl text-sm text-muted-foreground">
          A subscription that is not accepted is refunded in full to the account it came from,
          including the subscription fee. LUCA SGP bears any bank charges so the whole amount
          reaches the investor. Acclime confirms each refund as paid.
        </p>
      </div>

      {isLoading ? (
        <p className="py-12 text-center text-muted-foreground">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="border-y py-12 text-center text-sm text-muted-foreground">
          No subscription has been refunded or is due a refund.
        </p>
      ) : (
        <ul className="divide-y border-y">
          {rows.map((s) => {
            const refund = s.refund!;
            return (
              <li
                key={s.id}
                className="grid items-center gap-x-4 gap-y-1 py-3.5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_8rem_minmax(0,1.3fr)_9rem]"
              >
                <div className="min-w-0">
                  <Link
                    to={`/luca/investors/${s.investor_id}`}
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {s.investor_name}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {s.fund_name} · #{s.id} ·{" "}
                    <span className="font-mono">{s.payment_reference}</span>
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">{REASONS[s.status] ?? s.status}</p>
                <p className="text-sm font-semibold tabular-nums lg:text-right">
                  {formatPricePrecise(refund.amount)}
                </p>
                <div>
                  <p
                    className={`text-sm ${refund.status === "processed" ? "text-green-700" : refund.status === "failed" ? "text-destructive" : "text-amber-700"}`}
                  >
                    {REFUND_STATUS_LABELS[refund.status]}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {refund.status === "processed"
                      ? `${refund.confirmed_by === "acclime" ? "Confirmed by Acclime" : "Confirmed by Ops"}${refund.processed_at ? ` · ${day(refund.processed_at)}` : ""}${refund.reference ? ` · ${refund.reference}` : ""}`
                      : refund.status === "processing"
                        ? "With Ops and Acclime"
                        : "Paid back to the investor's own account"}
                  </p>
                </div>
                <div className="lg:text-right">
                  {refund.status !== "processed" && (
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      render={
                        <Link
                          to={`/luca/acclime?record=refund_processed&reference=${encodeURIComponent(s.payment_reference)}`}
                        />
                      }
                    >
                      Record as paid
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
