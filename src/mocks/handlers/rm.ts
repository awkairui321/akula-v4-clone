import { validUploadedFile, type UploadedFile } from "@/lib/file-upload";
import { http, HttpResponse } from "msw";
import {
  communications,
  communicationRecipients,
  nextCommunicationId,
  nextCommunicationRecipientId,
  adminInvestors,
  allRequiredConsentsGranted,
  referenceFor,
  currentUser,
  users,
  investorProfiles,
  documents,
  verificationDocumentsByInvestor,
  addAdminInvestorSeed,
  findAdminInvestorSeed,
  findInvestorProfileByUserId,
  findUserByEmail,
  findUserById,
  investorOnboardingComplete,
  logEvent,
  nextDocumentId,
  nextInvestorUserId,
  recordClientEvent,
  referralCodes,
  tokenFor,
  type MockUser,
} from "../db";
import { assignClientToRm, persist, recordAudit, workflow } from "../workflow";
import { attachReferral } from "../onboarding";
import { documentKindLabel } from "@/lib/document-catalogue";
import {
  RM_DOCUMENT_KINDS,
  type ClientPreparation,
  type PreparationStage,
  type PreparedClient,
} from "@/lib/rm-onboarding";

/**
 * RM-prepared onboarding. The RM supplies details and documents; the investor activates the
 * account, reviews it and completes eligibility, identity, NDA and consents themselves.
 */

const PROFILE_FIELDS = [
  "first_name",
  "last_name",
  "nationality",
  "date_of_birth",
  "country",
  "phone",
  "typical_ticket_size",
] as const;

const MAX_DATA_URL = 2_800_000;
const FILE_PATTERN = /^data:(application\/pdf|image\/(png|jpeg));base64,[A-Za-z0-9+/]+={0,2}$/;

function fail(error: string, status = 422) {
  return HttpResponse.json({ error }, { status });
}

function actor(request: Request): MockUser | null {
  const user = currentUser(request);
  return user && ["rm", "luca"].includes(user.role) ? user : null;
}

function mayAct(user: MockUser, investorId: number) {
  if (user.role === "luca") return true;
  return workflow.assignments.some((a) => a.investorId === investorId && a.staffId === user.id);
}

function rmName(user: MockUser) {
  return user.role === "luca" ? "LUCA Fund Manager" : "LUCA RM";
}

function stageOf(user: MockUser): PreparationStage {
  const profile = findInvestorProfileByUserId(user.id)!;
  if (user.invitation_ready === false) return "preparing";
  if (user.invite_token) return "invited";
  if (!profile.prepared_by_rm?.confirmed_at) return "reviewing";
  if (
    user.nda_status === "signed" &&
    profile.eligibility_confirmed_at &&
    allRequiredConsentsGranted(user.id) &&
    preparedDocuments(user.id).every((d) => d.confirmed_at) &&
    user.kyc_status === "pending"
  )
    return "pending_approval";
  return investorOnboardingComplete(profile, user)
    ? findAdminInvestorSeed(user.id)?.verification_status === "approved"
      ? "complete"
      : "pending_approval"
    : "verifying";
}

function fullName(user: MockUser) {
  const profile = findInvestorProfileByUserId(user.id);
  return profile ? `${profile.first_name} ${profile.last_name}`.trim() : user.email;
}

function preparedDocuments(investorId: number) {
  return (verificationDocumentsByInvestor[investorId] ?? [])
    .filter((doc) => doc.uploaded_by)
    .map((doc) => ({
      id: doc.id,
      name: doc.notes ?? documentKindLabel(doc.document_type),
      kind: doc.document_type,
      created_at: doc.created_at,
      uploaded_by: doc.uploaded_by!,
      confirmed_at: doc.confirmed_at ?? null,
    }));
}

function summarise(user: MockUser): PreparedClient {
  const profile = findInvestorProfileByUserId(user.id)!;
  const seed = findAdminInvestorSeed(user.id);
  const docs = preparedDocuments(user.id);
  return {
    id: user.id,
    client_code: referenceFor(user.id),
    full_name: fullName(user),
    email: user.email,
    country: profile.country || null,
    investor_type: seed?.investor_type ?? "individual",
    stage: stageOf(user),
    activated_at: user.activated_at ?? null,
    prepared_at: profile.prepared_by_rm!.prepared_at,
    rm_name: profile.prepared_by_rm!.rm_name,
    document_count: docs.length,
    documents_confirmed: docs.filter((d) => d.confirmed_at).length,
  };
}

function detail(user: MockUser): ClientPreparation {
  const profile = findInvestorProfileByUserId(user.id)!;
  const documentsList = preparedDocuments(user.id);
  const stage = stageOf(user);
  return {
    client: summarise(user),
    profile: {
      first_name: profile.first_name,
      last_name: profile.last_name,
      nationality: profile.nationality,
      date_of_birth: profile.date_of_birth,
      country: profile.country,
      phone: profile.phone,
      typical_ticket_size: profile.typical_ticket_size,
    },
    documents: documentsList,
    invite_path:
      user.invitation_ready !== false && user.invite_token
        ? `/activate?token=${user.invite_token}`
        : null,
    editable: !profile.prepared_by_rm?.confirmed_at,
    checklist: [
      { label: "Client details entered", done: Boolean(profile.first_name), owner: "rm" },
      { label: "Documents uploaded", done: documentsList.length > 0, owner: "rm" },
      { label: "Account activated", done: !user.invite_token, owner: "investor" },
      {
        label: "Details reviewed and confirmed",
        done: Boolean(profile.prepared_by_rm?.confirmed_at),
        owner: "investor",
      },
      {
        label: "Eligibility confirmed",
        done: Boolean(profile.eligibility_confirmed_at),
        owner: "investor",
      },
      { label: "Identity check complete", done: user.kyc_status === "approved", owner: "investor" },
      { label: "NDA signed", done: user.nda_status === "signed", owner: "investor" },
      { label: "Onboarding complete", done: stage === "complete", owner: "investor" },
    ],
  };
}

function preparedClientFor(request: Request, rawId: string | readonly string[] | undefined) {
  const user = actor(request);
  if (!user) return { error: fail("Relationship manager access required.", 403) } as const;
  const investorId = Number(rawId);
  const client = findUserById(investorId);
  const profile = client && findInvestorProfileByUserId(client.id);
  if (!client || !profile?.prepared_by_rm)
    return { error: fail("Prepared account not found.", 404) } as const;
  if (!mayAct(user, investorId))
    return {
      error: fail("This client is assigned to another relationship manager.", 403),
    } as const;
  return { user, client, profile } as const;
}

function newToken(userId: number) {
  return `inv-${userId}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanProfilePatch(patch: Record<string, unknown>) {
  const out: Record<string, string> = {};
  for (const key of PROFILE_FIELDS) {
    const value = patch[key];
    if (typeof value === "string") out[key] = value.trim();
  }
  return out;
}

function validateProfile(values: Record<string, string>) {
  if (values.date_of_birth) {
    const dob = new Date(values.date_of_birth);
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 18);
    if (Number.isNaN(dob.getTime()) || dob > cutoff)
      return "The investor must be at least 18 years old.";
  }
  return null;
}

export const rmHandlers = [
  http.get("*/api/v1/rm/communications", ({ request }) => {
    const user = actor(request);
    if (!user) return fail("RM access required.", 403);
    return HttpResponse.json({
      communications: communications
        .filter((c) => c.created_by === user.id)
        .map((c) => ({
          ...c,
          recipient_count: 1,
          delivered_count: 1,
          opened_count: communicationRecipients.filter(
            (r) => r.communication_id === c.id && r.opened_at,
          ).length,
        })),
    });
  }),
  http.post("*/api/v1/rm/communications", async ({ request }) => {
    const user = actor(request);
    if (!user) return fail("RM access required.", 403);
    const body = (await request.json()) as {
      investor_id?: number;
      subject?: string;
      body?: string;
      uploaded_attachments?: UploadedFile[];
    };
    const investorId = Number(body.investor_id);
    if (!mayAct(user, investorId)) return fail("This client belongs to another RM.", 403);
    const client = adminInvestors().find((c) => c.id === investorId);
    if (!client) return fail("Client not found.", 404);
    if (
      typeof body.subject !== "string" ||
      !body.subject.trim() ||
      typeof body.body !== "string" ||
      !body.body.trim()
    )
      return fail("Enter a subject and message.");
    const files = body.uploaded_attachments ?? [];
    if (!Array.isArray(files) || files.length > 5 || !files.every(validUploadedFile))
      return fail("Attach up to five PDF, PNG or JPEG files up to 2 MB each.");
    const at = new Date().toISOString();
    const id = nextCommunicationId();
    const communication = {
      id,
      created_by: user.id,
      subject: body.subject.trim(),
      body: body.body.trim(),
      purpose: "client_update",
      audience_type: "individual" as const,
      audience_description: client.full_name,
      fund_id: null,
      routing: "direct" as const,
      attachment_document_ids: [],
      uploaded_attachments: files,
      delivery_channels: ["email", "inbox"] as ("email" | "inbox")[],
      status: "sent" as const,
      scheduled_at: null,
      sent_at: at,
      created_at: at,
    };
    communications.unshift(communication);
    communicationRecipients.push({
      id: nextCommunicationRecipientId(),
      communication_id: id,
      investor_id: client.id,
      investor_name: client.full_name,
      investor_email: client.email,
      eam_firm: client.eam_firm,
      routed_via: "investor",
      email_status: "pending_integration",
      delivered_at: at,
      opened_at: null,
      downloaded_document_ids: [],
    });
    recordAudit(user.id, "RM sent a client communication.");
    persist();
    return HttpResponse.json({ communication }, { status: 201 });
  }),
  // GET /api/v1/rm/onboarding — accounts this RM has prepared
  http.get("*/api/v1/rm/onboarding", ({ request }) => {
    const user = actor(request);
    if (!user) return fail("Relationship manager access required.", 403);
    const clients = users
      .filter((u) => findInvestorProfileByUserId(u.id)?.prepared_by_rm && mayAct(user, u.id))
      .map(summarise)
      .sort((a, b) => b.prepared_at.localeCompare(a.prepared_at));
    return HttpResponse.json({ clients });
  }),

  // POST /api/v1/rm/clients — create an account for a client
  http.post("*/api/v1/rm/clients", async ({ request }) => {
    const rm = actor(request);
    if (!rm) return fail("Relationship manager access required.", 403);
    const body = (await request.json()) as { email?: string; partner_firm?: string } & Record<
      string,
      unknown
    >;
    const email = body.email?.trim().toLowerCase() ?? "";
    const partnerCode = body.partner_firm
      ? referralCodes.find((r) => r.partner_firm === body.partner_firm)
      : undefined;
    if (body.partner_firm && !partnerCode) return fail("Choose one of the listed partner firms.");
    const values = cleanProfilePatch(body);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("Enter a valid email address.");
    if (!values.first_name || !values.last_name) return fail("Enter the client's legal name.");
    if (findUserByEmail(email)) return fail("An account with this email already exists.");
    const problem = validateProfile(values);
    if (problem) return fail(problem);

    const id = nextInvestorUserId();
    const at = new Date().toISOString();
    const fields = PROFILE_FIELDS.filter((key) => values[key]);
    users.push({
      id,
      email,
      password: "",
      role: "investor",
      verified: false,
      two_factor_enabled: false,
      otp_secret: null,
      has_investor_profile: true,
      has_eam_profile: false,
      nda_status: "not_started",
      kyc_status: "not_started",
      _kycPollCount: 0,
      _ndaPollCount: 0,
      invite_token: newToken(id),
      invitation_ready: false,
      activated_at: null,
      provisioned_by: rm.id,
    });
    investorProfiles.push({
      id: investorProfiles.length + 1,
      user_id: id,
      first_name: values.first_name,
      preferred_first_name: null,
      middle_name: null,
      last_name: values.last_name,
      suffix: null,
      nationality: values.nationality || null,
      date_of_birth: values.date_of_birth || null,
      country: values.country ?? "",
      phone: values.phone ?? "",
      interested_industries: null,
      typical_ticket_size: values.typical_ticket_size || null,
      onboarding_step: 0,
      completed: false,
      skipped: false,
      // An RM-referred client is partner-referred from the start; the RM stays tagged on the account.
      channel: "eam_referred",
      referral_code: null,
      accreditation_basis: null,
      eligibility_confirmed_at: null,
      eam_firm: null,
      eam_name: null,
      referral: { code: null, via: "rm_invite", rm_id: rm.id, partner_firm: null },
      prepared_by_rm: {
        rm_id: rm.id,
        rm_name: rmName(rm),
        prepared_at: at,
        fields: [...fields],
        confirmed_at: null,
      },
    });
    addAdminInvestorSeed({
      id,
      full_name: `${values.first_name} ${values.last_name}`,
      email,
      investor_type: "individual",
      country: values.country || null,
      nationality: values.nationality || null,
      onboarding_step: 0,
      onboarding_completed_at: null,
      verification_status: "pending",
      identity_status: "not_started",
      accreditation_status: "not_started",
      accreditation_expiry: null,
      reviewed_at: null,
      nda_status: "not_started",
      eam_firm: null,
      internal_notes: "",
      registered_at: at,
      referral: { code: null, via: "rm_invite", rm_id: rm.id, partner_firm: null },
    });
    assignClientToRm(id, rm.id);
    recordClientEvent(id, "registered", `${rmName(rm)} created the account.`, rmName(rm));

    // A partner named by the RM is tagged too; the RM stays the covering RM.
    if (partnerCode) attachReferral(id, partnerCode.code, "rm_invite", rm.id);
    else recordClientEvent(id, "referred", `Referred by ${rmName(rm)}.`, rmName(rm));
    recordAudit(
      rm.id,
      `${rmName(rm)} created an account for ${values.first_name} ${values.last_name} (${referenceFor(id)}).`,
    );
    logEvent(
      "status_change",
      `${rmName(rm)} prepared an account for ${values.first_name} ${values.last_name}; documents prepared before invitation.`,
      { investorId: id },
    );
    persist();
    return HttpResponse.json({ client: summarise(findUserById(id)!) }, { status: 201 });
  }),

  // GET /api/v1/rm/clients/:id/onboarding
  http.get("*/api/v1/rm/clients/:id/onboarding", ({ request, params }) => {
    const found = preparedClientFor(request, params.id);
    if ("error" in found) return found.error;
    return HttpResponse.json(detail(found.client));
  }),

  // PATCH /api/v1/rm/clients/:id/onboarding — edit what the RM entered, until the investor confirms
  http.patch("*/api/v1/rm/clients/:id/onboarding", async ({ request, params }) => {
    const found = preparedClientFor(request, params.id);
    if ("error" in found) return found.error;
    const { user, client, profile } = found;
    if (profile.prepared_by_rm!.confirmed_at)
      return fail("The investor has confirmed these details. Ask them to update their profile.");
    const values = cleanProfilePatch((await request.json()) as Record<string, unknown>);
    if (!values.first_name && "first_name" in values) return fail("Enter the client's legal name.");
    const problem = validateProfile(values);
    if (problem) return fail(problem);
    Object.assign(profile, {
      ...values,
      nationality: values.nationality === "" ? null : (values.nationality ?? profile.nationality),
      date_of_birth:
        values.date_of_birth === "" ? null : (values.date_of_birth ?? profile.date_of_birth),
      typical_ticket_size:
        values.typical_ticket_size === ""
          ? null
          : (values.typical_ticket_size ?? profile.typical_ticket_size),
    });
    profile.prepared_by_rm!.fields = PROFILE_FIELDS.filter((key) => {
      const value = profile[key as keyof typeof profile];
      return typeof value === "string" ? value.trim() !== "" : Boolean(value);
    });
    const seed = findAdminInvestorSeed(client.id);
    if (seed) {
      seed.full_name = `${profile.first_name} ${profile.last_name}`.trim();
      seed.country = profile.country || null;
      seed.nationality = profile.nationality;
    }
    recordAudit(user.id, `${rmName(user)} updated the prepared details for ${fullName(client)}.`);
    persist();
    return HttpResponse.json(detail(client));
  }),

  // POST /api/v1/rm/clients/:id/documents
  http.post("*/api/v1/rm/clients/:id/documents", async ({ request, params }) => {
    const found = preparedClientFor(request, params.id);
    if ("error" in found) return found.error;
    const { user, client, profile } = found;
    const body = (await request.json()) as { name?: string; kind?: string; file_data_url?: string };
    if (!(RM_DOCUMENT_KINDS as readonly string[]).includes(body.kind ?? ""))
      return fail("Choose a document type an RM can supply.");
    if (
      !body.name?.trim() ||
      !body.file_data_url ||
      !FILE_PATTERN.test(body.file_data_url) ||
      body.file_data_url.length > MAX_DATA_URL
    )
      return fail("Choose a PDF, PNG or JPEG document up to 2 MB.");
    const id = nextDocumentId();
    const created_at = new Date().toISOString();
    const uploaded_by = { id: user.id, role: "rm" as const, name: rmName(user) };
    (verificationDocumentsByInvestor[client.id] ??= []).push({
      id,
      document_type: body.kind!,
      status: "pending",
      notes: body.name.trim(),
      has_file: true,
      created_at,
      uploaded_by,
      confirmed_at: null,
    });
    documents.push({
      id,
      name: body.name.trim(),
      kind: body.kind!,
      status: "action_required",
      review_state: "received",
      has_file: true,
      file_data_url: body.file_data_url,
      fund_id: null,
      fund_name: null,
      subscription_id: null,
      owner_id: client.id,
      owner_name: `${profile.first_name} ${profile.last_name}`.trim(),
      owner_email: client.email,
      created_at,
      uploaded_by,
      confirmed_at: null,
    });
    recordAudit(
      user.id,
      `${rmName(user)} uploaded ${documentKindLabel(body.kind!)} for ${fullName(client)}.`,
    );
    recordClientEvent(
      client.id,
      "documents",
      `${documentKindLabel(body.kind!)} uploaded for the client; awaiting their confirmation.`,
      rmName(user),
      ["luca", "rm", "investor"],
    );
    logEvent(
      "document_uploaded",
      `${rmName(user)} uploaded ${documentKindLabel(body.kind!)} for ${fullName(client)}; awaiting investor confirmation.`,
      { investorId: client.id },
    );
    persist();
    return HttpResponse.json(detail(client), { status: 201 });
  }),

  // DELETE /api/v1/rm/clients/:id/documents/:docId — only before the investor has confirmed it
  http.delete("*/api/v1/rm/clients/:id/documents/:docId", ({ request, params }) => {
    const found = preparedClientFor(request, params.id);
    if ("error" in found) return found.error;
    const { user, client } = found;
    const docId = Number(params.docId);
    const list = verificationDocumentsByInvestor[client.id] ?? [];
    const doc = list.find((d) => d.id === docId && d.uploaded_by);
    if (!doc) return fail("Document not found.", 404);
    if (doc.confirmed_at) return fail("The investor has confirmed this document.");
    list.splice(list.indexOf(doc), 1);
    const row = documents.findIndex((d) => d.id === docId);
    if (row !== -1) documents.splice(row, 1);
    recordAudit(user.id, `${rmName(user)} removed a document for ${fullName(client)}.`);
    persist();
    return HttpResponse.json(detail(client));
  }),

  // POST /api/v1/rm/clients/:id/invite — issue a fresh invitation link
  http.post("*/api/v1/rm/clients/:id/invite", ({ request, params }) => {
    const found = preparedClientFor(request, params.id);
    if ("error" in found) return found.error;
    const { user, client } = found;
    if (!client.invite_token) return fail("This investor has already activated their account.");
    if (client.invitation_ready === false && preparedDocuments(client.id).length === 0)
      return fail("Upload the client documents before generating their invitation.");
    client.invitation_ready = true;
    client.invite_token = newToken(client.id);
    recordAudit(user.id, `${rmName(user)} re-sent the invitation to ${fullName(client)}.`);
    persist();
    return HttpResponse.json(detail(client));
  }),

  // GET /api/v1/public/activation?token= — who the invitation is for
  http.get("*/api/v1/public/activation", ({ request }) => {
    const token = new URL(request.url).searchParams.get("token");
    const client = token ? users.find((u) => u.invite_token === token) : undefined;
    const profile = client && findInvestorProfileByUserId(client.id);
    if (!client || client.invitation_ready === false || !profile?.prepared_by_rm)
      return fail("This invitation is no longer valid.", 404);
    return HttpResponse.json({
      email: client.email,
      first_name: profile.first_name,
      rm_name: profile.prepared_by_rm.rm_name,
    });
  }),

  // POST /api/v1/public/activate — the investor sets their own password
  http.post("*/api/v1/public/activate", async ({ request }) => {
    const body = (await request.json()) as {
      token?: string;
      password?: string;
      password_confirmation?: string;
    };
    const client = body.token ? users.find((u) => u.invite_token === body.token) : undefined;
    if (!client || client.invitation_ready === false)
      return fail("This invitation is no longer valid.", 404);
    if (!body.password || body.password.length < 8)
      return fail("Choose a password of at least 8 characters.");
    if (body.password !== body.password_confirmation) return fail("The passwords do not match.");
    client.password = body.password;
    client.verified = true;
    client.invite_token = null;
    client.activated_at = new Date().toISOString();
    recordAudit(client.id, `${fullName(client)} activated their account.`);
    recordClientEvent(
      client.id,
      "milestone",
      "Activated their account from the invitation.",
      fullName(client),
    );
    persist();
    return HttpResponse.json(
      { user: { id: client.id } },
      { headers: { Authorization: `Bearer ${tokenFor(client.id)}` } },
    );
  }),
];
