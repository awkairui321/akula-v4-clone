import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckIcon, XIcon } from "lucide-react";
import { api } from "@/lib/api";
import { stageOfStatus } from "@/lib/types";
import type { Fund } from "@/lib/types";
import {
  DOCUMENT_REQUEST_KINDS,
  REQUEST_PRESETS,
  documentKindLabel,
} from "@/lib/document-catalogue";
import type {
  AdminInvestor,
  AdminSubscription,
  Communication,
  CommunicationAudienceType,
  CommunicationRouting,
  DocumentRequestRow,
  DocumentsResponse,
  InvestorsResponse,
  PartnersResponse,
  SubscriptionsResponse,
} from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/* ─── 1. Who ─── */

type AudienceKind = "deal" | "investor" | "partner" | "action" | "custom";

const AUDIENCE_KINDS: { key: AudienceKind; title: string; hint: string }[] = [
  { key: "deal", title: "Everyone in a deal", hint: "Every investor with a subscription in it." },
  { key: "investor", title: "One investor", hint: "A single client." },
  { key: "partner", title: "A partner’s clients", hint: "All clients of one adviser firm." },
  {
    key: "action",
    title: "Investors who need to act",
    hint: "Unsigned, unfunded, expiring or overdue.",
  },
  {
    key: "custom",
    title: "Custom group",
    hint: "Filter by verification, accreditation or adviser.",
  },
];

const ACTION_GROUPS: { key: string; title: string; suggestPurpose: PurposeKey }[] = [
  {
    key: "signature",
    title: "Haven’t signed their subscription form",
    suggestPurpose: "remind_sign",
  },
  {
    key: "transfer",
    title: "Approved but haven’t transferred funds",
    suggestPurpose: "remind_fund",
  },
  { key: "info", title: "Have an open information request", suggestPurpose: "request" },
  { key: "onboarding", title: "Haven’t finished onboarding", suggestPurpose: "request" },
  { key: "expiring", title: "Accreditation expires within 30 days", suggestPurpose: "request" },
  { key: "overdue", title: "Have overdue document requests", suggestPurpose: "request" },
];

type Filters = { verification: string; accreditation: string; firm: string };
const NO_FILTERS: Filters = { verification: "all", accreditation: "all", firm: "all" };

/* ─── 2. Why ─── */

type PurposeKey =
  | "announce"
  | "deal_update"
  | "remind_sign"
  | "remind_fund"
  | "request"
  | "general";

const PURPOSES: { key: PurposeKey; title: string; hint: string }[] = [
  {
    key: "request",
    title: "Request documents",
    hint: "Ask clients for KYC, eligibility or entity papers.",
  },
  {
    key: "remind_sign",
    title: "Remind to sign",
    hint: "Nudge a subscription form that is still unsigned.",
  },
  {
    key: "remind_fund",
    title: "Remind to transfer funds",
    hint: "Chase an approved subscription for payment.",
  },
  { key: "deal_update", title: "Deal update", hint: "News on a deal the client is invested in." },
  {
    key: "announce",
    title: "Announce a new opportunity",
    hint: "Introduce a deal to eligible investors.",
  },
  { key: "general", title: "General message", hint: "Anything else." },
];

const STEPS = ["Audience", "Purpose", "Message", "Review"] as const;

function dateInDays(days: number) {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const formatLong = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

function templateFor(
  purpose: PurposeKey,
  ctx: { deal: string | null; docs: string[]; due: string },
): { subject: string; body: string } {
  const deal = ctx.deal ?? "your investment";
  switch (purpose) {
    case "request":
      return {
        subject: "Documents we need from you",
        body: `Hello,\n\nTo keep your account in good standing, we need the following by ${formatLong(ctx.due)}:\n\n${ctx.docs.map((d) => `- ${d}`).join("\n") || "- (choose the documents above)"}\n\nYou can upload each one from the Documents page in your portal. If anything is unclear, reply to this message and we will help.\n\nThank you,\nLUCA SGP`,
      };
    case "remind_sign":
      return {
        subject: `Please sign your subscription form for ${deal}`,
        body: `Hello,\n\nYour subscription for ${deal} is waiting for your signature. Places are limited and the offer closes soon, so please sign from your portal when you can.\n\nThank you,\nLUCA SGP`,
      };
    case "remind_fund":
      return {
        subject: `Funding instructions for ${deal}`,
        body: `Hello,\n\nYour subscription for ${deal} has been approved. Please transfer the funds using the instructions in your portal so we can verify them and issue your holding.\n\nThank you,\nLUCA SGP`,
      };
    case "deal_update":
      return {
        subject: `Update on ${deal}`,
        body: `Hello,\n\nHere is the latest on ${deal}:\n\n- \n\nWe will keep you informed of any further developments.\n\nThank you,\nLUCA SGP`,
      };
    case "announce":
      return {
        subject: `New opportunity: ${deal}`,
        body: `Hello,\n\nWe have opened a new opportunity, ${deal}. You can review the materials and subscribe from your portal.\n\nThank you,\nLUCA SGP`,
      };
    default:
      return { subject: "", body: "" };
  }
}

export default function ComposeCommunicationPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();

  // Links from other pages arrive with the audience and/or purpose already chosen.
  const [paramKind, paramValue] = (params.get("audience") ?? "").split(":");
  const initialKind: AudienceKind =
    paramKind === "investor"
      ? "investor"
      : paramKind === "partner"
        ? "partner"
        : paramKind === "deal"
          ? "deal"
          : paramKind === "group"
            ? "action"
            : "deal";
  const initialPurpose = (params.get("purpose") as PurposeKey | null) ?? null;
  const initialDocs = (params.get("docs") ?? "").split(",").filter(Boolean);

  const [step, setStep] = useState(paramKind ? 1 : 0);

  const [kind, setKind] = useState<AudienceKind>(initialKind);
  const [dealId, setDealId] = useState<string | null>(paramKind === "deal" ? paramValue : null);
  const [investorId, setInvestorId] = useState<string | null>(
    paramKind === "investor" ? paramValue : null,
  );
  const [firm, setFirm] = useState<string | null>(
    paramKind === "partner" ? decodeURIComponent(paramValue ?? "") : null,
  );
  const [group, setGroup] = useState<string | null>(paramKind === "group" ? paramValue : null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [excluded, setExcluded] = useState<number[]>([]);
  const [investorSearch, setInvestorSearch] = useState("");

  const [purpose, setPurpose] = useState<PurposeKey | null>(initialPurpose);
  const [docKinds, setDocKinds] = useState<string[]>(initialDocs);
  const [dueDate, setDueDate] = useState(dateInDays(7));
  const [showEntityDocs, setShowEntityDocs] = useState(false);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [edited, setEdited] = useState(false);
  const [attachmentIds, setAttachmentIds] = useState<number[]>([]);
  const [routing, setRouting] = useState<CommunicationRouting>("direct");
  const [timing, setTiming] = useState<"now" | "schedule">("now");
  const [scheduleDate, setScheduleDate] = useState("");

  const { data: investorsData } = useQuery({
    queryKey: ["admin", "investors", "all"],
    queryFn: () => api<InvestorsResponse>("/api/v1/admin/investors"),
  });
  const { data: fundsData } = useQuery({
    queryKey: ["admin", "funds"],
    queryFn: () => api<{ funds: Fund[] }>("/api/v1/funds"),
  });
  const { data: subsData } = useQuery({
    queryKey: ["admin", "subscriptions", "board"],
    queryFn: () => api<SubscriptionsResponse>("/api/v1/admin/subscriptions"),
  });
  const { data: partnersData } = useQuery({
    queryKey: ["admin", "partners", ""],
    queryFn: () => api<PartnersResponse>("/api/v1/admin/partners"),
  });
  const { data: requestsData } = useQuery({
    queryKey: ["admin", "document-requests"],
    queryFn: () => api<{ requests: DocumentRequestRow[] }>("/api/v1/admin/document_requests"),
  });
  const { data: documentsData } = useQuery({
    queryKey: ["admin", "documents", "all"],
    queryFn: () => api<DocumentsResponse>("/api/v1/admin/documents"),
  });

  const investors = useMemo(() => investorsData?.investors ?? [], [investorsData]);
  const funds = fundsData?.funds ?? [];
  const subs = useMemo(() => subsData?.subscriptions ?? [], [subsData]);
  const firms = (partnersData?.partners ?? []).map((p) => p.firm_name);
  const openRequests = useMemo(
    () => (requestsData?.requests ?? []).filter((r) => r.status === "requested"),
    [requestsData],
  );

  /* ─── Who is in the audience ─── */
  const recipients = useMemo<AdminInvestor[]>(() => {
    const byId = (ids: Iterable<number>) => {
      const set = new Set(ids);
      return investors.filter((i) => set.has(i.id));
    };
    const stageSubs = (stageKey: string): AdminSubscription[] =>
      subs.filter((s) => stageOfStatus(s.status)?.key === stageKey);
    switch (kind) {
      case "deal":
        return dealId
          ? byId(subs.filter((s) => String(s.fund_id) === dealId).map((s) => s.investor_id))
          : [];
      case "investor":
        return investors.filter((i) => String(i.id) === investorId);
      case "partner":
        return firm ? investors.filter((i) => i.eam_firm === firm) : [];
      case "action":
        switch (group) {
          case "signature":
            return byId(stageSubs("signature").map((s) => s.investor_id));
          case "transfer":
            return byId(stageSubs("transfer").map((s) => s.investor_id));
          case "info":
            return byId(
              subs.filter((s) => s.status === "information_requested").map((s) => s.investor_id),
            );
          case "onboarding":
            return investors.filter((i) =>
              ["pending", "in_review"].includes(i.verification_status),
            );
          case "expiring":
            return investors.filter(
              (i) =>
                i.accreditation_expiry &&
                new Date(i.accreditation_expiry).getTime() - Date.now() <= 30 * 86_400_000,
            );
          case "overdue":
            return byId(
              openRequests
                .filter((r) => r.due_at && new Date(r.due_at).getTime() < Date.now())
                .map((r) => r.investor_id),
            );
          default:
            return [];
        }
      default:
        return investors.filter(
          (i) =>
            (filters.verification === "all" || i.verification_status === filters.verification) &&
            (filters.accreditation === "all" || i.accreditation_status === filters.accreditation) &&
            (filters.firm === "all" ||
              (filters.firm === "direct" ? !i.eam_firm : i.eam_firm === filters.firm)),
        );
    }
  }, [kind, dealId, investorId, firm, group, filters, investors, subs, openRequests]);

  const audience = recipients.filter((i) => !excluded.includes(i.id));
  const deal = funds.find((f) => String(f.id) === dealId) ?? null;
  const dealName = deal?.asset.name ?? null;

  const audienceLabel = (() => {
    const n = `${audience.length} investor${audience.length === 1 ? "" : "s"}`;
    if (kind === "deal") return deal ? `Everyone in ${deal.name} (${n})` : "Choose a deal";
    if (kind === "investor") return audience[0]?.full_name ?? "Choose an investor";
    if (kind === "partner") return firm ? `Clients of ${firm} (${n})` : "Choose a partner";
    if (kind === "action")
      return group
        ? `${ACTION_GROUPS.find((g) => g.key === group)?.title} (${n})`
        : "Choose a group";
    return `Custom group (${n})`;
  })();
  const apiAudienceType: CommunicationAudienceType =
    kind === "deal" ? "fund" : kind === "investor" ? "individual" : "filtered_group";

  /* ─── Why: pick a purpose and seed the message ─── */
  const suggested: PurposeKey | null =
    kind === "action"
      ? (ACTION_GROUPS.find((g) => g.key === group)?.suggestPurpose ?? null)
      : kind === "deal"
        ? "deal_update"
        : null;

  function choosePurpose(next: PurposeKey, docs: string[] = docKinds) {
    setPurpose(next);
    if (next === "request" && docs.length === 0) {
      // A sensible default: entities need entity papers, everyone else standard onboarding.
      const entity =
        audience.length > 0 && audience.every((i) => i.investor_type === "institutional");
      const preset = REQUEST_PRESETS.find((p) => p.key === (entity ? "entity" : "onboarding"))!;
      setDocKinds(preset.kinds);
      docs = preset.kinds;
    }
    if (!edited) {
      const tpl = templateFor(next, {
        deal: dealName,
        docs: docs.map(documentKindLabel),
        due: dueDate,
      });
      setSubject(tpl.subject);
      setBody(tpl.body);
    }
  }

  function toggleDoc(key: string) {
    const next = docKinds.includes(key) ? docKinds.filter((k) => k !== key) : [...docKinds, key];
    setDocKinds(next);
    if (!edited && purpose === "request") {
      const tpl = templateFor("request", {
        deal: dealName,
        docs: next.map(documentKindLabel),
        due: dueDate,
      });
      setSubject(tpl.subject);
      setBody(tpl.body);
    }
  }

  /* ─── Send ─── */
  const documents = (documentsData?.documents ?? []).filter(
    (d) => d.has_file && d.fund_id !== null && d.subscription_id === null && d.kind !== "agreement",
  );

  const send = useMutation({
    mutationFn: async () => {
      const result = await api<{ communication: Communication }>("/api/v1/admin/communications", {
        method: "POST",
        body: {
          subject: subject.trim(),
          body: body.trim(),
          audience_type: apiAudienceType,
          audience_description: audienceLabel,
          fund_id: kind === "deal" ? (deal?.id ?? null) : null,
          routing,
          attachment_document_ids: attachmentIds,
          send_at: timing === "schedule" ? new Date(scheduleDate).toISOString() : null,
          investor_ids: audience.map((i) => i.id),
        },
      });
      if (purpose === "request" && docKinds.length > 0) {
        await api("/api/v1/admin/document_requests", {
          method: "POST",
          body: {
            investor_ids: audience.map((i) => i.id),
            kinds: docKinds,
            due_at: new Date(`${dueDate}T23:59:00`).toISOString(),
            fund_id: kind === "deal" ? (deal?.id ?? null) : null,
          },
        });
      }
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "document-requests"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "communications"] });
      toast.success(
        result.communication.status === "sent"
          ? purpose === "request"
            ? "Message sent and documents requested."
            : "Communication sent."
          : "Communication scheduled.",
      );
      navigate(`/luca/communications/${result.communication.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /* ─── Step gating ─── */
  const audienceReady = audience.length > 0;
  const purposeReady = purpose !== null && (purpose !== "request" || docKinds.length > 0);
  const messageReady = subject.trim() !== "" && body.trim() !== "";
  const timingReady = timing === "now" || scheduleDate !== "";
  const canContinue = [audienceReady, purposeReady, messageReady, timingReady][step];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">New communication</h1>
        <p className="text-muted-foreground">
          Start with who it is for, then why, then the message.
        </p>
      </div>

      {/* Progress */}
      <ol className="flex flex-wrap gap-x-6 gap-y-2 border-b pb-3 text-sm">
        {STEPS.map((label, i) => {
          const done = i < step;
          return (
            <li key={label}>
              <button
                type="button"
                disabled={i > step}
                onClick={() => setStep(i)}
                className={`flex items-center gap-2 ${
                  i === step
                    ? "font-medium text-foreground"
                    : done
                      ? "text-foreground hover:underline"
                      : "text-muted-foreground"
                }`}
              >
                <span
                  className={`flex size-5 items-center justify-center rounded-full text-xs ${
                    i === step
                      ? "bg-primary text-primary-foreground"
                      : done
                        ? "bg-primary/15 text-primary"
                        : "bg-muted"
                  }`}
                >
                  {done ? <CheckIcon className="size-3" /> : i + 1}
                </span>
                {label}
              </button>
            </li>
          );
        })}
      </ol>

      {/* 1. Audience */}
      {step === 0 && (
        <section className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Who is this for?</h2>
            <p className="text-sm text-muted-foreground">
              Pick the group first. The next steps suggest the right message for them.
            </p>
          </div>
          <ul className="divide-y border-y">
            {AUDIENCE_KINDS.map((a) => (
              <li key={a.key} className="py-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="radio"
                    name="audience"
                    className="mt-1"
                    checked={kind === a.key}
                    onChange={() => {
                      setKind(a.key);
                      setExcluded([]);
                    }}
                  />
                  <span>
                    <span className="block text-sm font-medium">{a.title}</span>
                    <span className="block text-xs text-muted-foreground">{a.hint}</span>
                  </span>
                </label>

                {kind === a.key && (
                  <div className="mt-3 pl-7">
                    {a.key === "deal" && (
                      <Select value={dealId ?? ""} onValueChange={(v) => setDealId(v as string)}>
                        <SelectTrigger className="w-full sm:w-80">
                          <SelectValue>
                            {funds.find((f) => String(f.id) === dealId)?.name ?? "Choose a deal…"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {funds
                            .filter((f) => f.state !== "draft")
                            .map((f) => (
                              <SelectItem key={f.id} value={String(f.id)}>
                                {f.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                    {a.key === "investor" && (
                      <div className="space-y-2">
                        <Input
                          aria-label="Search investors"
                          placeholder="Search by name or email"
                          value={investorSearch}
                          onChange={(e) => setInvestorSearch(e.target.value)}
                          className="sm:max-w-80"
                        />
                        <Select
                          value={investorId ?? ""}
                          onValueChange={(v) => setInvestorId(v as string)}
                        >
                          <SelectTrigger className="w-full sm:w-80">
                            <SelectValue>
                              {investors.find((i) => String(i.id) === investorId)?.full_name ??
                                "Choose an investor…"}
                            </SelectValue>
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
                                  {i.full_name} · {i.client_code}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {a.key === "partner" && (
                      <Select value={firm ?? ""} onValueChange={(v) => setFirm(v as string)}>
                        <SelectTrigger className="w-full sm:w-80">
                          <SelectValue>{firm ?? "Choose a partner…"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {firms.map((f) => (
                            <SelectItem key={f} value={f}>
                              {f}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {a.key === "action" && (
                      <Select value={group ?? ""} onValueChange={(v) => setGroup(v as string)}>
                        <SelectTrigger className="w-full sm:w-96">
                          <SelectValue>
                            {ACTION_GROUPS.find((g) => g.key === group)?.title ?? "Choose a group…"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {ACTION_GROUPS.map((g) => (
                            <SelectItem key={g.key} value={g.key}>
                              {g.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {a.key === "custom" && (
                      <div className="grid gap-3 sm:grid-cols-3">
                        <FilterSelect
                          value={filters.verification}
                          onChange={(v) => setFilters((f) => ({ ...f, verification: v }))}
                          options={[
                            ["all", "Any verification"],
                            ["pending", "Pending"],
                            ["in_review", "In review"],
                            ["approved", "Approved"],
                            ["rejected", "Rejected"],
                          ]}
                        />
                        <FilterSelect
                          value={filters.accreditation}
                          onChange={(v) => setFilters((f) => ({ ...f, accreditation: v }))}
                          options={[
                            ["all", "Any accreditation"],
                            ["not_started", "Not started"],
                            ["pending", "Pending"],
                            ["accredited", "Accredited"],
                            ["not_accredited", "Not accredited"],
                          ]}
                        />
                        <FilterSelect
                          value={filters.firm}
                          onChange={(v) => setFilters((f) => ({ ...f, firm: v }))}
                          options={[
                            ["all", "Any adviser"],
                            ["direct", "Direct (no adviser)"],
                            ...firms.map((f): [string, string] => [f, f]),
                          ]}
                        />
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>

          {/* Who exactly */}
          <div>
            <p className="text-sm font-medium">{audienceLabel}</p>
            {recipients.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {recipients.map((i) => {
                  const out = excluded.includes(i.id);
                  return (
                    <li
                      key={i.id}
                      className={`flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-3 text-xs ${
                        out ? "text-muted-foreground line-through" : "bg-muted/50"
                      }`}
                    >
                      {i.full_name}
                      <button
                        type="button"
                        aria-label={out ? `Include ${i.full_name}` : `Exclude ${i.full_name}`}
                        onClick={() =>
                          setExcluded((prev) =>
                            out ? prev.filter((id) => id !== i.id) : [...prev, i.id],
                          )
                        }
                        className="rounded-full p-0.5 hover:bg-background"
                      >
                        {out ? <CheckIcon className="size-3" /> : <XIcon className="size-3" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">No one matches yet.</p>
            )}
          </div>
        </section>
      )}

      {/* 2. Purpose */}
      {step === 1 && (
        <section className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">What do you need from them?</h2>
            <p className="text-sm text-muted-foreground">
              Sending to: {audienceLabel}. Choosing a purpose fills in a message you can edit.
            </p>
          </div>
          <ul className="divide-y border-y">
            {PURPOSES.map((p) => (
              <li key={p.key} className="py-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="radio"
                    name="purpose"
                    className="mt-1"
                    checked={purpose === p.key}
                    onChange={() => choosePurpose(p.key)}
                  />
                  <span className="flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {p.title}
                      {suggested === p.key && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          Suggested
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-muted-foreground">{p.hint}</span>
                  </span>
                </label>

                {p.key === "request" && purpose === "request" && (
                  <div className="mt-4 space-y-4 pl-7">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">Quick sets:</span>
                      {REQUEST_PRESETS.map((preset) => (
                        <Button
                          key={preset.key}
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setDocKinds(preset.kinds);
                            if (!edited) {
                              const tpl = templateFor("request", {
                                deal: dealName,
                                docs: preset.kinds.map(documentKindLabel),
                                due: dueDate,
                              });
                              setSubject(tpl.subject);
                              setBody(tpl.body);
                            }
                          }}
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                    {(
                      [
                        "Identity",
                        "Eligibility",
                        "Source of funds",
                        "Tax",
                        "Payments",
                        "Entity",
                      ] as const
                    )
                      .filter(
                        (group) =>
                          group !== "Entity" ||
                          showEntityDocs ||
                          audience.some((i) => i.investor_type === "institutional") ||
                          docKinds.some(
                            (k) =>
                              DOCUMENT_REQUEST_KINDS.find((d) => d.key === k)?.group === "Entity",
                          ),
                      )
                      .map((group) => (
                        <div key={group}>
                          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            {group}
                          </p>
                          <ul className="mt-1 space-y-1.5">
                            {DOCUMENT_REQUEST_KINDS.filter((k) => k.group === group).map((k) => (
                              <li key={k.key}>
                                <label className="flex cursor-pointer items-start gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    className="mt-1"
                                    checked={docKinds.includes(k.key)}
                                    onChange={() => toggleDoc(k.key)}
                                  />
                                  <span>
                                    {k.label}
                                    <span className="block text-xs text-muted-foreground">
                                      {k.reason}
                                    </span>
                                  </span>
                                </label>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    {!showEntityDocs &&
                      !audience.some((i) => i.investor_type === "institutional") && (
                        <button
                          type="button"
                          onClick={() => setShowEntityDocs(true)}
                          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                        >
                          Show entity and trust documents
                        </button>
                      )}
                    <div className="space-y-1.5">
                      <Label htmlFor="due-date" className="text-xs">
                        Please provide by
                      </Label>
                      <Input
                        id="due-date"
                        type="date"
                        value={dueDate}
                        min={dateInDays(0)}
                        onChange={(e) => {
                          setDueDate(e.target.value);
                          if (!edited && purpose === "request") {
                            const tpl = templateFor("request", {
                              deal: dealName,
                              docs: docKinds.map(documentKindLabel),
                              due: e.target.value,
                            });
                            setSubject(tpl.subject);
                            setBody(tpl.body);
                          }
                        }}
                        className="w-44"
                      />
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 3. Message */}
      {step === 2 && (
        <section className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Write the message</h2>
            <p className="text-sm text-muted-foreground">
              {purpose === "request"
                ? "Each client will also see these documents listed under Documents in their portal, with an upload button."
                : "Edit the suggested text or write your own."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setEdited(true);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="body">Message</Label>
            <Textarea
              id="body"
              rows={10}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setEdited(true);
              }}
              placeholder="Plain text or Markdown. Investors will see it rendered."
            />
          </div>

          {documents.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Attach deal documents (optional)</p>
              <ul className="max-h-44 space-y-1.5 overflow-y-auto">
                {documents.map((d) => (
                  <li key={d.id}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={attachmentIds.includes(d.id)}
                        onChange={() =>
                          setAttachmentIds((prev) =>
                            prev.includes(d.id)
                              ? prev.filter((id) => id !== d.id)
                              : [...prev, d.id],
                          )
                        }
                      />
                      <span className="truncate">{d.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium">How should it be delivered?</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={routing === "direct" ? "secondary" : "outline"}
                onClick={() => setRouting("direct")}
              >
                Direct to the investor
              </Button>
              <Button
                size="sm"
                variant={routing === "through_rm" ? "secondary" : "outline"}
                onClick={() => setRouting("through_rm")}
              >
                Through their adviser where there is one
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* 4. Review */}
      {step === 3 && (
        <section className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Review and send</h2>
            <p className="text-sm text-muted-foreground">
              Check the details, then choose when to send.
            </p>
          </div>
          <dl className="divide-y border-y text-sm">
            <ReviewRow label="To" value={audienceLabel} />
            <ReviewRow
              label="Purpose"
              value={PURPOSES.find((p) => p.key === purpose)?.title ?? "—"}
            />
            {purpose === "request" && (
              <ReviewRow
                label="Documents requested"
                value={`${docKinds.map(documentKindLabel).join(", ")} · by ${formatLong(dueDate)}`}
              />
            )}
            <ReviewRow
              label="Delivery"
              value={
                routing === "direct"
                  ? "Direct to the investor"
                  : "Through their adviser where there is one"
              }
            />
            <ReviewRow label="Attachments" value={String(attachmentIds.length)} />
            <ReviewRow label="Subject" value={subject} />
          </dl>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Message</p>
            <p className="rounded-md bg-muted/40 p-4 text-sm whitespace-pre-line">{body}</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">When should it go?</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={timing === "now" ? "secondary" : "outline"}
                onClick={() => setTiming("now")}
              >
                Send now
              </Button>
              <Button
                size="sm"
                variant={timing === "schedule" ? "secondary" : "outline"}
                onClick={() => setTiming("schedule")}
              >
                Schedule
              </Button>
              {timing === "schedule" && (
                <Input
                  type="datetime-local"
                  className="w-auto"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                />
              )}
            </div>
          </div>
        </section>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between border-t pt-5">
        <Button
          variant="ghost"
          onClick={() => (step === 0 ? navigate("/luca/communications") : setStep(step - 1))}
        >
          {step === 0 ? "Cancel" : "Back"}
        </Button>
        {step < 3 ? (
          <Button disabled={!canContinue} onClick={() => setStep(step + 1)}>
            Continue
          </Button>
        ) : (
          <Button disabled={!canContinue || send.isPending} onClick={() => send.mutate()}>
            {send.isPending
              ? "Sending..."
              : timing === "now"
                ? `Send to ${audience.length} investor${audience.length === 1 ? "" : "s"}`
                : "Schedule"}
          </Button>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as string)}>
      <SelectTrigger className="w-full">
        <SelectValue>{options.find(([key]) => key === value)?.[1]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map(([key, label]) => (
          <SelectItem key={key} value={key}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6 py-2.5">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
