const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const WRITTEN = /^(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})$/;

/**
 * A stored date as people write it: "2026-09-19" or a full timestamp becomes "19 Sep 2026".
 * Anything else, such as "Nov 2021" or "H2 2024", is free text and is left as it is.
 */
export function friendlyDate(value: string): string {
  const match = ISO.exec(value.trim());
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${Number(match[3])} ${month} ${match[1]}` : value;
}

/** The reverse: "19 Sep 2026" is stored as "2026-09-19". Free text and real dates are untouched. */
export function storedDate(value: string): string {
  const match = WRITTEN.exec(value.trim());
  if (!match) return value;
  const month = MONTHS.indexOf(match[2]);
  const day = Number(match[1]);
  const year = Number(match[3]);
  const real = new Date(Date.UTC(year, month, day));
  if (month < 0 || real.getUTCMonth() !== month || real.getUTCDate() !== day) return value;
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
