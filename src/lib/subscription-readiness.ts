/**
 * What an investor must have in place before they can start a subscription: identity and
 * accreditation approved by LUCA, the NDA signed, and every required consent granted. Checked when
 * they try to subscribe, so a gap is dealt with up front and not discovered when the funds arrive.
 * The same list is shown to the investor and used by the server to refuse a subscription.
 */

export type ReadinessIssue = {
  key: "identity" | "accreditation" | "nda" | "consents";
  title: string;
  detail: string;
  /** What the investor does about it, and where. */
  action: string;
  to: string;
};

export function readinessIssues(input: {
  kyc_status: string;
  nda_status: string;
  /** Titles of the required consents that are not granted. */
  missing_consents: string[];
  /** The proof behind their accredited investor declaration has passed its validity period. */
  accreditation_lapsed?: boolean;
}): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];

  if (input.kyc_status !== "approved") {
    const pending = input.kyc_status === "pending";
    const failed = input.kyc_status === "failed";
    issues.push({
      key: "identity",
      title: pending
        ? "LUCA is still reviewing your identity and accreditation"
        : failed
          ? "LUCA could not approve your identity or accreditation"
          : "Your identity and accreditation are not verified",
      detail: pending
        ? "You can subscribe as soon as LUCA has approved them."
        : failed
          ? "Check your messages for the reason. Once it is resolved you can subscribe."
          : "Complete identity verification so LUCA can approve your account.",
      action: pending || failed ? "Open messages" : "Verify identity",
      to: pending || failed ? "/messages" : "/onboarding/kyc",
    });
  }

  if (input.accreditation_lapsed) {
    issues.push({
      key: "accreditation",
      title: "Your accreditation proof has expired",
      detail:
        "Upload current documents so LUCA can confirm that you are still an accredited investor.",
      action: "Upload new proof",
      to: "/accredited-investor?renew=1",
    });
  }

  if (input.nda_status !== "signed") {
    issues.push({
      key: "nda",
      title: "The NDA is not signed",
      detail: "Sign the NDA before you subscribe to an opportunity.",
      action: "Sign the NDA",
      to: "/onboarding/nda",
    });
  }

  if (input.missing_consents.length > 0) {
    issues.push({
      key: "consents",
      title: "Required consents are not granted",
      detail: `Grant ${input.missing_consents.join(", ")} to subscribe.`,
      action: "Review consents",
      to: "/account#consent-privacy",
    });
  }

  return issues;
}
