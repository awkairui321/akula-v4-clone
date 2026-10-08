# Interface and workflow audit — 8 October 2026

**Result: does not pass end to end.** The existing 71 automated workflow tests pass, but the browser audit found disconnected actions and incomplete destinations that those API/model tests do not cover. Functional gaps remain unchanged, as requested. The application changes in this branch are presentation only.

Baseline: published main commit `75b22cbb4a4b0a19c910b2a63e4d557fd453d15e`. Audit branch: `codex/interface-audit-layout`. Checks used a separate localhost origin, browser-local fictional records and isolated in-memory fixtures. The user's existing demo on port 5178 was not reset or edited.

## Scope and evidence

- Inspected 142 source files, all 75 route definitions, 138 literal navigation locations and 129 mock API handlers.
- Checked rendered links collected during 100 browser page captures across all six roles, public entry points, retired-page redirects and error cases. These included 75 distinct path/query combinations and 1,090 rendered link occurrences. Every collected internal navigation URL matched an existing route. This is a route-resolution check, not a claim that every link's business outcome works.
- Ran 308 read-only endpoint probes: 44 non-parameterized authenticated GET endpoints across six roles and an unauthenticated caller. No unhandled responses or thrown handler errors; every guest probe returned 401.
- Ran the existing 71 workflow tests, including ownership, role restrictions, publication versions, frozen subscription terms, receipts, partial/zero allocations, issuance, returns, uploads, communications and the two-fund example.
- Reproduced additional failures using the real mock handlers in memory. No working fee changes or test uploads were saved into the user's demo.
- Checked desktop and 390px mobile layouts. The overflow issues listed under presentation changes were rechecked after editing.

Evidence: [route/API inventory](interface-audit-results.json), [browser observations](browser-checks.json), [isolated reproductions](reproductions.json), [captured console warnings/errors](browser-console.json). The console capture contained no warning/error entries; this does not override the functional failures below.

## Findings requiring follow-up

P1 means a primary action is blocked or an unpublished data boundary is breached. P2 means an incomplete workflow, wrong destination or misleading state. P3 means inconsistent copy or demonstration surfaces. **None of these functional findings was repaired during this audit.**

| ID | Priority | Finding and effect | Evidence / reproduction |
| --- | --- | --- | --- |
| A01 | P1 | **Confirm allocation does not submit.** The button is rendered as `type="button"` inside the submit form and has no click handler. Entering a valid unit price enables it, but clicking leaves the subscription unallocated and gives Ops no new holding to issue. | Manager → Subscriptions → Quanta SPV II / Elena → Allocate. `src/features/admin/allocation.tsx:155`; DOM button type confirmed. Underlying allocation command tests pass. |
| A02 | P1 | **RM Send to client does not submit.** Same button/form mismatch. Attachment persistence works in the API tests, but the RM composition screen cannot complete its send action by clicking the button. | RM → Communications → New communication. `src/features/rm/communications.tsx:128`; rendered button type is `button`, no click handler. |
| A03 | P1 | **The adviser opportunity API exposes working fund data and draft funds.** It does not consistently use the approved snapshot. An in-memory change to Quanta SPV II's working subscription fee from 2% to 2.75% appeared to EAM while the investor correctly retained the approved 2%. A draft fund returned 200 to EAM and 404 to the investor. | `src/mocks/handlers/eam.ts`, opportunity list/detail handlers. Reproduced in `scripts/audit-reproductions.mjs`. This was not saved to the browser's commercial data. |
| A04 | P2 | **Document download destinations are missing for legacy seeded files.** 65 records claim `has_file` without retained file bytes. Their fallback `/api/v1/documents/:id/download` has no mock handler. The investor fallback also defaults to `http://localhost:3000`, which may differ from the running frontend. | Investor → Documents → open an older fund group → Download. `src/features/investor/documents.tsx:114–133`. Isolated request for document 1 has no matching download handler. New Quanta example PDFs and uploads with a data URL have a different, working byte-backed path. |
| A05 | P2 | **Portfolio Express interest is a disconnected action.** It clears the company input without creating a sourcing request; the three displayed requests and adviser name are hardcoded. The separate workflow request command exists but is not connected to this screen. | `src/features/investor/portfolio/components/requests.tsx:10–31`. No submission was made merely to create test data. |
| A06 | P2 | **Proof of payment is not retained.** The screen sends only a filename and the handler marks payment claimed without retaining the filename, file bytes or a document record. Ops cannot retrieve the submitted receipt through this flow. | `src/features/investor/portfolio/components/subscription-activity.tsx`; `src/mocks/handlers/investor.ts`, payment-proof handler. Fixture returned 200 with zero new documents and no saved evidence. |
| A07 | P2 | **“This deal's Documents tab” goes to Overview.** The destination route exists, but the link omits `?tab=documents`. | `src/components/deal-overview-page.tsx`, Documents section. Follow it from a LUCA deal overview; it opens the default tab. Link intentionally left unchanged. |
| A08 | P2 | **Unknown routes and missing adviser records lack usable error states.** An unknown route renders a blank page because there is no catch-all route. Missing EAM client/opportunity data is presented as perpetual Loading instead of not found/error. | `/audit-nonexistent-route`; `/eam/clients/999999` remained Loading after request retries. `src/App.tsx`; `src/features/eam/clients/client-detail.tsx:601`; `src/features/eam/opportunity-detail.tsx:34`. |
| A09 | P2 | **Some document/report actions are absent.** EAM's client Documents tab only displays metadata, with no view/download control. Its Revenue “Download statement” button is permanently disabled. | `src/features/eam/clients/client-detail.tsx`, DocumentsTab; `src/features/eam/revenue.tsx:35`. These are missing capabilities, not broken sidebar URLs. |
| A10 | P2 | **Scheduled communications have no delivery advancement.** Setting a scheduled record's due date into the past in an isolated fixture left it scheduled and absent from the investor inbox. No scheduler/transition is implemented. | `src/mocks/handlers/admin.ts`, communication creation; `src/mocks/handlers/investor.ts:599`, sent-only inbox filter. Fixture captured in reproductions. External email delivery is also explicitly pending integration. |
| A11 | P2 | **Saved communication drafts have no continuation action.** Drafts appear in the list and detail view, but there is no resume/edit/send workflow on the detail page. | Manager → Communications → “New deal — Fenwick AI” draft. `src/features/admin/communications/detail.tsx`. A new composition flow exists separately. |
| A12 | P3 | **The live comparison retains retired and misleading surfaces.** Its RM selector still exposes Reports/Documents although those are removed from the primary RM interface. The Fund Manager's comparison Overview renders RM client-follow-up content and shortcuts; “Connected records” uses the older shared workspace. | `src/features/workspace/live-compare.tsx`; `/live-demo` inspected in the browser. This is the remaining source of the “why am I on an RM page?” impression. The normal Subscriptions allocation link now points to the manager allocation page, where A01 blocks completion. |
| A13 | P3 | **Some seed content belongs to another company.** Quanta's overview contains “The grid problem” and “What Solara Grid provides”; the headings come from reused overview copy. | Quanta overview, How the company creates value. `src/components/deal-overview-page.tsx`. No replacement business content invented. |
| A14 | P3 | **Messages/profile descriptions can disagree with current terms.** The Quanta reminder says 5 October while the current offering closes 11 October. Onboarding still describes independent fees as published fees plus one percentage point, while the new variant example has its own 2% schedule. | Seed communication body in `src/mocks/db.ts`; onboarding channel descriptions in `src/features/investor/onboarding/onboarding.tsx:305`. Financial values/copy left for a separate functional decision. |
| A15 | P3 | **The small onboarded directory and broader demo queues represent different populations.** Manager Directory shows six selected approved clients; RM/EAM and historical subscriptions retain other accounts, including prospect/onboarding clients. Thus “all clients are onboarded” is not true across the whole seeded application. | Manager Directory compared with EAM Clients and RM follow-ups. This is a residual mismatch with the earlier simplification request, not a new deletion recommendation. No historical records removed. |
| A16 | P2 | **An external company URL remains a placeholder.** The browser exposed `https://nightjarlabs.example.com`; it is sample data rather than an actual company destination. | Investor Discover detail. No substitute URL added and no external service authenticated. |
| A17 | P2 | **LUCA's overview falsely says there are no deal documents.** For Quanta SPV II the shared overview document endpoint returns an empty collection for LUCA, while the manager Documents tab contains three fund materials. The shared endpoint applies investor disclosure rules to staff and the empty result is displayed as genuine absence. | `/luca/deals/1201` Overview vs Documents. `src/components/deal-overview-page.tsx:679`; `src/mocks/handlers/investor.ts:757`; isolated fixture confirms 0 overview documents vs 3 manager fund documents. |

The missing/wrong destinations requested for notification are particularly **A04, A07, A08, A09 and A16**. There were no unresolved literal or collected rendered internal route paths. The distinction matters: a URL can resolve successfully and still open the wrong tab or an incomplete feature.

## Role coverage and workflow results

| Interface | Browser checks | Logic checks / outcome |
| --- | --- | --- |
| LUCA Fund Manager | Dashboard, projects/funds, project detail, deal Overview/Documents/Versions, subscriptions/filter/history/allocation, client Directory/Funds & documents/record/review, partner book, compliance, communications/list/detail/composition | Client search → client → fund → document expands correctly, including both Quanta funds under Elena. Counts and variant fee/doc labels inspected. Primary allocation fails at A01; missing shared materials at A17. Approval/publication invariants pass in model tests. |
| Investment Team | Deal/project workspace, fund editor fields, publication status, Documents tab, unauthorized client-book redirect | Edits/submission/manager review and sibling fund independence pass in isolated automated tests. No fee change saved from the browser. EAM publication boundary fails at A03. |
| Akula Ops | Overview, Investments, Documents, Publication, publication detail/editor, Demand, Reporting | Receipt matching, allocation readiness, independent issuance, return obligations and reports pass in model tests. Browser cannot receive an allocation through A01. No real transfers or registry issuance performed. |
| LUCA RM | Overview/follow-ups, onboarding/new account form/prepared-account state, opportunities/deal detail, partner book, communications | Prepared files → unique invitation → client confirmation/NDA/consents → pending approval is covered by passing workflow tests. Missing account errors and retained retired-page redirects inspected. Send fails at A02. |
| Investor | Portfolio/holdings/subscription activity, opportunities/detail, checkout, Documents, Messages, Account, Discover/detail; fresh account onboarding guards | Ownership/foreign IDs, disclosure gates, frozen terms, acknowledgments, upload bytes and inbox scope pass in API/model tests. Proof upload fails at A06; sourcing request fails at A05. Foreign subscription checkout does not expose foreign data but falls back to a new-application screen rather than explaining the missing application. |
| EAM / external institution | Overview, Clients/detail/documents/activity, Opportunities/detail, Documents, Reports, Revenue, Profile | Institution client-book/document/report/revenue scope passes in existing tests. Working/draft opportunity exposure fails at A03. Missing-record UI and absent document/statement controls recorded. |
| Public / access controls | Login/logout for all roles, signup, invalid activation, missing confirmation/reset token, forgot password, fresh onboarding guards, unauthorized-role redirects | Unauthenticated GET probes return 401. Fresh investor cannot jump directly to NDA/consents/funds before required onboarding steps. No new account, password change, legal acceptance or external email was submitted. |
| Comparison / legacy workspace | Five persona panes, available surfaces, connected-records link and shared workspace source | Functional legacy overlap remains at A12. Read-only comparison inspected; no persona command used to alter commercial data. |

Retired destinations checked: RM Documents and Support redirect to Communications; RM Reports returns to RM Overview; investor Support redirects to Messages. Removed features were not recreated.

## Presentation changes made

These use existing information and do not add features or connect missing workflows:

- Header controls wrap neatly on narrow screens instead of stretching the entire page.
- Communication totals sit in a compact, aligned summary panel. Subjects/audiences have more room; wide tables scroll within their own container.
- Investor messages stay within a single mobile grid column. Subscription progress scrolls within its row on small screens, preserving readable labels.
- Fund workspace tabs scroll inside the available width on mobile.
- Fund names now distinguish variants in the dashboard's closing list, subscription history, adviser opportunity cards, shared deal overview, version-document rows and operational cohort selector.

Desktop proof: [communications](communications-desktop.png). Mobile proof: [fund workspace](fund-mobile.png).

## Verification and limits

- Existing tests: **71 passed, 0 failed**.
- TypeScript: passed. Production build: passed. Build reports the existing large JavaScript chunk and Tailwind sourcemap warnings.
- Lint: no errors, 16 existing warnings.
- Changed/new code and evidence formatting: passed after formatting only those files. Whole-repository formatting check still reports **26 untouched pre-existing files**; these were not reformatted as unrelated audit work.
- Isolated failure reproductions: passed their assertions, meaning the reported failures were reproduced; this is not a clean application pass.
- Browser testing covers representative seeded paths and controls, including filters, expansion, dialogs, navigation and error cases. It does not exhaust every possible state combination or replace an automated browser regression suite. Dynamic link constructions were additionally checked through collected rendered URLs; the source literal inventory alone is not exhaustive.
- All storage, identity checks, signatures, payment processing, file delivery and communications are simulated. Real authentication, external providers, email scheduling, production synchronization, provider callbacks and hosting behavior cannot be certified by these local checks.
- Automatic approval review rejected saving a changed subscription fee during the audit because the request prohibited introducing changes. Publication-boundary checks were completed using isolated fixtures instead. A draft was prepared only on the separate audit origin; the user's existing demo remained untouched.

## How to review the two-fund example

1. Sign in as **LUCA Fund Manager**, open **Deals → Project Quanta**. Compare **SPV I** (partner clients, 4% / 1.5% / 15%) with **SPV II** (direct clients, 2% / 1% / 10%). Each has different named documents and minimum subscriptions.
2. In **Clients → Funds & documents**, search Elena, expand her name, then expand each Quanta fund. The documents remain under their corresponding fund; the client is listed once.
3. From the project card or Subscriptions, open Elena's SPV II allocation. Its funding and fees are visible. **Stop expecting completion at Confirm allocation: A01 currently prevents the UI command.** The underlying command/issuance tests pass, but that does not repair the button.
4. Use the **Investment Team** login to review the working fund editor and submission flow. Each fund has its own audience, fees and materials; the company overview is shared. Manager approval/version tests pass. **Do not treat the EAM overview as an approved publication check until A03 is addressed.**
5. Use **Investor** to review the published direct-class view and existing investment history. Earlier investments retain their agreed terms; changing a class does not rewrite signed subscriptions.

To reproduce the audit locally, run the existing test command first to generate `.test-runtime`, then `node scripts/interface-audit.mjs` and `node scripts/audit-reproductions.mjs`. The latter resets its in-memory fixture between cases and writes evidence only; it does not save into browser storage.
