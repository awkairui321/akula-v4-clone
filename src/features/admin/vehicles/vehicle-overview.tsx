import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Fund } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon } from "lucide-react";
import DealOverviewPage from "@/components/deal-overview-page";
import PublishedDealEditor from "@/features/admin/vehicles/published-deal-editor";

function VehicleOverview({ fund, ops = false }: { fund: Fund; ops?: boolean }) {
  const [editorOpen, setEditorOpen] = useState(false);

  return (
    <>
      <PublishedDealEditor
        key={`${fund.id}-${editorOpen}`}
        fund={fund}
        open={editorOpen}
        onOpenChange={setEditorOpen}
      />
      <DealOverviewPage
        key={fund.id}
        fund={fund}
        viewer={ops ? "ops" : "luca"}
        backTo={ops ? "/workflows" : "/luca/deals"}
        backLabel={ops ? "Back to Ops publication" : "Back to vehicles"}
        onEditDeal={() => setEditorOpen(true)}
      />
    </>
  );
}

export default function AdminVehicleOverviewPage({ ops = false }: { ops?: boolean }) {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ["fund", Number(id)],
    queryFn: () => api<{ fund: Fund }>(`/api/v1/funds/${id}`),
    enabled: !!id,
  });

  if (isLoading) {
    return <p className="py-12 text-center text-muted-foreground">Loading vehicle...</p>;
  }

  const fund = data?.fund;
  if (!fund) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">Vehicle not found.</p>
        <Link to={ops ? "/workflows" : "/luca/deals"}>
          <Button variant="outline" size="sm" className="mt-4">
            <ArrowLeftIcon className="mr-1 size-4" />
            Back to vehicles
          </Button>
        </Link>
      </div>
    );
  }

  return <VehicleOverview key={fund.id} fund={fund} ops={ops} />;
}
