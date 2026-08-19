/**
 * The central fail-closed policy engine.
 *
 * Design rules enforced here:
 *
 *  - Only this module produces a final PolicyDecision. Adapters, the intent
 *    engine, the CLI and the MCP server all call in; none of them decides.
 *  - Dangerous *attributes* dominate the declared class. An operation that
 *    claims to be READ but requests a signer is blocked, so a mislabelled or
 *    hostile callsite cannot launder a dangerous action through a safe class.
 *  - There is no input that flips a block into an allow. The request type has
 *    no override/force/approved field, and extra properties on the incoming
 *    object are ignored because the engine only reads the fields it knows.
 *  - An unrecognized class fails closed.
 */
import type { CommerceConfig } from "../config.js";
import { CommerceError } from "../core/errors.js";
import {
  allowDecision,
  blockDecision,
  type PolicyDecision,
  type PolicyRequest,
} from "./decisions.js";
import { OPERATION_CLASSES, type OperationClass } from "./modes.js";

const KNOWN_CLASSES = new Set<string>(OPERATION_CLASSES);

/** Evaluates a request against Mode-A policy. Never throws for a block. */
export function evaluatePolicy(
  config: CommerceConfig,
  request: PolicyRequest,
  now: Date = new Date(),
): PolicyDecision {
  const evaluatedAt = now.toISOString();
  const operation = String(request.operation ?? "unknown");
  const declared = request.class as string;

  // Fail closed on an unknown class before looking at anything else.
  if (!KNOWN_CLASSES.has(declared)) {
    return blockDecision({
      operation,
      class: "UNKNOWN",
      rule: "A_MODE_UNKNOWN_OPERATION_CLASS",
      reason: "POLICY_BLOCKED",
      requiredActivation: null,
      detail: `operation class ${JSON.stringify(declared)} is not recognized; failing closed`,
      evaluatedAt,
    });
  }
  const cls = declared as OperationClass;

  // Dangerous attributes override the declared class. Order matters: secret
  // access is the most severe because it is never unlocked by any stage.
  if (request.requiresSigner === true || cls === "SECRET_ACCESS") {
    return blockDecision({
      operation,
      class: cls,
      rule: "A_MODE_SECRET_ACCESS",
      reason: "SECRET_ACCESS_FORBIDDEN",
      requiredActivation: null,
      detail:
        "this control plane never reads, imports, derives or holds a private key, mnemonic, " +
        "seed, NWC string or other signing credential",
      evaluatedAt,
    });
  }

  if (request.movesValue === true || cls === "VALUE_MOVEMENT") {
    return blockDecision({
      operation,
      class: cls,
      rule: "A_MODE_VALUE_MOVEMENT",
      reason: "LIVE_VALUE_MOVEMENT_DISABLED",
      requiredActivation: "B2",
      detail:
        `live value movement is disabled (liveValueMovementEnabled=${String(
          config.liveValueMovementEnabled,
        )}); Stage B2 is not implemented`,
      evaluatedAt,
    });
  }

  if (request.mutatesExternal === true || cls === "EXTERNAL_WRITE") {
    return blockDecision({
      operation,
      class: cls,
      rule: "A_MODE_EXTERNAL_WRITE",
      reason: "EXTERNAL_WRITE_DISABLED",
      requiredActivation: "B1",
      detail:
        `external writes are disabled (externalWritesEnabled=${String(
          config.externalWritesEnabled,
        )}); Stage B1 is not implemented`,
      evaluatedAt,
    });
  }

  switch (cls) {
    case "READ":
      return allowDecision({
        operation,
        class: cls,
        rule: "A_MODE_PUBLIC_READ",
        detail: "public non-mutating read through the safe network boundary",
        evaluatedAt,
      });
    case "LOCAL_WRITE":
      return allowDecision({
        operation,
        class: cls,
        rule: "A_MODE_LOCAL_WRITE",
        detail: "write confined to local state, cache, logs or the git worktree",
        evaluatedAt,
      });
    case "PREPARE_EXTERNAL_ACTION":
      return allowDecision({
        operation,
        class: cls,
        rule: "A_MODE_PREPARE_ONLY",
        detail:
          "builds an immutable intent describing the action; the external action is not performed",
        evaluatedAt,
      });
    case "TESTNET_ACTION":
      return allowDecision({
        operation,
        class: cls,
        rule: "A_MODE_NON_VALUE_TESTNET",
        detail:
          "non-value testnet or fake-facilitator exercise with no signer, no asset movement " +
          "and no external mutation",
        evaluatedAt,
      });
    // EXTERNAL_WRITE, VALUE_MOVEMENT and SECRET_ACCESS are already handled by
    // the attribute guards above, so TypeScript has narrowed them out of `cls`
    // here. The exhaustive default below therefore deny-by-defaults anything
    // new: adding a class to OPERATION_CLASSES without handling it explicitly
    // is a compile error, not a silent allow.
    default: {
      const exhaustive: never = cls;
      return blockDecision({
        operation,
        class: "UNKNOWN",
        rule: "A_MODE_DENY_BY_DEFAULT",
        reason: "POLICY_BLOCKED",
        requiredActivation: null,
        detail: `unhandled class ${String(exhaustive)}`,
        evaluatedAt,
      });
    }
  }
}

/**
 * Evaluates and throws a typed error when blocked.
 *
 * Used at callsites where proceeding past a block would be a bug. Callers that
 * need to *report* a block (the intent engine) use evaluatePolicy directly and
 * embed the decision.
 */
export function assertAllowed(
  config: CommerceConfig,
  request: PolicyRequest,
  now: Date = new Date(),
): PolicyDecision {
  const decision = evaluatePolicy(config, request, now);
  if (decision.decision === "block") {
    throw new CommerceError(decision.reason ?? "POLICY_BLOCKED", decision.detail, {
      operation: decision.operation,
      rule: decision.rule,
      requiredActivation: decision.requiredActivation,
    });
  }
  return decision;
}
