# Dev30

**Dev30 turns recent GitHub activity into an evidence-backed work report and a comparable history of how that work changes over time.**

It is not a contribution counter and it does not score developers. Dev30 collects GitHub evidence first, derives deterministic engineering signals, then asks DeepSeek to explain the work in two views:

- **Explain simply** — plain-language project summaries for non-technical readers.
- **Technical view** — engineering work mix, repository activity, technologies, development trajectory, timeline, and evidence.

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
Persistent local snapshot
    ↓
Deterministic snapshot delta → DeepSeek delta explanation
    ↓
Shareable public report / private opt-in account report + history
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
- Fresh analyses are persisted as snapshots in `data/history.json`; identical analyses are deduplicated.
- Snapshot series are separated by username, window, language, and public/private mode.
- When a previous snapshot exists, Dev30 computes new/absent repos, observed commit/PR count changes, work-mix shifts, focus changes, and newly observed work units.
- DeepSeek receives only that deterministic delta for the **What changed since last report?** explanation.
- `Refresh` bypasses the report cache and rebuilds a report; it creates a new snapshot only when the structured analysis changed.
- If `GITHUB_TOKEN` is configured, `/api/me` exposes the connected account identity and the UI offers **Analyze my account**.
- Private repository analysis is explicit opt-in, only works for the account represented by `GITHUB_TOKEN`, and is not assigned a public share URL.
- Private snapshot history stays on the local Dev30 instance and can contain private repository names and work metadata. `data/` is gitignored.
- Private analysis may send repository names, commit/PR titles, and selected changed filenames to the configured DeepSeek API. It does not silently enable for ordinary public lookups.

## Configuration

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DEEPSEEK_API_KEY` | For LLM mode | — | DeepSeek credential; server-side only |
| `DEEPSEEK_MODEL` | No | `deepseek-v4-flash` | Report and delta synthesis model |
| `DEEPSEEK_THINKING` | No | `disabled` | Set `enabled` for report reasoning mode |
| `GITHUB_TOKEN` | Recommended | — | Higher API budget; also enables explicit connected-account mode |
| `CACHE_TTL_MINUTES` | No | `360` | In-memory report cache lifetime |
| `DEV30_HISTORY_FILE` | No | `data/history.json` | Persistent local snapshot store |
| `HISTORY_MAX_PER_SERIES` | No | `24` | Maximum snapshots retained per username/window/mode/language series |
| `HISTORY_MAX_TOTAL` | No | `500` | Maximum snapshots retained across the local store |
| `MAX_DISCOVERED_REPOS` | No | `15` | Maximum active repositories to scan |
| `MAX_DEEP_DIVE_REPOS` | No | `5` | Repositories selected for changed-file inspection |
| `MAX_COMMIT_PAGES` | No | `5` | Commit-list pagination budget per repo |
| `MAX_PR_PAGES` | No | `2` | Pull-request pagination budget per repo |
| `MAX_DETAIL_COMMITS_PER_REPO` | No | `3` | Commit-detail budget for deep-dive repos |
| `MAX_DETAIL_PRS_PER_REPO` | No | `6` | PR-file budget for deep-dive repos |
| `PORT` | No | `3000` | HTTP port |

Without `DEEPSEEK_API_KEY`, Dev30 returns deterministic report and delta fallbacks. Without `GITHUB_TOKEN`, public lookup runs in a tighter **public-lite** collection mode.

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

Supported windows are `7`, `30`, and `90`; unsupported values normalize to `30`. Fresh responses include a `history` object with the current snapshot, previous snapshot, deterministic delta, delta narrative, and recent snapshot summaries.

`GET /api/history?username=hstptcn5&days=30&locale=vi&includePrivate=false` lists saved snapshots for one series. Private history is only returned for the connected GitHub account.

`GET /api/health` reports product/analyzer version, DeepSeek/GitHub configuration, cache stats, and local history counts without exposing secrets.

`GET /api/me` returns the GitHub identity represented by the configured server-side token and private-access diagnostics.

## Evidence, history, and privacy rules

- GitHub evidence remains the source of truth; DeepSeek interprets it.
- The report prompt prohibits talent scores, hire/no-hire judgments, permanent skill/personality claims, and unsupported impact claims.
- Server-side normalization removes evidence IDs that were never collected.
- Snapshot comparison is deterministic; DeepSeek is not asked to compare two free-form reports.
- Public lookup never enumerates private repositories.
- Private analysis requires an explicit request and a token whose authenticated login matches the requested username.
- Private snapshots are stored locally and are intentionally excluded from git by `.gitignore`.

## Validation

```bash
npm test
npm run check
```

## Current limitations

- Snapshot storage is a single local JSON file; a production deployment should use transactional persistent storage.
- Cache is in-memory only; a production deployment should use a shared cache/database.
- The current connected-account mode uses one server-side token. SaaS multi-user private analysis still requires GitHub OAuth or a GitHub App.
- GitHub public events do not provide a complete 90-day history; 90-day reports rely primarily on repository, commit, and PR queries for the older part of the window.
- Collection remains intentionally bounded and is not an audit/billing ledger.
- Changed-file metadata is sampled under a configurable request budget.
