# Dev30

**Dev30 answers one question:** what did this GitHub developer actually work on during the last 30 days?

It is not a contribution counter and it does not score developers. Dev30 collects public GitHub evidence first, derives deterministic engineering signals, then asks DeepSeek to turn that evidence into two views:

- **Explain simply** — a plain-language brief for clients, founders, recruiters, and non-technical readers.
- **Technical view** — work mix, repository activity, technologies, development trajectory, timeline, and the evidence behind the claims.

Every concrete claim produced by the LLM is constrained to evidence IDs that were actually collected from GitHub. The UI exposes those commits and pull requests as clickable evidence.

## MVP flow

```text
GitHub username
    ↓
GitHub REST collector
    ↓
30-day repositories + commits + PRs + sampled changed-file metadata
    ↓
Deterministic work classification
    ↓
Evidence ledger (E1, E2, ...)
    ↓
DeepSeek JSON synthesis
    ↓
Simple view / Technical view / Evidence
```

## Run locally

Requires Node.js 22+.

```bash
cp .env.example .env
# Fill DEEPSEEK_API_KEY and preferably GITHUB_TOKEN
npm start
```

PowerShell can also set secrets directly:

```powershell
$env:DEEPSEEK_API_KEY="..."
$env:GITHUB_TOKEN="..."
npm start
```

Open `http://localhost:3000`.

The MVP currently has no npm runtime dependencies; it uses the Node.js standard library and native `fetch`.

## Configuration

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DEEPSEEK_API_KEY` | For LLM mode | — | DeepSeek API credential; server-side only |
| `DEEPSEEK_MODEL` | No | `deepseek-v4-flash` | Report synthesis model |
| `DEEPSEEK_THINKING` | No | `disabled` | Set `enabled` for reasoning mode |
| `GITHUB_TOKEN` | Recommended | — | Higher GitHub API budget and richer collection |
| `MAX_ACTIVE_REPOS` | No | `5` | Maximum recently active repos to enrich |
| `MAX_DETAIL_COMMITS` | No | `6` | Commit-detail/file-path evidence budget |
| `PORT` | No | `3000` | HTTP port |

Without `DEEPSEEK_API_KEY`, Dev30 returns a clearly labelled deterministic fallback. Without `GITHUB_TOKEN`, it runs in **public-lite** mode and intentionally reduces GitHub requests.

## API

`POST /api/analyze`

```json
{
  "username": "hstptcn5",
  "locale": "vi"
}
```

The response includes the profile, fixed 30-day window, report, deterministic work mix, repository metrics, evidence ledger, and collector/model metadata.

`GET /api/health` reports whether DeepSeek and authenticated GitHub collection are configured without exposing secrets.

## Evidence rules

The DeepSeek prompt prohibits inventing work, technologies, users, launches, business impact, seniority, or hire/no-hire judgments. Material work claims should cite supplied evidence IDs. Server-side normalization removes evidence references the collector never issued.

## Validation

```bash
npm test
npm run check
```

## MVP limitations

- Public GitHub activity only; private repositories will require GitHub OAuth/App authorization.
- Collection is intentionally bounded; this is a recent-work reconstruction, not a billing/audit ledger.
- Changed-file metadata is sampled under a configurable request budget.
- Repository descriptions, commit messages, and PR titles are treated as evidence, not instructions to the LLM.

## Next product steps

1. GitHub OAuth / GitHub App for private repositories and user-owned reports.
2. Cached snapshots so public usernames do not repeatedly consume GitHub + DeepSeek calls.
3. Weekly client-facing reports and shareable permanent report URLs.
4. Selective PR diff/test retrieval before deeper architectural claims.
