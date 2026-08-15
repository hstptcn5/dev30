# Dev30

**Dev30 turns recent GitHub activity into an evidence-backed work report.**

It is not a contribution counter and it does not score developers. Dev30 collects GitHub evidence first, derives deterministic engineering signals, then asks DeepSeek to explain the work in two views:

- **Explain simply** — plain-language project summaries for non-technical readers.
- **Technical view** — engineering work mix, repository activity, technologies, development trajectory, timeline, and evidence.

Every material LLM claim is constrained to GitHub evidence IDs that Dev30 actually collected.

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
DeepSeek JSON synthesis
    ↓
Shareable public report / private opt-in account report
```

## Run locally

Requires Node.js 22+.

```bash
cp .env.example .env
# Fill DEEPSEEK_API_KEY and preferably GITHUB_TOKEN
npm start
```

Open `http://localhost:3000`.

The app has no npm runtime dependencies; it uses the Node.js standard library and native `fetch`.

## Product layer

- Public reports support **7 / 30 / 90 day** windows.
- Public reports receive a shareable route such as `/u/hstptcn5?days=30&lang=vi`.
- Reports are cached in memory for `CACHE_TTL_MINUTES` (default 360) to avoid unnecessary GitHub and DeepSeek calls. Cache is process-local and disappears after restart.
- `Refresh` bypasses the cache and rebuilds a report.
- If `GITHUB_TOKEN` is configured, `/api/me` exposes the connected account identity and the UI offers **Analyze my account**.
- Private repository analysis is explicit opt-in, only works for the account represented by `GITHUB_TOKEN`, and is not assigned a public share URL.
- Private analysis may send repository names, commit/PR titles, and selected changed filenames to the configured DeepSeek API. It does not silently enable for ordinary public lookups.

## Configuration

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DEEPSEEK_API_KEY` | For LLM mode | — | DeepSeek credential; server-side only |
| `DEEPSEEK_MODEL` | No | `deepseek-v4-flash` | Report synthesis model |
| `DEEPSEEK_THINKING` | No | `disabled` | Set `enabled` for reasoning mode |
| `GITHUB_TOKEN` | Recommended | — | Higher API budget; also enables explicit connected-account mode |
| `CACHE_TTL_MINUTES` | No | `360` | In-memory report cache lifetime |
| `MAX_DISCOVERED_REPOS` | No | `15` | Maximum active repositories to scan |
| `MAX_DEEP_DIVE_REPOS` | No | `5` | Repositories selected for changed-file inspection |
| `MAX_COMMIT_PAGES` | No | `5` | Commit-list pagination budget per repo |
| `MAX_PR_PAGES` | No | `2` | Pull-request pagination budget per repo |
| `MAX_DETAIL_COMMITS_PER_REPO` | No | `3` | Commit-detail budget for deep-dive repos |
| `MAX_DETAIL_PRS_PER_REPO` | No | `6` | PR-file budget for deep-dive repos |
| `PORT` | No | `3000` | HTTP port |

Without `DEEPSEEK_API_KEY`, Dev30 returns a clearly labelled deterministic fallback. Without `GITHUB_TOKEN`, public lookup runs in a tighter **public-lite** collection mode.

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

`GET /api/health` reports product/analyzer version, DeepSeek/GitHub configuration, and cache stats without exposing secrets.

`GET /api/me` returns the GitHub identity represented by the configured server-side token, or `connected: false` when no token is configured.

## Evidence and privacy rules

- GitHub evidence remains the source of truth; DeepSeek interprets it.
- The prompt prohibits talent scores, hire/no-hire judgments, permanent skill/personality claims, and unsupported impact claims.
- Server-side normalization removes evidence IDs that were never collected.
- Public lookup never enumerates private repositories.
- Private analysis requires an explicit request and a token whose authenticated login matches the requested username.

## Validation

```bash
npm test
npm run check
```

## Current limitations

- Cache is in-memory only; a production deployment should use a shared persistent cache/database.
- The current connected-account mode uses one server-side token. SaaS multi-user private analysis still requires GitHub OAuth or a GitHub App.
- GitHub public events do not provide a complete 90-day history; 90-day reports rely primarily on repository, commit, and PR queries for the older part of the window.
- Collection remains intentionally bounded and is not an audit/billing ledger.
- Changed-file metadata is sampled under a configurable request budget.
