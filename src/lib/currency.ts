export function numericValue(price: string | number | null | undefined): number {
  if (price == null || price === "") return 0;
  const raw = typeof price === "number" ? price : Number(String(price).replace(/[$,\s]/g, ""));
  return Number.isFinite(raw) ? raw : 0;
}

function parseAmount(price: string | number): number | null {
  const raw = numericValue(price);
  if (raw === 0 && String(price).replace(/[$,\s]/g, "") !== "0") return null;
  return Number.isFinite(raw) ? raw : null;
}

export function formatPrice(price: string | number): string {
  const amount = parseAmount(price);
  if (amount === null) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(0)}`;
  }
}

export function formatPriceCompact(price: string | number): string {
  const amount = parseAmount(price);
  if (amount === null) return "—";
  if (amount >= 1_000_000_000) {
    const b = amount / 1_000_000_000;
    return `$${b % 1 === 0 ? b.toFixed(0) : b.toFixed(1)}B`;
  }
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  return formatPrice(amount);
}

export function formatPricePrecise(price: string | number): string {
  const amount = parseAmount(price);
  if (amount === null) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

const twoDecimals = (amount: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    amount,
  );

/** $25,000.00: the form amounts take on subscription pages. The currency is named once, in the label. */
export function formatUsdPrecise(price: string | number | null | undefined): string {
  const amount = parseAmount(price ?? "");
  return amount === null ? "—" : `$${twoDecimals(amount)}`;
}

/** USD 25,000.00: the form used in LUCA SGP's capital call notice. */
export function formatUsdCode(price: string | number | null | undefined): string {
  const amount = parseAmount(price ?? "");
  return amount === null ? "—" : `USD ${twoDecimals(amount)}`;
}

/** "25000.5" -> "25,000.50" for an amount field at rest; anything unreadable is left as typed. */
export function formatAmountInput(text: string): string {
  const amount = parseAmount(text);
  if (amount === null || text.trim() === "") return text;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
