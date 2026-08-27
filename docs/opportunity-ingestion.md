# Opportunity ingestion

This is a read-only discovery layer inside `agent-commerce-hub`. It is intentionally provider-independent: external sources feed one normalized opportunity model, while ranking/evaluation/execution stay downstream.

## Permanent-free first

The initial Reddit path does **not** depend on OAuth, signup credits, or a paid Reddit proxy.

1. **Reddit RSS/Atom** — primary selected-subreddit ingestion.
2. **RedditAlert free tier** — planned independent targeted backup signal.
3. **Redditapis permanent-free sitewide keyword monitor** — planned webhook backup signal.
4. **ThreadSnoop / SocialCrawl / CreatorCrawl** — optional lazy enrichment only; never required to keep the base watcher alive.

The architecture assumes Reddit RSS can change or disappear. It is an adapter, not a permanent infrastructure promise.

## Current implementation

`tools/hermes-commerce-control/src/opportunities/`

- `models.ts` — canonical provider-independent opportunity shape and cross-source identity.
- `adapters/interface.ts` — source adapter contract.
- `adapters/reddit-rss.ts` — bounded public Reddit Atom ingestion.
- `dedupe.ts` — first-wins canonical dedupe.
- `ingest.ts` — bounded multi-source execution with failure isolation.
- `store.ts` — local JSONL persistence for durable seen-ID dedupe.
- `pipeline.ts` — discover + dedupe + persist orchestration.
- `cli.ts` — runnable Reddit RSS watcher.

Canonical identity prefers the listing's normalized public URL. That means the same Reddit listing can later arrive from RSS and a webhook/API adapter and still collapse to one opportunity.

## Run

From `tools/hermes-commerce-control` after dependencies are installed:

```bash
node --import tsx src/opportunities/cli.ts \
  --subreddit forhire \
  --subreddit slavelabour \
  --json
```

Or configure the subreddit set once:

```bash
export OPPORTUNITY_REDDIT_SUBREDDITS=forhire,slavelabour
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

- Add opportunity scoring/evaluation as a separate deterministic/model-assisted layer.
- Add a webhook normalizer for the permanent-free Redditapis monitor.
- Add an email/event normalizer for RedditAlert if it remains useful.
- Spend limited API credits only for candidates that survive cheap filtering.
- Promote the JSONL store behind a stable repository interface to SQLite once the evaluation schema stabilizes.
- Add WebMCP/Playwright adapters only when a target source actually needs them.
