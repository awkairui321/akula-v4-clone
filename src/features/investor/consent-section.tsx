import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ConsentItem, ConsentsResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { LoaderIcon } from "lucide-react";

export function useConsents() {
  return useQuery({
    queryKey: ["consents"],
    queryFn: () => api<ConsentsResponse>("/api/v1/consents"),
  });
}

export function allRequiredGranted(consents: ConsentItem[]): boolean {
  return consents.filter((c) => c.required).every((c) => c.granted);
}

/**
 * Onboarding mode: grant every required item to proceed (nothing is
 * withdrawable yet — there's nothing to walk back before the account exists).
 * Management mode (investor account settings): review what's granted and
 * withdraw it, with a confirmation dialog since withdrawing is consequential.
 */
export function ConsentList({
  mode,
  onAllRequiredGranted,
}: {
  mode: "onboarding" | "management";
  onAllRequiredGranted?: () => void;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useConsents();
  const [pendingWithdraw, setPendingWithdraw] = useState<ConsentItem | null>(null);
  const consents = data?.consents ?? [];

  const grant = useMutation({
    mutationFn: (id: number) =>
      api<ConsentsResponse>("/api/v1/consents", {
        method: "POST",
        body: { consent_item_id: id },
      }),
    onSuccess: (res) => {
      queryClient.setQueryData(["consents"], res);
      if (allRequiredGranted(res.consents)) onAllRequiredGranted?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const withdraw = useMutation({
    mutationFn: (id: number) =>
      api<ConsentsResponse>(`/api/v1/consents/${id}`, { method: "DELETE" }),
    onSuccess: (res) => {
      queryClient.setQueryData(["consents"], res);
      toast.success("Consent withdrawn.");
      setPendingWithdraw(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <LoaderIcon className="size-4 animate-spin" />
        Loading...
      </div>
    );
  }

  const visible =
    mode === "management" ? consents.filter((c) => c.granted || c.required) : consents;

  const management = mode === "management";
  const renderItem = (item: ConsentItem) => {
    const content = (
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            {item.title}
            {item.required && (
              <span className="ml-1.5 text-xs text-muted-foreground">(required)</span>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{item.body}</p>
          {item.granted_at && (
            <p className="mt-1 text-xs text-muted-foreground">
              Granted {new Date(item.granted_at).toLocaleDateString()}
            </p>
          )}
        </div>
        {item.granted ? (
          management ? (
            <Button variant="outline" size="sm" onClick={() => setPendingWithdraw(item)}>
              Withdraw
            </Button>
          ) : (
            <span className="text-xs font-medium text-green-600">Granted</span>
          )
        ) : (
          <Button size="sm" onClick={() => grant.mutate(item.id)} disabled={grant.isPending}>
            Grant
          </Button>
        )}
      </div>
    );
    // Account settings reads as a divided list; onboarding keeps one card per item.
    return management ? (
      <div key={item.id} className="py-4">
        {content}
      </div>
    ) : (
      <Card key={item.id}>
        <CardContent className="space-y-2 pt-6">{content}</CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-3">
      {visible.length === 0 && (
        <p className="text-sm text-muted-foreground">No consent items apply to your account.</p>
      )}
      {visible.length > 0 && (
        <div className={management ? "divide-y border-y" : "space-y-3"}>
          {visible.map(renderItem)}
        </div>
      )}

      {pendingWithdraw && (
        <Dialog open onOpenChange={(open) => !open && setPendingWithdraw(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogTitle>Withdraw consent?</DialogTitle>
            <p className="text-sm text-muted-foreground">
              You're withdrawing "{pendingWithdraw.title}". This is recorded and may affect what we
              or your adviser can share with you going forward.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setPendingWithdraw(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => withdraw.mutate(pendingWithdraw.id)}
                disabled={withdraw.isPending}
              >
                {withdraw.isPending ? "Withdrawing..." : "Withdraw"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
