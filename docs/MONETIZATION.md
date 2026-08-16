# Dev30 monetization foundation

Dev30 monetizes recurring value, not raw AI tokens. The public-facing product promise remains: understand what a developer actually built from GitHub evidence. Paid value begins when a user wants Dev30 to become a persistent development journal that follows private work, produces stakeholder updates, and runs automatically.

## Identity and fresh-analysis quota

A **fresh analysis** creates or refreshes GitHub evidence. In hosted mode it requires a connected GitHub workspace and is metered against that connected user, not against the GitHub username being analyzed.

Workspace identity:

```text
GitHub user id 116537093
    ↓
workspace: github:116537093
    ↓
RevenueCat App User ID: github:116537093
```

This prevents a visitor from bypassing limits by analyzing different usernames or clearing browser storage.

Reads are different from writes:

- `POST /api/analyze` creates/refetches evidence and consumes a fresh-analysis unit when it reaches the collector;
- an in-memory cache hit is returned before metering and consumes no unit;
- `GET /api/public-report` reads a persisted public report and consumes no unit;
- `/u/<username>` uses the saved-report read path, so a shared link does not invoke GitHub or DeepSeek again;
- the static `Try an example` preview does not invoke the API.

A nonexistent GitHub username is rejected before the analysis quota is consumed. The quota is consumed after GitHub confirms the target profile but before the expensive repository/commit/PR scan.

## Launch plans

Server-side defaults live in `src/entitlements.mjs`.

| Capability | Free | Pro |
| --- | --- | --- |
| Fresh analyses | 5 / month | 100 / month |
| Read saved public reports | Yes | Yes |
| Read evidence | Yes | Yes |
| Private repository analysis | No | Yes |
| Client / founder reports | No | 50 / month |
| Weekly automatic runs | No | 8 / month |
| Email deliveries | No | 8 / month |

The quota values are product limits, not pricing promises. Pricing is configured in RevenueCat/Paddle rather than hard-coded in Dev30.

`DEV30_FORCE_PLAN=free|pro` is a development/pilot override only.

Local development deliberately stays billing-free: when `NODE_ENV` is not `production` and `REVENUECAT_API_KEY` is absent, the local workspace gets Pro-equivalent feature access. Use `DEV30_FORCE_PLAN=free` to test the free experience locally.

## RevenueCat + Paddle

RevenueCat is the subscription entitlement source of truth. Paddle Billing is the intended web billing engine / Merchant of Record behind RevenueCat.

Required activation variables:

```env
REVENUECAT_API_KEY=
REVENUECAT_ENTITLEMENT_ID=pro
REVENUECAT_PURCHASE_LINK_URL=https://pay.rev.cat/<production-token>
REVENUECAT_WEBHOOK_AUTH=<opaque-shared-authorization-value>
```

Dev30 does not persist a local Stripe subscription row and then infer Pro from it. Runtime access checks ask RevenueCat for the connected workspace customer and look for the configured entitlement.

The customer lookup uses:

```text
GET https://api.revenuecat.com/v1/subscribers/{app_user_id}
Authorization: Bearer <REVENUECAT_API_KEY>
```

Customer info is cached briefly in memory. A RevenueCat webhook invalidates that cache for the affected `app_user_id`.

The webhook endpoint is:

```text
POST /api/billing/webhook
Authorization: <same opaque value configured as REVENUECAT_WEBHOOK_AUTH>
```

The webhook is a cache-invalidation hint, not the source of entitlement truth. The next entitlement check still reads RevenueCat customer state.

Checkout uses the configured RevenueCat Web Purchase Link with the Dev30 workspace ID appended as the RevenueCat App User ID. Subscription management uses RevenueCat's returned `management_url` when available.

## Provider-outage behavior

Authorization fails closed: an unavailable RevenueCat lookup never grants Pro.

Interactive Pro actions return an unavailable/upgrade result instead of silently granting access. Scheduled work additionally distinguishes an entitlement-provider outage from a real Free plan so a temporary RevenueCat outage is retryable rather than advancing and losing a paid user's weekly run.

## DeepSeek cost telemetry

Every successful DeepSeek call records token usage returned by the provider as a structured log line:

```text
[dev30-ai] { ... }
```

Operations include:

- `analysis`;
- `snapshot_delta`;
- `stakeholder_report`.

The estimate uses configurable rates:

```env
DEEPSEEK_INPUT_USD_PER_MILLION=0.14
DEEPSEEK_OUTPUT_USD_PER_MILLION=0.28
```

These defaults are an estimate baseline, not a permanent provider-price contract. If DeepSeek pricing changes, update the environment values without changing application logic.

Telemetry includes provider, operation, model, prompt/completion/total token counts, estimated cost, and the rates used. It intentionally does not include private repository content or a workspace identifier.

## Legacy Stripe boundary

`src/billing.mjs` and old storage fields remain during this checkpoint for backward compatibility with existing local/test data. They are **not** the runtime subscription source of truth after Dev30 1.1.

Do not configure a production deployment by following the old Stripe environment variables. New hosted billing uses RevenueCat/Paddle.

## What is intentionally not hard-coded yet

- monthly or annual price;
- currency;
- Paddle product/price identifiers;
- RevenueCat Offering/package identifiers;
- promotional trials.

Those should be configured only after the real RevenueCat/Paddle project exists, so the repository does not pretend external billing resources have already been provisioned.
