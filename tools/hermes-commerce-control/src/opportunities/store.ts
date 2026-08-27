/**
 * Small append-only JSONL store for discovery signals.
 *
 * Opportunity ingestion is intentionally kept independent from the existing
 * commerce SQLite schema while the evaluator is still evolving. This gives the
 * watcher durable deduplication without forcing transient Reddit/WebMCP fields
 * into the mature WorkCandidate tables. The file can later be migrated into the
 * canonical database behind the same store interface.
 */
import { mkdir, readFile, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { canonicalJson } from "../core/ids.js";
import type { OpportunityCandidate } from "./models.js";

export interface OpportunityStore {
  seenIds(): Promise<ReadonlySet<string>>;
  saveMany(candidates: readonly OpportunityCandidate[]): Promise<number>;
  list(limit?: number): Promise<readonly OpportunityCandidate[]>;
}

function isCandidate(value: unknown): value is OpportunityCandidate {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.source === "string" &&
    typeof row.externalId === "string" &&
    typeof row.title === "string" &&
    typeof row.observedAt === "string" &&
    Array.isArray(row.tags) &&
    row.metadata !== null &&
    typeof row.metadata === "object"
  );
}

export class JsonlOpportunityStore implements OpportunityStore {
  public constructor(private readonly path: string) {}

  public async seenIds(): Promise<ReadonlySet<string>> {
    const rows = await this.readAll();
    return new Set(rows.map((row) => row.id));
  }

  public async saveMany(candidates: readonly OpportunityCandidate[]): Promise<number> {
    if (candidates.length === 0) return 0;
    await mkdir(dirname(this.path), { recursive: true });
    const existing = await this.seenIds();
    const fresh = candidates.filter((candidate) => !existing.has(candidate.id));
    if (fresh.length === 0) return 0;
    const payload = `${fresh.map((candidate) => canonicalJson(candidate)).join("\n")}\n`;
    await appendFile(this.path, payload, { encoding: "utf8", mode: 0o600 });
    return fresh.length;
  }

  public async list(limit = 500): Promise<readonly OpportunityCandidate[]> {
    const rows = await this.readAll();
    return rows
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt) || a.id.localeCompare(b.id))
      .slice(0, Math.max(0, limit));
  }

  private async readAll(): Promise<OpportunityCandidate[]> {
    let body: string;
    try {
      body = await readFile(this.path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }

    const out: OpportunityCandidate[] = [];
    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "") continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (isCandidate(parsed)) out.push(parsed);
    }
    return out;
  }
}
