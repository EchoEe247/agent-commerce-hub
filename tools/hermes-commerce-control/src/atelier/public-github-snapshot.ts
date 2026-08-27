import type { PublicRepoSnapshot } from "./readme-setup-fix.js";

const API = "https://api.github.com";
const MAX_TEXT_BYTES = 1_000_000;

export interface ParsedGitHubRepo {
  readonly owner: string;
  readonly repo: string;
  readonly canonicalUrl: string;
}

type JsonObject = Record<string, unknown>;

export function parsePublicGitHubRepoUrl(input: string): ParsedGitHubRepo {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("repo_url must be a valid URL");
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") {
    throw new Error("repo_url must use https://github.com");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("repo_url must not contain credentials, query parameters, or fragments");
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 2) throw new Error("repo_url must point to a repository root");
  const owner = parts[0];
  const repo = parts[1]?.replace(/\.git$/i, "");
  if (!owner || !repo || !/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error("repo_url contains an invalid owner or repository name");
  }
  return Object.freeze({ owner, repo, canonicalUrl: `https://github.com/${owner}/${repo}` });
}

function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

async function apiGetJson(url: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, {
    method: "GET",
    redirect: "error",
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "agent-commerce-hub-atelier-readme-fix/1.0",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  let body: unknown = raw;
  if (raw.trim()) {
    try {
      body = JSON.parse(raw) as unknown;
    } catch {
      body = raw;
    }
  }
  return { status: response.status, body };
}

async function apiGetText(url: string): Promise<{ status: number; text: string | null }> {
  const response = await fetch(url, {
    method: "GET",
    redirect: "error",
    headers: {
      Accept: "application/vnd.github.raw+json",
      "User-Agent": "agent-commerce-hub-atelier-readme-fix/1.0",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 404) return { status: 404, text: null };
  if (!response.ok) return { status: response.status, text: null };
  const length = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_TEXT_BYTES) {
    throw new Error(`repository file exceeds ${MAX_TEXT_BYTES} byte safety limit`);
  }
  const raw = await response.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_TEXT_BYTES) {
    throw new Error(`repository file exceeds ${MAX_TEXT_BYTES} byte safety limit`);
  }
  return { status: response.status, text: raw };
}

function contentsUrl(owner: string, repo: string, path: string, branch: string): string {
  return `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}?ref=${encodeURIComponent(branch)}`;
}

export async function fetchPublicRepoSnapshot(repoUrl: string): Promise<PublicRepoSnapshot> {
  const parsed = parsePublicGitHubRepoUrl(repoUrl);
  const repoEndpoint = `${API}/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
  const metadataResponse = await apiGetJson(repoEndpoint);
  if (metadataResponse.status === 404) throw new Error("public GitHub repository was not found");
  if (metadataResponse.status === 403 || metadataResponse.status === 429) {
    throw new Error("GitHub public API rate limit reached; retry later");
  }
  if (metadataResponse.status !== 200) {
    throw new Error(`GitHub repository lookup failed with HTTP ${metadataResponse.status}`);
  }
  const metadata = asObject(metadataResponse.body);
  if (metadata.private === true) throw new Error("private repositories are outside this service scope");
  const defaultBranch = typeof metadata.default_branch === "string" && metadata.default_branch.trim()
    ? metadata.default_branch.trim()
    : "main";

  const readmeUrl = `${API}/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/readme?ref=${encodeURIComponent(defaultBranch)}`;
  const paths = [
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "requirements.txt",
    "pyproject.toml",
    "go.mod",
    "Cargo.toml",
    "Dockerfile",
  ] as const;

  const [readme, ...files] = await Promise.all([
    apiGetText(readmeUrl),
    ...paths.map((path) => apiGetText(contentsUrl(parsed.owner, parsed.repo, path, defaultBranch))),
  ]);
  const byPath = new Map(paths.map((path, index) => [path, files[index]?.text ?? null]));

  return Object.freeze({
    repoUrl: parsed.canonicalUrl,
    defaultBranch,
    readme: readme.text,
    packageJson: byPath.get("package.json") ?? null,
    packageLock: byPath.get("package-lock.json") !== null,
    pnpmLock: byPath.get("pnpm-lock.yaml") !== null,
    yarnLock: byPath.get("yarn.lock") !== null,
    requirementsTxt: byPath.get("requirements.txt") ?? null,
    pyprojectToml: byPath.get("pyproject.toml") ?? null,
    goMod: byPath.get("go.mod") ?? null,
    cargoToml: byPath.get("Cargo.toml") ?? null,
    dockerfile: byPath.get("Dockerfile") ?? null,
  });
}
