import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import type { Fund } from "@/lib/types";
import type { WorkflowCommand, WorkflowView } from "@/lib/workflow-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * Where this deal is in publication, and the one next step for whoever is looking at it.
 * Investment Team: prepare and submit. Fund Manager: review, approve (which publishes) or send back.
 * Akula Ops edits show to the Investment Team only; the Fund Manager sees what the team submits.
 */
export default function PublicationBar({
  fund,
  actionsOnly = false,
  onEdit,
}: {
  fund: Fund;
  actionsOnly?: boolean;
  onEdit?: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [, setSearchParams] = useSearchParams();

  const { data } = useQuery({
    queryKey: ["workflows", user?.id],
    queryFn: () => api<WorkflowView>("/api/v1/workflows"),
    staleTime: 0,
  });

  const run = useMutation({
    mutationFn: (command: WorkflowCommand) =>
      api<WorkflowView>("/api/v1/workflows", { method: "POST", body: command }),
    onSuccess: () => {
      setNote("");
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isTeam = user?.role === "investment_team";
  const isManager = user?.role === "luca";
  if (!data || (!isTeam && !isManager)) return null;
  if (isManager && data.versions.some((v) => v.fundId === fund.id && v.status === "review"))
    return null;

  const versions = data.versions
    .filter((v) => v.fundId === fund.id)
    .sort((a, b) => b.number - a.number);
  const open = versions.find((v) => v.status !== "published");
  const published = versions.find((v) => v.status === "published");
  const working = data.unpublished.find((u) => u.fundId === fund.id);
  const opsEdits = data.dealChanges.filter(
    (c) => c.fundId === fund.id && c.byRole === "ops" && c.includedInVersion === undefined,
  );

  if (actionsOnly)
    return (
      <div className="flex flex-wrap items-center gap-2">
        {isTeam && !open && (
          <Button
            size="sm"
            disabled={run.isPending}
            onClick={() => run.mutate({ type: "prepare", id: fund.id })}
          >
            Prepare draft version
          </Button>
        )}
        {isTeam && open?.status === "draft" && (
          <>
            <Input
              aria-label="Note for the Fund Manager"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note for the Fund Manager (optional)"
              className="w-72"
            />
            <Button
              size="sm"
              disabled={run.isPending}
              onClick={() => run.mutate({ type: "review", id: open.id, text: note })}
            >
              Submit to Fund Manager
            </Button>
          </>
        )}
        {isManager && !open && working && (
          <Button
            size="sm"
            disabled={run.isPending}
            onClick={() =>
              run.mutate(
                { type: "stage", id: fund.id },
                { onSuccess: () => setSearchParams({ tab: "review" }) },
              )
            }
          >
            Review and publish my edits
          </Button>
        )}
      </div>
    );
  return (
    <section className="space-y-3 border-y py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Publication
          </p>
          <p className="text-sm font-medium">
            {!open
              ? published
                ? `Version ${published.number} is live for investors`
                : "Not yet published"
              : open.status === "draft"
                ? `Version ${open.number} is a draft with the Investment Team`
                : open.status === "review"
                  ? `Version ${open.number} is awaiting Fund Manager approval`
                  : `Version ${open.number} is approved`}
          </p>
          {open?.status === "draft" && open.decision?.outcome === "returned" && (
            <p className="text-sm text-amber-700">
              Returned by the Fund Manager: {open.decision.text}
            </p>
          )}
          {open?.status === "review" && (
            <>
              {open.note && (
                <p className="text-sm text-muted-foreground">
                  Note from the Investment Team: {open.note}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                {open.changed?.length
                  ? `Changed from the published version: ${open.changed.join(", ")}.`
                  : "No earlier published version to compare with."}
              </p>
            </>
          )}
          {isManager && !open && working && (
            <p className="text-sm text-amber-700">
              You have edits that investors cannot see yet: {working.fields.join(", ")}.
            </p>
          )}
          {isTeam && opsEdits.length > 0 && (
            <p className="text-sm text-amber-700">
              Akula Ops edited {[...new Set(opsEdits.flatMap((c) => c.fields))].join(", ")} on{" "}
              {formatDate(opsEdits[opsEdits.length - 1].at)}. These go with your next submission.
            </p>
          )}
          {isTeam && open?.status === "review" && (
            <p className="text-sm text-muted-foreground">
              Editing is locked while the Fund Manager reviews this version.
            </p>
          )}
        </div>
        {onEdit && (
          <Button
            size="sm"
            variant="outline"
            disabled={isTeam && open?.status === "review"}
            onClick={onEdit}
          >
            Edit working overview
          </Button>
        )}{" "}
      </div>
    </section>
  );
}
