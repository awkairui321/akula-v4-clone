# Akula v4 - LUCA simulated beta

The existing v4 application now connects investors, LUCA fund managers, Akula Ops, relationship managers and external institutions through shared browser-local records.

See [integration and demo accounts](docs/INTEGRATION.md) and [verification results](docs/VERIFICATION.md).

## Run locally

Use Node 22 or newer. Install with `npm ci`, then `npm run dev`. Alternatively use `pnpm install --frozen-lockfile` with the supplied pnpm lockfile. Leave `VITE_API_URL` empty to use the simulated transport. Login demo buttons select fictional accounts; all demo passwords are `password123`.

`npm test`, `npm run typecheck`, `npm run lint`, `npm run format_check` and `npm run build` validate the app. `npm run preview` serves the built application.

All identity checks, documents, signatures, payments, allocations and reporting are simulated. Persistence is local to one browser. Use fictional data only. This repository release does not provision a backend or publicly deploy a website.
