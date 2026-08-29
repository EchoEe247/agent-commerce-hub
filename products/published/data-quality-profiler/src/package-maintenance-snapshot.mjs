import { readResponseTextBounded, ResponseBodyLimitError } from "./bounded-response.mjs";

const NPM_REGISTRY_BASE = "https://registry.npmjs.org";
const PYPI_BASE = "https://pypi.org/pypi";
const REQUEST_TIMEOUT_MS = 10000;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const USER_AGENT = "Hermes Commerce https://hermes-counterparty-api.onrender.com";
const DAY_MS = 24 * 60 * 60 * 1000;

export function createPackageMaintenanceSnapshot({ fetchImpl = globalThis.fetch, clock = { now: () => Date.now() } } = {}) {
  return async function packageMaintenanceSnapshot(payload) {
    const query = normalizeRequest(payload);
    if (query.ecosystem === "npm") return npmSnapshot(query);
    return pypiSnapshot(query);
  };

  async function npmSnapshot(query) {
    const metadataUrl = `${NPM_REGISTRY_BASE}/${encodeURIComponent(query.package)}`;
    const packument = await fetchJson(metadataUrl, "PACKAGE_NOT_FOUND: npm package was not found");
    const requested = packument?.versions?.[query.version];
    if (!requested || typeof requested !== "object") {
      throw new Error("PACKAGE_VERSION_NOT_FOUND: requested npm package version was not found");
    }
    const latestVersion = stringOrNull(packument?.["dist-tags"]?.latest);
    const requestedPublishedAt = isoOrNull(packument?.time?.[query.version]);
    const latestPublishedAt = latestVersion ? isoOrNull(packument?.time?.[latestVersion]) : null;
    const createdAt = isoOrNull(packument?.time?.created);
    const now = clock.now();
    const deprecatedReason = stringOrNull(requested?.deprecated);
    return buildResult({
      query,
      now,
      packageData: {
        name: stringOrNull(requested?.name) ?? stringOrNull(packument?.name) ?? query.package,
        requested_version: query.version,
        latest_version: latestVersion,
        requested_is_latest: latestVersion === query.version,
        description: stringOrNull(requested?.description) ?? stringOrNull(packument?.description),
        deprecated: Boolean(deprecatedReason),
        deprecated_reason: deprecatedReason,
        yanked: false,
        yanked_reason: null,
        license: normalizeLicense(requested?.license ?? packument?.license),
        repository_url: normalizeRepositoryUrl(requested?.repository ?? packument?.repository),
        homepage: stringOrNull(requested?.homepage ?? packument?.homepage),
        runtime: { node: stringOrNull(requested?.engines?.node), python: null },
      },
      requestedPublishedAt,
      latestPublishedAt,
      createdAt,
      source: { provider: "npm registry", metadata_url: metadataUrl },
    });
  }

  async function pypiSnapshot(query) {
    const name = encodeURIComponent(query.package);
    const version = encodeURIComponent(query.version);
    const metadataUrl = `${PYPI_BASE}/${name}/json`;
    const releaseUrl = `${PYPI_BASE}/${name}/${version}/json`;
    const project = await fetchJson(metadataUrl, "PACKAGE_NOT_FOUND: PyPI package was not found");
    const release = await fetchJson(releaseUrl, "PACKAGE_VERSION_NOT_FOUND: requested PyPI package version was not found");
    const latestVersion = stringOrNull(project?.info?.version);
    const info = release?.info ?? {};
    const files = Array.isArray(release?.urls) ? release.urls : [];
    const yanked = Boolean(info?.yanked) || (files.length > 0 && files.every((file) => file?.yanked === true));
    const yankedReason = stringOrNull(info?.yanked_reason) ?? firstString(files.map((file) => file?.yanked_reason));
    const requestedPublishedAt = earliestUpload(files);
    const latestPublishedAt = earliestUpload(Array.isArray(project?.urls) ? project.urls : []);
    const createdAt = earliestReleaseUpload(project?.releases);
    const now = clock.now();
    return buildResult({
      query,
      now,
      packageData: {
        name: stringOrNull(info?.name) ?? stringOrNull(project?.info?.name) ?? query.package,
        requested_version: query.version,
        latest_version: latestVersion,
        requested_is_latest: latestVersion === query.version,
        description: stringOrNull(info?.summary) ?? stringOrNull(project?.info?.summary),
        deprecated: false,
        deprecated_reason: null,
        yanked,
        yanked_reason: yanked ? yankedReason : null,
        license: stringOrNull(info?.license_expression) ?? stringOrNull(info?.license) ?? stringOrNull(project?.info?.license_expression) ?? stringOrNull(project?.info?.license),
        repository_url: pypiRepositoryUrl(info) ?? pypiRepositoryUrl(project?.info),
        homepage: stringOrNull(info?.home_page) ?? stringOrNull(info?.project_urls?.Homepage) ?? stringOrNull(project?.info?.home_page) ?? stringOrNull(project?.info?.project_urls?.Homepage),
        runtime: { node: null, python: stringOrNull(info?.requires_python) },
      },
      requestedPublishedAt,
      latestPublishedAt,
      createdAt,
      source: { provider: "PyPI", metadata_url: metadataUrl, release_url: releaseUrl },
    });
  }

  function buildResult({ query, now, packageData, requestedPublishedAt, latestPublishedAt, createdAt, source }) {
    return {
      schema_version: "1.0",
      query,
      package: packageData,
      release: {
        requested_published_at: requestedPublishedAt,
        latest_published_at: latestPublishedAt,
        package_created_at: createdAt,
        requested_age_days: ageDays(requestedPublishedAt, now),
        latest_release_age_days: ageDays(latestPublishedAt, now),
      },
      source: { ...source, fetched_at: new Date(now).toISOString() },
      warnings: [],
    };
  }

  async function fetchJson(url, notFoundMessage) {
    if (typeof fetchImpl !== "function") throw new Error("PACKAGE_SOURCE_UNAVAILABLE: package registry fetch is unavailable");
    let response;
    try {
      response = await fetchImpl(url, { method: "GET", headers: { accept: "application/json", "user-agent": USER_AGENT }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (error) {
      throw new Error(`PACKAGE_SOURCE_UNAVAILABLE: ${error?.message ?? "package registry request failed"}`);
    }
    if (response?.status === 404) throw new Error(notFoundMessage);
    if (!response?.ok) throw new Error(`PACKAGE_SOURCE_UNAVAILABLE: package registry request failed with HTTP ${response?.status ?? "unknown"}`);
    let text;
    try {
      text = await readResponseTextBounded(response, MAX_RESPONSE_BYTES);
    } catch (error) {
      if (error instanceof ResponseBodyLimitError) {
        throw new Error("PACKAGE_SOURCE_UNAVAILABLE: package registry response exceeded the 8 MiB safety limit");
      }
      throw new Error(`PACKAGE_SOURCE_UNAVAILABLE: ${error?.message ?? "package registry response could not be read"}`);
    }
    try {
      const value = JSON.parse(text);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid shape");
      return value;
    } catch {
      throw new Error("PACKAGE_SOURCE_UNAVAILABLE: package registry returned invalid JSON data");
    }
  }
}

function normalizeRequest(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("INVALID_PACKAGE_REQUEST: body must be a JSON object");
  const ecosystem = requiredString(payload.ecosystem, "ecosystem", 40);
  const packageName = requiredString(payload.package, "package", 300);
  const version = requiredString(payload.version, "version", 200);
  const key = ecosystem.toLowerCase();
  if (key === "npm") return { ecosystem: "npm", package: packageName, version };
  if (key === "pypi") return { ecosystem: "PyPI", package: packageName, version };
  throw new Error("INVALID_PACKAGE_REQUEST: ecosystem must be npm or PyPI");
}

function requiredString(value, field, maxLength) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`INVALID_PACKAGE_REQUEST: ${field} must be a non-empty string`);
  const text = value.trim();
  if (text.length > maxLength) throw new Error(`INVALID_PACKAGE_REQUEST: ${field} exceeds ${maxLength} characters`);
  return text;
}

function pypiRepositoryUrl(info) {
  const urls = info?.project_urls;
  if (!urls || typeof urls !== "object") return null;
  for (const key of ["Source", "Source Code", "Repository", "Code"]) {
    const value = stringOrNull(urls[key]);
    if (value) return normalizeRepositoryUrl(value);
  }
  return null;
}

function earliestReleaseUpload(releases) {
  if (!releases || typeof releases !== "object") return null;
  const values = [];
  for (const files of Object.values(releases)) {
    if (!Array.isArray(files)) continue;
    const timestamp = earliestUpload(files);
    if (timestamp) values.push(timestamp);
  }
  return values.sort()[0] ?? null;
}

function earliestUpload(files) {
  if (!Array.isArray(files)) return null;
  return files.map((file) => isoOrNull(file?.upload_time_iso_8601 ?? file?.upload_time)).filter(Boolean).sort()[0] ?? null;
}

function firstString(values) {
  for (const value of values) { const text = stringOrNull(value); if (text) return text; }
  return null;
}

function normalizeLicense(value) {
  if (typeof value === "string") return stringOrNull(value);
  return stringOrNull(value?.type);
}

function normalizeRepositoryUrl(value) {
  const raw = typeof value === "string" ? value : value?.url;
  let url = stringOrNull(raw);
  if (!url) return null;
  url = url.replace(/^git\+/, "").replace(/\.git$/, "");
  return url;
}

function ageDays(iso, now) {
  if (!iso) return null;
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((now - timestamp) / DAY_MS));
}

function isoOrNull(value) {
  const text = stringOrNull(value);
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function stringOrNull(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}
