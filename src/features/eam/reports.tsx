import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/currency";
import { Input } from "@/components/ui/input";
import type { EamReportRow } from "./types";

export default function EamReportsPage() {
  const [search, setSearch] = useState("");
  const { data = [], isLoading } = useQuery({
    queryKey: ["eamReports"],
    queryFn: () => api<EamReportRow[]>("/api/v1/eam/reports"),
  });
  const rows = useMemo(
    () =>
      data.filter((row) =>
        `${row.client_name} ${row.fund_name} ${row.asset_name}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [data, search],
  );
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Client reports</h1>
        <p className="text-muted-foreground">
          Read-only issued holdings for your firm’s clients. NAV figures are simulated and dated.
        </p>
      </div>
      <Input
        aria-label="Search client reports"
        className="max-w-md"
        placeholder="Search client or opportunity"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {isLoading ? (
        <p>Loading holdings…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">
          No issued holdings match this search.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Client</th>
                <th className="p-3">Opportunity</th>
                <th className="p-3">Invested cost</th>
                <th className="p-3">Illustrative NAV</th>
                <th className="p-3">NAV as of</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="p-3">
                    <Link
                      className="font-medium text-primary hover:underline"
                      to={`/eam/clients/${row.adviser_client_id}?tab=holdings`}
                    >
                      {row.client_name}
                    </Link>
                  </td>
                  <td className="p-3">{row.fund_name}</td>
                  <td className="p-3">{formatPrice(Number(row.committed_amount))}</td>
                  <td className="p-3">{formatPrice(Number(row.current_nav))}</td>
                  <td className="p-3 text-muted-foreground">
                    {row.nav_as_of ? new Date(row.nav_as_of).toLocaleDateString() : "Not available"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
