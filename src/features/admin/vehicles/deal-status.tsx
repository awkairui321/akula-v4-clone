import type { Fund } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

/** Days remaining until a close date, or null when the fund is open-ended. */
export function daysUntil(dateString: string | null): number | null {
  if (!dateString) return null;
  const diff = new Date(dateString).getTime() - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function formatClose(days: number | null): string {
  if (days === null) return "Open-ended";
  if (days === 0) return "Closed";
  return days === 1 ? "1 day" : `${days} days`;
}

export type Allocation = {
  allocated: number;
  total: number | null;
  pct: number | null;
};

export function allocationOf(fund: Fund): Allocation {
  const allocated = parseFloat(fund.supply_allocated);
  const total = fund.supply_total ? parseFloat(fund.supply_total) : null;
  return {
    allocated,
    total,
    pct: total && total > 0 ? Math.min(100, Math.round((allocated / total) * 100)) : null,
  };
}

export function StateBadge({ fund }: { fund: Fund }) {
  const days = daysUntil(fund.closes_at);
  if (fund.state === "draft") return <Badge variant="outline">Draft</Badge>;
  if (["closed", "holding", "realized", "cancelled"].includes(fund.state) || days === 0)
    return <Badge variant="secondary">Closed</Badge>;
  if (fund.state === "closing") return <Badge variant="secondary">Closing</Badge>;
  const closingSoon = days !== null && days <= 7;
  return (
    <Badge variant={closingSoon ? "destructive" : "default"} className="text-[10px]">
      {closingSoon ? "Closing soon" : "Live"}
    </Badge>
  );
}
