/** A headline figure for a LUCA page header strip: label over value, no container. */
export function SummaryFigure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
    </div>
  );
}
