# Opportunity ingestion

This is a read-only discovery layer inside `agent-commerce-hub`. It is intentionally provider-independent: external sources feed one normalized opportunity model, while triage, model-assisted evaluation, human/AI routing, and any eventual execution stay downstream.

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
- `adapters/interface.ts` — pull-source adapter contract.
- `adapters/reddit-rss.ts` — bounded public Reddit Atom ingestion.
- `events.ts` — push/event normalizer seam for verified webhook/email events.
- `dedupe.ts` — first-wins canonical dedupe.
- `ingest.ts` — bounded multi-source execution with failure isolation.
- `store.ts` — local JSONL persistence for durable seen-ID dedupe.
- `pipeline.ts` — discover + dedupe + persist orchestration.
- `triage.ts` — zero-cost deterministic pre-triage before model/enrichment spending.
- `profiles.ts` — named reusable triage profiles.
- `evaluation.ts` — strict provider-neutral model-evaluation contract and response validator.
- `cli.ts` — runnable Reddit RSS watcher with named profiles and explicit overrides.

Canonical identity prefers the listing's normalized public URL. That means the same Reddit listing can later arrive from RSS and a webhook/API adapter and still collapse to one opportunity.

## Pull sources vs push sources

RSS/APIs that the control plane polls implement the pull adapter contract. Webhooks and email alerts are different: a runtime-specific receiver first authenticates/verifies the event and strips secret-bearing transport data, then hands the sanitized payload to an `OpportunityEventNormalizer`.

This separation is intentional. The read-only commerce control plane does not need to own:

- an inbound HTTP server;
- webhook signing secrets;
- mail credentials;
- public TLS/port exposure;
- provider-specific retry acknowledgements.

Those are runtime concerns. Normalization, cross-source identity, dedupe, storage, triage, and evaluation remain reusable here.

## Zero-cost triage

Triage is deliberately conservative. It extracts explicit USD amounts, demand/supply intent, paid/unpaid language, remote/local language, caller-configured preferred/excluded terms, and a few caution signals. It returns `candidate`, `review`, or `reject` without using a model.

Demand/supply separation matters on mixed hiring communities. For example, `[HIRING]`/`[TASK]` posts are buyer-side demand, while `[FOR HIRE]`/`[OFFER]` posts are seller-side supply. A demand-only profile rejects an explicit seller post instead of mistaking a competitor advertising "automation" for a buyer seeking automation.

A hard rejection is limited to explicit or caller-controlled facts such as:

- an explicit seller/service-offer post when the profile requires demand;
- explicit unpaid/volunteer language;
- an explicit local/in-person requirement when the profile requires remote work;
- a caller-supplied excluded phrase;
- a clearly fixed USD price below a caller-supplied minimum.

Hourly amounts are never compared against a fixed-project minimum. Caution signals reduce score but are **not** treated as proof that a listing is fraudulent. Unknown or ambiguous cases remain reviewable for a later model/human evaluator.

## Named profiles

The watcher has reusable profiles so a local Hermes invocation can stay short:

- `all` — no built-in hard filters.
- `demand` — **default**; reject explicit seller/service-offer posts, while retaining remote and physical buyer tasks.
- `remote-demand` — demand-only plus explicit local/in-person rejection.
- `automation-demand` — demand-only and boosts automation/workflow/API/integration/CRM-style listings.
- `automation-remote` — automation-oriented demand plus remote-only filtering.

The default is intentionally `demand`, not `remote-demand`: the broader opportunity router can later decide whether a task is AI-capable, needs a remote human, or needs physical presence. Explicit CLI/environment terms extend the named profile rather than replacing it.

## Model-assisted evaluation boundary

The expensive layer lives **after** deterministic triage. `evaluation.ts` defines an `OpportunityEvaluator` interface but does not choose or import a model provider. This keeps free/local/provider rotation possible.

A deterministic `reject` skips the evaluator entirely. `candidate` and `review` items can be sent to a coordinator/model through the interface. Model output is rejected unless it matches a strict schema covering:

- recommendation: `reject | watch | pursue | manual_review`;
- execution route: `ai_direct | human_remote | human_physical | hybrid | manual | unknown`;
- risk and confidence;
- effort estimate or explicit unknown;
- payout, execution-cost, and margin ranges with `observed` vs `inferred` provenance;
- whether AI can complete the work, whether a human is required, and whether physical presence is required;
- reasons, blockers, and next checks.

The prompt contract explicitly forbids inventing unknown payouts and treats caution flags as signals rather than proof of fraud. It is analysis-only: no contact, claim, submission, payment, or other external mutation is part of evaluation.

## Run

From `tools/hermes-commerce-control` after dependencies are installed:

```bash
npm run opportunities:watch -- \
  --subreddit forhire \
  --subreddit slavelabour \
  --json
```

That uses the default `demand` profile. For remote-only buyer tasks:

```bash
npm run opportunities:watch -- \
  --subreddit forhire \
  --subreddit slavelabour \
  --profile remote-demand \
  --json
```

For automation-oriented demand without excluding other demand-side work from ingestion:

```bash
npm run opportunities:watch -- \
  --subreddit forhire \
  --subreddit slavelabour \
  --profile automation-demand \
  --prefer-term research \
  --min-fixed-usd 25 \
  --json
```

Or configure it through environment variables:

```bash
export OPPORTUNITY_REDDIT_SUBREDDITS=forhire,slavelabour
export OPPORTUNITY_PROFILE=demand
export OPPORTUNITY_PREFERRED_TERMS='automation,api integration,crm'
export OPPORTUNITY_EXCLUDED_TERMS='survey'
node --import tsx src/opportunities/cli.ts --json
```

After `npm run build`, the same entry point is available as:

```bash
npm run opportunities:watch:built -- --subreddit forhire --json
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

## Remaining runtime proof

The GitHub/CI implementation can validate parsing, type safety, deterministic behavior, schema contracts, and fixtures. The next genuinely local proof is a one-shot invocation against live Reddit RSS from the real runtime/network. Hermes only needs to run that proof; it does not need to implement this feature.

After that proof, the system can decide whether continuous scheduling belongs on the local phone/runtime or an optional 24/7 server.

## Next stages

- Verify one live RSS watcher pass from the real local runtime.
- Connect an existing free/local coordinator to the `OpportunityEvaluator` interface only after the live ingestion path is proven.
- Add a webhook normalizer for the permanent-free Redditapis monitor once its delivery contract is verified.
- Add an email/event normalizer for RedditAlert if it remains useful.
- Spend limited API credits only for candidates that survive cheap filtering/evaluation.
- Promote the JSONL store behind a stable repository interface to SQLite once the evaluation schema stabilizes.
- Add WebMCP/Playwright adapters only when a target source actually needs them.
