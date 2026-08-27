import { mkdir, readFile, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import type { OpportunityEvaluation } from "./evaluation.js";

const persistedEvaluationSchema = z
  .object({
    requestId: z.string().min(1),
    opportunityId: z.string().min(1),
    evaluatorId: z.string().min(1),
    evaluatedAt: z.string().min(1),
    evaluation: z.unknown(),
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
    let text: string;
    try {
      text = await readFile(this.#path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Set();
      throw error;
    }
    const keys = new Set<string>();
    for (const line of text.split("\n")) {
      if (line.trim() === "") continue;
      let raw: unknown;
      try {
        raw = JSON.parse(line) as unknown;
      } catch {
        continue;
      }
      const parsed = persistedEvaluationSchema.safeParse(raw);
      if (!parsed.success) continue;
      keys.add(evaluationResultKey(parsed.data.requestId, parsed.data.evaluatorId));
    }
    return keys;
  }

  async append(record: PersistedOpportunityEvaluation): Promise<void> {
    await mkdir(dirname(this.#path), { recursive: true });
    await appendFile(this.#path, `${JSON.stringify(record)}\n`, "utf8");
  }
}
