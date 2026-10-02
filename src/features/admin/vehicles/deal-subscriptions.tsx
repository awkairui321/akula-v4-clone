import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/currency";
import { SUBSCRIPTION_STAGES, stageOfStatus } from "@/lib/types";
import type { Fund } from "@/lib/types";
import { STATUS_LABELS, type InvestorPricingRow, type SubscriptionsResponse } from "../types";

/** Where this deal's subscriptions are in the journey, linked through to the work queue. */
export default function DealSubscriptions({ fund }: { fund: Fund }) {
  const [, setSearchParams] = useSearchParams();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "subscriptions", "board"],
    queryFn: () => api<SubscriptionsResponse>("/api/v1/admin/subscriptions"),
  });
  const { data: pricing } = useQuery({
    queryKey: ["admin", "investor-pricing", "all"],
    queryFn: () => api<{ overrides: InvestorPricingRow[] }>("/api/v1/admin/investor_pricing"),
  });

  const subs = (data?.subscriptions ?? []).filter((s) => s.fund_id === fund.id);
  const open = subs.filter((s) => stageOfStatus(s.status) !== undefined);
  const issued = subs.filter((s) => s.status === "allocated");
  const customFor = new Set(
    (pricing?.overrides ?? []).filter((o) => o.fund_id === fund.id).map((o) => o.investor_id),
  );
  const sum = (rows: typeof subs) => rows.reduce((n, s) => n + parseFloat(s.amount), 0);

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Subscriptions</h2>
          <p className="text-sm text-muted-foreground">
            Every investor in this deal, by stage. Decisions are made in the Subscriptions queue.
          </p>
        </div>
        <Link
          to={`/luca/subscriptions?deal=${fund.id}`}
          className="text-sm text-primary hover:underline"
        >
          Open in Subscriptions →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-5">
        {SUBSCRIPTION_STAGES.map((stage) => {
          const rows = open.filter((s) => stage.statuses.includes(s.status));
          return (
            <Link
              key={stage.key}
              to={`/luca/subscriptions?deal=${fund.id}&stage=${stage.key}`}
              className="group block"
            >
              <p className="text-xs text-muted-foreground">{stage.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums group-hover:underline">
                {rows.length}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">{formatPrice(sum(rows))}</p>
            </Link>
          );
        })}
        <div>
          <p className="text-xs text-muted-foreground">Holdings issued</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{issued.length}</p>
          <p className="text-xs text-muted-foreground tabular-nums">{formatPrice(sum(issued))}</p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : subs.length === 0 ? (
        <p className="border-y py-10 text-center text-sm text-muted-foreground">
          No subscriptions for this deal yet.
        </p>
      ) : (
        <ul className="divide-y border-y">
          {subs.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3">
              <span className="min-w-0 flex-1">
                <Link
                  to={`/luca/investors/${s.investor_id}`}
                  className="block truncate text-sm font-medium hover:underline"
                >
                  {s.investor_name}
                </Link>
                <span className="block truncate text-xs text-muted-foreground">
                  {s.eam_firm ?? "Direct"}
                </span>
              </span>
              {customFor.has(s.investor_id) && (
                <button
                  type="button"
                  onClick={() => setSearchParams({ tab: "pricing" })}
                  className="text-xs text-primary hover:underline"
                >
                  Custom terms
                </button>
              )}
              <span className="w-28 text-right text-sm font-medium tabular-nums">
                {formatPrice(s.amount)}
              </span>
              <span className="w-44 text-sm text-muted-foreground">
                {stageOfStatus(s.status)?.label ?? STATUS_LABELS[s.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
