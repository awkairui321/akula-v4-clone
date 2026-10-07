import type { AdminInvestor } from "./types";

export type StageKey =
  | "invited"
  | "details"
  | "identity"
  | "nda"
  | "review"
  | "onboarded"
  | "rejected";

export type ClientStage = {
  key: StageKey;
  label: string;
  /** Who has to act next. */
  waitingOn: "client" | "luca" | "none";
};

/** Where a client is in onboarding, and who it is waiting on. */
export function clientStage(i: AdminInvestor): ClientStage {
  if (i.invite_pending)
    return { key: "invited", label: "Invitation not yet opened", waitingOn: "client" };
  if (i.verification_status === "rejected")
    return { key: "rejected", label: "Rejected", waitingOn: "none" };
  if (i.verification_status === "approved")
    return { key: "onboarded", label: "Onboarded", waitingOn: "none" };
  // LUCA has marked this one as in review, whatever the client's own progress says.
  if (i.verification_status === "in_review")
    return { key: "review", label: "Awaiting LUCA review", waitingOn: "luca" };
  if (!i.onboarding_completed_at && (i.onboarding_step ?? 0) < 4)
    return { key: "details", label: "Completing details", waitingOn: "client" };
  if (i.identity_status !== "verified")
    return { key: "identity", label: "Identity check", waitingOn: "client" };
  if (i.nda_status !== "signed") return { key: "nda", label: "NDA to sign", waitingOn: "client" };
  return { key: "review", label: "Awaiting LUCA review", waitingOn: "luca" };
}
