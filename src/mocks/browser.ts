import { seedWorkflow, restore, persist } from "./workflow";
import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

// This app normally talks to a live Rails-style JSON API at VITE_API_URL. We
// have no backend at all in this environment, so the entire app runs against
// this in-browser mock layer instead. If a real VITE_API_URL is ever
// configured, mocking switches itself off automatically.
export const isMocking = !import.meta.env.VITE_API_URL;

export const worker = setupWorker(...handlers);

/**
 * Some sandboxed/embedded preview contexts (e.g. an in-app browser pane)
 * block Service Worker registration outright, which is how MSW normally
 * intercepts fetch in the browser. As a fallback for exactly those contexts,
 * patch `window.fetch` to run requests straight through the same handler
 * list MSW uses — no Service Worker involved. Real (non-mocked) requests
 * still fall through to the original fetch.
 */
function installFetchFallback() {
  const realFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    for (const handler of handlers) {
      if (await handler.test({ request: request.clone() })) {
        const result = await handler.run({
          request: request.clone(),
          requestId: crypto.randomUUID(),
        });
        if (result?.response) {
          if (result.response.ok) persist();
          return result.response;
        }
      }
    }
    return realFetch(input, init);
  };
}

export async function startMockWorker() {
  seedWorkflow();
  restore();
  worker.events.on("response:mocked", ({ response }) => {
    if (response.ok) persist();
  });
  try {
    await worker.start({ onUnhandledRequest: "bypass" });
  } catch (err) {
    console.warn("[mocks] Service Worker unavailable, falling back to a fetch patch.", err);
    installFetchFallback();
  }
}
