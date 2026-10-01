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
  const groups = useMemo(
    () =>
      [...new Set(data.map((row) => row.asset_name))]
        .sort()
        .map((company) => ({ company, rows: data.filter((row) => row.asset_name === company) }))
        .filter((group) =>
          `${group.company} ${group.rows.map((row) => `${row.client_name} ${row.client_code}`).join(" ")}`
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
          Issued holdings grouped by company. Open a company to see each client’s position and
          dated, simulated NAV.
        </p>
      </div>
      <Input
        aria-label="Search client reports"
        className="max-w-md"
        placeholder="Search company, client or tag"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {isLoading ? (
        <p>Loading holdings…</p>
      ) : groups.length === 0 ? (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">
          No issued holdings match this search.
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map(({ company, rows }) => (
            <details key={company} className="rounded-lg border p-4">
              <summary className="flex cursor-pointer justify-between gap-3 text-sm">
                <strong>{company}</strong>
                <span className="text-muted-foreground">
                  {rows.length} holding{rows.length === 1 ? "" : "s"} ·{" "}
                  {new Set(rows.map((row) => row.adviser_client_id)).size} client
                  {new Set(rows.map((row) => row.adviser_client_id)).size === 1 ? "" : "s"}
                </span>
              </summary>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="p-3">Holding</th>
                      <th className="p-3">Client</th>
                      <th className="p-3">Units</th>
                      <th className="p-3">Invested cost</th>
                      <th className="p-3">Illustrative NAV</th>
                      <th className="p-3">NAV as of</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="p-3">#{row.id}</td>
                        <td className="p-3">
                          <Link
                            className="font-medium text-primary hover:underline"
                            to={`/eam/clients/${row.adviser_client_id}?tab=holdings`}
                          >
                            {row.client_name}
                          </Link>
                          <span className="block font-mono text-xs text-muted-foreground">
                            {row.client_code}
                          </span>
                        </td>
                        <td className="p-3">{row.units}</td>
                        <td className="p-3">{formatPrice(Number(row.committed_amount))}</td>
                        <td className="p-3">{formatPrice(Number(row.current_nav))}</td>
                        <td className="p-3 text-muted-foreground">
                          {row.nav_as_of
                            ? new Date(row.nav_as_of).toLocaleDateString()
                            : "Not available"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
