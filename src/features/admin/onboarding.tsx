import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
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
import { Card, CardContent } from "@/components/ui/card";
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

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
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
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [reviewing, setReviewing] = useState<AdminInvestor | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "investors", "all"],
    queryFn: () => api<InvestorsResponse>("/api/v1/admin/investors"),
  });
  const investors = data?.investors ?? [];
  const summary = data?.summary;

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

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Onboarding</h1>
        <p className="text-muted-foreground">
          Verify new investors, and see who's already accepted into each fund.
        </p>
      </div>

      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryTile label="Awaiting review" value={String(summary.needs_review)} />
          <SummaryTile label="Approved" value={String(summary.approved)} />
          <SummaryTile label="Rejected" value={String(summary.rejected)} />
          <SummaryTile label="Total investors" value={String(summary.total)} />
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <SearchIcon className="absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search investors by name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 pl-11 text-base"
          />
        </div>
        <SearchModeSelect mode="investor" />
      </div>

      {isLoading && <p className="py-12 text-center text-muted-foreground">Loading...</p>}

      {!isLoading && (
        <>
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Pending onboarding</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardContent className="space-y-2 pt-6">
                  <p className="text-sm font-medium text-muted-foreground">
                    Individual · {pendingIndividual.length}
                  </p>
                  {pendingIndividual.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      Nothing pending.
                    </p>
                  ) : (
                    pendingIndividual.map((investor) => (
                      <PendingRow
                        key={investor.id}
                        investor={investor}
                        onOpen={() => setReviewing(investor)}
                      />
                    ))
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="space-y-2 pt-6">
                  <p className="text-sm font-medium text-muted-foreground">
                    Entity · {pendingEntity.length}
                  </p>
                  {pendingEntity.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      Nothing pending.
                    </p>
                  ) : (
                    pendingEntity.map((investor) => (
                      <PendingRow
                        key={investor.id}
                        investor={investor}
                        onOpen={() => setReviewing(investor)}
                      />
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Accepted investors, by fund</h2>
            {rosterByFund.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No accepted investors match yet.
              </p>
            ) : (
              rosterByFund.map(({ fund, rows }) => (
                <Card key={fund.id}>
                  <CardContent className="space-y-2 pt-6">
                    <p className="text-sm font-medium">
                      {fund.codename} · {fund.asset.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {rows.length} investor{rows.length === 1 ? "" : "s"}
                      </span>
                    </p>
                    <div className="divide-y">
                      {rows.map(({ investor, eamFirm, committed }) => (
                        <button
                          key={investor.id}
                          onClick={() => navigate(`/luca/investors/${investor.id}`)}
                          className="flex w-full items-center justify-between gap-4 py-2.5 text-left text-sm first:pt-0 last:pb-0 hover:text-primary"
                        >
                          <span className="truncate font-medium">{investor.full_name}</span>
                          <span className="shrink-0 text-muted-foreground">
                            {eamFirm ?? "Direct"}
                          </span>
                          <span className="shrink-0 text-right font-medium">
                            {formatPrice(committed)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </>
      )}

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
