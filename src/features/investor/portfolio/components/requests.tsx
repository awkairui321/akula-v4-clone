import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import type { WorkflowView } from "@/lib/workflow-types";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Requests() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [company, setCompany] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["workflows", user?.id],
    queryFn: () => api<WorkflowView>("/api/v1/workflows"),
  });
  const submit = useMutation({
    mutationFn: () =>
      api<WorkflowView>("/api/v1/workflows", {
        method: "POST",
        body: { type: "request", text: company.trim() },
      }),
    onSuccess: () => {
      setCompany("");
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      toast.success("Company request received.");
    },
  });

  return (
    <div className="flex flex-col gap-6 py-2">
      <div>
        <strong className="font-bold">Non-binding sourcing request. </strong>
        LUCA and Akula can review the company. This is not a pledge, reservation, pooled demand
        threshold or commitment.
      </div>

      <Card className="box-shadow shadow-sm ring-2">
        <CardContent className="flex flex-col gap-2">
          <Label htmlFor="request-company">Request a company</Label>
          <div className="flex flex-row items-center gap-2">
            <Input
              className="bg-muted"
              id="request-company"
              placeholder="e.g. ByteDance, Canva, Discord…"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
            />
            <Button disabled={!company.trim() || submit.isPending} onClick={() => submit.mutate()}>
              {submit.isPending ? "Submitting…" : "Express interest"}
            </Button>
          </div>
        </CardContent>
      </Card>
      {(error || submit.error) && (
        <p role="alert" className="text-sm text-destructive">
          {(submit.error ?? error)?.message}
        </p>
      )}
      {isLoading && <p className="text-sm text-muted-foreground">Loading company requests…</p>}

      <div className="flex flex-col gap-4">
        {data?.requests.map((request) => (
          <Card key={request.id}>
            <CardContent className="flex flex-col gap-2">
              <div className="flex flex-row flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{request.company}</span>
                <Badge variant="secondary">{request.status}</Badge>
              </div>
              <span className="text-xs text-muted-foreground">
                Submitted {new Date(request.at).toLocaleDateString("en-GB")} · LUCA and Akula review
                this request.
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
