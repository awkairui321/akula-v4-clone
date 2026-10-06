import { useState, type FormEvent } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/currency";
import type {
  ClientDetail,
  ClientDocument,
  Highlight,
  Discussion,
  DiscussionDetail,
  ClientStage,
  ClientHolding,
  ClientSubscription,
} from "../types";
import { STAGE_LABELS } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeftIcon, SendIcon, Trash2Icon, XIcon, PlusIcon, FileTextIcon } from "lucide-react";

const STAGE_VARIANT: Record<ClientStage, "default" | "secondary" | "outline" | "destructive"> = {
  prospect: "outline",
  onboarding: "secondary",
  active: "default",
  inactive: "destructive",
};

const TAG_LIBRARY = [
  "High net worth",
  "Conservative",
  "Growth-oriented",
  "Tech sector",
  "ESG focus",
  "First-time investor",
  "Experienced",
  "Family office",
];

function OverviewTab({ detail, highlights }: { detail: ClientDetail; highlights: Highlight[] }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState(detail.client.notes ?? "");
  const [editingNotes, setEditingNotes] = useState(false);
  const [tagDraft, setTagDraft] = useState("");

  // Tags are stored in notes as a convention for now (prefix "tags:")
  // TODO: Move tags to a proper backend model
  const tags: string[] = [];

  const updateMutation = useMutation({
    mutationFn: (newNotes: string) =>
      api(`/api/v1/eam/clients/${detail.client.id}`, {
        method: "PATCH",
        body: { adviser_client: { notes: newNotes } },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["eamClient", String(detail.client.id)],
      });
      setEditingNotes(false);
    },
  });

  const deleteHighlightMutation = useMutation({
    mutationFn: (highlightId: number) =>
      api(`/api/v1/eam/highlights/${highlightId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["eamHighlights", String(detail.client.id)],
      });
    },
  });

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_280px]">
      {/* Main content */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Investor status</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <div className="flex items-center justify-between">
                <dt className="text-sm text-muted-foreground">Email</dt>
                <dd className="text-sm font-medium">{detail.client.client_email}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-sm text-muted-foreground">Stage</dt>
                <dd>
                  <Badge variant={STAGE_VARIANT[detail.client.stage]}>
                    {STAGE_LABELS[detail.client.stage]}
                  </Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-sm text-muted-foreground">Total participation</dt>
                <dd className="text-sm font-medium">
                  {formatPrice(
                    detail.holdings.reduce((sum, h) => sum + parseFloat(h.committed_amount), 0) +
                      detail.subscriptions
                        .filter(
                          (s) =>
                            !s.holding_id &&
                            !["cancelled", "rejected", "funds_returned", "not_allocated"].includes(
                              s.status,
                            ),
                        )
                        .reduce((sum, s) => sum + parseFloat(s.amount), 0),
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-sm text-muted-foreground">Allocated holdings</dt>
                <dd className="text-sm font-medium">
                  {formatPrice(
                    detail.holdings.reduce((sum, h) => sum + parseFloat(h.committed_amount), 0),
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-sm text-muted-foreground">Added</dt>
                <dd className="text-sm font-medium">
                  {new Date(detail.client.created_at).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <div>
          <h3 className="mb-3 text-base font-semibold">Highlighted for this client</h3>
          {highlights.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                No highlights yet. Browse opportunities to recommend funds.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {highlights.map((h) => (
                <Card key={h.id} size="sm">
                  <CardContent className="flex items-start justify-between gap-4 pt-4">
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-medium">{h.fund_name}</p>
                      {h.rationale && (
                        <p className="text-xs text-muted-foreground">{h.rationale}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {new Date(h.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      disabled={deleteHighlightMutation.isPending}
                      onClick={() => deleteHighlightMutation.mutate(h.id)}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Side panel — Tags & Notes */}
      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tags & private notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="cursor-pointer text-xs">
                    {tag}
                    <XIcon className="ml-1 size-3" />
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {TAG_LIBRARY.map((tag) => (
                <button
                  key={tag}
                  disabled={tags.includes(tag)}
                  className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
                >
                  <PlusIcon className="mr-0.5 size-2.5" />
                  {tag}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                placeholder="Add a private note..."
                className="text-xs"
              />
              <Button
                variant="ghost"
                size="sm"
                disabled={!tagDraft.trim()}
                onClick={() => setTagDraft("")}
              >
                Add
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Notes</CardTitle>
              {!editingNotes && (
                <Button variant="ghost" size="sm" onClick={() => setEditingNotes(true)}>
                  Edit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {editingNotes ? (
              <div className="space-y-3">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  placeholder="Add notes about this client..."
                  className="text-xs"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={updateMutation.isPending}
                    onClick={() => updateMutation.mutate(notes)}
                  >
                    {updateMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setNotes(detail.client.notes ?? "");
                      setEditingNotes(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {detail.client.notes || "No notes yet."}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-2">
          <Link to="/eam/opportunities">
            <Button variant="outline" size="sm" className="w-full text-xs">
              Browse opportunities
            </Button>
          </Link>
        </div>
      </aside>
    </div>
  );
}

function InstitutionResponse({ subscription }: { subscription: ClientSubscription }) {
  const [text, setText] = useState("");
  const qc = useQueryClient();
  const response = useMutation({
    mutationFn: () =>
      api("/api/v1/workflows", {
        method: "POST",
        body: { type: "respond-information", id: subscription.id, text },
      }),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries();
    },
  });
  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs">{subscription.information_request_note}</p>
      <Textarea
        aria-label="Response to LUCA"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Button
        size="sm"
        disabled={!text.trim() || response.isPending || subscription.on_hold}
        onClick={() => response.mutate()}
      >
        Submit response to LUCA
      </Button>
      {response.isError && <p role="alert">{response.error.message}</p>}
    </div>
  );
}

function HoldingsTab({ detail }: { detail: ClientDetail }) {
  const queryClient = useQueryClient();
  const review = useMutation({
    mutationFn: (id: number) =>
      api("/api/v1/workflows", { method: "POST", body: { type: "institution-review", id } }),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const holdings = detail.holdings;
  const subscriptions = detail.subscriptions;

  const heldCost = holdings.reduce((sum, h) => sum + parseFloat(h.committed_amount), 0);
  const nav = holdings.reduce((sum, h) => sum + parseFloat(h.current_nav), 0);
  const distributions = holdings.reduce((sum, h) => sum + parseFloat(h.distributions), 0);
  const activeSubs = subscriptions
    .filter(
      (s) =>
        !s.holding_id &&
        !["cancelled", "rejected", "funds_returned", "not_allocated"].includes(s.status),
    )
    .reduce((sum, s) => sum + parseFloat(s.amount), 0);

  return (
    <div className="mt-4 space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <MetricCard label="Total participation" value={formatPrice(heldCost + activeSubs)} />
        <MetricCard label="Holdings at cost" value={formatPrice(heldCost)} />
        <MetricCard label="Current NAV" value={formatPrice(nav)} />
        <MetricCard label="Distributions" value={formatPrice(distributions)} />
      </div>

      <div>
        <h3 className="mb-3 text-base font-semibold">Holdings</h3>
        {holdings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No holdings yet.</p>
        ) : (
          <div className="rounded-lg border">
            <div className="grid grid-cols-5 gap-4 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground">
              <span>Opportunity</span>
              <span>Invested</span>
              <span>Current value</span>
              <span>MOIC</span>
              <span>Status</span>
            </div>
            {holdings.map((h: ClientHolding) => (
              <div
                key={h.id}
                className="grid grid-cols-5 gap-4 border-b px-4 py-3 text-sm last:border-0"
              >
                <span>
                  <p className="font-medium">{h.fund_codename || h.fund_name}</p>
                  <p className="text-xs text-muted-foreground">{h.asset_name}</p>
                </span>
                <span className="font-medium">{formatPrice(h.committed_amount)}</span>
                <span className="font-medium">{formatPrice(h.current_nav)}</span>
                <span className="font-medium">{h.moic ?? "-"}</span>
                <span>
                  <Badge variant="outline" className="text-[10px]">
                    {h.state}
                  </Badge>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      <div>
        <h3 className="mb-3 text-base font-semibold">Subscriptions & institution review</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Review your client's signed application before sending it to LUCA. LUCA makes the
          subscription decision; Akula Ops handles cash and issuance.
        </p>
        {review.isError && (
          <p role="alert" className="text-sm text-destructive">
            {review.error.message}
          </p>
        )}
        {subscriptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No subscriptions yet.</p>
        ) : (
          <div className="rounded-lg border">
            <div className="grid grid-cols-4 gap-4 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground">
              <span>Opportunity</span>
              <span>Amount</span>
              <span>Fee</span>
              <span>Status</span>
            </div>
            {subscriptions.map((s: ClientSubscription) => (
              <div
                key={s.id}
                className="grid grid-cols-4 gap-4 border-b px-4 py-3 text-sm last:border-0"
              >
                <span>
                  <p className="font-medium">{s.fund_name}</p>
                  <p className="text-xs text-muted-foreground">{s.asset_name}</p>
                </span>
                <span className="font-medium">{formatPrice(s.amount)}</span>
                <span className="text-muted-foreground">{formatPrice(s.subscription_fee)}</span>
                <span>
                  <Badge variant="secondary" className="text-[10px]">
                    {s.status}
                  </Badge>
                  {s.status === "institution_review" && (
                    <Button
                      size="sm"
                      className="mt-2"
                      disabled={review.isPending || s.on_hold}
                      onClick={() => review.mutate(s.id)}
                    >
                      Complete institution review
                    </Button>
                  )}
                  {s.on_hold && <p className="text-xs">On hold by LUCA</p>}
                  {s.status === "information_requested" && <InstitutionResponse subscription={s} />}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityTab({ detail, highlights }: { detail: ClientDetail; highlights: Highlight[] }) {
  type ActivityEvent = {
    title: string;
    detail: string;
    date: string;
  };

  const events: ActivityEvent[] = [
    {
      title: "Client relationship recorded",
      detail: "EAM adviser channel",
      date: new Date(detail.client.created_at).toLocaleDateString(),
    },
    ...detail.holdings.map((h) => ({
      title: `${h.fund_codename || h.fund_name} holding issued`,
      detail: `${formatPrice(h.committed_amount)} allocated`,
      date: h.subscribed_at ? new Date(h.subscribed_at).toLocaleDateString() : "—",
    })),
    ...detail.subscriptions.map((s) => ({
      title: `${s.fund_name} subscription · ${s.status}`,
      detail: `${formatPrice(s.amount)}`,
      date: s.confirmed_at
        ? new Date(s.confirmed_at).toLocaleDateString()
        : s.reserved_at
          ? new Date(s.reserved_at).toLocaleDateString()
          : "—",
    })),
    ...highlights.map((h) => ({
      title: `${h.fund_name} highlighted`,
      detail: h.rationale || "Adviser highlight published",
      date: new Date(h.created_at).toLocaleDateString(),
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="mt-4">
      <h3 className="mb-3 text-base font-semibold">Activity timeline</h3>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <div className="space-y-0">
          {events.map((event, index) => (
            <div key={`${event.title}-${index}`} className="relative flex gap-4 pb-6 last:pb-0">
              <div className="flex flex-col items-center">
                <div className="mt-1.5 size-2 rounded-full bg-foreground/30" />
                {index < events.length - 1 && <div className="w-px flex-1 bg-border" />}
              </div>
              <div className="min-w-0 flex-1 pb-2">
                <p className="text-sm font-medium">{event.title}</p>
                <p className="text-xs text-muted-foreground">{event.detail}</p>
              </div>
              <time className="shrink-0 pt-0.5 text-xs text-muted-foreground">{event.date}</time>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const KIND_LABELS: Record<string, string> = {
  agreement: "Agreement",
  termsheet: "Term Sheet",
  factsheet: "Factsheet",
  deck: "Pitch Deck",
  memo: "Memo",
  tax: "Tax",
  statement: "Statement",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  issued: "outline",
  signed: "default",
  available: "secondary",
  action_required: "destructive",
};

function DocumentsTab({ detail }: { detail: ClientDetail }) {
  const documents = detail.documents;

  return (
    <div className="mt-4">
      <h3 className="mb-3 text-base font-semibold">Documents</h3>
      {documents.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            No documents yet.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border">
          <div className="grid grid-cols-4 gap-4 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground">
            <span>Document</span>
            <span>Type</span>
            <span>Status</span>
            <span className="text-right">Date</span>
          </div>
          {documents.map((doc: ClientDocument) => (
            <div
              key={doc.id}
              className="grid grid-cols-4 gap-4 border-b px-4 py-3 text-sm last:border-0"
            >
              <span className="flex items-center gap-2">
                <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium">{doc.name}</span>
              </span>
              <span>
                <Badge variant="secondary" className="text-[10px]">
                  {KIND_LABELS[doc.kind] ?? doc.kind}
                </Badge>
              </span>
              <span>
                <Badge variant={STATUS_VARIANT[doc.status] ?? "outline"} className="text-[10px]">
                  {doc.status}
                </Badge>
              </span>
              <span className="text-right text-muted-foreground">
                {new Date(doc.created_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DiscussionThread({ discussionId }: { discussionId: number }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");

  const { data: discussion } = useQuery({
    queryKey: ["eamDiscussion", discussionId],
    queryFn: () => api<DiscussionDetail>(`/api/v1/eam/discussions/${discussionId}`),
  });

  const sendMutation = useMutation({
    mutationFn: (messageBody: string) =>
      api(`/api/v1/eam/discussions/${discussionId}/messages`, {
        method: "POST",
        body: { message: { sender_role: "adviser", body: messageBody } },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["eamDiscussion", discussionId],
      });
      setBody("");
    },
  });

  function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    sendMutation.mutate(body.trim());
  }

  if (!discussion) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{discussion.fund_name}</p>
          <p className="text-xs text-muted-foreground">Status: {discussion.status}</p>
        </div>
      </div>
      <Separator />
      <div className="max-h-80 space-y-3 overflow-y-auto">
        {discussion.messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender_role === "adviser" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                msg.sender_role === "adviser" ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}
            >
              <p>{msg.body}</p>
              <p className="mt-1 text-[10px] opacity-70">
                {new Date(msg.created_at).toLocaleString()}
              </p>
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={handleSend} className="flex gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type a message..."
          rows={2}
          className="flex-1"
        />
        <Button type="submit" size="icon" disabled={sendMutation.isPending || !body.trim()}>
          <SendIcon className="size-4" />
        </Button>
      </form>
    </div>
  );
}

function DiscussionsTab({
  clientId,
  initialDiscussionId,
}: {
  clientId: number;
  initialDiscussionId: number | null;
}) {
  const [selectedDiscussion, setSelectedDiscussion] = useState<number | null>(initialDiscussionId);

  const { data: discussions } = useQuery({
    queryKey: ["eamDiscussions", String(clientId)],
    queryFn: () => api<Discussion[]>(`/api/v1/eam/discussions?client_id=${clientId}`),
  });

  const list = discussions ?? [];

  if (selectedDiscussion !== null) {
    return (
      <div className="mt-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelectedDiscussion(null)}
          className="mb-4"
        >
          <ArrowLeftIcon className="mr-1 size-4" />
          Back to conversations
        </Button>
        <DiscussionThread discussionId={selectedDiscussion} />
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {list.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            New investor questions will appear here.
          </CardContent>
        </Card>
      ) : (
        list.map((d) => (
          <Card
            key={d.id}
            size="sm"
            className="cursor-pointer transition-shadow hover:ring-2 hover:ring-primary/20"
            onClick={() => setSelectedDiscussion(d.id)}
          >
            <CardContent className="flex items-center justify-between gap-4 pt-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">{d.fund_name}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(d.updated_at).toLocaleDateString()}
                </p>
              </div>
              <Badge variant="secondary">{d.status}</Badge>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get("tab") ?? "overview";
  const tab = ["overview", "holdings", "activity", "conversations", "documents"].includes(
    requestedTab,
  )
    ? requestedTab
    : "overview";
  const discussionId = Number(params.get("discussion")) || null;

  const { data: detail, isLoading } = useQuery({
    queryKey: ["eamClient", id],
    refetchInterval: 2000,
    queryFn: () => api<ClientDetail>(`/api/v1/eam/clients/${id}`),
    enabled: !!id,
  });

  const { data: highlights } = useQuery({
    queryKey: ["eamHighlights", id],
    queryFn: () => api<Highlight[]>(`/api/v1/eam/highlights?client_id=${id}`),
    enabled: !!id,
  });

  if (isLoading || !detail) {
    return (
      <div>
        <p className="py-12 text-center text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <Link to="/eam/clients">
        <Button variant="ghost" size="sm" className="mb-4">
          <ArrowLeftIcon className="mr-1 size-4" />
          Back to clients
        </Button>
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-muted text-sm font-medium">
            {detail.client.client_name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2)}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{detail.client.client_name}</h1>
            <p className="text-sm text-muted-foreground">
              {detail.client.client_email} · Client tag {detail.client.client_code}
            </p>
          </div>
        </div>
        <Badge variant={STAGE_VARIANT[detail.client.stage]} className="ml-auto">
          {STAGE_LABELS[detail.client.stage]}
        </Badge>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setParams(value === "overview" ? {} : { tab: value })}
      >
        <TabsList variant="line" className="w-full justify-start border-b">
          <TabsTrigger value="overview" className="flex-none">
            Overview
          </TabsTrigger>
          <TabsTrigger value="holdings" className="flex-none">
            Holdings
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex-none">
            Activity
          </TabsTrigger>
          <TabsTrigger value="conversations" className="flex-none">
            Conversations
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex-none">
            Documents
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab detail={detail} highlights={highlights ?? []} />
        </TabsContent>
        <TabsContent value="holdings">
          <HoldingsTab detail={detail} />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab detail={detail} highlights={highlights ?? []} />
        </TabsContent>
        <TabsContent value="conversations">
          <DiscussionsTab
            key={discussionId ?? "list"}
            clientId={detail.client.id}
            initialDiscussionId={discussionId}
          />
        </TabsContent>
        <TabsContent value="documents">
          <DocumentsTab detail={detail} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
