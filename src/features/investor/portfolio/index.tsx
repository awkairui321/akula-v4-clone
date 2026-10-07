import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import Subscriptions from "./components/subscriptions";
import SubscriptionActivity from "./components/subscription-activity";
import Requests from "./components/requests";

export default function PortfolioPage() {
  const [params] = useSearchParams();
  const activity = useRef<HTMLElement>(null);
  const requests = useRef<HTMLElement>(null);
  const section = params.get("section");
  useEffect(() => {
    const target =
      section === "requests"
        ? requests
        : ["activity", "subscriptions", "todos"].includes(section ?? "")
          ? activity
          : null;
    target?.current?.scrollIntoView({ block: "start" });
  }, [section]);
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Your portfolio</h1>
        <p className="text-muted-foreground">Holdings and subscription activity.</p>
      </div>
      <Subscriptions />
      <section
        ref={activity}
        id="subscription-activity"
        className="scroll-mt-6 space-y-4 border-t pt-8"
      >
        <h2 className="text-xl font-semibold">Subscription activity</h2>
        <SubscriptionActivity />
      </section>
      <section ref={requests} id="requests" className="scroll-mt-6 space-y-4 border-t pt-8">
        <Requests />
      </section>
    </div>
  );
}
