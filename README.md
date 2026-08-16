# Dev30

**Dev30 turns recent GitHub activity into evidence-backed work briefings, comparable history, and stakeholder-ready development updates.**

Dev30 is not a contribution counter and does not score developers. It collects GitHub evidence first, reconstructs meaningful work units, derives deterministic engineering signals, then asks DeepSeek to explain what was observed.

## Dev30 1.1

Dev30 1.1 adds the monetization foundation required before a hosted SaaS pilot:

- **Fresh Analyze has identity and quota** — hosted fresh analysis is tied to the connected GitHub workspace, not the username being analyzed.
- **Free / Pro boundary** — Free gets 5 fresh analyses/month; Pro gets 100 plus private analysis, stakeholder reports, weekly automation, and email delivery.
- **Saved public reports stay free to read** — `/u/<username>` reads a durable public report without calling GitHub or DeepSeek again.
- **RevenueCat-first entitlement** — RevenueCat is the runtime subscription source of truth; Paddle Billing is the intended web billing engine behind it.
- **Stable billing identity** — `github:<github-user-id>` is both the Dev30 workspace ID and RevenueCat App User ID.
- **DeepSeek cost telemetry** — successful model calls record prompt/completion tokens and an explicit configurable estimated cost.
- **Local development stays billing-free** — local/PAT development without RevenueCat gets Pro-equivalent access; `DEV30_FORCE_PLAN=free` exercises the Free experience.

The existing evidence, history, workspace, schedule, email, Supabase, Docker, and production-safety boundaries remain in place.

## Core product

- Plain-language 7 / 30 / 90-day GitHub work briefings.
- Evidence ledger linking material claims to collected PRs and commits.
- Deterministic work-unit reconstruction and engineering work mix.
- Snapshot history and deterministic “what changed?” comparison.
- Private repository analysis for the connected account.
- Client / founder stakeholder updates with Markdown export.
- GitHub App workspace identity for hosted multi-user use.
- Weekly timezone-aware automatic reports with lease/idempotency protection.
- Optional Resend email delivery.
- Local JSON persistence for development or Supabase for hosted multi-user persistence.
- Runtime fail-fast checks, `/api/ready`, Docker, hosted cron, and explicit local→remote migration.

Every material report claim is constrained to GitHub evidence IDs that Dev30 actually collected. Snapshot comparison is computed before DeepSeek narrates the delta.

## Product flow

```text
Connected GitHub workspace
    ↓
fresh-analysis quota
    ↓
7 / 30 / 90 day GitHub evidence collection
    ↓
repositories + commits + PRs + sampled changed-file metadata
    ↓
deterministic work units + engineering mix
    ↓
evidence ledger
    ↓
DeepSeek explanation
    ↓
persistent snapshot / saved public report
    ↓
deterministic snapshot delta
    ↓
optional Pro client/founder report
    ↓
optional Pro weekly schedule + email
```

Reader flow is deliberately cheaper:

```text
/u/<username>
    ↓
GET /api/public-report
    ↓
persisted public snapshot/report
    ↓
no GitHub request
no DeepSeek request
no quota unit
```

## Run locally

Requires Node.js 22+.

```bash
cp .env.example .env
# Fill DEEPSEEK_API_KEY and preferably GITHUB_TOKEN for local testing
npm start
```

Open `http://localhost:3000`.

Dev30 has no npm runtime dependencies; it uses the Node.js standard library and native `fetch`.

Local PAT development remains simple:

```env
NODE_ENV=development
DEV30_STORAGE_BACKEND=local
GITHUB_TOKEN=github_pat_...
```

When RevenueCat is absent in development, the local workspace receives Pro-equivalent feature access. To test Free locally:

```env
DEV30_FORCE_PLAN=free
```

## Hosted identity and quota

Production fresh analysis requires a GitHub App workspace identity. A workspace looks like:

```text
github:116537093
```

The same stable value is the RevenueCat App User ID.

A public fresh analysis is charged to the **viewer/workspace running the analysis**, not to the GitHub username being analyzed. Dev30 confirms the target GitHub profile exists before consuming the quota, then performs the more expensive repo/commit/PR collection.

In-memory cache hits are returned before metering.

Current monthly defaults:

| Capability | Free | Pro |
| --- | ---: | ---: |
| Fresh analyses | 5 | 100 |
| Stakeholder reports | 0 | 50 |
| Scheduled runs | 0 | 8 |
| Email deliveries | 0 | 8 |

Private repository analysis is Pro-only. Client/founder report creation is Pro-only. Weekly automation and email delivery are Pro-only.

These are product defaults, not externally guaranteed pricing terms.

## RevenueCat + Paddle

RevenueCat is the runtime entitlement source of truth. Paddle Billing is the intended web billing engine / Merchant of Record behind RevenueCat.

Activation variables:

```env
REVENUECAT_API_KEY=
REVENUECAT_ENTITLEMENT_ID=pro
REVENUECAT_PURCHASE_LINK_URL=https://pay.rev.cat/<production-token>
REVENUECAT_WEBHOOK_AUTH=<opaque-shared-authorization-value>
```

Checkout:

```text
POST /api/billing/checkout
```

Subscription management:

```text
POST /api/billing/portal
```

RevenueCat webhook/cache invalidation:

```text
POST /api/billing/webhook
Authorization: <REVENUECAT_WEBHOOK_AUTH>
```

A webhook cannot directly grant Pro. It invalidates the short-lived customer cache; entitlement checks continue to read RevenueCat customer state.

Legacy `src/billing.mjs` and old billing/event persistence remain temporarily for compatibility but no longer determine runtime plan.

See [`docs/MONETIZATION.md`](docs/MONETIZATION.md).

## DeepSeek usage / cost telemetry

Successful model calls record structured logs beginning with:

```text
[dev30-ai]
```

The telemetry records operation, model, prompt tokens, completion tokens, total tokens, estimated USD cost, and the rates used. It does not include private repository content or workspace IDs.

Rates are deploy-time configuration:

```env
DEEPSEEK_INPUT_USD_PER_MILLION=0.14
DEEPSEEK_OUTPUT_USD_PER_MILLION=0.28
```

They are estimates and can be changed without application code if provider pricing changes.

## Persistent public reports

Snapshot schema v4 stores the complete normalized public report payload needed to render a durable public briefing.

```text
GET /api/public-report?username=hstptcn5&days=30&locale=vi
```

This endpoint reads persistence only. It does not call GitHub or DeepSeek and does not consume analysis quota.

Public reports created before schema v4 must be refreshed once to become durable reader artifacts.

## Local and hosted persistence

With `DEV30_STORAGE_BACKEND=local`, gitignored files under `data/` store sessions, snapshot history, stakeholder reports, schedules/usage state, and delivery receipts.

For hosted multi-user persistence:

```env
NODE_ENV=production
APP_BASE_URL=https://your-dev30-domain.example
DEV30_STORAGE_BACKEND=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
DEV30_SESSION_SECRET=<long-random-secret>
```

Apply [`docs/SUPABASE_SCHEMA.sql`](docs/SUPABASE_SCHEMA.sql), then follow [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

Existing local snapshots/reports are never uploaded automatically:

```bash
node scripts/migrate-local-to-supabase.mjs
node scripts/migrate-local-to-supabase.mjs --apply
```

## Weekly reports

A Pro workspace can configure delivery email, weekday, local hour, IANA timezone, client/founder audience, 7/30/90-day evidence window, and English/Vietnamese output.

`.github/workflows/hosted-cron.yml` calls the secret-protected due-schedule runner hourly. Dev30 claims due work with a lease and derives stable idempotency keys so retries reuse prepared artifacts instead of creating duplicate reports/emails.

A temporary RevenueCat outage is treated as retryable for scheduled work; it does not grant Pro and should not silently skip a paid user to the following week.

## Production guardrails

With `NODE_ENV=production`, Dev30 fails startup when:

- `APP_BASE_URL` is missing;
- HTTPS is absent without the explicit pilot override;
- `DEV30_SESSION_SECRET` is missing;
- shared persistence is absent without the single-instance storage override;
- `GITHUB_TOKEN` is present without the explicit single-user PAT override.

GitHub App, cron, email, and RevenueCat can technically be absent while the process serves existing public artifacts, but they are required for the corresponding hosted SaaS features.

## Main API surfaces

### Fresh analysis

`POST /api/analyze`

```json
{
  "username": "hstptcn5",
  "locale": "vi",
  "days": 30,
  "includePrivate": false,
  "refresh": false
}
```

### Saved public report

`GET /api/public-report?username=hstptcn5&days=30&locale=vi`

### History

`GET /api/history?username=hstptcn5&days=30&locale=vi&includePrivate=false`

### Stakeholder report

`POST /api/client-report`

### Workspace / automation

- `GET /api/workspace`
- `GET /api/workspace-settings`
- `POST /api/schedule`
- `POST /api/schedule/disable`

### Billing

- `POST /api/billing/checkout`
- `POST /api/billing/portal`
- `POST /api/billing/webhook`

### Operations

- `GET /api/health`
- `GET /api/ready`
- `POST /api/internal/run-due`
- `GET /api/internal/saas-stats`

## Evidence and privacy rules

- GitHub evidence remains the source of truth; DeepSeek interprets it.
- Prompts prohibit talent scoring, hiring judgments, permanent personality/skill claims, unsupported impact claims, and invented future plans.
- Server normalization removes evidence IDs that were never collected.
- Private analysis requires explicit connected-account mode and matching GitHub identity.
- Private snapshots/reports remain workspace-scoped.
- GitHub credentials are encrypted before persistence; browser cookies contain opaque session IDs.
- Public stakeholder sharing is refused when source evidence is private.
- Supabase, GitHub, DeepSeek, Resend, and RevenueCat secrets remain server-side.

## Validation

```bash
npm test
npm run check
npm run smoke
docker build -t dev30:1.1.0 .
```

GitHub Actions runs the same gate for pull requests.

## Activation boundary

A green repository does not mean external SaaS services have already been provisioned. A live hosted pilot still requires:

- a real HTTPS deployment/domain;
- a Supabase project with schema applied;
- a production GitHub App;
- a RevenueCat project with Paddle Billing and real purchase links;
- a verified Resend sender if email delivery is enabled.

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for activation order and [`docs/MONETIZATION.md`](docs/MONETIZATION.md) for the product/economics contract.
