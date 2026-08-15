# GitHub App setup for Dev30

Dev30 0.7 supports GitHub App user authorization for connected workspaces. The legacy `GITHUB_TOKEN` path remains available for local development, but a GitHub App is the preferred multi-user path.

## 1. Register the GitHub App

In GitHub **Settings → Developer settings → GitHub Apps → New GitHub App**:

- **GitHub App name:** any unique name, for example `dev30-local-<name>`
- **Homepage URL:** `http://localhost:3000`
- **Callback URL:** `http://localhost:3000/auth/github/callback`
- **Webhook:** not required for Checkpoint 0.7
- **Where can this GitHub App be installed?** choose the scope appropriate for your test; a personal app can be limited to the owner while developing

Repository permissions required by the current collector:

- **Contents:** Read-only
- **Pull requests:** Read-only
- **Metadata:** GitHub supplies the repository metadata access required by repository APIs

Keep **user-to-server token expiration enabled**. Dev30 stores the refresh token encrypted and rotates an expiring access token when necessary.

## 2. Install the app on repositories

Authorizing the GitHub user and installing the GitHub App are separate concepts. Install the app on the account and choose the repositories Dev30 is allowed to analyze. Private repositories are invisible until the installation includes them.

## 3. Configure `.env`

Copy values from the GitHub App settings page:

```env
GITHUB_APP_CLIENT_ID=Iv1_xxxxxxxxx
GITHUB_APP_CLIENT_SECRET=xxxxxxxxx
GITHUB_APP_SLUG=your-app-slug
GITHUB_OAUTH_CALLBACK_URL=http://localhost:3000/auth/github/callback
```

Generate a long random session secret. One Node-only option is:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Then set:

```env
DEV30_SESSION_SECRET=<generated-value>
```

Do not commit the client secret, session secret, user access token, refresh token, `.env`, or `data/`.

## 4. Run

```bash
npm start
```

Open `http://localhost:3000`. If the GitHub App credentials are configured and there is no active session, Dev30 shows **Connect GitHub**. After authorization, `/workspace` shows the connected identity, repository-access diagnostics, private snapshots, and stakeholder reports.

## Security boundary

- OAuth `state` protects the callback from CSRF-style request substitution.
- PKCE (`S256`) binds the authorization code to the browser flow.
- The session cookie is opaque, `HttpOnly`, and `SameSite=Lax`.
- GitHub user/refresh tokens are encrypted with AES-256-GCM before being written to `data/sessions.json`.
- `DEV30_SESSION_SECRET` is required for sessions to survive restarts. Without it, Dev30 intentionally uses an ephemeral encryption key.
- Private cache/history is scoped by stable workspace ID (`github:<user-id>`).
- PAT mode is retained only as a local-development fallback.

## Production follow-up

The local JSON stores are not the final SaaS database. A hosted deployment should replace session/history/report JSON files with transactional per-user storage, set secure cookies behind HTTPS, add a production callback URL, and handle GitHub App authorization-revocation webhooks.
