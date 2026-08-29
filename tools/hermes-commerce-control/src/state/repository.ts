/**
 * Typed persistence for canonical commerce state.
 *
 * Writes are idempotent by canonical ID so that a re-run of discovery updates a
 * service rather than duplicating it, and replaying an operation ID does not
 * duplicate a receipt. Source observations accumulate under one canonical
 * service so cross-source agreement is preserved rather than flattened.
 */
import { canonicalJson } from "../core/ids.js";
import type {
  EvidenceRecord,
  PlatformId,
  ProbeResult,
  Quote,
  ServiceCandidate,
  SourceObservation,
  WorkCandidate,
} from "../core/models.js";
import { parseServiceCandidate, parseWorkCandidate } from "../core/schemas.js";
import type { PolicyDecision } from "../policy/decisions.js";
import { withTransaction, type StateDatabase } from "./sqlite.js";

export interface OperationRecord {
  readonly id: string;
  readonly type: string;
  readonly startedAt: string;
  readonly endedAt?: string | undefined;
  readonly mode: "A";
  readonly sourcesRequested?: number | undefined;
  readonly sourcesSucceeded?: number | undefined;
  readonly sourcesFailed?: number | undefined;
  readonly resultCount?: number | undefined;
  readonly financialActionExecuted: boolean;
  readonly externalMutationExecuted: boolean;
  readonly evidencePaths?: readonly string[] | undefined;
  readonly errors?: readonly string[] | undefined;
}

export interface IntentRecord {
  readonly id: string;
  readonly kind: string;
  readonly platform: string;
  readonly targetId: string;
  readonly createdAt: string;
  readonly hash: string;
  readonly body: unknown;
  readonly decisionRule: string;
  readonly decisionOutcome: string;
  readonly financialActionExecuted: boolean;
  readonly externalMutationExecuted: boolean;
}

export interface ExportRecord {
  readonly path: string;
  readonly kind: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly exportedAt: string;
}

const bool = (v: boolean): number => (v ? 1 : 0);

export class CommerceRepository {
  public constructor(private readonly db: StateDatabase) {}

  // ---------------------------------------------------------------- services

  public saveService(service: ServiceCandidate): void {
    withTransaction(this.db, () => {
      this.db
        .prepare(
          `INSERT INTO services (
             id, name, resource_url, method, protocol, network, pay_to,
             price_atomic, price_decimal, currency, health, observed_at, snapshot
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET
             name = excluded.name,
             health = excluded.health,
             observed_at = excluded.observed_at,
             price_atomic = excluded.price_atomic,
             price_decimal = excluded.price_decimal,
             currency = excluded.currency,
             snapshot = excluded.snapshot`,
        )
        .run(
          service.id,
          service.name,
          service.resourceUrl,
          service.method,
          service.protocol,
          service.network ?? null,
          service.payTo ?? null,
          service.price?.atomic ?? null,
          service.price?.decimal ?? null,
          service.price?.currency ?? null,
          service.health,
          service.observedAt,
          canonicalJson(service),
        );

      const insertObs = this.db.prepare(
        `INSERT INTO service_observations (service_id, source, external_id, observed_at, source_url)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (service_id, source, external_id) DO UPDATE SET
           observed_at = excluded.observed_at,
           source_url = excluded.source_url`,
      );
      for (const obs of service.sources) {
        insertObs.run(
          service.id,
          obs.source,
          obs.externalId,
          obs.observedAt,
          obs.sourceUrl ?? null,
        );
      }
    });
  }

  public getService(id: string): ServiceCandidate | null {
    const row = this.db.prepare("SELECT snapshot FROM services WHERE id = ?").get(id) as
      | { snapshot: string }
      | undefined;
    if (row === undefined) return null;
    return parseServiceCandidate(JSON.parse(row.snapshot));
  }

  public listServices(limit = 500): ServiceCandidate[] {
    const rows = this.db
      .prepare("SELECT snapshot FROM services ORDER BY observed_at DESC, id ASC LIMIT ?")
      .all(limit) as Array<{ snapshot: string }>;
    return rows.map((r) => parseServiceCandidate(JSON.parse(r.snapshot)));
  }

  public listServiceObservations(serviceId: string): SourceObservation[] {
    const rows = this.db
      .prepare(
        `SELECT source, external_id, observed_at, source_url
         FROM service_observations WHERE service_id = ? ORDER BY source ASC`,
      )
      .all(serviceId) as Array<{
      source: string;
      external_id: string;
      observed_at: string;
      source_url: string | null;
    }>;
    return rows.map((r) => ({
      source: r.source as PlatformId,
      externalId: r.external_id,
      observedAt: r.observed_at,
      sourceUrl: r.source_url ?? undefined,
    }));
  }

  // ------------------------------------------------------------------- work

  public saveWork(work: WorkCandidate): void {
    withTransaction(this.db, () => {
      this.db
        .prepare(
          `INSERT INTO work_items (
             id, source, external_id, title, reward_amount, reward_asset, reward_network,
             funding_state, funding_evidence, verifier_type, status, deadline, observed_at, snapshot
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET
             title = excluded.title,
             reward_amount = excluded.reward_amount,
             funding_state = excluded.funding_state,
             funding_evidence = excluded.funding_evidence,
             verifier_type = excluded.verifier_type,
             status = excluded.status,
             deadline = excluded.deadline,
             observed_at = excluded.observed_at,
             snapshot = excluded.snapshot`,
        )
        .run(
          work.id,
          work.source,
          work.externalId,
          work.title,
          work.reward.amount,
          work.reward.asset,
          work.reward.network ?? null,
          work.funding.state,
          work.funding.evidence,
          work.verification.type,
          work.status,
          work.deadline ?? null,
          work.observedAt,
          canonicalJson(work),
        );

      this.db
        .prepare(
          `INSERT INTO work_observations (work_id, source, external_id, observed_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT (work_id, source, external_id, observed_at) DO NOTHING`,
        )
        .run(work.id, work.source, work.externalId, work.observedAt);
    });
  }

  public getWork(id: string): WorkCandidate | null {
    const row = this.db.prepare("SELECT snapshot FROM work_items WHERE id = ?").get(id) as
      | { snapshot: string }
      | undefined;
    if (row === undefined) return null;
    return parseWorkCandidate(JSON.parse(row.snapshot));
  }

  public listWork(limit = 500): WorkCandidate[] {
    const rows = this.db
      .prepare("SELECT snapshot FROM work_items ORDER BY observed_at DESC, id ASC LIMIT ?")
      .all(limit) as Array<{ snapshot: string }>;
    return rows.map((r) => parseWorkCandidate(JSON.parse(r.snapshot)));
  }

  // ------------------------------------------------------------------ quotes

  public saveQuote(quote: Quote): void {
    this.db
      .prepare(
        `INSERT INTO quotes (
           service_id, platform, quoted_at, price_atomic, price_decimal, currency,
           network, executable, snapshot
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        quote.serviceId,
        quote.platform,
        quote.quotedAt,
        quote.price?.atomic ?? null,
        quote.price?.decimal ?? null,
        quote.price?.currency ?? null,
        quote.network ?? null,
        bool(false),
        canonicalJson(quote),
      );
  }

  // ----------------------------------------------------------------- probes

  public saveProbe(probe: ProbeResult): void {
    this.db
      .prepare(
        `INSERT INTO probes (platform, status, checked_at, latency_ms, detail, error_code)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        probe.platform,
        probe.status,
        probe.checkedAt,
        probe.latencyMs ?? null,
        probe.detail ?? null,
        probe.errorCode ?? null,
      );
  }

  public listProbes(platform?: PlatformId, limit = 100): ProbeResult[] {
    const rows = (
      platform === undefined
        ? this.db
            .prepare("SELECT * FROM probes ORDER BY checked_at DESC LIMIT ?")
            .all(limit)
        : this.db
            .prepare("SELECT * FROM probes WHERE platform = ? ORDER BY checked_at DESC LIMIT ?")
            .all(platform, limit)
    ) as Array<{
      platform: string;
      status: string;
      checked_at: string;
      latency_ms: number | null;
      detail: string | null;
      error_code: string | null;
    }>;
    return rows.map((r) => ({
      platform: r.platform as PlatformId,
      status: r.status as ProbeResult["status"],
      checkedAt: r.checked_at,
      latencyMs: r.latency_ms ?? undefined,
      detail: r.detail ?? undefined,
      errorCode: r.error_code ?? undefined,
    }));
  }

  // --------------------------------------------------------------- evidence

  public saveEvidence(record: EvidenceRecord): void {
    this.db
      .prepare(
        `INSERT INTO evidence (
           platform, fact, value, classification, source_type, source_ref, captured_at, hash, raw_path
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.platform,
        record.fact,
        record.value,
        record.classification,
        record.sourceType,
        record.sourceRef,
        record.capturedAt,
        record.hash,
        record.rawPath ?? null,
      );
  }

  // -------------------------------------------------------- policy + intents

  public savePolicyDecision(decision: PolicyDecision): void {
    this.db
      .prepare(
        `INSERT INTO policy_decisions (
           operation, class, decision, rule, reason, required_activation, mode, evaluated_at, detail
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        decision.operation,
        decision.class,
        decision.decision,
        decision.rule,
        decision.reason,
        decision.requiredActivation,
        decision.mode,
        decision.evaluatedAt,
        decision.detail,
      );
  }

  public saveIntent(intent: IntentRecord): void {
    this.db
      .prepare(
        `INSERT INTO intents (
           id, kind, platform, target_id, created_at, hash, body,
           decision_rule, decision_outcome, financial_action_executed, external_mutation_executed
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO NOTHING`,
      )
      .run(
        intent.id,
        intent.kind,
        intent.platform,
        intent.targetId,
        intent.createdAt,
        intent.hash,
        canonicalJson(intent.body),
        intent.decisionRule,
        intent.decisionOutcome,
        bool(intent.financialActionExecuted),
        bool(intent.externalMutationExecuted),
      );
  }

  public listIntents(limit = 100): IntentRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM intents ORDER BY created_at DESC LIMIT ?")
      .all(limit) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      kind: String(r.kind),
      platform: String(r.platform),
      targetId: String(r.target_id),
      createdAt: String(r.created_at),
      hash: String(r.hash),
      body: JSON.parse(String(r.body)),
      decisionRule: String(r.decision_rule),
      decisionOutcome: String(r.decision_outcome),
      financialActionExecuted: Number(r.financial_action_executed) === 1,
      externalMutationExecuted: Number(r.external_mutation_executed) === 1,
    }));
  }

  // ------------------------------------------------------------- operations

  public saveOperation(op: OperationRecord): void {
    this.db
      .prepare(
        `INSERT INTO operations (
           id, type, started_at, ended_at, mode, sources_requested, sources_succeeded,
           sources_failed, result_count, financial_action_executed,
           external_mutation_executed, evidence_paths, errors
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           ended_at = excluded.ended_at,
           result_count = excluded.result_count,
           evidence_paths = excluded.evidence_paths,
           errors = excluded.errors`,
      )
      .run(
        op.id,
        op.type,
        op.startedAt,
        op.endedAt ?? null,
        op.mode,
        op.sourcesRequested ?? 0,
        op.sourcesSucceeded ?? 0,
        op.sourcesFailed ?? 0,
        op.resultCount ?? 0,
        bool(op.financialActionExecuted),
        bool(op.externalMutationExecuted),
        op.evidencePaths === undefined ? null : canonicalJson(op.evidencePaths),
        op.errors === undefined ? null : canonicalJson(op.errors),
      );
  }

  public getOperation(id: string): OperationRecord | null {
    const r = this.db.prepare("SELECT * FROM operations WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    if (r === undefined) return null;
    return {
      id: String(r.id),
      type: String(r.type),
      startedAt: String(r.started_at),
      endedAt: r.ended_at === null ? undefined : String(r.ended_at),
      mode: "A",
      sourcesRequested: Number(r.sources_requested),
      sourcesSucceeded: Number(r.sources_succeeded),
      sourcesFailed: Number(r.sources_failed),
      resultCount: Number(r.result_count),
      financialActionExecuted: Number(r.financial_action_executed) === 1,
      externalMutationExecuted: Number(r.external_mutation_executed) === 1,
      evidencePaths:
        r.evidence_paths === null ? undefined : (JSON.parse(String(r.evidence_paths)) as string[]),
      errors: r.errors === null ? undefined : (JSON.parse(String(r.errors)) as string[]),
    };
  }

  // ---------------------------------------------------------------- exports

  public saveExport(record: ExportRecord): void {
    this.db
      .prepare(
        `INSERT INTO exports (path, kind, sha256, bytes, exported_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(record.path, record.kind, record.sha256, record.bytes, record.exportedAt);
  }

  public upsertSource(platform: PlatformId, enabled: boolean, baseUrl: string, status?: string): void {
    this.db
      .prepare(
        `INSERT INTO sources (platform, enabled, base_url, last_status, last_seen)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (platform) DO UPDATE SET
           enabled = excluded.enabled,
           base_url = excluded.base_url,
           last_status = excluded.last_status,
           last_seen = excluded.last_seen`,
      )
      .run(platform, bool(enabled), baseUrl, status ?? null, new Date().toISOString());
  }
}
