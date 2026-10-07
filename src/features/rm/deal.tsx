import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Fund } from "@/lib/types";
import DealOverviewPage from "@/components/deal-overview-page";
export default function RmDeal() {
  const { id } = useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["fund", Number(id)],
    queryFn: () => api<{ fund: Fund }>(`/api/v1/funds/${id}`),
  });
  if (!data) return <p>{isLoading ? "Loading deal…" : "Deal unavailable."}</p>;
  return (
    <DealOverviewPage
      fund={data.fund}
      viewer="rm"
      backTo="/rm/opportunities"
      backLabel="All opportunities"
    />
  );
}
