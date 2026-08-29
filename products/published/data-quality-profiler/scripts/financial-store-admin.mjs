// P1 Batch 3 financial-store administration.
// Explicit migration/export/reconciliation only: operational code never creates
// a replacement authoritative database when it is missing.

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NETWORK_MAINNET,
  NETWORK_TESTNET,
  MAINNET_WALLET,
  TESTNET_WALLET,
} from "../src/payments/ledger.mjs";
import {
  initializeFinancialStoreFromLedger,
  openFinancialStore,
  compareFinancialStoreToLedger,
  exportFinancialStoreToLedger,
} from "../src/payments/financial-store.mjs";
import { reconcileUnresolvedPurchases } from "../src/payments/reconciliation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const DEFAULTS = Object.freeze({
  mainnet: {
    network: NETWORK_MAINNET,
    wallet: MAINNET_WALLET,
    ledger: path.join(ROOT, "state/commerce-control/ledgers/mainnet-budget-ledger.json"),
    db: path.join(ROOT, "state/commerce-control/financial/mainnet-budget.sqlite"),
    rpc: process.env.BASE_RPC_URL ?? "https://mainnet.base.org",
  },
  testnet: {
    network: NETWORK_TESTNET,
    wallet: TESTNET_WALLET,
    ledger: path.join(ROOT, "state/commerce-control/ledgers/testnet-budget-ledger.json"),
    db: path.join(ROOT, "state/commerce-control/financial/testnet-budget.sqlite"),
    rpc: process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
  },
});

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) { out._.push(arg); continue; }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) { out[key] = next; i++; }
    else out[key] = true;
  }
  return out;
}

function usage() {
  console.error(`Usage:
  node scripts/financial-store-admin.mjs init-mainnet [--db PATH] [--ledger PATH]
  node scripts/financial-store-admin.mjs init-testnet [--db PATH] [--ledger PATH]
  node scripts/financial-store-admin.mjs audit-mainnet [--db PATH] [--ledger PATH]
  node scripts/financial-store-admin.mjs audit-testnet [--db PATH] [--ledger PATH]
  node scripts/financial-store-admin.mjs export-mainnet [--db PATH] [--ledger PATH]
  node scripts/financial-store-admin.mjs export-testnet [--db PATH] [--ledger PATH]
  node scripts/financial-store-admin.mjs reconcile-mainnet [--db PATH] [--rpc URL] [--facilitator URL]
  node scripts/financial-store-admin.mjs reconcile-testnet [--db PATH] [--rpc URL] [--facilitator URL]
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] ?? "";
  const match = /^(init|audit|export|reconcile)-(mainnet|testnet)$/.exec(command);
  if (!match) { usage(); process.exitCode = 2; return; }
  const [, action, networkName] = match;
  const defaults = DEFAULTS[networkName];
  const dbPath = path.resolve(String(args.db ?? defaults.db));
  const ledgerPath = path.resolve(String(args.ledger ?? defaults.ledger));

  if (action === "init") {
    const store = initializeFinancialStoreFromLedger(
      dbPath,
      ledgerPath,
      defaults.network,
      { expectedWallet: defaults.wallet }
    );
    try {
      const budget = store.budget();
      console.log(`FINANCIAL_STORE_INITIALIZED network=${defaults.network} db=${dbPath} spent=${budget.spentBudget} remaining=${budget.remainingBudget}`);
    } finally {
      store.close();
    }
    return;
  }

  const store = openFinancialStore(dbPath, defaults.network, { expectedWallet: defaults.wallet });
  try {
    if (action === "audit") {
      const comparison = compareFinancialStoreToLedger(store, ledgerPath);
      console.log(JSON.stringify({
        status: comparison.compatible ? "COMPATIBLE" : "DIVERGED",
        network: defaults.network,
        dbPath,
        ledgerPath,
        ...comparison,
      }, null, 2));
      if (!comparison.compatible) process.exitCode = 1;
      return;
    }

    if (action === "export") {
      const snapshot = exportFinancialStoreToLedger(store, ledgerPath, { requireCompatibleHistory: true });
      console.log(`FINANCIAL_LEDGER_EXPORTED network=${defaults.network} ledger=${ledgerPath} spent=${snapshot.spentBudget} remaining=${snapshot.remainingBudget}`);
      return;
    }

    const results = await reconcileUnresolvedPurchases(store, {
      rpcUrl: String(args.rpc ?? defaults.rpc),
      facilitatorUrl: args.facilitator ? String(args.facilitator) : (process.env.X402_FACILITATOR_URL ?? null),
    });
    console.log(JSON.stringify({
      network: defaults.network,
      reconciled: results.map((r) => ({
        purchaseId: r.purchase.purchaseId,
        stage: r.purchase.stage,
        changed: r.changed,
        decision: r.decision,
        chain: r.evidence.chain,
        facilitator: r.evidence.facilitator,
      })),
      budget: store.budget(),
    }, null, 2));
  } finally {
    store.close();
  }
}

main().catch((error) => {
  console.error(`FINANCIAL_ADMIN_ERROR code=${error?.code ?? "ERROR"} ${error?.message ?? String(error)}`);
  process.exit(1);
});
