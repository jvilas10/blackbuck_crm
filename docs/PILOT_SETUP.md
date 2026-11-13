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
3. Run `npm run db:setup` twice for each target. Verify each database contains one `001-bootstrap` migration record, one synthetic fixture, and the unique `fixture_key_unique` index. Test that each runtime user can only access its own database and record the results. The setup script deliberately accepts only development and staging. T07 and later tasks introduce business collections.

## T06 GitHub Actions and staging

1. Push the project to the configured GitHub remote. Open a test PR and check that lint, type check, tests, and production build pass. Require the `checks` job on main.
2. Create a Vercel project dedicated to staging, using the Node 22 runtime. Protect staging access and give its project only staging environment values. The dedicated project's production deployment is its stable staging deployment.
3. Create the GitHub environment `staging`, restrict deployments to `main`, set environment variables `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`, and set the staging deployment token in `VERCEL_TOKEN`. If deployment protection is enabled, set `VERCEL_PROTECTION_BYPASS` for the smoke check. Use the project ID for the dedicated staging project.
4. Run **CI and staging** from `main` with **Deploy the verified main commit to staging** enabled. The workflow deploys only after checks pass and verifies both the overview page and `/api/health`. Record the test PR, workflow run, and staging deployment URL in the tracker.
