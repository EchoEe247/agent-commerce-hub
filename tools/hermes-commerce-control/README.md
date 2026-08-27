# Hermes Commerce Control Plane

Unified agent-commerce command center and Model Context Protocol (MCP) server for local discovery, ranking, and preparation of machine-to-machine transactions.

## Architecture & Layout

The control plane is implemented as a single, self-contained, lightweight Node.js 24 TypeScript application. It provides two user-facing interfaces:
1. **Command Line Interface (CLI):** A stable wrapper for manual operator commands and scripting.
2. **Model Context Protocol (MCP) Server:** A standard stdio-based protocol layer for secure integration with LLMs and agents (e.g., Hermes).

### Directory & State Layout

The application isolates its active runtime state from the shared git repository. All state is maintained locally within a dedicated layout:

- **Package Root:** `tools/hermes-commerce-control/` (compiled to `dist/`)
- **State Directory:** `~/.hermes/commerce-control/state/`
- **SQLite Database:** `~/.hermes/commerce-control/state/commerce.db` (managed via built-in `node:sqlite`)
- **Stable MCP Wrapper:** `~/.hermes/commerce-control/commerce-control-mcp.sh`
- **Stable CLI Wrapper:** `~/.hermes/commerce-control/commerce-control-cli.sh`
- **Install Logs:** `~/.hermes/commerce-control/install.log`

---

## The Mode-A Security Boundary

This control plane operates strictly under **Mode A** (Read-Only Planning and Discovery). 

### Security Invariants (Always Enforced)
- **EXTERNAL_WRITES_ENABLED = false:** (Stage B1 not implemented). Any write operations to external services, publishing production services, submitting bounties, or executing state-mutating actions are blocked.
- **LIVE_VALUE_MOVEMENT_ENABLED = false:** (Stage B2 not implemented). Transferring funds, signing transactions, setting up payment channels, or interacting with live mainnets (such as Base or Solana) is blocked.
- **No Wallet Secret Presence:** The control plane actively detects and refuses to run if any wallet/signing secret variable is present in its environment. The stable wrappers actively scrub wallet-related environment variable keys (like `*_PRIVATE_KEY*`, `*MNEMONIC*`, `*SEED_PHRASE*`, `*NWC*`, etc.) before booting the process to ensure absolute separation.

---

## Platforms & Adapters

The control plane coordinates with eight machine-commerce and bounty discovery platforms through lightweight adapters:

### Primary Adapters
- **CDP Bazaar (x402):** Discover machine-native HTTP service catalogs registered via Coinbase Developer Platform.
- **Agent402.Tools:** Discover tool schemas, pricing, and routes.
- **PipRail:** Discover micro-payment routing and walletless paths.
- **Agent Bounties:** Discover and index open claimable programmatic task rewards.

### Secondary Adapters
- **BountyBook:** Index open jobs, budgets, and criteria.
- **TryBounty:** Read-only scan of the public Recent Jobs board; payout/onboarding details remain unresolved and no claim path is exposed.
- **the402:** Discover agent-facing capabilities and catalog postings.
- **Pay.sh / pay-skills:** Extract Solana payment-prose metadata from service files.

### Graceful Degradation Behavior
All platform communication uses the shared safe-network layer. If an upstream platform is rate-limited (429), slow (timeout), down (5xx), returns malformed data, or is unreachable:
- The error is captured, typed, and recorded as a warning or partial degradation.
- Aggregate operations (such as multi-source discovery or health probing) **continue** instead of failing.
- Unreachable or degraded adapters are flagged in the status scorecard rather than crashing the control plane.

---

## Installation, Uninstallation & Recovery

### Pre-requisites
- **Node.js:** Version 24 is required (built-in `node:sqlite`/`DatabaseSync` support).
- **npm:** For installing locked exact package dependencies.

### Installation
To install the package and configure the stable wrappers, execute the native installer from the package root:
```bash
# Run local-only installation (compiles, validates, and sets up wrappers, skips Hermes registration)
bash scripts/install-hermes-commerce-control.sh --skip-register

# To perform full Hermes registration (when running inside a Hermes-enabled environment)
bash scripts/install-hermes-commerce-control.sh
```

### Uninstallation
To completely remove the control plane from your system, execute the following commands:
```bash
# 1. If registered in Hermes, remove the MCP server
if command -v hermes >/dev/null 2>&1; then
  hermes mcp remove commerce-control || true
fi

# 2. Delete the wrappers and state directory
rm -rf ~/.hermes/commerce-control/

# 3. Clean local package build outputs
cd tools/hermes-commerce-control
rm -rf dist/ node_modules/
```

### Self-Diagnostics & Recovery
The system features a built-in doctor command to audit the local environment:
```bash
# Run doctor via wrapper
~/.hermes/commerce-control/commerce-control-cli.sh doctor

# Run doctor with raw JSON output
~/.hermes/commerce-control/commerce-control-cli.sh doctor --json
```

If the doctor reports a **FAIL**:
1. **Wallet Secret present:** Check if your shell has active `PRIVATE_KEY` or `MNEMONIC` exports. Although the wrapper unsets these, verify no nested launching process is overriding this.
2. **State Root Unwritable:** Ensure `~/.hermes/commerce-control/` has appropriate read/write permissions for the current Termux user.
3. **Node/SQLite issue:** Ensure you are running Node 24 and that `node:sqlite` is compiled into the binary.

---

## Command Reference

### CLI Usage
Run the stable wrapper `~/.hermes/commerce-control/commerce-control-cli.sh` with the following commands:
- `status`: Show local state counts, configuration, and Mode-A status.
- `discover services`: Query active service platforms and rank results deterministically.
- `discover work`: Query active job platforms for open, funded, and earnable tasks.
- `inspect <target>`: Resolve platform details and capability schema for a specific canonical ID or `platform:externalId`.
- `quote <target>`: Create a non-executable quote for a canonical service.
- `prepare purchase <target>`: Formulate a blocked, dry-run intent to buy a service.
- `prepare claim <target>`: Formulate a blocked, dry-run intent to claim/submit a bounty.
- `prepare publish <product>`: Assess local product readiness and prepare a blocked publish draft.
- `probe`: Perform on-demand, non-blocking read-only health checks on all platforms.
- `export`: Flush sanitized discovery evidence, scorecards, and receipts to the git repository.
- `doctor`: Verify system prerequisites and Mode-A compliance.

### Standalone MCP Handshake
The MCP server communicates strictly over stdio and exposes exactly **11 canonical tools**:
1. `commerce_status`
2. `commerce_sources`
3. `commerce_discover_services`
4. `commerce_discover_work`
5. `commerce_inspect`
6. `commerce_quote`
7. `commerce_prepare_purchase`
8. `commerce_prepare_claim`
9. `commerce_prepare_publish`
10. `commerce_probe`
11. `commerce_export_evidence`

No mutating or live execution tools (such as `commerce_pay`, `commerce_purchase`, or `commerce_claim`) exist in this codebase.

---

## Live Read-Only Probes & Sanity Checks

To query active decentralized platforms without writing data or making payments, run the probe CLI command or use the standalone probe script:
```bash
# Execute local non-blocking probes via CLI
~/.hermes/commerce-control/commerce-control-cli.sh probe

# Execute exports of sanitized observations to the repository
~/.hermes/commerce-control/commerce-control-cli.sh export
```

---

## Deferred Hermes Runtime Instructions

Because actual Hermes environment registration and live runtime operations are intentionally deferred to a later execution phase, the operator or Hermes should run the following commands sequentially to activate and verify the installation:

1. **Clean workspace & verify SHA:**
   Verify that the workspace matches the pushed, validated Git state.
2. **Run the Native Installer:**
   ```bash
   cd tools/hermes-commerce-control
   bash scripts/install-hermes-commerce-control.sh --force
   ```
   This compiles, writes stable wrappers, and registers the unified `commerce-control` stdio MCP server inside Hermes.
3. **Verify the MCP Server Registration:**
   ```bash
   hermes mcp list
   ```
   Assert that `commerce-control` is listed with the command set to `~/.hermes/commerce-control/commerce-control-mcp.sh`.
4. **Inspect Registered Tooling:**
   ```bash
   hermes mcp list-tools commerce-control
   ```
   Verify that exactly the 11 canonical tools are exposed, and no live-action or payment-related tools are present.
5. **Execute Read-Only Live Probes:**
   Trigger the live probe through Hermes:
   ```bash
   hermes mcp call commerce-control commerce_probe '{}'
   ```
6. **Export Sanities to Git:**
   Command Hermes to export the verified live platform findings to the shared repository:
   ```bash
   hermes mcp call commerce-control commerce_export_evidence '{}'
   ```
7. **Finalize the Receipts & Handoffs:**
   Verify that the exported files under `research/normalized/` and `receipts/` have been generated with accurate platform statistics and a clean Mode-A assertion.
