# Hermes Commerce Control Plane

Unified agent-commerce command center and Model Context Protocol (MCP) server for local discovery, ranking, evidence capture, and preparation-only machine-commerce workflows.

> **Publication status:** this package is still marked `private` while provenance and licensing are under review. The portable package work described here is an engineering/readiness change, not permission to publish it to npm or apply an OSS license yet.

## Architecture

The control plane is a Node.js 24 TypeScript package with two supported process entrypoints:

1. **CLI launcher:** `dist/launch/cli.js` (`commerce` package bin)
2. **MCP launcher:** `dist/launch/mcp.js` (`commerce-mcp` package bin)

Both launchers harden the environment **before dynamically importing application code**. This makes the Mode-A launch boundary part of the Node package itself instead of depending on a generated Bash wrapper.

The implementation modules remain reusable libraries:

- `src/cli.ts` — command implementation and `runCli()`
- `src/mcp/server.ts` — MCP server implementation and `serveStdio()`
- `src/launch/safe-env.ts` — wallet/signing-secret removal and forced Mode-A gates

## Runtime and state

### Portable package defaults

When run without installer-specific overrides:

- **State root:** `~/.hermes/commerce-control/`
- **SQLite database:** `~/.hermes/commerce-control/state.db`
- **Repository/workspace root:** `process.cwd()`

`COMMERCE_REPO_ROOT` is optional. When explicitly supplied it selects the local repository/workspace used for product inspection and evidence export. The package does **not** need to live inside `agent-commerce-hub`.

### Hermes installer layout

The Hermes integration installer creates:

- `~/.hermes/commerce-control/commerce-control-mcp.sh`
- `~/.hermes/commerce-control/commerce-control-cli.sh`
- `~/.hermes/commerce-control/state/`
- `~/.hermes/commerce-control/install.log`

These wrappers are intentionally thin. They set the installer-specific state root and execute the hardened Node launchers; they do not duplicate wallet-secret scrubbing or the Mode-A gate logic.

The installer does **not** derive a workspace from the package's monorepo location. With no workspace option it leaves `COMMERCE_REPO_ROOT` unset. An operator who needs deterministic evidence/product paths for a long-lived Hermes registration can pin an explicit existing workspace with `--workspace PATH`.

---

## Mode-A security boundary

The control plane operates under **Mode A**: discovery, local persistence, inspection, ranking, evidence export, and preparation-only intents.

### Enforced launch invariants

The hardened CLI and MCP launchers:

- remove inherited environment variables whose names indicate wallet or financial-signing authority, including private keys, mnemonics, seed phrases, signing keys, keystores, xprv values, and NWC values;
- force `COMMERCE_MODE=A`;
- force `EXTERNAL_WRITES_ENABLED=false`;
- force `LIVE_VALUE_MOVEMENT_ENABLED=false`;
- preserve ordinary non-wallet configuration such as API credentials and an explicitly configured `COMMERCE_REPO_ROOT`.

The hardening happens before the launcher imports `cli.ts` or `mcp/server.ts`. Wallet values are never copied into diagnostic output; tests deal with variable **names** only.

The doctor command independently reports whether wallet/signing-secret variables are visible to the process. This provides a useful control check when testing direct/internal entrypoints versus the hardened launchers.

### Capability boundary

There is no live pay, purchase, claim, settlement, transfer, withdrawal, funding, or production-publish tool in the exposed MCP surface. Preparation commands produce reviewable intents and policy decisions; they do not execute the external action.

---

## Platforms and adapters

The control plane currently coordinates seven machine-commerce sources through bounded adapters.

### Primary adapters

- **CDP Bazaar / x402** — discover machine-native HTTP service catalogs.
- **Agent402.Tools** — discover tool schemas, pricing, and routes.
- **PipRail** — discover service/payment-routing metadata without exposing a signer.
- **Agent Bounties** — discover open programmatic work/reward inventory.

### Secondary adapters

- **BountyBook**
- **the402**
- **Pay.sh / pay-skills**

Network failures degrade individual sources rather than crashing aggregate discovery. Timeouts, rate limits, malformed responses, and upstream outages are recorded as typed degraded/unreachable results.

---

## Build and portable local use

### Requirements

- Node.js `>=24.15.0 <25`
- npm

From this package directory:

```bash
npm ci
npm run build
npm run typecheck
npm test
npm run test:contracts
```

Run the hardened CLI directly from the build:

```bash
node dist/launch/cli.js doctor --json
node dist/launch/cli.js status --json
node dist/launch/cli.js probe
```

Run the hardened stdio MCP entrypoint:

```bash
node dist/launch/mcp.js
```

The package metadata also defines these future installable bins:

```text
commerce     -> dist/launch/cli.js
commerce-mcp -> dist/launch/mcp.js
```

The package remains `private` until the separate provenance/license gate is cleared.

### Workspace selection

By default, repository-facing operations use the caller's current working directory:

```bash
cd /path/to/a/workspace
node /path/to/hermes-commerce-control/dist/launch/cli.js export
```

Or set an explicit local workspace:

```bash
COMMERCE_REPO_ROOT=/path/to/a/workspace \
  node dist/launch/cli.js export
```

No installer should silently replace this portable behavior with the package's own monorepo location.

---

## Hermes integration

Build, validate, and create local wrappers without changing Hermes registration:

```bash
bash scripts/install-hermes-commerce-control.sh --skip-register
```

Perform full local Hermes integration using runtime CWD as the default workspace behavior:

```bash
bash scripts/install-hermes-commerce-control.sh
```

For a persistent Hermes registration that should always inspect/export against one known repository, pin that choice explicitly:

```bash
bash scripts/install-hermes-commerce-control.sh \
  --workspace /absolute/path/to/workspace
```

Other supported options:

```text
--skip-deps       reuse the current dependency tree
--skip-register   validate/install wrappers without modifying Hermes registration
--force           remove and re-add an existing commerce-control MCP registration
--workspace PATH  explicitly pin COMMERCE_REPO_ROOT in generated wrappers
```

The installer validates Node `>=24.15.0 <25`, builds the package, proves the direct doctor sees a fake wallet canary while the hardened launcher removes it, proves hostile inherited gate values normalize back to Mode A, runs the doctor through the hardened wrapper, and verifies the exact MCP tool set before registration.

Do not publish the package or remove `private: true` merely because the installer works.

---

## Command reference

The CLI supports:

- `sources`
- `status`
- `discover services`
- `discover work`
- `inspect <target>`
- `quote <target>`
- `prepare purchase <target>`
- `prepare claim <target>`
- `prepare publish <product>`
- `probe`
- `export`
- `doctor`

`--json` keeps stdout machine-readable; diagnostics go to stderr.

## MCP surface

The stdio server exposes exactly these 11 canonical tools:

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

No live-action sibling is part of the exposed tool set.

---

## Validation expectations

A portability/security validation should prove all of the following before this branch is merged:

1. `npm ci`, build, typecheck, full tests, and contract tests pass on Node 24.
2. `package-lock.json` is regenerated so its root `bin` metadata matches `package.json`.
3. With a canary wallet variable present, `node dist/launch/cli.js doctor --json` reports `walletSecretPresent:false`.
4. The direct internal CLI path still detects the canary, proving the launcher—not the test—is removing it.
5. The MCP launcher answers initialize + `tools/list` over stdio and exposes exactly 11 safe tools.
6. Setting hostile gate values in the parent environment cannot change Mode A through the hardened launcher.
7. With `COMMERCE_REPO_ROOT` unset, workspace-relative behavior follows the caller's current working directory instead of the package's monorepo location.
8. `--workspace PATH` pins only an explicitly requested workspace and does not reintroduce an inferred monorepo dependency.
9. The installer passes with an isolated temporary `HERMES_HOME` and does not touch production Hermes state.
10. No package is published and no licensing/provenance status is changed by portability validation.

---

## Uninstallation of the Hermes integration layout

```bash
if command -v hermes >/dev/null 2>&1; then
  hermes mcp remove commerce-control || true
fi

rm -rf ~/.hermes/commerce-control/
```

Package-local build outputs can be removed independently:

```bash
rm -rf dist/ node_modules/
```
