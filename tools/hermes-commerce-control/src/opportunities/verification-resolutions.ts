import { appendFile, mkdir, readFile, truncate } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { canonicalHash, canonicalJson } from "../core/ids.js";

export const VERIFICATION_RESOLUTION_OUTCOMES = ["satisfied", "failed"] as const;
export type VerificationResolutionOutcome = (typeof VERIFICATION_RESOLUTION_OUTCOMES)[number];

export const VERIFICATION_EVIDENCE_KINDS = [
  "operator_attestation",
  "source_reference",
  "calculation",
  "executor_quote",
  "counterparty_confirmation",
] as const;
export type VerificationEvidenceKind = (typeof VERIFICATION_EVIDENCE_KINDS)[number];

const evidenceSchema = z
  .object({
    kind: z.enum(VERIFICATION_EVIDENCE_KINDS),
    reference: z.string().trim().min(1).max(2_000).optional(),
    note: z.string().trim().min(1).max(2_000),
  })
  .strict();

const persistedResolutionSchema = z
  .object({
    schemaVersion: z.literal(1),
    resolutionId: z.string().regex(/^opver_[a-f0-9]{32}$/),
    dossierId: z.string().regex(/^opdos_[a-f0-9]{32}$/),
    checkId: z.string().regex(/^opcheck_[a-f0-9]{32}$/),
    outcome: z.enum(VERIFICATION_RESOLUTION_OUTCOMES),
    evidence: evidenceSchema,
    recordedAt: z
      .string()
      .min(1)
      .refine((value) => Number.isFinite(Date.parse(value)), "recordedAt must be a valid timestamp"),
  })
  .strict();

export interface OpportunityVerificationResolution {
  readonly schemaVersion: 1;
  readonly resolutionId: string;
  readonly dossierId: string;
  readonly checkId: string;
  readonly outcome: VerificationResolutionOutcome;
  readonly evidence: {
    readonly kind: VerificationEvidenceKind;
    readonly reference?: string | undefined;
    readonly note: string;
  };
  readonly recordedAt: string;
}

export interface OpportunityVerificationResolutionStore {
  append(record: OpportunityVerificationResolution): Promise<void>;
  /** Omit limit to read every valid persisted resolution. */
  list(limit?: number): Promise<readonly OpportunityVerificationResolution[]>;
}

function evidenceRequiresReference(kind: VerificationEvidenceKind): boolean {
  return kind === "source_reference" || kind === "executor_quote" || kind === "counterparty_confirmation";
}

function assertEvidenceSemantics(evidence: OpportunityVerificationResolution["evidence"]): void {
  if (evidenceRequiresReference(evidence.kind) && (evidence.reference === undefined || evidence.reference.trim() === "")) {
    throw new Error(`${evidence.kind} evidence requires a non-empty reference`);
  }
}

export function buildOpportunityVerificationResolution(input: {
  readonly dossierId: string;
  readonly checkId: string;
  readonly outcome: VerificationResolutionOutcome;
  readonly evidence: OpportunityVerificationResolution["evidence"];
  readonly recordedAt?: string | undefined;
}): OpportunityVerificationResolution {
  assertEvidenceSemantics(input.evidence);
  const recordedAt = input.recordedAt ?? new Date().toISOString();
  const base = persistedResolutionSchema
    .omit({ resolutionId: true })
    .parse({
      schemaVersion: 1,
      dossierId: input.dossierId,
      checkId: input.checkId,
      outcome: input.outcome,
      evidence: input.evidence,
      recordedAt,
    });
  const resolutionId = `opver_${canonicalHash(base).slice(0, 32)}`;
  return Object.freeze(persistedResolutionSchema.parse({ ...base, resolutionId }));
}

function recordedAtMillis(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function compareRows(a: OpportunityVerificationResolution, b: OpportunityVerificationResolution): number {
  const byTime = recordedAtMillis(b.recordedAt) - recordedAtMillis(a.recordedAt);
  if (byTime !== 0) return byTime;
  return a.resolutionId.localeCompare(b.resolutionId);
}

function parsePersistedResolution(value: unknown): OpportunityVerificationResolution | undefined {
  const parsed = persistedResolutionSchema.safeParse(value);
  if (!parsed.success) return undefined;
  try {
    assertEvidenceSemantics(parsed.data.evidence);
    return Object.freeze(parsed.data);
  } catch {
    return undefined;
  }
}

export class JsonlOpportunityVerificationResolutionStore implements OpportunityVerificationResolutionStore {
  readonly #path: string;

  constructor(path: string) {
    this.#path = path;
  }

  async append(record: OpportunityVerificationResolution): Promise<void> {
    const parsed = persistedResolutionSchema.parse(record);
    assertEvidenceSemantics(parsed.evidence);
    await mkdir(dirname(this.#path), { recursive: true });
    await this.#repairTailBeforeAppend();
    await appendFile(this.#path, `${canonicalJson(parsed)}\n`, { encoding: "utf8", mode: 0o600 });
  }

  async list(limit?: number): Promise<readonly OpportunityVerificationResolution[]> {
    const rows = (await this.#readAll()).sort(compareRows);
    if (limit === undefined) return Object.freeze(rows);
    const bounded = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 0;
    return Object.freeze(rows.slice(0, bounded));
  }

  async #repairTailBeforeAppend(): Promise<void> {
    let body: Buffer;
    try {
      body = await readFile(this.#path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    if (body.length === 0 || body[body.length - 1] === 0x0a) return;

    const lastNewline = body.lastIndexOf(0x0a);
    const tailStart = lastNewline + 1;
    const tail = body.subarray(tailStart).toString("utf8").trim();
    if (tail !== "") {
      try {
        const raw = JSON.parse(tail) as unknown;
        if (parsePersistedResolution(raw) !== undefined) {
          await appendFile(this.#path, "\n", { encoding: "utf8" });
          return;
        }
      } catch {
        // Fall through and remove the incomplete/invalid final record.
      }
    }
    await truncate(this.#path, tailStart);
  }

  async #readAll(): Promise<OpportunityVerificationResolution[]> {
    let text: string;
    try {
      text = await readFile(this.#path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const rows: OpportunityVerificationResolution[] = [];
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "") continue;
      let raw: unknown;
      try {
        raw = JSON.parse(trimmed) as unknown;
      } catch {
        continue;
      }
      const parsed = parsePersistedResolution(raw);
      if (parsed !== undefined) rows.push(parsed);
    }
    return rows;
  }
}
