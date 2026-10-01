import { useMemo, useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/currency";
import type { Fund } from "@/lib/types";
import type {
  AccreditationStatus,
  AdminInvestor,
  AdminSubscription,
  IdentityStatus,
  InvestorsResponse,
  SubscriptionsResponse,
} from "./types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchIcon, CheckIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const IDENTITY_CHOICES: IdentityStatus[] = ["pending", "verified", "failed"];
const ACCREDITATION_CHOICES: AccreditationStatus[] = ["pending", "accredited", "not_accredited"];

/* ─── Search-mode switcher — one dropdown, shared shape with by-fund / by-eam ─── */
export function SearchModeSelect({ mode }: { mode: "investor" | "fund" | "eam" }) {
  const navigate = useNavigate();
  return (
    <Select
      value={mode}
      onValueChange={(v) => {
        if (v === "investor") navigate("/luca/onboarding");
        else if (v === "fund") navigate("/luca/fund-search");
        else if (v === "eam") navigate("/luca/eam-search");
      }}
    >
      <SelectTrigger className="w-full sm:w-56">
        <SelectValue>
          {mode === "investor"
            ? "Search by investor"
            : mode === "fund"
              ? "Search by fund"
              : "Search by EAM"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="investor">Search by investor</SelectItem>
        <SelectItem value="fund">Search by fund</SelectItem>
        <SelectItem value="eam">Search by EAM</SelectItem>
      </SelectContent>
    </Select>
  );
}

/* ─── Pending onboarding row + review dialog ─── */

function PendingRow({ investor, onOpen }: { investor: AdminInvestor; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-4 rounded-lg border bg-card p-3 text-left text-sm transition-colors hover:bg-accent"
    >
      <div className="min-w-0">
        <p className="truncate font-medium">{investor.full_name}</p>
        <p className="truncate text-xs text-muted-foreground">{investor.email}</p>
      </div>
      <Badge variant="outline" className="shrink-0 text-[10px]">
        {investor.verification_status === "in_review" ? "In review" : "Pending"}
      </Badge>
    </button>
  );
}

function OnboardingReviewDialog({
  investor,
  onClose,
  onReviewed,
}: {
  investor: AdminInvestor;
  onClose: () => void;
  onReviewed: () => void;
}) {
  const [identity, setIdentity] = useState<IdentityStatus | null>(null);
  const [accreditation, setAccreditation] = useState<AccreditationStatus | null>(null);

  const review = useMutation({
    mutationFn: () =>
      api<{ investor: AdminInvestor }>(`/api/v1/admin/investors/${investor.id}/verification`, {
        method: "PATCH",
        body: {
          identity_status: identity ?? undefined,
          accreditation_status: accreditation ?? undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Decision recorded.");
      onReviewed();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>{investor.full_name}</DialogTitle>
        <p className="text-sm text-muted-foreground">
          {investor.email} · {investor.investor_type === "institutional" ? "Entity" : "Individual"}{" "}
          onboarding
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Identity</Label>
            <p className="text-xs text-muted-foreground">
              Currently {investor.identity_status.replace(/_/g, " ")}
            </p>
            <div className="flex flex-wrap gap-2">
              {IDENTITY_CHOICES.map((choice) => (
                <Button
                  key={choice}
                  size="sm"
                  variant={identity === choice ? "secondary" : "outline"}
                  onClick={() => setIdentity(choice === identity ? null : choice)}
                >
                  {choice === investor.identity_status && (
                    <CheckIcon className="size-3.5 text-muted-foreground" />
                  )}
                  {choice.replace(/_/g, " ")}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Accreditation</Label>
            <p className="text-xs text-muted-foreground">
              Currently {investor.accreditation_status.replace(/_/g, " ")}
            </p>
            <div className="flex flex-wrap gap-2">
              {ACCREDITATION_CHOICES.map((choice) => (
                <Button
                  key={choice}
                  size="sm"
                  variant={accreditation === choice ? "secondary" : "outline"}
                  onClick={() => setAccreditation(choice === accreditation ? null : choice)}
                >
                  {choice === investor.accreditation_status && (
                    <CheckIcon className="size-3.5 text-muted-foreground" />
                  )}
                  {choice.replace(/_/g, " ")}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {investor.internal_notes && (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            {investor.internal_notes}
          </p>
        )}

        <div className="flex items-center justify-between">
          <Link
            to={`/luca/investors/${investor.id}`}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            View full profile
          </Link>
          <Button
            disabled={review.isPending || (!identity && !accreditation)}
            onClick={() => review.mutate()}
          >
            Record decision
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main page ─── */

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const mode = searchParams.get("mode") ?? "people";
  const [search, setSearch] = useState("");
  const [reviewing, setReviewing] = useState<AdminInvestor | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "investors", "all"],
    queryFn: () => api<InvestorsResponse>("/api/v1/admin/investors"),
  });
  const investors = data?.investors ?? [];

  const { data: fundsData } = useQuery({
    queryKey: ["admin", "funds"],
    queryFn: () => api<{ funds: Fund[] }>("/api/v1/funds"),
  });
  const funds = fundsData?.funds ?? [];

  const { data: subsData } = useQuery({
    queryKey: ["admin", "subscriptions", "all"],
    queryFn: () => api<SubscriptionsResponse>("/api/v1/admin/subscriptions"),
  });
  const allSubs = subsData?.subscriptions ?? [];

  const q = search.trim().toLowerCase();
  const matches = (i: AdminInvestor) =>
    !q || i.full_name.toLowerCase().includes(q) || i.email.toLowerCase().includes(q);

  const pending = investors.filter(
    (i) =>
      (i.verification_status === "pending" || i.verification_status === "in_review") && matches(i),
  );
  const pendingIndividual = pending.filter((i) => i.investor_type !== "institutional");
  const pendingEntity = pending.filter((i) => i.investor_type === "institutional");

  const approvedById = new Map(
    investors.filter((i) => i.verification_status === "approved").map((i) => [i.id, i]),
  );

  // Accepted roster: for every fund, every approved investor with at least
  // one subscription in it, and how much they've committed to that fund
  // specifically — advisor and capital committed, nothing about
  // verification (that lives on the investor's own profile now).
  const rosterByFund = useMemo(() => {
    return funds
      .map((fund) => {
        const fundSubs = allSubs.filter((s: AdminSubscription) => s.fund_id === fund.id);
        const byInvestor = new Map<
          number,
          { investor: AdminInvestor; eamFirm: string | null; committed: number }
        >();
        for (const s of fundSubs) {
          const investor = approvedById.get(s.investor_id);
          if (!investor || !matches(investor)) continue;
          const existing = byInvestor.get(investor.id);
          const amount = parseFloat(s.amount);
          if (existing) existing.committed += amount;
          else byInvestor.set(investor.id, { investor, eamFirm: s.eam_firm, committed: amount });
        }
        return { fund, rows: [...byInvestor.values()].sort((a, b) => b.committed - a.committed) };
      })
      .filter((group) => group.rows.length > 0);
  }, [funds, allSubs, approvedById, q]);

  const codeFor = (id: number) => {
    let n = Math.imul(id + 0x4b1d, 2654435761) >>> 0;
    let code = "";
    for (let i = 0; i < 5; i++) {
      code += "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"[n % 36];
      n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    }
    return code;
  };
  const entityGroups = new Map<string, Map<number, { investor: AdminInvestor; amount: number }>>();
  for (const sub of allSubs) {
    if (!sub.eam_firm) continue;
    const investor = investors.find((item) => item.id === sub.investor_id);
    if (!investor || !matches(investor)) continue;
    if (!entityGroups.has(sub.eam_firm)) entityGroups.set(sub.eam_firm, new Map());
    const group = entityGroups.get(sub.eam_firm)!;
    const row = group.get(investor.id) ?? { investor, amount: 0 };
    row.amount += Number(sub.amount) || 0;
    group.set(investor.id, row);
  }

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Onboarding &amp; investor records</h1>
          <p className="mt-1 text-muted-foreground">
            Find people, institutional entities and fund participation from one workspace.
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline">{pendingIndividual.length} individual reviews</Badge>
          <Badge variant="outline">{pendingEntity.length} entity reviews</Badge>
        </div>
      </div>
      <div className="relative max-w-2xl">
        <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search investors, entities or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      <Tabs
        value={mode}
        onValueChange={(value) => setSearchParams(value === "people" ? {} : { mode: value })}
      >
        <TabsList>
          <TabsTrigger value="people">Investors</TabsTrigger>
          <TabsTrigger value="entities">Entities &amp; advisers</TabsTrigger>
          <TabsTrigger value="funds">By fund</TabsTrigger>
        </TabsList>
        {isLoading && (
          <p className="py-12 text-center text-muted-foreground">Loading investor records…</p>
        )}
        {!isLoading && (
          <>
            <TabsContent value="people" className="mt-4 space-y-4">
              <details open className="rounded-lg border">
                <summary className="cursor-pointer px-4 py-3 font-medium">
                  Awaiting review{" "}
                  <span className="ml-2 text-sm text-muted-foreground">
                    {pendingIndividual.length} individuals · {pendingEntity.length} entities
                  </span>
                </summary>
                <div className="grid gap-4 border-t p-4 lg:grid-cols-2">
                  {[
                    ["Individual", pendingIndividual],
                    ["Entity", pendingEntity],
                  ].map(([label, rows]) => (
                    <section key={String(label)} className="space-y-2">
                      <h3 className="text-sm font-semibold">
                        {label as string} · {(rows as AdminInvestor[]).length}
                      </h3>
                      {(rows as AdminInvestor[]).map((investor) => (
                        <PendingRow
                          key={investor.id}
                          investor={investor}
                          onOpen={() => setReviewing(investor)}
                        />
                      ))}
                    </section>
                  ))}
                </div>
              </details>
              <details open className="rounded-lg border">
                <summary className="cursor-pointer px-4 py-3 font-medium">
                  Investor directory{" "}
                  <span className="ml-2 text-sm text-muted-foreground">
                    {investors.filter(matches).length} records
                  </span>
                </summary>
                <div className="overflow-x-auto border-t">
                  <table className="w-full min-w-[700px] text-sm">
                    <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2">Client code</th>
                        <th className="px-4 py-2">Investor</th>
                        <th className="px-4 py-2">Type</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2 text-right">Open commitments</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {investors.filter(matches).map((investor) => (
                        <tr
                          key={investor.id}
                          className="cursor-pointer hover:bg-muted/30"
                          onClick={() => navigate(`/luca/investors/${investor.id}`)}
                        >
                          <td className="px-4 py-3 font-mono text-xs">{codeFor(investor.id)}</td>
                          <td className="px-4 py-3">
                            <span className="font-medium">{investor.full_name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {investor.email}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {investor.investor_type === "institutional" ? "Entity" : "Individual"}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline">
                              {investor.verification_status.replaceAll("_", " ")}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {formatPrice(Number(investor.committed_amount))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </TabsContent>
            <TabsContent value="entities" className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Institutional accounts and adviser client books are shown as distinct relationships.
                Adviser links come from recorded subscription records; the demo does not infer legal
                ownership between accounts.
              </p>
              <details open className="rounded-lg border">
                <summary className="cursor-pointer px-4 py-3 font-medium">
                  Institutional investor accounts{" "}
                  <span className="ml-2 text-sm text-muted-foreground">
                    {
                      investors.filter((i) => i.investor_type === "institutional" && matches(i))
                        .length
                    }
                  </span>
                </summary>
                <div className="divide-y border-t px-4">
                  {investors
                    .filter((i) => i.investor_type === "institutional" && matches(i))
                    .map((investor) => (
                      <Link
                        key={investor.id}
                        to={`/luca/investors/${investor.id}`}
                        className="flex items-center justify-between gap-4 py-3 text-sm hover:text-primary"
                      >
                        <span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {codeFor(investor.id)} ·{" "}
                          </span>
                          <span className="font-medium">{investor.full_name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {investor.email}
                          </span>
                        </span>
                        <Badge variant="outline">
                          {investor.verification_status.replaceAll("_", " ")}
                        </Badge>
                      </Link>
                    ))}
                </div>
              </details>
              {[...entityGroups]
                .filter(([name]) => !q || name.toLowerCase().includes(q))
                .map(([name, clients]) => (
                  <details key={name} className="rounded-lg border">
                    <summary className="cursor-pointer px-4 py-3 font-medium">
                      Adviser · {name}
                      <span className="ml-2 text-sm text-muted-foreground">
                        {clients.size} linked clients
                      </span>
                    </summary>
                    <div className="overflow-x-auto border-t">
                      <table className="w-full min-w-[600px] text-sm">
                        <tbody className="divide-y">
                          {[...clients.values()].map(({ investor, amount }) => (
                            <tr key={investor.id}>
                              <td className="px-4 py-3 font-mono text-xs">
                                {codeFor(investor.id)}
                              </td>
                              <td className="px-4 py-3">
                                <Link
                                  to={`/luca/investors/${investor.id}`}
                                  className="font-medium hover:underline"
                                >
                                  {investor.full_name}
                                </Link>
                                <span className="block text-xs text-muted-foreground">
                                  {investor.email} ·{" "}
                                  {investor.investor_type === "institutional"
                                    ? "Entity"
                                    : "Individual"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">{formatPrice(amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ))}
            </TabsContent>
            <TabsContent value="funds" className="mt-4 space-y-3">
              {rosterByFund.map(({ fund, rows }) => (
                <details key={fund.id} className="rounded-lg border">
                  <summary className="cursor-pointer px-4 py-3 font-medium">
                    {fund.codename} · {fund.asset.name}
                    <span className="ml-2 text-sm text-muted-foreground">
                      {rows.length} investors
                    </span>
                  </summary>
                  <div className="divide-y border-t px-4">
                    {rows.map(({ investor, eamFirm, committed }) => (
                      <button
                        key={investor.id}
                        onClick={() => navigate(`/luca/investors/${investor.id}`)}
                        className="flex w-full items-center justify-between gap-4 py-3 text-left text-sm hover:text-primary"
                      >
                        <span className="min-w-0">
                          <span className="font-mono text-xs text-muted-foreground">
                            {codeFor(investor.id)} ·{" "}
                          </span>
                          <span className="font-medium">{investor.full_name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {eamFirm ?? "Direct"} ·{" "}
                            {investor.investor_type === "institutional" ? "Entity" : "Individual"}
                          </span>
                        </span>
                        <span className="shrink-0 font-medium">{formatPrice(committed)}</span>
                      </button>
                    ))}
                  </div>
                </details>
              ))}
            </TabsContent>
          </>
        )}
      </Tabs>
      {reviewing && (
        <OnboardingReviewDialog
          investor={reviewing}
          onClose={() => setReviewing(null)}
          onReviewed={() => queryClient.invalidateQueries({ queryKey: ["admin", "investors"] })}
        />
      )}
    </div>
  );
}
