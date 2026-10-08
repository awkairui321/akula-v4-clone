# Application audit completion

The user approved proposals 1–5 and accepted missing historical file contents as non-critical for the simulation. This completes the application-audit round A01–A17, with A04 and the historical-file part of A09 explicitly accepted. Dependency advisories A18 remain a separate unresolved workstream. This is a browser-local simulation, not a production launch certification.

## Approved improvements delivered

| Finding | Result                                                                                                                                                                                           | How to use                                                                                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A10     | Scheduled updates advance once when due, with persistent recipients, delivery timestamps and audit history. Overdue updates process on reopening. Scheduled document requests activate when due. | Fund Manager → Communications → New communication → Review → Schedule. Open a scheduled message to edit it or cancel its schedule. Cancelling retains a draft.                                |
| A11     | Drafts save and resume in the existing four-step composer. Editing updates the same record and retains audience, subject, body, attachments and selections. Sent records cannot be edited.       | Open a draft → Resume draft. Save draft at any step after entering a subject. Continue to Review to send or schedule. Use Change audience explicitly when replacing the saved recipient list. |
| A09     | Adviser CSV statement contains the same scoped transactions and totals as Revenue. Text cells are escaped and formula-like values are neutralized.                                               | EAM → Revenue → Download statement (CSV). Settlement statuses and the file itself are clearly marked fictional.                                                                               |
| A12     | Comparison panes show actual role interfaces, with independent persona authentication and navigation. Retired RM surfaces are removed. Shared fictional records refresh across panes.            | Compare roles live → choose Persona → Open page. Ordinary sidebar links remain inside that pane. Parent controls change the role or open another page.                                        |
| A15     | Manager, RM and adviser use one approved showcase cohort, narrowed by actual ownership. Pending and historical records remain accessible rather than being deleted or approved automatically.    | RM/EAM → Onboarding & historical accounts exposes retained scoped records. Newly approved accounts join the normal book; pending accounts remain in onboarding.                               |

The earlier targeted fixes are recorded in [Targeted fixes and proposals](TARGETED_FIXES_AND_APPROVALS_2026-10-08.md). That document is the historical approval proposal, not a current list of pending work.

## Simulation boundaries

- Missing seeded file bytes remain labelled File unavailable. No signed document contents or client consents were fabricated.
- Scheduled updates reach the demo inbox. Existing email-only action requests retain their channel rules and remain pending email integration; scheduled document requests still activate in the document queue. No real email is sent.
- Delivery runs while the application is open or at its next startup. It is not an unattended server scheduler.
- Comparison impersonation is restricted to labelled embedded demo panes and disabled when a live API is configured. Each pane retains its own route and identity without replacing the ordinary sign-in token.
- Historical allocations, subscriptions, ownership and approvals are preserved. The small default book is a presentation cohort, not an authorization filter.

## Validation

- 79 model/API tests pass, including persisted draft editing, sent-record immutability, due-only/idempotent scheduling, cancellation, scheduled document requests, CSV formula escaping, and scoped cohort/history checks.
- TypeScript and production build pass. Lint succeeds with existing warnings; production build retains existing chunk-size and Tailwind sourcemap warnings.
- Browser verified saving/resuming the same draft, withholding an update before its due time, automatic delivery into the investor pane, corresponding Sent/Delivered/Opened manager state, cancellation back to a draft, navigation contained in the correct pane, and retained RM history.
- Adviser default directory shows three approved clients in its subset; pending accounts remain in the history/onboarding view. Screenshot: [approved book](completion-evidence/approved-client-book.png).
- The rendered CSV download link has a filename and includes 18 rows, totals and a fictional-data label. Its exact DOM-linked payload is saved as [rendered CSV](completion-evidence/rendered-revenue.csv). The embedded-browser automation did not expose a file-save event, so OS-level download capture could not be verified there. CSV contents, escaping and scoped data were verified independently.
- UI evidence: [scheduled delivery across investor and manager](completion-evidence/scheduled-delivery.png), [comparison](completion-evidence/comparison-delivery.png).
- Tests used isolated localhost:5180 demo records. The user's localhost:5178 records were not modified.
