import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import type { WatchlistItem } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatPricePrecise } from "@/lib/currency";
import { MoveRight, XIcon } from "lucide-react";

export default function Watchlist() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["watchlist"],
    queryFn: () => api<{ watchlist: WatchlistItem[] }>("/api/v1/watchlist"),
  });

  const removeMutation = useMutation({
    mutationFn: (fundId: number) => api(`/api/v1/watchlist/${fundId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });

  const watchlist = data?.watchlist ?? [];

  if (isLoading) {
    return <p className="py-12 text-center text-muted-foreground">Loading watchlist...</p>;
  }

  if (watchlist.length === 0) {
    return (
      <Card className="mt-2 border-2 border-dashed ring-0">
        <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
          <p className="text-muted-foreground">You are not watching any opportunities yet.</p>
          <Button variant="outline" render={<Link to="/funds" />}>
            Browse opportunities
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-4">
      {watchlist.map((item) => (
        <Link key={item.id} to={`/funds/${item.fund_id}`}>
          <Card className="cursor-pointer">
            <CardContent className="flex flex-row items-center justify-between">
              <div>
                <div className="flex flex-row items-center gap-2">
                  <div className="text-lg">{item.asset_name}</div>
                  <Badge variant="secondary">{item.state === "open" ? "Live" : "Closed"}</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  {item.fund_name} · min {formatPricePrecise(item.min_subscription)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    removeMutation.mutate(item.fund_id);
                  }}
                >
                  <XIcon className="size-4" />
                </Button>
                <MoveRight className="size-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
