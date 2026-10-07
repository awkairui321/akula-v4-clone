export const DAY = 24 * 60 * 60 * 1000;
export const EXPIRY_WINDOW_DAYS = 90;

export const daysBetween = (from: number, to: number) => Math.round((to - from) / DAY);
export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** "Due in 4d" / "Overdue 6d" / "No due date". */
export function dueLabel(dueAt: string | null): { text: string; overdue: boolean } {
  if (!dueAt) return { text: "No due date", overdue: false };
  const days = daysBetween(Date.now(), new Date(dueAt).getTime());
  if (days < 0) return { text: `Overdue ${-days}d`, overdue: true };
  return { text: days === 0 ? "Due today" : `Due in ${days}d`, overdue: false };
}

export const requestLink = (investorId: number, docs: string) =>
  `/luca/communications/new?audience=investor:${investorId}&purpose=request&docs=${docs}`;
