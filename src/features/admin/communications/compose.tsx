import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Fund } from "@/lib/types";
import type {
  AdminInvestor,
  AdminSubscription,
  Communication,
  CommunicationAudienceType,
  CommunicationRouting,
  DocumentsResponse,
  InvestorsResponse,
  SubscriptionsResponse,
} from "../types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AudienceFilters = {
  verificationStatus: string;
  accreditationStatus: string;
  eamFirm: string;
};

const VERIFICATION_OPTIONS = [
  { value: "all", label: "Any verification status" },
  { value: "pending", label: "Pending" },
  { value: "in_review", label: "In review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const ACCREDITATION_OPTIONS = [
  { value: "all", label: "Any accreditation status" },
  { value: "not_started", label: "Not started" },
  { value: "pending", label: "Pending" },
  { value: "accredited", label: "Accredited" },
  { value: "not_accredited", label: "Not accredited" },
];

function resolveAudience(
  audienceType: CommunicationAudienceType,
  investors: AdminInvestor[],
  individualId: string | null,
  fundSubs: AdminSubscription[],
  filters: AudienceFilters,
): AdminInvestor[] {
  if (audienceType === "individual") {
    return investors.filter((i) => String(i.id) === individualId);
  }
  if (audienceType === "fund") {
    const ids = new Set(fundSubs.map((s) => s.investor_id));
    return investors.filter((i) => ids.has(i.id));
  }
  return investors.filter((i) => {
    if (
      filters.verificationStatus !== "all" &&
      i.verification_status !== filters.verificationStatus
    )
      return false;
    if (
      filters.accreditationStatus !== "all" &&
      i.accreditation_status !== filters.accreditationStatus
    )
      return false;
    if (filters.eamFirm === "direct" && i.eam_firm !== null) return false;
    if (filters.eamFirm !== "all" && filters.eamFirm !== "direct" && i.eam_firm !== filters.eamFirm)
      return false;
    return true;
  });
}

export default function ComposeCommunicationPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"compose" | "confirm">("compose");

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [audienceType, setAudienceType] = useState<CommunicationAudienceType>("fund");
  const [fundId, setFundId] = useState<string | null>(null);
  const [individualId, setIndividualId] = useState<string | null>(null);
  const [investorSearch, setInvestorSearch] = useState("");
  const [attachmentFund, setAttachmentFund] = useState("all");
  const [attachmentSearch, setAttachmentSearch] = useState("");
  const [filters, setFilters] = useState<AudienceFilters>({
    verificationStatus: "all",
    accreditationStatus: "all",
    eamFirm: "all",
  });
  const [attachmentIds, setAttachmentIds] = useState<Set<number>>(new Set());
  const [routing, setRouting] = useState<CommunicationRouting>("direct");
  const [sendTiming, setSendTiming] = useState<"now" | "schedule">("now");
  const [scheduleDate, setScheduleDate] = useState("");

  const { data: investorsData } = useQuery({
    queryKey: ["admin", "investors", "all"],
    queryFn: () => api<InvestorsResponse>("/api/v1/admin/investors"),
  });
  const { data: fundsData } = useQuery({
    queryKey: ["admin", "funds"],
    queryFn: () => api<{ funds: Fund[] }>("/api/v1/funds"),
  });
  const { data: documentsData } = useQuery({
    queryKey: ["admin", "documents", "all"],
    queryFn: () => api<DocumentsResponse>("/api/v1/admin/documents"),
  });
  const { data: fundSubsData } = useQuery({
    queryKey: ["admin", "subscriptions", "by-fund", fundId],
    queryFn: () => api<SubscriptionsResponse>(`/api/v1/admin/subscriptions?fund_id=${fundId}`),
    enabled: audienceType === "fund" && Boolean(fundId),
  });

  const investors = investorsData?.investors ?? [];
  const funds = fundsData?.funds ?? [];
  // Signed subscription agreements are per-investor legal records, not
  // broadcast collateral — exclude them from what a communication can attach.
  const documents = (documentsData?.documents ?? []).filter(
    (d) => d.has_file && d.fund_id !== null && d.subscription_id === null && d.kind !== "agreement",
  );
  const visibleDocuments = documents.filter(
    (d) =>
      (attachmentFund === "all" || String(d.fund_id) === attachmentFund) &&
      `${d.name} ${d.fund_name ?? ""}`.toLowerCase().includes(attachmentSearch.toLowerCase()),
  );
  const fundSubs = fundSubsData?.subscriptions ?? [];
  const eamFirms = useMemo(
    () => [...new Set(investors.map((i) => i.eam_firm).filter((f): f is string => Boolean(f)))],
    [investors],
  );

  const audience = resolveAudience(audienceType, investors, individualId, fundSubs, filters);
  const selectedFund = funds.find((f) => String(f.id) === fundId) ?? null;
  const selectedInvestor = investors.find((i) => String(i.id) === individualId) ?? null;

  const audienceDescription =
    audienceType === "individual"
      ? (selectedInvestor?.full_name ?? "Not yet selected")
      : audienceType === "fund"
        ? selectedFund
          ? `All investors in ${selectedFund.name} (${audience.length} investor${audience.length === 1 ? "" : "s"})`
          : "Select a fund"
        : `Filtered group (${audience.length} investor${audience.length === 1 ? "" : "s"})`;

  const canReview =
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    audience.length > 0 &&
    (sendTiming === "now" || scheduleDate.length > 0);

  const create = useMutation({
    mutationFn: () =>
      api<{ communication: Communication }>("/api/v1/admin/communications", {
        method: "POST",
        body: {
          subject: subject.trim(),
          body: body.trim(),
          audience_type: audienceType,
          audience_description: audienceDescription,
          fund_id: audienceType === "fund" ? (selectedFund?.id ?? null) : null,
          routing,
          attachment_document_ids: Array.from(attachmentIds),
          send_at: sendTiming === "schedule" ? new Date(scheduleDate).toISOString() : null,
          investor_ids: audience.map((i) => i.id),
        },
      }),
    onSuccess: (result) => {
      toast.success(
        result.communication.status === "sent" ? "Communication sent." : "Communication scheduled.",
      );
      navigate(`/luca/communications/${result.communication.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggleAttachment(id: number) {
    setAttachmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-6 space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">New communication</h1>
        <p className="text-muted-foreground">
          Compose an update, choose who receives it, and send it now or on a schedule.
        </p>
      </div>

      {step === "compose" ? (
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-1.5">
                <Label htmlFor="subject">Subject</Label>
                <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="body">Message</Label>
                <Textarea
                  id="body"
                  rows={8}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Plain text or Markdown — investors will see it rendered."
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 pt-6">
              <p className="text-sm font-medium">Audience</p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { value: "fund", label: "By fund" },
                    { value: "individual", label: "Individual investor" },
                    { value: "filtered_group", label: "Filtered group" },
                    { value: "eam", label: "By EAM" },
                  ] as const
                ).map((opt) => (
                  <Button
                    key={opt.value}
                    size="sm"
                    variant={audienceType === opt.value ? "secondary" : "outline"}
                    onClick={() => {
                      if (opt.value === "eam") {
                        setAudienceType("filtered_group");
                        setFilters((current) => ({ ...current, eamFirm: eamFirms[0] ?? "all" }));
                      } else setAudienceType(opt.value);
                    }}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>

              {audienceType === "fund" && (
                <Select value={fundId ?? undefined} onValueChange={setFundId}>
                  <SelectTrigger className="w-full sm:w-80">
                    <SelectValue placeholder="Select a fund…" />
                  </SelectTrigger>
                  <SelectContent>
                    {funds.map((f) => (
                      <SelectItem key={f.id} value={String(f.id)}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {audienceType === "individual" && (
                <Select value={individualId ?? undefined} onValueChange={setIndividualId}>
                  <SelectTrigger className="w-full sm:w-80">
                    <SelectValue placeholder="Select an investor…" />
                  </SelectTrigger>
                  <SelectContent>
                    {investors
                      .filter((i) =>
                        `${i.full_name} ${i.email}`
                          .toLowerCase()
                          .includes(investorSearch.toLowerCase()),
                      )
                      .map((i) => (
                        <SelectItem key={i.id} value={String(i.id)}>
                          {i.full_name} · {i.email}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}

              {audienceType === "individual" && (
                <Input
                  aria-label="Search recipients"
                  placeholder="Search recipient name or email"
                  value={investorSearch}
                  onChange={(event) => setInvestorSearch(event.target.value)}
                  className="sm:max-w-80"
                />
              )}

              {audienceType === "filtered_group" && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Select
                    value={filters.verificationStatus}
                    onValueChange={(v) =>
                      setFilters((f) => ({ ...f, verificationStatus: v ?? "all" }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VERIFICATION_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={filters.accreditationStatus}
                    onValueChange={(v) =>
                      setFilters((f) => ({ ...f, accreditationStatus: v ?? "all" }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCREDITATION_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={filters.eamFirm}
                    onValueChange={(v) => setFilters((f) => ({ ...f, eamFirm: v ?? "all" }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any adviser</SelectItem>
                      <SelectItem value="direct">Direct (no adviser)</SelectItem>
                      {eamFirms.map((firm) => (
                        <SelectItem key={firm} value={firm}>
                          {firm}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="rounded-lg border border-dashed p-3 text-sm">
                <p className="font-medium">{audienceDescription}</p>
                {audience.length > 0 && (
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {audience
                      .slice(0, 6)
                      .map((i) => i.full_name)
                      .join(", ")}
                    {audience.length > 6 ? ` and ${audience.length - 6} more` : ""}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 !py-3">
              <p className="text-sm font-medium">Attachments</p>
              <div className="flex flex-wrap gap-2">
                <Select
                  value={attachmentFund}
                  onValueChange={(value) => {
                    setAttachmentFund(value ?? "all");
                    setAttachmentIds(new Set());
                  }}
                >
                  <SelectTrigger className="w-full sm:w-64">
                    <SelectValue placeholder="Select deal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All deals</SelectItem>
                    {funds.map((fund) => (
                      <SelectItem key={fund.id} value={String(fund.id)}>
                        {fund.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  aria-label="Search deal documents"
                  placeholder="Search deal documents"
                  value={attachmentSearch}
                  onChange={(event) => setAttachmentSearch(event.target.value)}
                  className="sm:max-w-64"
                />
              </div>
              {documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No shareable deal documents on file.
                </p>
              ) : (
                <div className="max-h-40 space-y-2 overflow-y-auto">
                  {visibleDocuments.map((doc) => (
                    <label key={doc.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={attachmentIds.has(doc.id)}
                        onChange={() => toggleAttachment(doc.id)}
                      />
                      <span className="truncate">{doc.name}</span>
                      {doc.fund_name && (
                        <span className="truncate text-xs text-muted-foreground">
                          {doc.fund_name}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 !py-3">
              <p className="text-sm font-medium">Routing</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={routing === "direct" ? "secondary" : "outline"}
                  onClick={() => setRouting("direct")}
                >
                  Direct to investor
                </Button>
                <Button
                  size="sm"
                  variant={routing === "through_rm" ? "secondary" : "outline"}
                  onClick={() => setRouting("through_rm")}
                >
                  Through RM where applicable
                </Button>
              </div>

              <Separator />

              <p className="text-sm font-medium">Send timing</p>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  variant={sendTiming === "now" ? "secondary" : "outline"}
                  onClick={() => setSendTiming("now")}
                >
                  Send now
                </Button>
                <Button
                  size="sm"
                  variant={sendTiming === "schedule" ? "secondary" : "outline"}
                  onClick={() => setSendTiming("schedule")}
                >
                  Schedule
                </Button>
                {sendTiming === "schedule" && (
                  <Input
                    type="datetime-local"
                    className="w-auto"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                  />
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button disabled={!canReview} onClick={() => setStep("confirm")}>
              Review
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-3 pt-6 text-sm">
              <Row label="Subject" value={subject} />
              <Row label="Audience" value={audienceDescription} />
              <Row
                label="Routing"
                value={routing === "direct" ? "Direct to investor" : "Through RM where applicable"}
              />
              <Row
                label="Timing"
                value={
                  sendTiming === "now"
                    ? "Send immediately"
                    : `Scheduled for ${new Date(scheduleDate).toLocaleString()}`
                }
              />
              <Row label="Attachments" value={String(attachmentIds.size)} />
              <Separator />
              <div>
                <p className="mb-1 text-muted-foreground">Message</p>
                <p className="whitespace-pre-line">{body}</p>
              </div>
              <Separator />
              <div>
                <p className="mb-1 text-muted-foreground">Recipients ({audience.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {audience.map((i) => (
                    <Badge key={i.id} variant="outline" className="text-[10px]">
                      {i.full_name}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("compose")}>
              Back to edit
            </Button>
            <Button disabled={create.isPending} onClick={() => create.mutate()}>
              {sendTiming === "now" ? "Send" : "Schedule"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right font-medium">{value}</span>
    </div>
  );
}
