# Opportunity ranking and routing

This layer turns persisted deterministic triage plus persisted model evaluations into a ranked, operator-facing queue. It is deliberately **offline and analysis-only**.

From `tools/hermes-commerce-control`:

```bash
npm run opportunities:rank -- --json
```

Useful filters:

```bash
npm run opportunities:rank -- \
  --profile demand \
  --evaluator local-openai:hy3-free \
  --action review_for_pursuit \
  --action manual_review \
  --min-score 50 \
  --limit 25 \
  --json
```

The command reads:

- `<COMMERCE_STATE_ROOT>/opportunities.jsonl`
- `<COMMERCE_STATE_ROOT>/opportunity-evaluations.jsonl`

It does **not** fetch Reddit, invoke a model, consume provider quota, contact anyone, claim/submit work, hire a worker, or move money.

## Selection semantics

For each persisted opportunity, the router selects the latest valid evaluation. An exact evaluator can be pinned with `--evaluator`; this is useful when comparing Hy3, MiMo, or another local evaluator without mixing judgments.

Current deterministic triage is then run again. This is intentional: if the triage profile later marks a listing as unsuitable, a stale positive model evaluation cannot bypass that current deterministic rejection.

## Operator actions

The router emits one of four analysis-only actions:

- `review_for_pursuit` — model recommends pursuit and there is no high-risk/blocker gate; this still requires operator review and performs no external action.
- `manual_review` — model explicitly requests review, or a pursue recommendation is high risk / carries unresolved blockers.
- `watch` — keep visible but do not pursue now.
- `reject` — current deterministic triage or model evaluation rejects the opportunity.

The default CLI hides `reject` rows. Use `--action all` to inspect them.

Execution route is kept separate from operator action:

- `ai_direct`
- `human_remote`
- `human_physical`
- `hybrid`
- `manual`
- `unknown`

This matters because a physical or remote-human task is not inherently bad; it simply belongs to a different execution path.

## Ranking score

The score is transparent and bounded to 0–100. Components are included in JSON output:

- current deterministic triage: up to 35 points;
- model recommendation: strong positive for `pursue`, smaller positive for review/watch, negative for reject;
- model risk: low positive, high negative;
- model confidence: bounded adjustment around 0.5;
- economics: small bounded signal from persisted payout/margin estimates;
- execution route: small feasibility signal, without treating human work as invalid;
- unresolved blockers: bounded penalty.

Economics are intentionally capped because execution cost and margin may be model-inferred. A model cannot manufacture an observed payout: the evaluation schema/prompt already requires unknown payout to remain null.

A routed `reject` is forced to score 0 and priority band `blocked`, regardless of an older positive evaluation.

## Priority bands

- `high`: score >= 70, unless watch/reject gating applies;
- `medium`: score 50–69;
- `low`: score < 50 or action `watch`;
- `blocked`: action `reject`.

Ranking is deterministic for the same persisted state, evaluator selection, triage profile, and options.

## Next boundary

The ranked queue is still not an execution engine. Future work can consume `review_for_pursuit` rows and decide whether to:

1. perform more verification/enrichment;
2. prepare an operator-facing response/contact draft;
3. route an approved task to AI, remote-human, physical-human, hybrid, or manual execution.

Any contacting, claiming, hiring, submission, payment, or other mutation must remain behind a separate explicit approval/policy boundary.
