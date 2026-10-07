import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CommunicationDetailResponse, CommunicationStatus } from "../types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { ArrowLeftIcon } from "lucide-react";

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

export default function CommunicationDetailPage() {
  const { id } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "communications", id],
    queryFn: () => api<CommunicationDetailResponse>(`/api/v1/admin/communications/${id}`),
    enabled: Boolean(id),
  });

  if (isLoading) return <p className="py-12 text-center text-muted-foreground">Loading...</p>;
  if (!data) return <p className="py-12 text-center text-muted-foreground">Not found.</p>;

  const { communication, recipients } = data;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <Link
        to="/luca/communications"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Back to communications
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">{communication.subject}</h1>
          <p className="text-muted-foreground">{communication.audience_description}</p>
        </div>
        <Badge variant={STATUS_VARIANT[communication.status]}>
          {STATUS_LABELS[communication.status]}
        </Badge>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <SummaryTile label="Recipients" value={String(communication.recipient_count)} />
        <SummaryTile label="Delivered" value={String(communication.delivered_count)} />
        <SummaryTile label="Opened" value={String(communication.opened_count)} />
      </div>

      <Card className="mb-6">
        <CardContent className="space-y-3 pt-6 text-sm">
          <div className="whitespace-pre-line">{communication.body}</div>
          {!!communication.uploaded_attachments?.length && (
            <ul className="space-y-2 border-t pt-3">
              {communication.uploaded_attachments.map((file, index) => (
                <li key={`${file.name}-${index}`}>
                  <a
                    href={file.file_data_url}
                    download={file.name}
                    className="text-primary underline underline-offset-2"
                  >
                    {file.name}
                  </a>
                </li>
              ))}
            </ul>
          )}
          <Separator />
          <div className="flex flex-wrap gap-x-8 gap-y-1 text-muted-foreground">
            <span>Delivery: {(communication.delivery_channels ?? ["inbox"]).join(" and ")}</span>
            {communication.delivery_channels?.includes("email") && (
              <span>Email integration pending</span>
            )}
            <span>
              {communication.status === "sent"
                ? `Sent ${formatDate(communication.sent_at)}`
                : communication.status === "scheduled"
                  ? `Scheduled for ${formatDate(communication.scheduled_at)}`
                  : `Drafted ${formatDate(communication.created_at)}`}
            </span>
            <span>
              {communication.attachment_document_ids.length +
                (communication.uploaded_attachments?.length ?? 0)}{" "}
              attachment(s)
            </span>
          </div>
        </CardContent>
      </Card>

      {recipients.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">No recipients yet.</p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Investor</TableHead>
                <TableHead>Routed via</TableHead>
                <TableHead>Delivered</TableHead>
                <TableHead>Opened</TableHead>
                <TableHead className="text-right">Downloads</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recipients.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <span className="block font-medium">{r.investor_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.investor_email}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.routed_via === "eam" ? (r.eam_firm ?? "RM") : "Direct"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.email_status === "pending_integration" && !r.delivered_at
                      ? "Email pending integration"
                      : formatDate(r.delivered_at)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(r.opened_at)}</TableCell>
                  <TableCell className="text-right">{r.downloaded_document_ids.length}</TableCell>
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
