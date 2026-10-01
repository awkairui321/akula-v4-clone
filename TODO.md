# Akula Platform — Outstanding Workflows

Copy layouts only, NOT styling. Use standard shadcn/ui components until designs are finalized.

## Bugs / Housekeeping

- [ ] Fix blank page when switching to investor profile (OnboardedRoute issue for dual-profile users)
- [ ] Merge backend PR #23 (profile flags) and frontend PR #14 (profile switcher)

---

## P0 — Core Investor Journey (platform cannot operate without these)

### Subscription Checkout (6-step flow)

Amount → Terms acknowledgement → E-sign → Funding instructions → Escrow confirmation → Allocation

- [ ] Step 1: Amount selection with fee breakdown (subscription fee, management fee, carried interest)
- [ ] Step 2: Terms & risk acknowledgement — individual checkboxes per risk item, all required
- [ ] Step 3: E-sign subscription agreement (DocuSign integration — future)
- [ ] Step 4: Funding instructions — bank details, unique payment reference, copy-to-clipboard
- [ ] Step 5: Awaiting funds — escrow status polling, payment received confirmation
- [ ] Step 6: Reconciliation & allocation — final confirmation with holding details
- [ ] Visual step tracker component (reusable across multi-step flows)
- [ ] Unconditional refund within 5 business days — refund request action on pending subscriptions

### Subscription Status Pipeline

- [ ] Status definitions: `documents_pending` → `awaiting_funds` → `payment_unmatched` → `reconciliation` → `allocation_pending` → `allocated` / `not_allocated` / `funds_returned`
- [ ] Visual pipeline tracker on portfolio subscription rows (step dots with labels)
- [ ] Owner mapping per status (investor vs ops) for action visibility
- [ ] Status-specific action buttons (e.g. "Request refund" on awaiting_funds, "Upload proof" on payment_unmatched)

### Access & Onboarding Flow (multi-step)

Channel selection → Eligibility gate → KYC → NDA → Consent items → Dashboard

- [ ] Channel selection screen (direct vs EAM-referred, determines fee schedule and consent items)
- [ ] Eligibility gate — accreditation criteria check before proceeding
- [ ] First Schedule warning display (full, unaltered, legally required)
- [ ] NDA signing step (pre-fill name/email from profile, capture signature + timestamp)
- [ ] Per-item consent record — individual grant/withdraw per consent item, timestamped
  - Onboarding mode: must grant all required items to proceed
  - Management mode: can withdraw previously granted consents from profile
  - EAM-channel-specific items filtered by referral source
- [ ] Onboarding progress tracker (visual step indicator across the flow)

### Ops Transaction Operations (multi-step)

Manages each subscription through the ops side of the status pipeline:

- [ ] Transaction list with filterable status pipeline
- [ ] Payment matching — match incoming bank transfers to subscription payment references
- [ ] Handle unmatched payments (manual resolution, investor notification)
- [ ] Allocation recording — record share allocation after payment confirmed
- [ ] Bulk operations: batch allocate, batch status update
- [ ] Exception handling: mark as not_allocated, initiate funds_returned

---

## P1 — Compliance & Audit (regulatory requirements)

### Audit Logging (PaperTrail gem)

- [ ] Every state change and user action audit-logged (CLAUDE.md requirement)
- [ ] PaperTrail versioning on key models (subscriptions, holdings, consents, investor profiles)
- [ ] Queryable audit trail API for ops dashboard

### Ops Audit & Compliance Views

- [ ] Operator audit trail — all ops actions with actor, timestamp, details
- [ ] Consent audit — separate view of all consent grants/withdrawals across investors
- [ ] AML/KYC monitoring dashboard (Persona integration — future)

### Investor Verification Management (Ops)

- [ ] Per-investor verification status view
- [ ] Evidence request workflow — request additional documents from investor
- [ ] Approve/reject verification with notes
- [ ] Action item queue for pending verifications

---

## P2 — Portfolio & Post-Investment (investors need to see what they own)

### Portfolio Enhancements

- [ ] Holdings section: committed amount, current NAV, MOIC, unrealized gain per holding
- [ ] Subscription list with status pipeline tracker per row
- [ ] Aggregate metrics: total committed, total NAV, total gain, allocation by sector chart
- [ ] Watchlist section within portfolio (currently separate page)
- [ ] Requests & discussions section — view all open threads with EAM

### Document Vault

- [ ] Grouped document list: Account documents vs Deal documents
- [ ] Account docs: verification records, signed NDAs, consent records
- [ ] Deal docs: subscription agreements, factsheets, pitch decks, data room materials
- [ ] Download individual + bulk download per group
- [ ] Document type badges and date metadata

### Investor Profile Management

- [ ] Verification status display (linked to Persona — future)
- [ ] Consent status overview — list of all consent items with granted/withdrawn status
- [ ] Withdraw consent action (with confirmation and audit logging)
- [ ] Profile details: name, email, phone, address, accreditation info
- [ ] Industry interest preferences (used for opportunity personalization)

---

## P3 — Ops Deal & Partner Management (needed to run the business)

### Vehicle / Deal Management

- [ ] Vehicle list with state management (draft → open → closed)
- [ ] Edit published deal details (pricing, supply, dates, documents)
- [ ] Vehicle tag library — create/manage tags, detect client overlap across vehicles
- [ ] Materials upload with audience control (EAM+investor vs EAM-only)
- [ ] New deal creation wizard: company selection → pricing → terms → documents → publish
- [ ] Launch packet assembly (factsheet, pitch deck, data room link)

### Operations Action Centre (Dashboard)

- [ ] Exception queue with counts: unmatched payments, pending allocations, verification issues
- [ ] Quick-action cards linking to each ops workflow
- [ ] Activity feed of recent platform events

### Ops Document Management

- [ ] Document inbox — incoming documents for review
- [ ] Review → Accept → File workflow (with rejection + re-request)
- [ ] Filed records registry with search and download
- [ ] Document categorization and metadata tagging

### Partner Management

- [ ] Partner directory (fund managers, legal, custodians)
- [ ] Partner onboarding steps tracker
- [ ] Commercial terms per partner (fee schedules, SLAs)
- [ ] Task assignment to partners with status tracking

---

## P4 — EAM Enhancements (improve adviser experience)

### Discussion / Q&A (Investor ↔ EAM)

- [ ] Request a discussion attached to a specific opportunity
- [ ] Threaded message exchange (investor ↔ EAM)
- [ ] Discussion status: open → responded → closed
- [ ] Accessible from fund detail page and portfolio
- [ ] EAM inbox of open discussion requests from clients
- [ ] Mark discussion as resolved/closed

### Client Highlight Engagement Tracking

- [ ] Highlight lifecycle: sent → viewed → discussed
- [ ] Track when investor opens/views a highlighted opportunity
- [ ] Link highlight to discussion thread if investor requests Q&A

### Client Management Enhancements

- [ ] Client tag taxonomy — categorize clients by investment preference, risk profile
- [ ] Vehicle tag overlap detection — show which tags match between client and opportunity
- [ ] Client document upload — vouch/upload verification documents on behalf of client
- [ ] Batch highlight — send same opportunity highlight to multiple clients

### EAM Profile & Settings

- [ ] Referral link generation and management
- [ ] Notification preferences (email, in-app for new opportunities, client actions)
- [ ] Commercial terms display (fee sharing arrangement with platform)

### Revenue & Reporting

- [ ] Revenue dashboard — fees earned from client subscriptions
- [ ] Revenue query by date range, client, fund
- [ ] Statement download (PDF export)

---

## P5 — Nice-to-Have / Future

### Notification System (Noticed gem)

- [ ] In-app notification centre (bell icon with unread count)
- [ ] Notification types: subscription status change, new opportunity, discussion reply, verification update
- [ ] Email notification preferences per type

### Company Discovery (research without live deals)

- [ ] Browse/search companies that don't have active fund vehicles yet
- [ ] "Register interest" / sourcing signal — captures demand for ops to aggregate
- [ ] Company profile cards with sector, stage, description
- [ ] Sourcing demand aggregation from search signals (ops view)

### Support Cases

- [ ] Submit support case with topic type (account, subscription, technical, other)
- [ ] Case history list with status tracking

### Multi-Step Flow Infrastructure

- [ ] Reusable step tracker component (dots/labels, current step highlight, completed steps)
- [ ] Flow state persistence (resume interrupted flows)
- [ ] Progress indicator in nav/header for active flows
