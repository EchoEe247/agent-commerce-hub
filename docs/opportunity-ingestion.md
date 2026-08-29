# Opportunity ingestion

This is a read-only discovery layer inside `agent-commerce-hub`. External sources normalize into one provider-independent opportunity model; deterministic triage, optional local model evaluation, ranking, preparation, and verification stay downstream.

Nothing in the opportunity pipeline authorizes contacting a counterparty, claiming/accepting work, submitting work, hiring an executor, or moving money.

## Permanent-free first

The initial Reddit path does **not** depend on OAuth, signup credits, or a paid Reddit proxy.

1. **Reddit RSS/Atom** — primary selected-subreddit ingestion.
2. **RedditAlert free tier** — planned independent targeted backup signal.
3. **Redditapis permanent-free sitewide keyword monitor** — reserved push-source lane pending a verified delivery/signature contract.
4. **ThreadSnoop / SocialCrawl / CreatorCrawl** — optional lazy enrichment only; never required to keep the base watcher alive.

The architecture assumes Reddit RSS can change or disappear. It is an adapter, not a permanent infrastructure promise.

### Redditapis integration status

Research performed on 2026-08-27 found current public pricing/tool material describing a permanent-free all-of-Reddit keyword monitor, while older documentation contained conflicting wording and the exact generic signed webhook envelope/header contract was not exposed in the inspected client code.

For that reason this repository does **not** guess a webhook payload or signature format. The `redditapis_monitor` source ID is reserved behind the provider-independent boundary; implementation should land only after the delivery contract can be verified from authoritative schema or a real test delivery. Treat the dated provider research as historical evidence and re-check it before implementing the adapter.

## Current implementation

`tools/hermes-commerce-control/src/opportunities/`

### Discovery and durable state

- `models.ts` — canonical provider-independent opportunity shape and cross-source identity.
- `adapters/interface.ts` — pull-source adapter contract.
- `adapters/reddit-rss.ts` — bounded public Reddit Atom ingestion.
- `events.ts` — push/event normalizer seam for verified webhook/email events.
- `dedupe.ts` — canonical dedupe.
- `ingest.ts` — bounded multi-source execution with failure isolation.
- `pipeline.ts` — discover + dedupe + persist orchestration.
- `store.ts` / `file-lock.ts` — durable local JSONL persistence and multiwriter-safe append/repair behavior.
- `runtime-health.ts` — source/runtime health projection.
- `cli.ts` — runnable Reddit RSS watcher.

### Deterministic triage and profiles

- `triage.ts` — zero-cost deterministic pre-triage before model/enrichment spending.
- `profiles.ts` — named reusable triage profiles.
- `review.ts` / `review-cli.ts` — offline re-triage/review of persisted listings.

### Model evaluation

- `evaluation.ts` — strict provider-neutral evaluation schema/prompt contract.
- `evaluation-queue.ts` / `evaluation-queue-cli.ts` — stable bounded evaluation requests.
- `evaluation-results.ts` — validated append-only evaluation result persistence.
- `evaluation-runner.ts` — evaluation execution/dedupe orchestration.
- `local-openai-evaluator.ts` / `evaluate-local-cli.ts` — explicitly configured literal-loopback OpenAI-compatible evaluator with no remote credential path.

### Ranking and operator preparation

- `ranking.ts` / `ranking-cli.ts` — offline freshness-aware ranked operator queue.
- `operator-packet.ts` / `operator-packet-cli.ts` — bounded preparation packets for eligible ranked rows.
- `pursuit-dossier.ts` / `pursuit-dossier-cli.ts` — internal pursuit dossiers and controlled contact briefs.

### Verification

- `verification-plan.ts` / `verification-plan-cli.ts` — stable controlled checks and effective readiness state.
- `verification-resolutions.ts` — append-only compatible evidence resolution logic.
- `record-verification-cli.ts` — records local verification evidence without performing the external verification itself.

Canonical identity prefers a listing's normalized public URL. The same listing can therefore arrive from RSS and a later webhook/API adapter and still collapse to one opportunity.

## Pull sources vs push sources

RSS/APIs that the control plane polls implement the pull adapter contract. Webhooks and email alerts are different: a runtime-specific receiver first authenticates/verifies the event and strips secret-bearing transport data, then hands the sanitized payload to an `OpportunityEventNormalizer`.

This separation is intentional. The read-only commerce control plane does not need to own:

- an inbound HTTP server;
- webhook signing secrets;
- mail credentials;
- public TLS/port exposure;
- provider-specific retry acknowledgements.

Those are runtime concerns. Normalization, cross-source identity, dedupe, storage, triage, evaluation, ranking, preparation, and verification remain reusable here.

## Zero-cost triage

Triage is deliberately conservative. It extracts explicit USD amounts, demand/supply intent, paid/unpaid language, remote/local language, caller-configured preferred/excluded terms, and bounded caution signals. It returns `candidate`, `review`, or `reject` without using a model.

Demand/supply separation matters on mixed hiring communities. For example, `[HIRING]`/`[TASK]` posts are buyer-side demand, while `[FOR HIRE]`/`[OFFER]` posts are seller-side supply. A demand-only profile rejects an explicit seller post instead of mistaking a competitor advertising automation for a buyer seeking automation.

A hard rejection is limited to explicit or caller-controlled facts such as:

- an explicit seller/service-offer post when the profile requires demand;
- explicit unpaid/volunteer language;
- an explicit local/in-person requirement when the profile requires remote work;
- a caller-supplied excluded phrase;
- a clearly fixed USD price below a caller-supplied minimum.

Hourly amounts are never compared against a fixed-project minimum. Caution signals reduce score but are **not** proof that a listing is fraudulent. Unknown or ambiguous cases remain reviewable.

## Named profiles

The watcher has reusable profiles:

- `all` — no built-in hard filters.
- `demand` — **default**; reject explicit seller/service-offer posts while retaining remote and physical buyer tasks.
- `remote-demand` — demand-only plus explicit local/in-person rejection.
- `automation-demand` — demand-only and boosts automation/workflow/API/integration/CRM-style listings.
- `automation-remote` — automation-oriented demand plus remote-only filtering.

The default is intentionally `demand`, not `remote-demand`: later routing can decide whether a task is AI-capable, needs a remote human, or needs physical presence. Explicit CLI/environment terms extend the named profile rather than replacing it.

## Model-assisted evaluation boundary

The expensive layer lives **after** deterministic triage. `evaluation.ts` defines the provider-neutral `OpportunityEvaluator` contract. A deterministic `reject` skips evaluation entirely.

The repository also contains a concrete **local-only** adapter. `opportunities:evaluate-local` accepts only an explicit literal-loopback HTTP endpoint (`127.0.0.1` or `::1`) with a port, carries no Authorization/Cookie mechanism, and validates strict JSON responses. See `docs/opportunity-local-evaluator.md`.

Remote paid-provider support is not implied by that adapter and should be implemented separately if ever needed, with explicit credentials and cost policy.

Model output is rejected unless it matches the strict schema covering:

- recommendation: `reject | watch | pursue | manual_review`;
- execution route: `ai_direct | human_remote | human_physical | hybrid | manual | unknown`;
- risk and confidence;
- effort estimate or explicit unknown;
- payout, execution-cost, and margin ranges with provenance;
- whether AI can complete the work, whether a human is required, and whether physical presence is required;
- reasons, blockers, and next checks.

The prompt contract forbids inventing unknown payouts and treats caution flags as signals rather than proof of fraud. Evaluation is analysis-only.

## Run ingestion

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

For automation-oriented demand:

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

After `npm run build`, the same watcher is available through `opportunities:watch:built`.

The default store is:

```text
<COMMERCE_STATE_ROOT>/opportunities.jsonl
```

Only local state is written. The watcher does not log in to Reddit, post, comment, message users, claim work, move money, or call a paid enrichment API.

## Current downstream command chain

After ingestion, the implemented analysis/preparation path is:

```text
opportunities:review
  -> opportunities:prepare-evaluation
  -> opportunities:evaluate-local        (optional local model step)
  -> opportunities:rank
  -> opportunities:prepare-operator
  -> opportunities:prepare-pursuit
  -> opportunities:verification-plan
  -> opportunities:record-verification   (when compatible evidence actually exists)
```

These commands do not convert internal readiness into permission for an external action.

## Source hierarchy

For future sites, prefer the least brittle structured source available:

1. native structured API / WebMCP
2. RSS / traditional read API / webhook
3. Playwright accessibility-based browser automation
4. vision/coordinate interaction as a last resort

Every source should normalize into the same opportunity model before evaluation.

## Remaining live runtime proof

GitHub/CI validates parsing, type safety, deterministic behavior, schema contracts, concurrency/durability logic, and fixtures. That does **not** prove the real runtime/network can currently fetch Reddit RSS.

The remaining live ingestion proof is a one-shot watcher invocation from the real local runtime/network, using canonical `main`, as documented in `docs/opportunity-runtime-proof.md`. Do not claim that proof complete until an actual runtime receipt exists.

The local loopback evaluator is already implemented; after live ingestion is proven, validate it against a currently working local model bridge rather than implementing another evaluator first.

## Next stages

- Run and record one live Reddit RSS watcher proof from the real local runtime.
- Validate the existing loopback evaluator on one current candidate, then prove persisted dedupe on a repeat run.
- Add a webhook normalizer for Redditapis only after its delivery contract is verified.
- Add an email/event normalizer for RedditAlert only if it remains useful.
- Spend limited remote API credits only through a separately authorized adapter and only for candidates that survive cheap filtering.
- Consider promoting opportunity JSONL persistence behind a stable repository interface to SQLite only when there is concrete need; do not migrate state merely for cleanup.
- Add WebMCP/Playwright adapters only when a target source actually requires them.
