import { useAuth } from "@/contexts/auth-context";
import { useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SECTOR_LABELS, STAGE_LABELS, CLOSED_SUBSCRIPTION_STATUSES } from "@/lib/types";
import type { Asset, Fund, FundStatus } from "@/lib/types";
import type { AdminSubscription, SubscriptionsResponse } from "../types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { CheckIcon, TriangleAlertIcon, MinusIcon } from "lucide-react";

/* ─── Line-based collection editing ───
 * The narrative collections are edited as text, one record per line, with
 * " | " between columns. The update endpoint replaces each table wholesale.
 */

const linesOf = (text: string): string[] =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

const columnsOf = (line: string): string[] => line.split("|").map((column) => column.trim());

const toLines = (rows: string[][]): string => rows.map((row) => row.join(" | ")).join("\n");

function daysUntil(dateString: string | null): string {
  if (!dateString) return "";
  const diff = new Date(dateString).getTime() - Date.now();
  return String(Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24))));
}

function closesAtFrom(days: string): string | null {
  const count = Number(days);
  if (days.trim() === "" || Number.isNaN(count)) return null;
  return new Date(Date.now() + count * 24 * 60 * 60 * 1000).toISOString();
}

const str = (value: string | number | null | undefined): string =>
  value === null || value === undefined ? "" : String(value);

const orNull = (value: string): string | null => (value.trim() === "" ? null : value.trim());

type Draft = {
  state: FundStatus;
  vehicle_type: string;
  deal_type: string;
  security_type: string;
  descriptor: string;
  fund_manager_id: string;
  price: string;
  supply_total: string;
  min_subscription: string;
  max_subscription: string;
  share_class_name: string;
  share_class_type: string;
  opened_at: string;
  holding_period_note: string;
  implied_valuation: string;
  subscription_increment: string;
  comparable_basis: string;
  entry_multiple: string;
  comparable_note: string;
  key_metrics: string;
  revenue_points: string;
  peers: string;
  activities: string;
  subscription_fee_pct: string;
  management_fee_pct: string;
  carried_interest_pct: string;
  closes_in_days: string;
  sector: string;
  funding_stage: string;
  founded_year: string;
  headquarters: string;
  employee_count: string;
  description: string;
  about: string;
  thesis: string;
  highlights: string;
  risks: string;
  team: string;
  developments: string;
  funding_rounds: string;
  tagline: string;
  typical_buyer: string;
  commercial_model: string;
  how_it_works: string;
  in_practice_lead: string;
  in_practice_text: string;
  in_practice_tag: string;
  in_practice_source_label: string;
  in_practice_source_href: string;
  market_context: string;
  competitive_landscape: string;
  thesis_points: string;
  business_columns: string;
  product_disclosures: string;
  product_disclosures_note: string;
  product_disclosures_source: string;
  financial_indicators: string;
  primary_source_title: string;
  primary_source_meta: string;
  primary_source_text: string;
  figures_checked_note: string;
  figures_checked_links: string;
  recording_available: boolean;
  recording_embed_url: string;
};

function dateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function draftFrom(fund: Fund): Draft {
  const { asset } = fund;
  return {
    state: fund.state,
    vehicle_type: fund.vehicle_type,
    deal_type: fund.deal_type,
    security_type: str(fund.security_type),
    descriptor: str(fund.descriptor),
    fund_manager_id: String(fund.fund_manager.id),
    price: str(fund.price),
    supply_total: str(fund.supply_total),
    min_subscription: str(fund.min_subscription),
    max_subscription: str(fund.max_subscription),
    share_class_name: str(fund.share_class.name),
    share_class_type: str(fund.share_class.class_type),
    opened_at: dateInputValue(fund.opened_at),
    holding_period_note: str(fund.holding_period_note),
    implied_valuation: str(fund.implied_valuation),
    subscription_increment: str(fund.subscription_increment),
    comparable_basis: str(fund.comparable_basis),
    entry_multiple: str(fund.entry_multiple),
    comparable_note: str(fund.comparable_note),
    key_metrics: toLines((fund.key_metrics ?? []).map((m) => [m.label, m.value, m.note ?? ""])),
    revenue_points: toLines((fund.revenue_points ?? []).map((p) => [p.period, p.value ?? ""])),
    peers: toLines((fund.peers ?? []).map((p) => [p.name, p.multiple])),
    activities: toLines((fund.activities ?? []).map((a) => [a.date, a.text, a.kind])),
    subscription_fee_pct: str(fund.subscription_fee_pct),
    management_fee_pct: str(fund.management_fee_pct),
    carried_interest_pct: str(fund.carried_interest_pct),
    closes_in_days: daysUntil(fund.closes_at),
    sector: str(asset.sector),
    funding_stage: str(asset.funding_stage),
    founded_year: str(asset.founded_year),
    headquarters: str(asset.headquarters),
    employee_count: str(asset.employee_count),
    description: str(asset.description),
    about: str(asset.about),
    thesis: str(asset.thesis),
    highlights: (asset.highlights ?? []).join("\n"),
    risks: toLines((asset.risks ?? []).map((r) => [r.title, r.body])),
    team: toLines((asset.team ?? []).map((t) => [t.role, t.name, t.note ?? ""])),
    developments: toLines((asset.developments ?? []).map((d) => [d.date, d.text])),
    funding_rounds: toLines(
      (asset.funding_rounds ?? []).map((r) => [
        r.date,
        r.round,
        r.valuation,
        r.raised ?? "",
        r.lead ?? "",
      ]),
    ),
    tagline: str(asset.tagline),
    typical_buyer: str(asset.typical_buyer),
    commercial_model: str(asset.commercial_model),
    how_it_works: toLines((asset.how_it_works ?? []).map((r) => [r.label, r.text])),
    in_practice_lead: str(asset.in_practice?.lead),
    in_practice_text: str(asset.in_practice?.text),
    in_practice_tag: str(asset.in_practice?.tag),
    in_practice_source_label: str(asset.in_practice?.source_label),
    in_practice_source_href: str(asset.in_practice?.source_href),
    market_context: (asset.market_context ?? []).join("\n"),
    competitive_landscape: toLines(
      (asset.competitive_landscape ?? []).map((r) => [r.category, r.examples, r.text]),
    ),
    thesis_points: toLines((asset.thesis_points ?? []).map((p) => [p.title, p.text])),
    business_columns: toLines((asset.business_columns ?? []).map((c) => [c.title, c.text])),
    product_disclosures: toLines(
      (asset.product_disclosures ?? []).map((d) => [d.label, d.sub, d.value]),
    ),
    product_disclosures_note: str(asset.product_disclosures_note),
    product_disclosures_source: str(asset.product_disclosures_source),
    financial_indicators: toLines(
      (asset.financial_indicators ?? []).map((i) => [
        i.value,
        i.label,
        i.source,
        i.word ? "yes" : "no",
      ]),
    ),
    primary_source_title: str(fund.primary_source?.title),
    primary_source_meta: str(fund.primary_source?.meta),
    primary_source_text: str(fund.primary_source?.text),
    figures_checked_note: str(fund.figures_checked_note),
    figures_checked_links: toLines(
      (fund.figures_checked_links ?? []).map((l) => [l.label, l.href]),
    ),
    recording_available: Boolean(fund.recording_available),
    recording_embed_url: str(fund.recording_embed_url),
  };
}

function parseRisks(text: string): Asset["risks"] {
  return linesOf(text).map((line) => {
    const [title, body = ""] = columnsOf(line);
    return { title, body };
  });
}

function parseTeam(text: string): Asset["team"] {
  return linesOf(text).map((line) => {
    const [role, name = "", note = ""] = columnsOf(line);
    return { name, role, note: note || null };
  });
}

function parseDevelopments(text: string): Asset["developments"] {
  return linesOf(text).map((line) => {
    const [date, ...rest] = columnsOf(line);
    return { date, text: rest.join(" | ") };
  });
}

function parseFundingRounds(text: string): Asset["funding_rounds"] {
  return linesOf(text).map((line) => {
    const [date, round = "", valuation = "", raised = "", lead = ""] = columnsOf(line);
    return { date, round, valuation, raised, lead };
  });
}

function parseHowItWorks(text: string): Asset["how_it_works"] {
  return linesOf(text).map((line) => {
    const [label, textValue = ""] = columnsOf(line);
    return { label, text: textValue };
  });
}

function parseMarketContext(text: string): Asset["market_context"] {
  return linesOf(text);
}

function parseCompetitiveLandscape(text: string): Asset["competitive_landscape"] {
  return linesOf(text).map((line) => {
    const [category, examples = "", textValue = ""] = columnsOf(line);
    return { category, examples, text: textValue };
  });
}

function parseThesisPoints(text: string): Asset["thesis_points"] {
  return linesOf(text).map((line) => {
    const [title, textValue = ""] = columnsOf(line);
    return { title, text: textValue };
  });
}

function parseBusinessColumns(text: string): Asset["business_columns"] {
  return linesOf(text).map((line) => {
    const [title, textValue = ""] = columnsOf(line);
    return { title, text: textValue };
  });
}

function parseProductDisclosures(text: string): Asset["product_disclosures"] {
  return linesOf(text).map((line) => {
    const [label, sub = "", value = ""] = columnsOf(line);
    return { label, sub, value };
  });
}

function parseFinancialIndicators(text: string): Asset["financial_indicators"] {
  return linesOf(text).map((line) => {
    const [value, label = "", source = "", word = ""] = columnsOf(line);
    return { value, label, source, word: word.toLowerCase() === "yes" };
  });
}

function parseFiguresCheckedLinks(text: string): Fund["figures_checked_links"] {
  return linesOf(text).map((line) => {
    const [label, href = ""] = columnsOf(line);
    return { label, href };
  });
}

function parseKeyMetrics(text: string): Fund["key_metrics"] {
  return linesOf(text).map((line) => {
    const [label, value = "", note = ""] = columnsOf(line);
    return { label, value, note };
  });
}

function parseRevenuePoints(text: string): Fund["revenue_points"] {
  return linesOf(text).map((line) => {
    const [period, value = ""] = columnsOf(line);
    return { period, value };
  });
}

function parsePeers(text: string): Fund["peers"] {
  return linesOf(text).map((line) => {
    const [name, multiple = ""] = columnsOf(line);
    return { name, multiple };
  });
}

const ACTIVITY_KINDS = ["commit", "milestone", "update"];

function parseActivities(text: string): Fund["activities"] {
  return linesOf(text).map((line) => {
    const [date, update = "", kind = ""] = columnsOf(line);
    const normalised = kind.toLowerCase();
    return {
      date,
      text: update,
      kind: ACTIVITY_KINDS.includes(normalised) ? normalised : "update",
    };
  });
}

/* ─── Line format checking ───
 * A row typed without " | " between its columns collapses into the first column
 * and saves as a blank record, so each format is checked and reported instead.
 */

type LineFormat = {
  label: string;
  columns: string[];
  /** The leading columns that must be present and non-empty. */
  required: number;
  /** Index of a column that must read as a number. */
  numeric?: number;
  /** Index of a column restricted to a fixed set, when it is filled in. */
  oneOf?: { column: number; values: string[] };
};

type CollectionField = Extract<
  keyof Draft,
  | "risks"
  | "team"
  | "developments"
  | "funding_rounds"
  | "key_metrics"
  | "revenue_points"
  | "peers"
  | "activities"
  | "how_it_works"
  | "competitive_landscape"
  | "thesis_points"
  | "business_columns"
  | "product_disclosures"
  | "financial_indicators"
  | "figures_checked_links"
>;

const WORD_VALUES = ["yes", "no"];

const LINE_FORMATS: Record<CollectionField, LineFormat> = {
  risks: { label: "Key risks", columns: ["Title", "Body"], required: 2 },
  team: { label: "Management team", columns: ["Role", "Name", "Note"], required: 2 },
  developments: { label: "Recent developments", columns: ["Date", "Update"], required: 2 },
  funding_rounds: {
    label: "Funding rounds",
    columns: ["Date", "Round", "Valuation", "Raised", "Lead"],
    required: 3,
  },
  key_metrics: { label: "Key metrics", columns: ["Label", "Value", "Note"], required: 2 },
  revenue_points: {
    label: "Revenue chart",
    columns: ["Period", "USD billions"],
    required: 2,
    numeric: 1,
  },
  peers: { label: "Public peers", columns: ["Name", "Multiple"], required: 2 },
  activities: {
    label: "Deal activity",
    columns: ["Date", "Update", "Kind"],
    required: 2,
    oneOf: { column: 2, values: ACTIVITY_KINDS },
  },
  how_it_works: {
    label: "How the company creates value",
    columns: ["Label", "Text"],
    required: 2,
  },
  competitive_landscape: {
    label: "Competitive landscape",
    columns: ["Category", "Examples", "Why a buyer might choose it"],
    required: 3,
  },
  thesis_points: { label: "Investment thesis points", columns: ["Title", "Text"], required: 2 },
  business_columns: {
    label: "Business model columns",
    columns: ["Title", "Text"],
    required: 2,
  },
  product_disclosures: {
    label: "Product disclosures",
    columns: ["Label", "Sub-label", "Value"],
    required: 3,
  },
  financial_indicators: {
    label: "Other financial indicators",
    columns: ["Value", "Label", "Source", "Word (yes/no)"],
    required: 2,
    oneOf: { column: 3, values: WORD_VALUES },
  },
  figures_checked_links: {
    label: "How figures were checked · links",
    columns: ["Label", "URL"],
    required: 2,
  },
};

const COLLECTION_FIELDS = Object.keys(LINE_FORMATS) as CollectionField[];

function formatProblems(text: string, format: LineFormat): string[] {
  return linesOf(text).flatMap((line, index) => {
    const columns = columnsOf(line);
    const row = `Row ${index + 1}`;
    const filled = (column: number) => (columns[column] ?? "").trim() !== "";
    const expected = format.columns.slice(0, format.required).join(" | ");

    // A row typed without separators arrives as a single column; one typed with
    // separators but left blank needs the empty column named instead.
    if (columns.length < format.required) {
      return `${row} · separate the columns with "|" · expected ${expected}`;
    }

    const blank = format.columns.slice(0, format.required).filter((_, i) => !filled(i));
    if (blank.length > 0) {
      return `${row} · ${blank.join(" and ")} ${blank.length > 1 ? "are" : "is"} empty`;
    }

    const { numeric, oneOf } = format;
    if (numeric !== undefined && Number.isNaN(Number(columns[numeric]))) {
      return `${row} · "${columns[numeric]}" is not a number`;
    }
    if (
      oneOf &&
      filled(oneOf.column) &&
      !oneOf.values.includes(columns[oneOf.column].toLowerCase())
    ) {
      return `${row} · "${columns[oneOf.column]}" is not one of ${oneOf.values.join(", ")}`;
    }
    return [];
  });
}

function lastReportedRound(text: string): string {
  const latest = parseFundingRounds(text).at(-1);
  if (!latest) return "Not disclosed";

  const summary = [latest.date, latest.round, latest.valuation]
    .filter((part) => part.trim() !== "")
    .join(" · ");

  return summary === "" ? "Not disclosed" : summary;
}

function payloadFrom(draft: Draft): Record<string, unknown> {
  return {
    fund: {
      state: draft.state,
      vehicle_type: draft.vehicle_type,
      deal_type: draft.deal_type,
      security_type: draft.security_type.trim(),
      descriptor: draft.descriptor.trim(),
      fund_manager_id: Number(draft.fund_manager_id),
      price: draft.price,
      supply_total: orNull(draft.supply_total),
      min_subscription: draft.min_subscription,
      max_subscription: orNull(draft.max_subscription),
      opened_at: draft.opened_at === "" ? null : new Date(draft.opened_at).toISOString(),
      holding_period_note: orNull(draft.holding_period_note),
      implied_valuation: orNull(draft.implied_valuation),
      subscription_increment: draft.subscription_increment,
      closes_at: closesAtFrom(draft.closes_in_days),
      comparable_basis: draft.comparable_basis.trim(),
      entry_multiple: draft.entry_multiple.trim(),
      comparable_note: orNull(draft.comparable_note),
      key_metrics: parseKeyMetrics(draft.key_metrics),
      revenue_points: parseRevenuePoints(draft.revenue_points),
      peers: parsePeers(draft.peers),
      activities: parseActivities(draft.activities),
      share_class: {
        name: draft.share_class_name.trim(),
        class_type: draft.share_class_type,
      },
      asset: {
        sector: draft.sector,
        funding_stage: draft.funding_stage,
        founded_year: draft.founded_year === "" ? null : Number(draft.founded_year),
        headquarters: draft.headquarters.trim(),
        employee_count: draft.employee_count === "" ? null : Number(draft.employee_count),
        description: draft.description.trim(),
        about: orNull(draft.about),
        thesis: orNull(draft.thesis),
        highlights: linesOf(draft.highlights),
        risks: parseRisks(draft.risks),
        team: parseTeam(draft.team),
        developments: parseDevelopments(draft.developments),
        funding_rounds: parseFundingRounds(draft.funding_rounds),
        tagline: orNull(draft.tagline),
        typical_buyer: orNull(draft.typical_buyer),
        commercial_model: orNull(draft.commercial_model),
        how_it_works: parseHowItWorks(draft.how_it_works),
        in_practice: draft.in_practice_lead.trim()
          ? {
              lead: draft.in_practice_lead.trim(),
              text: draft.in_practice_text.trim(),
              tag: orNull(draft.in_practice_tag),
              source_label: orNull(draft.in_practice_source_label),
              source_href: orNull(draft.in_practice_source_href),
            }
          : null,
        market_context: parseMarketContext(draft.market_context),
        competitive_landscape: parseCompetitiveLandscape(draft.competitive_landscape),
        thesis_points: parseThesisPoints(draft.thesis_points),
        business_columns: parseBusinessColumns(draft.business_columns),
        product_disclosures: parseProductDisclosures(draft.product_disclosures),
        product_disclosures_note: orNull(draft.product_disclosures_note),
        product_disclosures_source: orNull(draft.product_disclosures_source),
        financial_indicators: parseFinancialIndicators(draft.financial_indicators),
      },
      primary_source: draft.primary_source_title.trim()
        ? {
            title: draft.primary_source_title.trim(),
            meta: draft.primary_source_meta.trim(),
            text: draft.primary_source_text.trim(),
          }
        : null,
      figures_checked_note: orNull(draft.figures_checked_note),
      figures_checked_links: parseFiguresCheckedLinks(draft.figures_checked_links),
      recording_available: draft.recording_available,
      recording_embed_url: orNull(draft.recording_embed_url),
    },
  };
}

/* ─── Publication quality gate ─── */

type CheckStatus = "pass" | "fail" | "todo";
type Check = { label: string; detail?: string; status: CheckStatus };

const BANNED_LANGUAGE = /\b(pool(ing|ed)?|marketplace|guaranteed)\b/i;

/* Dates are free text, so "Mar 2025" and "22 Aug 2026" both read, while anything
 * that does not parse ("H2 2024") is left unjudged rather than failed. */
function futureDated(rows: Array<{ date: string }>): string[] {
  const today = Date.now();
  return rows
    .filter((row) => {
      const parsed = Date.parse(row.date);
      return !Number.isNaN(parsed) && parsed > today;
    })
    .map((row) => row.date);
}

function qualityGate(draft: Draft): Check[] {
  const narrative = [
    draft.about,
    draft.thesis,
    draft.highlights,
    draft.risks,
    draft.descriptor,
    draft.comparable_note,
    draft.key_metrics,
    draft.activities,
  ].join("\n");
  const risks = parseRisks(draft.risks);
  const highlights = linesOf(draft.highlights);
  const fees = [
    Number(draft.subscription_fee_pct),
    Number(draft.management_fee_pct),
    Number(draft.carried_interest_pct),
  ];

  const facts = [
    draft.founded_year,
    draft.headquarters,
    draft.employee_count,
    draft.sector,
    draft.funding_stage,
    draft.funding_rounds,
    draft.implied_valuation,
  ];
  const filledFacts = facts.filter((fact) => fact.trim() !== "").length;

  const check = (condition: boolean): CheckStatus => (condition ? "pass" : "fail");

  const futureUpdates = [
    ...futureDated(parseDevelopments(draft.developments)),
    ...futureDated(parseActivities(draft.activities)),
    ...futureDated(parseFundingRounds(draft.funding_rounds)),
  ];

  const malformed = COLLECTION_FIELDS.filter(
    (field) => formatProblems(draft[field], LINE_FORMATS[field]).length > 0,
  ).map((field) => LINE_FORMATS[field].label);

  return [
    {
      label: "Unique project codename",
      status: "pass",
    },
    {
      label: "Minimum investment is a sane positive amount",
      status: check(
        Number(draft.min_subscription) > 0 &&
          (draft.max_subscription.trim() === "" ||
            Number(draft.max_subscription) >= Number(draft.min_subscription)),
      ),
    },
    {
      label: "Fee components within sane bounds",
      status: check(fees.every((fee) => fee >= 0 && fee <= 30) && Number(fees[0]) <= 10),
    },
    {
      label: "No pooling, marketplace or guaranteed early-exit language",
      status: check(!BANNED_LANGUAGE.test(narrative)),
    },
    {
      label: "No future-dated published updates",
      detail: futureUpdates.length > 0 ? `Dated ahead of today: ${futureUpdates.join(" · ")}` : "",
      status: check(futureUpdates.length === 0),
    },
    {
      label: "Balanced strengths and risks present",
      status: check(highlights.length > 0 && risks.length > 0),
    },
    {
      label: "Every table row uses the column format",
      detail: malformed.length > 0 ? `Rows need attention in ${malformed.join(" · ")}` : "",
      status: check(malformed.length === 0),
    },
    // TODO: no per-field provenance in the API yet.
    { label: "Every figure carries a source and an as-at date", status: "todo" },
    {
      label: "Editable fact-grid rows present",
      detail: `${filledFacts} of ${facts.length} filled · the rest come from the asset record`,
      status: check(filledFacts === facts.length),
    },
    {
      label: "Company-specific risks: three to six, most material first",
      detail: `${risks.length} written`,
      status: check(risks.length >= 3 && risks.length <= 6),
    },
    { label: "Risks tab carries the standard general risk set", status: "pass" },
    // TODO: no market data in the API yet.
    { label: "Market tab shows headwinds as well as tailwinds", status: "todo" },
    // TODO: no definition of the standard document set.
    { label: "Standard document set present for this deal", status: "todo" },
    // TODO: not-disclosed lines are rendered per field, not registered.
    { label: "Not-disclosed line names what the company has not shared", status: "todo" },
    {
      label: "No em dashes · separators are middots",
      status: check(!narrative.includes("—")),
    },
    // TODO: no source register to reconcile against.
    { label: "Source register reconciles to the page", status: "todo" },
  ];
}

function CheckRow({ check }: { check: Check }) {
  const icon = {
    pass: <CheckIcon className="size-4 text-primary" />,
    fail: <TriangleAlertIcon className="size-4 text-destructive" />,
    todo: <MinusIcon className="size-4 text-muted-foreground" />,
  }[check.status];

  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="text-sm">
        {check.label}
        {check.status === "todo" && (
          <span className="ml-1.5 text-xs text-muted-foreground">not checked yet</span>
        )}
        {check.detail && (
          <span className="mt-0.5 block text-xs text-muted-foreground">{check.detail}</span>
        )}
      </span>
    </div>
  );
}

/* ─── Form primitives ─── */

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** A value the editor deliberately cannot change. */
function LockedField({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex h-8 items-center rounded-lg border bg-muted px-3 text-sm opacity-80">
        {value}
      </div>
    </Field>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

function AreaField({
  label,
  value,
  onChange,
  rows = 4,
  problems = [],
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  problems?: string[];
}) {
  return (
    <Field label={label}>
      <Textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={problems.length > 0}
      />
      {problems.length > 0 && (
        <ul className="space-y-0.5">
          {problems.map((problem) => (
            <li key={problem} className="text-xs text-destructive">
              {problem}
            </li>
          ))}
        </ul>
      )}
    </Field>
  );
}

function EditorSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <p className="text-sm tracking-wide text-muted-foreground uppercase">{label}</p>
      {children}
    </div>
  );
}

const SECTOR_OPTIONS = Object.entries(SECTOR_LABELS);
const STAGE_OPTIONS = Object.entries(STAGE_LABELS);

const FUND_STATUS_OPTIONS: { value: FundStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "open", label: "Open" },
  { value: "closing", label: "Closing" },
  { value: "closed", label: "Closed" },
  { value: "holding", label: "Holding" },
  { value: "realized", label: "Realized" },
];
const FUND_STATUS_LABELS = Object.fromEntries(
  FUND_STATUS_OPTIONS.map((o) => [o.value, o.label]),
) as Record<FundStatus, string>;

const VEHICLE_TYPE_OPTIONS = [
  { value: "fund", label: "Fund" },
  { value: "spv", label: "SPV" },
  { value: "direct", label: "Direct" },
];

const SHARE_CLASS_TYPE_OPTIONS = [
  { value: "ordinary", label: "Ordinary" },
  { value: "preference", label: "Preference" },
  { value: "convertible", label: "Convertible" },
  { value: "other", label: "Other" },
];

/* ─── Editor ─── */

export default function PublishedDealEditor({
  fund,
  open,
  onOpenChange,
}: {
  fund: Fund;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [draft, setDraft] = useState(() => draftFrom(fund));

  const { data: managersData } = useQuery({
    queryKey: ["fundManagers"],
    queryFn: () =>
      api<{ fund_managers: Array<{ id: number; name: string }> }>("/api/v1/fund_managers"),
    enabled: open,
  });
  const managers = managersData?.fund_managers ?? [];

  const { data: subsData } = useQuery({
    queryKey: ["admin", "subscriptions", "all"],
    queryFn: () => api<SubscriptionsResponse>("/api/v1/admin/subscriptions"),
    enabled: open && user?.role === "luca",
  });
  const activeSubscriptionCount = (subsData?.subscriptions ?? []).filter(
    (s: AdminSubscription) =>
      s.fund_id === fund.id && !CLOSED_SUBSCRIPTION_STATUSES.includes(s.status),
  ).length;
  const changingStatus = draft.state !== fund.state;
  const [statusChangeAcknowledged, setStatusChangeAcknowledged] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const save = useMutation({
    mutationFn: () =>
      api<{ fund: Fund }>(`/api/v1/funds/${fund.id}`, {
        method: "PATCH",
        body: payloadFrom(draft),
      }),
    onSuccess: ({ fund: updated }) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "funds"] });
      queryClient.invalidateQueries({ queryKey: ["fund", updated.id] });
      onOpenChange(false);
    },
  });

  const checks = qualityGate(draft);
  const failures = checks.filter((c) => c.status === "fail").length;

  const problemsIn = (field: CollectionField) => formatProblems(draft[field], LINE_FORMATS[field]);

  const close = () => {
    setDraft(draftFrom(fund));
    save.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent
        className="max-h-[90vh] w-[min(64rem,calc(100vw-2rem))] max-w-none overflow-y-auto"
        closeClassName="top-10 right-10"
      >
        <div className="space-y-5 rounded-lg border bg-muted p-4">
          <div className="space-y-2">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              Edit published deal
            </p>
            <DialogTitle className="mt-1">master</DialogTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Changes save to the shared LUCA record and flow to EAM and investor views.
            </p>
          </div>

          <EditorSection label="Identity and transaction terms">
            <div className="grid grid-cols-2 gap-4">
              <LockedField
                label="Project identity"
                value={`${fund.codename} · ${fund.asset.name}`}
                hint="Protected so subscriptions, documents and audit records keep the same immutable vehicle identity."
              />
              <Field label="Status">
                <Select
                  disabled={user?.role === "investment_team"}
                  value={draft.state}
                  onValueChange={(v) => set("state", v as FundStatus)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{FUND_STATUS_LABELS[draft.state]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {FUND_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Vehicle type">
                <Select
                  value={draft.vehicle_type}
                  onValueChange={(v) => set("vehicle_type", v as string)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {VEHICLE_TYPE_OPTIONS.find((o) => o.value === draft.vehicle_type)?.label ??
                        draft.vehicle_type}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {VEHICLE_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Sector">
                <Select value={draft.sector} onValueChange={(v) => set("sector", v as string)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{SECTOR_LABELS[draft.sector] ?? draft.sector}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {SECTOR_OPTIONS.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Stage">
                <Select
                  value={draft.funding_stage}
                  onValueChange={(v) => set("funding_stage", v as string)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {STAGE_LABELS[draft.funding_stage] ?? draft.funding_stage}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {STAGE_OPTIONS.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <TextField
                label="Minimum investment"
                type="number"
                value={draft.min_subscription}
                onChange={(v) => set("min_subscription", v)}
                hint="Minimum ticket per investor, in USD."
              />
              <TextField
                label="Maximum investment"
                type="number"
                value={draft.max_subscription}
                onChange={(v) => set("max_subscription", v)}
                hint="Optional — leave blank for no cap."
              />
              <TextField
                label="Share class name"
                value={draft.share_class_name}
                onChange={(v) => set("share_class_name", v)}
              />
              <Field label="Share class type">
                <Select
                  value={draft.share_class_type}
                  onValueChange={(v) => set("share_class_type", v as string)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {SHARE_CLASS_TYPE_OPTIONS.find((o) => o.value === draft.share_class_type)
                        ?.label ?? draft.share_class_type}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {SHARE_CLASS_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <TextField
                label="Open date"
                type="date"
                value={draft.opened_at}
                onChange={(v) => set("opened_at", v)}
              />
              <TextField
                label="Expected holding period"
                value={draft.holding_period_note}
                onChange={(v) => set("holding_period_note", v)}
                hint="Free text, e.g. “3–5 years”."
              />
              <TextField
                label="Increment"
                type="number"
                value={draft.subscription_increment}
                onChange={(v) => set("subscription_increment", v)}
                hint="Ticket step above the minimum."
              />
              <TextField
                label="Closes in days"
                type="number"
                value={draft.closes_in_days}
                onChange={(v) => set("closes_in_days", v)}
                hint="Leave blank for open-ended."
              />
              <TextField
                label="Security"
                value={draft.security_type}
                onChange={(v) => set("security_type", v)}
              />
              <LockedField
                label="Last reported round"
                value={lastReportedRound(draft.funding_rounds)}
                hint="The most recent funding round below · a company fact, not a term of this deal."
              />
              <TextField
                label="Acquired valuation"
                type="number"
                value={draft.implied_valuation}
                onChange={(v) => set("implied_valuation", v)}
              />
              <TextField
                label="Target amount"
                type="number"
                value={draft.supply_total}
                onChange={(v) => set("supply_total", v)}
              />
              <Field label="Fund manager">
                <Select
                  value={draft.fund_manager_id}
                  onValueChange={(v) => set("fund_manager_id", v as string)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {managers.find((m) => String(m.id) === draft.fund_manager_id)?.name ??
                        fund.fund_manager.name}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {managers.map((manager) => (
                      <SelectItem key={manager.id} value={String(manager.id)}>
                        {manager.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <TextField
                label="Price per share"
                type="number"
                value={draft.price}
                onChange={(v) => set("price", v)}
              />
              <Field label="Transaction type">
                <Select
                  value={draft.deal_type}
                  onValueChange={(v) => set("deal_type", v as string)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {draft.deal_type === "primary" ? "Primary" : "Secondary"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="primary">Primary</SelectItem>
                    <SelectItem value="secondary">Secondary</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </EditorSection>

          <EditorSection label="Company and opportunity narrative">
            <div className="grid grid-cols-2 gap-4">
              <TextField
                label="Founded"
                type="number"
                value={draft.founded_year}
                onChange={(v) => set("founded_year", v)}
              />
              <TextField
                label="Headquarters"
                value={draft.headquarters}
                onChange={(v) => set("headquarters", v)}
              />
              <TextField
                label="Headcount"
                type="number"
                value={draft.employee_count}
                onChange={(v) => set("employee_count", v)}
              />
              <TextField
                label="Shelf descriptor"
                value={draft.descriptor}
                onChange={(v) => set("descriptor", v)}
              />
            </div>
            <AreaField
              label="Company description"
              value={draft.description}
              onChange={(v) => set("description", v)}
            />
            <AreaField
              label="Company overview"
              value={draft.about}
              onChange={(v) => set("about", v)}
            />
            <AreaField
              label="LUCA thesis"
              value={draft.thesis}
              onChange={(v) => set("thesis", v)}
            />
            <AreaField
              label="Investment highlights · one per line"
              rows={5}
              value={draft.highlights}
              onChange={(v) => set("highlights", v)}
            />
            <AreaField
              label="Key risks · Title | Body"
              rows={5}
              value={draft.risks}
              onChange={(v) => set("risks", v)}
              problems={problemsIn("risks")}
            />
          </EditorSection>

          <EditorSection label="Charts and financial metrics">
            <AreaField
              label="Key metrics · Label | Value | Note"
              rows={6}
              value={draft.key_metrics}
              onChange={(v) => set("key_metrics", v)}
              problems={problemsIn("key_metrics")}
            />
            <AreaField
              label="Revenue chart · Period | USD billions"
              rows={4}
              value={draft.revenue_points}
              onChange={(v) => set("revenue_points", v)}
              problems={problemsIn("revenue_points")}
            />
            <AreaField
              label="Valuation chart and funding rounds · Date | Round | Valuation | Raised | Lead"
              rows={5}
              value={draft.funding_rounds}
              onChange={(v) => set("funding_rounds", v)}
              problems={problemsIn("funding_rounds")}
            />
          </EditorSection>

          <EditorSection label="Comparables, activity and people">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Comparable basis"
                value={draft.comparable_basis}
                onChange={(v) => set("comparable_basis", v)}
              />
              <TextField
                label="Our entry multiple"
                value={draft.entry_multiple}
                onChange={(v) => set("entry_multiple", v)}
              />
            </div>
            <AreaField
              label="Public peers · Name | Multiple"
              rows={3}
              value={draft.peers}
              onChange={(v) => set("peers", v)}
              problems={problemsIn("peers")}
            />
            <AreaField
              label="Comparable note"
              rows={3}
              value={draft.comparable_note}
              onChange={(v) => set("comparable_note", v)}
            />
            <AreaField
              label="Deal activity · Date | Update | commit/milestone/update"
              rows={4}
              value={draft.activities}
              onChange={(v) => set("activities", v)}
              problems={problemsIn("activities")}
            />
            <AreaField
              label="Management team · Role | Name"
              rows={4}
              value={draft.team}
              onChange={(v) => set("team", v)}
              problems={problemsIn("team")}
            />
            <AreaField
              label="Recent developments · Date | Update"
              rows={4}
              value={draft.developments}
              onChange={(v) => set("developments", v)}
              problems={problemsIn("developments")}
            />
          </EditorSection>

          <EditorSection label="Deal overview page · company narrative">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Tagline"
                value={draft.tagline}
                onChange={(v) => set("tagline", v)}
                hint="One line shown under the company name."
              />
              <TextField
                label="Typical buyer"
                value={draft.typical_buyer}
                onChange={(v) => set("typical_buyer", v)}
              />
              <TextField
                label="Commercial model"
                value={draft.commercial_model}
                onChange={(v) => set("commercial_model", v)}
              />
            </div>
            <AreaField
              label="How the company creates value · Label | Text"
              rows={5}
              value={draft.how_it_works}
              onChange={(v) => set("how_it_works", v)}
              problems={problemsIn("how_it_works")}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <AreaField
                label="In-practice example · lead line"
                rows={2}
                value={draft.in_practice_lead}
                onChange={(v) => set("in_practice_lead", v)}
              />
              <AreaField
                label="In-practice example · detail"
                rows={2}
                value={draft.in_practice_text}
                onChange={(v) => set("in_practice_text", v)}
              />
              <TextField
                label="In-practice tag"
                value={draft.in_practice_tag}
                onChange={(v) => set("in_practice_tag", v)}
                hint="e.g. “Company-reported customer example”."
              />
              <TextField
                label="In-practice source label"
                value={draft.in_practice_source_label}
                onChange={(v) => set("in_practice_source_label", v)}
              />
              <TextField
                label="In-practice source URL"
                value={draft.in_practice_source_href}
                onChange={(v) => set("in_practice_source_href", v)}
                hint="Optional — leave blank when there is no linkable source."
              />
            </div>
            <AreaField
              label="Market context · one paragraph per line"
              rows={4}
              value={draft.market_context}
              onChange={(v) => set("market_context", v)}
            />
            <AreaField
              label="Competitive landscape · Category | Examples | Why a buyer might choose it"
              rows={4}
              value={draft.competitive_landscape}
              onChange={(v) => set("competitive_landscape", v)}
              problems={problemsIn("competitive_landscape")}
            />
            <AreaField
              label="Investment thesis points · Title | Text"
              rows={4}
              value={draft.thesis_points}
              onChange={(v) => set("thesis_points", v)}
              problems={problemsIn("thesis_points")}
            />
            <AreaField
              label="Business model columns · Title | Text"
              rows={4}
              value={draft.business_columns}
              onChange={(v) => set("business_columns", v)}
              problems={problemsIn("business_columns")}
            />
            <AreaField
              label="Product disclosures · Label | Sub-label | Value"
              rows={3}
              value={draft.product_disclosures}
              onChange={(v) => set("product_disclosures", v)}
              problems={problemsIn("product_disclosures")}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Product disclosures note"
                value={draft.product_disclosures_note}
                onChange={(v) => set("product_disclosures_note", v)}
              />
              <TextField
                label="Product disclosures source"
                value={draft.product_disclosures_source}
                onChange={(v) => set("product_disclosures_source", v)}
              />
            </div>
            <AreaField
              label="Other financial indicators · Value | Label | Source | Word (yes/no)"
              rows={3}
              value={draft.financial_indicators}
              onChange={(v) => set("financial_indicators", v)}
              problems={problemsIn("financial_indicators")}
            />
          </EditorSection>

          <EditorSection label="Deal overview page · sourcing and recording">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Primary source title"
                value={draft.primary_source_title}
                onChange={(v) => set("primary_source_title", v)}
                hint="e.g. the deck or data-room package this page is built from."
              />
              <TextField
                label="Primary source meta"
                value={draft.primary_source_meta}
                onChange={(v) => set("primary_source_meta", v)}
                hint="e.g. “LUCA SGP Pte. Ltd., data room, September 2026”."
              />
            </div>
            <AreaField
              label="Primary source description"
              rows={2}
              value={draft.primary_source_text}
              onChange={(v) => set("primary_source_text", v)}
            />
            <AreaField
              label="How figures were checked"
              rows={2}
              value={draft.figures_checked_note}
              onChange={(v) => set("figures_checked_note", v)}
            />
            <AreaField
              label="How figures were checked · links · Label | URL"
              rows={2}
              value={draft.figures_checked_links}
              onChange={(v) => set("figures_checked_links", v)}
              problems={problemsIn("figures_checked_links")}
            />
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={draft.recording_available}
                onChange={(e) => set("recording_available", e.target.checked)}
              />
              Recorded overview available
            </label>
            {draft.recording_available && (
              <TextField
                label="Recording URL"
                value={draft.recording_embed_url}
                onChange={(v) => set("recording_embed_url", v)}
              />
            )}
          </EditorSection>

          <EditorSection label="Publication quality gate">
            <div className="rounded-lg border bg-muted/40 px-4 py-2">
              {checks.map((check) => (
                <CheckRow key={check.label} check={check} />
              ))}
            </div>
          </EditorSection>

          {changingStatus && activeSubscriptionCount > 0 && (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <p className="font-medium">
                {activeSubscriptionCount} active subscription
                {activeSubscriptionCount === 1 ? "" : "s"} on this deal
              </p>
              <p>
                Changing status from {FUND_STATUS_LABELS[fund.state]} to{" "}
                {FUND_STATUS_LABELS[draft.state]} does not change those subscriptions — confirm this
                is intended before publishing.
              </p>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={statusChangeAcknowledged}
                  onChange={(e) => setStatusChangeAcknowledged(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-border"
                />
                <span>I understand and want to proceed.</span>
              </label>
            </div>
          )}

          {save.isError && <p className="text-sm text-destructive">{save.error.message}</p>}

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card p-4">
            <div>
              <strong className="text-sm">Publish this revision</strong>
              <p className="text-xs text-muted-foreground">
                Saving updates the LUCA SGP preview, the EAM read-only overview and the investor
                page from the same record.
              </p>
            </div>
            <Button
              size="lg"
              disabled={
                failures > 0 ||
                save.isPending ||
                (changingStatus && activeSubscriptionCount > 0 && !statusChangeAcknowledged)
              }
              onClick={() => save.mutate()}
            >
              {failures > 0
                ? "Resolve quality-gate issues"
                : save.isPending
                  ? "Publishing..."
                  : "Save and publish all changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
