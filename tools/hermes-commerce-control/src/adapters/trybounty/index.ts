/**
 * TryBounty public marketplace scanner.
 *
 * The public homepage currently exposes recent bounty cards without requiring an
 * account. The platform states that posters fund rewards through escrow and that
 * an oracle validates submissions before release. This adapter uses only GET /
 * and records those claims as observed evidence; it does not infer independent
 * settlement proof.
 *
 * Agent onboarding, the solver claim/submission API, payout rail, entry cost,
 * and identity/KYC requirements are not documented on the public pages we have
 * verified. Accordingly this adapter is discovery-only: no prepareClaim and no
 * write path exist here.
 */
import { createHash } from "node:crypto";
import { capabilities, type AdapterCapabilities } from "../../core/capabilities.js";
import { CommerceError } from "../../core/errors.js";
import { canonicalWorkId } from "../../core/ids.js";
import { modeAWorkActionability, type ProbeResult, type WorkCandidate } from "../../core/models.js";
import type { AdapterContext, CommerceAdapter, WorkQuery } from "../interface.js";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;

const CATEGORIES = new Set([
  "Sales & Lead Generation",
  "Research & Competitive Intelligence",
  "AI Automation & Product Building",
  "Hiring & Recruiting",
  "Content & Media",
  "Other",
]);

const PAYMENT_PROOF_RULE =
  "TryBounty publicly states that posters fund bounties through escrow and that funds are released " +
  "after oracle validation. This read-only adapter does not independently verify settlement, so " +
  "funding evidence remains observed.";

export interface TryBountyCard {
  readonly externalId: string;
  readonly rewardUsd: string;
  readonly category: string;
  readonly title: string;
  readonly age: string;
  readonly completed: boolean;
  readonly completedBy?: string | undefined;
}

function decodeEntities(text: string): string {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&nbsp;", " ")
    .replace(/&#(\d+);/g, (_match, raw: string) => String.fromCodePoint(Number(raw)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, raw: string) => String.fromCodePoint(Number.parseInt(raw, 16)));
}

/** Converts server-rendered HTML into stable visible-text tokens. */
export function visibleTextTokens(html: string): string[] {
  const withoutNoise = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ");
  const text = decodeEntities(
    withoutNoise
      .replace(/<\/(?:h[1-6]|p|div|li|section|article|span|a|button)>/gi, "\n")
      .replace(/<(?:br|hr)\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
  return text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line !== "");
}

function stableExternalId(title: string, category: string, rewardUsd: string): string {
  return createHash("sha256")
    .update(`${title}\u0000${category}\u0000${rewardUsd}`)
    .digest("hex")
    .slice(0, 24);
}

function rewardOf(token: string): string | null {
  const match = /^\$([0-9]+(?:\.[0-9]{1,2})?)$/.exec(token.trim());
  if (match?.[1] === undefined) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0) return null;
  return value.toFixed(2).replace(/\.00$/, "");
}

function isAge(token: string): boolean {
  return /^\d+(?:m|h|d|w|mo)y? ago$/i.test(token) || /^\d+y ago$/i.test(token);
}

function ignored(token: string): boolean {
  return (
    token === "Post bounty" ||
    token === "Post a bounty" ||
    token.startsWith("Have something you need done?") ||
    token === "Marketplace" ||
    token === "Company"
  );
}

/** Parses only the Recent Jobs section; marketing examples above it are ignored. */
export function parseRecentJobs(html: string): TryBountyCard[] {
  const tokens = visibleTextTokens(html);
  const recentIndex = tokens.findIndex((token) => token === "Recent Jobs");
  if (recentIndex < 0) return [];

  const out: TryBountyCard[] = [];
  let i = recentIndex + 1;
  while (i < tokens.length && out.length < MAX_LIMIT) {
    const rewardUsd = rewardOf(tokens[i] ?? "");
    if (rewardUsd === null) {
      i += 1;
      continue;
    }

    let cursor = i + 1;
    while (cursor < tokens.length && ignored(tokens[cursor] ?? "")) cursor += 1;
    const category = tokens[cursor] ?? "";
    if (!CATEGORIES.has(category)) {
      i += 1;
      continue;
    }
    cursor += 1;
    while (cursor < tokens.length && ignored(tokens[cursor] ?? "")) cursor += 1;
    const title = tokens[cursor] ?? "";
    if (title === "" || rewardOf(title) !== null || CATEGORIES.has(title)) {
      i += 1;
      continue;
    }
    cursor += 1;
    while (cursor < tokens.length && ignored(tokens[cursor] ?? "")) cursor += 1;
    const age = tokens[cursor] ?? "";
    if (!isAge(age)) {
      i += 1;
      continue;
    }

    let completedBy: string | undefined;
    const afterAge = tokens[cursor + 1] ?? "";
    if (/^Completed by\b/i.test(afterAge)) completedBy = afterAge.replace(/^Completed by\s*/i, "").trim();

    out.push({
      externalId: stableExternalId(title, category, rewardUsd),
      rewardUsd,
      category,
      title,
      age,
      completed: completedBy !== undefined,
      ...(completedBy === undefined ? {} : { completedBy }),
    });
    i = cursor + (completedBy === undefined ? 1 : 2);
  }
  return out;
}

export function normalizeCard(
  card: TryBountyCard,
  context: AdapterContext,
  sourceUrl: string,
): WorkCandidate {
  const observedAt = context.clock();
  context.evidence.observe("reward_usd", card.rewardUsd, "docs", sourceUrl);
  context.evidence.observe("job_state", card.completed ? "completed" : "recent_open", "docs", sourceUrl);
  context.evidence.infer("verifier_type", "ai_oracle", "docs", sourceUrl);
  context.evidence.infer("payment_proof_rule", PAYMENT_PROOF_RULE, "docs", sourceUrl);

  return {
    id: canonicalWorkId({ source: "trybounty", externalId: card.externalId }),
    kind: "work",
    source: "trybounty",
    externalId: card.externalId,
    title: card.title,
    description: `TryBounty public recent-job card; category ${card.category}; listed ${card.age}`,
    url: sourceUrl,
    reward: { amount: card.rewardUsd, asset: "USD", usd: card.rewardUsd },
    funding: {
      state: card.completed ? "settled" : "funded",
      evidence: "observed",
    },
    verification: {
      type: "ai_oracle",
      description: "TryBounty states that an oracle validates submissions against predefined requirements",
    },
    requirements: [
      `category: ${card.category}`,
      "full acceptance criteria are not present on the public homepage card",
      ...(card.completedBy === undefined ? [] : [`completed by ${card.completedBy}`]),
    ],
    status: card.completed ? "closed" : "open",
    paymentProofRule: PAYMENT_PROOF_RULE,
    observedAt,
    evidence: context.evidence.records(),
    actionability: modeAWorkActionability({ canPrepareClaim: false }),
  };
}

export class TryBountyAdapter implements CommerceAdapter {
  public readonly id = "trybounty" as const;

  public constructor(private readonly baseUrl = "https://trybounty.ai/") {}

  public capabilities(): AdapterCapabilities {
    return capabilities({
      discoverWork: true,
      inspect: true,
      walletless: true,
      notes: [
        "public homepage GET only",
        "escrow and oracle claims are observed, not independently verified",
        "agent onboarding, payout rail, entry cost and identity requirements remain unresolved",
        "no claim or submission endpoint is called or inferred",
      ],
    });
  }

  public async health(context?: AdapterContext): Promise<ProbeResult> {
    const checkedAt = context?.clock() ?? new Date().toISOString();
    if (context === undefined) return { platform: this.id, status: "degraded", checkedAt, detail: "no context" };
    const started = Date.now();
    try {
      const response = await context.fetch.text(this.baseUrl);
      const jobs = parseRecentJobs(response.text);
      if (!response.text.includes("Recent Jobs")) {
        return {
          platform: this.id,
          status: "degraded",
          checkedAt,
          latencyMs: Date.now() - started,
          detail: "homepage reachable but Recent Jobs marker was not found",
        };
      }
      return {
        platform: this.id,
        status: "ok",
        checkedAt,
        latencyMs: Date.now() - started,
        detail: `public marketplace reachable; parsed ${String(jobs.length)} recent job card(s)`,
      };
    } catch (error) {
      const typed = error instanceof CommerceError ? error : null;
      return {
        platform: this.id,
        status: "unreachable",
        checkedAt,
        latencyMs: Date.now() - started,
        detail: typed?.message ?? String(error),
        errorCode: typed?.code ?? "UPSTREAM_UNAVAILABLE",
      };
    }
  }

  public async discoverWork(query: WorkQuery, context: AdapterContext): Promise<WorkCandidate[]> {
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const response = await context.fetch.text(this.baseUrl);
    if (!response.text.includes("Recent Jobs")) {
      throw new CommerceError("UPSTREAM_MALFORMED", "TryBounty homepage has no Recent Jobs section");
    }
    const q = query.q?.trim().toLowerCase();
    const minimum = query.minReward === undefined ? null : Number(query.minReward);
    return parseRecentJobs(response.text)
      .filter((card) => {
        if (q !== undefined && q !== "") {
          const haystack = `${card.title}\n${card.category}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        if (minimum !== null && Number.isFinite(minimum) && Number(card.rewardUsd) < minimum) return false;
        return true;
      })
      .slice(0, limit)
      .map((card) => normalizeCard(card, context, response.url));
  }

  public async inspect(externalId: string, context: AdapterContext) {
    const response = await context.fetch.text(this.baseUrl);
    const card = parseRecentJobs(response.text).find((item) => item.externalId === externalId);
    if (card === undefined) throw new CommerceError("NOT_FOUND", `no TryBounty recent job matched ${externalId}`);
    const work = normalizeCard(card, context, response.url);
    return {
      platform: this.id,
      externalId,
      inspectedAt: context.clock(),
      work,
      evidence: context.evidence.records(),
    };
  }
}
