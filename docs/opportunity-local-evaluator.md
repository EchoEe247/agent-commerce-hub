# Local opportunity evaluator

This layer consumes prepared opportunity-evaluation packets through an explicitly configured **loopback OpenAI-compatible endpoint**. It exists so the commerce system can use a local/free model bridge without coupling discovery, triage, or evaluation schemas to any model vendor.

From `tools/hermes-commerce-control`:

```bash
npm run opportunities:evaluate-local -- \
  --base-url http://127.0.0.1:20130/v1 \
  --model <local-model-id> \
  --decision candidate \
  --limit 1 \
  --json
```

The command:

- reads persisted opportunities;
- re-runs deterministic triage;
- prepares bounded provider-neutral evaluation packets;
- sends only those packets/prompts to the configured local model endpoint;
- validates strict JSON output against the existing opportunity-evaluation schema;
- persists successful results to `<COMMERCE_STATE_ROOT>/opportunity-evaluations.jsonl`;
- skips the same `requestId + evaluatorId` pair on later runs so quota is not spent twice.

## Hard boundaries

The adapter intentionally accepts only an explicit `http://` loopback endpoint (`127.0.0.1`, `localhost`, or `::1`) with an explicit port. It does not accept remote URLs and has no API-key/Authorization/Cookie mechanism. Redirects are refused.

This keeps the first model-assisted path permanent-free/local-first. Supporting a remote paid provider later should be a separate adapter with explicit credential and cost policy rather than silently broadening this one.

The model response must contain strict JSON text in the assistant `message.content`. Markdown fences or repair heuristics are rejected rather than silently corrected.

The evaluator performs analysis only. It cannot contact posters, comment, DM, claim work, submit work, hire workers, or move money.

## Runtime proof after merge

Use the existing clean runtime-proof worktree or create a fresh clean worktree at the merged branch tip. Start with a single candidate (`--limit 1`) and a currently working local model ID. PASS requires:

- exit code 0;
- `ok: true`;
- one `completed` result (or `skipped` if the exact request/evaluator pair was already persisted);
- a valid schema-conforming evaluation record;
- no Authorization/Cookie header;
- no remote endpoint.

Re-running the same command should show `skipped: 1` and make no second model call for that same request/evaluator pair.
