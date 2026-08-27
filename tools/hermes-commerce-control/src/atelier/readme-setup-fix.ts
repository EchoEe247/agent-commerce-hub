export type RepoStack = "node" | "python" | "go" | "rust" | "unknown";

export interface PublicRepoSnapshot {
  readonly repoUrl: string;
  readonly defaultBranch: string;
  readonly readme: string | null;
  readonly packageJson: string | null;
  readonly packageLock: boolean;
  readonly pnpmLock: boolean;
  readonly yarnLock: boolean;
  readonly requirementsTxt: string | null;
  readonly pyprojectToml: string | null;
  readonly goMod: string | null;
  readonly cargoToml: string | null;
  readonly dockerfile: string | null;
}

export interface SetupIssue {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
}

export interface SetupFixResult {
  readonly stack: RepoStack;
  readonly packageManager: "npm" | "pnpm" | "yarn" | null;
  readonly issues: readonly SetupIssue[];
  readonly verifiedCommands: readonly string[];
  readonly suggestedReadmeSection: string;
  readonly reportMarkdown: string;
}

type JsonObject = Record<string, unknown>;

function parseJsonObject(value: string | null): JsonObject | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as JsonObject)
      : null;
  } catch {
    return null;
  }
}

function packageScripts(packageJson: string | null): Readonly<Record<string, string>> {
  const parsed = parseJsonObject(packageJson);
  if (!parsed) return Object.freeze({});
  const raw = parsed.scripts;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return Object.freeze({});
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as JsonObject)) {
    if (typeof value === "string" && value.trim()) out[key] = value.trim();
  }
  return Object.freeze(out);
}

function detectStack(snapshot: PublicRepoSnapshot): RepoStack {
  if (snapshot.packageJson) return "node";
  if (snapshot.pyprojectToml || snapshot.requirementsTxt) return "python";
  if (snapshot.goMod) return "go";
  if (snapshot.cargoToml) return "rust";
  return "unknown";
}

function detectPackageManager(snapshot: PublicRepoSnapshot): "npm" | "pnpm" | "yarn" | null {
  if (!snapshot.packageJson) return null;
  if (snapshot.pnpmLock) return "pnpm";
  if (snapshot.yarnLock) return "yarn";
  return "npm";
}

function readmeCommands(readme: string | null): string[] {
  if (!readme) return [];
  const commands: string[] = [];
  for (const match of readme.matchAll(/```(?:bash|sh|shell|console)?\s*\n([\s\S]*?)```/gi)) {
    const body = match[1] ?? "";
    for (const line of body.split(/\r?\n/)) {
      const cleaned = line.trim().replace(/^\$\s*/, "");
      if (cleaned && !cleaned.startsWith("#")) commands.push(cleaned);
    }
  }
  return commands;
}

function hasHeading(readme: string | null, words: readonly string[]): boolean {
  if (!readme) return false;
  return readme
    .split(/\r?\n/)
    .some((line) => /^#{1,6}\s+/.test(line) && words.some((word) => line.toLowerCase().includes(word)));
}

function npmScriptFromCommand(command: string): string | null {
  const npmRun = command.match(/^npm\s+run\s+([\w:.-]+)(?:\s|$)/i);
  if (npmRun?.[1]) return npmRun[1];
  if (/^npm\s+test(?:\s|$)/i.test(command)) return "test";
  if (/^npm\s+start(?:\s|$)/i.test(command)) return "start";

  const alt = command.match(/^(pnpm|yarn)(?:\s+run)?\s+([\w:.-]+)(?:\s|$)/i);
  const candidate = alt?.[2]?.toLowerCase();
  if (!candidate) return null;
  if (["install", "add", "remove", "update", "upgrade", "exec", "dlx"].includes(candidate)) return null;
  return alt?.[2] ?? null;
}

function managerFromCommand(command: string): "npm" | "pnpm" | "yarn" | null {
  if (/^npm\b/i.test(command)) return "npm";
  if (/^pnpm\b/i.test(command)) return "pnpm";
  if (/^yarn\b/i.test(command)) return "yarn";
  return null;
}

function commandBlock(commands: readonly string[]): string {
  return commands.length ? `\n\`\`\`bash\n${commands.join("\n")}\n\`\`\`` : "";
}

function nodeCommands(manager: "npm" | "pnpm" | "yarn", scripts: Readonly<Record<string, string>>): string[] {
  const install = manager === "npm" ? "npm install" : `${manager} install`;
  const run = (script: string): string => {
    if (manager === "npm") return script === "start" || script === "test" ? `npm ${script}` : `npm run ${script}`;
    if (manager === "pnpm") return `pnpm ${script}`;
    return `yarn ${script}`;
  };
  const commands = [install];
  for (const preferred of ["dev", "start", "build", "test"] as const) {
    if (scripts[preferred]) commands.push(run(preferred));
  }
  return commands;
}

function pythonCommands(snapshot: PublicRepoSnapshot): string[] {
  const commands = ["python -m venv .venv", "source .venv/bin/activate"];
  if (snapshot.requirementsTxt) commands.push("python -m pip install -r requirements.txt");
  else if (snapshot.pyprojectToml) commands.push("python -m pip install .");
  return commands;
}

function buildVerifiedCommands(
  snapshot: PublicRepoSnapshot,
  stack: RepoStack,
  manager: "npm" | "pnpm" | "yarn" | null,
  scripts: Readonly<Record<string, string>>,
): string[] {
  if (stack === "node" && manager) return nodeCommands(manager, scripts);
  if (stack === "python") return pythonCommands(snapshot);
  if (stack === "go") return ["go mod download", "go build ./...", "go test ./..."];
  if (stack === "rust") return ["cargo build", "cargo test"];
  if (snapshot.dockerfile) return ["docker build -t app ."];
  return [];
}

export function analyzeReadmeSetup(snapshot: PublicRepoSnapshot): SetupFixResult {
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/i.test(snapshot.repoUrl.trim())) {
    throw new Error("repoUrl must be a public GitHub repository URL");
  }

  const stack = detectStack(snapshot);
  const packageManager = detectPackageManager(snapshot);
  const scripts = packageScripts(snapshot.packageJson);
  const commands = readmeCommands(snapshot.readme);
  const issues: SetupIssue[] = [];

  if (!snapshot.readme) {
    issues.push({ code: "missing_readme", severity: "error", message: "Repository has no README to guide setup." });
  } else {
    if (!hasHeading(snapshot.readme, ["install", "setup", "getting started"])) {
      issues.push({ code: "missing_setup_heading", severity: "warning", message: "README has no clear installation/setup section." });
    }
    if (!hasHeading(snapshot.readme, ["run", "usage", "start", "development"])) {
      issues.push({ code: "missing_run_heading", severity: "warning", message: "README has no clear run/usage section." });
    }
  }

  if (stack === "node" && packageManager) {
    const managers = new Set(commands.map(managerFromCommand).filter((value): value is "npm" | "pnpm" | "yarn" => value !== null));
    if (managers.size > 0 && !managers.has(packageManager)) {
      issues.push({
        code: "package_manager_mismatch",
        severity: "warning",
        message: `README commands use ${[...managers].join("/")} but repository lockfiles indicate ${packageManager}.`,
      });
    }
    for (const command of commands) {
      const script = npmScriptFromCommand(command);
      if (script && !scripts[script]) {
        issues.push({
          code: "missing_package_script",
          severity: "error",
          message: `README references package script '${script}', but package.json does not define it.`,
        });
      }
    }
    if (Object.keys(scripts).length === 0) {
      issues.push({ code: "no_package_scripts", severity: "warning", message: "package.json has no runnable scripts to document." });
    }
  }

  if (stack === "python" && snapshot.requirementsTxt && snapshot.readme && !/pip\s+install\s+-r\s+requirements\.txt/i.test(snapshot.readme)) {
    issues.push({
      code: "requirements_not_documented",
      severity: "warning",
      message: "requirements.txt exists but README does not document installing it.",
    });
  }

  const verifiedCommands = buildVerifiedCommands(snapshot, stack, packageManager, scripts);
  if (verifiedCommands.length === 0) {
    issues.push({
      code: "no_deterministic_setup_path",
      severity: "warning",
      message: "No supported manifest was found, so setup commands cannot be verified deterministically.",
    });
  }

  const heading = stack === "unknown" ? "## Setup" : `## Setup (${stack})`;
  const notes = snapshot.dockerfile && stack !== "unknown"
    ? "\n\nDockerfile detected; containerized setup may also be available."
    : "";
  const suggestedReadmeSection = `${heading}\n\nVerified from repository manifests:${commandBlock(verifiedCommands)}${notes}`;

  const issueLines = issues.length
    ? issues.map((issue) => `- **${issue.severity.toUpperCase()} — ${issue.code}:** ${issue.message}`).join("\n")
    : "- No deterministic setup inconsistencies detected.";

  const reportMarkdown = [
    "# README & Setup Fix Report",
    "",
    `Repository: ${snapshot.repoUrl}`,
    `Detected stack: ${stack}`,
    `Package manager: ${packageManager ?? "n/a"}`,
    "",
    "## Issues found",
    issueLines,
    "",
    "## Suggested README replacement/addition",
    "",
    suggestedReadmeSection,
    "",
    "## Scope",
    "This report checks public repository setup documentation against deterministic repository manifests. It does not modify the repository, execute untrusted project code, or access private credentials.",
  ].join("\n");

  return Object.freeze({
    stack,
    packageManager,
    issues: Object.freeze([...issues]),
    verifiedCommands: Object.freeze([...verifiedCommands]),
    suggestedReadmeSection,
    reportMarkdown,
  });
}
