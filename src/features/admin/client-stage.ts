import type { AdminInvestor } from "./types";

export type StageKey =
  | "invited"
  | "details"
  | "documents"
  | "review"
  | "needs_info"
  | "declined"
  | "onboarded";

export type ClientStage = {
  key: StageKey;
  label: string;
  /** Who has to act next. */
  waitingOn: "client" | "luca" | "none";
};

/** The pipeline in order, with what each stage means for LUCA. */
export const PIPELINE: { key: StageKey; title: string; note: string }[] = [
  { key: "invited", title: "Invited", note: "Invitation sent; the client has not opened it." },
  {
    key: "details",
    title: "Completing details",
    note: "Registered; still filling in their profile.",
  },
  {
    key: "documents",
    title: "Identity and documents",
    note: "Details done; identity or accreditation evidence still to come.",
  },
  { key: "review", title: "Awaiting LUCA review", note: "Submitted. Verify and decide." },
  {
    key: "needs_info",
    title: "Needs more information",
    note: "LUCA asked for something; waiting for the client's reply.",
  },
  { key: "declined", title: "Declined", note: "Not accepted. The client may reapply." },
];

/** Where a client is in onboarding, and who it is waiting on. */
export function clientStage(i: AdminInvestor): ClientStage {
  if (i.invite_pending)
    return { key: "invited", label: "Invitation not yet opened", waitingOn: "client" };
  if (i.verification_status === "rejected")
    return { key: "declined", label: "Declined", waitingOn: "none" };
  if (i.verification_status === "approved")
    return { key: "onboarded", label: "Onboarded", waitingOn: "none" };
  if (i.needs_info)
    return { key: "needs_info", label: "Needs more information", waitingOn: "client" };
  // LUCA has the application, whatever the client's own progress says.
  if (i.verification_status === "in_review")
    return { key: "review", label: "Awaiting LUCA review", waitingOn: "luca" };
  if (!i.onboarding_completed_at && (i.onboarding_step ?? 0) < 4)
    return { key: "details", label: "Completing details", waitingOn: "client" };
  if (i.identity_status !== "verified")
    return { key: "documents", label: "Identity and documents", waitingOn: "client" };
  return { key: "review", label: "Awaiting LUCA review", waitingOn: "luca" };
}
