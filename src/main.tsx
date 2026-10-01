import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { initSentry } from "./lib/sentry";
import { isMocking, startMockWorker } from "./mocks/browser";
import App from "./App.tsx";

initSentry();

async function main() {
  if (isMocking) {
    // If the Service Worker can't register (some sandboxed/embedded preview
    // contexts block it entirely), fall back to rendering without mocking
    // rather than leaving the page blank — API calls will simply fail.
    try {
      await startMockWorker();
    } catch (err) {
      console.error("[mocks] Service Worker registration failed; continuing without mocking.", err);
    }
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

main();
