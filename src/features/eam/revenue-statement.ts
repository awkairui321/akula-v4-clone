import type { EamRevenueData } from "./types";

function cell(value: string | number | null) {
  const text = String(value ?? "");
  const safe = typeof value === "string" && /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function revenueStatement(data: EamRevenueData) {
  const rows: (string | number | null)[][] = [
    ["AKULA — fictional demo revenue statement"],
    ["Amounts in USD. Settlement statuses are simulated, not payment records."],
    [
      "Project",
      "Client",
      "Reference",
      "Allocated capital",
      "Client fee base",
      "Share %",
      "Revenue share",
      "Allocation date",
      "Demo status",
    ],
    ...data.transactions.map((t) => [
      t.project_name,
      t.client_name,
      t.reference,
      t.allocated_volume,
      t.fee_base_amount,
      t.share_pct,
      t.share_amount,
      t.settlement_date,
      t.status,
    ]),
    [
      "Totals",
      "",
      "",
      data.transactions.reduce((sum, t) => sum + t.allocated_volume, 0),
      data.transactions.reduce((sum, t) => sum + t.fee_base_amount, 0),
      "",
      data.transactions.reduce((sum, t) => sum + t.share_amount, 0),
    ],
    ["Simulated accrued", data.accrued],
    ["Simulated paid", data.paid],
    ["Pending share", data.pending],
  ];
  return "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
