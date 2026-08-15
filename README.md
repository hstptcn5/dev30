# Dev30

**Dev30 turns recent GitHub activity into evidence-backed work reports, comparable history, and stakeholder-ready development updates.**

It is not a contribution counter and it does not score developers. Dev30 collects GitHub evidence first, derives deterministic engineering signals, then asks DeepSeek to explain the work.

- **Explain simply** — plain-language project summaries for non-technical readers.
- **Technical view** — engineering work mix, repository activity, technologies, trajectory, timeline, and evidence.
- **Snapshot history** — persistent local snapshots and deterministic comparisons over time.
- **Client / founder update** — a concise progress report generated from a saved snapshot and its evidence, with Markdown export.

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
Client/founder report writer
    ↓
Copyable Markdown + public share route when evidence is public-only
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
- Public analysis pages receive a shareable route such as `/u/hstptcn5?days=30&lang=vi`.
- Reports are cached in memory for `CACHE_TTL_MINUTES` (default 360) to avoid unnecessary GitHub and DeepSeek calls.
- Fresh analyses are persisted as snapshots in `data/history.json`; identical structured analyses are deduplicated.
- Snapshot series are separated by username, window, language, and public/private mode.
- When a previous snapshot exists, Dev30 computes new/absent repos, observed commit/PR count changes, work-mix shifts, focus changes, and newly observed work units.
- DeepSeek receives only that deterministic delta for **What changed since last report?**.
- Snapshot schema v2 retains a bounded evidence ledger so a later stakeholder report can still link back to GitHub after a restart.
- The Snapshot & History card offers **Generate weekly update** with `Client update` or `Founder update` audience.
- Stakeholder reports are generated from a saved snapshot + deterministic delta, not from an unconstrained prompt.
- Generated reports are stored locally in `data/client-reports.json` and include **Copy Markdown**.
- A report is shareable at `/r/<report-id>` only when the source snapshot is public and all selected evidence is public. Private reports remain local-only.
- `Refresh` bypasses the analysis cache and rebuilds a report; it creates a new snapshot only when the structured analysis changed.
- If `GITHUB_TOKEN` is configured, `/api/me` exposes the connected account identity and the UI offers **Analyze my account**.
- Private repository analysis is explicit opt-in and only works for the account represented by `GITHUB_TOKEN`.
- Private history/client reports stay on the local Dev30 instance. `data/` is gitignored.
- Private analysis and private stakeholder reports may send selected repository/work metadata to the configured DeepSeek API; they are never silently enabled for ordinary public lookups.

## Configuration

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DEEPSEEK_API_KEY` | For LLM mode | — | DeepSeek credential; server-side only |
| `DEEPSEEK_MODEL` | No | `deepseek-v4-flash` | Analysis, delta, and stakeholder-report synthesis model |
| `DEEPSEEK_THINKING` | No | `disabled` | Set `enabled` for the main analysis reasoning mode |
| `GITHUB_TOKEN` | Recommended | — | Higher API budget; also enables explicit connected-account mode |
| `CACHE_TTL_MINUTES` | No | `360` | In-memory analysis cache lifetime |
| `DEV30_HISTORY_FILE` | No | `data/history.json` | Persistent local snapshot store |
| `HISTORY_MAX_PER_SERIES` | No | `24` | Maximum snapshots per username/window/mode/language series |
| `HISTORY_MAX_TOTAL` | No | `500` | Maximum snapshots across the local store |
| `DEV30_CLIENT_REPORT_FILE` | No | `data/client-reports.json` | Persistent local stakeholder-report store |
| `CLIENT_REPORT_MAX_TOTAL` | No | `200` | Maximum generated stakeholder reports retained locally |
| `MAX_DISCOVERED_REPOS` | No | `15` | Maximum active repositories to scan |
| `MAX_DEEP_DIVE_REPOS` | No | `5` | Repositories selected for changed-file inspection |
| `MAX_COMMIT_PAGES` | No | `5` | Commit-list pagination budget per repo |
| `MAX_PR_PAGES` | No | `2` | Pull-request pagination budget per repo |
| `MAX_DETAIL_COMMITS_PER_REPO` | No | `3` | Commit-detail budget for deep-dive repos |
| `MAX_DETAIL_PRS_PER_REPO` | No | `6` | PR-file budget for deep-dive repos |
| `PORT` | No | `3000` | HTTP port |

Without `DEEPSEEK_API_KEY`, Dev30 returns deterministic analysis, delta, and stakeholder-report fallbacks. Without `GITHUB_TOKEN`, public lookup runs in a tighter **public-lite** collection mode.

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

`POST /api/client-report`

```json
{
  "snapshotId": "saved-snapshot-uuid",
  "audience": "client"
}
```

`audience` accepts `client` or `founder`. The response contains the structured report, Markdown, evidence, and a `sharePath` only when the report is public-share-safe.

`GET /api/client-report/<report-id>` returns one generated report. Private/local-only reports require the connected account.

`GET /api/client-reports?username=hstptcn5&includePrivate=false` lists locally generated stakeholder reports for a user/mode.

`GET /api/health` reports product/analyzer version, DeepSeek/GitHub configuration, cache stats, local history counts, and client-report counts without exposing secrets.

`GET /api/me` returns the GitHub identity represented by the configured server-side token and private-access diagnostics.

## Evidence, reports, and privacy rules

- GitHub evidence remains the source of truth; DeepSeek interprets it.
- The prompts prohibit talent scores, hire/no-hire judgments, permanent skill/personality claims, unsupported impact claims, and invented future plans.
- Server-side normalization removes evidence IDs that were never collected.
- Snapshot comparison is deterministic; DeepSeek is not asked to compare two free-form reports.
- Client/founder reports are built from snapshot/delta/evidence payloads; DeepSeek is not allowed to invent blockers, deadlines, promises, or business impact.
- Public lookup never enumerates private repositories.
- Private analysis requires an explicit request and a token whose authenticated login matches the requested username.
- Private snapshots and generated stakeholder reports are stored locally and intentionally excluded from git by `.gitignore`.
- Public stakeholder sharing is refused if the source snapshot is private or selected evidence is private.

## Validation

```bash
npm test
npm run check
```

## Current limitations

- Snapshot and stakeholder-report storage use local JSON files; a production deployment should use transactional persistent storage.
- Cache is in-memory only; a production deployment should use a shared cache/database.
- Public share routes are only as reachable as the Dev30 server itself; deploying them as durable SaaS URLs still requires hosted persistence and authentication boundaries.
- The current connected-account mode uses one server-side token. SaaS multi-user private analysis still requires GitHub OAuth or a GitHub App.
- GitHub public events do not provide a complete 90-day history; 90-day reports rely primarily on repository, commit, and PR queries for the older part of the window.
- Collection remains intentionally bounded and is not an audit/billing ledger.
- Changed-file metadata is sampled under a configurable request budget.
