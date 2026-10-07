import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, FileTextIcon } from "lucide-react";
import { api } from "@/lib/api";
import { documentKindLabel } from "@/lib/document-catalogue";
import { Button } from "@/components/ui/button";

export type InboxMessage = {
  id: number;
  subject: string;
  body: string;
  sent_at: string;
  read: boolean;
  fund_id: number | null;
  fund_name: string | null;
  attachments: { id: number; name: string; file_data_url?: string | null }[];
  requests: { id: number; kind: string; due_at: string | null; status: string }[];
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Bold text only; messages are plain text or light Markdown. */
function inline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    );
}

function MessageBody({ text }: { text: string }) {
  return (
    <div className="space-y-4 text-sm leading-relaxed">
      {text.split(/\n{2,}/).map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => l.trim().startsWith("- ")))
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*-\s+/, ""))}</li>
              ))}
            </ul>
          );
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

const preview = (body: string) =>
  body.replace(/\*\*/g, "").replace(/\s+/g, " ").trim().slice(0, 110);

/** Messages from LUCA: updates, reminders and requests for documents. */
export default function MessagesPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["messages"],
    queryFn: () => api<{ messages: InboxMessage[] }>("/api/v1/messages"),
  });
  const messages = data?.messages ?? [];
  const selected = messages.find((m) => m.id === selectedId) ?? null;

  const markRead = useMutation({
    mutationFn: (id: number) => api(`/api/v1/messages/${id}/read`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["messages"] }),
  });

  // On wide screens open the newest message straight away.
  useEffect(() => {
    if (
      selectedId === null &&
      messages.length > 0 &&
      window.matchMedia("(min-width: 1024px)").matches
    )
      setSelectedId(messages[0].id);
  }, [messages, selectedId]);

  // Opening a message marks it read, which LUCA sees in the communication's open rate.
  useEffect(() => {
    if (selected && !selected.read && !markRead.isPending) markRead.mutate(selected.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.read]);

  const unread = messages.filter((m) => !m.read).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Messages</h1>
        <p className="text-muted-foreground">
          {unread > 0
            ? `${unread} unread. Updates and requests from LUCA.`
            : "Updates and requests from LUCA."}
        </p>
      </div>

      {isLoading ? (
        <p className="py-12 text-center text-muted-foreground">Loading messages...</p>
      ) : messages.length === 0 ? (
        <p className="border-y py-12 text-center text-sm text-muted-foreground">
          No messages yet. Updates and requests from LUCA will appear here.
        </p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[22rem_minmax(0,1fr)]">
          {/* List */}
          <ul className={`divide-y border-y ${selected ? "hidden lg:block" : ""}`}>
            {messages.map((m) => {
              const needsAction = m.requests.some((r) => r.status === "requested");
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(m.id)}
                    className={`block w-full px-2 py-3.5 text-left transition-colors hover:bg-muted/50 ${
                      m.id === selectedId ? "bg-muted/60" : ""
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {!m.read && (
                        <span
                          aria-label="Unread"
                          className="size-2 shrink-0 rounded-full bg-primary"
                        />
                      )}
                      <span
                        className={`min-w-0 flex-1 truncate text-sm ${m.read ? "" : "font-semibold"}`}
                      >
                        {m.subject}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {formatDate(m.sent_at)}
                      </span>
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {preview(m.body)}
                    </span>
                    {needsAction && (
                      <span className="mt-1.5 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">
                        Action needed
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Message */}
          {selected && (
            <article className="min-w-0 space-y-6">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground lg:hidden"
              >
                <ArrowLeftIcon className="size-4" />
                All messages
              </button>
              <header className="space-y-1 border-b pb-4">
                <h2 className="text-xl font-semibold">{selected.subject}</h2>
                <p className="text-sm text-muted-foreground">
                  From LUCA SGP · {formatDate(selected.sent_at)}
                  {selected.fund_name && selected.fund_id && (
                    <>
                      {" · "}
                      <Link to={`/funds/${selected.fund_id}`} className="hover:underline">
                        {selected.fund_name}
                      </Link>
                    </>
                  )}
                </p>
              </header>

              <MessageBody text={selected.body} />

              {selected.requests.length > 0 && (
                <section className="space-y-2">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Documents requested
                  </p>
                  <ul className="divide-y border-y">
                    {selected.requests.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between gap-3 py-2.5 text-sm"
                      >
                        <span>
                          {documentKindLabel(r.kind)}
                          {r.due_at && r.status === "requested" && (
                            <span className="block text-xs text-muted-foreground">
                              Due {formatDate(r.due_at)}
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {r.status === "requested"
                            ? "Waiting for you"
                            : r.status === "uploaded"
                              ? "Sent to LUCA for review"
                              : "Received"}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {selected.requests.some((r) => r.status === "requested") && (
                    <Button size="sm" nativeButton={false} render={<Link to="/documents" />}>
                      Upload in Documents
                    </Button>
                  )}
                </section>
              )}

              {selected.attachments.length > 0 && (
                <section className="space-y-2">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Attachments
                  </p>
                  <ul className="divide-y border-y">
                    {selected.attachments.map((a) => (
                      <li key={a.id} className="flex items-center gap-2 py-2.5 text-sm">
                        <FileTextIcon className="size-4 text-muted-foreground" />
                        {a.file_data_url ? (
                          <a
                            href={a.file_data_url}
                            download={a.name}
                            className="underline underline-offset-2"
                          >
                            {a.name}
                          </a>
                        ) : (
                          a.name
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </article>
          )}
        </div>
      )}
    </div>
  );
}
