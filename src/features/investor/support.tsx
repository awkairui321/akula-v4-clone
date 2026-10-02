import { ServiceDesk } from "@/features/workspace/workflow-page";

export default function SupportPage() {
  return (
    <div className="flex flex-col gap-6 [&_.wf-content]:!mx-0">
      <div>
        <div className="text-3xl font-bold tracking-tight">Support</div>
        <p className="text-muted-foreground">
          Service requests, allocation and funding queries, and early-exit reviews.
        </p>
      </div>
      <ServiceDesk />
    </div>
  );
}
