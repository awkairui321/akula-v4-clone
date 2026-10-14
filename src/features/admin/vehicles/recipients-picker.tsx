import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SearchIcon } from "lucide-react";
import type { Fund } from "@/lib/types";
import type { AudienceClient } from "./audience";
import { ALL_CLASSES, recipientsOf, sourceOf, withAudience, type AudienceDraft } from "./audience";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

type Filter = "all" | "independent" | "partner_referred";

const kindOf = (client: AudienceClient) =>
  client.investor_type === "institutional" ? "Entity" : "Individual";

/**
 * Who receives the deal: every onboarded client, or the clients ticked from one list. A chosen
 * list is stored as the clients themselves, so what you see ticked is exactly who gets the deal.
 */
export function RecipientsPicker({
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
  /** Subscriptions still under way in this fund; one held by someone no longer included carries on. */
  inProgress?: { id: number; investor_id: number; investor_name: string }[];
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const result = useMemo(
    () => recipientsOf(withAudience(fund, value), clients),
    [fund, value, clients],
  );
  const receiving = useMemo(() => new Set(result.people.map((c) => c.id)), [result.people]);
  const everyone =
    value.classes.length === ALL_CLASSES.length &&
    value.partners.length === 0 &&
    value.investors.length === 0 &&
    value.excluded.length === 0;

  const choose = (ids: number[]) =>
    onChange({ classes: [], partners: [], investors: ids, excluded: [] });
  const toggle = (id: number) =>
    choose(receiving.has(id) ? [...receiving].filter((x) => x !== id) : [...receiving, id]);

  const q = search.trim().toLowerCase();
  const shown = clients.filter(
    (c) =>
      (filter === "all" || c.segment === filter) &&
      (!q ||
        `${c.full_name} ${c.reference ?? c.client_code} ${sourceOf(c)}`.toLowerCase().includes(q)),
  );
  const count = (segment: Filter) =>
    segment === "all" ? clients.length : clients.filter((c) => c.segment === segment).length;
  const carrying = inProgress.filter((s) => !receiving.has(s.investor_id));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Recipients"
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
                      ? { classes: ALL_CLASSES, partners: [], investors: [], excluded: [] }
                      : { classes: [], partners: [], investors: [...receiving], excluded: [] },
                  )
                }
                className={`rounded-md px-3 py-1.5 ${on ? "bg-secondary font-medium" : "text-muted-foreground"}`}
              >
                {mode.label}
              </button>
            );
          })}
        </div>
        <p className="text-sm text-muted-foreground tabular-nums">
          {result.people.length === 0
            ? "Nobody can see this deal yet"
            : `${result.people.length} of ${clients.length} clients receive this deal`}
        </p>
      </div>

      {legacy && (
        <p className="border-l-2 border-amber-500 pl-3 text-sm text-muted-foreground">
          This deal follows the original audience rule until you change it.
        </p>
      )}

      {everyone ? (
        <p className="text-sm text-muted-foreground">
          Every onboarded client receives this deal, including clients who are onboarded later.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="relative min-w-56 flex-1 sm:max-w-sm">
              <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search clients"
                placeholder="Search by name, reference or partner"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-4 text-sm">
              {(
                [
                  ["all", "All"],
                  ["independent", "Direct"],
                  ["partner_referred", "Partner-referred"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={
                    filter === key
                      ? "font-medium underline underline-offset-4"
                      : "text-muted-foreground hover:text-foreground"
                  }
                >
                  {label} <span className="tabular-nums">{count(key)}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-4 text-sm sm:ml-auto">
              <button
                type="button"
                onClick={() => choose([...new Set([...receiving, ...shown.map((c) => c.id)])])}
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Select shown
              </button>
              <button
                type="button"
                onClick={() =>
                  choose([...receiving].filter((id) => !shown.some((c) => c.id === id)))
                }
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Clear shown
              </button>
            </div>
          </div>

          <ul className="max-h-80 divide-y overflow-y-auto border-y">
            {shown.map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-center gap-3 py-2.5 text-sm">
                  <Checkbox checked={receiving.has(c.id)} onChange={() => toggle(c.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.full_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.reference ?? c.client_code} · {kindOf(c)} · {sourceOf(c)}
                    </span>
                  </span>
                </label>
              </li>
            ))}
            {shown.length === 0 && (
              <li className="py-4 text-sm text-muted-foreground">No onboarded client matches.</li>
            )}
          </ul>
        </div>
      )}

      {carrying.length > 0 && (
        <div className="space-y-1 border-l-2 border-amber-500 pl-3 text-sm">
          <p className="font-medium">Subscriptions in progress will carry on</p>
          <ul className="space-y-0.5 text-muted-foreground">
            {carrying.map((s) => (
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
    </div>
  );
}
