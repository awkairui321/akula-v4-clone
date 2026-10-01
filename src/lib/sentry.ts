import { useEffect } from "react";
import * as Sentry from "@sentry/react";
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from "react-router-dom";

/** Initializes crash reporting. No-op unless VITE_SENTRY_DSN is set. */
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  const environment = import.meta.env.VITE_SENTRY_ENVIRONMENT;

  const tracesSampleRate = Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE) || 0.0;

  Sentry.init({
    dsn,
    environment,
    // GlitchTip doesn't support sessions or replay; drop BrowserSession, no replay.
    integrations: (defaults) => [
      ...defaults.filter((integration) => integration.name !== "BrowserSession"),
      Sentry.reactRouterBrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
    ],
    tracesSampleRate,
    tracePropagationTargets: ["localhost", import.meta.env.VITE_API_URL],
  });
}
