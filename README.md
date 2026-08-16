# Dev30

**Dev30 turns recent GitHub activity into evidence-backed work reports, comparable history, and stakeholder-ready development updates.**

It is not a contribution counter and it does not score developers. Dev30 collects GitHub evidence first, derives deterministic engineering signals, then asks DeepSeek to explain the work.

- **Explain simply** — plain-language project summaries for non-technical readers.
- **Technical view** — engineering work mix, repository activity, technologies, trajectory, timeline, and evidence.
- **Snapshot history** — persistent snapshots and deterministic comparisons over time.
- **Client / founder update** — concise progress reports generated from saved snapshots and evidence, with Markdown export.
- **GitHub workspace** — GitHub App OAuth for multi-user identity plus PAT fallback for local development.
- **SaaS persistence** — local JSON for development or shared Supabase persistence for hosted multi-user deployments.

Every material report claim is constrained to GitHub evidence IDs that Dev30 actually collected. Snapshot comparisons are computed deterministically before DeepSeek explains the delta.

## Product flow

```text
GitHub username + 7/30/90-day window
    ↓
GitHub REST collector
    ↓
Repositories + commits + PRs + sampled changed-file metadata
    ↓
Deterministic work units and engineering mix
    ↓
Evidence ledger
    ↓
DeepSeek report synthesis
    ↓
Persistent snapshot
    ↓
Deterministic snapshot delta → DeepSeek delta explanation
    ↓
Client/founder report writer
    ↓
Copyable Markdown + public share route when evidence is public-only
```

Connected-account flow:

```text
GitHub App / PAT fallback
    ↓
request-scoped credential
    ↓
workspace github:<user-id>
    ↓
private repo analysis
    ↓
workspace-scoped snapshots + reports
```

## Run locally

Requires Node.js 22+.

```bash
cp .env.example .env
# Fill DEEPSEEK_API_KEY and preferably GITHUB_TOKEN for local testing
npm start
```

Open `http://localhost:3000`.

The app has no npm runtime dependencies; it uses the Node.js standard library and native `fetch`.

Local development defaults to:

```env
NODE_ENV=development
DEV30_STORAGE_BACKEND=local
```

so existing `data/*.json` persistence continues to work without Supabase or a GitHub App.

## Product layer

- Public reports support **7 / 30 / 90 day** windows.
- Public analysis pages receive a shareable route such as `/u/hstptcn5?days=30&lang=vi`.
- Reports are cached in memory for `CACHE_TTL_MINUTES` to avoid unnecessary GitHub and DeepSeek calls.
- Fresh analyses are persisted as snapshots; identical structured analyses are deduplicated.
- Snapshot series are separated by username, window, language, public/private mode, and private workspace.
- When a previous snapshot exists, Dev30 computes new/absent repos, observed commit/PR count changes, work-mix shifts, focus changes, and newly observed work units.
- DeepSeek receives only that deterministic delta for **What changed since last report?**.
- Stakeholder reports are generated from a saved snapshot + deterministic delta, not from an unconstrained prompt.
- A report is shareable at `/r/<report-id>` only when the source snapshot is public and all selected evidence is public.
- `Refresh` bypasses the analysis cache and creates a new snapshot only when the structured analysis changed.
- GitHub App OAuth uses state + PKCE, encrypted server-side sessions, refresh-token rotation, and request-scoped GitHub credentials.
- PAT mode remains available as a development fallback and can analyze the authenticated account's private repositories.
- `/workspace` keeps private history and stakeholder reports scoped to the connected GitHub workspace.
- Private analysis and private stakeholder reports may send selected repository/work metadata to the configured DeepSeek API; they are never silently enabled for ordinary public lookups.

## Persistence modes

### Local JSON

Default development mode:

- sessions: `data/sessions.json`
- snapshots: `data/history.json`
- stakeholder reports: `data/client-reports.json`

`data/` is gitignored.

### Supabase

Hosted multi-user mode:

```env
DEV30_STORAGE_BACKEND=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
```

Apply [`docs/SUPABASE_SCHEMA.sql`](docs/SUPABASE_SCHEMA.sql) first. The secret key is server-only and never sent to the browser.

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the production runtime contract.

## Configuration

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DEEPSEEK_API_KEY` | For LLM mode | — | DeepSeek credential; server-side only |
| `DEEPSEEK_MODEL` | No | `deepseek-v4-flash` | Analysis, delta, and stakeholder-report model |
| `GITHUB_APP_CLIENT_ID` | Hosted OAuth | — | GitHub App user authorization |
| `GITHUB_APP_CLIENT_SECRET` | Hosted OAuth | — | Server-side GitHub App secret |
| `GITHUB_APP_SLUG` | Recommended | — | Builds the Choose repositories/install URL |
| `GITHUB_OAUTH_CALLBACK_URL` | No | derived | Explicit callback override |
| `GITHUB_TOKEN` | Local fallback | — | Development PAT and connected-account fallback |
| `DEV30_SESSION_SECRET` | Production | ephemeral locally | Encrypts GitHub session credentials and OAuth state |
| `APP_BASE_URL` | Production | — | Canonical HTTPS public origin |
| `TRUST_PROXY` | Behind proxy | `false` | Trust proxy HTTPS forwarding for secure cookies |
| `DEV30_STORAGE_BACKEND` | No | `local` | `local` or `supabase` |
| `SUPABASE_URL` | Supabase mode | — | Shared persistence project URL |
| `SUPABASE_SECRET_KEY` | Supabase mode | — | Current server-only Supabase secret key |
| `SUPABASE_SERVICE_ROLE_KEY` | Legacy only | — | Legacy server key compatibility |
| `CACHE_TTL_MINUTES` | No | `360` | In-memory analysis cache lifetime |
| `MAX_DISCOVERED_REPOS` | No | `15` | Maximum active repositories to scan |
| `MAX_DEEP_DIVE_REPOS` | No | `5` | Repositories selected for changed-file inspection |
| `MAX_COMMIT_PAGES` | No | `5` | Commit-list pagination budget per repo |
| `MAX_PR_PAGES` | No | `2` | Pull-request pagination budget per repo |
| `MAX_DETAIL_COMMITS_PER_REPO` | No | `3` | Commit-detail budget for deep-dive repos |
| `MAX_DETAIL_PRS_PER_REPO` | No | `6` | PR-file budget for deep-dive repos |
| `PORT` | No | `3000` | HTTP port |

Without `DEEPSEEK_API_KEY`, Dev30 returns deterministic analysis, delta, and stakeholder-report fallbacks. Without a GitHub credential, public lookup runs in a tighter **public-lite** collection mode.

## Production guardrails

With `NODE_ENV=production`, Dev30 refuses to start unless:

- `APP_BASE_URL` is configured;
- the public origin uses HTTPS;
- `DEV30_SESSION_SECRET` is persistent;
- remote persistence is configured.

Controlled pilot escape hatches exist for local persistence or HTTP, but they must be enabled explicitly and are not intended for normal public hosting.

## API

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

Supported windows are `7`, `30`, and `90`; unsupported values normalize to `30`.

`GET /api/history?username=hstptcn5&days=30&locale=vi&includePrivate=false` lists saved snapshots for one series. Private history requires the matching connected workspace.

`POST /api/client-report` creates a stakeholder update from a saved snapshot.

```json
{
  "snapshotId": "saved-snapshot-uuid",
  "audience": "client"
}
```

`GET /api/client-report/<report-id>` returns one generated report. Private reports require the matching connected workspace.

`GET /api/client-reports?username=hstptcn5&includePrivate=false` lists generated stakeholder reports.

`GET /api/auth/status` reports GitHub App/PAT connection state without exposing credentials.

`GET /api/workspace` returns the connected account workspace, private access diagnostics, snapshots, and reports.

`GET /api/health` is a process/liveness diagnostic and exposes only non-secret runtime metadata.

`GET /api/ready` is the deployment readiness probe. In Supabase mode it verifies that all persistence tables are reachable and returns HTTP 503 when the instance should not receive traffic.

## Evidence, reports, and privacy rules

- GitHub evidence remains the source of truth; DeepSeek interprets it.
- The prompts prohibit talent scores, hire/no-hire judgments, permanent skill/personality claims, unsupported impact claims, and invented future plans.
- Server-side normalization removes evidence IDs that were never collected.
- Snapshot comparison is deterministic; DeepSeek is not asked to compare two free-form reports.
- Client/founder reports are built from snapshot/delta/evidence payloads; DeepSeek is not allowed to invent blockers, deadlines, promises, or business impact.
- Public lookup never enumerates private repositories.
- Private analysis requires an explicit request and a GitHub credential whose authenticated login matches the requested username.
- Private snapshots/reports are workspace-scoped.
- GitHub App access/refresh tokens are encrypted before persistence; browser cookies contain only opaque session state.
- Public stakeholder sharing is refused if the source snapshot is private or selected evidence is private.

## Validation

```bash
npm test
npm run check
```

## Current limitations

- The analysis cache remains process-local; a restart can cause a fresh GitHub/DeepSeek analysis, but durable snapshots and reports survive when Supabase storage is enabled.
- Switching from local JSON to Supabase intentionally does not auto-upload existing private local history.
- GitHub public events do not provide a complete 90-day history; 90-day reports rely primarily on repository, commit, and PR queries for the older part of the window.
- Collection remains intentionally bounded and is not an audit/billing ledger.
- Changed-file metadata is sampled under a configurable request budget.
- Hosted billing, quotas, scheduled weekly runs, email delivery, and organization/team workspaces are not implemented yet.
