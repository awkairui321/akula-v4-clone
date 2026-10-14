import { http, HttpResponse } from "msw";
import { currentUser } from "../db";
import { receiveAcclime } from "../acclime";
import type { AcclimeInbound } from "../../lib/acclime";

export const acclimeHandlers = [
  // POST /api/v1/admin/acclime/messages — one message from Acclime, from the feed or keyed in by
  // the Fund Manager. Only the Fund Manager's console receives them.
  http.post("*/api/v1/admin/acclime/messages", async ({ request }) => {
    const user = currentUser(request);
    if (user?.role !== "luca")
      return HttpResponse.json(
        { error: "Only the Fund Manager receives Acclime messages." },
        { status: 403 },
      );
    try {
      const body = (await request.json()) as AcclimeInbound;
      return HttpResponse.json({ message: receiveAcclime(user, body) }, { status: 201 });
    } catch (error) {
      return HttpResponse.json({ error: (error as Error).message }, { status: 422 });
    }
  }),
];
