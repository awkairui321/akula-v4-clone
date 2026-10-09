import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
 * The Fund Manager's decision on what the Investment Team submitted, shown above the deal itself
 * (the overview is what investors will see). Approving publishes; sending back needs a reason.
 * What changed is one line, with the field-by-field comparison a click away.
 */
export default function DealReview({ fund, version }: { fund: Fund; version: Version }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [sendingBack, setSendingBack] = useState(false);
  const [reason, setReason] = useState("");
  const [showChanges, setShowChanges] = useState(false);

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

  const waiting = daysWaiting(version.at);
  const summary = impact?.newOffering
    ? `New offering · ${version.checklist?.filter((item) => item.done).length ?? 0} of ${version.checklist?.length ?? 0} checks complete`
    : diff.length === 0
      ? "No content differs from the live version"
      : `Changed: ${diff.map((row) => row.label).join(", ")}`;

  return (
    <section aria-label="Submitted for your approval" className="space-y-3 border-y py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 space-y-1">
          <p className={SECTION_LABEL}>Submitted for your approval</p>
          <p className="text-sm font-medium">
            {fromManager ? "Prepared by you" : "Sent by the Investment Team"} on{" "}
            {formatDate(version.at)}
            {waiting > 0 && ` · waiting ${waiting} day${waiting === 1 ? "" : "s"}`}
          </p>
          {version.note && !fromManager && (
            <p className="text-sm text-muted-foreground">“{version.note}”</p>
          )}
          <p className="text-sm text-muted-foreground">
            {summary}
            {(impact?.newOffering ? !!version.checklist?.length : diff.length > 0) && (
              <>
                {" · "}
                <button
                  type="button"
                  aria-expanded={showChanges}
                  onClick={() => setShowChanges((open) => !open)}
                  className="text-foreground underline underline-offset-2"
                >
                  {showChanges
                    ? "Hide details"
                    : impact?.newOffering
                      ? "Show checks"
                      : "Show changes"}
                </button>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

      {showChanges &&
        (impact?.newOffering ? (
          <ul className="space-y-2 border-t pt-3">
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
        ) : (
          <div className="divide-y border-t">
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
        ))}

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
    </section>
  );
}
