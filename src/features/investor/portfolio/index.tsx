import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import type { Subscription, Holding, WatchlistItem } from "@/lib/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Subscriptions from "./components/subscriptions";
import Watchlist from "./components/watchlist";
import Requests from "./components/requests";
import InvestorTodos from "./components/todos";

function TabTitle(title: string, count: number) {
  return (
    <div className="flex flex-row items-center gap-2 whitespace-nowrap">
      <div>{title}</div>
      <div className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
        {count}
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  const [searchParams] = useSearchParams();
  const { data: holdingsData } = useQuery({
    queryKey: ["holdings"],
    queryFn: () => api<{ holdings: Holding[] }>("/api/v1/holdings"),
  });

  const { data: subsData } = useQuery({
    queryKey: ["subscriptions"],
    queryFn: () => api<{ subscriptions: Subscription[] }>("/api/v1/subscriptions"),
  });

  const { data: watchlistData } = useQuery({
    queryKey: ["watchlist"],
    queryFn: () => api<{ watchlist: WatchlistItem[] }>("/api/v1/watchlist"),
  });

  const holdingsCount =
    (holdingsData?.holdings?.length ?? 0) + (subsData?.subscriptions?.length ?? 0);
  const watchlistCount = watchlistData?.watchlist?.length ?? 0;
  const todosCount = (subsData?.subscriptions ?? []).filter((subscription) =>
    [
      "reserved",
      "documents_pending",
      "information_requested",
      "approved",
      "payment_unmatched",
    ].includes(subscription.status),
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="text-3xl font-bold tracking-tight">Your portfolio</div>
        <p className="text-muted-foreground">Holdings, active subscriptions, and watchlist.</p>
      </div>
      <Tabs defaultValue={searchParams.get("section") ?? "subscriptions"}>
        <TabsList variant="line" className="w-full justify-start border-b">
          <TabsTrigger value="subscriptions" className="flex-none">
            {TabTitle("Holdings & subscriptions", holdingsCount)}
          </TabsTrigger>
          <TabsTrigger value="watchlist" className="flex-none">
            {TabTitle("Watchlist", watchlistCount)}
          </TabsTrigger>
          <TabsTrigger value="requests" className="flex-none">
            {TabTitle("Requests & discussions", 0)}
          </TabsTrigger>
          <TabsTrigger value="todos" className="flex-none">
            {TabTitle("Tasks to do", todosCount)}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="subscriptions">
          <Subscriptions />
        </TabsContent>
        <TabsContent value="watchlist">
          <Watchlist />
        </TabsContent>
        <TabsContent value="requests">
          <Requests />
        </TabsContent>
        <TabsContent value="todos">
          <InvestorTodos />
        </TabsContent>
      </Tabs>
    </div>
  );
}
