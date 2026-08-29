import * as dns from "node:dns/promises";
import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import { COMPANY_DOMAIN_PREVIEW_MARKER } from "./company-domain-preview-guard.mjs";
import { isPublicIp } from "./ssrf-address.mjs";
import { createSafeWebsiteFetch, createHttpsTransport } from "./safe-website-fetch.mjs";

export { createSafeWebsiteFetch, createHttpsTransport };

const RDAP_BASE = "https://rdap.org/domain/";
const BLOCKED_SUFFIXES = [".local", ".internal", ".test", ".invalid", ".example", ".onion", ".localhost", ".home", ".lan"];
const MAX_WEBSITE_REDIRECTS = 4;
const MAX_WEBSITE_BYTES = 512 * 1024;
const WEBSITE_TIMEOUT_MS = 6000;
const WEBSITE_USER_AGENT = "HermesCommerce/0.1 (+https://hermes-counterparty-api.onrender.com)";

export const PREVIEW_DNS_TIMEOUT_MS = 1500;
export const PREVIEW_CACHE_TTL_MS = 10 * 60 * 1000;
export const PREVIEW_CACHE_MAX_ENTRIES = 1024;

export {
  isPublicIp,
  MAX_WEBSITE_REDIRECTS,
  MAX_WEBSITE_BYTES,
  WEBSITE_TIMEOUT_MS,
};

export function createCompanyDomainIntelligence({
  resolver = dns,
  pageRequester,
  websiteTransport,
  dnsLookup,
  rdapFetch = globalThis.fetch,
  clock = { now: () => Date.now() },
} = {}) {
  // The production website inspection path uses a hardened connection-time
  // SSRF boundary (validating lookup + manual revalidated redirects + bounded
  // body). The hardened Node transport is the production default inside
  // createSafeWebsiteFetch; global fetch is intentionally NOT a production
  // fallback so the connection-time DNS-rebinding defence is always active.
  // `websiteTransport` and `pageRequester` remain only as explicit test
  // injection hooks and are never supplied by the production app construction.
  const requestPage = pageRequester ?? (() => {
    const safe = createSafeWebsiteFetch({
      transport: websiteTransport,
      dnsLookup,
      maxRedirects: MAX_WEBSITE_REDIRECTS,
      maxBytes: MAX_WEBSITE_BYTES,
      timeoutMs: WEBSITE_TIMEOUT_MS,
      userAgent: WEBSITE_USER_AGENT,
    });
    return (startUrl) => safe.fetchUrl(startUrl);
  })();

  const previewCache = new Map();
  const previewInflight = new Map();

  async function inspectPreview(originalDomain, normalizedDomain) {
    const now = Number(clock.now());
    const cached = previewCache.get(normalizedDomain);
    if (cached && cached.expiresAt > now) {
      return buildPreviewInspection(originalDomain, normalizedDomain, cached.value, true);
    }
    if (cached) previewCache.delete(normalizedDomain);

    let pending = previewInflight.get(normalizedDomain);
    if (!pending) {
      pending = (async () => {
        const [addresses, ipv6Addresses] = await Promise.all([
          safeResolveWithTimeout(() => resolver.resolve4(normalizedDomain), PREVIEW_DNS_TIMEOUT_MS),
          safeResolveWithTimeout(() => resolver.resolve6(normalizedDomain), PREVIEW_DNS_TIMEOUT_MS),
        ]);

        for (const address of [...addresses, ...ipv6Addresses]) {
          if (!isPublicIp(String(address))) {
            throw new Error(`UNSAFE_DOMAIN_TARGET: resolved address ${address} is not publicly routable`);
          }
        }

        return {
          has_a: addresses.length > 0,
          has_aaaa: ipv6Addresses.length > 0,
          observed_at: new Date(clock.now()).toISOString(),
        };
      })();
      previewInflight.set(normalizedDomain, pending);
    }

    try {
      const value = await pending;
      setBoundedCache(previewCache, normalizedDomain, {
        expiresAt: Number(clock.now()) + PREVIEW_CACHE_TTL_MS,
        value,
      }, PREVIEW_CACHE_MAX_ENTRIES);
      return buildPreviewInspection(originalDomain, normalizedDomain, value, false);
    } finally {
      if (previewInflight.get(normalizedDomain) === pending) {
        previewInflight.delete(normalizedDomain);
      }
    }
  }

  return async function inspectCompanyDomain(payload) {
    const originalDomain = payload?.domain;
    const normalizedDomain = normalizeDomain(originalDomain);

    // The free preview is intentionally not the paid inspector with fields
    // removed afterwards. A request-level guard marks preview payloads with a
    // non-enumerable symbol. That path performs only two bounded DNS lookups,
    // with cache and in-flight de-duplication; no RDAP, MX/TXT/DMARC, or website
    // request is made.
    if (payload?.[COMPANY_DOMAIN_PREVIEW_MARKER] === true) {
      return inspectPreview(originalDomain, normalizedDomain);
    }

    const [addresses, ipv6Addresses, mx, rootTxt, dmarcTxt, rdap] = await Promise.all([
      safeResolve(() => resolver.resolve4(normalizedDomain)),
      safeResolve(() => resolver.resolve6(normalizedDomain)),
      safeResolve(() => resolver.resolveMx(normalizedDomain)),
      safeResolve(() => resolver.resolveTxt(normalizedDomain)),
      safeResolve(() => resolver.resolveTxt(`_dmarc.${normalizedDomain}`)),
      fetchRdap(normalizedDomain, rdapFetch),
    ]);

    const resolvedAddresses = [...addresses, ...ipv6Addresses];
    for (const address of resolvedAddresses) {
      if (!isPublicIp(String(address))) {
        throw new Error(`UNSAFE_DOMAIN_TARGET: resolved address ${address} is not publicly routable`);
      }
    }
    const page = requestPage && resolvedAddresses.length > 0
      ? await safePageRequest(() => requestPage(`https://${normalizedDomain}/`))
      : null;

    const website = buildWebsite(page, normalizedDomain);
    const company = buildCompany(website);
    const domain = buildDomain(rdap, clock.now());
    const mail = buildMail(mx, rootTxt, dmarcTxt);
    const warnings = [];
    if (!page) warnings.push("Website metadata was unavailable.");
    if (!rdap) warnings.push("RDAP registration metadata was unavailable.");

    return {
      schema_version: "1.0",
      query: {
        domain: originalDomain,
        normalized_domain: normalizedDomain,
      },
      company,
      domain,
      website,
      dns: {
        has_a: addresses.length > 0,
        has_aaaa: ipv6Addresses.length > 0,
        addresses: [...addresses].sort(),
        ipv6_addresses: [...ipv6Addresses].sort(),
      },
      mail,
      security: {
        hsts: hasHeader(page?.headers, "strict-transport-security"),
        content_security_policy: hasHeader(page?.headers, "content-security-policy"),
      },
      sources: {
        fetched_at: new Date(clock.now()).toISOString(),
        dns: "system-resolver",
        rdap: `${RDAP_BASE}${normalizedDomain}`,
        website: website.final_url,
      },
      warnings,
    };
  };
}

function buildPreviewInspection(originalDomain, normalizedDomain, dnsSignals, cacheHit) {
  const hasPublicDns = Boolean(dnsSignals?.has_a || dnsSignals?.has_aaaa);
  const warnings = [
    "Free preview is intentionally limited to bounded public A/AAAA DNS validation; website, RDAP, MX, SPF, DMARC, and security enrichment require the paid operation.",
  ];
  if (!hasPublicDns) warnings.push("No public A/AAAA record was available within the preview DNS deadline.");
  if (cacheHit) warnings.push("Preview result served from bounded in-memory DNS cache.");

  return {
    schema_version: "1.0",
    query: {
      domain: originalDomain,
      normalized_domain: normalizedDomain,
    },
    company: {
      display_name: normalizedDomain,
      source: "normalized_domain",
      confidence: "low",
    },
    domain: {
      registered: null,
      registrar: null,
      registration_date: null,
      expiration_date: null,
      age_days: null,
      statuses: [],
      nameservers: [],
    },
    website: {
      reachable: false,
      https: false,
      status_code: null,
      final_url: null,
      redirect_chain: [],
      title: null,
      description: null,
      canonical_url: null,
      social_links: [],
      contact_links: [],
    },
    dns: {
      has_a: Boolean(dnsSignals?.has_a),
      has_aaaa: Boolean(dnsSignals?.has_aaaa),
      addresses: [],
      ipv6_addresses: [],
    },
    mail: {
      has_mx: false,
      mx: [],
      spf_present: false,
      dmarc_present: false,
    },
    security: {
      hsts: false,
      content_security_policy: false,
    },
    sources: {
      fetched_at: dnsSignals?.observed_at ?? null,
      dns: "system-resolver-preview",
      rdap: null,
      website: null,
    },
    warnings,
  };
}

export function normalizeDomain(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("INVALID_DOMAIN_REQUEST: domain must be a non-empty string");
  }
  const trimmed = value.trim().replace(/\.+$/, "").toLowerCase();
  if (isIP(trimmed)) {
    throw new Error("INVALID_DOMAIN_REQUEST: IP literals are not allowed");
  }
  const ascii = domainToASCII(trimmed).toLowerCase();
  if (!ascii || ascii.length > 253 || !ascii.includes(".")) {
    throw new Error("INVALID_DOMAIN_REQUEST: domain must be a public DNS hostname");
  }
  if (ascii === "localhost" || BLOCKED_SUFFIXES.some((suffix) => ascii.endsWith(suffix))) {
    throw new Error("INVALID_DOMAIN_REQUEST: special-use or private hostnames are not allowed");
  }
  const labels = ascii.split(".");
  if (labels.some((label) => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
    throw new Error("INVALID_DOMAIN_REQUEST: domain contains an invalid DNS label");
  }
  return ascii;
}

async function safeResolve(operation) {
  try {
    const value = await operation();
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

async function safeResolveWithTimeout(operation, timeoutMs) {
  let timer;
  try {
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve([]), timeoutMs);
      timer.unref?.();
    });
    const lookup = Promise.resolve()
      .then(operation)
      .then((value) => Array.isArray(value) ? value : [])
      .catch(() => []);
    return await Promise.race([lookup, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function setBoundedCache(cache, key, value, maxEntries) {
  if (cache.has(key)) cache.delete(key);
  while (cache.size >= maxEntries) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  cache.set(key, value);
}

async function safePageRequest(operation) {
  try {
    return await operation();
  } catch {
    return null;
  }
}

function headerValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === "function") return headers.get(name);
  const target = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === target);
  return entry ? String(entry[1]) : null;
}

async function fetchRdap(domain, fetchImpl) {
  if (typeof fetchImpl !== "function") return null;
  try {
    const response = await fetchImpl(`${RDAP_BASE}${encodeURIComponent(domain)}`, {
      headers: { accept: "application/rdap+json, application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!response?.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function buildDomain(rdap, nowMs) {
  if (!rdap) {
    return {
      registered: null,
      registrar: null,
      registration_date: null,
      expiration_date: null,
      age_days: null,
      statuses: [],
      nameservers: [],
    };
  }
  const registrationDate = rdapEvent(rdap.events, "registration");
  const expirationDate = rdapEvent(rdap.events, "expiration");
  const registrationMs = registrationDate ? Date.parse(registrationDate) : NaN;
  return {
    registered: true,
    registrar: rdapRegistrar(rdap.entities),
    registration_date: registrationDate,
    expiration_date: expirationDate,
    age_days: Number.isFinite(registrationMs) ? Math.max(0, Math.floor((nowMs - registrationMs) / 86400000)) : null,
    statuses: Array.isArray(rdap.status) ? [...rdap.status].map(String).sort() : [],
    nameservers: Array.isArray(rdap.nameservers)
      ? rdap.nameservers.map((item) => String(item?.ldhName ?? "").toLowerCase()).filter(Boolean).sort()
      : [],
  };
}

function rdapEvent(events, action) {
  const event = Array.isArray(events) ? events.find((item) => item?.eventAction === action) : null;
  return typeof event?.eventDate === "string" ? event.eventDate : null;
}

function rdapRegistrar(entities) {
  const registrar = Array.isArray(entities)
    ? entities.find((entity) => Array.isArray(entity?.roles) && entity.roles.includes("registrar"))
    : null;
  const rows = Array.isArray(registrar?.vcardArray?.[1]) ? registrar.vcardArray[1] : [];
  const fn = rows.find((row) => Array.isArray(row) && row[0] === "fn");
  return typeof fn?.[3] === "string" && fn[3].trim() ? fn[3].trim() : null;
}

function buildMail(mx, rootTxt, dmarcTxt) {
  const normalizedMx = Array.isArray(mx)
    ? mx.map((item) => ({
        exchange: String(item?.exchange ?? "").toLowerCase(),
        priority: Number(item?.priority ?? 0),
      })).filter((item) => item.exchange).sort((a, b) => a.priority - b.priority || a.exchange.localeCompare(b.exchange))
    : [];
  return {
    has_mx: normalizedMx.length > 0,
    mx: normalizedMx,
    spf_present: flattenTxt(rootTxt).some((value) => /^v=spf1\b/i.test(value.trim())),
    dmarc_present: flattenTxt(dmarcTxt).some((value) => /^v=dmarc1\b/i.test(value.trim())),
  };
}

function flattenTxt(records) {
  if (!Array.isArray(records)) return [];
  return records.map((record) => Array.isArray(record) ? record.join("") : String(record));
}

function buildWebsite(page, domain) {
  if (!page) {
    return {
      reachable: false,
      https: false,
      status_code: null,
      final_url: null,
      redirect_chain: [],
      title: null,
      description: null,
      canonical_url: null,
      social_links: [],
      contact_links: [],
    };
  }
  const body = typeof page.body === "string" ? page.body : "";
  const finalUrl = page.final_url ?? `https://${domain}/`;
  return {
    reachable: Number(page.status_code) >= 200 && Number(page.status_code) < 500,
    https: String(finalUrl).startsWith("https://"),
    status_code: Number.isFinite(Number(page.status_code)) ? Number(page.status_code) : null,
    final_url: finalUrl,
    redirect_chain: Array.isArray(page.redirect_chain) ? [...page.redirect_chain] : [],
    title: htmlTitle(body),
    description: metaContent(body, "name", "description"),
    canonical_url: canonicalUrl(body, finalUrl),
    social_links: extractSocialLinks(body, finalUrl),
    contact_links: extractContactLinks(body, finalUrl, domain),
    site_name: metaContent(body, "property", "og:site_name"),
  };
}

function buildCompany(website) {
  if (website.site_name) {
    return { display_name: website.site_name, source: "og:site_name", confidence: "high" };
  }
  if (website.title) {
    return { display_name: cleanTitle(website.title), source: "website_title", confidence: "medium" };
  }
  return { display_name: null, source: null, confidence: "low" };
}

function htmlTitle(html) {
  const match = String(html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtml(stripTags(match[1])).trim().replace(/\s+/g, " ") || null : null;
}

function metaContent(html, keyName, keyValue) {
  const tags = String(html).match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const key = attribute(tag, keyName);
    if (key?.toLowerCase() !== keyValue.toLowerCase()) continue;
    const content = attribute(tag, "content");
    if (content?.trim()) return decodeHtml(content).trim();
  }
  return null;
}

function canonicalUrl(html, baseUrl) {
  const links = String(html).match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of links) {
    const rel = attribute(tag, "rel");
    if (!rel || !rel.toLowerCase().split(/\s+/).includes("canonical")) continue;
    const href = attribute(tag, "href");
    const resolved = resolveUrl(href, baseUrl);
    if (resolved) return resolved;
  }
  return null;
}

function extractSocialLinks(html, baseUrl) {
  const supported = /(^|\.)((linkedin|github|x|twitter|facebook|instagram|youtube)\.com)$/i;
  return extractHrefs(html)
    .map((href) => resolveUrl(href, baseUrl))
    .filter(Boolean)
    .filter((url) => {
      try { return supported.test(new URL(url).hostname); } catch { return false; }
    })
    .filter(unique)
    .slice(0, 10);
}

function extractContactLinks(html, baseUrl, domain) {
  return extractHrefs(html)
    .filter((href) => /(^|\/)(contact|about)(\/|$|[?#])/i.test(href))
    .map((href) => resolveUrl(href, baseUrl))
    .filter(Boolean)
    .filter((url) => {
      try {
        const host = new URL(url).hostname.toLowerCase();
        return host === domain || host === `www.${domain}`;
      } catch {
        return false;
      }
    })
    .filter(unique)
    .slice(0, 10);
}

function extractHrefs(html) {
  const values = [];
  const regex = /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/gi;
  for (const match of String(html).matchAll(regex)) values.push(match[2]);
  return values;
}

function attribute(tag, name) {
  const regex = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i");
  return tag.match(regex)?.[2] ?? null;
}

function resolveUrl(value, baseUrl) {
  if (!value) return null;
  try {
    const url = new URL(value, baseUrl);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function cleanTitle(title) {
  return String(title).split(/\s+[|–—-]\s+/)[0].trim() || String(title).trim();
}

function hasHeader(headers, name) {
  if (!headers) return false;
  if (typeof headers.get === "function") return Boolean(headers.get(name));
  const target = name.toLowerCase();
  return Object.entries(headers).some(([key, value]) => key.toLowerCase() === target && Boolean(value));
}

function stripTags(value) {
  return String(value).replace(/<[^>]*>/g, "");
}

function decodeHtml(value) {
  return String(value)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function unique(value, index, values) {
  return values.indexOf(value) === index;
}
