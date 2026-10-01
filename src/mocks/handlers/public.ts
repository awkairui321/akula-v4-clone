import { http, HttpResponse } from "msw";
import { tickerItems } from "../db";

export const publicHandlers = [
  // GET /api/v1/public/ticker
  http.get("*/api/v1/public/ticker", () => {
    return HttpResponse.json(tickerItems());
  }),
];
