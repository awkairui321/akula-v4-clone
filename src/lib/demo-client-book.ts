import type { AdminInvestor } from "@/features/admin/types";
const DEMO_CLIENTS = new Set([2, 11, 14, 16, 19, 30]);
/** Keep the small showcase book; preserve historical records and newly prepared accounts. */
export function demoClientBook(clients: AdminInvestor[]) {
  return clients.filter(
    (client) =>
      import.meta.env.VITE_API_URL ||
      (client.verification_status === "approved" && DEMO_CLIENTS.has(client.id)) ||
      client.id > 34 ||
      client.prepared_by_rm,
  );
}
