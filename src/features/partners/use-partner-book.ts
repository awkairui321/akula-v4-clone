import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import type { WorkflowView } from "@/lib/workflow-types";
import type { AdminPartner } from "@/features/admin/types";
import { buildPartnerBook } from "./partner-data";

/** The partner book for whoever is signed in: an RM sees their clients, the Fund Manager everyone. */
export function usePartnerBook() {
  const { user } = useAuth();
  const manager = user?.role === "luca";
  const workflow = useQuery({
    queryKey: ["workflows", user?.id],
    queryFn: () => api<WorkflowView>("/api/v1/workflows"),
    staleTime: 0,
  });
  // Contract terms are the Fund Manager's; an RM never sees revenue share.
  const terms = useQuery({
    queryKey: ["admin", "partners", "terms"],
    queryFn: () => api<{ partners: AdminPartner[] }>("/api/v1/admin/partners"),
    enabled: manager,
  });
  const book = useMemo(
    () => (workflow.data ? buildPartnerBook(workflow.data) : null),
    [workflow.data],
  );
  return {
    isLoading: workflow.isLoading,
    book,
    base: manager ? "/luca" : "/rm",
    manager,
    termsFor: (firm: string) => terms.data?.partners.find((p) => p.firm_name === firm),
  };
}
