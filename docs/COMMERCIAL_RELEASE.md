# Dev30 commercial release checklist

This document tracks the path from the hosted product to the first paid production customer.

Status updated: 2026-08-18.

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
- GitHub transient 5xx retry/backoff with viewer GraphQL fallback
- Reader-first light UI and visual-richness pass
- Commercial website surface: pricing, privacy, terms, refunds, operator attribution
- Custom production domain `https://getdev30.xyz` with HTTPS and GitHub callback cut over
- Paddle Sandbox checkout verified with a successful Dev30 Pro annual transaction
- RevenueCat Sandbox customer verified with active Dev30 Pro entitlement for `github:<github-user-id>`
- Hosted hourly schedule runner with a Netlify background execution boundary
- Verified Resend sender for `getdev30.xyz`
- Production weekly report E2E verified: schedule → GitHub evidence → report → Resend → delivered email
- Retry-path quota overcount incident reconciled and guarded so failed pre-report retries do not consume report/scheduled-run quota

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
- Email delivery

## Current checkpoint — Paid Beta Readiness

The product architecture is no longer the main launch risk. The current checkpoint makes the first-run experience understandable without the founder standing beside the tester.

Acceptance path:

```text
Landing
→ Connect GitHub
→ Analyze recent work
→ Understand the report and evidence
→ Return to workspace
→ Understand Free vs Pro
→ Enable private work when Pro
→ Schedule weekly update
→ Receive email and return to Dev30
```

Checkpoint scope:

- make Connect GitHub an obvious primary action when a fresh analysis requires identity
- preserve the user’s analysis draft through OAuth return
- show a short connect → analyze → track onboarding path
- explain private/weekly Pro gating before the user hits a 402 response
- translate upstream GitHub/RevenueCat/quota errors into recoverable product language
- add a workspace “next best action” setup guide
- show verified weekly-delivery state without exposing raw provider errors as the primary message
- give shared reports a clear “create my briefing” return path
- give private weekly emails a direct return path to `/workspace`
- keep mobile layouts usable for the new onboarding surfaces

## Remaining external commercial activation

### 1. Paddle seller / website activation

- Complete identity verification as the applicable individual / sole-trader / business type if still requested by Paddle.
- Keep `https://getdev30.xyz` and the RevenueCat hosted purchase domain approved in Paddle Live.
- If Paddle requests it, add the operator's legal sole-proprietor name alongside the public `hstptcn5` brand in the Terms.
- Add a dedicated commercial support/privacy email before broad paid launch.
- Keep the existing live Dev30 Pro monthly and annual prices; do not recreate them without a billing reason.

### 2. RevenueCat production resources

- Keep the existing Paddle Live web configuration.
- Keep entitlement `pro` and the live monthly + annual products/packages/offering.
- Keep the production Purchase Link Terms URL on `https://getdev30.xyz/terms`.
- Keep the production success redirect on `https://getdev30.xyz/workspace`.
- Keep webhook authorization and the live RevenueCat API key server-side only.

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

## Release stages

### Commercial Release Candidate

Reached when:

- public commercial/legal pages are deployed on the custom domain
- Paddle/RevenueCat sandbox purchase E2E passes
- production domain review is accepted or ready to submit
- production weekly email E2E passes
- no P0/P1 product regression is open

Dev30 currently satisfies the product/infrastructure side of this stage. Remaining uncertainty is primarily production billing activation and first-run UX validation.

### Paid Beta

Reached when:

- Paid Beta Readiness checkpoint is deployed and tested with a clean account
- a production purchase succeeds
- `pro` entitlement opens paid capabilities
- portal/cancel behavior works
- billing/refund/support path is documented

Initial audience: approximately 10–20 users.

### Broader public launch

Do not broaden promotion until there is evidence of recurring value, such as users returning for a later snapshot, opening weekly emails, or enabling recurring updates.

## Release blockers that are intentionally not hidden

- Dedicated support/privacy email is not published yet.
- Paddle seller verification / production website approval can remain an external account dependency.
- Production billing is not considered verified until one intentional live purchase and cancellation lifecycle test succeeds.
- Paid Beta Readiness must be tested with a clean non-founder account after deployment.

These are launch-validation tasks, not missing core product architecture.
