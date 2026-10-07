import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeftIcon, CheckCircle2Icon, CircleIcon, CopyIcon, Trash2Icon } from "lucide-react";
import { api } from "@/lib/api";
import { documentKindLabel } from "@/lib/document-catalogue";
import { COUNTRIES, TICKET_SIZES } from "@/lib/onboarding-options";
import {
  RM_DOCUMENT_KINDS,
  WHAT_INVESTOR_COMPLETES,
  type ClientPreparation,
  type PreparedClient,
} from "@/lib/rm-onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StageLabel } from "./onboarding-list";

type Details = {
  first_name: string;
  last_name: string;
  email: string;
  nationality: string;
  date_of_birth: string;
  country: string;
  phone: string;
  typical_ticket_size: string;
};

const EMPTY: Details = {
  first_name: "",
  last_name: "",
  email: "",
  nationality: "",
  date_of_birth: "",
  country: "",
  phone: "",
  typical_ticket_size: "",
};

const SECTION_LABEL = "text-xs font-medium tracking-wide text-muted-foreground uppercase";

function Field({
  id,
  label,
  optional,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label} {optional && <span className="text-muted-foreground">(optional)</span>}
      </Label>
      {children}
    </div>
  );
}

function DetailsFields({
  values,
  onChange,
  withEmail,
  disabled,
}: {
  values: Details;
  onChange: (next: Details) => void;
  withEmail?: boolean;
  disabled?: boolean;
}) {
  const set = (key: keyof Details) => (value: string) => onChange({ ...values, [key]: value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id="first_name" label="Legal first name">
        <Input
          id="first_name"
          value={values.first_name}
          disabled={disabled}
          onChange={(e) => set("first_name")(e.target.value)}
        />
      </Field>
      <Field id="last_name" label="Legal last name">
        <Input
          id="last_name"
          value={values.last_name}
          disabled={disabled}
          onChange={(e) => set("last_name")(e.target.value)}
        />
      </Field>
      {withEmail && (
        <div className="sm:col-span-2">
          <Field id="email" label="Client email address">
            <Input
              id="email"
              type="email"
              value={values.email}
              onChange={(e) => set("email")(e.target.value)}
            />
          </Field>
        </div>
      )}
      <Field id="nationality" label="Nationality" optional>
        <Select
          value={values.nationality || ""}
          disabled={disabled}
          onValueChange={(v) => v && set("nationality")(v)}
        >
          <SelectTrigger id="nationality" className="w-full">
            <SelectValue placeholder="Select nationality" />
          </SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((c) => (
              <SelectItem key={c.nationality} value={c.nationality}>
                {c.nationality}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field id="date_of_birth" label="Date of birth" optional>
        <Input
          id="date_of_birth"
          type="date"
          value={values.date_of_birth}
          disabled={disabled}
          onChange={(e) => set("date_of_birth")(e.target.value)}
        />
      </Field>
      <Field id="country" label="Country of residence" optional>
        <Select
          value={values.country || ""}
          disabled={disabled}
          onValueChange={(v) => v && set("country")(v)}
        >
          <SelectTrigger id="country" className="w-full">
            <SelectValue placeholder="Select country" />
          </SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((c) => (
              <SelectItem key={c.country} value={c.country}>
                {c.country}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field id="phone" label="Phone" optional>
        <Input
          id="phone"
          value={values.phone}
          disabled={disabled}
          placeholder="+65 ..."
          onChange={(e) => set("phone")(e.target.value)}
        />
      </Field>
      <Field id="ticket" label="Typical investment size" optional>
        <Select
          value={values.typical_ticket_size || ""}
          disabled={disabled}
          onValueChange={(v) => v && set("typical_ticket_size")(v)}
        >
          <SelectTrigger id="ticket" className="w-full">
            <SelectValue>
              {TICKET_SIZES.find((size) => size.value === values.typical_ticket_size)?.label ??
                "Select a range"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {TICKET_SIZES.map((size) => (
              <SelectItem key={size.value} value={size.value}>
                {size.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/rm/onboarding"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon className="size-4" />
      Client onboarding
    </Link>
  );
}

/* ─── New client ─── */

export function NewClientPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Details>(EMPTY);

  const create = useMutation({
    mutationFn: () =>
      api<{ client: PreparedClient }>("/api/v1/rm/clients", { method: "POST", body: values }),
    onSuccess: ({ client }) => {
      queryClient.invalidateQueries({ queryKey: ["rm"] });
      navigate(`/rm/onboarding/${client.id}?created=1`, { replace: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid = values.first_name.trim() && values.last_name.trim() && values.email.includes("@");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div className="space-y-4">
        <BackLink />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New client account</h1>
          <p className="mt-1 text-muted-foreground">
            Enter what you already know. The client receives an invitation, sets their own password
            and reviews these details before anything is treated as confirmed. The account is tagged
            to you as the referring RM, so the client is a partner-referred investor.
          </p>
        </div>
      </div>

      <form
        className="space-y-8"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) create.mutate();
        }}
      >
        <section className="space-y-4">
          <h2 className={SECTION_LABEL}>Client details</h2>
          <DetailsFields values={values} onChange={setValues} withEmail />
        </section>

        <section className="space-y-2 border-t pt-6">
          <h2 className={SECTION_LABEL}>What the client completes themselves</h2>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {WHAT_INVESTOR_COMPLETES.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            These are the client&apos;s own declarations, so they cannot be completed on their
            behalf. You can add documents on the next screen.
          </p>
        </section>

        <div className="flex gap-3">
          <Button type="submit" disabled={!valid || create.isPending}>
            {create.isPending ? "Creating..." : "Create account and invite"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => navigate("/rm/onboarding")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

/* ─── One client ─── */

function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Unable to read this file."));
    reader.readAsDataURL(file);
  });
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function ClientOnboardingPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Details | null>(null);
  const [kind, setKind] = useState<string>("passport");
  const [file, setFile] = useState<File | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["rm", "onboarding", id],
    queryFn: () => api<ClientPreparation>(`/api/v1/rm/clients/${id}/onboarding`),
    enabled: Boolean(id),
  });

  const refresh = (next: ClientPreparation) => {
    queryClient.setQueryData(["rm", "onboarding", id], next);
    queryClient.invalidateQueries({ queryKey: ["rm", "onboarding"], exact: true });
  };

  const save = useMutation({
    mutationFn: (details: Details) =>
      api<ClientPreparation>(`/api/v1/rm/clients/${id}/onboarding`, {
        method: "PATCH",
        body: details,
      }),
    onSuccess: (next) => {
      refresh(next);
      setDraft(null);
      toast.success("Details saved.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!file || file.size > 2 * 1024 * 1024) throw new Error("Choose a file up to 2 MB.");
      return api<ClientPreparation>(`/api/v1/rm/clients/${id}/documents`, {
        method: "POST",
        body: { name: file.name, kind, file_data_url: await readFile(file) },
      });
    },
    onSuccess: (next) => {
      refresh(next);
      setFile(null);
      toast.success("Document added. The client will be asked to confirm it.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (docId: number) =>
      api<ClientPreparation>(`/api/v1/rm/clients/${id}/documents/${docId}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const resend = useMutation({
    mutationFn: () => api<ClientPreparation>(`/api/v1/rm/clients/${id}/invite`, { method: "POST" }),
    onSuccess: (next) => {
      refresh(next);
      toast.success("New invitation link issued.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading)
    return <p className="py-12 text-center text-muted-foreground">Loading client...</p>;
  if (!data)
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-muted-foreground">This account could not be found.</p>
        <BackLink />
      </div>
    );

  const { client, profile, documents, invite_path, editable, checklist } = data;
  const saved: Details = {
    first_name: profile.first_name,
    last_name: profile.last_name,
    email: client.email,
    nationality: profile.nationality ?? "",
    date_of_birth: profile.date_of_birth ?? "",
    country: profile.country,
    phone: profile.phone,
    typical_ticket_size: profile.typical_ticket_size ?? "",
  };
  const values = draft ?? saved;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);
  const inviteUrl = invite_path ? `${window.location.origin}${invite_path}` : null;
  const justCreated = searchParams.get("created") === "1";

  return (
    <div className="flex w-full flex-col gap-8">
      <div className="space-y-4">
        <BackLink />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{client.full_name}</h1>
            <p className="mt-1 text-muted-foreground">
              {client.email} · {client.client_code} · Partner-referred via {client.rm_name}
            </p>
          </div>
          <StageLabel stage={client.stage} />
        </div>
      </div>

      {inviteUrl && (
        <section className="space-y-3 border-y py-5">
          <div>
            <h2 className="font-semibold">
              {justCreated ? "Account created. Send the invitation" : "Invitation not yet opened"}
            </h2>
            <p className="text-sm text-muted-foreground">
              The client opens this link, sets their own password and reviews what you entered.
              Email delivery is not connected in this demo, so share the link directly.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input readOnly value={inviteUrl} className="max-w-xl font-mono text-xs" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard?.writeText(inviteUrl);
                toast.success("Invitation link copied.");
              }}
            >
              <CopyIcon className="mr-1.5 size-4" />
              Copy link
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={resend.isPending}
              onClick={() => resend.mutate()}
            >
              Issue new link
            </Button>
          </div>
        </section>
      )}

      <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
        <div className="space-y-10">
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className={SECTION_LABEL}>Details you entered</h2>
              {!editable && (
                <span className="text-xs text-muted-foreground">
                  Confirmed by the client. Read only.
                </span>
              )}
            </div>
            <DetailsFields
              values={values}
              onChange={setDraft}
              disabled={!editable || save.isPending}
            />
            {editable && (
              <div className="flex gap-3">
                <Button
                  size="sm"
                  disabled={!dirty || save.isPending}
                  onClick={() => draft && save.mutate(draft)}
                >
                  {save.isPending ? "Saving..." : "Save details"}
                </Button>
                {dirty && (
                  <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                    Discard changes
                  </Button>
                )}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h2 className={SECTION_LABEL}>Documents you supplied</h2>
            <p className="text-sm text-muted-foreground">
              Documents you upload are marked as supplied by you. The client confirms each one, and
              LUCA compliance sees who provided it.
            </p>
            {documents.length > 0 ? (
              <ul className="divide-y border-y">
                {documents.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{documentKindLabel(doc.kind)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {doc.name} · added {formatDate(doc.created_at)} by {doc.uploaded_by.name}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span
                        className={`text-xs ${doc.confirmed_at ? "text-green-700" : "text-amber-700"}`}
                      >
                        {doc.confirmed_at
                          ? `Confirmed by client ${formatDate(doc.confirmed_at)}`
                          : "Awaiting client confirmation"}
                      </span>
                      {!doc.confirmed_at && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${doc.name}`}
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(doc.id)}
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="border-y py-4 text-sm text-muted-foreground">
                No documents supplied yet.
              </p>
            )}

            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-2">
                <Label htmlFor="kind">Document type</Label>
                <Select value={kind} onValueChange={(v) => v && setKind(v)}>
                  <SelectTrigger id="kind" className="w-64">
                    <SelectValue>{documentKindLabel(kind)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {RM_DOCUMENT_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {documentKindLabel(k)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <input
                aria-label="Document file"
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:bg-transparent file:px-2 file:py-1 file:text-xs file:font-medium"
              />
              <Button
                size="sm"
                disabled={!file || upload.isPending}
                onClick={() => upload.mutate()}
              >
                {upload.isPending ? "Uploading..." : "Add document"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">PDF, PNG or JPEG up to 2 MB.</p>
          </section>
        </div>

        <aside className="space-y-6">
          {(["rm", "investor"] as const).map((owner) => (
            <section key={owner} className="space-y-3">
              <h2 className={SECTION_LABEL}>{owner === "rm" ? "You" : "Client"}</h2>
              <ul className="space-y-2.5">
                {checklist
                  .filter((item) => item.owner === owner)
                  .map((item) => (
                    <li key={item.label} className="flex items-start gap-2 text-sm">
                      {item.done ? (
                        <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-green-600" />
                      ) : (
                        <CircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" />
                      )}
                      <span className={item.done ? "" : "text-muted-foreground"}>{item.label}</span>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
          <p className="border-t pt-4 text-xs text-muted-foreground">
            Eligibility, the identity check, the NDA and consents are the client&apos;s own
            declarations, so only they can complete them. LUCA compliance reviews the result.
          </p>
        </aside>
      </div>
    </div>
  );
}
