import { http, HttpResponse } from "msw";
import { currentUser, exportDemoState, findSubscriptionById } from "../db";
import { allocationTerms, command, view, workflow } from "../workflow";
import type { WorkflowCommand } from "../../lib/workflow-types";

export const workflowHandlers = [
  http.get("*/api/v1/workflows", ({ request }) => {
    const user = currentUser(request);
    return user
      ? HttpResponse.json(view(user))
      : HttpResponse.json({ error: "Sign in first" }, { status: 401 });
  }),
  http.post("*/api/v1/workflows", async ({ request }) => {
    const user = currentUser(request);
    if (!user) return HttpResponse.json({ error: "Sign in first" }, { status: 401 });
    try {
      const body = (await request.json()) as WorkflowCommand;
      // The allocation is what the investor subscribed to, at the price they signed.
      const sub = body.type === "allocate" ? findSubscriptionById(body.id ?? 0) : undefined;
      if (sub) {
        const terms = allocationTerms(sub);
        if (body.amount !== terms.capital || body.price !== terms.price)
          throw new Error(
            "An allocation is the subscribed capital at the signed unit price. Decline it instead.",
          );
      }
      return HttpResponse.json(command(user, body));
    } catch (e) {
      return HttpResponse.json({ error: (e as Error).message }, { status: 422 });
    }
  }),
  http.get("*/api/v1/workflows/export", ({ request }) => {
    const user = currentUser(request);
    if (!user) return HttpResponse.json({ error: "Sign in first" }, { status: 401 });
    return HttpResponse.json(
      user.role === "ops" || user.role === "luca"
        ? { schema: 1, workflow, db: exportDemoState() }
        : view(user),
    );
  }),
];
