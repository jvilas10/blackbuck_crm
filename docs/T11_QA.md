# T11 — Role and tenant boundary verification

Owner: Software Engineering (preparation and development rehearsal); QA Engineering (staging acceptance).
Started: 16 November 2026. Requirements: PRD R01–R05, Account boundaries, and A04. The local PRD Word document has the same access requirements as `PRD.md`.

T10 implementation is complete at commit `4d2f8b1`. T11 completion is **pending staging**: T06's staging deployment and isolated staging database/credentials are not ready. The agreed plan is to finish local development before provisioning a separate Vercel account. No deployment or staging configuration is changed by this work.

## Environment and evidence rules

- Development rehearsal uses `blackbuck_crm_dev`. Run `npm run access:verify` after `npm run db:setup`. It sequentially runs unit, authentication, tenant-boundary, and administration suites; each integration suite owns and removes only its synthetic records.
- The runner writes `.local/t11-development-evidence.json` with revision, dirty-worktree flag, environment, timestamps, per-suite exit status, and overall result. It records `stagingAcceptance: NOT_RUN` even when all local checks pass. It stops at the first failing suite and leaves a partial report if interrupted. It never records credentials, invitation links, cookies, or raw customer data.
- Existing integration scripts intentionally accept only development. Do not point them at staging by relabelling staging credentials as development. A staging runner requires explicit staging targeting and isolation checks when T06 is completed.
- Before staging acceptance, record the deployed revision, HTTPS URL, isolated database name, tester, and date. Verify the deployed revision matches the checkout used for service tests. A local service test is not evidence that deployed HTTP/session controls work.
- Use only synthetic `example.invalid` identities and fabricated enquiries. Record IDs returned by fixture creation in a run manifest; cleanup must target those exact IDs. Never drop application collections or remove records by a broad tenant/name prefix.

## Required fixture layout

Use agencies A and B; clients A1 and A2 within A, and B1 within B. Include each agency's administrator, A1/A2/B1 salespeople, two salespeople in A1, A1's client sales manager, an account manager assigned A1 without follow-up permission, a second account manager with an explicit grant, and a platform operator. Enquiries must include owned, another salesperson's, unassigned, sibling-client and foreign-agency records. Include a malformed agency/client pair in the disposable service-test collection.

## A04 verification matrix

| ID | Requirement / scenario | Expected result | Existing executable evidence |
| --- | --- | --- | --- |
| A04-01 | R01 administrator reads, reports and exports | Own agency only; foreign agency denied | `verify-permissions.mjs` |
| A04-02 | R02 account manager reads/reassigns | Assigned client only; no foreign-client assignee | `verify-permissions.mjs` |
| A04-03 | R02 follow-up without/with explicit grant | Denied without grant; allowed only in granted client | `verify-permissions.mjs` |
| A04-04 | R03 client manager lists/reports/assigns | Own client only; sibling client and foreign agency denied | `verify-permissions.mjs` |
| A04-05 | R04 salesperson reads/updates | Own assigned enquiries only; other, unassigned and out-of-scope records denied | `verify-permissions.mjs` |
| A04-06 | R04 assignment/report/export escalation | Salesperson denied; changing tenant/assignee in sales payload denied | `verify-permissions.mjs` |
| A04-07 | R05 ordinary operator customer access | Lists, reports and exports denied despite provisioning role | `verify-permissions.mjs` |
| A04-08 | Forged roles, invalid membership references, query injection | Server resolves valid stored memberships and rejects invalid scope/filter | `verify-permissions.mjs` |
| A04-09 | Invitation escalation/cross-scope, expiry, replay and races | Forbidden scopes denied; expired/cancelled tokens fail; one concurrent acceptance succeeds | `verify-auth.mjs` |
| A04-10 | Revoked access and session lifecycle | Current sessions invalidated; revoked user cannot sign in; logout/other-device logout work | `verify-auth.mjs`, `verify-administration.mjs` |
| A04-11 | Client context and renaming | Authorized selection persists; unauthorized selection/rename denied; stale rename rejected | `verify-administration.mjs` |
| A04-12 | Role/grant change and last administrator | Scope enforced; sessions ended; pending invitations cancelled; stale/self edits and final-admin removal denied, including concurrent removal | `verify-administration.mjs` |
| A04-13 | Support before approval/self-approval/wrong approver | Customer access denied until another authorized approver approves | `verify-administration.mjs` |
| A04-14 | Support grant ownership, scope and lifecycle | Other actor/client denied; expiry, rejection, revocation and loss of approver authority block reads | `verify-administration.mjs` |
| A04-15 | Support projection and audit | Only approved projected fields returned; each read recorded; tokens excluded from scoped audit history | `verify-administration.mjs` |

For each staging row record PASS/FAIL, actual result, evidence reference, and defect ID if any. The table above describes coverage; it is not a staging PASS report.

## Deployed browser and HTTP checks

1. Sign in separately as each fixture role. Confirm visible clients, invitation targets, role choices and audit history match stored scope. Test a user with memberships in more than one scope.
2. Select A1, reload, and verify the saved context. Switch to A2 and verify team/invitation/support lists update. Scope must still be checked when a direct request bypasses the screen.
3. Submit foreign agency/client IDs and attempted role escalation directly to account actions with a valid session. Expect a denied response and unchanged records; hiding buttons alone is insufficient.
4. Exercise invitations and role/grant changes. Verify a second browser session loses access after membership removal or role change. Confirm no self-edit or last-administrator removal succeeds.
5. Request support as the operator, then approve in a separate authorized manager session. Read approved synthetic records; confirm projected fields, expiry, use count and audit entry. Revoke and verify the same read is denied. Verify another operator cannot reuse the grant.
6. Call `/api/accounts` and `/api/support-records` without a session; expect 401. Send a POST with a foreign Origin; expect 403. Test invalid JSON, non-JSON content type and oversized payloads. Verify protected successful responses use `Cache-Control: no-store`.
7. Check account-page redirects, sign-out, browser back/reload, desktop/mobile layout, and console hydration errors. Capture synthetic-only screenshots of results.
8. Verify synthetic cleanup and rerun every failed scenario after a fix. Record unresolved defects rather than marking A04 complete.

There are no public enquiry, report or export HTTP routes yet. T09's service boundary supplies the initial A04 checks for those operations. Repeat through the actual feature routes when T12–T23 are implemented and during T32 regression; do not add test-only customer APIs to staging.

## Staging acceptance record

| Field | Current value |
| --- | --- |
| Staging URL / deployed revision | Not provisioned / not verified |
| Staging database / isolation evidence | Pending T05/T06 |
| QA tester / execution date | Pending |
| A04-01 through A04-15 on staging | NOT RUN |
| Deployed browser/HTTP checks | NOT RUN |
| Staging access defects | Not assessed |
| T11 completion | Blocked by staging prerequisite; local preparation can proceed |

Development rehearsal results are recorded separately in `PROJECT_STATUS.md` and the ignored evidence file. They must not replace this staging record.

## Development rehearsal — 16 November 2026

Executed 18:53–18:54 IST against `blackbuck_crm_dev`, based on revision `4d2f8b1d1a211b48421106d8e42265630d1fe57f` with the uncommitted T11 preparation changes present. `npm run access:verify` equivalent (`node scripts/verify-access.mjs`) completed successfully: 11 unit tests, T08 authentication, T09 tenant boundaries, and T10 administration all passed. The new runner also passed ESLint; `git diff --check` passed. Integration suites cleaned their synthetic records. No new access defect was found by this run. The expected rejected-session test logs an authentication error; it is an asserted negative case, not a failed suite. The local shared-IP rate-limit warning remains a deployment configuration prerequisite noted in the T08 runbook.

T10 is reverified in development. Staging A04 remains **NOT RUN**. Evidence is `.local/t11-development-evidence.json` (ignored; no credentials or raw responses).
