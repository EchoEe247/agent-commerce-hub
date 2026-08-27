import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeReadmeSetup,
  type PublicRepoSnapshot,
} from "../src/atelier/readme-setup-fix.js";

function snapshot(overrides: Partial<PublicRepoSnapshot> = {}): PublicRepoSnapshot {
  return {
    repoUrl: "https://github.com/example/project",
    defaultBranch: "main",
    readme: "# Project\n",
    packageJson: null,
    packageLock: false,
    pnpmLock: false,
    yarnLock: false,
    requirementsTxt: null,
    pyprojectToml: null,
    goMod: null,
    cargoToml: null,
    dockerfile: null,
    ...overrides,
  };
}

test("node repo produces verified commands from package scripts", () => {
  const result = analyzeReadmeSetup(snapshot({
    readme: "# Demo\n\n## Setup\n```bash\nnpm install\n```\n\n## Run\n```bash\nnpm run dev\n```\n",
    packageJson: JSON.stringify({ scripts: { dev: "vite", build: "vite build", test: "node --test" } }),
    packageLock: true,
  }));

  assert.equal(result.stack, "node");
  assert.equal(result.packageManager, "npm");
  assert.deepEqual(result.verifiedCommands, ["npm install", "npm run dev", "npm run build", "npm test"]);
  assert.equal(result.issues.some((issue) => issue.code === "missing_package_script"), false);
});

test("node repo flags README references to missing scripts", () => {
  const result = analyzeReadmeSetup(snapshot({
    readme: "# Demo\n\n## Setup\n```bash\nnpm install\n```\n\n## Run\n```bash\nnpm run serve\n```\n",
    packageJson: JSON.stringify({ scripts: { dev: "vite" } }),
    packageLock: true,
  }));

  assert.equal(result.issues.some((issue) => issue.code === "missing_package_script"), true);
  assert.match(result.reportMarkdown, /package script 'serve'/);
});

test("pnpm install is not mistaken for a package script", () => {
  const result = analyzeReadmeSetup(snapshot({
    readme: "# Demo\n\n## Setup\n```bash\npnpm install\n```\n\n## Run\n```bash\npnpm dev\n```\n",
    packageJson: JSON.stringify({ scripts: { dev: "vite" } }),
    pnpmLock: true,
  }));

  assert.equal(result.packageManager, "pnpm");
  assert.equal(result.issues.some((issue) => issue.code === "missing_package_script"), false);
  assert.deepEqual(result.verifiedCommands, ["pnpm install", "pnpm dev"]);
});

test("package-manager mismatch is detected from lockfile evidence", () => {
  const result = analyzeReadmeSetup(snapshot({
    readme: "# Demo\n\n## Setup\n```bash\nnpm install\n```\n\n## Run\n```bash\nnpm run dev\n```\n",
    packageJson: JSON.stringify({ scripts: { dev: "vite" } }),
    pnpmLock: true,
  }));

  assert.equal(result.issues.some((issue) => issue.code === "package_manager_mismatch"), true);
});

test("python repo documents deterministic venv and requirements setup", () => {
  const result = analyzeReadmeSetup(snapshot({
    readme: "# API\n\n## Usage\nRun the API locally.\n",
    requirementsTxt: "flask==3.0.0\n",
  }));

  assert.equal(result.stack, "python");
  assert.deepEqual(result.verifiedCommands, [
    "python -m venv .venv",
    "source .venv/bin/activate",
    "python -m pip install -r requirements.txt",
  ]);
  assert.equal(result.issues.some((issue) => issue.code === "requirements_not_documented"), true);
});

test("go repo emits standard deterministic setup commands", () => {
  const result = analyzeReadmeSetup(snapshot({
    readme: "# Go Tool\n\n## Setup\nInstall Go.\n\n## Usage\nRun the binary.\n",
    goMod: "module example.com/tool\n\ngo 1.24\n",
  }));

  assert.equal(result.stack, "go");
  assert.deepEqual(result.verifiedCommands, ["go mod download", "go build ./...", "go test ./..."]);
});

test("unknown repo fails safely instead of inventing commands", () => {
  const result = analyzeReadmeSetup(snapshot());
  assert.equal(result.stack, "unknown");
  assert.deepEqual(result.verifiedCommands, []);
  assert.equal(result.issues.some((issue) => issue.code === "no_deterministic_setup_path"), true);
});

test("non-GitHub input is rejected", () => {
  assert.throws(
    () => analyzeReadmeSetup(snapshot({ repoUrl: "https://example.com/private/repo" })),
    /public GitHub repository URL/,
  );
});
