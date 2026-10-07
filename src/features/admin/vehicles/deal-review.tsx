import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2Icon, CircleIcon } from "lucide-react";
import { api } from "@/lib/api";
import type { Fund } from "@/lib/types";
import type { Version, WorkflowCommand, WorkflowView } from "@/lib/workflow-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const daysWaiting = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

const SECTION_LABEL = "text-xs font-medium tracking-wide text-muted-foreground uppercase";

/**
 * The Fund Manager's review of what the Investment Team submitted: what changed against the
 * live version, a preview of what investors will see, and one decision.
 */
export default function DealReview({
  fund,
  version,
  onPreview,
}: {
  fund: Fund;
  version: Version;
  onPreview: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [sendingBack, setSendingBack] = useState(false);
  const [reason, setReason] = useState("");

  const run = useMutation({
    mutationFn: (command: WorkflowCommand) =>
      api<WorkflowView>("/api/v1/workflows", { method: "POST", body: command }),
    onError: (e: Error) => toast.error(e.message),
  });
  const finish = (message: string) => {
    queryClient.invalidateQueries();
    toast.success(message);
    navigate("/luca/deals");
  };

  const diff = version.diff ?? [];
  const impact = version.impact;
  const material = diff.filter((row) => row.material);
  const fromManager = version.note === "Edited by the Fund Manager.";

  return (
    <div className="space-y-8">
      <section className="space-y-1">
        <p className={SECTION_LABEL}>Submitted for your approval</p>
        <p className="text-sm">
          {fromManager ? "Prepared by you" : "Sent by the Investment Team"} on{" "}
          {formatDate(version.at)}
          {daysWaiting(version.at) > 0 && ` · waiting ${daysWaiting(version.at)} days`}
        </p>
        {version.note && !fromManager && (
          <p className="text-sm text-muted-foreground">“{version.note}”</p>
        )}
      </section>

      {impact?.newOffering ? (
        <section className="space-y-3">
          <h2 className={SECTION_LABEL}>New offering: completeness</h2>
          <ul className="space-y-2">
            {version.checklist?.map((item) => (
              <li key={item.label} className="flex items-center gap-2 text-sm">
                {item.done ? (
                  <CheckCircle2Icon className="size-4 text-green-600" />
                ) : (
                  <CircleIcon className="size-4 text-muted-foreground/50" />
                )}
                <span className={item.done ? "" : "text-muted-foreground"}>{item.label}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            This offering has never been published. Approving makes it visible to eligible
            investors.
          </p>
        </section>
      ) : (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className={SECTION_LABEL}>What changed from the live version ({diff.length})</h2>
            <Button variant="outline" size="sm" onClick={onPreview}>
              Preview as investor
            </Button>
          </div>
          {diff.length === 0 ? (
            <p className="border-y py-4 text-sm text-muted-foreground">
              No content differs from the live version.
            </p>
          ) : (
            <div className="divide-y border-y">
              <div className="grid grid-cols-[10rem_1fr_1fr] gap-4 py-2 text-xs text-muted-foreground max-md:hidden">
                <span>Field</span>
                <span>Live now</span>
                <span>Proposed</span>
              </div>
              {diff.map((row, index) => (
                <div
                  key={`${row.label}-${index}`}
                  className="grid gap-x-4 gap-y-1 py-3 text-sm md:grid-cols-[10rem_1fr_1fr]"
                >
                  <div>
                    <p className="font-medium">{row.label}</p>
                    {row.material && <p className="text-xs text-amber-700">Investor terms</p>}
                    {row.editedByManager && (
                      <p className="text-xs text-muted-foreground">Edited by you</p>
                    )}
                  </div>
                  <p className="text-muted-foreground line-through decoration-muted-foreground/40">
                    {row.before}
                  </p>
                  <p className="font-medium text-green-800">{row.after}</p>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            You can edit the deal yourself before deciding. Edits you make appear here and are what
            gets published.
          </p>
        </section>
      )}

      <div className="sticky bottom-0 -mx-3 flex flex-wrap items-center justify-between gap-3 border-t bg-background px-3 py-3 sm:-mx-6 sm:px-6">
        <p className="text-sm text-muted-foreground">
          Approving publishes version {version.number} to investors.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/luca/deals">
            <Button variant="ghost" size="sm">
              Decide later
            </Button>
          </Link>
          {!fromManager && (
            <Button variant="outline" size="sm" onClick={() => setSendingBack(true)}>
              Send back
            </Button>
          )}
          <Button size="sm" onClick={() => setConfirming(true)}>
            Approve and publish
          </Button>
        </div>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>
            Publish version {version.number} of {fund.codename}?
          </DialogTitle>
          <div className="space-y-3 text-sm">
            <p>
              {impact?.newOffering
                ? "The offering becomes visible to eligible investors."
                : "This replaces the live version for investors."}
            </p>
            {!!impact?.subscribers && (
              <p className="text-muted-foreground">
                {impact.subscribers} existing application{impact.subscribers === 1 ? "" : "s"} will
                be asked to acknowledge the revised version before moving forward.
              </p>
            )}
            {material.length > 0 && (
              <p className="text-amber-700">
                Investor terms change: {material.map((row) => row.label).join(", ")}.
              </p>
            )}
            <p className="text-muted-foreground">Recorded as approved by you today.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              disabled={run.isPending}
              onClick={() =>
                run.mutate(
                  { type: "approve", id: version.id },
                  { onSuccess: () => finish(`${fund.codename} is now live for investors.`) },
                )
              }
            >
              {run.isPending ? "Publishing..." : "Approve and publish"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={sendingBack} onOpenChange={setSendingBack}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Send back to the Investment Team</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Say what they should change. They see this at the top of their draft.
          </p>
          <Input
            aria-label="Reason for sending back"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="For example: confirm the fee wording"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setSendingBack(false)}>
              Cancel
            </Button>
            <Button
              disabled={!reason.trim() || run.isPending}
              onClick={() =>
                run.mutate(
                  { type: "send-back", id: version.id, text: reason },
                  { onSuccess: () => finish("Sent back to the Investment Team.") },
                )
              }
            >
              Send back
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
