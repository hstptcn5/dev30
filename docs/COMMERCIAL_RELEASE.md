# Dev30 commercial release checklist

This document tracks the path from the current hosted early-access product to the first paid production customer.

## Completed product and infrastructure checkpoints

- Evidence-first GitHub collection and work reconstruction
- DeepSeek explanation constrained by collected evidence IDs
- Durable public reports and snapshot comparison
- Workspace and stakeholder-report workflow
- Free / Pro entitlement boundary and monthly usage metering
- DeepSeek token/cost telemetry
- Supabase hosted persistence
- Netlify production deployment and background Analyze jobs
- Production GitHub App OAuth and workspace identity
- Reader-first light UI and visual-richness pass
- Commercial website surface: pricing, privacy, terms, refunds, operator attribution
- Custom production domain `https://getdev30.xyz` connected to the Netlify site with HTTPS working
- Paddle Sandbox checkout verified with a successful Dev30 Pro annual transaction
- RevenueCat Sandbox customer verified with active Dev30 Pro entitlement for `github:<github-user-id>`

## Current launch plan

### Free

- 5 fresh analyses / month
- Public GitHub briefings
- Evidence-backed claims
- Saved public report reading
- Meaningful snapshot comparison

### Dev30 Pro

Launch price target:

- USD 5.99 / month
- USD 49.99 / year

Product limits / paid capabilities:

- 100 fresh analyses / month
- Private repository analysis for explicitly authorized repositories
- Full recurring snapshot/history workflow
- Client / founder stakeholder reports
- Weekly automatic updates
- Email delivery once production email is activated

## Remaining external commercial activation

### 1. Custom-domain cutover

- Set Netlify `APP_BASE_URL=https://getdev30.xyz`.
- Set Netlify `GITHUB_OAUTH_CALLBACK_URL=https://getdev30.xyz/auth/github/callback`.
- Add the new callback URL to the GitHub App while keeping the old Netlify callback temporarily during the cutover.
- Change the GitHub App homepage to `https://getdev30.xyz` and setup URL to `https://getdev30.xyz/workspace`.
- Verify connect, callback, workspace, fresh Analyze, public report, and background Analyze from the custom domain.
- Keep the Netlify subdomain as a temporary fallback until the custom-domain flow is confirmed.

### 2. Paddle seller activation

- Complete identity verification as the applicable individual / sole-trader / business type.
- Submit `https://getdev30.xyz` for production domain review.
- If Paddle requests it, add the operator's legal sole-proprietor name alongside the public `hstptcn5` brand in the Terms.
- Add a dedicated commercial support/privacy email before broad paid launch.
- Keep the existing live Dev30 Pro monthly and annual prices; do not recreate them for the domain migration.

### 3. RevenueCat production resources

- Keep the existing Paddle Live web configuration.
- Keep entitlement `pro` and the live monthly + annual products/packages/offering.
- Update the production Purchase Link Terms URL to `https://getdev30.xyz/terms`.
- Update the production success redirect to `https://getdev30.xyz/workspace`.
- Configure a RevenueCat webhook authorization secret.
- Put the live RevenueCat API key and production Purchase Link URL into Netlify only after the production purchase flow is ready to test.

Netlify variables expected by the existing code:

```env
REVENUECAT_API_KEY=
REVENUECAT_ENTITLEMENT_ID=pro
REVENUECAT_PURCHASE_LINK_URL=
REVENUECAT_WEBHOOK_AUTH=
```

The stable RevenueCat App User ID is the Dev30 workspace ID:

```text
github:<github-user-id>
```

### 4. Payment E2E release gate

Sandbox checkout and entitlement activation are verified. Remaining lifecycle checks before paid beta:

```text
Free GitHub user
→ Pricing / Upgrade
→ RevenueCat production Web Purchase Link
→ Paddle live checkout
→ RevenueCat customer github:<id>
→ entitlement pro active
→ Dev30 opens private analysis
→ billing management URL works
→ cancellation changes renewal state as expected
```

Do not broaden paid launch until the live loop is verified with one intentional production purchase.

### 5. Paid recurring-feature activation

Before advertising weekly email as production-complete:

- configure `DEV30_CRON_SECRET`
- configure a hosted hourly cron caller for `/api/internal/run-due`
- configure a verified Resend sender
- set `RESEND_API_KEY`
- set `DEV30_EMAIL_FROM`
- verify one scheduled report + one delivered email + retry/idempotency behavior

## Release stages

### Commercial Release Candidate

Reached when:

- public commercial/legal pages are deployed on the custom domain
- Paddle/RevenueCat sandbox purchase E2E passes
- production domain review is accepted or ready to submit
- no P0/P1 product regression is open

### Paid Beta

Reached when:

- a production purchase succeeds
- `pro` entitlement opens paid capabilities
- portal/cancel behavior works
- billing/refund/support path is documented

Initial audience: approximately 10–20 users.

### Broader public launch

Do not broaden promotion until there is evidence of recurring value, such as users returning for a later snapshot or enabling weekly updates.

## Release blockers that are intentionally not hidden

- Dedicated support/privacy email is not published yet.
- Paddle seller verification and production domain review are external account steps.
- Production billing is not considered verified until one intentional live purchase and cancellation lifecycle test succeeds.
- Resend and hosted cron remain optional/unconfigured until weekly email is intentionally activated.

These are activation tasks, not missing product architecture.
