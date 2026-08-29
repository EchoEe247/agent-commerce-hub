/**
 * Agent Bounties earning adapter.
 *
 * Read path confirmed against the live public API on 2026-08-19:
 *   GET /v1/base/autonomous-bounties/inventory-summary?network&claimable_only
 * This is a bounded, non-streaming snapshot, so it is preferred over
 * /v1/opportunities/stream (SSE). No connection is held open.
 *
 * The platform's own llms.txt states the settlement rule this adapter enforces:
 * "Only canonical events establish bounty state. Only `BountySettled` proves
 * bounty payment." Accordingly, funding evidence tops out at `observed` here. A
 * status string of "settled", a `paid: true` flag, or a leaderboard rank is NOT
 * accepted as proof; only a matching canonical BountySettled event would be, and
 * verifying one is outside this adapter's read surface.
 *
 * The API exposes many POST *-plan and claim/submission endpoints. None is
 * called. prepareClaim assembles a local draft describing the external steps and
 * requests EXTERNAL_WRITE, which Mode-A policy blocks.
 */
import { capabilities, type AdapterCapabilities } from "../../core/capabilities.js";
import { CommerceError } from "../../core/errors.js";
import { canonicalWorkId } from "../../core/ids.js";
import { atomicToDecimalString } from "../../core/money.js";
import {
  modeAWorkActionability,
  type FundingState,
  type ProbeResult,
  type VerifierType,
  type WorkCandidate,
  type WorkStatus,
} from "../../core/models.js";
import type { AdapterContext, CommerceAdapter, WorkQuery } from "../interface.js";

const USDC_DECIMALS = 6;

/** The authoritative payment-proof rule, recorded on every candidate. */
export const PAYMENT_PROOF_RULE =
  "Only a canonical BountySettled event matching the bounty, recipient, amount, artifact and " +
  "evidence commitments proves payment. Status strings, paid flags and leaderboard rank do not.";

/** Maps a platform status string onto the canonical work status. */
export function mapStatus(raw: unknown): WorkStatus {
  switch (String(raw ?? "").trim().toLowerCase()) {
    case "open":
    case "claimable":
      return "open";
    case "claimed":
      return "claimed";
    case "submitted":
    case "in_review":
    case "verifying":
      return "in_review";
    case "settled":
    case "paid":
    case "refunded":
    case "cancelled":
    case "expired":
      return "closed";
    default:
      return "unknown";
  }
}

/**
 * Maps a platform status onto the canonical funding state.
 *
 * These are deliberately distinct axes: a bounty can be advertised without being
 * funded, and settled without this adapter having proof it was.
 */
export function mapFundingState(raw: unknown, fundedAtomic: string | undefined): FundingState {
  const status = String(raw ?? "").trim().toLowerCase();
  const funded = fundedAtomic !== undefined && /^\d+$/.test(fundedAtomic) && BigInt(fundedAtomic) > 0n;
  switch (status) {
    case "open":
      return funded ? "funded" : "advertised";
    case "claimable":
      return funded ? "funded" : "advertised";
    case "claimed":
      return "claimed";
    case "submitted":
    case "in_review":
    case "verifying":
      return "submitted";
    case "settled":
    case "paid":
      return "settled";
    case "refunded":
      return "refunded";
    default:
      return funded ? "funded" : "unknown";
  }
}

/**
 * Classifies the verifier.
 *
 * The platform commits an executable verifier policy per bounty and instructs a
 * solver to "run the verifier named by the job", so verification_ready=true
 * indicates a deterministic, verifier-ready check rather than an opaque oracle.
 * This is a derivation from an observed flag, so callers record it as inferred.
 */
export function mapVerifier(verificationReady: unknown): {
  type: VerifierType;
  description: string;
} {
  if (verificationReady === true) {
    return {
      type: "deterministic",
      description:
        "verification_ready=true: the bounty commits an executable verifier policy that a solver " +
        "runs and whose exact settlement call is relayed",
    };
  }
  return {
    type: "unknown",
    description: "verification_ready is not true; the verifier policy is not established",
  };
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function atomic(value: unknown): string | undefined {
  const s = str(value);
  return s !== undefined && /^\d+$/.test(s) ? s : undefined;
}

interface InventoryItem {
  readonly bounty_id?: unknown;
  readonly bounty_contract?: unknown;
  readonly title?: unknown;
  readonly status?: unknown;
  readonly funded_usdc_base_units?: unknown;
  readonly solver_reward_usdc_base_units?: unknown;
  readonly verifier_reward_usdc_base_units?: unknown;
  readonly verification_ready?: unknown;
  readonly standing_meta_bounty?: unknown;
}

export function normalizeBounty(
  item: InventoryItem,
  context: AdapterContext,
  sourceUrl: string,
  network: string,
): WorkCandidate | null {
  const bountyId = str(item.bounty_id);
  if (bountyId === undefined) return null;

  const solverAtomic = atomic(item.solver_reward_usdc_base_units);
  const fundedAtomic = atomic(item.funded_usdc_base_units);
  if (solverAtomic === undefined) {
    // Without a trustworthy reward we cannot rank or prepare a claim honestly.
    context.evidence.tentative(
      "reward",
      `bounty ${bountyId} did not advertise a usable solver reward`,
      "http_api",
      sourceUrl,
    );
    return null;
  }

  const rewardDecimal = atomicToDecimalString(solverAtomic, USDC_DECIMALS);
  const status = mapStatus(item.status);
  const fundingState = mapFundingState(item.status, fundedAtomic);
  const verifier = mapVerifier(item.verification_ready);
  const observedAt = context.clock();
  const title = str(item.title) ?? `bounty ${bountyId}`;
  const contract = str(item.bounty_contract);

  context.evidence.observe("bounty_status", String(item.status ?? "unknown"), "http_api", sourceUrl);
  context.evidence.observe("solver_reward_atomic", solverAtomic, "http_api", sourceUrl);
  if (fundedAtomic !== undefined) {
    context.evidence.observe("funded_atomic", fundedAtomic, "http_api", sourceUrl);
  }
  context.evidence.infer("verifier_type", verifier.type, "http_api", sourceUrl);
  // The settlement rule itself is an inferred constraint, recorded so a reviewer
  // can see why funding never reaches `verified` on this path.
  context.evidence.infer("payment_proof_rule", PAYMENT_PROOF_RULE, "docs", `${sourceUrl}#llms.txt`);

  const requirements = [
    verifier.description,
    ...(item.standing_meta_bounty === true ? ["standing meta bounty"] : []),
    ...(contract === undefined ? [] : [`bounty contract ${contract}`]),
  ];

  return {
    id: canonicalWorkId({ source: "agent_bounties", externalId: bountyId }),
    kind: "work",
    source: "agent_bounties",
    externalId: bountyId,
    title,
    description: verifier.description,
    ...(contract === undefined
      ? {}
      : { url: `https://api.agentbounties.app/v1/bounties/${bountyId}` }),
    reward: {
      amount: rewardDecimal,
      asset: "USDC",
      network,
      // USDC is USD-parity, so a USD figure here is a fact rather than a guess.
      usd: rewardDecimal,
    },
    funding: {
      state: fundingState,
      // Capped at observed: only a canonical BountySettled event would justify
      // `verified`, and this read surface does not establish one.
      evidence: "observed",
    },
    verification: { type: verifier.type, description: verifier.description },
    requirements,
    status,
    paymentProofRule: PAYMENT_PROOF_RULE,
    observedAt,
    evidence: context.evidence.records(),
    actionability: modeAWorkActionability({
      canPrepareClaim: status === "open" && fundingState === "funded",
    }),
  };
}

export class AgentBountiesAdapter implements CommerceAdapter {
  public readonly id = "agent_bounties" as const;

  public constructor(
    private readonly baseUrl: string,
    private readonly network = "base-mainnet",
  ) {}

  public capabilities(): AdapterCapabilities {
    return capabilities({
      discoverWork: true,
      inspect: true,
      prepareClaim: true,
      walletless: true,
      notes: [
        "bounded non-streaming inventory-summary snapshot; SSE stream is not held open",
        "funding evidence capped at observed; only a canonical BountySettled event proves payment",
        "never calls claim, submission, plan or settlement endpoints",
      ],
    });
  }

  public async health(context?: AdapterContext): Promise<ProbeResult> {
    const checkedAt = context?.clock() ?? new Date().toISOString();
    if (context === undefined) {
      return { platform: this.id, status: "degraded", checkedAt, detail: "no context" };
    }
    const started = Date.now();
    try {
      const body = await context.fetch.json<Record<string, unknown>>(this.inventoryUrl());
      const items = Array.isArray(body.items) ? body.items : [];
      const claimable = Number(body.claimable_bounty_count ?? items.length);
      return {
        platform: this.id,
        status: "ok",
        checkedAt,
        latencyMs: Date.now() - started,
        // Zero claimable work is a healthy, truthful outcome.
        detail: `inventory reachable; ${String(claimable)} claimable bounty/bounties`,
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
    const url = this.inventoryUrl();
    const body = await context.fetch.json<Record<string, unknown>>(url);
    if (!Array.isArray(body.items)) {
      throw new CommerceError(
        "UPSTREAM_MALFORMED",
        "Agent Bounties inventory-summary returned no items array",
      );
    }

    const out: WorkCandidate[] = [];
    for (const raw of body.items) {
      if (raw === null || typeof raw !== "object") continue;
      const candidate = normalizeBounty(raw as InventoryItem, context, url, this.network);
      if (candidate === null) continue;
      out.push(candidate);
      if (query.limit !== undefined && out.length >= query.limit) break;
    }
    return out;
  }

  public async inspect(
    externalId: string,
    context: AdapterContext,
  ): Promise<import("../../core/models.js").InspectionResult> {
    const all = await this.discoverWork({}, context);
    const match = all.find((w) => w.externalId === externalId || w.id === externalId);
    if (match === undefined) {
      throw new CommerceError("NOT_FOUND", `no Agent Bounties bounty matched ${externalId}`);
    }
    return {
      platform: this.id,
      externalId,
      inspectedAt: context.clock(),
      work: match,
      evidence: context.evidence.records(),
    };
  }

  /**
   * Assembles a local claim draft.
   *
   * Performs no POST. The external steps are described so a future Stage-B1
   * operator (or a human) can see exactly what would be required, but nothing is
   * broadcast, signed or submitted.
   */
  public async prepareClaim(
    externalId: string,
    context: AdapterContext,
  ): Promise<Record<string, unknown>> {
    const inspection = await this.inspect(externalId, context);
    const work = inspection.work;
    if (work === undefined) {
      throw new CommerceError("NOT_FOUND", `no claimable bounty for ${externalId}`);
    }
    return {
      platform: this.id,
      bountyId: work.externalId,
      title: work.title,
      reward: work.reward,
      funding: work.funding,
      verification: work.verification,
      requirements: work.requirements,
      paymentProofRule: work.paymentProofRule ?? PAYMENT_PROOF_RULE,
      externalStepsRequired: [
        "POST a claim plan and sign it with a Base wallet",
        "execute the committed execution policy and produce the required artifact",
        "POST submission evidence bound to the committed terms hash",
        "run the named verifier and relay its exact settlement call",
        "confirm a canonical BountySettled event before treating payment as real",
      ],
      claimBroadcast: false,
      submissionBroadcast: false,
      signerPresent: false,
      blockedReason: "EXTERNAL_WRITE_DISABLED",
    };
  }

  private inventoryUrl(): string {
    const url = new URL("/v1/base/autonomous-bounties/inventory-summary", this.baseUrl);
    url.searchParams.set("network", this.network);
    url.searchParams.set("claimable_only", "false");
    return url.toString();
  }
}
