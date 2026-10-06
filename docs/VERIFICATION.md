# C4 alignment verification

The alignment extends published main commit `54c0ae15d75f65e42fa9bbae248f3ec6d2e3be68`. See [C4_GUIDE_ALIGNMENT.md](C4_GUIDE_ALIGNMENT.md) for the twelve-section mapping and simulation boundaries.

## Automated checks

- **38 model/API tests pass** against the actual transpiled workflow service and MSW handlers.
- Coverage includes commercial access and retained fees, validated referrals, information replies, supporting-file intake, top-up declarations, actual inbox reads, scheduled-message restrictions, recorded NAV and backdated observations, signature/version gates, partial/zero allocations, issuance, returns, role/client scope, atomic failures, persistence and publication.
- Allocation and issuance recheck eligibility and signatures; issuance rejects insufficient confirmed funding even in an inconsistent restored record.
- TypeScript project build passes.
- Formatting check passes.
- Lint completes with no errors; existing hook-dependency/fast-refresh warnings remain.
- Production Vite build passes. Existing bundle-size and Tailwind sourcemap warnings remain (main JavaScript approximately 2.19 MB before gzip).

Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run format_check` and `npm run build`. Local checks used the existing workspace dependency installation; CI verifies the lockfile installation independently. Two existing shared workspace files needed formatter normalization for the repo-wide check.

## Browser checks for this update

- Invest showed Helios, Orbis and Ledger for independent investors and nine published deals for referred investors.
- Helios overview/calculator showed 4% for referred and 5% for independent: a USD 25,000 ticket totaled USD 26,000 and USD 26,250 respectively.
- Portfolio rendered recorded NAV history with reported-value and no-live-feed labels, retaining the newer company updates, holding details and allocation breakdown.
- Subscription activity rendered allocation separately from holding issuance and used subscription IDs to resume existing applications.

## Earlier integration browser checks

These historical checks are retained for context and are not represented as new browser runs. The current model/API suite exercises their underlying workflow rules.

- Existing manager dashboard and the then-current five-deal opportunity shelf remained available. The current referred shelf contains nine published deals.
- Separate manager and Ops identities completed a partial allocation and registry issuance. For a USD 31,200 receipt, allocated capital was USD 15,000, allocated fee USD 600 and confirmed residual return USD 15,600.
- Reload preserved the holding and confirmed return.
- Investor created a referenced support case linked to an investment.
- Immutable published-document preview displayed the selected version.
- Portfolio totals reflected held records, including the new partial holding; absent historical performance is labeled.
- Deal section order is Overview, Market, Business, Financials, Recordings, Docs and Risks.
- Workflow layout and production deal page checked at 390px. The deal page measured 375px content width and 375px scroll width, with its compact sidebar. Desktop layout was visually inspected.

## Limits of verification

These checks validate a simulated application, not real financial processing, provider integrations, production authentication or concurrent storage. Document export is Word-readable HTML with a .doc extension; desktop Word rendering was not verified. No public deployment was performed. CI is configured for the same checks; remote CI results are separate from these local results.
