import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { api } from "@/lib/api";
import {
  PREPARATION_STAGE_LABELS,
  type PreparationStage,
  type PreparedClient,
} from "@/lib/rm-onboarding";
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

/** The RM's working list: accounts they started for clients and where each one is waiting. */
export default function RmOnboardingList() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["rm", "onboarding"],
    queryFn: () => api<{ clients: PreparedClient[] }>("/api/v1/rm/onboarding"),
  });
  const clients = data?.clients ?? [];
  const waitingOnInvestor = clients.filter((c) => c.stage !== "complete").length;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Client onboarding</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Start an account for a client and supply the details and documents you already hold. The
            client reviews it and completes the identity check, NDA and consents themselves.
          </p>
        </div>
        <Link to="/rm/onboarding/new">
          <Button>
            <PlusIcon className="mr-1.5 size-4" />
            New client
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <p className="py-12 text-center text-muted-foreground">Loading clients...</p>
      ) : clients.length === 0 ? (
        <div className="border-y py-16 text-center">
          <p className="font-medium">No accounts started yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Create an account for a client and they receive an invitation to review it.
          </p>
          <Link to="/rm/onboarding/new">
            <Button variant="outline" size="sm" className="mt-4">
              Create client account
            </Button>
          </Link>
        </div>
      ) : (
        <div>
          <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {clients.length} account{clients.length === 1 ? "" : "s"} · {waitingOnInvestor} not yet
            complete
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Documents you supplied</TableHead>
                <TableHead className="text-right">Started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
                <TableRow
                  key={client.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/rm/onboarding/${client.id}`)}
                >
                  <TableCell>
                    <Link
                      to={`/rm/onboarding/${client.id}`}
                      className="font-medium hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {client.full_name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {client.email} · {client.client_code}
                    </p>
                  </TableCell>
                  <TableCell>
                    <StageLabel stage={client.stage} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {client.document_count === 0 ? (
                      <span className="text-muted-foreground">None yet</span>
                    ) : (
                      <>
                        {client.document_count}
                        <span className="text-xs text-muted-foreground">
                          {" "}
                          · {client.documents_confirmed} confirmed
                        </span>
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatDate(client.prepared_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
