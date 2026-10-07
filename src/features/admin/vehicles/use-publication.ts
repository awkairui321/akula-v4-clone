import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import type { Version, WorkflowView } from "@/lib/workflow-types";

/** The publication state of every deal, for the Fund Manager's and Investment Team's screens. */
export function usePublication() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["workflows", user?.id],
    queryFn: () => api<WorkflowView>("/api/v1/workflows"),
    staleTime: 0,
    enabled: user?.role === "luca" || user?.role === "investment_team",
  });
  const versions = query.data?.versions ?? [];
  const waiting = versions
    .filter((v) => v.status === "review")
    .sort((a, b) => a.at.localeCompare(b.at));
  return { ...query, versions, waiting, unpublished: query.data?.unpublished ?? [] };
}

export type PublicationStatus = "update_waiting" | "awaiting_first" | "with_team" | "unpublished";

/** One word for where a deal sits in publication, or null when it is simply live. */
export function publicationStatus(
  fundId: number,
  versions: Version[],
  unpublished: { fundId: number; fields: string[] }[],
): { key: PublicationStatus; label: string } | null {
  const open = versions.find((v) => v.fundId === fundId && v.status !== "published");
  const live = versions.some((v) => v.fundId === fundId && v.status === "published");
  if (open?.status === "review")
    return live
      ? { key: "update_waiting", label: "Update waiting for approval" }
      : { key: "awaiting_first", label: "Awaiting first approval" };
  if (open?.status === "draft") return { key: "with_team", label: "With Investment Team" };
  if (unpublished.some((u) => u.fundId === fundId))
    return { key: "unpublished", label: "Unpublished edits" };
  return null;
}
