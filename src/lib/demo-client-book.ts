import type { AdminInvestor } from "@/features/admin/types";
import { inDemoClientCohort } from "./demo-cohort";
/** Keep the small showcase book; preserve historical records and newly prepared accounts. */
export function demoClientBook(clients: AdminInvestor[]) {
  return clients.filter(
    (client) =>
      import.meta.env.VITE_API_URL ||
      inDemoClientCohort(
        client.id,
        client.verification_status === "approved",
        Boolean(client.prepared_by_rm),
      ) ||
      client.id > 34 ||
      client.prepared_by_rm,
  );
}
