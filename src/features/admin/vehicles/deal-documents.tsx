import FileDropzone from "@/components/file-dropzone";
import { readUpload } from "@/lib/file-upload";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileTextIcon, Trash2Icon } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { DEAL_DOCUMENT_KINDS } from "@/lib/types";
import type { Fund } from "@/lib/types";
import type { AdminDocument } from "../types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const kindLabel = (kind: string) =>
  DEAL_DOCUMENT_KINDS.find((k) => k.value === kind)?.label ?? kind.replace(/_/g, " ");

/** Add and remove the company materials investors and advisers see for this deal. */
export default function DealDocuments({ fund }: { fund: Fund }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState(DEAL_DOCUMENT_KINDS[0].value);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminDocument | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "documents"],
    queryFn: () => api<{ documents: AdminDocument[] }>("/api/v1/admin/documents"),
  });
  // Deal-level materials only: investor-specific paperwork lives under that investor.
  const documents = (data?.documents ?? []).filter(
    (d) =>
      d.fund_id === fund.id &&
      d.subscription_id === null &&
      DEAL_DOCUMENT_KINDS.some((kind) => kind.value === d.kind),
  );
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "documents"] });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const upload = await readUpload(file);
      await api("/api/v1/admin/documents", {
        method: "POST",
        body: {
          document: {
            name: upload.name,
            kind,
            fund_id: fund.id,
            file_data_url: upload.file_data_url,
          },
        },
      });
    },
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/v1/admin/documents/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setPendingDelete(null);
      refresh();
    },
    onError: (e: Error) => {
      setPendingDelete(null);
      setError(e.message);
    },
  });

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Deal documents</h2>
          <p className="text-sm text-muted-foreground">
            Factsheet, offering memorandum, subscription agreement template, risk disclosure and
            other company material. Changes reach the investor deal page and adviser overview.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Document type</Label>
            <Select value={kind} onValueChange={(val) => setKind(val as string)}>
              <SelectTrigger className="w-64">
                <SelectValue>{kindLabel(kind)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {DEAL_DOCUMENT_KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <FileDropzone
        label="Upload deal document"
        disabled={upload.isPending}
        onFiles={async (files) => {
          await upload.mutateAsync(files[0]);
        }}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}

      {isLoading ? (
        <p className="py-8 text-sm text-muted-foreground">Loading documents...</p>
      ) : documents.length === 0 ? (
        <p className="border-y py-10 text-center text-sm text-muted-foreground">
          No documents yet. Choose a type and add a PDF to share it with investors and advisers.
        </p>
      ) : (
        <ul className="divide-y border-y">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-4 py-3">
              <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{doc.name}</p>
                <p className="text-xs text-muted-foreground">
                  {kindLabel(doc.kind)} · added{" "}
                  {new Date(doc.created_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
              {doc.file_data_url && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(doc.file_data_url!, "_blank")}
                >
                  View
                </Button>
              )}
              {user?.role !== "investment_team" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Delete ${doc.name}`}
                  onClick={() => setPendingDelete(doc)}
                >
                  <Trash2Icon className="size-4" />
                  Delete
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {pendingDelete && (
        <Dialog open onOpenChange={(open) => !open && setPendingDelete(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogTitle>Delete this document?</DialogTitle>
            <p className="text-sm text-muted-foreground">
              “{pendingDelete.name}” will be removed from this deal and will no longer be visible to
              investors or advisers. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setPendingDelete(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={remove.isPending}
                onClick={() => remove.mutate(pendingDelete.id)}
              >
                {remove.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
