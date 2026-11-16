# BlackBuck CRM

## Run locally

Use Node.js 22.13 or newer in the Node 22 line and npm.

```sh
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The shell and `/api/health` run without a database or third-party credentials.

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

See the [pilot setup runbook](docs/PILOT_SETUP.md) for Atlas, staging, and Meta onboarding.

## Accounts and sign-in

Configure `CRM_ENV`, `MONGODB_URI`, `BETTER_AUTH_URL`, and a random `BETTER_AUTH_SECRET` in Git-ignored `.env.local`, then run `npm run db:setup`. For the first local operator, run `npm run accounts:bootstrap -- operator@example.invalid` and open the private link saved in `.local/operator-invitation.txt`. Accept it with your chosen password and sign in at `/sign-in`.

The `/account` screen supports agency/client provisioning, scoped invitations, invitation cancellation, logout, other-device logout, and membership revocation. Registration is invitation-only. Local invitations are private copyable links; email delivery is not configured. Run `npm run auth:verify` for the synthetic Atlas integration checks (development only), and see the [T08 runbook](docs/PILOT_SETUP.md#t08-accounts-and-authentication) for details.

## Server-side permissions

T09 resolves current memberships from MongoDB and validates agency/client relationships before granting access. Future enquiry services must use `lib/enquiry-access.mjs` for scoped reads, sales updates, assignment, reports, and export queries. Platform provisioning does not grant access to customer records. Run `npm run permissions:verify` for the isolated Atlas permission tests; see the [permission matrix and integration contract](docs/PILOT_SETUP.md#t09-server-side-permissions). Enquiry models, workflow history, campaign reporting, and public export features remain separate tasks.

## Administration

T10 adds client renaming, role/grant editing, saved client context, scoped audit history, and approved one-hour read-only support access to `/account`. Run `npm run db:setup` to apply migration 004, then `npm run administration:verify` for development Atlas integration checks. See the [T10 runbook](docs/PILOT_SETUP.md#t10-administration-and-exceptional-support) for permissions, approval rules, and verification details.
