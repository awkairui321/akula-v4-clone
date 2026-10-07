import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import type { Subscription } from "@/lib/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Subscriptions from "./components/subscriptions";
import SubscriptionActivity from "./components/subscription-activity";
import Requests from "./components/requests";

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

const SECTIONS = ["holdings", "activity", "requests"] as const;
type Section = (typeof SECTIONS)[number];

// Older links used "subscriptions" (holdings & subscriptions) and "todos" (tasks to do).
const LEGACY_SECTIONS: Record<string, Section> = {
  subscriptions: "activity",
  todos: "activity",
};

const ACTION_STATUSES = [
  "reserved",
  "documents_pending",
  "information_requested",
  "approved",
  "payment_unmatched",
];

export default function PortfolioPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("section") ?? "";
  const section: Section = (SECTIONS as readonly string[]).includes(requested)
    ? (requested as Section)
    : (LEGACY_SECTIONS[requested] ?? "holdings");

  const { data: subsData } = useQuery({
    queryKey: ["subscriptions"],
    queryFn: () => api<{ subscriptions: Subscription[] }>("/api/v1/subscriptions"),
  });

  // The badge on Subscription Activity counts subscriptions that need the investor to act.
  const actionCount = (subsData?.subscriptions ?? []).filter((subscription) =>
    ACTION_STATUSES.includes(subscription.status),
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="text-3xl font-bold tracking-tight">Your portfolio</div>
        <p className="text-muted-foreground">Holdings and subscription activity.</p>
      </div>
      <Tabs
        value={section}
        onValueChange={(value) => setSearchParams({ section: String(value) })}
        className="min-w-0"
      >
        <TabsList variant="line" className="w-full justify-start border-b">
          <TabsTrigger value="holdings" className="flex-none">
            Holdings
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex-none">
            {TabTitle("Subscription Activity", actionCount)}
          </TabsTrigger>
          <TabsTrigger value="requests" className="flex-none">
            {TabTitle("Requests & discussions", 0)}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="holdings" className="w-full min-w-0">
          <Subscriptions />
        </TabsContent>
        <TabsContent value="activity" className="w-full min-w-0">
          <SubscriptionActivity />
        </TabsContent>
        <TabsContent value="requests" className="w-full min-w-0">
          <Requests />
        </TabsContent>
      </Tabs>
    </div>
  );
}
