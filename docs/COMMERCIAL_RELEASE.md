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

### 1. Paddle seller activation

- Create/sign in to the real Paddle seller account.
- Complete identity verification as the applicable individual / sole-trader / business type.
- Add `https://dev-30.netlify.app` for domain review.
- If Paddle requests it, add the operator's legal sole-proprietor name alongside the public `hstptcn5` brand in the Terms.
- Add a dedicated commercial support/privacy email before broad paid launch.
- Create monthly and annual Dev30 Pro prices in Paddle.

### 2. RevenueCat production resources

- Create/confirm the RevenueCat project.
- Connect Paddle Billing.
- Create entitlement `pro`.
- Create monthly + annual web products/packages/offering.
- Create a sandbox Web Purchase Link and test it first.
- Create the production Web Purchase Link only after sandbox E2E is green.
- Configure a RevenueCat webhook authorization secret.

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

### 3. Payment E2E release gate

Sandbox test must prove:

```text
Free GitHub user
→ Pricing / Upgrade
→ RevenueCat Web Purchase Link
→ Paddle sandbox checkout
→ RevenueCat customer github:<id>
→ entitlement pro active
→ Dev30 opens private analysis
→ billing management URL works
→ cancellation changes entitlement as expected
```

Do not publish a production purchase link until the sandbox loop is verified.

### 4. Paid recurring-feature activation

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

- public commercial/legal pages are deployed
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
- RevenueCat/Paddle production products and purchase links do not exist until provisioned in their dashboards.
- Resend and hosted cron remain optional/unconfigured until weekly email is intentionally activated.

These are activation tasks, not missing product architecture.
