import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { SECTOR_LABELS, STAGE_LABELS } from "@/lib/types";
import type { DiscoverCompany } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { ArrowLeftIcon } from "lucide-react";

export default function DiscoverDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ["discover", Number(id)],
    queryFn: () => api<{ company: DiscoverCompany }>(`/api/v1/discover/${id}`),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const company = data?.company;
  if (!company) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Company not found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/discover"
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <ArrowLeftIcon className="size-3.5" />
        Back to potential opportunities
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{company.codename ?? company.name}</h1>
          <p className="text-sm text-muted-foreground">
            {STAGE_LABELS[company.funding_stage] ?? company.funding_stage} ·{" "}
            {SECTOR_LABELS[company.sector] ?? company.sector}
          </p>
        </div>
        <Badge variant="outline">Potential opportunity</Badge>
      </div>

      {/* Not available callout */}
      <div className="rounded-r-md border-l-4 border-primary bg-muted/50 p-4">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Not currently available to invest.</strong> Akula is
          tracking this company, but no live Akula vehicle has been published.
        </p>
      </div>

      {/* About the company */}
      {(company.about || company.description) && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            About the company
          </h2>
          <p className="text-sm">{company.about ?? company.description}</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">{SECTOR_LABELS[company.sector] ?? company.sector}</Badge>
            <Badge variant="outline">
              {STAGE_LABELS[company.funding_stage] ?? company.funding_stage}
            </Badge>
            <Badge variant="outline">Private company</Badge>
          </div>
        </div>
      )}

      {/* Why Akula tracks it */}
      {company.thesis && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Why Akula tracks it
          </h2>
          <p className="text-sm">{company.thesis}</p>
        </div>
      )}

      {/* Key risks */}
      {company.risks?.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Key risks
          </h2>
          <div className="rounded-lg border bg-muted/30 p-4">
            <ul className="space-y-2">
              {company.risks.map((r, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="mt-0.5 shrink-0 text-muted-foreground">•</span>
                  <span>{r.title}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Company facts */}
      <div className="space-y-2">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Company facts
        </h2>
        <div className="divide-y text-sm">
          <FactRow label="Legal name" value={company.legal_name ?? company.name} />
          <FactRow label="Founded" value={company.founded_year?.toString()} />
          <FactRow label="Headquarters" value={company.headquarters} />
          {company.country_of_incorporation && (
            <FactRow label="Country of incorporation" value={company.country_of_incorporation} />
          )}
          <FactRow
            label="Employees"
            value={
              company.employee_count ? company.employee_count.toLocaleString() : "Not disclosed"
            }
          />
          <FactRow label="Sector" value={SECTOR_LABELS[company.sector] ?? company.sector} />
          {company.sub_sector && <FactRow label="Sub-sector" value={company.sub_sector} />}
          <FactRow
            label="Stage"
            value={STAGE_LABELS[company.funding_stage] ?? company.funding_stage}
          />
          {company.total_capital_raised && (
            <FactRow label="Total capital raised" value={company.total_capital_raised} />
          )}
          {company.company_structure && (
            <FactRow label="Company structure" value={company.company_structure} />
          )}
          {company.website && (
            <FactRow
              label="Website"
              value={
                <a
                  href={company.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  {company.website.replace(/^https?:\/\//, "")}
                </a>
              }
            />
          )}
        </div>
      </div>

      {/* Notable investors */}
      {company.notable_investors?.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Notable investors
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {company.notable_investors.map((inv) => (
              <Badge key={inv} variant="outline">
                {inv}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: React.ReactNode | undefined | null }) {
  return (
    <div className="flex justify-between py-2.5 first:pt-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value ?? "Not disclosed"}</span>
    </div>
  );
}
