import { demoClientBook } from "@/lib/demo-client-book";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { SearchIcon } from "lucide-react";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/currency";
import type { WorkflowView } from "@/lib/workflow-types";
import { useAuth } from "@/contexts/auth-context";
import type { InvestorsResponse } from "./types";
import { useRms } from "./use-rms";
import ClientFunds from "./client-funds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const GRID = "lg:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_8rem]";
export default function ClientsPage() {
  const { user } = useAuth();
  const { label: rmLabel } = useRms();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "projects" ? "projects" : "directory";
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "investors", "all"],
    queryFn: () => api<InvestorsResponse>("/api/v1/admin/investors"),
  });
  const { data: workflow } = useQuery({
    queryKey: ["workflows", user?.id],
    queryFn: () => api<WorkflowView>("/api/v1/workflows"),
    staleTime: 0,
  });
  const clients = useMemo(
    () =>
      demoClientBook(data?.investors ?? [])
        .filter((i) => i.verification_status === "approved")
        .sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [data],
  );
  const q = search.trim().toLowerCase();
  const visible = clients.filter(
    (i) =>
      (type === "all" || i.investor_type === type) &&
      `${i.full_name} ${i.reference ?? ""} ${i.email} ${i.eam_firm ?? ""}`
        .toLowerCase()
        .includes(q),
  );
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
        <p className="mt-1 text-muted-foreground">
          Your onboarded client directory, funds and documents.
        </p>
      </div>
      <div role="tablist" aria-label="Clients" className="flex gap-6 border-b">
        {[
          ["directory", "Directory"],
          ["projects", "Funds & documents"],
        ].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setParams(key === "directory" ? {} : { tab: key })}
            className={`border-b-2 pb-3 text-sm ${tab === key ? "border-primary font-medium" : "border-transparent text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "projects" ? (
        <ClientFunds investors={clients} workflow={workflow} isLoading={isLoading} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full max-w-sm">
              <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search clients"
                placeholder="Search client name, reference or email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              {[
                ["all", "All"],
                ["individual", "Individuals"],
                ["institutional", "Entities"],
              ].map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  variant={type === key ? "secondary" : "outline"}
                  onClick={() => setType(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {visible.length} {visible.length === 1 ? "client" : "clients"}
          </p>
          {isLoading ? (
            <p>Loading clients...</p>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <div
                className={`hidden gap-4 border-b bg-muted/30 px-4 py-3 text-xs text-muted-foreground lg:grid ${GRID}`}
              >
                <span>Client</span>
                <span>Source</span>
                <span>Relationship manager</span>
                <span className="text-right">Subscribed capital</span>
              </div>
              <div className="divide-y">
                {visible.map((i) => {
                  const partner = i.referral?.partner_firm ?? i.eam_firm;
                  const referred = Boolean(partner || i.referral?.via === "rm_invite");
                  const staff =
                    workflow?.assignments.find((a) => a.investorId === i.id)?.staffId ?? i.rm_id;
                  return (
                    <Link
                      key={i.id}
                      to={`/luca/investors/${i.id}`}
                      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-4 hover:bg-muted/30 ${GRID}`}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{i.full_name}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {i.reference ?? i.client_code} ·{" "}
                          {i.investor_type === "institutional" ? "Entity" : "Individual"}
                        </span>
                      </span>
                      <span className="hidden text-sm lg:block">
                        {partner ?? (referred ? "RM referral" : "Direct")}
                      </span>
                      <span className="hidden text-sm text-muted-foreground lg:block">
                        {referred && staff ? rmLabel(staff) : "—"}
                      </span>
                      <span className="text-right text-sm font-medium tabular-nums">
                        {formatPrice(i.committed_amount)}
                      </span>
                    </Link>
                  );
                })}
                {visible.length === 0 && (
                  <p className="p-8 text-center text-sm text-muted-foreground">No clients match.</p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
