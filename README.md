# Dev30

**Dev30 turns recent GitHub activity into evidence-backed work reports, comparable history, and stakeholder-ready development updates.**

Dev30 is not a contribution counter and does not score developers. It collects GitHub evidence first, reconstructs meaningful work units, derives deterministic engineering signals, then asks DeepSeek to explain what was observed.

## What Dev30 1.0 includes

- **Explain simply** — plain-language project summaries for non-technical readers.
- **Technical view** — engineering work mix, repository activity, technology signals, timeline, and evidence.
- **7 / 30 / 90 day windows** — public or connected-account analysis.
- **Evidence ledger** — material claims link back to collected PRs and commits.
- **Snapshot history** — persistent snapshots and deterministic comparisons over time.
- **Client / founder updates** — concise stakeholder reports generated from saved evidence, with Markdown export.
- **GitHub workspace** — GitHub App OAuth for hosted multi-user identity, plus PAT fallback for local development.
- **Private repositories** — explicit connected-account mode, scoped to the authenticated workspace.
- **Weekly reports** — timezone-aware schedules, durable GitHub connections, leased job execution, and retry-safe report artifacts.
- **Email delivery boundary** — optional Resend delivery with Dev30 receipts and provider idempotency keys.
- **Usage & plans** — monthly workspace usage ledger with Free / Pro entitlements.
- **Billing-ready boundary** — optional Stripe Checkout, customer portal, signed webhook processing, and event deduplication.
- **Hosted persistence** — local JSON for development or shared Supabase persistence for a multi-user pilot.
- **Deployment guardrails** — production fail-fast checks, readiness probe, Docker image, hosted cron workflow, and explicit local→remote migration.

Every material report claim is constrained to GitHub evidence IDs that Dev30 actually collected. Snapshot comparisons are computed deterministically before DeepSeek explains the delta.

## Product flow

```text
GitHub username / connected account
    ↓
7 / 30 / 90 day GitHub evidence collection
    ↓
Repositories + commits + PRs + sampled changed-file metadata
    ↓
Deterministic work units + engineering mix
    ↓
Evidence ledger
    ↓
DeepSeek explanation
    ↓
Persistent snapshot
    ↓
Deterministic snapshot delta
    ↓
Client / founder report
    ↓
Optional weekly schedule + email delivery
```

Hosted connected-account flow:

```text
GitHub App OAuth
    ↓
request-scoped credential
    ↓
workspace github:<user-id>
    ↓
encrypted durable GitHub connection
    ↓
private analysis + history + reports
    ↓
weekly scheduler
    ↓
usage / entitlement check
    ↓
optional email delivery
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

The current personal-development workflow remains intentionally simple:

```env
NODE_ENV=development
DEV30_STORAGE_BACKEND=local
GITHUB_TOKEN=github_pat_...
```

Your existing PAT can continue powering `/workspace` and private analysis locally. GitHub App setup is only required when testing or operating the hosted multi-user identity flow.

## Local persistence

With `DEV30_STORAGE_BACKEND=local`, gitignored files under `data/` hold:

- `sessions.json` — browser GitHub App sessions when used locally;
- `history.json` — evidence snapshots;
- `client-reports.json` — stakeholder report artifacts;
- `saas.json` — durable schedule, usage, billing test state, and delivery receipts.

A stable `DEV30_SESSION_SECRET` is required before enabling weekly schedules because the durable GitHub credential must remain decryptable after a restart.

## Hosted persistence

For a multi-user hosted pilot:

```env
NODE_ENV=production
APP_BASE_URL=https://your-dev30-domain.example
DEV30_STORAGE_BACKEND=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
DEV30_SESSION_SECRET=<long-random-secret>
```

Apply [`docs/SUPABASE_SCHEMA.sql`](docs/SUPABASE_SCHEMA.sql), then follow [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

The hosted schema stores browser sessions, durable encrypted GitHub connections, evidence snapshots, reports, weekly schedules, quota counters, billing state, processed billing events, and delivery receipts.

Existing local snapshot/report history is never uploaded automatically. Use the explicit dry-run/apply migration tool:

```bash
node scripts/migrate-local-to-supabase.mjs
node scripts/migrate-local-to-supabase.mjs --apply
```

## Weekly reports

A connected workspace can configure:

- delivery email;
- Sunday–Saturday;
- local delivery hour;
- IANA timezone;
- client/founder audience;
- 7/30/90 day evidence window;
- English or Vietnamese output.

The repository includes an hourly `.github/workflows/hosted-cron.yml` caller. The application decides which schedules are due and claims them with a lease, so multiple job runners cannot normally execute the same schedule simultaneously.

A stable delivery idempotency key is derived from the schedule and scheduled timestamp. A retry reuses an already prepared report rather than creating a second weekly artifact.

If Resend is not configured, Dev30 records that the report was prepared but does not claim the email was delivered.

## Plans and usage

Workspace metering currently covers private/SaaS work only; public username analysis remains outside this ledger.

Default monthly limits:

| Metric | Free | Pro |
| --- | ---: | ---: |
| Private fresh analyses | 60 | 1500 |
| Stakeholder reports | 12 | 200 |
| Scheduled runs | 4 | 100 |
| Email deliveries | 4 | 100 |

Analysis cache hits do not consume a fresh-analysis unit.

These are product defaults in `src/entitlements.mjs`, not externally guaranteed pricing terms.

## Billing boundary

Stripe is optional. The public analyzer and local product do not require billing.

The workspace exposes an upgrade action only when all required billing pieces are present:

```env
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
STRIPE_PRO_PRICE_ID=...
APP_BASE_URL=https://your-dev30-domain.example
```

Checkout completion alone does not grant Pro. Dev30 waits for a signed subscription lifecycle event and grants Pro only when the configured price is active or trialing.

Processed Stripe event IDs are stored so webhook retries are idempotent.

## Production guardrails

With `NODE_ENV=production`, Dev30 fails startup when:

- `APP_BASE_URL` is missing;
- the public origin is not HTTPS unless the explicit pilot override is enabled;
- `DEV30_SESSION_SECRET` is missing;
- remote persistence is absent unless the explicit single-instance pilot override is enabled;
- `GITHUB_TOKEN` is present without the explicit single-user PAT pilot override.

The PAT rule is intentional: a single server PAT must not silently become the GitHub identity for every hosted visitor.

GitHub App, cron, email, and Stripe can remain disabled; Dev30 reports those features as unavailable rather than pretending they are live.

## Main API surfaces

### Analysis

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

### History

`GET /api/history?username=hstptcn5&days=30&locale=vi&includePrivate=false`

### Stakeholder report

`POST /api/client-report`

```json
{
  "snapshotId": "saved-snapshot-uuid",
  "audience": "client"
}
```

### Workspace

- `GET /api/workspace`
- `GET /api/workspace-settings`
- `POST /api/schedule`
- `POST /api/schedule/disable`

### Billing

- `POST /api/billing/checkout`
- `POST /api/billing/portal`
- `POST /api/billing/webhook`

### Operations

- `GET /api/health` — process/runtime diagnostics;
- `GET /api/ready` — strict runtime + persistence readiness;
- `POST /api/internal/run-due` — secret-protected due-schedule runner;
- `GET /api/internal/saas-stats` — secret-protected operational counts.

## Evidence and privacy rules

- GitHub evidence remains the source of truth; DeepSeek interprets it.
- Prompts prohibit talent scores, hire/no-hire judgments, permanent personality/skill claims, unsupported impact claims, and invented future plans.
- Server normalization removes evidence IDs that were never collected.
- Snapshot comparison is deterministic; DeepSeek is not asked to compare two free-form reports.
- Client/founder updates are built from snapshot + delta + evidence payloads; the LLM is not allowed to invent blockers, deadlines, promises, or business impact.
- Public lookup never enumerates private repositories.
- Private analysis requires explicit connected-account mode and a matching GitHub identity.
- Private snapshots/reports are workspace-scoped.
- GitHub App tokens are encrypted before persistence; browser cookies contain an opaque session identifier, not the token.
- Scheduled GitHub credentials are stored separately from browser sessions so weekly work can continue after browser logout, but they use the same server-side encryption secret.
- Public stakeholder sharing is refused when the source snapshot/evidence is private.
- Supabase, GitHub, DeepSeek, Resend, and Stripe secrets stay server-side.

## Validation

```bash
npm test
npm run check
docker build -t dev30:1.0.0 .
```

GitHub Actions runs the same test/check/container gate for pull requests.

## What “1.0” means here

The repository contains the complete pilot-ready product boundary, but a repository merge is **not** a claim that external production services have already been provisioned.

A live hosted pilot still requires resources that must not be committed to source control:

- a real HTTPS domain/deployment;
- a Supabase project with the schema applied;
- a production GitHub App installation for multi-user private workspaces;
- a verified email sender if weekly email is enabled;
- Stripe test/live resources if billing is enabled.

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the exact activation order.

## Known design boundaries

- The analysis cache is process-local. A restart can cause a fresh GitHub/DeepSeek analysis; durable history/reports survive with Supabase.
- Public GitHub event history is incomplete for long windows; older portions of 90-day reports rely primarily on repository commit/PR queries.
- Collection is intentionally bounded and is not an audit, payroll, or billing ledger of engineering effort.
- Changed-file metadata is sampled under a configurable request budget.
- The 1.0 workspace model is one GitHub identity per workspace; organization/team administration is a later product surface rather than part of this pilot boundary.
