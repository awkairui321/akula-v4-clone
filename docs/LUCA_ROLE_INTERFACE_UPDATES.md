# LUCA role and interface updates

7 October 2026. Builds on the C4 alignment branch (`codex/c4-guide-alignment`).

## Active interfaces

| Interface            | Scope                                                                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Investor             | Discover eligible offerings, manage investments and documents, receive updates, contact the assigned LUCA RM.                                                                                 |
| LUCA RM              | Assigned clients, recommendations, private follow-ups, support, reports, documents and partner client book.                                                                                   |
| LUCA Investment Team | Author offerings and their fees, add deal documents, submit exact versions for approval and publish approved versions. No client compliance, subscription decisions or allocation permission. |
| LUCA Fund Manager    | Investment Team and RM features, with investment decisions, exact-version offering approval, communications and firm-wide client oversight.                                                   |

EAM and Akula Ops development is paused. Existing routes and processing records remain compatible. The demo login and Compare roles live now feature the four active interfaces.

## Offering publication

1. Investment Team opens Deals, creates or edits a working offering and configures Fees separately.
2. In Publication, prepare a draft version and submit it for review.
3. Fund Manager approves that exact version.
4. Investment Team publishes the approved version. Investors receive the published snapshot; prior signed versions remain intact.

Fee inputs have been removed from the working overview editor and the Tags tab has been removed. Fees shows the partner-referred baseline, the existing independent-investor one percentage point adjustment and manager-only investor overrides. Investors retain applicable fee disclosures and their previously recorded commercial terms. Risks is the final section of the deal overview.

## Communication delivery

| Action                                                       | Investor inbox                              | Email                           |
| ------------------------------------------------------------ | ------------------------------------------- | ------------------------------- |
| Request documents/information; signature or funding reminder | No communication inbox message              | Recorded as pending integration |
| General Fund Manager update                                  | Delivered immediately in the demo when sent | Recorded as pending integration |
| Scheduled message                                            | No immediate delivery                       | Recorded as scheduled           |

Actual email delivery is not implemented. The communication detail distinguishes inbox delivery from the pending email integration. Subscription information requests also record email-only intent; the investment record retains the request and response workflow.

Investor investment support defaults to the assigned LUCA RM. Alternate direct routing is rejected, including through the API. A missing RM assignment blocks submission instead of assigning a different team.

## Client interfaces

RM documents show latest accessible versions with search, optional version history and expandable signed-copy details. Partner client book replaces the dense summary table with adviser firm rows, accessible clients, active applications, recorded investment cost and next client actions. RM sees assigned clients; Fund Manager sees the firm-wide book.

Fund Manager can use RM recommendations and private follow-ups. Private notes remain invisible to investors. Existing institution/client scopes and approval, cash and issuance checks are preserved.

## Validation

43 workflow/API tests cover existing connected behaviour plus Investment Team approval restrictions, RM support routing, manager RM tools, communication channels and migration of saved demo data. TypeScript and production build checks, formatting checks, lint and browser review are performed before publication.
