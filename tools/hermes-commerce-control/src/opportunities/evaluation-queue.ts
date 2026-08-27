import { canonicalHash } from "../core/ids.js";
import {
  buildOpportunityEvaluationPacket,
  buildOpportunityEvaluationPrompt,
  type OpportunityEvaluationPacket,
} from "./evaluation.js";
import type { OpportunityStore } from "./store.js";
import type { OpportunityTriageDecision, OpportunityTriageProfile } from "./triage.js";
import { reviewStoredOpportunities } from "./review.js";

export interface PreparedOpportunityEvaluation {
  /** Stable request identity derived from the bounded packet, not wall-clock time. */
  readonly requestId: string;
  readonly opportunityId: string;
  readonly triageDecision: OpportunityTriageDecision;
  readonly triageScore: number;
  readonly packet: OpportunityEvaluationPacket;
  readonly prompt: string;
}

export interface OpportunityEvaluationQueueOptions {
  readonly decisions?: readonly OpportunityTriageDecision[] | undefined;
  readonly minimumScore?: number | undefined;
  readonly limit?: number | undefined;
  readonly scanLimit?: number | undefined;
}

export function buildPreparedOpportunityEvaluation(
  packet: OpportunityEvaluationPacket,
): PreparedOpportunityEvaluation {
  const requestId = `evalreq_${canonicalHash(packet).slice(0, 32)}`;
  return Object.freeze({
    requestId,
    opportunityId: packet.opportunity.id,
    triageDecision: packet.triage.decision,
    triageScore: packet.triage.score,
    packet,
    prompt: buildOpportunityEvaluationPrompt(packet),
  });
}

/**
 * Prepare bounded, provider-neutral model requests from durable opportunity state.
 *
 * This stage never calls a model. It is intentionally safe to run before a local
 * provider/coordinator is configured, and its stable request IDs let a later
 * runtime deduplicate evaluation work without coupling this package to a provider.
 */
export async function prepareOpportunityEvaluationQueue(
  store: OpportunityStore,
  profile: OpportunityTriageProfile = {},
  options: OpportunityEvaluationQueueOptions = {},
): Promise<readonly PreparedOpportunityEvaluation[]> {
  const decisions = options.decisions ?? (["candidate", "review"] as const);
  const scanLimit = Math.max(1, Math.min(10_000, Math.trunc(options.scanLimit ?? 1_000)));
  const outputLimit = Math.max(0, Math.min(scanLimit, Math.trunc(options.limit ?? 50)));
  if (outputLimit === 0) return Object.freeze([]);

  const reviewed = await reviewStoredOpportunities(store, profile, {
    decisions,
    limit: scanLimit,
    scanLimit,
  });
  const minimumScore = Math.max(0, Math.min(100, options.minimumScore ?? 0));
  const out: PreparedOpportunityEvaluation[] = [];
  for (const entry of reviewed) {
    if (entry.triage.score < minimumScore) continue;
    const packet = buildOpportunityEvaluationPacket(entry.opportunity, entry.triage);
    out.push(buildPreparedOpportunityEvaluation(packet));
    if (out.length >= outputLimit) break;
  }
  return Object.freeze(out);
}
