// Connection-time SSRF boundary for company-domain website inspection.
//
// Design mirrors the stronger Commerce Control safe-fetch pattern, but is
// seller-local and depends only on Node built-ins (no undici coupling):
//
//   1. Every candidate URL is validated (scheme, no embedded credentials,
//      no IP literals, no special-use/private hostnames) BEFORE any socket
//      is opened.
//   2. The actual address is resolved and validated at CONNECTION TIME via a
//      custom Node `lookup`. A preflight DNS check alone is defeated by DNS
//      rebinding: a hostile name can answer with a public address during
//      validation and with 127.0.0.1 / RFC1918 when the socket is made. The
//      lookup runs for the real socket, so the window is closed.
//   3. Redirects are followed MANUALLY and every hop is revalidated at the URL
//      and connection-time layers. Automatic redirect following would bypass
//      the per-hop check.
//   4. Response size is bounded both by declared Content-Length (rejected
//      before the body is read) and by counting bytes while streaming, so a
//      lying header cannot exhaust memory.
//   5. A request timeout is enforced.
//
// The transport is injectable so behaviour can be tested deterministically
// without malicious public DNS. When no transport is supplied, the hardened
// Node transport (createHttpsTransport) is used as the production default.

import net from "node:net";
import http from "node:http";
import https from "node:https";
import * as dns from "node:dns/promises";
import { isPublicIp } from "./ssrf-address.mjs";

const BLOCKED_HOST_SUFFIXES = [
  ".local", ".internal", ".test", ".invalid", ".example", ".onion", ".localhost", ".home", ".lan",
];

function headerValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === "function") return headers.get(name);
  const target = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === target);
  return entry ? String(entry[1]) : null;
}

function isRedirectStatus(status) {
  return [301, 302, 303, 307, 308].includes(Number(status));
}

/**
 * Convert a Node IncomingMessage rawHeaders flat array
 * ["Header-Name", "value", "Other", "value", ...] into a Headers object.
 * The built-in Headers constructor expects a sequence of [name, value] pairs,
 * not a flat alternating array, so it must be consumed two elements at a time.
 */
export function headersFromRaw(rawHeaders) {
  const headers = new Headers();
  if (!Array.isArray(rawHeaders)) return headers;
  for (let index = 0; index + 1 < rawHeaders.length; index += 2) {
    headers.append(rawHeaders[index], rawHeaders[index + 1]);
  }
  return headers;
}

/**
 * Preflight URL validation. Throws before any socket is opened for
 * non-http(s) schemes, embedded credentials, IP literals, or special-use /
 * private hostnames. The connection-time half lives in the per-request lookup.
 */
export function assertSafeUrl(url) {
  const target = url instanceof URL ? url : new URL(String(url));
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("UNSAFE_DOMAIN_TARGET: only http/https schemes are permitted");
  }
  if (target.username || target.password) {
    throw new Error("UNSAFE_DOMAIN_TARGET: URLs carrying embedded credentials are refused");
  }
  const host = target.hostname;
  if (net.isIP(host)) {
    throw new Error("UNSAFE_DOMAIN_TARGET: IP literals are not permitted");
  }
  if (host === "localhost" || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new Error("UNSAFE_DOMAIN_TARGET: special-use or private hostnames are not permitted");
  }
  return target;
}

/**
 * Build a Node-style lookup that resolves the hostname and refuses any address
 * that is not publicly routable. Node invokes this at CONNECTION TIME, which is
 * the only place a DNS-rebinding defence is effective.
 */
function createValidatingLookup(dnsLookup) {
  return function validatingLookup(hostname, opts, callback) {
    dnsLookup(hostname, { all: true })
      .then((records) => {
        const publicRecords = (Array.isArray(records) ? records : [])
          .filter((record) => isPublicIp(String(record?.address ?? "")));
        if (publicRecords.length === 0) {
          callback(new Error(`UNSAFE_DOMAIN_TARGET: ${hostname} resolved to no publicly routable address`));
          return;
        }
        callback(null, publicRecords, undefined);
      })
      .catch((error) => callback(error));
  };
}

function readBoundedNodeBody(res, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    res.on("data", (chunk) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += bytes.byteLength;
      if (total > maxBytes) {
        res.destroy();
        resolve({ tooLarge: true, text: "" });
        return;
      }
      chunks.push(bytes);
    });
    res.on("end", () => resolve({ tooLarge: false, text: Buffer.concat(chunks).toString("utf8") }));
    res.on("error", reject);
  });
}

function pickProtocolModule(protocol) {
  return protocol === "http:" ? http : https;
}

/**
 * Real production transport: a focused http/https client that honours the
 * connection-time validating lookup. Manual redirects are handled by the
 * caller so every hop is revalidated. Both http: and https: are supported and
 * both use the same validating lookup; a redirect that changes scheme cannot
 * bypass the connection-time check because the lookup is supplied on every hop.
 */
export function createHttpsTransport({ maxBytes = 512 * 1024, timeoutMs = 6000 } = {}) {
  return function nodeTransport(url, { lookup, signal, headers, method = "GET" } = {}) {
    return new Promise((resolve, reject) => {
      let target;
      try {
        target = new URL(url);
      } catch (error) {
        reject(error);
        return;
      }
      const module = pickProtocolModule(target.protocol);

      const req = module.request(
        target,
        { method, headers, signal, lookup, timeout: timeoutMs },
        (res) => {
          const converted = headersFromRaw(res.rawHeaders);

          // Declared Content-Length greater than the cap: reject and destroy
          // before unnecessarily streaming/reading the body.
          const declaredLength = Number(headerValue(converted, "content-length"));
          if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
            res.destroy();
            resolve({ status: Number(res.statusCode ?? 0), headers: converted, body: null, tooLarge: true });
            return;
          }

          readBoundedNodeBody(res, maxBytes)
            .then(({ tooLarge, text }) => {
              if (tooLarge) {
                resolve({ status: Number(res.statusCode ?? 0), headers: converted, body: null, tooLarge: true });
                return;
              }
              resolve({ status: Number(res.statusCode), headers: converted, body: text });
            })
            .catch(reject);
        },
      );
      req.on("error", reject);
      req.setTimeout(timeoutMs, () => req.destroy(new Error("WEBSITE_REQUEST_TIMEOUT")));
      req.end();
    });
  };
}

/**
 * Create a hardened website fetcher.
 *
 * @param {object} options
 * @param {(url: string, opts: object) => Promise<{status:number,headers:object,body?:string,text?:Function,tooLarge?:boolean}>} [options.transport]
 *        The actual transport. When omitted, the hardened Node transport
 *        (createHttpsTransport) is used as the production default. Tests may
 *        inject a fake that still exercises the connection-time lookup.
 * @param {(hostname: string, opts: object) => Promise<Array<{address:string,family:number}>>} [options.dnsLookup]
 *        Connection-time resolver. Defaults to the system Node DNS lookup.
 */
export function createSafeWebsiteFetch({
  transport,
  dnsLookup,
  maxRedirects = 4,
  maxBytes = 512 * 1024,
  timeoutMs = 6000,
  userAgent = "HermesCommerce/0.1",
} = {}) {
  const effectiveTransport = transport ?? createHttpsTransport({ maxBytes, timeoutMs });
  const effectiveDnsLookup = dnsLookup ?? dns.lookup;
  const validatingLookup = createValidatingLookup(effectiveDnsLookup);

  async function fetchUrl(startUrl) {
    const initial = assertSafeUrl(startUrl);
    let current = initial;
    const redirectChain = [];

    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      const result = await effectiveTransport(current.href, {
        method: "GET",
        redirect: "manual",
        lookup: validatingLookup,
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "user-agent": userAgent,
        },
      });

      if (result?.tooLarge) return null;

      const status = Number(result?.status);
      const location = headerValue(result?.headers, "location");

      if (isRedirectStatus(status) && location) {
        if (hop >= maxRedirects) return null;
        const next = new URL(location, current);
        assertSafeUrl(next); // redirects to private/IP/blocked hosts throw -> caller returns null
        redirectChain.push(current.href);
        current = next;
        continue;
      }

      const contentType = headerValue(result?.headers, "content-type");
      if (!contentType || !/\b(?:text\/html|application\/xhtml\+xml)\b/i.test(contentType)) return null;

      const declaredLength = Number(headerValue(result?.headers, "content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return null;

      const bodyText = typeof result?.body === "string"
        ? result.body
        : (typeof result?.text === "function" ? await result.text() : "");

      return {
        status_code: Number.isFinite(status) ? status : null,
        final_url: current.href,
        redirect_chain: redirectChain,
        headers: result?.headers ?? {},
        body: bodyText,
      };
    }

    return null;
  }

  return { fetchUrl };
}
