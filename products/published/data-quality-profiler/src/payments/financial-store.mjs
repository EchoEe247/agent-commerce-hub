// P1 Batch 3 — durable authoritative financial state.
//
// Runtime financial state lives in a local SQLite database. The tracked JSON
// ledgers remain explicit import/export audit snapshots; they are no longer the
// transactional database for production execution.
//
// Safety properties:
//   - SQLite BEGIN IMMEDIATE serializes budget reservations and transitions.
//   - Every purchase carries a revision; transitions require expectedRevision
//     (CAS) so a stale writer cannot overwrite a newer state.
//   - PREPARED/SIGNED/AMBIGUOUS reserve budget until proven FAILED or SETTLED.
//   - A payment can be reconciled after a process/persistence failure because
//     the signed intent is durably recorded before the paid network request.
//   - JSON snapshot export refuses divergent historical state rather than
//     overwriting it.

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  LEDGER_SCHEMA_VERSION,
  LEDGER_ASSET,
  LedgerError,
  expectedLedgerMeta,
  loadLedger,
  saveLedger,
} from "./ledger.mjs";

export const FINANCIAL_STORE_SCHEMA_VERSION = 1;
export const DEFAULT_PREPARED_RESERVATION_MS = 10 * 60 * 1000;

const BUDGET_CONSUMING_STAGES = Object.freeze([
  "PREPARED",
  "SIGNED",
  "AMBIGUOUS",
  "SETTLED",
  "REPLAY_REJECTED",
]);
const UNRESOLVED_STAGES = Object.freeze(["PREPARED", "SIGNED", "AMBIGUOUS"]);

export class FinancialStoreError extends Error {
  constructor(message, code = "FINANCIAL_STORE_ERROR", detail = undefined) {
    super(message);
    this.name = "FinancialStoreError";
    this.code = code;
    this.detail = detail;
  }
}

function nowIso(nowMs = Date.now()) {
  return new Date(nowMs).toISOString();
}

function asSafeNonNegativeInteger(value, label) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new FinancialStoreError(`${label} must be a non-negative safe integer`, "INVALID_AMOUNT", { value });
  }
  return n;
}

function asPositiveAmount(value) {
  const n = asSafeNonNegativeInteger(value, "amount");
  if (n <= 0) throw new FinancialStoreError("amount must be greater than zero", "INVALID_AMOUNT", { value });
  return n;
}

function mkdirForFile(filePath) {
  if (filePath === ":memory:") return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function openDatabase(filePath, { create }) {
  if (filePath !== ":memory:" && !create && !fs.existsSync(filePath)) {
    throw new FinancialStoreError(
      `authoritative financial store does not exist: ${filePath}`,
      "STORE_MISSING"
    );
  }
  mkdirForFile(filePath);
  let db;
  try {
    db = new DatabaseSync(filePath, { allowExtension: false });
  } catch (cause) {
    throw new FinancialStoreError(
      `cannot open authoritative financial store ${filePath}: ${cause?.message ?? String(cause)}`,
      "STORE_OPEN_FAILED"
    );
  }
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  try { db.exec("PRAGMA journal_mode = WAL"); } catch {}
  db.exec("PRAGMA synchronous = FULL");
  return db;
}

function withImmediateTransaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = fn();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  }
}

function installSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS financial_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchases (
      purchase_id TEXT PRIMARY KEY,
      stage TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK(amount >= 0),
      pay_to TEXT,
      nonce TEXT,
      valid_before INTEGER,
      transaction_hash TEXT,
      reservation_expires_at INTEGER,
      reconcile_from_block TEXT,
      revision INTEGER NOT NULL CHECK(revision >= 1),
      updated_at TEXT NOT NULL,
      data_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_financial_purchases_stage
      ON purchases(stage);
    CREATE INDEX IF NOT EXISTS idx_financial_purchases_transaction
      ON purchases(transaction_hash);

    CREATE TABLE IF NOT EXISTS financial_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id TEXT,
      event_type TEXT NOT NULL,
      from_stage TEXT,
      to_stage TEXT,
      purchase_revision INTEGER,
      source TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(purchase_id) REFERENCES purchases(purchase_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_financial_events_purchase
      ON financial_events(purchase_id, id);
  `);
}

function setMeta(db, key, value) {
  db.prepare(`
    INSERT INTO financial_meta(key, value) VALUES(?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(String(key), String(value));
}

function getMetaMap(db) {
  return Object.fromEntries(
    db.prepare("SELECT key, value FROM financial_meta").all().map((row) => [row.key, row.value])
  );
}

function expectedMeta(authoritativeNetwork, expectedWallet) {
  const ledgerMeta = expectedLedgerMeta(authoritativeNetwork);
  return {
    storeSchemaVersion: String(FINANCIAL_STORE_SCHEMA_VERSION),
    ledgerSchemaVersion: String(LEDGER_SCHEMA_VERSION),
    network: authoritativeNetwork,
    budgetId: ledgerMeta.budgetId,
    asset: LEDGER_ASSET,
    initialBudget: String(ledgerMeta.initialBudget),
    wallet: expectedWallet ?? "",
  };
}

function assertStoreMeta(meta, authoritativeNetwork, expectedWallet) {
  const expected = expectedMeta(authoritativeNetwork, expectedWallet);
  for (const [key, value] of Object.entries(expected)) {
    if (!(key in meta)) {
      throw new FinancialStoreError(`financial store missing metadata key ${key}`, "STORE_SCHEMA_MISMATCH");
    }
    if (key === "wallet" && !expectedWallet) continue;
    const actual = key === "wallet" ? String(meta[key]).toLowerCase() : String(meta[key]);
    const wanted = key === "wallet" ? String(value).toLowerCase() : String(value);
    if (actual !== wanted) {
      const code = key === "network" ? "NETWORK_MISMATCH"
        : key === "wallet" ? "WALLET_MISMATCH"
        : key === "initialBudget" ? "CEILING_MISMATCH"
        : "STORE_META_MISMATCH";
      throw new FinancialStoreError(
        `financial store ${key} ${meta[key]} != required ${value}`,
        code,
        { key, actual: meta[key], expected: value }
      );
    }
  }
}

function parsePurchaseRow(row) {
  if (!row) return null;
  let data = {};
  try { data = JSON.parse(row.data_json); } catch {
    throw new FinancialStoreError(`corrupt data_json for purchase ${row.purchase_id}`, "STORE_CORRUPT");
  }
  const purchase = {
    ...data,
    purchaseId: row.purchase_id,
    stage: row.stage,
    amount: Number(row.amount),
    updatedAt: row.updated_at,
  };
  if (row.pay_to !== null) purchase.payTo = row.pay_to;
  if (row.nonce !== null) purchase.nonce = row.nonce;
  if (row.valid_before !== null) purchase.validBefore = String(row.valid_before);
  if (row.transaction_hash !== null) purchase.transaction = row.transaction_hash;
  if (row.reservation_expires_at !== null) purchase.reservationExpiresAt = Number(row.reservation_expires_at);
  if (row.reconcile_from_block !== null) purchase.reconcileFromBlock = row.reconcile_from_block;
  Object.defineProperty(purchase, "revision", {
    value: Number(row.revision), enumerable: true, writable: false,
  });
  return purchase;
}

function stageCanAdvance(from, to, { allowRecovery = false } = {}) {
  if (from === to) return true;
  const allowed = {
    PREPARED: new Set(["SIGNED", "AMBIGUOUS", "SETTLED", "FAILED"]),
    SIGNED: new Set(["AMBIGUOUS", "SETTLED", "FAILED"]),
    AMBIGUOUS: new Set(["SETTLED", "FAILED"]),
    SETTLED: new Set([]),
    REPLAY_REJECTED: new Set([]),
    FAILED: new Set([]),
  };
  if (allowed[from]?.has(to)) return true;
  if (allowRecovery && from === "FAILED" && to === "SETTLED") return true;
  return false;
}

function legacyStageCanAdvance(from, to) {
  if (from === to) return true;
  if (from === "SETTLED" && to === "REPLAY_REJECTED") return true;
  return stageCanAdvance(from, to, { allowRecovery: true });
}

function coreRowFields(purchase, nowMs = Date.now()) {
  const updatedAt = purchase.updatedAt ?? nowIso(nowMs);
  const updatedMs = Date.parse(updatedAt);
  const reservationExpiresAt = purchase.reservationExpiresAt != null
    ? asSafeNonNegativeInteger(purchase.reservationExpiresAt, "reservationExpiresAt")
    : purchase.stage === "PREPARED"
      ? (Number.isFinite(updatedMs) ? updatedMs : nowMs) + DEFAULT_PREPARED_RESERVATION_MS
      : null;
  let validBefore = null;
  if (purchase.validBefore !== undefined && purchase.validBefore !== null && purchase.validBefore !== "") {
    validBefore = asSafeNonNegativeInteger(purchase.validBefore, "validBefore");
  }
  return {
    purchaseId: String(purchase.purchaseId ?? ""),
    stage: String(purchase.stage ?? ""),
    amount: asSafeNonNegativeInteger(purchase.amount ?? 0, "amount"),
    payTo: purchase.payTo == null ? null : String(purchase.payTo),
    nonce: purchase.nonce == null ? null : String(purchase.nonce),
    validBefore,
    transactionHash: purchase.transaction == null ? null : String(purchase.transaction),
    reservationExpiresAt,
    reconcileFromBlock: purchase.reconcileFromBlock == null ? null : String(purchase.reconcileFromBlock),
    updatedAt,
  };
}

function stripInternalPurchaseFields(purchase) {
  const { revision, ...rest } = purchase;
  return rest;
}

// Audit-safe projection of a purchase for PUBLIC JSON export (tracked ledger
// snapshot). Signed authorization material must NEVER leave the local SQLite
// store. At minimum the full `paymentPayload` is removed; any other raw
// signature-bearing field is defensively stripped as well. Non-secret audit
// metadata (purchaseId, stage, amount, payTo, nonce, validBefore, transaction
// hash, reconciliation status, revertedTransaction) is retained.
function sanitizeAuditPurchase(purchase) {
  const { revision, paymentPayload, ...rest } = purchase;
  for (const key of Object.keys(rest)) {
    if (/signature/i.test(key)) delete rest[key];
  }
  return rest;
}

function immutableHistoryCompatible(oldPurchase, currentPurchase) {
  const mutableKeys = new Set(["stage", "updatedAt", "revision", "reservationExpiresAt"]);
  for (const [key, oldValue] of Object.entries(oldPurchase)) {
    if (mutableKeys.has(key)) continue;
    if (oldValue === undefined) continue;
    const currentValue = currentPurchase[key];
    if (JSON.stringify(oldValue) !== JSON.stringify(currentValue)) {
      return { ok: false, reason: `purchase field ${key} diverged` };
    }
  }
  if (!legacyStageCanAdvance(oldPurchase.stage, currentPurchase.stage)) {
    return { ok: false, reason: `stage ${oldPurchase.stage} cannot advance to ${currentPurchase.stage}` };
  }
  return { ok: true };
}

export class FinancialStore {
  constructor(dbPath, db, authoritativeNetwork, expectedWallet) {
    this.dbPath = dbPath;
    this.db = db;
    this.authoritativeNetwork = authoritativeNetwork;
    this.expectedWallet = expectedWallet ?? null;
  }

  close() {
    try { this.db.close(); } catch {}
  }

  meta() {
    const raw = getMetaMap(this.db);
    assertStoreMeta(raw, this.authoritativeNetwork, this.expectedWallet);
    return {
      schemaVersion: raw.ledgerSchemaVersion,
      storeSchemaVersion: Number(raw.storeSchemaVersion),
      network: raw.network,
      budgetId: raw.budgetId,
      asset: raw.asset,
      initialBudget: Number(raw.initialBudget),
      wallet: raw.wallet,
      storeRevision: Number(raw.storeRevision ?? 0),
      createdAt: raw.createdAt,
      importedFromLedger: raw.importedFromLedger || null,
    };
  }

  getPurchase(purchaseId) {
    const row = this.db.prepare("SELECT * FROM purchases WHERE purchase_id = ?").get(String(purchaseId));
    return parsePurchaseRow(row);
  }

  listPurchases() {
    return this.db.prepare("SELECT * FROM purchases ORDER BY rowid").all().map(parsePurchaseRow);
  }

  listUnresolvedPurchases() {
    const placeholders = UNRESOLVED_STAGES.map(() => "?").join(",");
    return this.db.prepare(
      `SELECT * FROM purchases WHERE stage IN (${placeholders}) ORDER BY updated_at, purchase_id`
    ).all(...UNRESOLVED_STAGES).map(parsePurchaseRow);
  }

  budget() {
    const meta = this.meta();
    const placeholders = BUDGET_CONSUMING_STAGES.map(() => "?").join(",");
    const row = this.db.prepare(
      `SELECT COALESCE(SUM(amount), 0) AS spent
       FROM purchases
       WHERE stage IN (${placeholders}) OR transaction_hash IS NOT NULL`
    ).get(...BUDGET_CONSUMING_STAGES);
    const spentBudget = asSafeNonNegativeInteger(row?.spent ?? 0, "spentBudget");
    if (spentBudget > meta.initialBudget) {
      throw new FinancialStoreError(
        `authoritative store overspent: ${spentBudget} > ${meta.initialBudget}`,
        "OVERSPEND"
      );
    }
    return {
      initialBudget: meta.initialBudget,
      spentBudget,
      remainingBudget: meta.initialBudget - spentBudget,
    };
  }

  snapshot() {
    const meta = this.meta();
    const budget = this.budget();
    const purchases = {};
    for (const purchase of this.listPurchases()) {
      purchases[purchase.purchaseId] = sanitizeAuditPurchase(purchase);
    }
    return {
      schemaVersion: meta.schemaVersion,
      network: meta.network,
      budgetId: meta.budgetId,
      asset: meta.asset,
      initialBudget: budget.initialBudget,
      spentBudget: budget.spentBudget,
      remainingBudget: budget.remainingBudget,
      wallet: meta.wallet,
      purchases,
    };
  }

  recordEvent(purchaseId, eventType, detail = {}, { source = "runtime" } = {}) {
    const purchase = purchaseId ? this.getPurchase(purchaseId) : null;
    this.db.prepare(`
      INSERT INTO financial_events(
        purchase_id, event_type, from_stage, to_stage, purchase_revision,
        source, detail_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      purchaseId ?? null,
      String(eventType),
      purchase?.stage ?? null,
      purchase?.stage ?? null,
      purchase?.revision ?? null,
      String(source),
      JSON.stringify(detail ?? {}),
      nowIso()
    );
  }

  listEvents(purchaseId = null) {
    const rows = purchaseId
      ? this.db.prepare("SELECT * FROM financial_events WHERE purchase_id = ? ORDER BY id").all(String(purchaseId))
      : this.db.prepare("SELECT * FROM financial_events ORDER BY id").all();
    return rows.map((row) => ({
      ...row,
      detail: JSON.parse(row.detail_json || "{}"),
    }));
  }

  reservePurchase(purchase, { source = "runtime", nowMs = Date.now() } = {}) {
    const purchaseId = String(purchase?.purchaseId ?? "");
    if (!/^[A-Za-z0-9._:-]{1,120}$/.test(purchaseId)) {
      throw new FinancialStoreError(`invalid purchaseId ${JSON.stringify(purchaseId)}`, "INVALID_PURCHASE_ID");
    }
    const amount = asPositiveAmount(purchase?.amount);
    return withImmediateTransaction(this.db, () => {
      if (this.db.prepare("SELECT 1 AS ok FROM purchases WHERE purchase_id = ?").get(purchaseId)) {
        throw new FinancialStoreError(`duplicate purchaseId ${purchaseId}`, "DUPLICATE_PURCHASE");
      }
      const budget = this.budget();
      if (budget.remainingBudget < amount) {
        throw new FinancialStoreError(
          `insufficient remaining budget: needs ${amount}, has ${budget.remainingBudget}`,
          "BUDGET_EXCEEDED"
        );
      }
      const prepared = {
        ...purchase,
        purchaseId,
        stage: "PREPARED",
        amount,
        updatedAt: nowIso(nowMs),
        reservationExpiresAt: purchase?.reservationExpiresAt ?? (nowMs + DEFAULT_PREPARED_RESERVATION_MS),
      };
      const core = coreRowFields(prepared, nowMs);
      this.db.prepare(`
        INSERT INTO purchases(
          purchase_id, stage, amount, pay_to, nonce, valid_before,
          transaction_hash, reservation_expires_at, reconcile_from_block,
          revision, updated_at, data_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        core.purchaseId, core.stage, core.amount, core.payTo, core.nonce,
        core.validBefore, core.transactionHash, core.reservationExpiresAt,
        core.reconcileFromBlock, core.updatedAt,
        JSON.stringify(stripInternalPurchaseFields(prepared))
      );
      this.#bumpStoreRevision();
      this.#insertTransitionEvent({
        purchaseId, eventType: "RESERVED", fromStage: null, toStage: "PREPARED",
        revision: 1, source, detail: { amount }, createdAt: core.updatedAt,
      });
      return this.getPurchase(purchaseId);
    });
  }

  transitionPurchase(purchaseId, toStage, patch = {}, options = {}) {
    const { expectedRevision, source = "runtime", allowRecovery = false, nowMs = Date.now() } = options;
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      throw new FinancialStoreError(
        `expectedRevision is required for ${purchaseId}`,
        "CAS_REQUIRED"
      );
    }
    return withImmediateTransaction(this.db, () => {
      const current = this.getPurchase(purchaseId);
      if (!current) throw new FinancialStoreError(`unknown purchase ${purchaseId}`, "PURCHASE_NOT_FOUND");
      if (current.revision !== expectedRevision) {
        throw new FinancialStoreError(
          `stale purchase revision for ${purchaseId}: expected ${expectedRevision}, current ${current.revision}`,
          "CAS_CONFLICT",
          { expectedRevision, currentRevision: current.revision }
        );
      }
      if (!stageCanAdvance(current.stage, toStage, { allowRecovery })) {
        throw new FinancialStoreError(
          `invalid stage transition ${current.stage} -> ${toStage} for ${purchaseId}`,
          "INVALID_STAGE_TRANSITION"
        );
      }
      if (patch.purchaseId && String(patch.purchaseId) !== String(purchaseId)) {
        throw new FinancialStoreError("purchaseId is immutable", "IMMUTABLE_FIELD");
      }
      if (patch.amount !== undefined && Number(patch.amount) !== Number(current.amount)) {
        throw new FinancialStoreError("purchase amount is immutable after reservation", "IMMUTABLE_FIELD");
      }

      const next = {
        ...stripInternalPurchaseFields(current),
        ...patch,
        purchaseId: String(purchaseId),
        stage: String(toStage),
        amount: current.amount,
        updatedAt: nowIso(nowMs),
      };
      const core = coreRowFields(next, nowMs);
      const nextRevision = current.revision + 1;
      const result = this.db.prepare(`
        UPDATE purchases SET
          stage = ?, amount = ?, pay_to = ?, nonce = ?, valid_before = ?,
          transaction_hash = ?, reservation_expires_at = ?, reconcile_from_block = ?,
          revision = ?, updated_at = ?, data_json = ?
        WHERE purchase_id = ? AND revision = ?
      `).run(
        core.stage, core.amount, core.payTo, core.nonce, core.validBefore,
        core.transactionHash, core.reservationExpiresAt, core.reconcileFromBlock,
        nextRevision, core.updatedAt, JSON.stringify(stripInternalPurchaseFields(next)),
        String(purchaseId), expectedRevision
      );
      if (Number(result.changes ?? 0) !== 1) {
        throw new FinancialStoreError(`CAS update lost for ${purchaseId}`, "CAS_CONFLICT");
      }
      this.#bumpStoreRevision();
      this.#insertTransitionEvent({
        purchaseId: String(purchaseId), eventType: "STAGE_TRANSITION",
        fromStage: current.stage, toStage: String(toStage), revision: nextRevision,
        source, detail: patch, createdAt: core.updatedAt,
      });
      return this.getPurchase(purchaseId);
    });
  }

  #bumpStoreRevision() {
    const row = this.db.prepare("SELECT value FROM financial_meta WHERE key = 'storeRevision'").get();
    const next = asSafeNonNegativeInteger(row?.value ?? 0, "storeRevision") + 1;
    setMeta(this.db, "storeRevision", next);
  }

  #insertTransitionEvent({ purchaseId, eventType, fromStage, toStage, revision, source, detail, createdAt }) {
    this.db.prepare(`
      INSERT INTO financial_events(
        purchase_id, event_type, from_stage, to_stage, purchase_revision,
        source, detail_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      purchaseId, eventType, fromStage, toStage, revision, String(source),
      JSON.stringify(detail ?? {}), createdAt ?? nowIso()
    );
  }
}

export function initializeFinancialStoreFromLedger(
  dbPath,
  ledgerPath,
  authoritativeNetwork,
  { expectedWallet = null } = {}
) {
  if (dbPath !== ":memory:" && fs.existsSync(dbPath)) {
    throw new FinancialStoreError(
      `refusing to initialize over existing authoritative financial store: ${dbPath}`,
      "STORE_ALREADY_EXISTS"
    );
  }

  let loaded;
  try {
    loaded = loadLedger(ledgerPath, authoritativeNetwork, {
      allowCreate: false,
      expectedWallet,
    });
  } catch (error) {
    if (error instanceof LedgerError) {
      throw new FinancialStoreError(
        `cannot initialize from ledger ${ledgerPath}: ${error.message}`,
        "LEDGER_IMPORT_FAILED",
        { ledgerCode: error.code }
      );
    }
    throw error;
  }

  const db = openDatabase(dbPath, { create: true });
  installSchema(db);
  try {
    withImmediateTransaction(db, () => {
      const ledger = loaded.ledger;
      const meta = expectedMeta(authoritativeNetwork, expectedWallet ?? ledger.wallet ?? "");
      for (const [key, value] of Object.entries(meta)) setMeta(db, key, value);
      setMeta(db, "wallet", ledger.wallet ?? expectedWallet ?? "");
      setMeta(db, "storeRevision", 0);
      setMeta(db, "createdAt", nowIso());
      setMeta(db, "importedFromLedger", path.resolve(ledgerPath));

      for (const [id, rawPurchase] of Object.entries(ledger.purchases ?? {})) {
        const purchase = {
          ...rawPurchase,
          purchaseId: rawPurchase?.purchaseId ?? id,
        };
        const core = coreRowFields(purchase);
        if (!core.purchaseId || !core.stage) {
          throw new FinancialStoreError(`invalid purchase ${id} in imported ledger`, "LEDGER_IMPORT_FAILED");
        }
        db.prepare(`
          INSERT INTO purchases(
            purchase_id, stage, amount, pay_to, nonce, valid_before,
            transaction_hash, reservation_expires_at, reconcile_from_block,
            revision, updated_at, data_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(
          core.purchaseId, core.stage, core.amount, core.payTo, core.nonce,
          core.validBefore, core.transactionHash, core.reservationExpiresAt,
          core.reconcileFromBlock, core.updatedAt,
          JSON.stringify(stripInternalPurchaseFields(purchase))
        );
        db.prepare(`
          INSERT INTO financial_events(
            purchase_id, event_type, from_stage, to_stage, purchase_revision,
            source, detail_json, created_at
          ) VALUES (?, 'IMPORTED_FROM_LEDGER', NULL, ?, 1, 'migration', '{}', ?)
        `).run(core.purchaseId, core.stage, core.updatedAt);
      }
    });

    const store = new FinancialStore(dbPath, db, authoritativeNetwork, expectedWallet ?? loaded.ledger.wallet ?? null);
    const snapshot = store.snapshot();
    if (
      snapshot.spentBudget !== loaded.ledger.spentBudget ||
      snapshot.remainingBudget !== loaded.ledger.remainingBudget
    ) {
      throw new FinancialStoreError(
        `imported totals disagree with source ledger: store spent=${snapshot.spentBudget} remaining=${snapshot.remainingBudget}`,
        "LEDGER_IMPORT_TOTALS_MISMATCH"
      );
    }
    return store;
  } catch (error) {
    try { db.close(); } catch {}
    if (dbPath !== ":memory:") {
      try { fs.unlinkSync(dbPath); } catch {}
      for (const suffix of ["-wal", "-shm"]) {
        try { fs.unlinkSync(`${dbPath}${suffix}`); } catch {}
      }
    }
    throw error;
  }
}

export function openFinancialStore(dbPath, authoritativeNetwork, { expectedWallet = null } = {}) {
  const db = openDatabase(dbPath, { create: false });
  try {
    const requiredTables = ["financial_meta", "purchases", "financial_events"];
    const present = new Set(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name)
    );
    for (const table of requiredTables) {
      if (!present.has(table)) {
        throw new FinancialStoreError(
          `authoritative financial store is missing required table ${table}`,
          "STORE_SCHEMA_MISMATCH"
        );
      }
    }
    const meta = getMetaMap(db);
    assertStoreMeta(meta, authoritativeNetwork, expectedWallet);
    return new FinancialStore(dbPath, db, authoritativeNetwork, expectedWallet);
  } catch (error) {
    try { db.close(); } catch {}
    throw error;
  }
}

export function compareFinancialStoreToLedger(store, ledgerPath) {
  let legacy;
  try {
    legacy = loadLedger(ledgerPath, store.authoritativeNetwork, {
      allowCreate: false,
      expectedWallet: store.expectedWallet,
    }).ledger;
  } catch (error) {
    return {
      compatible: false,
      exact: false,
      errors: [`cannot load audit ledger: ${error?.message ?? String(error)}`],
    };
  }

  const current = store.snapshot();
  const errors = [];
  const metaKeys = ["schemaVersion", "network", "budgetId", "asset", "initialBudget", "wallet"];
  for (const key of metaKeys) {
    const a = key === "wallet" ? String(legacy[key] ?? "").toLowerCase() : legacy[key];
    const b = key === "wallet" ? String(current[key] ?? "").toLowerCase() : current[key];
    if (a !== b) errors.push(`root ${key} diverged: ledger=${legacy[key]} store=${current[key]}`);
  }

  for (const [id, oldPurchase] of Object.entries(legacy.purchases ?? {})) {
    const currentPurchase = current.purchases[id];
    if (!currentPurchase) {
      errors.push(`ledger purchase ${id} is missing from authoritative store`);
      continue;
    }
    const verdict = immutableHistoryCompatible(oldPurchase, currentPurchase);
    if (!verdict.ok) errors.push(`${id}: ${verdict.reason}`);
  }

  const exact = errors.length === 0 && JSON.stringify(legacy) === JSON.stringify(current);
  return { compatible: errors.length === 0, exact, errors };
}

export function exportFinancialStoreToLedger(
  store,
  ledgerPath,
  { requireCompatibleHistory = true } = {}
) {
  if (requireCompatibleHistory && fs.existsSync(ledgerPath)) {
    const comparison = compareFinancialStoreToLedger(store, ledgerPath);
    if (!comparison.compatible) {
      throw new FinancialStoreError(
        `refusing to overwrite divergent ledger history: ${comparison.errors.join("; ")}`,
        "LEDGER_DIVERGENCE",
        comparison
      );
    }
  }
  const snapshot = store.snapshot();
  saveLedger(ledgerPath, snapshot);
  return snapshot;
}

export function financialDbPathForLedger(ledgerPath) {
  const parsed = path.parse(ledgerPath);
  return path.join(parsed.dir, `${parsed.name}.sqlite`);
}

export function budgetConsumingStage(stage) {
  return BUDGET_CONSUMING_STAGES.includes(stage);
}

export function unresolvedFinancialStage(stage) {
  return UNRESOLVED_STAGES.includes(stage);
}
