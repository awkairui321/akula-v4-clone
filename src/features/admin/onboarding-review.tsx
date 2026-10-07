import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckIcon } from "lucide-react";
import { api } from "@/lib/api";
import type { AccreditationStatus, AdminInvestor, IdentityStatus } from "./types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const IDENTITY_CHOICES: IdentityStatus[] = ["pending", "verified", "failed"];
const ACCREDITATION_CHOICES: AccreditationStatus[] = ["pending", "accredited", "not_accredited"];

/** Record the Fund Manager's identity and accreditation decision for one client. */
export function OnboardingReviewDialog({
  investor,
  onClose,
  onReviewed,
}: {
  investor: AdminInvestor;
  onClose: () => void;
  onReviewed: () => void;
}) {
  const [identity, setIdentity] = useState<IdentityStatus | null>(null);
  const [accreditation, setAccreditation] = useState<AccreditationStatus | null>(null);

  const review = useMutation({
    mutationFn: () =>
      api<{ investor: AdminInvestor }>(`/api/v1/admin/investors/${investor.id}/verification`, {
        method: "PATCH",
        body: {
          identity_status: identity ?? undefined,
          accreditation_status: accreditation ?? undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Decision recorded.");
      onReviewed();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>{investor.full_name}</DialogTitle>
        <p className="text-sm text-muted-foreground">
          {investor.email} · {investor.investor_type === "institutional" ? "Entity" : "Individual"}{" "}
          onboarding
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Identity</Label>
            <p className="text-xs text-muted-foreground">
              Currently {investor.identity_status.replace(/_/g, " ")}
            </p>
            <div className="flex flex-wrap gap-2">
              {IDENTITY_CHOICES.map((choice) => (
                <Button
                  key={choice}
                  size="sm"
                  variant={identity === choice ? "secondary" : "outline"}
                  onClick={() => setIdentity(choice === identity ? null : choice)}
                >
                  {choice === investor.identity_status && (
                    <CheckIcon className="size-3.5 text-muted-foreground" />
                  )}
                  {choice.replace(/_/g, " ")}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Accreditation</Label>
            <p className="text-xs text-muted-foreground">
              Currently {investor.accreditation_status.replace(/_/g, " ")}
            </p>
            <div className="flex flex-wrap gap-2">
              {ACCREDITATION_CHOICES.map((choice) => (
                <Button
                  key={choice}
                  size="sm"
                  variant={accreditation === choice ? "secondary" : "outline"}
                  onClick={() => setAccreditation(choice === accreditation ? null : choice)}
                >
                  {choice === investor.accreditation_status && (
                    <CheckIcon className="size-3.5 text-muted-foreground" />
                  )}
                  {choice.replace(/_/g, " ")}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {investor.internal_notes && (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            {investor.internal_notes}
          </p>
        )}

        <div className="flex items-center justify-between">
          <Link
            to={`/luca/investors/${investor.id}`}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            View full profile
          </Link>
          <Button
            disabled={review.isPending || (!identity && !accreditation)}
            onClick={() => review.mutate()}
          >
            Record decision
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
