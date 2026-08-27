import { canonicalHash } from "../core/ids.js";
import type { OpportunityOperatorPreparationPacket } from "./operator-packet.js";

export const PURSUIT_DOSSIER_STATUSES = [
  "blocked_on_checks",
  "operator_review_required",
  "ready_for_pursuit_decision",
] as const;
export type PursuitDossierStatus = (typeof PURSUIT_DOSSIER_STATUSES)[number];

export const PURSUIT_CONTACT_BRIEF_STATUSES = [
  "clarification_draft_ready",
  "operator_draft_ready",
] as const;
export type PursuitContactBriefStatus = (typeof PURSUIT_CONTACT_BRIEF_STATUSES)[number];

export interface OpportunityPursuitDossier {
  readonly schemaVersion: 1;
  readonly dossierId: string;
  readonly sourcePacketId: string;
  readonly opportunity: OpportunityOperatorPreparationPacket["opportunity"];
  readonly status: PursuitDossierStatus;
  readonly safeNextStep: "resolve_checks" | "review_dossier" | "decide_whether_to_prepare_contact";
  readonly ranking: OpportunityOperatorPreparationPacket["ranking"];
  readonly economics: {
    readonly payout: OpportunityOperatorPreparationPacket["assessment"]["economics"]["payout"];
    readonly executionCost: OpportunityOperatorPreparationPacket["assessment"]["economics"]["executionCost"];
    readonly margin: OpportunityOperatorPreparationPacket["assessment"]["economics"]["margin"];
    readonly payoutKnown: boolean;
    readonly executionCostKnown: boolean;
    readonly marginKnown: boolean;
  };
  readonly executionPlan: {
    readonly route: OpportunityOperatorPreparationPacket["ranking"]["executionRoute"];
    readonly aiCanComplete: boolean;
    readonly humanRequired: boolean;
    readonly physicalPresence: boolean;
    readonly estimatedEffortMinutes: number | null;
    readonly preparationSteps: readonly string[];
  };
  readonly verification: {
    readonly requiredChecks: readonly string[];
    readonly checkCount: number;
    readonly blocking: boolean;
  };
  readonly contactBrief: {
    readonly status: PursuitContactBriefStatus;
    readonly intent: "clarify_before_commitment" | "express_interest_without_commitment";
    readonly sourceTitle: string;
    readonly sourceUrl?: string | undefined;
    readonly talkingPoints: readonly string[];
    readonly clarificationItems: readonly string[];
    readonly draftGuidance: readonly string[];
    readonly sendAllowed: false;
  };
  readonly boundary: OpportunityOperatorPreparationPacket["boundary"];
}

function uniqueNonEmpty(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (value === "") continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return Object.freeze(out);
}

function dossierStatus(packet: OpportunityOperatorPreparationPacket): {
  readonly status: PursuitDossierStatus;
  readonly safeNextStep: OpportunityPursuitDossier["safeNextStep"];
} {
  if (packet.requiredChecks.length > 0 || packet.readiness === "needs_checks") {
    return Object.freeze({
      status: "blocked_on_checks" as const,
      safeNextStep: "resolve_checks" as const,
    });
  }
  if (packet.readiness === "needs_operator_review" || packet.ranking.operatorAction === "manual_review") {
    return Object.freeze({
      status: "operator_review_required" as const,
      safeNextStep: "review_dossier" as const,
    });
  }
  return Object.freeze({
    status: "ready_for_pursuit_decision" as const,
    safeNextStep: "decide_whether_to_prepare_contact" as const,
  });
}

function executionPreparationSteps(packet: OpportunityOperatorPreparationPacket): readonly string[] {
  const steps: string[] = [
    "Confirm the exact deliverables and acceptance criteria before making any commitment.",
    "Confirm the expected timeline or turnaround before making any commitment.",
  ];
  switch (packet.ranking.executionRoute) {
    case "ai_direct":
      steps.push("Define the AI-deliverable artifact, verification method, and operator QA gate before execution.");
      break;
    case "human_remote":
      steps.push("Identify a suitable remote executor, confirm availability/cost, and define a QA handoff before commitment.");
      break;
    case "human_physical":
      steps.push("Confirm exact location/logistics, identify a suitable physical executor, and calculate travel/execution cost before commitment.");
      break;
    case "hybrid":
      steps.push("Split the work into AI and human responsibilities, then define handoff and QA criteria for each part.");
      break;
    case "manual":
      steps.push("Keep execution operator-controlled until scope, responsibility, and acceptance criteria are fully established.");
      break;
    case "unknown":
      steps.push("Determine the real execution route before any pursuit decision.");
      break;
  }
  return uniqueNonEmpty([...steps, ...packet.deliveryConsiderations]);
}

function boundedPoint(value: string, max = 220): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, Math.max(0, max - 1))}…`;
}

function contactBrief(packet: OpportunityOperatorPreparationPacket): OpportunityPursuitDossier["contactBrief"] {
  const hasChecks = packet.requiredChecks.length > 0;
  const talkingPoints = uniqueNonEmpty([
    ...packet.assessment.reasons.map((reason) => boundedPoint(reason)),
    `Current execution route: ${packet.ranking.executionRoute}.`,
    `Current risk assessment: ${packet.assessment.risk}.`,
  ]).slice(0, 8);
  const clarificationItems = Object.freeze(packet.requiredChecks.map((check) => boundedPoint(check)).slice(0, 12));
  const guidance = hasChecks
    ? [
        "Reference the source listing and ask only for the unresolved facts needed to decide fit.",
        "Do not promise price, timing, delivery, acceptance, or availability while required checks remain unresolved.",
        "Do not mention automated discovery, model scoring, internal risk labels, or internal execution routing.",
        "Keep any future message concise and non-committal until the operator explicitly approves contact.",
      ]
    : [
        "Reference the source listing and state interest without implying that work has already been accepted.",
        "State only capabilities and economics that have actually been verified.",
        "Confirm deliverables, timeline, and acceptance criteria before any commitment.",
        "Do not mention automated discovery, model scoring, internal risk labels, or internal execution routing.",
      ];
  return Object.freeze({
    status: hasChecks ? "clarification_draft_ready" as const : "operator_draft_ready" as const,
    intent: hasChecks ? "clarify_before_commitment" as const : "express_interest_without_commitment" as const,
    sourceTitle: packet.opportunity.title,
    ...(packet.opportunity.url === undefined ? {} : { sourceUrl: packet.opportunity.url }),
    talkingPoints,
    clarificationItems,
    draftGuidance: Object.freeze(guidance),
    sendAllowed: false as const,
  });
}

/**
 * Build an offline, operator-facing pursuit dossier from a current preparation packet.
 * No network/model call or external mutation occurs here. The dossier can prepare a
 * future contact brief, but it can never authorize or send one.
 */
export function buildOpportunityPursuitDossier(
  packet: OpportunityOperatorPreparationPacket,
): OpportunityPursuitDossier {
  if (packet.ranking.evaluationFreshness !== "current") {
    throw new Error("pursuit dossier requires a current evaluation");
  }
  if (packet.boundary.externalActionsAllowed !== false) {
    throw new Error("pursuit dossier requires external actions to remain disabled");
  }

  const state = dossierStatus(packet);
  const economics = packet.assessment.economics;
  const dossierId = `opdos_${canonicalHash({
    schemaVersion: 1,
    packetId: packet.packetId,
    currentRequestId: packet.ranking.currentRequestId,
    evaluatorId: packet.ranking.evaluatorId,
    evaluatedAt: packet.ranking.evaluatedAt,
    readiness: packet.readiness,
    requiredChecks: packet.requiredChecks,
    score: packet.ranking.score,
  }).slice(0, 32)}`;

  return Object.freeze({
    schemaVersion: 1 as const,
    dossierId,
    sourcePacketId: packet.packetId,
    opportunity: packet.opportunity,
    status: state.status,
    safeNextStep: state.safeNextStep,
    ranking: packet.ranking,
    economics: Object.freeze({
      payout: economics.payout,
      executionCost: economics.executionCost,
      margin: economics.margin,
      payoutKnown: economics.payout !== null,
      executionCostKnown: economics.executionCost !== null,
      marginKnown: economics.margin !== null,
    }),
    executionPlan: Object.freeze({
      route: packet.ranking.executionRoute,
      aiCanComplete: packet.assessment.capabilities.aiCanComplete,
      humanRequired: packet.assessment.capabilities.humanRequired,
      physicalPresence: packet.assessment.capabilities.physicalPresence,
      estimatedEffortMinutes: packet.assessment.estimatedEffortMinutes,
      preparationSteps: executionPreparationSteps(packet),
    }),
    verification: Object.freeze({
      requiredChecks: packet.requiredChecks,
      checkCount: packet.requiredChecks.length,
      blocking: packet.requiredChecks.length > 0,
    }),
    contactBrief: contactBrief(packet),
    boundary: packet.boundary,
  });
}

export function buildOpportunityPursuitDossiers(
  packets: readonly OpportunityOperatorPreparationPacket[],
  limit = 25,
): readonly OpportunityPursuitDossier[] {
  const boundedLimit = Number.isFinite(limit) ? Math.max(0, Math.min(1_000, Math.trunc(limit))) : 25;
  if (boundedLimit === 0) return Object.freeze([]);
  return Object.freeze(packets.slice(0, boundedLimit).map(buildOpportunityPursuitDossier));
}
