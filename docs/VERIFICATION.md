# Release verification

## Automated checks

- 21 model/API tests pass against the actual workflow service and MSW handlers.
- TypeScript project build passes.
- Formatting check passes.
- Lint completes with no errors; 24 existing hook-dependency/fast-refresh warnings remain.
- Production Vite build passes. Bundle-size and Tailwind sourcemap warnings remain (main JavaScript approximately 2 MB before gzip).

## Browser checks

- Existing manager dashboard and the full five-deal opportunity shelf remain available.
- Separate manager and Ops identities completed a partial allocation and registry issuance. For a USD 31,200 receipt, allocated capital was USD 15,000, allocated fee USD 600 and confirmed residual return USD 15,600.
- Reload preserved the holding and confirmed return.
- Investor created a referenced support case linked to an investment.
- Immutable published-document preview displayed the selected version.
- Portfolio totals reflected held records, including the new partial holding; absent historical performance is labeled.
- Deal section order is Overview, Market, Business, Financials, Recordings, Docs and Risks.
- Workflow layout and production deal page checked at 390px. The deal page measured 375px content width and 375px scroll width, with its compact sidebar. Desktop layout was visually inspected.

## Limits of verification

These checks validate a simulated application, not real financial processing, provider integrations, production authentication or concurrent storage. Document export is Word-readable HTML with a .doc extension; desktop Word rendering was not verified. No public deployment was performed. CI is configured for the same checks; remote CI results are separate from these local results.
