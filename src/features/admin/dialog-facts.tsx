import type { ReactNode } from "react";

/** The facts a decision rests on, one per row: the heading on the left and its value on the right. */
export function DialogFacts({
  rows,
}: {
  rows: { label: string; value: ReactNode; mono?: boolean }[];
}) {
  return (
    <dl className="divide-y border-y text-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-6 py-2.5">
          <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
          <dd
            className={`text-right font-medium ${row.mono ? "font-mono text-xs" : "tabular-nums"}`}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
