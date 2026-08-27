import { appendFile, mkdir, readFile, truncate } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { canonicalJson } from "../core/ids.js";
import { opportunityEvaluationSchema, type OpportunityEvaluation } from "./evaluation.js";

const persistedEvaluationSchema = z
  .object({
    requestId: z.string().min(1),
    opportunityId: z.string().min(1),
    evaluatorId: z.string().min(1),
    evaluatedAt: z.string().min(1),
    evaluation: opportunityEvaluationSchema,
  })
  .strict();

export interface PersistedOpportunityEvaluation {
  readonly requestId: string;
  readonly opportunityId: string;
  readonly evaluatorId: string;
  readonly evaluatedAt: string;
  readonly evaluation: OpportunityEvaluation;
}

export interface OpportunityEvaluationResultStore {
  seenKeys(): Promise<ReadonlySet<string>>;
  append(record: PersistedOpportunityEvaluation): Promise<void>;
}

export function evaluationResultKey(requestId: string, evaluatorId: string): string {
  return `${requestId}\u0000${evaluatorId}`;
}

export class JsonlOpportunityEvaluationResultStore implements OpportunityEvaluationResultStore {
  readonly #path: string;

  constructor(path: string) {
    this.#path = path;
  }

  async seenKeys(): Promise<ReadonlySet<string>> {
    const rows = await this.#readAll();
    return new Set(rows.map((row) => evaluationResultKey(row.requestId, row.evaluatorId)));
  }

  async append(record: PersistedOpportunityEvaluation): Promise<void> {
    const parsed = persistedEvaluationSchema.parse(record);
    await mkdir(dirname(this.#path), { recursive: true });
    await this.#repairTailBeforeAppend();
    await appendFile(this.#path, `${canonicalJson(parsed)}\n`, { encoding: "utf8", mode: 0o600 });
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
        persistedEvaluationSchema.parse(JSON.parse(tail));
        await appendFile(this.#path, "\n", { encoding: "utf8" });
        return;
      } catch {
        // Incomplete/invalid final record: remove only the broken tail.
      }
    }
    await truncate(this.#path, tailStart);
  }

  async #readAll(): Promise<PersistedOpportunityEvaluation[]> {
    let text: string;
    try {
      text = await readFile(this.#path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const rows: PersistedOpportunityEvaluation[] = [];
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "") continue;
      let raw: unknown;
      try {
        raw = JSON.parse(trimmed) as unknown;
      } catch {
        continue;
      }
      const parsed = persistedEvaluationSchema.safeParse(raw);
      if (!parsed.success) continue;
      rows.push(parsed.data);
    }
    return rows;
  }
}
