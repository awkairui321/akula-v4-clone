import { http, HttpResponse } from "msw";
import {
  adminInvestors,
  currentUser,
  documents,
  findAdminInvestorSeed,
  findEamProfileByUserId,
  findReferralCode,
  referralCodes,
  type MockUser,
  users,
} from "../db";
import { workflow } from "../workflow";
import {
  applyReview,
  eventsFor,
  investorReviewStatus,
  resubmit,
  reviewBundle,
  rmLabel,
  type ReviewInput,
} from "../onboarding";
import { DEAL_MATERIAL_KINDS } from "../../lib/document-catalogue";

function fail(error: string, status = 422) {
  return HttpResponse.json({ error }, { status });
}
const staffOnly = (user: MockUser | null) =>
  user && ["luca", "rm"].includes(user.role) ? user : null;
const mayReach = (user: MockUser, investorId: number) =>
  user.role === "luca" ||
  workflow.assignments.some((a) => a.investorId === investorId && a.staffId === user.id);

/** One client record read by every portal; each sees only what its role allows. */
export const clientHandlers = [
  // A signup link's owner, so the page can say who referred the visitor.
  http.get("*/api/v1/public/referral", ({ request }) => {
    const ref = findReferralCode(new URL(request.url).searchParams.get("code"));
    if (!ref) return fail("This referral link is not valid.", 404);
    return HttpResponse.json({
      code: ref.code,
      label: ref.label,
      partner_firm: ref.partner_firm,
      rm: rmLabel(ref.rm_id),
    });
  }),

  // The relationship managers a client can be assigned to.
  http.get("*/api/v1/admin/rms", ({ request }) => {
    const user = currentUser(request);
    if (user?.role !== "luca") return fail("Fund Manager access required.", 403);
    return HttpResponse.json({
      rms: users.filter((u) => u.role === "rm").map((u) => ({ id: u.id, label: rmLabel(u.id) })),
    });
  }),

  // The Fund Manager's review of one client.
  http.get("*/api/v1/admin/investors/:id/review", ({ request, params }) => {
    const user = currentUser(request);
    if (user?.role !== "luca") return fail("Fund Manager access required.", 403);
    const bundle = reviewBundle(Number(params.id));
    return bundle ? HttpResponse.json(bundle) : fail("Client not found.", 404);
  }),
  http.post("*/api/v1/admin/investors/:id/review", async ({ request, params }) => {
    const user = currentUser(request);
    if (user?.role !== "luca") return fail("Fund Manager access required.", 403);
    const id = Number(params.id);
    if (!findAdminInvestorSeed(id)) return fail("Client not found.", 404);
    const input = (await request.json()) as ReviewInput;
    if (!["approve", "request_info", "decline"].includes(input.decision))
      return fail("Choose approve, request information or decline.");
    const result = applyReview(id, user, input);
    return result.ok ? HttpResponse.json(reviewBundle(id)) : fail(result.error);
  }),

  // The timeline, as the viewer's role is allowed to read it.
  http.get("*/api/v1/clients/:id/events", ({ request, params }) => {
    const user = currentUser(request);
    if (!user) return fail("Sign in first.", 401);
    return HttpResponse.json({ events: eventsFor(user, Number(params.id)) });
  }),

  // An RM's (or the Fund Manager's) clients, with their onboarding standing.
  http.get("*/api/v1/rm/clients", ({ request }) => {
    const user = staffOnly(currentUser(request));
    if (!user) return fail("Relationship manager access required.", 403);
    const clients = adminInvestors()
      .filter((i) => mayReach(user, i.id))
      .map((i) => ({
        ...i,
        internal_notes: "",
        rm_id: workflow.assignments.find((a) => a.investorId === i.id)?.staffId ?? null,
      }));
    return HttpResponse.json({ clients });
  }),
  // Documents and timeline for one assigned client. Private LUCA notes never travel with it.
  http.get("*/api/v1/rm/clients/:id/status", ({ request, params }) => {
    const user = staffOnly(currentUser(request));
    if (!user) return fail("Relationship manager access required.", 403);
    const id = Number(params.id);
    if (!mayReach(user, id))
      return fail("This client is assigned to another relationship manager.", 403);
    const bundle = reviewBundle(id);
    if (!bundle) return fail("Client not found.", 404);
    return HttpResponse.json({ ...bundle, events: eventsFor(user, id) });
  }),

  // The signup links an RM can share: their own, and those of the partners they cover.
  http.get("*/api/v1/rm/referral", ({ request }) => {
    const user = staffOnly(currentUser(request));
    if (!user) return fail("Relationship manager access required.", 403);
    return HttpResponse.json({
      links: referralCodes
        .filter((r) => r.rm_id === user.id)
        .map((r) => ({ code: r.code, label: r.label, partner_firm: r.partner_firm })),
    });
  }),

  // A partner's signup link: clients who use it are tagged to the firm and its covering RM.
  http.get("*/api/v1/eam/referral", ({ request }) => {
    const user = currentUser(request);
    const profile = user && findEamProfileByUserId(user.id);
    if (!profile) return fail("Partner access required.", 403);
    const code = referralCodes.find((r) => r.partner_firm === profile.firm_name);
    return HttpResponse.json({ code: code?.code ?? null, rm: code ? rmLabel(code.rm_id) : null });
  }),

  // The client's own standing.
  http.get("*/api/v1/onboarding/review", ({ request }) => {
    const user = currentUser(request);
    if (!user?.has_investor_profile) return fail("Not authenticated", 401);
    return HttpResponse.json(investorReviewStatus(user.id));
  }),
  http.post("*/api/v1/onboarding/resubmit", async ({ request }) => {
    const user = currentUser(request);
    if (!user?.has_investor_profile) return fail("Not authenticated", 401);
    const body = (await request.json().catch(() => ({}))) as { note?: string };
    const result = resubmit(user.id, body.note);
    return result.ok ? HttpResponse.json(investorReviewStatus(user.id)) : fail(result.error);
  }),
];

export const clientDocuments = (investorId: number) =>
  documents.filter((d) => d.owner_id === investorId && !DEAL_MATERIAL_KINDS.includes(d.kind));
