#!/usr/bin/env node
/**
 * Minimal read-only opportunity watcher entry point.
 *
 * Development:
 *   node --import tsx src/opportunities/cli.ts --subreddit forhire --subreddit slavelabour
 *
 * Built:
 *   node dist/opportunities/cli.js --subreddit forhire --subreddit slavelabour
 *
 * It performs no Reddit login, OAuth, posting, commenting, messaging, or paid API
 * call. The only write is the local JSONL seen/opportunity store.
 */
import { parseArgs } from "node:util";
import { join, resolve } from "node:path";
import { loadConfig } from "../config.js";
import { createSafeFetch } from "../network/safe-fetch.js";
import { RedditRssOpportunityAdapter } from "./adapters/reddit-rss.js";
import { OpportunityIngestor } from "./ingest.js";
import { discoverAndPersist } from "./pipeline.js";
import { JsonlOpportunityStore } from "./store.js";

const HELP = `Permanent-free Reddit opportunity watcher

Usage:
  node --import tsx src/opportunities/cli.ts [options]

Options:
  -s, --subreddit <name>   subreddit to watch (repeatable)
  -q, --query <text>       local title/body substring filter
      --limit <n>          max new results returned from the feed
      --state-file <path>  JSONL store (default: <COMMERCE_STATE_ROOT>/opportunities.jsonl)
      --json               emit one JSON document
      --help

Environment fallback:
  OPPORTUNITY_REDDIT_SUBREDDITS=forhire,slavelabour

The source is Reddit's public Atom/RSS feed. RSS is treated as a replaceable
adapter, not a guaranteed long-term dependency.
`;

function parseLimit(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) throw new Error("--limit must be a positive integer");
  return Math.min(100, value);
}

function envSubreddits(): string[] {
  return (process.env.OPPORTUNITY_REDDIT_SUBREDDITS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    allowPositionals: false,
    strict: true,
    options: {
      subreddit: { type: "string", short: "s", multiple: true },
      query: { type: "string", short: "q" },
      limit: { type: "string" },
      "state-file": { type: "string" },
      json: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help === true) {
    process.stdout.write(HELP);
    return;
  }

  const subreddits = values.subreddit ?? envSubreddits();
  if (subreddits.length === 0) {
    throw new Error(
      "no subreddits configured; pass --subreddit or set OPPORTUNITY_REDDIT_SUBREDDITS",
    );
  }

  const config = loadConfig(process.env);
  const stateFile = resolve(values["state-file"] ?? join(config.stateRoot, "opportunities.jsonl"));
  const safeFetch = createSafeFetch(config, {
    userAgent: "hermes-commerce-control/0.1.0 opportunity-rss (read-only)",
  });
  const adapter = new RedditRssOpportunityAdapter({ subreddits });
  const ingestor = new OpportunityIngestor(safeFetch, [adapter], {
    adapterBudgetMs: config.network.adapterBudgetMs,
    concurrency: config.concurrency,
  });
  const store = new JsonlOpportunityStore(stateFile);
  const limit = parseLimit(values.limit);
  const result = await discoverAndPersist(ingestor, store, {
    ...(values.query === undefined ? {} : { q: values.query }),
    ...(limit === undefined ? {} : { limit }),
  });

  const output = {
    ok: true,
    mode: "read-only",
    source: "reddit_rss",
    subreddits,
    stateFile,
    count: result.results.length,
    persisted: result.persisted,
    duplicatesDropped: result.duplicatesDropped,
    sources: result.sources,
    results: result.results,
  };

  if (values.json === true) {
    process.stdout.write(`${JSON.stringify(output)}\n`);
    return;
  }

  process.stdout.write(
    [
      `Reddit RSS opportunity pass: ${String(result.results.length)} new, ` +
        `${String(result.duplicatesDropped)} duplicate(s) dropped`,
      `watched: ${subreddits.map((value) => `r/${value.replace(/^r\//i, "")}`).join(", ")}`,
      `state: ${stateFile}`,
      ...result.results.map(
        (candidate) =>
          `- ${candidate.community === undefined ? "reddit" : `r/${candidate.community}`}: ` +
          `${candidate.title}${candidate.url === undefined ? "" : ` — ${candidate.url}`}`,
      ),
    ].join("\n") + "\n",
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`opportunity watcher failed: ${message}\n`);
  process.exitCode = 1;
});
