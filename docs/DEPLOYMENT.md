# Dev30 deployment foundation

Checkpoint 0.8 keeps local development unchanged while making the same Node process deployable as a multi-user service.

## Storage modes

### Local development

The default remains:

```env
DEV30_STORAGE_BACKEND=local
NODE_ENV=development
```

Sessions, snapshot history and stakeholder reports stay under `data/` and are gitignored. This is appropriate for one developer running one Dev30 instance.

### Shared SaaS persistence

For a hosted multi-user instance:

```env
NODE_ENV=production
APP_BASE_URL=https://your-dev30-domain.example
DEV30_STORAGE_BACKEND=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
DEV30_SESSION_SECRET=<long-random-secret>
TRUST_PROXY=true
```

Apply [`SUPABASE_SCHEMA.sql`](./SUPABASE_SCHEMA.sql) to the Supabase project before starting Dev30.

`SUPABASE_SECRET_KEY` is server-only. Never expose it in the browser, commit it, or put it in a public build argument. `SUPABASE_SERVICE_ROLE_KEY` remains accepted only for legacy projects.

## Production requirements

At startup Dev30 rejects unsafe production configuration unless all of these are true:

- `APP_BASE_URL` is set and uses HTTPS;
- `DEV30_SESSION_SECRET` is persistent;
- a shared storage backend is configured;
- Supabase URL and server secret are present when `DEV30_STORAGE_BACKEND=supabase`.

Two explicit pilot escape hatches exist:

```env
ALLOW_LOCAL_STORAGE_IN_PRODUCTION=true
ALLOW_INSECURE_HTTP=true
```

Do not use them for a normal public deployment. They exist for controlled single-instance pilots only.

## GitHub App

For a real hosted deployment, configure the GitHub App callback to:

```text
https://your-dev30-domain.example/auth/github/callback
```

With `APP_BASE_URL` set, Dev30 derives that callback automatically unless `GITHUB_OAUTH_CALLBACK_URL` explicitly overrides it.

PAT fallback (`GITHUB_TOKEN`) remains supported for development but should not be the production identity model.

## Container

Build:

```bash
docker build -t dev30:0.8.0 .
```

Run with environment supplied by your platform or secret manager. Do not bake `.env` into the image.

The image exposes port `3000` and uses:

```text
GET /api/ready
```

as its container health check.

## Health versus readiness

`GET /api/health` answers whether the Node process is alive and exposes non-secret runtime diagnostics.

`GET /api/ready` is stricter. It returns HTTP 503 when runtime configuration is invalid or the configured remote persistence tables cannot be reached.

A deployment platform should use `/api/ready` for readiness/health routing.

## Persistence boundary

When remote storage is enabled, Dev30 stores:

- encrypted GitHub App session credentials;
- evidence-backed snapshots;
- stakeholder/client report artifacts.

GitHub tokens remain encrypted with AES-256-GCM before being written to the database. The database secret and `DEV30_SESSION_SECRET` are still high-value server secrets and must be stored in the deployment platform's secret manager.

The in-memory analysis cache is intentionally process-local. Losing it during a restart only causes a fresh GitHub/DeepSeek analysis; durable history and report artifacts remain in shared storage.

## Local-to-hosted migration

Checkpoint 0.8 does not silently upload an existing developer's `data/*.json` files when remote storage is enabled. This avoids accidentally moving private local evidence to a cloud database. Start hosted storage empty, or perform an explicit migration in a later controlled step.
