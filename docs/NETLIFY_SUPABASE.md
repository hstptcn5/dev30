# Dev30 on Netlify + Supabase

This is the first hosted deployment target for Dev30 1.1.

## Architecture

```text
Netlify CDN
  ├─ /, CSS, JS, images -> public/
  ├─ /u/*, /r/*, /workspace -> public/index.html
  └─ /api/*, /auth/* -> Netlify Function -> existing Dev30 Node request listener
                                      ↓
                                  Supabase
```

The Netlify adapter does not fork Dev30 business logic. Local `npm start`, Docker, and Netlify all use the request listener already defined in `server.mjs`.

## 1. Supabase

Create a dedicated `dev30` project in `ap-southeast-1` (Singapore), then apply:

```text
docs/SUPABASE_SCHEMA.sql
```

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

The function handles only:

```text
/api/*
/auth/*
```

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

For the first deployment, keep these unset unless already being activated deliberately:

```text
GITHUB_APP_CLIENT_ID
GITHUB_APP_CLIENT_SECRET
REVENUECAT_API_KEY
REVENUECAT_PURCHASE_LINK_URL
RESEND_API_KEY
```

The first goal is a healthy public runtime and shared persistence, not billing or email.

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

## 5. Function region

Supabase is placed in Singapore. Netlify's default Functions region may be elsewhere depending on plan/project settings. If the Netlify plan supports configurable Functions regions, select Singapore (`sin`) after the baseline deploy and compare latency before/after.

Do not make a paid Netlify plan a prerequisite for the first pilot merely to change Functions region.

## 6. Deployment previews

Do not expose production secrets to untrusted deploy previews. Prefer production-scoped environment variables for Supabase secret keys and other server credentials.

## 7. Next activation order

Only after Netlify + Supabase are healthy:

1. configure the production GitHub App callback using the real Netlify/domain origin;
2. activate RevenueCat + Paddle;
3. activate cron / weekly reports;
4. activate Resend email;
5. add a custom domain when desired.
