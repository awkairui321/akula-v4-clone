import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeftIcon, CheckIcon, ExternalLinkIcon, XIcon } from "lucide-react";
import { api } from "@/lib/api";
import { DOCUMENT_REQUEST_KINDS, documentKindLabel } from "@/lib/document-catalogue";
import type { ReviewBundle, ReviewDecision, ReviewDocument } from "@/lib/client-onboarding";
import { ClientTimeline } from "./investors/investor-detail";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

const SECTION = "text-xs font-medium tracking-wide text-muted-foreground uppercase";
const dateText = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "—";

type Identity = "verified" | "failed";
type Accreditation = "accredited" | "not_accredited";

/** Open a stored file in a new tab. Data URLs cannot be navigated to directly, so go through a blob. */
async function openFile(dataUrl: string) {
  const blob = await (await fetch(dataUrl)).blob();
  window.open(URL.createObjectURL(blob), "_blank", "noopener");
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-6 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value || "Not provided"}</dd>
    </div>
  );
}

function Documents({
  title,
  empty,
  docs,
  selected,
  onSelect,
}: {
  title: string;
  empty: string;
  docs: ReviewDocument[];
  selected: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="space-y-2">
      <h3 className={SECTION}>{title}</h3>
      {docs.length === 0 ? (
        <p className="border-y py-4 text-sm text-amber-700">{empty}</p>
      ) : (
        <ul className="divide-y border-y">
          {docs.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onSelect(d.id)}
                aria-pressed={selected === d.id}
                className={`flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-left text-sm hover:bg-muted/40 ${selected === d.id ? "bg-muted/50" : ""}`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{documentKindLabel(d.kind)}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {d.name} ·{" "}
                    {d.uploaded_by
                      ? `${d.uploaded_by.role === "rm" ? "Uploaded by their RM" : "Uploaded by the client"}, ${d.uploaded_by.name}`
                      : "Uploaded"}{" "}
                    · {dateText(d.created_at)}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {d.confirmed_at
                    ? `Confirmed by the client ${dateText(d.confirmed_at)}`
                    : d.uploaded_by?.role === "rm"
                      ? "Not yet confirmed by the client"
                      : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Preview({ doc }: { doc: ReviewDocument | undefined }) {
  if (!doc)
    return (
      <div className="flex min-h-32 items-center justify-center border px-6 text-center text-sm text-muted-foreground">
        Select a document to read it here.
      </div>
    );
  const url = doc.file_data_url;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-medium">{doc.name}</p>
        {url && (
          <Button size="sm" variant="outline" onClick={() => openFile(url)}>
            <ExternalLinkIcon className="size-3.5" />
            Open in a new tab
          </Button>
        )}
      </div>
      {!url ? (
        <div className="flex min-h-32 items-center justify-center border px-6 text-center text-sm text-muted-foreground">
          This is a record without an attached file. Ask the client or their RM to upload the
          document before you rely on it.
        </div>
      ) : url.startsWith("data:image") ? (
        <img src={url} alt={doc.name} className="max-h-96 w-full border object-contain" />
      ) : (
        <object data={url} type="application/pdf" className="h-[32rem] w-full border">
          <p className="p-4 text-sm text-muted-foreground">
            This file cannot be shown here. Open it in a new tab.
          </p>
        </object>
      )}
    </div>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  options: { key: T; label: string; tone: "good" | "bad" }[];
  onChange: (value: T | null) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-sm font-medium">{label}</span>
      {options.map((o) => {
        const on = value === o.key;
        return (
          <Button
            key={o.key}
            type="button"
            size="sm"
            role="radio"
            aria-checked={on}
            variant={on ? "secondary" : "outline"}
            className={on ? (o.tone === "good" ? "text-emerald-700" : "text-destructive") : ""}
            onClick={() => onChange(on ? null : o.key)}
          >
            {on &&
              (o.tone === "good" ? (
                <CheckIcon className="size-3.5" />
              ) : (
                <XIcon className="size-3.5" />
              ))}
            {o.label}
          </Button>
        );
      })}
    </div>
  );
}

/** The Fund Manager's review of one client: read what they sent, verify, then decide. */
export default function ClientReviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [accreditation, setAccreditation] = useState<Accreditation | null>(null);
  const [expires, setExpires] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [dialog, setDialog] = useState<"request_info" | "decline" | null>(null);
  const [note, setNote] = useState("");
  const [kinds, setKinds] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["clients", Number(id), "review"],
    queryFn: () => api<ReviewBundle>(`/api/v1/admin/investors/${id}/review`),
    enabled: Boolean(id),
  });

  const decide = useMutation({
    mutationFn: (decision: ReviewDecision) =>
      api<ReviewBundle>(`/api/v1/admin/investors/${id}/review`, {
        method: "POST",
        body: {
          decision,
          identity: identity ?? undefined,
          accreditation: accreditation ?? undefined,
          accreditation_expires_at: expires || undefined,
          note: note.trim() || undefined,
          request_kinds: decision === "request_info" ? kinds : undefined,
        },
      }),
    onSuccess: (_, decision) => {
      toast.success(
        decision === "approve"
          ? "Client approved. Their reference has been issued."
          : decision === "decline"
            ? "Application declined. The client has been told why and may reapply."
            : "Request sent to the client.",
      );
      queryClient.invalidateQueries();
      navigate("/luca/clients?tab=onboarding");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data)
    return <p className="py-12 text-center text-muted-foreground">Loading application...</p>;

  const { investor, declared, referral } = data;
  const all = [
    ...data.identity_documents,
    ...data.accreditation_documents,
    ...data.other_documents,
  ];
  const doc = all.find((d) => d.id === selected);
  const closed = investor.verification_status === "approved";
  const entity = investor.investor_type === "institutional";
  const requestable = DOCUMENT_REQUEST_KINDS.filter(
    (k) => k.appliesTo === "both" || k.appliesTo === (entity ? "entity" : "individual"),
  );
  const canApprove = identity === "verified" && accreditation === "accredited" && !closed;
  const missing = [
    identity !== "verified" && "confirm identity",
    accreditation !== "accredited" && "confirm accredited status",
  ].filter(Boolean);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <div className="space-y-4">
        <Link
          to="/luca/clients?tab=onboarding"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Onboarding
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">{investor.full_name}</h1>
            <p className="text-muted-foreground">
              {investor.email} · {entity ? "Entity" : "Individual"} · registered{" "}
              {dateText(investor.created_at)}
              {investor.reapplied_at ? ` · reapplied ${dateText(investor.reapplied_at)}` : ""}
            </p>
            <p className="text-sm text-muted-foreground">
              {referral?.partner_firm
                ? `Referred by ${referral.partner_firm}`
                : referral?.via === "rm_invite"
                  ? "Referred by their RM"
                  : "Direct signup"}
              {data.rm ? ` · covered by ${data.rm.label}` : ""}
              {data.prepared_by_rm ? ` · account prepared by ${data.prepared_by_rm}` : ""}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link to={`/luca/investors/${investor.id}`} />}
          >
            Open client record
          </Button>
        </div>
        {investor.needs_info && (
          <p className="border-l-2 border-amber-500 pl-3 text-sm text-amber-800">
            Waiting on the client. You asked: {investor.decision_note}
          </p>
        )}
        {investor.verification_status === "rejected" && (
          <p className="border-l-2 border-destructive pl-3 text-sm text-destructive">
            Declined: {investor.decision_note}. The client can reapply.
          </p>
        )}
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">1. Identity</h2>
        <div className="grid gap-8 lg:grid-cols-2">
          <dl className="divide-y border-y">
            <Detail label="Name" value={`${declared.first_name} ${declared.last_name}`.trim()} />
            <Detail label="Date of birth" value={declared.date_of_birth} />
            <Detail label="Nationality" value={declared.nationality} />
            <Detail label="Country of residence" value={declared.country} />
            <Detail label="Phone" value={declared.phone} />
          </dl>
          <Documents
            title="Identity documents"
            empty="No identity documents have been uploaded yet."
            docs={data.identity_documents}
            selected={selected}
            onSelect={setSelected}
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">2. Accredited investor status</h2>
        <div className="grid gap-8 lg:grid-cols-2">
          <dl className="divide-y border-y">
            <Detail
              label="Basis declared"
              value={declared.accreditation_basis?.map((b) => b.replaceAll("_", " ")).join(", ")}
            />
            <Detail
              label="Confirmed eligible"
              value={dateText(declared.eligibility_confirmed_at)}
            />
            <Detail label="Typical ticket" value={declared.typical_ticket_size} />
            <Detail
              label="Current accreditation"
              value={
                investor.accreditation_status === "accredited"
                  ? `Accredited until ${dateText(investor.accreditation_expiry)}`
                  : investor.accreditation_status.replaceAll("_", " ")
              }
            />
          </dl>
          <Documents
            title="Evidence of accreditation"
            empty="No accreditation evidence has been uploaded yet."
            docs={data.accreditation_documents}
            selected={selected}
            onSelect={setSelected}
          />
        </div>
      </section>

      {(data.other_documents.length > 0 || data.open_requests.length > 0) && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Other documents</h2>
          {data.other_documents.length > 0 && (
            <Documents
              title="Provided"
              empty=""
              docs={data.other_documents}
              selected={selected}
              onSelect={setSelected}
            />
          )}
          {data.open_requests.length > 0 && (
            <div className="space-y-2">
              <h3 className={SECTION}>Still requested from the client</h3>
              <ul className="divide-y border-y text-sm">
                {data.open_requests.map((r) => (
                  <li key={r.id} className="flex justify-between gap-4 py-2.5">
                    <span>{documentKindLabel(r.kind)}</span>
                    <span className="text-muted-foreground">due {dateText(r.due_at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="space-y-3">
        <h2 className={SECTION}>Document viewer</h2>
        <Preview doc={doc} />
      </section>

      <section className="space-y-4 border-t pt-6">
        <h2 className="text-lg font-semibold">Your decision</h2>
        {closed ? (
          <p className="text-sm text-muted-foreground">
            Approved on {dateText(investor.approved_at)} by {investor.reviewed_by}. Reference{" "}
            <span className="font-mono font-medium text-foreground">{investor.reference}</span>.
          </p>
        ) : (
          <>
            <div className="space-y-3">
              <Choice<Identity>
                label="Identity"
                value={identity}
                onChange={setIdentity}
                options={[
                  { key: "verified", label: "Verified", tone: "good" },
                  { key: "failed", label: "Could not verify", tone: "bad" },
                ]}
              />
              <Choice<Accreditation>
                label="Accredited investor"
                value={accreditation}
                onChange={setAccreditation}
                options={[
                  { key: "accredited", label: "Accredited", tone: "good" },
                  { key: "not_accredited", label: "Not accredited", tone: "bad" },
                ]}
              />
              {accreditation === "accredited" && (
                <label className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-medium">Accreditation valid until</span>
                  <Input
                    type="date"
                    value={expires}
                    onChange={(e) => setExpires(e.target.value)}
                    className="w-44"
                  />
                  <span className="text-xs text-muted-foreground">
                    Leave blank for 12 months from today.
                  </span>
                </label>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                disabled={!canApprove || decide.isPending}
                onClick={() => decide.mutate("approve")}
              >
                Approve and issue reference
              </Button>
              <Button variant="outline" onClick={() => setDialog("request_info")}>
                Request more information
              </Button>
              <Button
                variant="outline"
                className="text-destructive"
                onClick={() => setDialog("decline")}
              >
                Decline
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {canApprove
                ? "Approving files these documents to the client, marks KYC approved, issues their LUCA reference, and tells the client, their RM and their partner."
                : `To approve, ${missing.join(" and ")}.`}
            </p>
          </>
        )}
      </section>

      <section className="space-y-3">
        <ClientTimeline investorId={investor.id} />
      </section>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogTitle>
            {dialog === "decline" ? "Decline this application" : "Request more information"}
          </DialogTitle>
          <DialogDescription>
            {dialog === "decline"
              ? "The client sees your reason in their inbox and can reapply once it is resolved."
              : "The client is told what you need and sees the documents under Requested from you."}
          </DialogDescription>
          {dialog === "request_info" && (
            <fieldset className="max-h-48 space-y-1.5 overflow-y-auto">
              <legend className={`${SECTION} mb-1`}>Documents to request</legend>
              {requestable.map((k) => (
                <label key={k.key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={kinds.includes(k.key)}
                    onChange={(e) =>
                      setKinds((cur) =>
                        e.target.checked ? [...cur, k.key] : cur.filter((x) => x !== k.key),
                      )
                    }
                  />
                  {k.label}
                </label>
              ))}
            </fieldset>
          )}
          <Textarea
            aria-label={dialog === "decline" ? "Reason for declining" : "What you need"}
            placeholder={
              dialog === "decline"
                ? "Reason, written for the client"
                : "What you need, written for the client"
            }
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              disabled={!note.trim() || decide.isPending}
              variant={dialog === "decline" ? "destructive" : "default"}
              onClick={() => dialog && decide.mutate(dialog)}
            >
              {dialog === "decline" ? "Decline application" : "Send request"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
