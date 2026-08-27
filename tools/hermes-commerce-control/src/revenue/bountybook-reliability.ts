export interface BountyBookReliabilityAssessment {
  readonly status: "healthy" | "degraded" | "unknown";
  readonly totalVerifications: number | null;
  readonly passRate: number | null;
  readonly failRate: number | null;
  readonly pursuitSuppressed: boolean;
  readonly reason: string;
}

type JsonObject = Record<string, unknown>;

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Converts BountyBook's live oracle aggregate into a conservative pursuit gate.
 *
 * This deliberately does not reinterpret platform documentation. It only reacts
 * to live API evidence. A sufficiently large sample with a sub-5% pass rate is
 * treated as a degraded verifier and blocks new pursuit until the live signal
 * recovers. Missing/malformed stats fail open as unknown so a telemetry outage
 * does not masquerade as a verifier outage.
 */
export function assessBountyBookReliability(
  raw: unknown,
  options: {
    readonly minimumSampleSize?: number;
    readonly minimumHealthyPassRate?: number;
  } = {},
): BountyBookReliabilityAssessment {
  const minimumSampleSize = Math.max(1, options.minimumSampleSize ?? 100);
  const minimumHealthyPassRate = Math.min(1, Math.max(0, options.minimumHealthyPassRate ?? 0.05));

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return Object.freeze({
      status: "unknown",
      totalVerifications: null,
      passRate: null,
      failRate: null,
      pursuitSuppressed: false,
      reason: "oracle stats unavailable or malformed",
    });
  }

  const body = raw as JsonObject;
  const totalRaw = finiteNumber(body.total_verifications ?? body.totalVerifications);
  const passRaw = finiteNumber(body.pass_rate ?? body.passRate);
  const failRaw = finiteNumber(body.fail_rate ?? body.failRate);

  const totalVerifications = totalRaw === null || totalRaw < 0 ? null : Math.floor(totalRaw);
  const passRate = passRaw === null || passRaw < 0 || passRaw > 1 ? null : passRaw;
  const failRate = failRaw === null || failRaw < 0 || failRaw > 1 ? null : failRaw;

  if (totalVerifications === null || passRate === null) {
    return Object.freeze({
      status: "unknown",
      totalVerifications,
      passRate,
      failRate,
      pursuitSuppressed: false,
      reason: "oracle stats missing usable total_verifications/pass_rate",
    });
  }

  if (totalVerifications < minimumSampleSize) {
    return Object.freeze({
      status: "unknown",
      totalVerifications,
      passRate,
      failRate,
      pursuitSuppressed: false,
      reason: `oracle sample too small (${totalVerifications} < ${minimumSampleSize})`,
    });
  }

  if (passRate < minimumHealthyPassRate) {
    return Object.freeze({
      status: "degraded",
      totalVerifications,
      passRate,
      failRate,
      pursuitSuppressed: true,
      reason: `live oracle pass rate ${(passRate * 100).toFixed(3)}% is below ${(minimumHealthyPassRate * 100).toFixed(1)}% across ${totalVerifications} verifications`,
    });
  }

  return Object.freeze({
    status: "healthy",
    totalVerifications,
    passRate,
    failRate,
    pursuitSuppressed: false,
    reason: `live oracle pass rate ${(passRate * 100).toFixed(3)}% across ${totalVerifications} verifications`,
  });
}
