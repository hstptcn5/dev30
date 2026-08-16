# Dev30 1.0 hosted runbook

Dev30 1.0 keeps the zero-config local workflow, but also contains the persistence, identity, scheduling, delivery, quota, and billing boundaries needed for a hosted pilot.

This document is deliberately ordered as an operations checklist. Do not enable billing or email before the core hosted workspace is healthy.

## 1. Pick the runtime mode

### Local / personal development

No hosted services are required:

```env
NODE_ENV=development
DEV30_STORAGE_BACKEND=local
GITHUB_TOKEN=github_pat_...
```

This preserves the workflow used during development. Snapshot history, reports, SaaS pilot state, and optional sessions stay under `data/` and are gitignored.

### Hosted multi-user pilot

Use shared persistence and GitHub App OAuth:

```env
NODE_ENV=production
APP_BASE_URL=https://your-dev30-domain.example
DEV30_STORAGE_BACKEND=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
DEV30_SESSION_SECRET=<long-random-secret>
TRUST_PROXY=true
```

Do **not** carry a developer PAT into a normal multi-user deployment. Production refuses `GITHUB_TOKEN` by default because one server PAT would otherwise become a shared identity for every visitor.

A controlled single-user pilot can explicitly opt into the escape hatch:

```env
ALLOW_PAT_IN_PRODUCTION=true
```

Remove it before inviting other users.

## 2. Create shared persistence

Apply [`SUPABASE_SCHEMA.sql`](./SUPABASE_SCHEMA.sql) in the Supabase SQL editor.

The schema creates server-only tables for:

- browser sessions;
- durable encrypted GitHub workspace connections;
- evidence snapshots;
- stakeholder reports;
- weekly schedules and leases;
- monthly usage counters;
- billing state and processed webhook IDs;
- email delivery receipts.

It also creates two server RPCs:

- `dev30_claim_due_schedules` — claims due jobs with `FOR UPDATE SKIP LOCKED` and a lease, preventing concurrent cron workers from running the same schedule at once;
- `dev30_consume_usage` — atomically checks and increments a workspace quota.

Anon/authenticated database roles are explicitly denied access. The Dev30 server accesses these tables using the server secret only.

### Server key

Prefer the current server secret:

```env
SUPABASE_SECRET_KEY=sb_secret_...
```

Legacy projects may still use:

```env
SUPABASE_SERVICE_ROLE_KEY=...
```

Never expose either value to browser JavaScript or a public build argument.

## 3. Migrate existing local history explicitly

Switch the environment to the target Supabase project, then run a dry run:

```bash
DEV30_STORAGE_BACKEND=supabase node scripts/migrate-local-to-supabase.mjs
```

It prints local snapshot/report counts and performs no writes.

After reviewing the target project and counts:

```bash
DEV30_STORAGE_BACKEND=supabase node scripts/migrate-local-to-supabase.mjs --apply
```

The migration:

- copies snapshot/report artifacts only;
- keeps workspace boundaries;
- skips known duplicates;
- never deletes the local files;
- intentionally does not migrate browser sessions.

Keep the local files until the hosted workspace has been verified.

## 4. Configure the production GitHub App

Set the GitHub App homepage to the public Dev30 origin and the callback to:

```text
https://your-dev30-domain.example/auth/github/callback
```

Server environment:

```env
GITHUB_APP_CLIENT_ID=...
GITHUB_APP_CLIENT_SECRET=...
GITHUB_APP_SLUG=...
```

When `APP_BASE_URL` is set, Dev30 derives the callback automatically unless `GITHUB_OAUTH_CALLBACK_URL` explicitly overrides it.

Recommended repository permissions remain read-only:

- Metadata: read;
- Contents: read;
- Pull requests: read.

After OAuth, Dev30 stores a durable workspace connection separately from the browser session. The GitHub credential is AES-256-GCM encrypted before persistence. This durable connection is what allows weekly reports to run after the browser is closed or the session cookie expires.

## 5. Deploy the Node container

Build:

```bash
docker build -t dev30:1.0.0 .
```

Do not copy `.env` into the image. Supply secrets through the deployment platform.

The container exposes port 3000 and includes a health check against:

```text
GET /api/ready
```

Use the platform's HTTPS proxy and set `TRUST_PROXY=true` when appropriate.

### Runtime safety checks

Production startup fails when:

- `APP_BASE_URL` is missing or not HTTPS (unless the explicit insecure-pilot override is set);
- `DEV30_SESSION_SECRET` is missing;
- shared storage is not configured (unless the explicit single-instance storage override is set);
- a server PAT is present without the explicit PAT pilot override.

The following remain warnings rather than startup blockers because the public analyzer can operate without them:

- GitHub App absent → no multi-user private workspace;
- cron secret absent → no scheduled execution;
- Resend absent → scheduled reports can be prepared but not emailed;
- partial Stripe configuration → upgrade UI remains disabled.

## 6. Verify health and readiness

Process/runtime diagnostics:

```text
GET /api/health
```

Strict readiness:

```text
GET /api/ready
```

A hosted instance should not receive traffic until `/api/ready` returns HTTP 200 and all configured persistence tables are reachable.

## 7. Enable weekly schedule execution

Generate a long random secret and configure:

```env
DEV30_CRON_SECRET=...
DEV30_CRON_BATCH=10
DEV30_CRON_LEASE_SECONDS=900
```

The repository includes `.github/workflows/hosted-cron.yml`, which calls the internal runner hourly. Configure these repository Actions secrets:

```text
DEV30_HOSTED_URL=https://your-dev30-domain.example
DEV30_CRON_SECRET=<same server secret>
```

The runner calls:

```text
POST /api/internal/run-due
Authorization: Bearer <DEV30_CRON_SECRET>
```

The application, not GitHub Actions, decides which schedules are due. This keeps each user's timezone/day/hour logic in one place.

Each run is protected by:

1. a database/local lease while claimed;
2. a stable Dev30 delivery idempotency key based on schedule ID + scheduled timestamp;
3. the email provider idempotency key when delivery is enabled.

A crash after report generation can therefore reuse the prepared report instead of generating a second artifact.

## 8. Enable email delivery (optional)

Set:

```env
RESEND_API_KEY=...
DEV30_EMAIL_FROM=Dev30 <reports@your-domain.example>
DEV30_EMAIL_REPLY_TO=optional@example.com
```

Before enabling real recipients, verify the sender/domain according to the email provider's requirements.

If email is not configured, a due schedule still creates its evidence-backed report and records `report_ready_email_not_configured`; it does not pretend the email was sent.

## 9. Enable billing (optional and last)

Public username analysis remains usable without Stripe.

To expose the Pro upgrade button, all of the following must be configured:

```env
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
STRIPE_PRO_PRICE_ID=...
APP_BASE_URL=https://your-dev30-domain.example
```

Configure the Stripe webhook endpoint as:

```text
POST https://your-dev30-domain.example/api/billing/webhook
```

The webhook must receive subscription lifecycle events used by Dev30, including checkout completion and subscription create/update/delete events.

Dev30 verifies the webhook signature against the raw request body and deduplicates processed event IDs. Checkout completion alone does not grant Pro; the workspace becomes Pro only when a matching configured price has an `active` or `trialing` subscription state.

The workspace also exposes a customer-portal action once a Stripe customer is linked.

## 10. Plans and quotas

Current server-side entitlement defaults are intentionally simple and can be tuned in `src/entitlements.mjs`:

| Metric / month | Free | Pro |
| --- | ---: | ---: |
| Private fresh analyses | 60 | 1500 |
| Stakeholder reports | 12 | 200 |
| Scheduled report runs | 4 | 100 |
| Email deliveries | 4 | 100 |

Public analysis is not metered by this workspace ledger. Cache hits do not consume a fresh-analysis unit.

`DEV30_FORCE_PLAN=free|pro` exists only for development/pilot validation. Do not use it as a production billing system.

## 11. Local single-user smoke test after upgrading

Your current PAT workflow remains available in development:

```powershell
$env:NODE_ENV="development"
$env:DEV30_STORAGE_BACKEND="local"
npm start
```

Verify:

```text
GET http://localhost:3000/api/health
GET http://localhost:3000/api/ready
```

Then open `/workspace`, analyze the connected account, create a snapshot/report, and optionally create a weekly schedule after setting a stable `DEV30_SESSION_SECRET`.

## 12. What 1.0 does not claim

A green repository CI run does **not** mean a real hosted tenant has already been provisioned. Live production validation still requires credentials and resources that must not be committed:

- a real domain / HTTPS deployment;
- a Supabase project with the schema applied;
- a production GitHub App installation;
- a verified email sender if email is enabled;
- Stripe test/live products, webhook secret, and price if billing is enabled.

The code is designed to fail closed or clearly report unavailable features when those resources are missing rather than pretending they are live.
