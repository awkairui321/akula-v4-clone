import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SearchIcon, XIcon } from "lucide-react";
import type { Fund } from "@/lib/types";
import type { InvestorSegment } from "@/lib/investor-access";
import type { AudienceClient } from "./audience";
import { ALL_CLASSES, recipientsOf, sourceOf, withAudience, type AudienceDraft } from "./audience";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

const CLASS_LABELS: Record<InvestorSegment, string> = {
  independent: "Direct clients",
  partner_referred: "Partner-referred clients",
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const kindOf = (client: AudienceClient) =>
  client.investor_type === "institutional" ? "Entity" : "Individual";

/** Pick clients by name: chips for those chosen, a search, and a list to tick from. */
function ClientChooser({
  label,
  hint,
  clients,
  selected,
  onToggle,
}: {
  label: string;
  hint?: string;
  clients: AudienceClient[];
  selected: number[];
  onToggle: (id: number) => void;
}) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const matches = clients
    .filter(
      (c) =>
        !q ||
        `${c.full_name} ${c.reference ?? c.client_code} ${sourceOf(c)}`.toLowerCase().includes(q),
    )
    .slice(0, 50);
  const chosen = clients.filter((c) => selected.includes(c.id));
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{label}</legend>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {chosen.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {chosen.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onToggle(c.id)}
                className="inline-flex items-center gap-1.5 rounded-full border bg-secondary px-3 py-1 text-sm"
                aria-label={`Remove ${c.full_name} from ${label.toLowerCase()}`}
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
          aria-label={`Search clients for ${label.toLowerCase()}`}
          placeholder="Search a client by name, reference or partner"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      <ul className="max-h-56 divide-y overflow-y-auto border-y">
        {matches.map((c) => (
          <li key={c.id}>
            <label className="flex cursor-pointer items-center gap-3 py-2.5 text-sm">
              <Checkbox checked={selected.includes(c.id)} onChange={() => onToggle(c.id)} />
              <span className="min-w-0">
                <span className="block truncate font-medium">{c.full_name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {c.reference ?? c.client_code} · {kindOf(c)} · {sourceOf(c)}
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
  );
}

/**
 * Choose who this deal is sent to: every onboarded client, or a selection built from client
 * classes, partner firms and named clients, less anyone excluded, with a live list of who that
 * reaches.
 */
export function AudiencePicker({
  fund,
  clients,
  value,
  onChange,
  legacy,
  inProgress = [],
}: {
  fund: Fund;
  clients: AudienceClient[];
  value: AudienceDraft;
  onChange: (next: AudienceDraft) => void;
  /** The deal still follows the original audience rule and has not been set explicitly. */
  legacy: boolean;
  /** Subscriptions still under way in this fund; one held by an excluded client carries on. */
  inProgress?: { id: number; investor_id: number; investor_name: string }[];
}) {
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
  // A client is either named or excluded, never both.
  const toggleNamed = (id: number) =>
    onChange({
      ...value,
      investors: toggle(value.investors, id),
      excluded: value.excluded.filter((x) => x !== id),
    });
  const toggleExcluded = (id: number) =>
    onChange({
      ...value,
      excluded: toggle(value.excluded, id),
      investors: value.investors.filter((x) => x !== id),
    });
  const partnerClassOn = value.classes.includes("partner_referred");
  const summary = [
    plural(result.individuals, "individual"),
    result.entities === 1 ? "1 entity" : `${result.entities} entities`,
    ...result.bySource
      .slice(0, 3)
      .map(([name, n]) =>
        name === "Direct"
          ? `${n} direct`
          : name === "RM referral"
            ? `${n} RM-referred`
            : `${n} via ${name}`,
      ),
  ].join(" · ");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-2xl font-semibold tabular-nums">
            {plural(result.people.length, "client")}
            {value.excluded.length > 0 && (
              <span className="ml-3 text-base font-normal text-muted-foreground">
                {value.excluded.length} excluded
              </span>
            )}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.people.length === 0 ? "Nobody can see this deal yet." : summary}
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
                      ? {
                          classes: ALL_CLASSES,
                          partners: [],
                          investors: [],
                          excluded: value.excluded,
                        }
                      : { ...value, classes: everyone ? [] : value.classes },
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

          <ClientChooser
            label="Named clients"
            clients={clients}
            selected={value.investors}
            onToggle={toggleNamed}
          />
        </div>
      )}

      <ClientChooser
        label="Excluded clients"
        hint="These clients never see this deal, even if a class, partner firm or name above would include them. Their existing investments are unaffected."
        clients={clients}
        selected={value.excluded}
        onToggle={toggleExcluded}
      />
      {inProgress.filter((s) => value.excluded.includes(s.investor_id)).length > 0 && (
        <div className="space-y-1 border-l-2 border-amber-500 pl-3 text-sm">
          <p className="font-medium">Subscriptions in progress will carry on</p>
          <ul className="space-y-0.5 text-muted-foreground">
            {inProgress
              .filter((s) => value.excluded.includes(s.investor_id))
              .map((s) => (
                <li key={s.id}>
                  {s.investor_name} has subscription #{s.id} in progress. They can finish it but
                  cannot start another.{" "}
                  <Link
                    to={`/luca/subscriptions?deal=${fund.id}&q=${encodeURIComponent(s.investor_name)}`}
                    className="text-foreground underline underline-offset-2"
                  >
                    Open it to cancel
                  </Link>
                </li>
              ))}
          </ul>
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
                <span className="min-w-0">
                  <span className="block truncate font-medium">{c.full_name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {kindOf(c)} · {sourceOf(c)}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleExcluded(c.id)}
                >
                  Exclude
                </Button>
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
