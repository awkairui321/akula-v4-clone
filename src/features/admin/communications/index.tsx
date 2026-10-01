import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Communication, CommunicationsResponse, CommunicationStatus } from "../types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "communications"],
    queryFn: () => api<CommunicationsResponse>("/api/v1/admin/communications"),
  });

  const communications = data?.communications ?? [];
  const summary = data?.summary;

  return (
    <div className="mx-auto w-full max-w-6xl">
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
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <SummaryTile label="Sent" value={String(summary.sent)} />
          <SummaryTile label="Scheduled" value={String(summary.scheduled)} />
          <SummaryTile label="Drafts" value={String(summary.draft)} />
        </div>
      )}

      {isLoading && <p className="py-12 text-center text-muted-foreground">Loading...</p>}

      {!isLoading && communications.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">No communications yet.</p>
      )}

      {communications.length > 0 && (
        <div className="rounded-lg border">
          <Table>
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
              {communications.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/luca/communications/${c.id}`)}
                >
                  <TableCell className="font-medium">{c.subject}</TableCell>
                  <TableCell className="truncate text-muted-foreground">
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

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
