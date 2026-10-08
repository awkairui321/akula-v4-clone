# Targeted audit fixes and decisions for approval

This follows the baseline [full interface audit](FULL_INTERFACE_AUDIT_2026-10-08.md). A01–A17 refer to application findings. A18 dependency advisories remain separate. The larger proposals below have not been implemented.

## Implemented changes

| Finding       | Result                                                                                                                                                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01           | Confirm allocation submits the existing validated allocation command; Ops issuance remains a separate step.                                                                                                           |
| A02           | RM Send to client submits the existing scoped communication command.                                                                                                                                                  |
| A03           | EAM opportunity list/detail use approved publication snapshots and exclude unpublished drafts.                                                                                                                        |
| A04 — partial | Documents with no stored file show File unavailable. Removed the broken download fallback. Missing historical contents still need the decision below.                                                                 |
| A05           | Investor company requests use the existing request workflow, show saved records and display failures.                                                                                                                 |
| A06           | Payment proof retains uploaded bytes and ownership; LUCA/Ops can download it in the existing cash-matching panel. Evidence alone never confirms cash or allocates capital.                                            |
| A07           | Overview document link opens the deal's Documents tab.                                                                                                                                                                |
| A08           | Unknown routes show a return link; missing EAM clients/opportunities show a clear error instead of endless loading.                                                                                                   |
| A09 — partial | EAM client documents download stored files within the existing client scope; unavailable files are labelled. Statement export awaits approval.                                                                        |
| A13           | Company overview headings use the relevant company name, including older persisted Quanta records.                                                                                                                    |
| A14           | New reminder fixtures use the fund's actual close date and the current subscription-activity location. Onboarding descriptions defer to each fund's fee schedule. Previously sent messages remain historical records. |
| A16           | Removed the fictitious company website and suppress reserved example-domain links in older persisted records.                                                                                                         |
| A17           | Staff overview documents use staff access while excluding other clients' private documents. Errors are distinct from an empty collection.                                                                             |

## Proposed changes — approval required

### 1. Scheduled communications — A10

**Where:** Fund Manager → Communications → Upcoming NAV statements. [Current screen](approval-evidence/communications.png).

**Problem:** The record says Scheduled, but no delivery engine advances it when its date arrives. Investor Messages only displays delivered records.

**Proposal:** Add persisted scheduled delivery for this browser-local demo. Check due messages on startup and while the app is open; deliver once to the stored, authorized recipient list and mark Sent. Provide edit/cancel controls before delivery and show the scheduled date clearly. If the app was closed at the scheduled time, process the overdue message next time it opens. Label this as demo inbox delivery. Actual unattended email delivery would require a backend service and is outside this proposal.

**Acceptance:** Not visible to the investor before due time; delivered once after due time; survives reload; cancelled messages never deliver; no recipients outside the authorized audience.

### 2. Resume drafts — A11

**Where:** Fund Manager → Communications → New deal — Fenwick AI. [Current screen](approval-evidence/draft.png).

**Problem:** A draft detail has no edit/resume action. The existing composer cannot load or update that draft.

**Proposal:** Add Resume draft to the detail and open the existing composer with saved audience, routing, subject, body and attachments. Add Save draft and update the same record. Review and Send explicitly completes it; sent records remain immutable. Keep the existing four-step composition layout.

**Acceptance:** Save/reload/resume preserves all fields and files; saving never delivers; sending creates one message rather than duplicating the draft.

### 3. Adviser statement export — A09

**Where:** EAM → Revenue → Download statement. [Current screen](approval-evidence/revenue.png).

**Problem:** The visible export button is disabled and there is no statement generator.

**Proposal:** Start with a CSV statement containing the transactions already visible to the adviser: client, fund, allocation date, allocated volume, client fee base, revenue share and simulated settlement status, plus totals. Clearly mark it fictional demo data. Use the existing adviser scope. This avoids adding a PDF statement designer or new accounting workflow.

**Acceptance:** Download totals match the page; other advisers' records are excluded; text cells cannot execute spreadsheet formulas.

### 4. Correct role comparison — A12

**Where:** Compare roles live → Fund Manager Overview and RM Surface selector. [Current screen](approval-evidence/comparison.png).

**Problem:** The manager pane shows RM client-follow-up content. RM still offers removed Reports/Documents surfaces. Investor Overview also renders operational analytics rather than its normal portfolio.

**Proposal:** Retain the five-pane comparison, but map each role to its current interface and navigation. Fund Manager starts on decisions, RM on follow-ups with communications/onboarding, Investor on holdings with subscription activity, Investment Team on preparation and Ops on processing. Remove retired RM surfaces. Keep persona context inside each pane when following links so an action does not unexpectedly replace the comparison with another role's page.

**Acceptance:** Each pane matches the corresponding ordinary interface, uses that persona's permissions, and updates shared fictional records after an action.

### 5. Consistent minimal client example — A15

**Where:** Manager → Clients compared with EAM → Clients and RM → Client follow-ups. [Adviser screen](approval-evidence/adviser-clients.png).

**Problem:** Manager's simplified approved directory and the broader adviser/RM history display different populations; the adviser still shows Marcus as Onboarding and Chloe as Prospect.

**Proposal:** Define one minimal approved showcase cohort for ordinary client-directory views, with adviser/RM subsets determined by their actual ownership. Keep pending new accounts in the dedicated onboarding/review queues. Preserve historical subscriptions and documents, and make historical entries identifiable rather than deleting them or silently approving clients. No bypass of client declarations, NDA or LUCA approval.

**Acceptance:** Ordinary directories consistently show approved clients; a newly invited account appears in onboarding until approval; historical investments remain accessible to their authorized users.

### 6. Missing historical document contents — A04 and A09

**Where:** Investor → Documents and EAM → Client → Documents. [Investor screen](approval-evidence/investor-documents.png).

**Problem:** Legacy seeded records say a file exists but contain no file bytes. A button or link cannot restore an absent file.

**Proposal:** Add a minimal representative set of clearly marked sample PDFs to the demo fixtures using the existing upload/storage mechanism: offering materials and an illustrative statement. Keep other records explicitly unavailable until genuine files are supplied. Do not create purportedly signed agreements, NDA signatures or client acknowledgements. If complete historical downloads are required, those source files must be provided rather than invented.

**Acceptance:** Sample downloads open and identify themselves as fictional; missing historical records remain transparent; no legal consent is fabricated.

## Validation

- 74 model/API tests pass, including new approved-snapshot, staff document isolation and payment-proof persistence regressions.
- TypeScript build and production Vite build pass.
- Linter exits successfully with existing warnings in untouched files. Production build retains existing chunk-size and Tailwind sourcemap warnings.
- Browser: Quanta SPV II subscription #59 confirmed $50,000 allocation and displayed Awaiting Akula Ops issuance. RM sent a fictional local test message and the sent record appeared.
- Browser tests use isolated localhost:5180 fictional records; they do not modify the user's localhost:5178 demo.

The earlier audit reproduction script documents baseline failures and is not a regression test for the repaired branch.
