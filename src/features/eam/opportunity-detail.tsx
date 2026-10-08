import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Fund } from "@/lib/types";
import type { Highlight, AdviserClient } from "./types";
import DealOverviewPage from "@/components/deal-overview-page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { StarIcon, Trash2Icon } from "lucide-react";

export default function OpportunityDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["eamOpportunity", id],
    queryFn: () => api<{ fund: Fund; highlights: Highlight[] }>(`/api/v1/eam/opportunities/${id}`),
    enabled: !!id,
  });

  const fund = data?.fund;
  const highlights = data?.highlights ?? [];

  if (isLoading) {
    return (
      <div>
        <p className="py-12 text-center text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!fund || error)
    return (
      <div className="space-y-4 py-8">
        <p role="alert">{error?.message ?? "Opportunity not found."}</p>
        <Link to="/eam/opportunities" className="text-primary underline">
          Back to opportunities
        </Link>
      </div>
    );

  return (
    <div className="flex flex-col gap-8">
      <DealOverviewPage
        fund={fund}
        viewer="eam"
        backTo="/eam/opportunities"
        backLabel="Back to opportunities"
      />

      <Separator />

      {/* Highlight composer */}
      <HighlightComposer fund={fund} />

      <Separator />

      {/* Published highlights */}
      <section>
        <h2 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Published highlights
        </h2>
        {highlights.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No highlights published for this opportunity yet.
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border">
            <div className="grid grid-cols-4 gap-4 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground">
              <span>Client</span>
              <span>Rationale</span>
              <span>Date</span>
              <span className="text-right">Actions</span>
            </div>
            {highlights.map((h) => (
              <HighlightRow key={h.id} highlight={h} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function HighlightRow({ highlight }: { highlight: Highlight }) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => api(`/api/v1/eam/highlights/${highlight.id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eamOpportunity"] });
      queryClient.invalidateQueries({ queryKey: ["eamDashboard"] });
    },
  });

  return (
    <div className="grid grid-cols-4 gap-4 border-b px-4 py-3 text-sm last:border-0">
      <span className="font-medium">{highlight.client_name}</span>
      <span className="truncate text-muted-foreground">{highlight.rationale || "—"}</span>
      <span className="text-muted-foreground">
        {new Date(highlight.created_at).toLocaleDateString()}
      </span>
      <span className="text-right">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={deleteMutation.isPending}
          onClick={() => deleteMutation.mutate()}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </span>
    </div>
  );
}

function HighlightComposer({ fund }: { fund: Fund }) {
  const queryClient = useQueryClient();
  const [selectedClientName, setSelectedClientName] = useState<string | null>(null);
  const [rationale, setRationale] = useState("");

  const { data: clients } = useQuery({
    queryKey: ["eamClients"],
    queryFn: () => api<AdviserClient[]>("/api/v1/eam/clients"),
  });

  const clientList = clients ?? [];
  const selectedClient = clientList.find((c) => c.client_name === selectedClientName);

  const mutation = useMutation({
    mutationFn: () =>
      api("/api/v1/eam/highlights", {
        method: "POST",
        body: {
          highlight: {
            adviser_client_id: selectedClient?.id,
            fund_id: fund.id,
            rationale,
          },
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eamOpportunity"] });
      queryClient.invalidateQueries({ queryKey: ["eamDashboard"] });
      queryClient.invalidateQueries({ queryKey: ["eamHighlights"] });
      setSelectedClientName(null);
      setRationale("");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <StarIcon className="size-4" />
          Highlight to a client
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Client</Label>
            <Select
              value={selectedClientName ?? undefined}
              onValueChange={(val) => setSelectedClientName(val)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a client" />
              </SelectTrigger>
              <SelectContent>
                {clientList.map((c) => (
                  <SelectItem key={c.id} value={c.client_name}>
                    {c.client_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Rationale</Label>
            <Textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Why is this a good fit for this client?"
              rows={1}
              className="min-h-9"
            />
          </div>
        </div>
        <Button
          size="sm"
          disabled={!selectedClient || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Sending..." : "Publish highlight"}
        </Button>
      </CardContent>
    </Card>
  );
}
