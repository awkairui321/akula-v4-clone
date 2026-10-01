import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import type { EamDocumentRow } from "./types";

export default function EamDocumentsPage() {
  const [search, setSearch] = useState("");
  const [deal, setDeal] = useState("all");
  const { data = [], isLoading } = useQuery({
    queryKey: ["eamDocuments"],
    queryFn: () => api<EamDocumentRow[]>("/api/v1/eam/documents"),
  });
  const deals = [...new Set(data.map((row) => row.fund_name).filter(Boolean))] as string[];
  const rows = useMemo(
    () =>
      data.filter((row) => {
        const matchesDeal = deal === "all" || row.fund_name === deal;
        const text = `${row.name} ${row.client_name} ${row.fund_name ?? ""}`.toLowerCase();
        return matchesDeal && text.includes(search.toLowerCase());
      }),
    [data, deal, search],
  );
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Client documents</h1>
        <p className="text-muted-foreground">
          Deal-linked material across your client book. Open a client to see their full record.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Input
          aria-label="Search documents"
          className="max-w-md"
          placeholder="Search document, client or opportunity"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label="Filter by opportunity"
          className="rounded-md border bg-background px-3 text-sm"
          value={deal}
          onChange={(event) => setDeal(event.target.value)}
        >
          <option value="all">All opportunities</option>
          {deals.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </div>
      {isLoading ? (
        <p>Loading documents…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">
          No documents match these filters.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Document</th>
                <th className="p-3">Client</th>
                <th className="p-3">Opportunity</th>
                <th className="p-3">Status</th>
                <th className="p-3">Added</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.adviser_client_id}-${row.id}`} className="border-t">
                  <td className="p-3 font-medium">{row.name}</td>
                  <td className="p-3">
                    <Link
                      className="text-primary underline-offset-4 hover:underline"
                      to={`/eam/clients/${row.adviser_client_id}?tab=documents`}
                    >
                      {row.client_name}
                    </Link>
                  </td>
                  <td className="p-3">{row.fund_name ?? "—"}</td>
                  <td className="p-3 capitalize">{row.status.replaceAll("_", " ")}</td>
                  <td className="p-3 text-muted-foreground">
                    {new Date(row.created_at).toLocaleDateString()}
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
