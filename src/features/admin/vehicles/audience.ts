import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  INDEPENDENT_FUND_IDS,
  audienceIncludes,
  type InvestorSegment,
} from "@/lib/investor-access";
import type { Fund } from "@/lib/types";
import type { AdminInvestor } from "../types";
import { useAuth } from "@/contexts/auth-context";

export type AudienceClient = Pick<
  AdminInvestor,
  "id" | "full_name" | "client_code" | "reference" | "investor_type" | "segment" | "partner"
>;

/** Who a deal goes to, as the editor holds it. */
export type AudienceDraft = {
  classes: InvestorSegment[];
  partners: string[];
  investors: number[];
  /** Clients who never see the deal, whatever else includes them. */
  excluded: number[];
};

export const ALL_CLASSES: InvestorSegment[] = ["independent", "partner_referred"];

/** A deal without an explicit audience follows the original rule: partner clients, plus direct clients on a few funds. */
export function audienceDraftFrom(fund: Fund): AudienceDraft {
  return {
    classes:
      fund.eligible_segments ??
      (INDEPENDENT_FUND_IDS.includes(fund.id) ? ALL_CLASSES : ["partner_referred"]),
    partners: fund.audience_partners ?? [],
    investors: fund.audience_investors ?? [],
    excluded: fund.audience_excluded ?? [],
  };
}

/** The deal as it would be with this audience, so one function answers "who sees it". */
export const withAudience = (fund: Fund, audience: AudienceDraft): Fund => ({
  ...fund,
  eligible_segments: audience.classes,
  audience_partners: audience.partners,
  audience_investors: audience.investors,
  audience_excluded: audience.excluded,
});

/** Onboarded clients: only they can see deals, so only they can be recipients. */
export function useAudienceClients() {
  const { user } = useAuth();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "offering-audience", user?.id],
    queryFn: () => api<{ clients: AudienceClient[] }>("/api/v1/admin/offering-audience"),
  });
  const clients = useMemo(
    () => [...(data?.clients ?? [])].sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [data],
  );
  return { clients, isLoading, isError, refetch };
}

export const sourceOf = (client: AudienceClient) =>
  client.partner ?? (client.segment === "partner_referred" ? "RM referral" : "Direct");

/** The clients a deal reaches, and how they break down. */
export function recipientsOf(fund: Fund, clients: AudienceClient[]) {
  const people = clients.filter((client) =>
    audienceIncludes(
      fund,
      { id: client.id, segment: client.segment, partner: client.partner },
      fund.id,
    ),
  );
  const bySource = new Map<string, number>();
  for (const client of people)
    bySource.set(sourceOf(client), (bySource.get(sourceOf(client)) ?? 0) + 1);
  return {
    people,
    entities: people.filter((c) => c.investor_type === "institutional").length,
    individuals: people.filter((c) => c.investor_type !== "institutional").length,
    bySource: [...bySource.entries()].sort((a, b) => b[1] - a[1]),
  };
}
