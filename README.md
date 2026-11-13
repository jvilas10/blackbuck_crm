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
