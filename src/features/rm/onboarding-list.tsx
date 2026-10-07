import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CopyIcon, PlusIcon } from "lucide-react";
import { api } from "@/lib/api";
import { PREPARATION_STAGE_LABELS, type PreparationStage } from "@/lib/rm-onboarding";
import type { AdminInvestor } from "@/features/admin/types";
import { clientStage } from "@/features/admin/client-stage";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STAGE_ORDER: PreparationStage[] = ["invited", "reviewing", "verifying", "complete"];

const STAGE_TONE: Record<PreparationStage, string> = {
  invited: "text-amber-700",
  reviewing: "text-blue-700",
  verifying: "text-blue-700",
  complete: "text-green-700",
};

export function StageLabel({ stage }: { stage: PreparationStage }) {
  const step = STAGE_ORDER.indexOf(stage) + 1;
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`text-sm font-medium ${STAGE_TONE[stage]}`}>
        {PREPARATION_STAGE_LABELS[stage]}
      </span>
      <span className="text-xs text-muted-foreground">
        Step {step} of {STAGE_ORDER.length}
      </span>
    </div>
  );
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const STAGE_COLOUR = {
  client: "text-amber-700",
  luca: "text-blue-700",
  none: "text-muted-foreground",
} as const;

/** A signup link that tags whoever uses it to this RM, and to the partner if it is theirs. */
function ReferralLinks() {
  const { data } = useQuery({
    queryKey: ["rm", "referral"],
    queryFn: () =>
      api<{ links: { code: string; label: string; partner_firm: string | null }[] }>(
        "/api/v1/rm/referral",
      ),
  });
  const links = data?.links ?? [];
  if (links.length === 0) return null;
  const urlFor = (code: string) =>
    `${window.location.origin}/signup?ref=${encodeURIComponent(code)}`;
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Referral links
      </h2>
      <p className="text-sm text-muted-foreground">
        Anyone who signs up through a link is tagged to you, and to the partner if the link is
        theirs, and appears in your list below.
      </p>
      <ul className="divide-y border-y">
        {links.map((l) => (
          <li key={l.code} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-sm font-medium">{l.partner_firm ?? "Your own link"}</span>
              <span className="block truncate font-mono text-xs text-muted-foreground">
                {urlFor(l.code)}
              </span>
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                navigator.clipboard
                  ?.writeText(urlFor(l.code))
                  .then(() => toast.success("Link copied."))
                  .catch(() => toast.error("Could not copy the link."))
              }
            >
              <CopyIcon className="size-3.5" />
              Copy link
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Every client this RM covers, whether they started the account or the client came through a link. */
export default function RmOnboardingList() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["rm", "clients"],
    queryFn: () => api<{ clients: AdminInvestor[] }>("/api/v1/rm/clients"),
  });
  const rank = { client: 0, luca: 1, none: 2 } as const;
  const clients = (data?.clients ?? [])
    .map((c) => ({ client: c, stage: clientStage(c) }))
    .sort(
      (a, b) =>
        rank[a.stage.waitingOn] - rank[b.stage.waitingOn] ||
        b.client.created_at.localeCompare(a.client.created_at),
    );
  const waitingOnClient = clients.filter((c) => c.stage.waitingOn === "client").length;
  const waitingOnLuca = clients.filter((c) => c.stage.waitingOn === "luca").length;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Client onboarding</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Your clients and where each is in onboarding. Start an account for a client, or share a
            referral link and they register themselves.
          </p>
        </div>
        <Link to="/rm/onboarding/new">
          <Button>
            <PlusIcon className="mr-1.5 size-4" />
            New client
          </Button>
        </Link>
      </div>

      <ReferralLinks />

      {isLoading ? (
        <p className="py-12 text-center text-muted-foreground">Loading clients...</p>
      ) : clients.length === 0 ? (
        <div className="border-y py-16 text-center">
          <p className="font-medium">No clients yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Create an account for a client, or share a referral link, and they appear here.
          </p>
        </div>
      ) : (
        <div>
          <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {clients.length} client{clients.length === 1 ? "" : "s"} · {waitingOnClient} waiting on
            the client · {waitingOnLuca} waiting on LUCA
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Onboarding</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map(({ client, stage }) => {
                const to = client.prepared_by_rm
                  ? `/rm/onboarding/${client.id}`
                  : `/rm/clients/${client.id}/status`;
                return (
                  <TableRow key={client.id} className="cursor-pointer" onClick={() => navigate(to)}>
                    <TableCell>
                      <Link
                        to={to}
                        className="font-medium hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {client.full_name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{client.email}</p>
                    </TableCell>
                    <TableCell className="text-sm">
                      {client.referral?.partner_firm ??
                        (client.prepared_by_rm
                          ? "Prepared by you"
                          : client.referral?.via === "rm_invite" || client.referral?.rm_id
                            ? "Your referral"
                            : "Direct signup")}
                    </TableCell>
                    <TableCell>
                      <span className={`text-sm font-medium ${STAGE_COLOUR[stage.waitingOn]}`}>
                        {stage.label}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {client.reference ?? (
                        <span className="text-muted-foreground">
                          {stage.key === "declined" ? "—" : "Pending"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatDate(client.created_at)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
