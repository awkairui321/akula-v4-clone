import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeftIcon } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { usePartnerBook } from "./use-partner-book";
import type { PartnerLine } from "./partner-data";
import { ByProject, CapitalHeader, ClientRows, useOpenSet } from "./capital-tree";

const SECTION_LABEL = "text-xs font-medium tracking-wide text-muted-foreground uppercase";

function ByClient({
  partner,
  open,
  toggle,
}: {
  partner: PartnerLine;
  open: Set<string>;
  toggle: (k: string) => void;
}) {
  return (
    <ClientRows clients={partner.clients} depth={0} open={open} toggle={toggle} keyPrefix="all" />
  );
}

/** One partner firm: what it raised, by project and fund, then by client and holding. */
export default function PartnerPage() {
  const { firm: encoded } = useParams<{ firm: string }>();
  const firm = decodeURIComponent(encoded ?? "");
  const { book, base, manager, termsFor, isLoading } = usePartnerBook();
  const [view, setView] = useState<"project" | "client">("project");
  const { open, toggle } = useOpenSet();

  if (isLoading || !book)
    return <p className="py-12 text-center text-muted-foreground">Loading partner...</p>;
  const partner = book.partners.find((p) => p.firm === firm);
  if (!partner)
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-muted-foreground">This partner is not in your client book.</p>
        <Link to={`${base}/partners`} className="text-sm underline">
          Partner client book
        </Link>
      </div>
    );
  const terms = manager ? termsFor(firm) : undefined;

  return (
    <div className="flex flex-col gap-8">
      <div className="space-y-6">
        <Link
          to={`${base}/partners`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Partner client book
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{partner.firm}</h1>
          <p className="mt-1 text-muted-foreground">
            {partner.clientCount} client{partner.clientCount === 1 ? "" : "s"} ·{" "}
            {partner.projects.length} project{partner.projects.length === 1 ? "" : "s"} ·{" "}
            {partner.activeApplications} active application
            {partner.activeApplications === 1 ? "" : "s"}
            {terms && ` · ${terms.display_name}, ${terms.contact_email}`}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 border-y py-5 lg:grid-cols-4">
          {(
            [
              ["Committed", formatPrice(partner.committed), "Subscribed and still live"],
              ["Funded", formatPrice(partner.funded), "Cash received, fees excluded"],
              ["Allocated", formatPrice(partner.allocated), "Allocated by LUCA"],
              manager
                ? [
                    "Revenue share",
                    terms?.eam_revenue_share_pct ? `${terms.eam_revenue_share_pct}%` : "—",
                    terms
                      ? `${formatPrice(terms.accrued_revenue)} accrued · ${formatPrice(terms.paid_revenue)} paid`
                      : "",
                  ]
                : [
                    "Waiting on a client",
                    String(partner.needsAction),
                    "Applications needing client action",
                  ],
            ] as const
          ).map(([label, value, note]) => (
            <div key={label}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{note}</p>
            </div>
          ))}
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className={SECTION_LABEL}>
            {view === "project" ? "Raised by project and fund" : "Raised by client"}
          </h2>
          <div className="flex items-center rounded-lg border bg-background p-0.5 text-sm">
            {(["project", "client"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1 ${view === v ? "bg-secondary font-medium" : "text-muted-foreground"}`}
              >
                {v === "project" ? "By project" : "By client"}
              </button>
            ))}
          </div>
        </div>
        <div className="border-y">
          <CapitalHeader first={view === "project" ? "Project, fund, client" : "Client"} />
          <div className="divide-y">
            {view === "project" ? (
              <ByProject projects={partner.projects} open={open} toggle={toggle} />
            ) : (
              <div className="divide-y">
                <ByClient partner={partner} open={open} toggle={toggle} />
              </div>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Open a project to see its funds, a fund to see this partner&apos;s clients in it, and a
          client to see their holdings at cost and latest reported value. Only LUCA publishes
          valuations.
        </p>
      </section>
    </div>
  );
}
