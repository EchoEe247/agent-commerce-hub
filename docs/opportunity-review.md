# Offline opportunity review

The opportunity watcher persists normalized discovery signals in `<COMMERCE_STATE_ROOT>/opportunities.jsonl`. Those raw signals are intentionally durable even though the watcher only prints triage for newly observed items.

`opportunities:review` makes that state useful later without touching Reddit or any other network source. It re-runs deterministic triage over persisted listings under the selected profile, so missed watcher output can be recovered and the same listings can be re-ranked after profile changes.

From `tools/hermes-commerce-control`:

```bash
npm run opportunities:review
```

The default review uses the `demand` profile and returns `candidate` plus `review` rows. Useful variants:

```bash
npm run opportunities:review -- --profile automation-demand --limit 50
npm run opportunities:review -- --decision candidate --json
npm run opportunities:review -- --decision all --profile all
```

After `npm run build`:

```bash
npm run opportunities:review:built -- --decision candidate
```

The review command is offline and read-only. It performs no HTTP request, model call, Reddit login, posting, messaging, task claim, or payment action. Changing profiles does not rewrite the stored opportunity records; triage is computed as a view over the durable discovery state.
