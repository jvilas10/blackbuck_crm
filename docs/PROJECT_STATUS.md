# BlackBuck CRM Project Status

Baseline: [Approved PRD](PRD.md)

**Completed prerequisite:** PRD reviewed and approved. All implementation tasks start as **Not started**. Assign task owners at kickoff.

## Status updates

Work through the tasks by ID. Start a task once its dependencies are done. Start Meta onboarding early in parallel with setup.

- Use **Not started**, **In progress**, **In review**, **Blocked**, or **Done**.
- In **Update**, record the owner and date when starting. For a blocker, record the next action. For a completed task, link the pull request, decision, test evidence, or approval.
- Mark a task **Done** after its completion check passes. Update the milestone once all its tasks are done.
- **Discussion** owns decisions. **Software Engineering** implements. **QA Engineering** verifies on staging. **Code Review** reviews the release changes.

## Stitch design handoff

Use the revised [BlackBuck CRM Stitch project](https://stitch.google.com/projects/13811039800336493762?pli=1) for visual implementation. The PRD governs workflows and permissions. Build the shared shell in T04 before feature screens. Use the BlackBuck logo, black navigation, white content, and orange primary actions. Keep labels short and surface details when users need them.

| Screen or workflow | Implementation tasks |
| --- | --- |
| Sign in and accept invitation | T08 |
| Agency dashboard and client switcher | T10, T22, T27 |
| Sales manager dashboard | T14, T17, T18 |
| Salesperson queue on desktop and mobile | T17, T18 |
| Searchable enquiries and manual entry | T15 |
| Enquiry detail on desktop and mobile | T15, T18, T19 |
| Six-stage pipeline | T19 |
| Campaign reporting | T22, T23 |
| Lead source setup and health | T14, T16, T24, T27 |
| Team and role settings | T07–T10 |

T32 verifies the screen mapping and the end-to-end staging workflows. Track any discrepancy against the PRD before the release review.

## Milestones

| Milestone | Tasks | Status |
| --- | --- | --- |
| 1. Pilot decisions and project setup | 01-06 | In progress |
| 2. Accounts and permissions | 07-11 | Not started |
| 3. Website intake and sales workflow | 12-20 | Not started |
| 4. Campaign reporting | 21-23 | Not started |
| 5. Facebook and Instagram intake | 24-29 | Not started |
| 6. QA production and pilot | 30-37 | Not started |

## 1. Pilot decisions and project setup

| ID | Task | Depends on | Completion check | Status | Update |
| --- | --- | --- | --- | --- | --- |
| T01 | Confirm the pilot client, sales owner and backup, qualification rules, time zone, business hours, first-contact target, escalation contact, and pilot success measures. | Approved PRD | Agency and client owners agree and record the operating rules. | In progress | Software Engineering recorded a synthetic dry-run decision and operating defaults. Next action is to confirm the real client, named contacts, and operating agreement before live intake. |
| T02 | Choose hosting provider and region, authentication library or provider, production access owners, and retention and export terms. | Approved PRD | Decisions are recorded and hosting meets the agreed data location requirement. | In review | Vercel Mumbai, Atlas Mumbai, Better Auth, and the access and data terms are recorded in the [pilot setup runbook](PILOT_SETUP.md#t02-platform-decisions). Verify data locality in the provisioned services and confirm the terms before live intake. |
| T03 | Start Meta onboarding. Identify the Page, Instant Form, client Page administrator, and app permissions. Start any applicable review early. | T01 | Test Page and form access are confirmed and remaining live approval dependencies are recorded. | Blocked | [Onboarding steps](PILOT_SETUP.md#t03-meta-onboarding) are ready. A Meta Business admin needs to supply the test Page, form, and app access and check applicable review requirements in the app dashboard. |
| T04 | Initialize Next.js App Router with React, TypeScript, and Node.js. Add dependency locking, local setup, an environment variable example, and the responsive BlackBuck shell and shared UI components. | Approved PRD | A developer can clone and run the app locally with development credentials. | In review | Lint, type check, tests, build, and local smoke checks passed. The [shell](../README.md) uses a text wordmark pending the approved logo and Stitch access. |
| T05 | Configure MongoDB Atlas development and staging environments, versioned collections and index setup, and synthetic fixtures. | T02, T04 | Environment credentials and data are isolated and the setup can be repeated. | Blocked | Versioned bootstrap, synthetic fixture, and unique index are ready. An Atlas administrator needs to provision the isolated clusters and credentials and run the [verification steps](PILOT_SETUP.md#t05-atlas). |
| T06 | Set up GitHub Actions for pull request lint, type checks, tests, and builds. Configure staging deployment and secrets. | T04, T05 | A test pull request passes CI and the application loads on staging. | Blocked | [Test PR #1](https://github.com/jvilas10/blackbuck_crm/pull/1) [passed CI](https://github.com/jvilas10/blackbuck_crm/actions/runs/43443049531). The GitHub staging environment allows deployments from main. Next action is to link the dedicated Vercel project, set its staging credentials, and verify the deployment. |

Software Engineering recorded the above setup work on 13 November 2026.

### T01 pilot operating rules

Use these defaults for the synthetic dry run. The BlackBuck Studios pilot owner and the real pilot client's sales manager confirm the rules before live intake.

| Decision | Proposal for the pilot |
| --- | --- |
| Pilot client | One BlackBuck Studios client with a Meta Page, one Instant Form covering the Facebook and Instagram placements being tested, and one website enquiry form. Client name pending. |
| Sales owner and backup | The client's primary salesperson handles the daily queue, logs contact outcomes, and schedules follow-ups. A second salesperson covers absences and picks up reassignments from the client sales manager. Both names pending. |
| Time zone and business hours | Use `Asia/Kolkata` (IST), Monday through Friday, 09:00–18:00, excluding holidays agreed with the client. Use this time zone for queue dates and response reporting. |
| First contact | Make and log the first call or message attempt within two business hours of submission. The clock starts at the next opening for out-of-hours enquiries and pauses outside business hours. A logged attempt counts even when the prospect does not answer. |
| Qualification | Mark an enquiry Qualified after two-way contact confirms a genuine need that the client can serve, an expected decision timeframe, and an agreed next step. Keep enquiries with missing information open for follow-up. Record a reason when closing an enquiry as Lost. Confirm any client-specific eligibility criteria before launch. |
| Escalation | The client sales manager reviews Unassigned at opening and takes over or reassigns enquiries when the primary and backup are unavailable or the first-contact target is missed. Route intake failures and unmapped forms to the BlackBuck Studios support contact. The two contacts and their preferred channels are pending. |

#### Proposed success measures

| Measure | Proposed target or review |
| --- | --- |
| Intake coverage and routing | All three controlled submissions (Facebook, Instagram, and a tagged website form) reach the correct client and assignee with the available attribution. Replaying a submission creates no extra enquiry. |
| First-contact response | At least 90% of live enquiries whose first-contact deadline has passed meet the two-business-hour target. Include enquiries still awaiting contact as misses once their deadline passes. Report the count and median business time for enquiries with a logged attempt. |
| Queue health | Review unassigned enquiries and overdue follow-ups every week. Aim for zero unassigned enquiries at business close and record an owner and next action for each overdue follow-up found in review. |
| Campaign outcomes | Review received, Qualified, and Won enquiry counts and qualification rate monthly. Reconcile the totals against the underlying enquiries. Use the first month to establish the qualification and Won baselines. |

Record the agency and client approvals and the final rules here before closing T01. Collect the client name, primary salesperson, backup salesperson, client sales manager, BlackBuck Studios escalation contact, and preferred escalation channels. Confirm or amend the proposed hours, response target, qualification criteria, and success measures.

## 2. Accounts and permissions

| ID | Task | Depends on | Completion check | Status | Update |
| --- | --- | --- | --- | --- | --- |
| T07 | Model agencies, client accounts, users, memberships, and role scopes. Seed two agencies and two clients within one agency. | T05 | The role matrix covers PRD R01-R05 and fixtures support access tests. | Not started |  |
| T08 | Build agency provisioning, client account setup, invite-based sign-in, sessions, logout, and access revocation. | T02, T07 | Invited users can sign in, expired invitations fail, and revoked users lose access. | Not started |  |
| T09 | Enforce server-side agency, client, and record permissions for reads, writes, assignment, reports, and any exports. | T08 | Cross-agency and cross-client requests are denied. Salespeople can access only assigned enquiries. Agency account managers are limited to assigned clients and can perform sales follow-up only with an explicit grant. | Not started |  |
| T10 | Build admin screens for clients, invitations, role changes, and client context. Audit privileged changes and enforce authorization for exceptional support access. | T09 | Agency admins and client managers can perform their permitted actions. Exceptional support access requires approval and leaves an audit record. | Not started |  |
| T11 | Verify role and tenant boundaries on staging using synthetic data. | T06, T10 | QA records initial PRD A04 results and access defects are resolved. | Not started |  |

## 3. Website intake and sales workflow

| ID | Task | Depends on | Completion check | Status | Update |
| --- | --- | --- | --- | --- | --- |
| T12 | Model contacts, enquiries, sources, activities, and follow-ups. Add indexes for external identity, tenant scope, assignment, and due date. | T07, T09 | A contact can have multiple enquiries, and external submission uniqueness is enforced. | Not started |  |
| T13 | Implement contact matching and retry-safe enquiry creation. Agree how to handle conflicting phone and email matches. | T12 | One external submission creates one enquiry. Separate legitimate submissions remain separate. | Not started |  |
| T14 | Register form connections and map each to a client and default salesperson. Add assignment and reassignment rules. | T10, T13 | A submission routes to the mapped client. An inactive or missing assignee routes to Unassigned. | Not started |  |
| T15 | Build the searchable enquiries list with basic filters, authorized manual entry, and a responsive enquiry detail view with contact, source, campaign, ownership, and history. | T13, T14 | A user can find, filter, create, and open enquiries within their permitted account on desktop and mobile. | Not started |  |
| T16 | Build website intake with form-scoped credentials, payload validation, and stable submission IDs. Carry available tracking through the website journey and store intake channel separately from marketing source and campaign. | T13, T14 | A tagged visitor who navigates before submitting retains original attribution. Retries create one enquiry, and invalid credentials are rejected. | Not started |  |
| T17 | Build New, Due today, Overdue, and Unassigned views and a manager view of enquiries awaiting first contact. Use the agreed time zone for due dates. | T01, T14, T15 | Salespeople see assigned queues. Managers can identify unassigned and uncontacted enquiries. Test due-date boundaries in the pilot time zone. | Not started |  |
| T18 | Add call and message outcomes, first-contact timestamp, and follow-up scheduling, rescheduling, and completion. | T17 | The first logged attempt sets first-contact time once and clears the enquiry from the awaiting-first-contact view. Follow-up changes update the queue and preserve history. | Not started |  |
| T19 | Build New, Contacted, Qualified, Proposal Sent, Won, and Lost stages. Record stage and assignment actor and time. | T15, T18 | Sales can progress an enquiry and the activity history shows each change. | Not started |  |
| T20 | Connect the pilot website form on staging and rehearse the sales journey. | T06, T16, T19 | A tagged form submission reaches the intended salesperson and can be followed through to Won or Lost. | Not started |  |

## 4. Campaign reporting

| ID | Task | Depends on | Completion check | Status | Update |
| --- | --- | --- | --- | --- | --- |
| T21 | Agree metric rules for submission-date cohorts, original attribution, first-contact time, qualification history, and reopened enquiries. | T01, T19 | Product and QA agree on expected results for sample enquiries. | Not started |  |
| T22 | Build the agency dashboard and scoped campaign report with client, date, source, and campaign filters and an underlying enquiry list. | T09, T21 | The dashboard shows received, Qualified, and Won counts for permitted records. Client managers and agency staff can review first-contact time and qualification rate for their scope. | Not started |  |
| T23 | Reconcile report totals against staging fixtures and the tagged website lead. | T20, T22 | QA records PRD A03 evidence. Missing attribution is visible and enquiries count once per metric. | Not started |  |

## 5. Facebook and Instagram intake

| ID | Task | Depends on | Completion check | Status | Update |
| --- | --- | --- | --- | --- | --- |
| T24 | Configure Meta Page and form mapping, secure token storage, and webhook verification. Save verified notifications durably before acknowledging them. | T03, T14 | A subscribed test Page sends a verified event recorded with its external identifiers. | Not started |  |
| T25 | Build background lead retrieval by Meta lead ID, retries for temporary failures, and visibility into expired access. | T24 | A temporary failure recovers from durable state and persistent failures are visible. | Not started |  |
| T26 | Map Meta answers to contacts and enquiries, apply client routing, and retain available campaign, ad, and placement details. | T13, T25 | Lead records appear for the right client and assignee. Missing placement shows as unknown. | Not started |  |
| T27 | Build the Lead Sources screen and agency dashboard alert with last successful import, pending or failed retrieval, unmapped forms, and controlled retry. | T25, T26 | An admin can diagnose a failure, correct the configuration, and confirm recovery. | Not started |  |
| T28 | Test Facebook and Instagram Instant Form intake on the pilot setup. | T26, T27 | QA records client, assignee, and available source and campaign details for both test submissions. | Not started |  |
| T29 | Test duplicate Meta notifications and website submissions, temporary retrieval failure, unmapped forms, and inactive assignees. | T20, T27, T28 | QA verifies A01 across all three sources and records A02 recovery evidence. Replays create one enquiry and exceptions reach the correct queue. | Not started |  |

## 6. QA production and pilot

| ID | Task | Depends on | Completion check | Status | Update |
| --- | --- | --- | --- | --- | --- |
| T30 | Prepare production hosting and Atlas, HTTPS, secrets, and GitHub Actions release controls. Keep staging resources separate. | T02, T06 | Production infrastructure is ready in the approved region and uses isolated credentials. | Not started |  |
| T31 | Set up intake failure and delay alerts and service health monitoring. Verify operational logs limit sensitive customer details. Restore a backup into an isolated environment and document recovery, rollback, and support ownership. | T27, T30 | A backup restore and simulated intake incident are verified. The assigned responder receives the alert and diagnostic logs omit tokens and unnecessary customer details. | Not started |  |
| T32 | Review the mapped Stitch screens on staging and run regression across permissions, desktop and mobile sales workflows, intake, attribution, and reporting. | T11, T23, T29 | QA records final A01-A04 evidence and verifies screen coverage, concise labels, responsive layouts, and key empty and error states. Release-blocking defects are resolved. | Not started |  |
| T33 | Review tenant boundaries, secret handling, duplicate-safe writes, retries, database changes, and release controls. | T29, T31 | Code Review findings are resolved or explicitly accepted by the release owner. | Not started |  |
| T34 | Prepare the pilot client and rehearse onboarding on staging. Train the client manager and salespeople, confirm routing, and agree support and escalation contacts. | T01, T31, T32, T33 | The client manager confirms readiness and a salesperson demonstrates the follow-up workflow on staging. | Not started |  |
| T35 | Deploy the reviewed build and provision the production client account. Confirm live Meta access and smoke-test intake, routing, and reporting with controlled submissions before switching on live intake. | T31, T34 | Controlled submissions reach the right production account. The release owner confirms go-live and the team enables live intake. | Not started |  |
| T36 | Review follow-ups, lead quality, and intake weekly. Run the monthly campaign review and reconcile the dashboard against underlying enquiries. | T35 | The agency and client review the agreed pilot measures and record corrective actions. | Not started |  |
| T37 | Close the pilot, record remaining gaps, and decide whether to onboard a second agency. | T36 | Pilot owners record their decision and identify the next release priorities. | Not started |  |

## Future releases

After the pilot, evaluate standalone subscriptions, billing, self-service onboarding, managed lead qualification, and messaging inboxes. Add implementation tasks once the next release scope is approved.
