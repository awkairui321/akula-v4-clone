import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Communication, CommunicationsResponse, CommunicationStatus } from "../types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SummaryFigure } from "../summary-figure";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { PlusIcon } from "lucide-react";

const STATUS_VARIANT: Record<CommunicationStatus, "default" | "secondary" | "outline"> = {
  draft: "outline",
  scheduled: "secondary",
  sent: "default",
};

const STATUS_LABELS: Record<CommunicationStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sent: "Sent",
};

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

function statusDate(c: Communication): string {
  if (c.status === "sent") return formatDate(c.sent_at);
  if (c.status === "scheduled") return formatDate(c.scheduled_at);
  return formatDate(c.created_at);
}

export default function CommunicationsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "communications"],
    queryFn: () => api<CommunicationsResponse>("/api/v1/admin/communications"),
    refetchInterval: 5000,
  });

  const communications = data?.communications ?? [];
  const visibleCommunications = communications.filter(
    (communication) =>
      (statusFilter === "all" || communication.status === statusFilter) &&
      `${communication.subject} ${communication.audience_description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const summary = data?.summary;

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Communications</h1>
          <p className="text-muted-foreground">
            Announcements and updates sent to investors, directly or through their RM.
          </p>
        </div>
        <Button onClick={() => navigate("/luca/communications/new")}>
          <PlusIcon className="mr-1.5 size-4" />
          New communication
        </Button>
      </div>

      {summary && (
        <div className="mb-5 grid grid-cols-3 gap-4 rounded-lg border bg-card px-4 py-4 sm:gap-8 sm:px-5">
          <SummaryFigure label="Sent" value={String(summary.sent)} />
          <SummaryFigure label="Scheduled" value={String(summary.scheduled)} />
          <SummaryFigure label="Drafts" value={String(summary.draft)} />
        </div>
      )}
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          aria-label="Search communications"
          placeholder="Search subject or audience"
          className="h-9 w-full min-w-0 flex-1 rounded-md border bg-background px-3 text-sm sm:min-w-56"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label="Filter communication status"
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="sent">Sent</option>
          <option value="scheduled">Scheduled</option>
          <option value="draft">Draft</option>
        </select>
      </div>

      {isLoading && <p className="py-12 text-center text-muted-foreground">Loading...</p>}

      {!isLoading && communications.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">No communications yet.</p>
      )}

      {communications.length > 0 && (
        <div className="min-w-0 overflow-hidden rounded-lg border">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Audience</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Recipients</TableHead>
                <TableHead className="text-right">Opened</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleCommunications.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/luca/communications/${c.id}`)}
                >
                  <TableCell className="max-w-72 py-4 font-medium">{c.subject}</TableCell>
                  <TableCell className="max-w-80 whitespace-normal text-muted-foreground">
                    {c.audience_description}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[c.status]} className="text-[10px]">
                      {STATUS_LABELS[c.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{c.recipient_count}</TableCell>
                  <TableCell className="text-right">
                    {c.recipient_count > 0
                      ? `${Math.round((c.opened_count / c.recipient_count) * 100)}%`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{statusDate(c)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
