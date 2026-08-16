# Dev30 1.1 hosted runbook

Dev30 1.1 keeps the local-first development workflow while adding a cost-bounded hosted SaaS boundary. Follow this runbook in order. Do not enable billing or email before identity, storage, and fresh-analysis metering are healthy.

## 1. Local development

No hosted billing service is required:

```env
NODE_ENV=development
DEV30_STORAGE_BACKEND=local
GITHUB_TOKEN=github_pat_...
```

When RevenueCat is not configured in development, local workspaces receive Pro-equivalent feature access so private analysis, stakeholder reports, and schedule testing remain available. To exercise the hosted Free experience locally:

```env
DEV30_FORCE_PLAN=free
```

Use `DEV30_FORCE_PLAN=pro` only as an explicit development/pilot override, never as production billing state.

## 2. Hosted multi-user baseline

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

Do **not** carry a developer PAT into a normal multi-user deployment. Production rejects `GITHUB_TOKEN` by default because one server PAT must not become the identity for every visitor.

A controlled single-user pilot can opt into:

```env
ALLOW_PAT_IN_PRODUCTION=true
```

Remove that escape hatch before inviting other users.

## 3. Shared persistence

Apply [`SUPABASE_SCHEMA.sql`](./SUPABASE_SCHEMA.sql) in the target Supabase project.

The schema covers:

- browser sessions;
- durable encrypted GitHub workspace connections;
- evidence snapshots;
- stakeholder reports;
- weekly schedules and leases;
- monthly usage counters;
- legacy billing/event state retained for compatibility;
- email delivery receipts.

The current runtime subscription source of truth is RevenueCat, not the legacy billing table.

Server RPCs include:

- `dev30_claim_due_schedules` — lease due jobs using `FOR UPDATE SKIP LOCKED`;
- `dev30_consume_usage` — atomically check and increment workspace quota.

Prefer:

```env
SUPABASE_SECRET_KEY=sb_secret_...
```

Legacy projects may use `SUPABASE_SERVICE_ROLE_KEY`. Neither key may be exposed to browser JavaScript.

## 4. Explicit local-history migration

Dry run:

```bash
DEV30_STORAGE_BACKEND=supabase node scripts/migrate-local-to-supabase.mjs
```

Apply only after checking the target project and counts:

```bash
DEV30_STORAGE_BACKEND=supabase node scripts/migrate-local-to-supabase.mjs --apply
```

The migration copies snapshot/report artifacts only, preserves workspace boundaries, skips known duplicates, never deletes local files, and does not migrate browser sessions.

Public reports generated before snapshot schema v4 do not contain the full durable reader payload. Refresh a legacy public report once after upgrading if it must survive process/cache restarts as a shareable `/u/<username>` page.

## 5. Production GitHub App

Configure the app homepage to the public Dev30 origin and callback:

```text
https://your-dev30-domain.example/auth/github/callback
```

Server variables:

```env
GITHUB_APP_CLIENT_ID=...
GITHUB_APP_CLIENT_SECRET=...
GITHUB_APP_SLUG=...
```

Recommended repository permissions remain read-only:

- Metadata: read;
- Contents: read;
- Pull requests: read.

After OAuth, Dev30 uses stable workspace identity `github:<github-user-id>`. The same value becomes the RevenueCat App User ID. Fresh analyses are metered against this connected workspace, not against the username being analyzed.

Dev30 also persists an encrypted durable GitHub connection for scheduled Pro work. The credential is AES-256-GCM encrypted before persistence.

## 6. Deploy the Node container

Build:

```bash
docker build -t dev30:1.1.0 .
```

Do not put `.env` in the image. Supply secrets through the deployment platform.

The container exposes port 3000 and health-checks:

```text
GET /api/ready
```

Use a managed HTTPS proxy and set `TRUST_PROXY=true` where appropriate.

Production startup fails when:

- `APP_BASE_URL` is missing or insecure without the explicit pilot override;
- `DEV30_SESSION_SECRET` is missing;
- shared storage is absent without the single-instance storage override;
- a shared server PAT is present without the explicit PAT pilot override.

Warnings rather than startup blockers include missing cron, Resend, GitHub App, or partial RevenueCat configuration. A production service without GitHub App cannot create new metered user workspaces, so treat that warning as a launch blocker even though the process can still serve saved public reports.

## 7. Verify health/readiness

Runtime diagnostics:

```text
GET /api/health
```

Strict readiness:

```text
GET /api/ready
```

Do not send pilot traffic until `/api/ready` returns HTTP 200 and shared persistence is reachable.

## 8. Fresh-analysis economics

Hosted fresh analysis is a write/compute action:

```text
POST /api/analyze
```

It requires connected GitHub identity unless the exact report is already present in the in-memory cache. For a true fresh collection, Dev30:

1. confirms the target GitHub username exists;
2. consumes the connected workspace analysis quota;
3. performs repository / commit / PR discovery;
4. asks DeepSeek to synthesize the evidence when configured;
5. persists a snapshot/report artifact.

Invalid GitHub usernames therefore do not consume a quota unit. Cache hits are returned before metering.

Saved public reports are reader actions:

```text
GET /api/public-report?username=...&days=30&locale=en
```

They consume no quota and do not invoke GitHub or DeepSeek. `/u/<username>` uses this path on initial load. Refreshing the report uses fresh Analyze and therefore consumes quota.

## 9. DeepSeek cost telemetry

Configure the current estimate baseline:

```env
DEEPSEEK_INPUT_USD_PER_MILLION=0.14
DEEPSEEK_OUTPUT_USD_PER_MILLION=0.28
```

Every successful provider call logs a structured line beginning with:

```text
[dev30-ai]
```

The log contains operation, model, prompt/completion/total token counts and estimated USD cost. It does not include repository content or workspace ID. Treat the rate variables as deploy-time configuration because provider pricing can change.

## 10. RevenueCat + Paddle

RevenueCat is the entitlement source of truth. Paddle Billing is the intended web billing engine behind RevenueCat.

Create the real RevenueCat/Paddle products externally, then configure:

```env
REVENUECAT_API_KEY=...
REVENUECAT_ENTITLEMENT_ID=pro
REVENUECAT_PURCHASE_LINK_URL=https://pay.rev.cat/<production-token>
REVENUECAT_WEBHOOK_AUTH=<long-opaque-authorization-value>
```

Configure a RevenueCat Web Purchase Link backed by Paddle. Dev30 appends the stable `github:<user-id>` workspace ID as the RevenueCat App User ID.

Configure the RevenueCat webhook target:

```text
POST https://your-dev30-domain.example/api/billing/webhook
Authorization: <same REVENUECAT_WEBHOOK_AUTH value>
```

The webhook only invalidates Dev30's short-lived RevenueCat customer cache. Entitlement checks continue to read RevenueCat customer state; a webhook payload cannot directly grant Pro.

Upgrade endpoint:

```text
POST /api/billing/checkout
```

Subscription-management endpoint:

```text
POST /api/billing/portal
```

The latter uses RevenueCat's customer `management_url` when one exists.

Do not configure production from the old Stripe variables. `src/billing.mjs` and legacy persisted billing/event rows remain temporarily for compatibility but no longer determine runtime plan.

## 11. Plan boundaries

Current defaults:

| Metric / month | Free | Pro |
| --- | ---: | ---: |
| Fresh analyses | 5 | 100 |
| Stakeholder reports | 0 | 50 |
| Scheduled runs | 0 | 8 |
| Email deliveries | 0 | 8 |

Private repository analysis is Pro-only. Client/founder report creation is Pro-only. Weekly automation and email are Pro-only.

Reading saved public reports and their evidence remains free.

Pricing/currency are deliberately not hard-coded in the repository. Configure monthly/annual prices in RevenueCat/Paddle once the real billing project exists.

## 12. Weekly schedule execution

Configure:

```env
DEV30_CRON_SECRET=...
DEV30_CRON_BATCH=10
DEV30_CRON_LEASE_SECONDS=900
```

Repository Actions secrets:

```text
DEV30_HOSTED_URL=https://your-dev30-domain.example
DEV30_CRON_SECRET=<same server secret>
```

`.github/workflows/hosted-cron.yml` calls:

```text
POST /api/internal/run-due
Authorization: Bearer <DEV30_CRON_SECRET>
```

The application decides which schedules are due. Each run has a lease plus stable report/delivery idempotency keys.

A real Free plan does not run scheduled work. A temporary RevenueCat outage is treated as entitlement-provider unavailability and remains retryable rather than advancing a paid user's schedule to the following week.

## 13. Email delivery

Optional Resend configuration:

```env
RESEND_API_KEY=...
DEV30_EMAIL_FROM=Dev30 <reports@your-domain.example>
DEV30_EMAIL_REPLY_TO=optional@example.com
```

Verify the sender/domain externally before real recipients are enabled. If Resend is absent, Dev30 can prepare the scheduled report and records `report_ready_email_not_configured`; it never claims delivery happened.

## 14. Final hosted-pilot checks

Before inviting users verify all of the following:

- public HTTPS URL is stable;
- `/api/ready` is 200;
- GitHub App login creates different workspace IDs for two test users;
- a fresh analysis decrements the correct workspace quota;
- a cache hit does not decrement quota;
- the sixth Free fresh analysis is rejected;
- a saved `/u/<username>` report remains readable after a process restart;
- private analysis is rejected for Free and allowed for Pro;
- RevenueCat entitlement maps only the matching `github:<id>` customer to Pro;
- a RevenueCat outage never grants Pro;
- scheduler/provider failures retry without duplicate report/email delivery;
- `[dev30-ai]` logs show actual token/cost telemetry;
- no API key or private evidence appears in browser bundles or logs.

## 15. What this repository does not claim

Green CI does **not** mean external SaaS resources exist. Live activation still requires secrets/resources that must never be committed:

- a real HTTPS domain/deployment;
- a Supabase project with schema applied;
- a production GitHub App;
- a RevenueCat project and approved/configured Paddle Billing setup;
- a verified Resend sender if email is enabled.

See [`MONETIZATION.md`](./MONETIZATION.md) for the product/economics boundary.
