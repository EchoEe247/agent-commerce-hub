# Opportunity evaluation queue

The evaluation queue is the boundary between permanent-free discovery/triage and any later model-assisted analysis.

It reads the durable opportunity store, re-runs deterministic triage, compacts each selected listing to the bounded evaluation schema, and generates a provider-neutral prompt. It does **not** call a model or require a provider key.

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

- a stable `evalreq_...` request ID derived from the bounded packet;
- the opportunity ID;
- deterministic triage decision and score;
- the bounded provider-neutral evaluation packet;
- the strict JSON-only evaluation prompt.

Stable request IDs are independent of wall-clock time. A future local/free coordinator can therefore use them to deduplicate model work without changing the discovery subsystem.

The queue intentionally does not choose OpenAI, Gemini, Groq, Mistral, a local model, or any other provider. Provider selection and credentials belong in the runtime adapter that eventually implements the existing `OpportunityEvaluator` interface.

Safety properties remain unchanged: listing content is untrusted data, author/source metadata are omitted from model context, deterministic rejects are excluded by default, and no contacting, claiming, submission, payment, or other external mutation is performed by queue preparation.
