import { parse } from "csv-parse/sync";
import { readResponseTextBounded, ResponseBodyLimitError } from "./bounded-response.mjs";

const OFAC_EXPORT_BASE = "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports";
const SOURCE_URLS = Object.freeze({
  primary: `${OFAC_EXPORT_BASE}/SDN.CSV`,
  aliases: `${OFAC_EXPORT_BASE}/ALT.CSV`,
  addresses: `${OFAC_EXPORT_BASE}/ADD.CSV`,
});
const USER_AGENT = "HermesCommerce/0.1 (+https://hermes-counterparty-api.onrender.com)";
const DISCLAIMER = "Screening result is informational and is not a legal compliance determination.";
const DEFAULT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MATCH_THRESHOLD = 80;
const MAX_RESULTS = 5;
const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const ENTITY_TYPES = new Set(["individual", "entity", "vessel", "aircraft"]);

export function createEntitySanctionsScreen({
  fetchImpl = globalThis.fetch,
  clock = { now: () => Date.now() },
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("SANCTIONS_SOURCE_UNAVAILABLE: fetch implementation is unavailable");
  }

  let cachedSnapshot = null;
  let loadPromise = null;

  return async function entitySanctionsScreen(payload) {
    const query = normalizeRequest(payload);
    const snapshot = await getSnapshot();
    const candidates = rankCandidates(snapshot.records, query);

    return {
      schema_version: "1.0",
      query: {
        name: query.name,
        normalized_name: query.normalizedName,
        country: query.country,
        entity_type: query.entityType,
      },
      matches_found: candidates.length > 0,
      candidates,
      source: {
        provider: "OFAC",
        list: "SDN",
        files: [SOURCE_URLS.primary, SOURCE_URLS.aliases, SOURCE_URLS.addresses],
        fetched_at: new Date(snapshot.loadedAt).toISOString(),
        last_modified: snapshot.lastModified,
      },
      warnings: [DISCLAIMER],
    };
  };

  async function getSnapshot() {
    const now = clock.now();
    if (cachedSnapshot && now - cachedSnapshot.loadedAt < cacheTtlMs) {
      return cachedSnapshot;
    }
    if (loadPromise) return loadPromise;

    loadPromise = loadSnapshot(fetchImpl, now)
      .then((snapshot) => {
        cachedSnapshot = snapshot;
        return snapshot;
      })
      .finally(() => {
        loadPromise = null;
      });

    return loadPromise;
  }
}

function normalizeRequest(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("INVALID_SANCTIONS_REQUEST: body must be a JSON object");
  }

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (!name) {
    throw new Error("INVALID_SANCTIONS_REQUEST: name must be a non-empty string");
  }
  if (name.length > 200) {
    throw new Error("INVALID_SANCTIONS_REQUEST: name must be 200 characters or fewer");
  }

  let country = null;
  if (payload.country !== undefined && payload.country !== null) {
    if (typeof payload.country !== "string" || !payload.country.trim()) {
      throw new Error("INVALID_SANCTIONS_REQUEST: country must be a non-empty string when provided");
    }
    country = payload.country.trim();
  }

  let entityType = null;
  if (payload.entity_type !== undefined && payload.entity_type !== null) {
    if (typeof payload.entity_type !== "string" || !payload.entity_type.trim()) {
      throw new Error("INVALID_SANCTIONS_REQUEST: entity_type must be a non-empty string when provided");
    }
    entityType = payload.entity_type.trim().toLowerCase();
    if (!ENTITY_TYPES.has(entityType)) {
      throw new Error("INVALID_SANCTIONS_REQUEST: entity_type must be one of individual, entity, vessel, aircraft");
    }
  }

  return {
    name,
    normalizedName: normalizeName(name),
    country,
    normalizedCountry: country ? normalizeName(country) : null,
    entityType,
  };
}

async function loadSnapshot(fetchImpl, loadedAt) {
  let responses;
  try {
    responses = await Promise.all([
      fetchSource(fetchImpl, SOURCE_URLS.primary),
      fetchSource(fetchImpl, SOURCE_URLS.aliases),
      fetchSource(fetchImpl, SOURCE_URLS.addresses),
    ]);
  } catch {
    throw new Error("SANCTIONS_SOURCE_UNAVAILABLE: authoritative OFAC SDN data could not be loaded");
  }

  const [primaryResponse, aliasResponse, addressResponse] = responses;
  if (!primaryResponse.ok || !aliasResponse.ok || !addressResponse.ok) {
    throw new Error("SANCTIONS_SOURCE_UNAVAILABLE: authoritative OFAC SDN data could not be loaded");
  }

  let primaryText;
  let aliasText;
  let addressText;
  try {
    [primaryText, aliasText, addressText] = await Promise.all([
      readResponseTextBounded(primaryResponse, MAX_SOURCE_BYTES),
      readResponseTextBounded(aliasResponse, MAX_SOURCE_BYTES),
      readResponseTextBounded(addressResponse, MAX_SOURCE_BYTES),
    ]);
  } catch (error) {
    if (error instanceof ResponseBodyLimitError) {
      throw new Error("SANCTIONS_SOURCE_UNAVAILABLE: authoritative OFAC SDN file exceeded the 32 MiB safety limit");
    }
    throw new Error("SANCTIONS_SOURCE_UNAVAILABLE: authoritative OFAC SDN data could not be read");
  }

  let records;
  try {
    records = joinOfacRecords(primaryText, aliasText, addressText);
    if (records.length === 0) {
      throw new Error("OFAC snapshot contains no usable primary SDN records");
    }
  } catch {
    throw new Error("SANCTIONS_SOURCE_UNAVAILABLE: authoritative OFAC SDN data could not be parsed");
  }

  return {
    loadedAt,
    lastModified: primaryResponse.headers?.get?.("last-modified") ?? null,
    records,
  };
}

function fetchSource(fetchImpl, url) {
  return fetchImpl(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/csv",
    },
    signal: typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(10_000)
      : undefined,
  });
}

function joinOfacRecords(primaryText, aliasText, addressText) {
  const primaryRows = parseRows(primaryText);
  const aliasRows = parseRows(aliasText);
  const addressRows = parseRows(addressText);

  const aliasesByUid = new Map();
  for (const row of aliasRows) {
    const uid = cleanValue(row[0]);
    const name = cleanValue(row[3]);
    if (!uid || !name || !/^\d+$/.test(uid)) continue;
    append(aliasesByUid, uid, {
      type: cleanValue(row[2]),
      name,
      remarks: cleanValue(row[4]),
    });
  }

  const addressesByUid = new Map();
  for (const row of addressRows) {
    const uid = cleanValue(row[0]);
    if (!uid || !/^\d+$/.test(uid)) continue;
    append(addressesByUid, uid, {
      address: cleanValue(row[2]),
      city_state_province: cleanValue(row[3]),
      country: cleanValue(row[4]),
      remarks: cleanValue(row[5]),
    });
  }

  const records = [];
  for (const row of primaryRows) {
    const uid = cleanValue(row[0]);
    const name = cleanValue(row[1]);
    if (!uid || !name || !/^\d+$/.test(uid) || row.length < 12) continue;
    records.push({
      uid,
      name,
      normalizedName: normalizeName(name),
      entityType: cleanValue(row[2]),
      programs: splitPrograms(cleanValue(row[3])),
      remarks: cleanValue(row[11]),
      aliases: aliasesByUid.get(uid) ?? [],
      addresses: addressesByUid.get(uid) ?? [],
    });
  }
  return records;
}

function parseRows(text) {
  return parse(text, {
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    trim: true,
  });
}

function rankCandidates(records, query) {
  const ranked = [];

  for (const record of records) {
    if (!matchesFilters(record, query)) continue;

    const primaryExact = query.normalizedName === record.normalizedName;
    let best = primaryExact ? 100 : scoreName(query.normalizedName, record.normalizedName);
    let matchedName = record.name;
    let matchType = primaryExact ? "primary_exact" : "fuzzy";

    for (const alias of record.aliases) {
      const normalizedAlias = normalizeName(alias.name);
      const aliasExact = query.normalizedName === normalizedAlias;
      const score = aliasExact ? 100 : scoreName(query.normalizedName, normalizedAlias);
      if (score > best || (score === best && aliasExact && matchType === "fuzzy")) {
        best = score;
        matchedName = alias.name;
        matchType = aliasExact ? "alias_exact" : "fuzzy";
      }
    }

    if (best < MATCH_THRESHOLD) continue;

    ranked.push({
      uid: record.uid,
      name: record.name,
      entity_type: record.entityType,
      programs: record.programs,
      score: best,
      match_type: matchType,
      matched_name: matchedName,
      aliases: record.aliases,
      addresses: record.addresses,
      remarks: record.remarks,
    });
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const priority = { primary_exact: 0, alias_exact: 1, fuzzy: 2 };
    if (priority[a.match_type] !== priority[b.match_type]) {
      return priority[a.match_type] - priority[b.match_type];
    }
    const nameOrder = a.name.localeCompare(b.name);
    return nameOrder !== 0 ? nameOrder : a.uid.localeCompare(b.uid);
  });

  return ranked.slice(0, MAX_RESULTS);
}

function matchesFilters(record, query) {
  if (query.entityType && normalizeName(record.entityType ?? "") !== normalizeName(query.entityType)) {
    return false;
  }
  if (query.normalizedCountry) {
    const hasCountry = record.addresses.some(
      (address) => normalizeName(address.country ?? "") === query.normalizedCountry
    );
    if (!hasCountry) return false;
  }
  return true;
}

function scoreName(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 100;

  const direct = similarity(left, right);
  const tokenSorted = similarity(sortTokens(left), sortTokens(right));
  return Math.round(Math.max(direct, tokenSorted) * 100);
}

function similarity(left, right) {
  const maximum = Math.max(left.length, right.length);
  if (maximum === 0) return 1;
  return 1 - levenshtein(left, right) / maximum;
}

function levenshtein(left, right) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function sortTokens(value) {
  return value.split(" ").filter(Boolean).sort().join(" ");
}

function splitPrograms(value) {
  if (!value) return [];
  return value
    .split(/[;,]/)
    .map((program) => program.trim())
    .filter(Boolean);
}

function cleanValue(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return !text || text === "-0-" ? null : text;
}

function append(map, key, value) {
  const values = map.get(key);
  if (values) values.push(value);
  else map.set(key, [value]);
}
