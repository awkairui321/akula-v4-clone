import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiAsDemo } from "@/lib/api";
import { SEGMENT_LABELS, type InvestorSegment } from "@/lib/investor-access";
import { isMocking } from "@/mocks/browser";

export default function InvestorSegmentControl({ personaId }: { personaId?: number }) {
  const queryClient = useQueryClient();
  const send = <T,>(options?: { method?: string; body?: Record<string, unknown> }) =>
    personaId === undefined
      ? api<T>("/api/v1/demo/investor-segment", options)
      : apiAsDemo<T>(personaId, "/api/v1/demo/investor-segment", options);
  const query = useQuery({
    queryKey: ["investor-segment", personaId],
    queryFn: () => send<{ segment: InvestorSegment }>(),
    enabled: isMocking,
    refetchInterval: 1500,
  });
  const mutation = useMutation({
    mutationFn: (segment: InvestorSegment) => send({ method: "PATCH", body: { segment } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
    },
  });
  if (!isMocking || !query.data) return null;
  return (
    <section className="mb-5 rounded-lg border bg-muted/40 p-4" aria-label="Demo investor profile">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Demo investor profile
          </p>
          <p className="mt-1 font-medium">{SEGMENT_LABELS[query.data.segment]}</p>
        </div>
        <label className="text-sm">
          <span className="sr-only">Change demo investor profile</span>
          <select
            className="max-w-full rounded-md border bg-background px-3 py-2"
            value={query.data.segment}
            disabled={mutation.isPending}
            onChange={(event) => mutation.mutate(event.target.value as InvestorSegment)}
          >
            <option value="independent">Independent investor</option>
            <option value="partner_referred">Partner-referred investor</option>
          </select>
        </label>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Your client class determines which fund variants are available. Each fund shows its
        applicable fees; LUCA reviews and allocates each subscription separately.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Simulation only. Existing subscriptions keep their agreed fees and profile. KYC and LUCA
        approval still apply; allocation is never guaranteed.
      </p>
      {mutation.error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {mutation.error.message}
        </p>
      )}
    </section>
  );
}
