import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { InvestorReviewStatus } from "@/lib/client-onboarding";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Where the investor's application stands with LUCA, in LUCA's words. Silent while all is well;
 * speaks when LUCA needs something or has declined, and lets the investor answer or reapply.
 */
export function ReviewStatusBanner({ showWaiting = false }: { showWaiting?: boolean }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const { data } = useQuery({
    queryKey: ["onboarding", "review"],
    queryFn: () => api<InvestorReviewStatus>("/api/v1/onboarding/review"),
    retry: false,
  });
  const resubmit = useMutation({
    mutationFn: () =>
      api<InvestorReviewStatus>("/api/v1/onboarding/resubmit", {
        method: "POST",
        body: { note: note.trim() || undefined },
      }),
    onSuccess: () => {
      setNote("");
      toast.success("Sent to LUCA for review.");
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!data) return null;

  if (data.status === "in_review")
    return showWaiting ? (
      <p className="mb-8 border-l-2 border-primary bg-muted/40 px-4 py-3 text-sm">
        LUCA is reviewing your identity and accreditation. You will hear from LUCA as soon as there
        is a decision.
      </p>
    ) : null;
  if (data.status !== "needs_info" && data.status !== "declined") return null;

  const declined = data.status === "declined";
  return (
    <div
      className={`mb-8 space-y-3 border-l-2 px-4 py-3 text-sm ${declined ? "border-destructive" : "border-amber-500"} bg-muted/40`}
    >
      <div>
        <p className="font-medium">
          {declined ? "LUCA could not approve your application" : "LUCA needs more from you"}
        </p>
        {data.note && <p className="mt-1">{data.note}</p>}
        <p className="mt-1 text-muted-foreground">
          {declined
            ? "You can reapply once this is resolved. Your details and documents stay on file; update or add to them first."
            : "Add what LUCA asked for under Verify Identity or Documents, then send it back for review."}{" "}
          <Link to="/documents" className="underline underline-offset-2">
            Go to documents
          </Link>
        </p>
      </div>
      <Textarea
        aria-label="A note for LUCA"
        rows={2}
        placeholder="A note for LUCA (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button size="sm" disabled={resubmit.isPending} onClick={() => resubmit.mutate()}>
        {declined ? "Reapply" : "Send back for review"}
      </Button>
    </div>
  );
}
