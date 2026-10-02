import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { api } from "@/lib/api";
import type { Fund } from "@/lib/types";
import type { InvestorPricingResponse, InvestorPricingRow } from "../types";
import { formatPriceCompact, formatPricePrecise } from "@/lib/currency";
import DealOverviewPage from "@/components/deal-overview-page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TermKey =
  | "price"
  | "subscription_fee_pct"
  | "management_fee_pct"
  | "carried_interest_pct"
  | "implied_valuation";

const TERMS: {
  key: TermKey;
  label: string;
  unit: string;
  format: (value: string) => string;
}[] = [
  { key: "price", label: "Price / unit", unit: "$", format: (v) => formatPricePrecise(v) },
  { key: "subscription_fee_pct", label: "Subscription fee", unit: "%", format: (v) => `${v}%` },
  { key: "management_fee_pct", label: "Management fee", unit: "%", format: (v) => `${v}%` },
  { key: "carried_interest_pct", label: "Carried interest", unit: "%", format: (v) => `${v}%` },
  {
    key: "implied_valuation",
    label: "Valuation shown",
    unit: "$",
    format: (v) => formatPriceCompact(v),
  },
];

/** The deal as one investor sees it: standard terms with their custom values applied. */
function applyPricing(fund: Fund, row: InvestorPricingRow | undefined): Fund {
  if (!row) return fund;
  const patch: Partial<Fund> = {};
  for (const { key } of TERMS) {
    const value = row[key];
    if (value !== null) patch[key] = value;
  }
  return { ...fund, ...patch };
}

const standardOf = (fund: Fund, key: TermKey): string | null => fund[key] ?? null;

export default function InvestorPricing({ fund }: { fund: Fund }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<{ investorId: number | null } | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [viewAsId, setViewAsId] = useState<string>("");
  const [pendingRemove, setPendingRemove] = useState<InvestorPricingRow | null>(null);

  const queryKey = ["admin", "investor-pricing", fund.id];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => api<InvestorPricingResponse>(`/api/v1/admin/funds/${fund.id}/investor_pricing`),
  });
  const overrides = data?.overrides ?? [];
  const investors = data?.investors ?? [];
  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const remove = useMutation({
    mutationFn: (investorId: number) =>
      api(`/api/v1/admin/funds/${fund.id}/investor_pricing/${investorId}`, { method: "DELETE" }),
    onSuccess: () => {
      setPendingRemove(null);
      refresh();
    },
  });

  const previewInvestor = investors.find((i) => i.id === previewId);
  const previewRow = overrides.find((o) => o.investor_id === previewId);

  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Investor pricing</h2>
        <p className="text-sm text-muted-foreground">
          Show individual investors a different price, fees or valuation from the standard published
          terms, and preview exactly what each investor sees.
        </p>
      </div>

      {/* Standard terms */}
      <div>
        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Standard terms
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-5">
          {TERMS.map((t) => {
            const value = standardOf(fund, t.key);
            return (
              <div key={t.key}>
                <dt className="text-xs text-muted-foreground">{t.label}</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">
                  {value ? t.format(value) : "—"}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>

      {/* Custom terms table */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Custom terms ({overrides.length})
          </div>
          <Button size="sm" onClick={() => setEditing({ investorId: null })}>
            <PlusIcon className="size-4" />
            Add custom terms
          </Button>
        </div>

        {isLoading ? (
          <p className="py-8 text-sm text-muted-foreground">Loading...</p>
        ) : overrides.length === 0 ? (
          <p className="mt-3 border-y py-10 text-center text-sm text-muted-foreground">
            Every investor currently sees the standard terms.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-normal">Investor</th>
                  {TERMS.map((t) => (
                    <th key={t.key} className="pb-2 text-right font-normal">
                      {t.label}
                    </th>
                  ))}
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y border-b">
                {overrides.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="py-3 pr-4">
                      <p className="font-medium">{row.investor_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.client_code}
                        {row.eam_firm ? ` · ${row.eam_firm}` : ""}
                      </p>
                      {row.note && (
                        <p className="mt-1 max-w-xs text-xs text-muted-foreground">{row.note}</p>
                      )}
                    </td>
                    {TERMS.map((t) => {
                      const custom = row[t.key];
                      return (
                        <td key={t.key} className="py-3 text-right tabular-nums">
                          {custom !== null ? (
                            <span className="font-medium text-primary">{t.format(custom)}</span>
                          ) : (
                            <span className="text-muted-foreground">Standard</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-3 pl-4">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Preview as ${row.investor_name}`}
                          onClick={() => setPreviewId(row.investor_id)}
                        >
                          <EyeIcon className="size-4" />
                          Preview
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Edit terms for ${row.investor_name}`}
                          onClick={() => setEditing({ investorId: row.investor_id })}
                        >
                          <PencilIcon className="size-4" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Remove custom terms for ${row.investor_name}`}
                          onClick={() => setPendingRemove(row)}
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* View as any investor */}
      <div className="flex flex-wrap items-end gap-3 border-t pt-6">
        <div className="space-y-1.5">
          <Label className="text-xs">See what any investor sees</Label>
          <Select value={viewAsId} onValueChange={(val) => setViewAsId(val as string)}>
            <SelectTrigger className="w-72">
              <SelectValue>
                {investors.find((i) => String(i.id) === viewAsId)?.full_name ??
                  "Choose an investor"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {investors.map((i) => (
                <SelectItem key={i.id} value={String(i.id)}>
                  {i.full_name} · {i.client_code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          disabled={!viewAsId}
          onClick={() => setPreviewId(Number(viewAsId))}
        >
          <EyeIcon className="size-4" />
          View as investor
        </Button>
      </div>

      {editing && (
        <EditTermsDialog
          fund={fund}
          investors={investors}
          existing={overrides.find((o) => o.investor_id === editing.investorId)}
          lockedInvestorId={editing.investorId}
          takenIds={overrides.map((o) => o.investor_id)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}

      {previewInvestor && (
        <Dialog open onOpenChange={(open) => !open && setPreviewId(null)}>
          <DialogContent className="max-h-[94vh] max-w-[96vw] overflow-y-auto p-5 sm:max-w-6xl">
            <DialogTitle>What {previewInvestor.full_name} sees</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {previewRow
                ? "Custom terms are applied to the investor’s view of this deal."
                : "This investor has no custom terms, so they see the standard terms."}
            </p>
            <table className="w-full max-w-2xl text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-normal">Term</th>
                  <th className="pb-2 text-right font-normal">Standard</th>
                  <th className="pb-2 text-right font-normal">{previewInvestor.full_name} sees</th>
                </tr>
              </thead>
              <tbody className="divide-y border-b">
                {TERMS.map((t) => {
                  const standard = standardOf(fund, t.key);
                  const custom = previewRow?.[t.key] ?? null;
                  return (
                    <tr key={t.key}>
                      <td className="py-2 text-muted-foreground">{t.label}</td>
                      <td className="py-2 text-right tabular-nums">
                        {standard ? t.format(standard) : "—"}
                      </td>
                      <td
                        className={`py-2 text-right tabular-nums ${
                          custom !== null ? "font-semibold text-primary" : ""
                        }`}
                      >
                        {custom !== null ? t.format(custom) : standard ? t.format(standard) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-2 border-t pt-4">
              <DealOverviewPage
                key={`${fund.id}-${previewInvestor.id}`}
                fund={applyPricing(fund, previewRow)}
                viewer="investor"
                backTo=""
                backLabel=""
                preview
                embedded
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {pendingRemove && (
        <Dialog open onOpenChange={(open) => !open && setPendingRemove(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogTitle>Remove custom terms?</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {pendingRemove.investor_name} will see the standard published terms for this deal.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setPendingRemove(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={remove.isPending}
                onClick={() => remove.mutate(pendingRemove.investor_id)}
              >
                {remove.isPending ? "Removing..." : "Remove"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}

function EditTermsDialog({
  fund,
  investors,
  existing,
  lockedInvestorId,
  takenIds,
  onClose,
  onSaved,
}: {
  fund: Fund;
  investors: InvestorPricingResponse["investors"];
  existing: InvestorPricingRow | undefined;
  lockedInvestorId: number | null;
  takenIds: number[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [investorId, setInvestorId] = useState<string>(
    lockedInvestorId !== null ? String(lockedInvestorId) : "",
  );
  const [values, setValues] = useState<Record<TermKey, string>>({
    price: existing?.price ?? "",
    subscription_fee_pct: existing?.subscription_fee_pct ?? "",
    management_fee_pct: existing?.management_fee_pct ?? "",
    carried_interest_pct: existing?.carried_interest_pct ?? "",
    implied_valuation: existing?.implied_valuation ?? "",
  });
  const [note, setNote] = useState(existing?.note ?? "");

  const available = investors.filter((i) => lockedInvestorId !== null || !takenIds.includes(i.id));
  const investor = investors.find((i) => String(i.id) === investorId);
  const anyValue = Object.values(values).some((v) => v.trim() !== "");

  const save = useMutation({
    mutationFn: () =>
      api(`/api/v1/admin/funds/${fund.id}/investor_pricing/${investorId}`, {
        method: "PUT",
        body: { pricing: { ...values, note } },
      }),
    onSuccess: onSaved,
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>{existing ? "Edit custom terms" : "Add custom terms"}</DialogTitle>
        <p className="text-sm text-muted-foreground">
          Leave a field blank to keep the standard value for this investor.
        </p>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Investor</Label>
            <Select
              value={investorId}
              onValueChange={(val) => setInvestorId(val as string)}
              disabled={lockedInvestorId !== null}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {investor
                    ? `${investor.full_name} · ${investor.client_code}`
                    : "Choose an investor"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {available.map((i) => (
                  <SelectItem key={i.id} value={String(i.id)}>
                    {i.full_name} · {i.client_code}
                    {i.eam_firm ? ` · ${i.eam_firm}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {TERMS.map((t) => {
              const standard = standardOf(fund, t.key);
              return (
                <div key={t.key} className="space-y-1.5">
                  <Label className="text-xs" htmlFor={`term-${t.key}`}>
                    {t.label} ({t.unit})
                  </Label>
                  <Input
                    id={`term-${t.key}`}
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={values[t.key]}
                    placeholder={standard ? `Standard: ${t.format(standard)}` : "Standard"}
                    onChange={(e) => setValues((v) => ({ ...v, [t.key]: e.target.value }))}
                  />
                </div>
              );
            })}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="term-note">
              Internal note (never shown to the investor)
            </Label>
            <Input
              id="term-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why these terms were agreed"
            />
          </div>
        </div>

        {save.isError && <p className="text-sm text-destructive">{save.error.message}</p>}

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={!investorId || !anyValue || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving..." : "Save terms"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
