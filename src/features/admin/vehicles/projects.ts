import type { Fund } from "@/lib/types";
import { daysUntil } from "./deal-status";

/** A project is one company, which can have several funds raising into it. */
export type Project = {
  /** The company's id; every fund in the project shares it. */
  key: number;
  codename: string;
  company: string;
  sector: string;
  funds: Fund[];
  committed: number;
  target: number | null;
  nextClose: string | null;
};

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

/** The part of a fund's name that tells it apart from its siblings, for example "SPV II". */
export function fundLabel(fund: Fund): string {
  const rest = fund.name.replace(fund.asset.name, "").trim();
  return rest || fund.name;
}

export function nextFundLabel(project: Project): string {
  return `SPV ${ROMAN[project.funds.length] ?? project.funds.length + 1}`;
}

export function groupProjects(funds: Fund[]): Project[] {
  const groups = new Map<number, Fund[]>();
  for (const fund of funds) groups.set(fund.asset.id, [...(groups.get(fund.asset.id) ?? []), fund]);
  return [...groups.entries()].map(([key, members]) => {
    const sorted = [...members].sort((a, b) => a.id - b.id);
    const targets = sorted.map((f) => (f.supply_total ? parseFloat(f.supply_total) : null));
    const closes = sorted
      .filter((f) => ["open", "closing"].includes(f.state) && (daysUntil(f.closes_at) ?? 0) > 0)
      .map((f) => f.closes_at!)
      .sort();
    return {
      key,
      codename: sorted[0].codename,
      company: sorted[0].asset.name,
      sector: sorted[0].asset.sector,
      funds: sorted,
      committed: sorted.reduce((n, f) => n + parseFloat(f.supply_allocated), 0),
      target: targets.every((t) => t !== null) ? targets.reduce((n, t) => n + (t ?? 0), 0) : null,
      nextClose: closes[0] ?? null,
    };
  });
}
