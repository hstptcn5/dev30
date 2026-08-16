# Dev30 on Netlify + Supabase

This is the first hosted deployment target for Dev30 1.1.

## Architecture

```text
Netlify CDN
  ├─ /, CSS, JS, images -> public/
  ├─ /u/*, /r/*, /workspace -> public/index.html
  ├─ /api/*, /auth/* -> synchronous Netlify Function -> existing Dev30 Node request listener
  └─ fresh Analyze -> Netlify Background Function -> GitHub + DeepSeek
                                            ↓
                                  Supabase job + report persistence
```

The main Netlify adapter does not fork Dev30 business logic. Local `npm start`, Docker, the synchronous function and the background Analyze worker all reuse the request listener already defined in `server.mjs`.

Fresh Analyze is deliberately asynchronous in hosted production. Netlify synchronous Functions have a fixed execution limit, while GitHub collection plus AI synthesis can legitimately take longer on larger accounts. The browser starts a background job and polls a workspace-bound status endpoint until the report is persisted and ready.

## 1. Supabase

Create a dedicated `dev30` project in `ap-southeast-1` (Singapore), then apply:

```text
docs/SUPABASE_SCHEMA.sql
```

Existing hosted projects must also apply:

```text
docs/SUPABASE_ANALYSIS_JOBS.sql
```

The analysis-job table is server-only and is used to persist background job state/results across function invocations. It has RLS enabled and grants no browser `anon` or `authenticated` access.

After applying the schema, run Supabase security and performance advisors and resolve blocking security findings before production traffic.

Required server environment values:

```env
DEV30_STORAGE_BACKEND=supabase
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
```

The secret key is server-only. Do not add a publishable/anon key to Dev30 unless a future browser-side Supabase feature actually requires one.

## 2. Netlify project

Import the GitHub repository `hstptcn5/dev30` into Netlify.

Repository configuration is already declared in `netlify.toml`:

```text
Build command: npm run check
Publish directory: public
Functions directory: netlify/functions
Node: 22
```

No framework preset is required.

Routing is split by responsibility:

```text
/api/* and /auth/*       synchronous Dev30 request listener
/api/analyze-background  background Analyze worker
/api/analysis-job/:id    authenticated job polling
```

The wildcard synchronous function explicitly excludes the two background-analysis paths so Netlify routing cannot accidentally send them through the 60-second request path.

Static assets stay on Netlify CDN. Reader/workspace routes are rewritten to `public/index.html`.

## 3. Production environment

Set these in Netlify for the production deploy context:

```env
NODE_ENV=production
APP_BASE_URL=https://<your-netlify-site>.netlify.app
DEV30_STORAGE_BACKEND=supabase
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
DEV30_SESSION_SECRET=<long-random-secret>
TRUST_PROXY=true
COOKIE_SECURE=true
```

GitHub App and DeepSeek values are required before fresh hosted Analyze can complete. RevenueCat, cron and email can be activated separately.

## 4. First deploy checks

Verify:

```text
GET /api/health       -> 200
GET /api/ready        -> 200
GET /                 -> Dev30 UI
GET /workspace        -> Dev30 app shell
GET /u/hstptcn5       -> app shell / saved-report flow
```

`/api/ready` must report Supabase as ready before the deployment is treated as healthy.

After GitHub App auth is active, run one fresh Analyze from the UI and confirm that it remains in a loading state while the background job executes, then renders the completed report without an HTML/function-timeout error.

## 5. Function region

Supabase is placed in Singapore. Netlify's default Functions region may be elsewhere depending on plan/project settings. If the Netlify plan supports configurable Functions regions, select Singapore (`sin`) after the baseline deploy and compare latency before/after.

Do not make a paid Netlify plan a prerequisite for the first pilot merely to change Functions region.

## 6. Deployment previews

Do not expose production secrets to untrusted deploy previews. Prefer production-scoped environment variables for Supabase secret keys and other server credentials.

## 7. Next activation order

Only after Netlify + Supabase + GitHub identity + fresh Analyze are healthy:

1. activate RevenueCat + Paddle;
2. activate cron / weekly reports;
3. activate Resend email;
4. add a custom domain when desired.
