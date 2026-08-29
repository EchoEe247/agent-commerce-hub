import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_ROOT = path.join(ROOT, "src");

const PRIVATE_DOCKER_PATHS = [
  "scripts/",
  "test/",
  "docs/",
  "src/discovery/",
  "src/payments/agent402-buyer-policy.mjs",
  "src/payments/financial-store.mjs",
  "src/payments/ledger.mjs",
  "src/payments/reconciliation.mjs",
];

const PRIVATE_RUNTIME_PREFIXES = [
  "src/discovery/",
];

const PRIVATE_RUNTIME_FILES = new Set([
  "src/payments/agent402-buyer-policy.mjs",
  "src/payments/financial-store.mjs",
  "src/payments/ledger.mjs",
  "src/payments/reconciliation.mjs",
]);

function posixRelative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function localImportSpecifiers(source) {
  const specifiers = new Set();
  const patterns = [
    /\bfrom\s+["'](\.{1,2}\/[^"']+)["']/g,
    /\bimport\s+["'](\.{1,2}\/[^"']+)["']/g,
    /\bimport\s*\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
  }
  return [...specifiers];
}

function resolveLocalImport(importer, specifier) {
  const base = path.resolve(path.dirname(importer), specifier);
  const candidates = [base, `${base}.mjs`, path.join(base, "index.mjs")];
  const resolved = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  assert.ok(resolved, `Unable to resolve local import ${specifier} from ${posixRelative(importer)}`);
  assert.ok(
    resolved === SRC_ROOT || resolved.startsWith(`${SRC_ROOT}${path.sep}`),
    `Public runtime import escapes src/: ${posixRelative(resolved)}`,
  );
  return resolved;
}

function collectPublicServerGraph() {
  const entry = path.join(SRC_ROOT, "server.mjs");
  const queue = [entry];
  const visited = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);

    const source = fs.readFileSync(current, "utf8");
    for (const specifier of localImportSpecifiers(source)) {
      const resolved = resolveLocalImport(current, specifier);
      if (!visited.has(resolved)) queue.push(resolved);
    }
  }

  return new Set([...visited].map(posixRelative));
}

test("Docker build context excludes repository-only operator and private financial code", () => {
  const dockerignore = fs.readFileSync(path.join(ROOT, ".dockerignore"), "utf8");
  const rules = new Set(
    dockerignore
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  );

  for (const requiredRule of PRIVATE_DOCKER_PATHS) {
    assert.ok(rules.has(requiredRule), `.dockerignore must exclude ${requiredRule}`);
  }

  const dockerfile = fs.readFileSync(path.join(ROOT, "Dockerfile"), "utf8");
  assert.match(dockerfile, /^COPY\s+src\s+\.\/src\s*$/m, "Dockerfile must copy the explicit public src tree");
  assert.doesNotMatch(dockerfile, /^COPY\s+\.\s+/m, "Dockerfile must not copy the whole build context");
  assert.doesNotMatch(dockerfile, /^COPY\s+scripts(?:\/|\s)/m, "Dockerfile must not copy operator scripts");
  assert.doesNotMatch(dockerfile, /^COPY\s+test(?:\/|\s)/m, "Dockerfile must not copy tests");
});

test("public seller server import graph excludes buyer, reconciliation, and private financial modules", () => {
  const reachable = collectPublicServerGraph();

  assert.ok(reachable.has("src/server.mjs"));
  assert.ok(reachable.has("src/payments/x402-plugin.mjs"), "seller payment enforcement must remain in the public runtime");

  for (const privateFile of PRIVATE_RUNTIME_FILES) {
    assert.equal(reachable.has(privateFile), false, `${privateFile} must not be reachable from src/server.mjs`);
  }

  for (const reachableFile of reachable) {
    for (const privatePrefix of PRIVATE_RUNTIME_PREFIXES) {
      assert.equal(
        reachableFile.startsWith(privatePrefix),
        false,
        `${reachableFile} must not be reachable from src/server.mjs`,
      );
    }
  }
});
