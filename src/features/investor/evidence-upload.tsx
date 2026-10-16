import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2Icon, FileTextIcon, TriangleAlertIcon, UploadIcon } from "lucide-react";
import { api } from "@/lib/api";
import {
  EVIDENCE_DOCUMENTS,
  EVIDENCE_RULES,
  evidenceLabel,
  isCurrent,
  type EvidenceKind,
} from "@/lib/accredited-evidence";
import { isMocking } from "@/mocks/browser";
import { Button } from "@/components/ui/button";

export type UploadedDocument = {
  id: number;
  document_type: string;
  notes: string | null;
  status: string;
  created_at?: string;
};

/** The documents this investor has uploaded for verification. */
export function useOnboardingDocuments() {
  return useQuery({
    queryKey: ["onboardingDocuments"],
    queryFn: () => api<{ documents: UploadedDocument[] }>("/api/v1/onboarding/documents"),
  });
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Unable to read this file."));
    reader.readAsDataURL(file);
  });
}

/** One document to provide: what it is, and whether LUCA already has a current copy. */
export function EvidenceRow({
  kind,
  uploaded,
}: {
  kind: EvidenceKind;
  uploaded: UploadedDocument | undefined;
}) {
  const document = EVIDENCE_DOCUMENTS.find((d) => d.kind === kind)!;
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const current = Boolean(uploaded) && isCurrent(uploaded?.created_at);
  const outOfDate = Boolean(uploaded) && !current;

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > EVIDENCE_RULES.maxFileMb * 1024 * 1024)
        throw new Error(`Choose a file up to ${EVIDENCE_RULES.maxFileMb} MB.`);
      return api("/api/v1/onboarding/documents", {
        method: "POST",
        body: { name: file.name, kind, file_data_url: await readAsDataUrl(file) },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboardingDocuments"] }),
  });

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3 py-4">
      <div className="flex min-w-0 flex-1 basis-56 gap-3">
        <FileTextIcon className="mt-0.5 size-5 shrink-0 text-[#718896]" />
        <div className="min-w-0">
          <p className="text-sm font-medium">{document.label}</p>
          <p className="text-sm leading-5 text-[#587180]">{document.description}</p>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        {current && uploaded ? (
          <>
            <span className="flex items-center gap-1.5 text-sm font-medium text-green-700">
              <CheckCircle2Icon className="size-4" />
              On file
            </span>
            <span className="max-w-48 truncate text-xs text-[#718896]">
              {uploaded.notes ?? "Document"} · {formatDate(uploaded.created_at!)}
            </span>
            <button
              type="button"
              disabled={upload.isPending}
              onClick={() => input.current?.click()}
              className="text-xs text-[#587180] underline underline-offset-4 hover:text-[#193548]"
            >
              Replace file
            </button>
          </>
        ) : (
          <>
            {outOfDate && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
                <TriangleAlertIcon className="size-3.5" />
                Older than {EVIDENCE_RULES.validForMonths} months
              </span>
            )}
            <Button
              variant="outline"
              disabled={upload.isPending}
              onClick={() => input.current?.click()}
            >
              <UploadIcon className="size-4" />
              {upload.isPending ? "Uploading..." : outOfDate ? "Upload a new copy" : "Upload"}
            </Button>
          </>
        )}
        {upload.isError && (
          <p role="alert" className="max-w-48 text-right text-xs text-destructive">
            {upload.error.message}
          </p>
        )}
        <input
          ref={input}
          type="file"
          className="sr-only"
          aria-label={`Upload ${document.label}`}
          accept="application/pdf,image/png,image/jpeg"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate(file);
            e.target.value = "";
          }}
        />
      </div>
    </li>
  );
}

// A one-page placeholder PDF, for the demo shortcut below.
const SAMPLE_PDF = "data:application/pdf;base64,JVBERi0xLjQKJSVFT0YK";

/**
 * Demo only: attaches a placeholder file for each document still missing, so the AI check can be
 * walked through without choosing files. The files are named as samples, so LUCA's queue shows
 * what they are. Never shown outside the simulated environment.
 */
export function SampleDocumentsButton({ kinds }: { kinds: EvidenceKind[] }) {
  const qc = useQueryClient();
  const attach = useMutation({
    mutationFn: async () => {
      for (const kind of kinds)
        await api("/api/v1/onboarding/documents", {
          method: "POST",
          body: {
            name: `Sample ${evidenceLabel(kind).toLowerCase()} (demo).pdf`,
            kind,
            file_data_url: SAMPLE_PDF,
          },
        });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboardingDocuments"] }),
  });
  if (!isMocking || kinds.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2.5">
      <p className="min-w-0 flex-1 basis-48 text-xs leading-5 text-[#718896]">
        Demo shortcut. Adds placeholder files for the {kinds.length} missing document
        {kinds.length === 1 ? "" : "s"}. They are marked as samples.
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={attach.isPending}
        onClick={() => attach.mutate()}
      >
        {attach.isPending ? "Attaching..." : "Attach sample documents"}
      </Button>
      {attach.isError && (
        <p role="alert" className="w-full text-xs text-destructive">
          {attach.error.message}
        </p>
      )}
    </div>
  );
}
