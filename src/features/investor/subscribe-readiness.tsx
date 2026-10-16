import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ReadinessIssue } from "@/lib/subscription-readiness";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/** What, if anything, stops this investor starting a subscription. Read fresh each time. */
export function useSubscriptionReadiness() {
  return useQuery({
    queryKey: ["subscriptionReadiness"],
    queryFn: () =>
      api<{ ready: boolean; issues: ReadinessIssue[] }>("/api/v1/investor/subscription_readiness"),
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  });
}

/**
 * Shown when the investor presses Start subscription without everything in place. It names each
 * gap and where to fix it, so nothing is discovered after they have transferred their funds.
 */
export function SubscribeBlockedDialog({
  issues,
  onClose,
}: {
  issues: ReadinessIssue[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>You can't subscribe yet</DialogTitle>
        <DialogDescription>
          Put right {issues.length === 1 ? "this" : "these"} first, then come back. Checking now
          means your subscription is not held up after you transfer your funds.
        </DialogDescription>
        <ul className="mt-4 divide-y border-y">
          {issues.map((issue) => (
            <li key={issue.key} className="flex flex-wrap items-start justify-between gap-3 py-4">
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-sm font-medium">{issue.title}</p>
                <p className="text-sm text-muted-foreground">{issue.detail}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate(issue.to)}>
                {issue.action}
              </Button>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
