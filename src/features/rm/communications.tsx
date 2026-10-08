import { demoClientBook } from "@/lib/demo-client-book";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AdminInvestor, Communication } from "@/features/admin/types";
import { readUpload, type UploadedFile } from "@/lib/file-upload";
import FileDropzone from "@/components/file-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
export default function RmCommunications() {
  const qc = useQueryClient();
  const [compose, setCompose] = useState(false);
  const [client, setClient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const { data } = useQuery({
    queryKey: ["rm", "communications"],
    queryFn: () => api<{ communications: Communication[] }>("/api/v1/rm/communications"),
  });
  const { data: book } = useQuery({
    queryKey: ["rm", "clients"],
    queryFn: () => api<{ clients: AdminInvestor[] }>("/api/v1/rm/clients"),
  });
  const send = useMutation({
    mutationFn: () =>
      api("/api/v1/rm/communications", {
        method: "POST",
        body: { investor_id: Number(client), subject, body, uploaded_attachments: files },
      }),
    onSuccess: () => {
      qc.invalidateQueries();
      setCompose(false);
      setSubject("");
      setBody("");
      setFiles([]);
      toast.success("Message delivered to the client inbox.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Communications</h1>
          <p className="mt-1 text-muted-foreground">
            Messages and attachments shared with your clients.
          </p>
        </div>
        <Button onClick={() => setCompose(true)}>New communication</Button>
      </div>
      {compose && (
        <form
          className="max-w-3xl space-y-5 rounded-xl border bg-card p-6"
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate();
          }}
        >
          <h2 className="text-lg font-semibold">New communication</h2>
          <div className="space-y-2">
            <Label htmlFor="rm-recipient">Client</Label>
            <select
              id="rm-recipient"
              required
              value={client}
              onChange={(e) => setClient(e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Choose a client</option>
              {demoClientBook(book?.clients ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} · {c.email}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rm-subject">Subject</Label>
            <Input
              id="rm-subject"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rm-message">Message</Label>
            <textarea
              id="rm-message"
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="w-full rounded-md border bg-background p-3 text-sm"
            />
          </div>
          <FileDropzone
            multiple
            disabled={send.isPending}
            onFiles={async (selected) => {
              if (files.length + selected.length > 5) throw new Error("Attach up to five files.");
              const uploaded = await Promise.all(selected.map(readUpload));
              setFiles((previous) => [...previous, ...uploaded]);
            }}
          />
          <ul className="space-y-2">
            {files.map((f, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span>{f.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFiles(files.filter((_, n) => n !== i))}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Delivered to the client inbox in this demo. Email delivery is not connected.
          </p>
          <div className="flex gap-3">
            <Button
              type="submit"
              disabled={send.isPending || !client || !subject.trim() || !body.trim()}
            >
              Send to client
            </Button>
            <Button type="button" variant="ghost" onClick={() => setCompose(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Sent communications</h2>
        {!data?.communications.length && (
          <p className="rounded-lg border p-8 text-center text-muted-foreground">
            No messages sent yet.
          </p>
        )}
        {data?.communications.map((c) => (
          <details key={c.id} className="rounded-lg border bg-card p-5">
            <summary className="cursor-pointer">
              <span className="font-medium">{c.subject}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {c.audience_description} · {new Date(c.created_at).toLocaleDateString()} · Delivered
                to inbox
              </span>
            </summary>
            <p className="mt-4 text-sm whitespace-pre-wrap">{c.body}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {c.uploaded_attachments?.map((f, i) => (
                <a key={i} href={f.file_data_url} download={f.name} className="text-sm underline">
                  {f.name}
                </a>
              ))}
            </div>
          </details>
        ))}
      </section>
    </div>
  );
}
