import { ExternalLinkIcon } from "lucide-react";
import { documentKindLabel } from "@/lib/document-catalogue";
import type { ClientEvent, ReviewBundle } from "@/lib/client-onboarding";
import { clientStage } from "@/features/admin/client-stage";
import { Button } from "@/components/ui/button";

const SECTION = "text-xs font-medium tracking-wide text-muted-foreground uppercase";
const dateText = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "—";

async function openFile(dataUrl: string) {
  const blob = await (await fetch(dataUrl)).blob();
  window.open(URL.createObjectURL(blob), "_blank", "noopener");
}

/**
 * A client's onboarding as an RM or a partner sees it: where it stands, who brought them in, what
 * has been provided and the history. It never carries LUCA's private notes or reviewer reasoning.
 */
export function OnboardingRecord({
  bundle,
  events,
}: {
  bundle: ReviewBundle;
  events: ClientEvent[];
}) {
  const { investor, referral } = bundle;
  const stage = clientStage(bundle.summary);
  const docs = [
    ...bundle.identity_documents,
    ...bundle.accreditation_documents,
    ...bundle.other_documents,
  ];
  return (
    <div className="space-y-8">
      <section className="grid gap-x-10 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Onboarding</p>
          <p
            className={`mt-1 text-lg font-semibold ${
              stage.waitingOn === "luca"
                ? "text-blue-700"
                : stage.waitingOn === "client"
                  ? "text-amber-700"
                  : ""
            }`}
          >
            {stage.label}
          </p>
          <p className="text-xs text-muted-foreground">
            {stage.waitingOn === "luca"
              ? "Waiting on LUCA"
              : stage.waitingOn === "client"
                ? "Waiting on the client"
                : investor.approved_at
                  ? `Approved ${dateText(investor.approved_at)}`
                  : ""}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">LUCA reference</p>
          <p className="mt-1 font-mono text-lg font-semibold">
            {investor.reference ?? "Issued on approval"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Came through</p>
          <p className="mt-1 text-lg font-semibold">
            {referral?.partner_firm ??
              (referral?.via === "rm_invite" ? "Their RM" : "Direct signup")}
          </p>
          {bundle.rm && (
            <p className="text-xs text-muted-foreground">Covered by {bundle.rm.label}</p>
          )}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Checks</p>
          <p className="mt-1 text-sm">
            Identity {investor.identity_status === "verified" ? "verified" : "open"} · Accreditation{" "}
            {investor.accreditation_status === "accredited" ? "confirmed" : "open"}
          </p>
          <p className="text-xs text-muted-foreground">
            NDA {bundle.checks.nda_signed ? "signed" : "not yet signed"} · consents{" "}
            {bundle.checks.consents_complete ? "complete" : "outstanding"}
          </p>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className={SECTION}>Documents ({docs.length})</h3>
        {docs.length === 0 ? (
          <p className="border-y py-4 text-sm text-muted-foreground">Nothing uploaded yet.</p>
        ) : (
          <ul className="divide-y border-y text-sm">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{documentKindLabel(d.kind)}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {d.name} · {dateText(d.created_at)}
                    {d.uploaded_by
                      ? ` · uploaded by ${d.uploaded_by.role === "rm" ? "RM" : "the client"}`
                      : ""}
                  </span>
                </span>
                {d.file_data_url ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => d.file_data_url && openFile(d.file_data_url)}
                  >
                    <ExternalLinkIcon className="size-3.5" />
                    View
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">Record only</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {bundle.open_requests.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Still requested from the client:{" "}
            {bundle.open_requests.map((r) => documentKindLabel(r.kind)).join(", ")}.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className={SECTION}>Timeline</h3>
        {events.length === 0 ? (
          <p className="border-y py-4 text-sm text-muted-foreground">Nothing recorded yet.</p>
        ) : (
          <ul className="divide-y border-y text-sm">
            {[...events].reverse().map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block">{e.text}</span>
                  <span className="block text-xs text-muted-foreground">{e.actor}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {dateText(e.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
