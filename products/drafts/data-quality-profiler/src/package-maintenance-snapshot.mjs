const NPM_REGISTRY_BASE = "https://registry.npmjs.org";
const REQUEST_TIMEOUT_MS = 10000;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const USER_AGENT = "Hermes Commerce https://hermes-counterparty-api.onrender.com";
const DAY_MS = 24 * 60 * 60 * 1000;

export function createPackageMaintenanceSnapshot({
  fetchImpl = globalThis.fetch,
  clock = { now: () => Date.now() },
} = {}) {
  return async function packageMaintenanceSnapshot(payload) {
    const query = normalizeNpmRequest(payload);
    const metadataUrl = `${NPM_REGISTRY_BASE}/${encodeURIComponent(query.package)}`;
    const packument = await fetchJson(metadataUrl);
    const versions = packument?.versions;
    const requested = versions?.[query.version];
    if (!requested || typeof requested !== "object") {
      throw new Error("PACKAGE_VERSION_NOT_FOUND: requested npm package version was not found");
    }

    const latestVersion = stringOrNull(packument?.["dist-tags"]?.latest);
    const requestedPublishedAt = isoOrNull(packument?.time?.[query.version]);
    const latestPublishedAt = latestVersion ? isoOrNull(packument?.time?.[latestVersion]) : null;
    const createdAt = isoOrNull(packument?.time?.created);
    const now = clock.now();
    const deprecatedReason = stringOrNull(requested?.deprecated);

    return {
      schema_version: "1.0",
      query,
      package: {
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
        runtime: {
          node: stringOrNull(requested?.engines?.node),
          python: null,
        },
      },
      release: {
        requested_published_at: requestedPublishedAt,
        latest_published_at: latestPublishedAt,
        package_created_at: createdAt,
        requested_age_days: ageDays(requestedPublishedAt, now),
        latest_release_age_days: ageDays(latestPublishedAt, now),
      },
      source: {
        provider: "npm registry",
        metadata_url: metadataUrl,
        fetched_at: new Date(now).toISOString(),
      },
      warnings: [],
    };
  };

  async function fetchJson(url) {
    if (typeof fetchImpl !== "function") {
      throw new Error("PACKAGE_SOURCE_UNAVAILABLE: package registry fetch is unavailable");
    }
    let response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: { accept: "application/json", "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new Error(`PACKAGE_SOURCE_UNAVAILABLE: ${error?.message ?? "package registry request failed"}`);
    }
    if (response?.status === 404) {
      throw new Error("PACKAGE_NOT_FOUND: npm package was not found");
    }
    if (!response?.ok) {
      throw new Error(`PACKAGE_SOURCE_UNAVAILABLE: npm registry request failed with HTTP ${response?.status ?? "unknown"}`);
    }
    let text;
    try {
      text = await response.text();
    } catch (error) {
      throw new Error(`PACKAGE_SOURCE_UNAVAILABLE: ${error?.message ?? "package registry response could not be read"}`);
    }
    if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
      throw new Error("PACKAGE_SOURCE_UNAVAILABLE: npm registry response exceeded the 8 MiB safety limit");
    }
    try {
      const value = JSON.parse(text);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid shape");
      return value;
    } catch {
      throw new Error("PACKAGE_SOURCE_UNAVAILABLE: npm registry returned invalid JSON data");
    }
  }
}

function normalizeNpmRequest(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("INVALID_PACKAGE_REQUEST: body must be a JSON object");
  }
  const ecosystem = requiredString(payload.ecosystem, "ecosystem", 40);
  const packageName = requiredString(payload.package, "package", 300);
  const version = requiredString(payload.version, "version", 200);
  if (ecosystem.toLowerCase() !== "npm") {
    throw new Error("INVALID_PACKAGE_REQUEST: ecosystem must be npm");
  }
  return { ecosystem: "npm", package: packageName, version };
}

function requiredString(value, field, maxLength) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`INVALID_PACKAGE_REQUEST: ${field} must be a non-empty string`);
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw new Error(`INVALID_PACKAGE_REQUEST: ${field} exceeds ${maxLength} characters`);
  }
  return text;
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
