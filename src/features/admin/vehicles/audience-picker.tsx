import { useMemo, useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import type { Fund } from "@/lib/types";
import type { InvestorSegment } from "@/lib/investor-access";
import type { AdminInvestor } from "../types";
import { ALL_CLASSES, recipientsOf, sourceOf, withAudience, type AudienceDraft } from "./audience";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

const CLASS_LABELS: Record<InvestorSegment, string> = {
  independent: "Direct clients",
  partner_referred: "Partner-referred clients",
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Choose who this deal is sent to: every onboarded client, or a selection built from client
 * classes, partner firms and named clients, with a live list of who that reaches.
 */
export function AudiencePicker({
  fund,
  clients,
  value,
  onChange,
  legacy,
}: {
  fund: Fund;
  clients: AdminInvestor[];
  value: AudienceDraft;
  onChange: (next: AudienceDraft) => void;
  /** The deal still follows the original audience rule and has not been set explicitly. */
  legacy: boolean;
}) {
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const everyone = value.classes.length === 2;
  const result = useMemo(
    () => recipientsOf(withAudience(fund, value), clients),
    [fund, value, clients],
  );

  const partners = useMemo(() => {
    const counts = new Map<string, number>();
    for (const client of clients)
      if (client.partner) counts.set(client.partner, (counts.get(client.partner) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [clients]);
  const classCount = (segment: InvestorSegment) =>
    clients.filter((c) => c.segment === segment).length;

  const toggle = <T,>(list: T[], item: T) =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
  const q = search.trim().toLowerCase();
  const matches = clients
    .filter(
      (c) =>
        !q ||
        `${c.full_name} ${c.reference ?? ""} ${c.email} ${sourceOf(c)}`.toLowerCase().includes(q),
    )
    .slice(0, 50);
  const named = clients.filter((c) => value.investors.includes(c.id));
  const partnerClassOn = value.classes.includes("partner_referred");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-2xl font-semibold tabular-nums">
            {plural(result.people.length, "client")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.people.length === 0
              ? "Nobody can see this deal yet."
              : `${plural(result.individuals, "individual")} · ${result.entities === 1 ? "1 entity" : `${result.entities} entities`} · ${result.bySource
                  .slice(0, 3)
                  .map(([name, n]) =>
                    name === "Direct"
                      ? `${n} direct`
                      : name === "RM referral"
                        ? `${n} RM-referred`
                        : `${n} via ${name}`,
                  )
                  .join(" · ")}${result.bySource.length > 3 ? " · …" : ""}`}
          </p>
        </div>
        <div
          role="group"
          aria-label="Audience mode"
          className="flex items-center rounded-lg border bg-background p-0.5 text-sm"
        >
          {[
            { key: "all", label: "All onboarded clients" },
            { key: "selected", label: "Selected clients" },
          ].map((mode) => {
            const on = (mode.key === "all") === everyone;
            return (
              <button
                key={mode.key}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  onChange(
                    mode.key === "all"
                      ? { classes: ALL_CLASSES, partners: [], investors: [] }
                      : {
                          classes: everyone ? [] : value.classes,
                          partners: value.partners,
                          investors: value.investors,
                        },
                  )
                }
                className={`rounded-md px-3 py-1.5 ${on ? "bg-secondary font-medium" : "text-muted-foreground"}`}
              >
                {mode.label}
              </button>
            );
          })}
        </div>
      </div>

      {legacy && (
        <p className="border-l-2 border-amber-500 pl-3 text-sm text-muted-foreground">
          This deal still follows the original audience rule. Changing it applies one fee schedule
          to every client class, with no extra point for direct clients.
        </p>
      )}

      {!everyone && (
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-6">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Client classes</legend>
              {(Object.keys(CLASS_LABELS) as InvestorSegment[]).map((segment) => (
                <label key={segment} className="flex cursor-pointer items-center gap-3 text-sm">
                  <Checkbox
                    checked={value.classes.includes(segment)}
                    onChange={() => onChange({ ...value, classes: toggle(value.classes, segment) })}
                  />
                  <span>{CLASS_LABELS[segment]}</span>
                  <span className="ml-auto text-muted-foreground tabular-nums">
                    {classCount(segment)}
                  </span>
                </label>
              ))}
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Partner firms</legend>
              {partners.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No partner has onboarded clients yet.
                </p>
              )}
              {partners.map(([firm, count]) => (
                <label
                  key={firm}
                  className={`flex items-center gap-3 text-sm ${partnerClassOn ? "opacity-50" : "cursor-pointer"}`}
                >
                  <Checkbox
                    disabled={partnerClassOn}
                    checked={partnerClassOn || value.partners.includes(firm)}
                    onChange={() => onChange({ ...value, partners: toggle(value.partners, firm) })}
                  />
                  <span>{firm}</span>
                  <span className="ml-auto text-muted-foreground tabular-nums">{count}</span>
                </label>
              ))}
              {partnerClassOn && (
                <p className="text-xs text-muted-foreground">
                  Every partner’s clients are already included by the partner-referred class.
                </p>
              )}
            </fieldset>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Named clients</legend>
            {named.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {named.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() =>
                        onChange({
                          ...value,
                          investors: value.investors.filter((id) => id !== c.id),
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-full border bg-secondary px-3 py-1 text-sm"
                      aria-label={`Remove ${c.full_name}`}
                    >
                      {c.full_name}
                      <XIcon className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="relative">
              <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search clients to add"
                placeholder="Search a client by name, reference or partner"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <ul className="max-h-64 divide-y overflow-y-auto border-y">
              {matches.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-3 py-2.5 text-sm">
                    <Checkbox
                      checked={value.investors.includes(c.id)}
                      onChange={() =>
                        onChange({ ...value, investors: toggle(value.investors, c.id) })
                      }
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.full_name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {c.reference ?? c.client_code} ·{" "}
                        {c.investor_type === "institutional" ? "Entity" : "Individual"} ·{" "}
                        {sourceOf(c)}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
              {matches.length === 0 && (
                <li className="py-4 text-sm text-muted-foreground">No onboarded client matches.</li>
              )}
            </ul>
          </fieldset>
        </div>
      )}

      <div className="space-y-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowAll((open) => !open)}>
          {showAll
            ? "Hide the clients this reaches"
            : `Show the ${result.people.length} clients this reaches`}
        </Button>
        {showAll && (
          <ul className="max-h-56 divide-y overflow-y-auto border-y text-sm">
            {result.people.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 py-2">
                <span className="truncate font-medium">{c.full_name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {c.investor_type === "institutional" ? "Entity" : "Individual"} · {sourceOf(c)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Only onboarded clients can see a deal. The audience goes live when you approve and
          publish, and clients newly included are told. Existing investments keep their records.
        </p>
      </div>
    </div>
  );
}
