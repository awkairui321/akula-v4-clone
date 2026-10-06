import { canManageOfferingRequest } from "@/lib/permissions";
import { http, HttpResponse } from "msw";
import { currentUser } from "../db";
// A preflight handler applies to both Service Worker and embedded-browser transport.
export const guardHandlers = [
  http.all("*/api/v1/*", ({ request }) => {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/v1/public/") || ["/api/v1/login", "/api/v1/logout"].includes(path))
      return;
    const user = currentUser(request);
    if (!user) return HttpResponse.json({ error: "Sign in first" }, { status: 401 });
    if (
      path.startsWith("/api/v1/admin/") &&
      user.role !== "luca" &&
      !(user.role === "investment_team" && canManageOfferingRequest(request))
    )
      return HttpResponse.json(
        { error: "LUCA manager access required. Use your workflow workspace." },
        { status: 403 },
      );
    if (path.startsWith("/api/v1/eam/") && !user.has_eam_profile)
      return HttpResponse.json({ error: "External institution profile required" }, { status: 403 });
  }),
];
