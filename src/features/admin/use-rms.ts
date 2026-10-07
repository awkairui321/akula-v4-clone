import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type RmOption = { id: number; label: string };

/** LUCA's relationship managers, for assigning clients. Fund Manager only. */
export function useRms() {
  const { data } = useQuery({
    queryKey: ["admin", "rms"],
    queryFn: () => api<{ rms: RmOption[] }>("/api/v1/admin/rms"),
    staleTime: 60_000,
  });
  const rms = data?.rms ?? [];
  return {
    rms,
    label: (id: number | null | undefined) => rms.find((r) => r.id === id)?.label ?? null,
  };
}
