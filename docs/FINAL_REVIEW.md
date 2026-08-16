# Dev30 1.0 final review

Date: 2026-08-16

Scope: repository review from the merged 0.8 SaaS foundation through the 1.0 roadmap-completion branch.

This review distinguishes **repository readiness** from **live production activation**. The codebase can be pilot-ready while external services remain intentionally unprovisioned because their credentials and domains must not be committed to Git.

## Review result

**Recommendation: pilot-ready after merge.**

No unresolved critical/high-severity repository blocker was found in the final pass. The remaining items are external activation checks or deliberate pilot boundaries documented below.

## Validation gate

The final code head before this review document was added was:

```text
b22fe01ffbfaf942743fe24caaf9d0230f2a4d6b
```

GitHub Actions run `31922142548` completed successfully with:

- Node.js 22 setup;
- `npm test`;
- `npm run check`;
- `npm run smoke`;
- `docker build -t dev30-ci .`.

The PR must still receive a fresh exact-head green run after any final documentation/metadata commit before merge.

## Security and privacy review

### GitHub identity and workspace isolation

Checked:

- public analysis never opts into private repository enumeration;
- private analysis requires the connected GitHub login to match the requested username;
- hosted private history/report keys include the stable `github:<user-id>` workspace ID;
- GitHub credentials are request-scoped instead of stored in a mutable process-global token;
- GitHub App access/refresh credentials are AES-256-GCM encrypted before persistence;
- production rejects a shared `GITHUB_TOKEN` PAT by default;
- the PAT escape hatch is explicit and documented as single-user pilot-only.

Review fix:

- **Disconnect semantics were hardened.** Disconnect now disables the workspace schedule and deletes the durable background GitHub credential before deleting the browser session. If durable cleanup fails, the disconnect fails closed instead of pretending background access has stopped.

### Session and cookie boundary

Checked:

- browser cookies contain opaque session IDs rather than GitHub credentials;
- cookies are `HttpOnly` and `SameSite=Lax`;
- production HTTPS/base URL is required unless an explicit insecure-pilot escape hatch is set;
- secure-cookie behavior follows the configured HTTPS origin / trusted proxy boundary;
- a stable `DEV30_SESSION_SECRET` is required in production and before scheduled background work is enabled.

### Persistence

Checked:

- local data files live under gitignored `data/`;
- local secret-bearing stores are written with restrictive file mode where applicable;
- Supabase secret keys stay server-side;
- current `sb_secret_*` keys are sent as `apikey`, not incorrectly treated as bearer JWTs;
- legacy service-role JWT compatibility remains explicit;
- RLS is enabled on hosted tables and anon/authenticated database roles are revoked;
- service-role access is limited to the server persistence surface;
- `/api/ready` probes the complete hosted table contract;
- local → Supabase migration is dry-run by default and never deletes source files.

### Scheduled work

Checked:

- weekly scheduling resolves the configured IANA timezone instead of hard-coding UTC;
- each workspace currently has at most one weekly schedule;
- due schedules are leased before work begins;
- the Supabase claim RPC uses `FOR UPDATE SKIP LOCKED` so multiple runners do not claim the same schedule concurrently;
- prepared report artifacts are reused after retry rather than regenerated blindly;
- delivery keys include schedule ID + scheduled timestamp;
- scheduled report language is persisted consistently in local and hosted storage.

Review fix:

- **Quota exhaustion is now non-transient for the scheduler.** A monthly plan cap advances the weekly schedule instead of retrying every hour until the month changes. Real provider/GitHub 429 responses remain retryable.

### Usage and plan enforcement

Checked:

- public username analysis remains outside the private workspace billing ledger;
- private cache hits do not consume a fresh-analysis unit;
- local quota writes are serialized;
- hosted quota consumption is atomic through `dev30_consume_usage`;
- Pro entitlement is granted only for `active` / `trialing` subscription state;
- `DEV30_FORCE_PLAN` is documented as development/pilot-only.

Pilot semantics:

- metering represents product operations/attempts, not engineering effort;
- a provider failure after an operation has begun may still consume the corresponding product quota. This is intentional for the pilot and can be refined with reservation/refund accounting if billing sophistication later requires it.

### Email delivery

Checked:

- Resend API keys remain server-side;
- report content is HTML-escaped before email rendering;
- a stable provider idempotency key is supplied;
- Dev30 also stores a local/hosted delivery receipt;
- if email is not configured, Dev30 records `report_ready_email_not_configured` instead of claiming successful delivery;
- delivery is optional and does not block the public analyzer.

Pilot boundary:

- recipient verification / organization-wide email policy is not implemented in 1.0. Hosted 1.0 should begin as an invite-only pilot with low quotas and a controlled sender. Broader public email delivery should add recipient-verification/abuse controls before open signup.

### Stripe billing boundary

Checked:

- checkout is hidden/blocked unless secret key, webhook secret, Pro price, and public base URL are all configured;
- webhook signatures are verified against the raw request body with timestamp tolerance and constant-time comparison;
- processed Stripe event IDs are persisted for idempotency;
- checkout completion alone does not grant Pro;
- subscription create/update/delete events drive entitlement state;
- only the configured Pro price in `active` / `trialing` state grants Pro;
- customer portal access is workspace-authenticated.

### Internal operational endpoints

Checked:

- the due-schedule runner and SaaS stats endpoint require `DEV30_CRON_SECRET`;
- GitHub Actions hosted cron reads the hosted URL/cron credential from Actions secrets;
- production runtime fails fast for missing HTTPS origin, persistent session secret, or shared persistence;
- missing optional GitHub App / cron / email / billing features are surfaced as warnings/unavailable states rather than silently simulated.

## Reliability review

Validated by tests/smoke:

- concurrent request-scoped GitHub credentials do not cross-contaminate;
- private history series are separated by workspace;
- snapshot/report persistence remains compatible with local mode;
- local quota concurrency cannot exceed the configured cap;
- a leased schedule cannot be claimed twice simultaneously;
- delivery receipts are idempotent by delivery key;
- Stripe signature freshness/tamper checks work;
- billing events deduplicate;
- hosted schedule locale survives the Supabase mapping;
- app process starts in local development, `/api/health` and `/api/ready` respond, and the homepage renders;
- the production container builds in CI.

## Findings fixed during the final pass

1. **High privacy impact — fixed:** Disconnect originally removed only the browser session while a durable credential/schedule could remain for background jobs.
2. **Medium operations impact — fixed:** quota exhaustion used HTTP 429 internally and could be mistaken for a transient provider rate limit, causing hourly retry churn.
3. **Medium multi-user risk — fixed earlier in the roadmap pass:** production could otherwise inherit the development PAT fallback; production now rejects a shared PAT unless explicitly allowed for a controlled pilot.
4. **Medium billing safety — fixed earlier in the roadmap pass:** Stripe checkout is not exposed until webhook processing is configured too.
5. **Medium hosted consistency — fixed:** scheduled report locale is persisted in both local and Supabase schedule models.
6. **Test contract drift — fixed:** hosted readiness tests now validate the complete persistence table contract instead of the original three-table 0.8 shape.

## Remaining non-blocking pilot boundaries

These are intentionally **not** represented as already completed by repository CI:

1. **Real Supabase execution:** CI mocks the REST contract and builds the SQL artifact; the SQL still needs to be applied to a real Supabase project and `/api/ready` verified there.
2. **Production GitHub App:** OAuth and token flows are unit/contract tested, but a real production GitHub App/domain installation must be exercised end-to-end.
3. **Email sender:** Resend API behavior is contract-tested with mocked HTTP; a real sender/domain and real receipt should be validated before inviting users.
4. **Stripe:** webhook/Checkout boundaries are tested locally, but Stripe test mode should be completed end-to-end before enabling the upgrade button for users.
5. **Public abuse control:** the public analyzer remains intentionally open. A general-public launch should add platform/edge rate limits and cost-abuse monitoring; the current app-level workspace quotas primarily protect authenticated private/SaaS work.
6. **Backups/retention:** define Supabase backup, retention, account deletion, and incident-response policies before broad public launch.
7. **Email abuse/compliance:** recipient verification and a broader opt-out/compliance policy are still needed before open public email sending.
8. **Product boundary:** one GitHub identity and one weekly schedule per workspace; organization/team administration is outside 1.0.
9. **Cache:** analysis cache remains process-local; durable snapshots/reports live in shared storage, but cache sharing is not part of the pilot.

None of these items blocks the existing personal/local workflow or an invite-only hosted pilot when the runbook constraints are followed.

## Activation order after merge

1. Pull `main` and confirm local PAT/private workspace behavior is unchanged.
2. Provision a Supabase project and apply `docs/SUPABASE_SCHEMA.sql`.
3. Run the migration dry-run; optionally migrate existing local snapshots/reports.
4. Deploy the Docker image behind HTTPS and verify `/api/ready`.
5. Configure and test the production GitHub App.
6. Enable the hourly cron caller and create one test weekly schedule.
7. Optionally configure/verify Resend and perform a single pilot delivery.
8. Only then configure Stripe test mode, webhook, Pro price, Checkout, and customer portal.
9. Invite a small pilot cohort and monitor API/LLM/email cost and errors before broader signup.

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for the detailed commands and environment contract.
