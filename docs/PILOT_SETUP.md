# Pilot setup

## T01 pilot operating decision

Use **Demo Client**, a fictional BlackBuck Studios client, for development, staging, and a dry run. Create synthetic identities when account provisioning is available. The primary salesperson works enquiries, the backup covers absences, and the client sales manager handles queue and response escalations. BlackBuck Studios platform operations handles intake failures. Use the [operating rules and success measures](PROJECT_STATUS.md#t01-pilot-operating-rules) as dry-run defaults.

Before live intake, name the real client, primary and backup, client manager, and BlackBuck intake contact, and record both organizations' agreement to the rules and escalation channels. Use the pilot client's real Page, form, or enquiries only after that agreement.

## T02 platform decisions

| Area | Decision |
| --- | --- |
| Hosting | Vercel, with separate staging and production projects and Node functions in Mumbai (`bom1`). GitHub Actions controls deployment. |
| Database | MongoDB Atlas on AWS in Mumbai (`ap-south-1`). Use separate projects, clusters, and database users for development, staging, and production. Keep CRM records and backups in India. Before live intake confirm the provisioned region, backups, and where the selected hosting plan processes operational logs. |
| Authentication | Better Auth with its MongoDB adapter and database sessions. Public signup stays disabled. Implement invitations and account revocation in T08 and enforce role and client scopes on the server in T09. |
| Production access | BlackBuck Studios platform operations owns deploy and database access. Assign a named primary and backup before production provisioning and use organization-managed accounts with MFA. The client sales manager owns client-side access requests. |
| Retention and export | Proposed live pilot terms are to retain records during the pilot, offer an authorized client-scoped export at close, then remove live pilot records within 30 days of closure and let isolated backups expire according to their configured schedule. Confirm those terms with the live pilot client and document exceptions before receiving real data. Provision no customer data for the dry run. |

Provider references include [Vercel regions](https://vercel.com/docs/regions), [Atlas AWS regions](https://www.mongodb.com/docs/atlas/reference/amazon-aws/), and [Better Auth options](https://better-auth.com/docs/reference/options).

## T03 Meta onboarding

1. The Meta Business admin creates or selects a BlackBuck-controlled test Page and Instant Form. Record the app ID, Page ID, form ID, Page administrator, and which Facebook and Instagram placements are in scope. Keep tokens in the environment secret store.
2. Give the test operator access to the app and Page leads. Check the app's access to `leads_retrieval` and the permissions needed to discover the Page and subscribe it to `leadgen`, including `pages_show_list` and `pages_manage_metadata` where applicable. Confirm any additional permissions for the selected token flow in the Meta App Dashboard.
3. Use the [Lead Ads Testing Tool](https://developers.facebook.com/tools/lead-ads-testing) to create a synthetic lead. Confirm the test connection can list the designated form and retrieve the synthetic lead. Record IDs, the date, and the result without lead answers or tokens.
4. In the app dashboard record which permissions need Advanced Access or App Review for the live client, and whether business verification is required. Begin applicable review steps as early as the dashboard permits. The webhook handler and delivery test are tracked in T24 and the Facebook/Instagram staging test in T28.

See [Meta's lead webhook guide](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-leadgen).

## T05 Atlas

1. Create development and staging Atlas projects and clusters in Mumbai. Provision a separate runtime user in each with access scoped to `blackbuck_crm_dev` or `blackbuck_crm_staging`. Use a separate scoped setup user authorized to create indexes and write migration records. Configure each project's network access for the actual developer or staging egress. Keep staging restricted to synthetic data.
2. For a local MongoDB instance, copy `.env.example` to `.env.local`. For development Atlas, use its development URI instead. To initialize staging, inject `CRM_ENV=staging` and the staging setup user's SRV connection string as process environment variables in an authorized terminal. Enter real credentials through the secret store or local environment.
3. Run `npm run db:setup` twice for each target. Verify each database contains one record per migration, one bootstrap fixture with the unique `fixture_key_unique` index, and the account fixtures below. Verify that each runtime database user can access only its own database. The setup script accepts development and staging.

### T07 account model

Agencies are tenants. Each client account belongs to one agency. Users are shared identities whose memberships grant roles within a scope. A user can hold memberships in several scopes. An agency account manager has one membership per assigned client.

| PRD | Role | Membership scope and intended permissions |
| --- | --- | --- |
| R01 | Agency administrator | One agency. Create clients, invite staff and client managers, manage form connections and assignments, and see agency reports. |
| R02 | Agency account manager | One assigned client per membership. View reports and enquiries and reassign leads within that client. Sales follow-up requires the explicit grant on that membership. |
| R03 | Client sales manager | One client. Invite salespeople, view and assign enquiries, and review follow-ups and reports. |
| R04 | Salesperson | One client, with record access limited to enquiries assigned to the user. Log outreach, schedule the next action, and update the pipeline. |
| R05 | Platform operations | Platform scope. Provision agencies and monitor health. Exceptional access to customer records requires separate authorization and an audit trail. |

Migration `002-accounts` creates the four collections, validates membership shape for each role, and adds unique indexes for user emails and membership scopes. Fixture IDs and emails are synthetic. Agency A has two clients and Agency B has one, with two salespeople in Client A1 and account managers covering both values of the follow-up grant. MongoDB validates each document independently. Membership writes must verify that referenced users and accounts exist and that the client belongs to the given agency. Session handling and authorization enforcement are tracked in T08–T09.

Run `npm run db:verify` after setup to check migration markers, all expected account fixtures, strict validators, and required indexes without changing database records. On 14 November 2026, Atlas development setup succeeded twice and verification passed: 2 agencies, 3 clients, 10 users, and 10 memberships. Development credentials are in Git-ignored `.env.local`.

## T08 accounts and authentication

Run `npm run db:setup` to apply migration `003-auth`. Configure `BETTER_AUTH_URL` (locally `http://localhost:3000`) and a random `BETTER_AUTH_SECRET` of at least 32 characters in `.env.local`. Credentials remain server-side. Better Auth uses separate `auth_users`, `auth_accounts`, `auth_sessions`, and `auth_verifications` collections; CRM memberships continue to reference the T07 identity via `crmUserId`. Passwords use Better Auth's password hashing implementation. Public signup and unrelated auth endpoints are disabled.

For the first development operator, run `npm run accounts:bootstrap -- operator@example.invalid`. Open the private link in `.local/operator-invitation.txt`, choose a name and password, then sign in at `/sign-in`. The bootstrap is development-only and refuses to run once a non-fixture operator exists. Synthetic fixture memberships do not grant login credentials. The `.local` directory is Git-ignored; do not publish invitation links.

At `/account`, a platform operator creates agencies and invites agency administrators. Agency administrators create their own clients and invite client managers, assigned-client account managers, and salespeople. Client managers can invite salespeople only within their own clients. Server checks enforce these provisioning boundaries. More extensive enquiry authorization belongs to T09.

Invitations expire after 48 hours. Tokens are random, stored only as hashes, and carried in a URL fragment to avoid request URLs and referrers. Acceptance atomically consumes the invitation and creates the auth identity, password account, CRM identity, and scoped membership. Existing accounts must sign in first. Invalid, expired, cancelled, replayed, or no-longer-authorized invitations fail. The local workflow displays a private link for manual delivery; no emails are sent and no email provider is required for local acceptance tests. Production email delivery remains a deployment prerequisite.

Sessions last seven days and refresh after one day of activity. Database session checks and current memberships protect the account screen and provisioning API; cookie caching is disabled. Users can sign out the current device or all other devices. Revoking a membership deletes that scope, cancels matching pending invitations, and ends all current sessions for that user. If other memberships remain, the user can sign in again with those scopes. Auth rate limits remain enabled; deployment must configure a trusted proxy/IP strategy before shared production use.

`npm run auth:verify` exercises the real database and Better Auth handler with unique synthetic identities, and removes only its own records afterward. It verifies provisioning, invite-only signup, existing-user acceptance, replay/concurrent acceptance, expiration/cancellation, scope boundaries, login, session persistence, other-device logout, logout, and access revocation. It is restricted to development and intentionally spaces logins to respect the real rate limiter.

References: [Better Auth MongoDB adapter](https://better-auth.com/docs/adapters/mongo), [session management](https://better-auth.com/docs/concepts/session-management), and [Next.js integration](https://better-auth.com/docs/integrations/next).

## T09 server-side permissions

`lib/authorization.mjs` resolves membership grants from stored CRM identities and checks that referenced agencies and clients exist and belong together. Session validation, the account directory, provisioning writes, and invitation acceptance all use fresh database grants. Request-provided roles are never authoritative. Platform operations can provision account metadata, but ordinary customer enquiry, sales, report, and export access remains denied. T10 adds a separate approved, audited, read-only support path described below.

| Role | Customer reads | Sales updates | Assignment | Reports / export rows |
| --- | --- | --- | --- | --- |
| Agency administrator | Own agency | Requires an additional sales role | Own agency | Own agency |
| Agency account manager | Assigned clients | Assigned clients only with explicit follow-up grant | Assigned clients | Assigned clients |
| Client sales manager | Own client | Own client | Own client | Own client |
| Salesperson | Own assigned enquiries | Own assigned enquiries | Denied | Denied |
| Platform operations | Denied | Denied | Denied | Denied |

`lib/enquiry-access.mjs` is the guarded persistence boundary for future enquiry features. Reads, record lookup, sales updates, assignment, grouped counts, and export rows include server-generated scope predicates in the actual MongoDB operation. Assignment validates the target user's current client-scoped sales eligibility. Sales updates cannot change tenant/client/owner fields or accept arbitrary MongoDB operators. Record IDs outside the allowed scope return the same not-found error as nonexistent records. Explicit unauthorized client filters are denied. Lists and export rows are bounded; exports use a limited field projection.

T09 supplies the permissions foundation, not the T12 enquiry model, T19 history/pipeline workflow, T22 campaign metrics, or a public export endpoint. Those tasks must use this boundary and add their domain validation/history. In particular, the internal grouped-count operation is not the final historical Qualified/Won campaign calculation. No new customer-data HTTP routes are exposed by T09.

Run `npm run permissions:verify` in development for real Atlas isolation tests. It clones synthetic role fixtures, uses a uniquely named disposable enquiry collection, and removes only its own data. Tests include two agencies and two clients in one agency; own/other/unassigned enquiries; cross-scope reads and writes; assignment targets; reports/exports; explicit follow-up grants; forged roles; malformed client-agency memberships; and revocation. `npm test` includes the pure permission matrix tests. Staging QA remains T11.

## T10 administration and exceptional support

The `/account` screen includes client listing/renaming, invitations, role and follow-up-grant editing, membership revocation, saved client context, support requests, and audit history. Client context filters account lists and retains agency-wide memberships for the selected client's agency; it never supplies authorization. Clear the selection to see all permitted clients. Refresh account reloads current permissions, support state, and audit events. Timestamps hydrate safely into the browser's locale and timezone.

Agency administrators manage their own agency's client roles, while client sales managers manage salesperson invitations and access only for their own clients. Platform operators provision agency administrators. Users cannot edit/revoke their own membership. Role changes invalidate the affected user's sessions and cancel outstanding invitations in the affected scope. Stale edits return a conflict; a transaction lock prevents concurrent removals from deleting the final agency administrator.

An operator requests support access for one client with a reason. Pending requests expire after 24 hours. A different agency administrator or client sales manager for that client approves, rejects, or revokes the request; operators can revoke their own requests but cannot self-approve. Approval lasts one hour. Each `POST /api/support-records` revalidates the operator, current approver authority, client pair, grant ownership, expiry and status. It returns at most 100 projected enquiry records and commits the read audit before returning data. Revocation or loss of approver authority blocks further reads. Ordinary T09 operator permissions remain unchanged. The screen shows an empty result until enquiries exist; the full enquiry model/workflow is a later task.

Audit events cover agency/client creation, client renames, invitations, membership changes, support decisions/reads, and client selection. Agency admins see their agency, client managers their client, and operators their own events (latest 100). Passwords, invitation tokens and enquiry payloads are excluded from audit details. Audit retention/export tooling is outside T10.

Run `npm run db:setup` before using these actions. Migration `004-administration` creates audit validation/indexes, support indexes, user preferences and administrator locks. It was applied to `blackbuck_crm_dev` and safely rerun on 16 November 2026.

Run `npm run administration:verify` with the development environment configured. Tests clone unique synthetic fixtures, use an isolated disposable enquiry collection, and remove their records in cleanup. Coverage includes client selection/renaming, tenant isolation, stale edits, role/grant restrictions, session invalidation, invitation cancellation, support approval/rejection/expiry/revocation, revoked approver authority, projected reads, audit scopes, normal operator denial, and concurrent last-admin protection. T08/T09 integration regressions also passed. Browser checks verified context persistence across reload, client renaming, follow-up role editing, support approval/read/audit/revocation and sign-out. Staging QA is T11 and remains deferred with deployment.

## T06 GitHub Actions and staging

1. Push the project to the configured GitHub remote. Open a test PR and check that lint, type check, tests, and production build pass. Require the `checks` job on main.
2. Create a Vercel project dedicated to staging, using the Node 22 runtime. Protect staging access and give its project only staging environment values. The dedicated project's production deployment is its stable staging deployment.
3. Create the GitHub environment `staging`, restrict deployments to `main`, set environment variables `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`, and set the staging deployment token in `VERCEL_TOKEN`. If deployment protection is enabled, set `VERCEL_PROTECTION_BYPASS` for the smoke check. Use the project ID for the dedicated staging project.
4. Run **CI and staging** from `main` with **Deploy the verified main commit to staging** enabled. The workflow deploys only after checks pass and verifies both the overview page and `/api/health`. Record the test PR, workflow run, and staging deployment URL in the tracker.
