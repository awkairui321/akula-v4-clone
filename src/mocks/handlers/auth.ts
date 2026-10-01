import { http, HttpResponse } from "msw";
import {
  findUserByEmail,
  findUserById,
  currentUser,
  publicUser,
  tokenFor,
  investorProfiles,
  users,
  type MockUser,
} from "../db";

function authHeaders(userId: number): HeadersInit {
  return { Authorization: `Bearer ${tokenFor(userId)}` };
}

function unauthorized() {
  return HttpResponse.json({ error: "Not authenticated" }, { status: 401 });
}

export const authHandlers = [
  // GET /api/v1/me
  http.get("*/api/v1/me", ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();

    return HttpResponse.json({ user: publicUser(user) });
  }),

  // POST /api/v1/login
  http.post("*/api/v1/login", async ({ request }) => {
    const body = (await request.json()) as {
      user?: { email?: string; password?: string; otp_attempt?: string };
    };
    const { email, password, otp_attempt } = body.user ?? {};

    if (!email || !password) {
      return HttpResponse.json({ error: "Email and password are required" }, { status: 422 });
    }

    const user = findUserByEmail(email);
    if (!user || user.password !== password) {
      return HttpResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    if (user.two_factor_enabled) {
      if (!otp_attempt) {
        return HttpResponse.json({ two_factor_required: true });
      }
      if (!/^\d{6}$/.test(otp_attempt)) {
        return HttpResponse.json({ error: "Invalid authentication code" }, { status: 422 });
      }
    }

    return HttpResponse.json({ user: { id: user.id } }, { headers: authHeaders(user.id) });
  }),

  // DELETE /api/v1/logout
  http.delete("*/api/v1/logout", () => {
    return HttpResponse.json({});
  }),

  // POST /api/v1/public/signup
  http.post("*/api/v1/public/signup", async ({ request }) => {
    const body = (await request.json()) as {
      user?: { email?: string; password?: string; password_confirmation?: string };
    };
    const { email, password, password_confirmation } = body.user ?? {};

    if (!email || !password || password !== password_confirmation) {
      return HttpResponse.json({ error: "Invalid signup details" }, { status: 422 });
    }
    if (findUserByEmail(email)) {
      return HttpResponse.json({ error: "Email is already registered" }, { status: 422 });
    }

    const newUser: MockUser = {
      id: Math.max(...users.map((u) => u.id), 0) + 1,
      email,
      password,
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
    };
    users.push(newUser);
    investorProfiles.push({
      id: investorProfiles.length + 1,
      user_id: newUser.id,
      first_name: "",
      preferred_first_name: null,
      middle_name: null,
      last_name: "",
      suffix: null,
      nationality: null,
      date_of_birth: null,
      country: "",
      phone: "",
      interested_industries: null,
      typical_ticket_size: null,
      onboarding_step: 0,
      completed: false,
      skipped: false,
      channel: null,
      referral_code: null,
      accreditation_basis: null,
      eligibility_confirmed_at: null,
      eam_firm: null,
      eam_name: null,
    });

    return HttpResponse.json({ user: { id: newUser.id } }, { headers: authHeaders(newUser.id) });
  }),

  // GET /api/v1/public/confirm
  http.get("*/api/v1/public/confirm", ({ request }) => {
    const url = new URL(request.url);
    const token = url.searchParams.get("confirmation_token");
    if (!token) {
      return HttpResponse.json({ error: "Missing confirmation token" }, { status: 422 });
    }
    return HttpResponse.json({});
  }),

  // POST /api/v1/public/password (forgot password) and
  // PATCH /api/v1/public/password (reset password)
  http.post("*/api/v1/public/password", async () => {
    // Always succeed without revealing whether the email exists.
    return HttpResponse.json({});
  }),
  http.patch("*/api/v1/public/password", async ({ request }) => {
    const body = (await request.json()) as {
      user?: { reset_password_token?: string; password?: string; password_confirmation?: string };
    };
    const { reset_password_token, password, password_confirmation } = body.user ?? {};
    if (!reset_password_token) {
      return HttpResponse.json({ error: "Reset token is invalid or has expired" }, { status: 422 });
    }
    if (!password || password !== password_confirmation || password.length < 6) {
      return HttpResponse.json({ error: "Passwords do not match" }, { status: 422 });
    }
    return HttpResponse.json({});
  }),

  // POST /api/v1/two_factor/setup
  http.post("*/api/v1/two_factor/setup", ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const secret = "JBSWY3DPEHPK3PXP" + String(user.id).padStart(2, "0");
    user.otp_secret = secret;
    const provisioning_uri = `otpauth://totp/Akula:${encodeURIComponent(user.email)}?secret=${secret}&issuer=Akula`;
    return HttpResponse.json({ otp_secret: secret, provisioning_uri });
  }),

  // POST /api/v1/two_factor/verify
  http.post("*/api/v1/two_factor/verify", async ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const body = (await request.json()) as { otp_code?: string };
    if (!body.otp_code || !/^\d{6}$/.test(body.otp_code)) {
      return HttpResponse.json({ error: "Invalid verification code" }, { status: 422 });
    }
    user.two_factor_enabled = true;
    return HttpResponse.json({});
  }),

  // PATCH /api/v1/two_factor (kept for symmetry with the spec)
  http.patch("*/api/v1/two_factor", async ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    return HttpResponse.json({ user: publicUser(user) });
  }),

  // DELETE /api/v1/two_factor (disable)
  http.delete("*/api/v1/two_factor", async ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const body = (await request.json().catch(() => ({}))) as { password?: string };
    if (body.password !== user.password) {
      return HttpResponse.json({ error: "Incorrect password" }, { status: 422 });
    }
    user.two_factor_enabled = false;
    user.otp_secret = null;
    return HttpResponse.json({});
  }),

  // PATCH /api/v1/account/password
  http.patch("*/api/v1/account/password", async ({ request }) => {
    const user = currentUser(request);
    if (!user) return unauthorized();
    const body = (await request.json()) as {
      current_password?: string;
      password?: string;
      password_confirmation?: string;
    };
    if (body.current_password !== user.password) {
      return HttpResponse.json({ error: "Current password is incorrect" }, { status: 422 });
    }
    if (!body.password || body.password !== body.password_confirmation) {
      return HttpResponse.json({ error: "New passwords do not match" }, { status: 422 });
    }
    user.password = body.password;
    return HttpResponse.json({});
  }),
];

// Re-exported for handlers that need to look up a user by id without
// importing the whole db module (keeps import lists short elsewhere).
export { findUserById };
