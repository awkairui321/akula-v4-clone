import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Fund } from "@/lib/types";
import DealOverviewPage from "@/components/deal-overview-page";

export default function FundDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ["fund", Number(id)],
    queryFn: () => api<{ fund: Fund }>(`/api/v1/funds/${id}`),
    enabled: !!id,
  });

  const fund = data?.fund;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!fund) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Fund not found.</p>
      </div>
    );
  }

  return (
    <DealOverviewPage
      key={fund.id}
      fund={fund}
      viewer="investor"
      backTo="/funds"
      backLabel="Back to opportunities"
    />
  );
}
