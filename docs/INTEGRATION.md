# Akula v4 connected beta integration

Destination: `awkairui321/akula-v4-clone`. Based on source commit `f99d032d49d3fbd63217bb0ac5232a2b37fbe487`. The v4 router, numeric IDs, authenticated demo profiles, React Query, API paths, MSW transport, investor journeys and external-institution portal are retained. Existing discovery, early-exit, Messages, Compliance and editor routes remain. The current investor portal uses separate Account and Support routes; it has no Watchlist route. Reference repositories were read only.

## Implemented

- A typed `/api/v1/workflows` API and transactional mock service share the existing database. Commands validate role, record scope and lifecycle before committing; failed commands roll back.
- Separate `luca`, `ops` and `rm` identities. LUCA approves eligibility, material versions and allocations. Ops records/matches/corrects receipts, issues registry holdings and settles independent return obligations. LUCA RMs see assigned clients; external institutions retain their own client book.
- Ownership checks on investor subscription reads, writes, acknowledgments, signing and refund routes. Institution discussion, highlight creation/deletion and opportunity-highlight results enforce client ownership. Profile writes cannot change account IDs.
- Allocation and issuance are separate. Partial allocations retain requested principal, use actual allocated principal/fees, and reconcile residual returns. Zero allocations cannot issue. Receipt corrections preserve original entries. Late cash appends a new obligation rather than overwriting settled history. Cancelled offerings cannot advance through allocation or issuance.
- Exact offering snapshots, signature references, version approval/publication and investor acknowledgment of revisions. Original signed economics and documents remain. Existing editors author working content; investor deal reads use the published snapshot. Newly created offerings are drafts and need review/approval/publication.
- Shared support cases with references, investment links, replies and team routing. Existing institution discussions are linked to the same servicing records; messages flow in both directions.
- Manager-controlled RM assignment, exact published-version highlights, private notes and dated follow-ups. Reassignment and newer publication remove stale highlights from current display. Commercial shelf access does not depend on highlights. Independent investors see Helios, Orbis and Ledger; referred investors see all published deals. Historical holdings and applications remain available after a commercial-profile change.
- Company requests, unique-investor demand, manual sharing/status changes and company-matched publication links. Requests never reserve an allocation. The existing editor creates company-specific offerings; missing material is not borrowed from another company.
- Sourced valuation records and stale-report labels. Experimental secondary indications are separate observations and never affect portfolio values, class units or returns.
- Record-derived operational totals, separated by currency and offering. Existing portfolio headline totals now use current held records rather than hard-coded example performance; absent history is explicitly labeled.
- Versioned browser persistence, scoped export, explicit reset and storage/recovery feedback. Original source reference documents are not included in this repository.
- Consistent seven-section deal navigation/order, wrapping small-screen navigation, responsive flex sizing and undisclosed null chart values. Company material, charts, calculator and editor are retained.

The C4 alignment extends published main commit `54c0ae15d75f65e42fa9bbae248f3ec6d2e3be68`. See [C4 guide alignment](C4_GUIDE_ALIGNMENT.md) for the current twelve-section mapping and updated diagrams.

## Demo access

Use the login page's demo account buttons. All seeded demo passwords are `password123`:

| Identity                  | Email                |
| ------------------------- | -------------------- |
| Investor                  | investor@akula.vc    |
| Fresh investor            | newinvestor@akula.vc |
| LUCA fund manager         | luca@akula.vc        |
| Akula Ops                 | ops@akula.vc         |
| LUCA RM                   | rm@akula.vc          |
| Second LUCA RM            | rm2@akula.vc         |
| External institution      | eam@akula.vc         |
| Dual investor/institution | dual@akula.vc        |

Existing portals link to **Connected workflows**. Ops and RM logins open this workspace directly. Browser-local identities and passwords are demonstration fixtures, not production authentication.

## Verification

`npm test` runs the actual transpiled model and MSW handlers: ownership, role separation, atomic failure, cancelled offerings, partial/zero allocation, unmatched and wrong-currency receipts, correction history, independent issuance, failed/retried returns, late cash, document revisions, RM assignment, linked cases/discussions, demand deduplication, publication gates, profile identity protection, valuation independence and database round-trip behavior.

Run `npm run typecheck`, `npm run lint`, `npm run format_check` and `npm run build`. A pnpm lockfile is also provided for the verified local dependency installation. CI runs typechecking, model/API tests, lint, formatting and the production build.

Earlier integration browser verification included a manager partial allocation, separate Ops issuance and residual settlement, preservation on reload, an investor-created case, immutable document preview, and responsive workflow layout. Final results are in `VERIFICATION.md`.

## Boundaries

All onboarding, KYC, signatures, payments, allocations, reporting and processing remain simulated. No provider integration or deployment was performed. The Docker default keeps the mock transport enabled when no real API URL is supplied.

Persistence belongs to one browser; it is not a secure backend, a real authentication boundary or safe concurrent multi-user storage. Use fictional data only. Word downloads use Word-readable HTML `.doc` format, with the same content as the native preview; they are not `.docx` files or legally executed contracts. The beta preserves the original signed economics during disclosure updates. Real economic amendments, live administrator integrations, complete historic NAV series and production security remain outside this simulation.
