# Opportunity runtime proof

This is the first opportunity-ingestion task that genuinely belongs to the local runtime rather than GitHub implementation.

Use a clean local `agent-commerce-hub` checkout based on canonical `main`. Do **not** use the Render-linked production branch as the development/runtime-proof baseline.

```bash
git fetch origin
git switch main
git pull --ff-only origin main
cd tools/hermes-commerce-control
npm ci
npm run opportunities:watch -- --subreddit forhire --subreddit slavelabour --profile demand --limit 25 --json
```

A successful live-source proof requires all of the following:

- process exit code `0`;
- top-level `ok: true`;
- `sourceHealth.ok: true`;
- `sources.reddit_rss.status: "ok"`;
- no Reddit OAuth/API key, login, paid proxy, posting, commenting, messaging, claiming, or payment action;
- a writable local opportunity state path is reported.

`count: 0` is **not** a failure when the source status is `ok`; it only means the current feed produced no new persisted listings after deduplication. Conversely, an unreachable/degraded-only source exits non-zero and reports `ok: false`, so an outage cannot be mistaken for an empty healthy pass.

After a successful watcher pass, the same local state can be inspected without another Reddit request:

```bash
npm run opportunities:review -- --decision candidate --decision review --limit 25 --json
npm run opportunities:prepare-evaluation -- --decision candidate --decision review --limit 10 --json
```

The second and third commands are offline. Evaluation preparation does not call a model; it only produces stable bounded packets/prompts. The repository already contains an explicit loopback-only local evaluator (`opportunities:evaluate-local`), but that is a separate proof step and should not be conflated with proving live ingestion itself.

If the live watcher fails, capture the exact exit code plus the JSON `sourceHealth`/`sources` fields and the stderr message. Do not add OAuth, a paid Reddit proxy, browser scraping, or a workaround before the failure is diagnosed.

A repository/CI test pass is not evidence that this live-network proof has occurred. Record the local proof separately when it is actually run.
