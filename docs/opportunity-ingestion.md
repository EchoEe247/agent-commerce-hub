# Opportunity ingestion

This is a read-only discovery layer inside `agent-commerce-hub`. It is intentionally provider-independent: external sources feed one normalized opportunity model, while ranking/evaluation/execution stay downstream.

## Permanent-free first

The initial Reddit path does **not** depend on OAuth, signup credits, or a paid Reddit proxy.

1. **Reddit RSS/Atom** — primary selected-subreddit ingestion.
2. **RedditAlert free tier** — planned independent targeted backup signal.
3. **Redditapis permanent-free sitewide keyword monitor** — planned webhook backup signal.
4. **ThreadSnoop / SocialCrawl / CreatorCrawl** — optional lazy enrichment only; never required to keep the base watcher alive.

The architecture assumes Reddit RSS can change or disappear. It is an adapter, not a permanent infrastructure promise.

### Redditapis integration status

As researched on 2026-08-27, Redditapis' current pricing page says every account gets one all-of-Reddit new-post keyword monitor at roughly 60-second cadence with webhook/Slack/Discord delivery and no per-match/API-credit charge. Its public MCP tool catalog also describes that free entitlement. However, the MCP README still contains older wording saying monitoring has no free tier, and the exact generic signed webhook envelope/header contract is not exposed in the client code inspected so far.

For that reason this repository does **not** guess a webhook payload or signature format. The `redditapis_monitor` source ID is reserved behind the provider-independent boundary; implementation should land only after the delivery contract can be verified from an authoritative schema or a real test delivery.

## Current implementation

`tools/hermes-commerce-control/src/opportunities/`

- `models.ts` — canonical provider-independent opportunity shape and cross-source identity.
- `adapters/interface.ts` — source adapter contract.
- `adapters/reddit-rss.ts` — bounded public Reddit Atom ingestion.
- `dedupe.ts` — first-wins canonical dedupe.
- `ingest.ts` — bounded multi-source execution with failure isolation.
- `store.ts` — local JSONL persistence for durable seen-ID dedupe.
- `pipeline.ts` — discover + dedupe + persist orchestration.
- `triage.ts` — zero-cost deterministic pre-triage before model/enrichment spending.
- `cli.ts` — runnable Reddit RSS watcher with optional triage profile.

Canonical identity prefers the listing's normalized public URL. That means the same Reddit listing can later arrive from RSS and a webhook/API adapter and still collapse to one opportunity.

## Zero-cost triage

Triage is deliberately conservative. It extracts explicit USD amounts, paid/unpaid language, remote/local language, caller-configured preferred/excluded terms, and a few caution signals. It returns `candidate`, `review`, or `reject` without using a model.

A hard rejection is limited to caller-controlled or explicit facts such as:

- explicit unpaid/volunteer language;
- an explicit local/in-person requirement when the profile requires remote work;
- a caller-supplied excluded phrase;
- a clearly fixed USD price below a caller-supplied minimum.

Hourly amounts are never compared against a fixed-project minimum. Caution signals reduce score but are **not** treated as proof that a listing is fraudulent. Unknown or ambiguous cases remain reviewable for a later model/human evaluator.

## Run

From `tools/hermes-commerce-control` after dependencies are installed:

```bash
node --import tsx src/opportunities/cli.ts \
  --subreddit forhire \
  --subreddit slavelabour \
  --json
```

A zero-cost triage profile can be supplied without changing code:

```bash
node --import tsx src/opportunities/cli.ts \
  --subreddit forhire \
  --subreddit slavelabour \
  --prefer-term automation \
  --prefer-term "api integration" \
  --prefer-term crm \
  --require-remote \
  --min-fixed-usd 25 \
  --json
```

Or configure it through environment variables:

```bash
export OPPORTUNITY_REDDIT_SUBREDDITS=forhire,slavelabour
export OPPORTUNITY_PREFERRED_TERMS='automation,api integration,crm'
export OPPORTUNITY_EXCLUDED_TERMS='survey,physical pickup'
export OPPORTUNITY_REQUIRE_REMOTE=true
export OPPORTUNITY_MIN_FIXED_USD=25
node --import tsx src/opportunities/cli.ts --json
```

After `npm run build`, the same entry point is available as:

```bash
node dist/opportunities/cli.js --subreddit forhire --json
```

The default store is:

```text
<COMMERCE_STATE_ROOT>/opportunities.jsonl
```

Only local state is written. The watcher does not log in to Reddit, post, comment, message users, claim work, move money, or call a paid enrichment API.

## Source hierarchy

For future sites, prefer the least brittle structured source available:

1. native structured API / WebMCP
2. RSS / traditional read API / webhook
3. Playwright accessibility-based browser automation
4. vision/coordinate interaction as a last resort

Every source should normalize into the same opportunity model before evaluation.

## Next stages

- Add model-assisted evaluation only after deterministic triage so model usage remains sparse.
- Add a webhook normalizer for the permanent-free Redditapis monitor once its delivery contract is verified.
- Add an email/event normalizer for RedditAlert if it remains useful.
- Spend limited API credits only for candidates that survive cheap filtering.
- Promote the JSONL store behind a stable repository interface to SQLite once the evaluation schema stabilizes.
- Add WebMCP/Playwright adapters only when a target source actually needs them.
