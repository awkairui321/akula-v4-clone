import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import type { AdviserClient, ClientStage } from "../types";
import { STAGE_LABELS } from "../types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchIcon } from "lucide-react";

const STAGES: (ClientStage | "all")[] = ["all", "prospect", "onboarding", "active", "inactive"];

const STAGE_VARIANT: Record<ClientStage, "default" | "secondary" | "outline" | "destructive"> = {
  prospect: "outline",
  onboarding: "secondary",
  active: "default",
  inactive: "destructive",
};

export default function ClientsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const stageFilter = STAGES.includes(params.get("stage") as ClientStage)
    ? (params.get("stage") as ClientStage)
    : "all";

  const { data, isLoading } = useQuery({
    queryKey: ["eamClients"],
    queryFn: () => api<AdviserClient[]>("/api/v1/eam/clients"),
  });

  const clients = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    let result = clients;

    if (stageFilter !== "all") {
      result = result.filter((c) => c.stage === stageFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.client_name.toLowerCase().includes(q) ||
          c.client_email.toLowerCase().includes(q) ||
          c.client_code.toLowerCase().includes(q),
      );
    }

    return result;
  }, [clients, stageFilter, search]);

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
        <p className="text-muted-foreground">Manage your adviser clients and their portfolios.</p>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search clients by name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {STAGES.map((s) => (
          <Button
            key={s}
            variant={stageFilter === s ? "secondary" : "outline"}
            size="sm"
            onClick={() => setParams(s === "all" ? {} : { stage: s })}
            className="rounded-full text-xs"
          >
            {s === "all" ? "All" : STAGE_LABELS[s]}
            <span className="ml-1.5 text-muted-foreground">
              {s === "all" ? clients.length : clients.filter((c) => c.stage === s).length}
            </span>
          </Button>
        ))}
      </div>

      {isLoading && <p className="py-12 text-center text-muted-foreground">Loading clients...</p>}

      {!isLoading && clients.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">No clients yet.</p>
      )}

      {!isLoading && clients.length > 0 && filtered.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">No clients match your filters.</p>
      )}

      {filtered.length > 0 && (
        <div className="rounded-lg border">
          <div className="grid grid-cols-4 gap-4 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground">
            <span>Client</span>
            <span>Stage</span>
            <span>Email</span>
            <span className="text-right">Added</span>
          </div>
          {filtered.map((client) => (
            <button
              key={client.id}
              className="grid w-full grid-cols-4 gap-4 border-b px-4 py-3 text-left text-sm transition-colors last:border-0 hover:bg-muted/50"
              onClick={() => navigate(`/eam/clients/${client.id}`)}
            >
              <span className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  {client.client_name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)}
                </div>
                <span className="truncate font-medium">
                  {client.client_name}
                  <small className="block font-mono text-xs text-muted-foreground">
                    {client.client_code}
                  </small>
                </span>
              </span>
              <span>
                <Badge variant={STAGE_VARIANT[client.stage]} className="text-[10px]">
                  {STAGE_LABELS[client.stage]}
                </Badge>
              </span>
              <span className="truncate text-muted-foreground">{client.client_email}</span>
              <span className="text-right text-muted-foreground">
                {new Date(client.created_at).toLocaleDateString()}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
