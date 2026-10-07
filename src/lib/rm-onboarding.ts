/**
 * RM-prepared onboarding. A LUCA relationship manager can create an account for a client and
 * supply the details and documents they already hold. Anything that is the investor's own
 * attestation (eligibility, NDA, identity check, consents) stays with the investor.
 */

export type PreparedByRm = {
  rm_id: number;
  rm_name: string;
  prepared_at: string;
  /** Profile fields the RM supplied, so the investor can see what to check. */
  fields: string[];
  /** Set when the investor completes the personal-information review. */
  confirmed_at: string | null;
};

export type UploadedBy = {
  id: number;
  role: "rm" | "investor";
  name: string;
};

/** Document kinds an RM can supply. Identity and attestations stay confirmed by the investor. */
export const RM_DOCUMENT_KINDS = [
  "passport",
  "proof_of_address",
  "accreditation_letter",
  "source_of_funds",
  "tax",
  "bank_details",
] as const;

/** Shown to the RM and the investor: the investor always has the final say. */
export const WHAT_INVESTOR_COMPLETES = [
  "Confirm eligibility",
  "Review and confirm the details your RM entered",
  "Confirm that every uploaded document belongs to you",
  "Complete the identity check",
  "Sign the NDA",
  "Grant consents",
] as const;

export type PreparationStage =
  | "preparing"
  | "pending_approval"
  | "invited"
  | "reviewing"
  | "verifying"
  | "complete";

export const PREPARATION_STAGE_LABELS: Record<PreparationStage, string> = {
  preparing: "Preparing documents",
  pending_approval: "Pending LUCA approval",
  invited: "Invitation link ready",
  reviewing: "Investor reviewing",
  verifying: "Identity, NDA and consents",
  complete: "Onboarding complete",
};

export type PreparedClient = {
  id: number;
  client_code: string;
  full_name: string;
  email: string;
  country: string | null;
  investor_type: "individual" | "institutional";
  stage: PreparationStage;
  activated_at: string | null;
  prepared_at: string;
  rm_name: string;
  document_count: number;
  documents_confirmed: number;
};

export type PreparedDocument = {
  id: number;
  name: string;
  kind: string;
  created_at: string;
  uploaded_by: UploadedBy;
  confirmed_at: string | null;
};

export type ClientPreparation = {
  client: PreparedClient;
  profile: {
    first_name: string;
    last_name: string;
    nationality: string | null;
    date_of_birth: string | null;
    country: string;
    phone: string;
    typical_ticket_size: string | null;
  };
  documents: PreparedDocument[];
  /** Present until the investor activates; an email integration would send this instead. */
  invite_path: string | null;
  /** Fields the RM can still edit. False once the investor has confirmed them. */
  editable: boolean;
  checklist: { label: string; done: boolean; owner: "rm" | "investor" }[];
};
