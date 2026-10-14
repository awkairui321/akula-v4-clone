import { useQuery } from "@tanstack/react-query";
import { CheckIcon, MinusIcon } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import type { WorkflowView } from "@/lib/workflow-types";

/** What went to Acclime and LUCA when this investor submitted, as the Fund Manager sees it. */
export function SubscriptionPackSummary({ subscriptionId }: { subscriptionId: number }) {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["workflows", user?.id],
    queryFn: () => api<WorkflowView>("/api/v1/workflows"),
    enabled: user?.role === "luca",
  });
  if (user?.role !== "luca" || !data) return null;
  const pack = data.packs.find((p) => p.subscriptionId === subscriptionId);

  return (
    <section className="space-y-2">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Subscription pack
      </p>
      {pack ? (
        <>
          <p className="text-xs text-muted-foreground">
            Sent to {pack.recipients.map((r) => r.name).join(" and ")} on{" "}
            {new Date(pack.createdAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
            .
          </p>
          <ul className="space-y-1.5 text-sm">
            {pack.items.map((item) => (
              <li key={item.kind} className="flex items-start gap-2">
                {item.available ? (
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-green-700" />
                ) : (
                  <MinusIcon className="mt-0.5 size-4 shrink-0 text-amber-700" />
                )}
                <span>
                  {item.label}
                  <span className="block text-xs text-muted-foreground">{item.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          No pack has been sent: the investor has not submitted this subscription yet.
        </p>
      )}
    </section>
  );
}
