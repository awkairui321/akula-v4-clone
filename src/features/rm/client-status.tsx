import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon } from "lucide-react";
import { api } from "@/lib/api";
import type { ReviewBundle } from "@/lib/client-onboarding";
import { OnboardingRecord } from "@/features/clients/onboarding-record";

/** An assigned client's onboarding, read-only. Accounts the RM prepared open the editor instead. */
export default function RmClientStatusPage() {
  const { id } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["rm", "clients", id, "status"],
    queryFn: () => api<ReviewBundle>(`/api/v1/rm/clients/${id}/status`),
    enabled: Boolean(id),
  });
  if (isLoading) return <p className="py-12 text-center text-muted-foreground">Loading...</p>;
  if (!data)
    return (
      <p className="py-12 text-center text-muted-foreground">
        {error instanceof Error ? error.message : "Client not found."}
      </p>
    );
  const { investor } = data;
  return (
    <div className="flex flex-col gap-8">
      <div className="space-y-4">
        <Link
          to="/rm/onboarding"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Client onboarding
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{investor.full_name}</h1>
          <p className="mt-1 text-muted-foreground">
            {investor.email} ·{" "}
            {investor.investor_type === "institutional" ? "Entity" : "Individual"}
          </p>
        </div>
      </div>
      <OnboardingRecord bundle={data} events={data.events} />
    </div>
  );
}
