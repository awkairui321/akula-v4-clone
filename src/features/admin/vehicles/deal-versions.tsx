import { useAuth } from "@/contexts/auth-context";
import type { Version } from "@/lib/workflow-types";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Every version of one deal: who sent it, what was decided, and why. */
export default function DealVersions({ versions }: { versions: Version[] }) {
  const { user } = useAuth();
  const manager = user?.role === "luca";
  const who = (id?: number) =>
    id === user?.id ? "you" : manager ? "the Investment Team" : "the Fund Manager";
  const rows = [...versions].sort((a, b) => b.number - a.number);

  if (!rows.length) return <p className="text-sm text-muted-foreground">No versions yet.</p>;
  return (
    <ul className="divide-y border-y">
      {rows.map((v) => (
        <li key={v.id} className="space-y-0.5 py-3 text-sm">
          <p className="font-medium">
            Version {v.number} ·{" "}
            {v.status === "published"
              ? "Published"
              : v.status === "review"
                ? "Awaiting Fund Manager approval"
                : v.decision?.outcome === "returned"
                  ? "Sent back"
                  : "Draft"}
          </p>
          <p className="text-muted-foreground">
            {v.submittedBy !== undefined ? `Submitted by ${who(v.submittedBy)} · ` : ""}
            {formatDate(v.at)}
            {v.decision &&
              ` · ${v.decision.outcome === "published" ? "approved" : "sent back"} by ${who(v.decision.by)} on ${formatDate(v.decision.at)}`}
          </p>
          {v.note && <p className="text-muted-foreground">Note: {v.note}</p>}
          {v.decision?.outcome === "returned" && v.decision.text && (
            <p className="text-muted-foreground">Reason: {v.decision.text}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
