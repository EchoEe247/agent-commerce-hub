# Opportunity evaluation queue

The evaluation queue is the boundary between permanent-free discovery/triage and model-assisted analysis.

It reads the durable opportunity store, re-runs deterministic triage, compacts each selected listing to the bounded evaluation schema, and generates a provider-neutral prompt. Queue preparation itself does **not** call a model or require a provider key.

From `tools/hermes-commerce-control`:

```bash
npm run opportunities:prepare-evaluation -- --json
```

By default it prepares `candidate` and `review` items under the `demand` profile. Useful variants:

```bash
npm run opportunities:prepare-evaluation -- \
  --profile automation-demand \
  --min-score 65 \
  --limit 20 \
  --jsonl

npm run opportunities:prepare-evaluation -- \
  --decision candidate \
  --limit 10
```

Each prepared request contains:

- a stable `evalreq_...` request ID derived from the bounded packet and evaluation-policy version;
- the opportunity ID;
- deterministic triage decision and score;
- the bounded provider-neutral evaluation packet;
- the strict JSON-only evaluation prompt.

Stable request IDs are independent of wall-clock time. They are used to deduplicate model work and to prevent evaluation results created under older packet/policy state from silently becoming current.

## Current local evaluator

The queue remains provider-neutral, but the repository now includes a separate loopback-only execution adapter documented in [`opportunity-local-evaluator.md`](opportunity-local-evaluator.md).

A prepared candidate can be evaluated through an explicitly configured local OpenAI-compatible bridge with:

```bash
npm run opportunities:evaluate-local -- \
  --base-url http://127.0.0.1:20130/v1 \
  --model <local-model-id> \
  --decision candidate \
  --limit 1 \
  --json
```

That adapter is intentionally separate from queue construction. Remote/provider-authenticated evaluators, if ever added, should remain separate adapters with explicit credential/cost policy rather than broadening this local-only path.

Safety properties remain unchanged: listing content is untrusted data, author/source metadata are omitted from model context, deterministic rejects are excluded by default, and no contacting, claiming, submission, payment, or other external mutation is performed by queue preparation or evaluation.
