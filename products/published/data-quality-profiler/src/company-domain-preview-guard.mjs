export const COMPANY_DOMAIN_PREVIEW_PATH = "/v1/company-domain-intelligence/preview";
export const COMPANY_DOMAIN_PREVIEW_MARKER = Symbol.for("hermes.company-domain-preview");

export const PREVIEW_RATE_LIMIT = 20;
export const PREVIEW_RATE_WINDOW_MS = 60_000;
export const PREVIEW_RATE_MAX_CLIENTS = 4_096;

export function createPreviewRateLimiter({
  limit = PREVIEW_RATE_LIMIT,
  windowMs = PREVIEW_RATE_WINDOW_MS,
  maxClients = PREVIEW_RATE_MAX_CLIENTS,
  clock = { now: () => Date.now() },
} = {}) {
  const clients = new Map();

  function evictExpired(now) {
    for (const [key, entry] of clients) {
      if (now - entry.windowStart >= windowMs) clients.delete(key);
    }
  }

  function evictOldest() {
    let oldestKey = null;
    let oldestSeen = Infinity;
    for (const [key, entry] of clients) {
      if (entry.lastSeen < oldestSeen) {
        oldestSeen = entry.lastSeen;
        oldestKey = key;
      }
    }
    if (oldestKey !== null) clients.delete(oldestKey);
  }

  return {
    consume(clientKey) {
      const now = Number(clock.now());
      const key = String(clientKey || "unknown");
      let entry = clients.get(key);

      if (entry && now - entry.windowStart >= windowMs) {
        clients.delete(key);
        entry = null;
      }
      if (!entry) {
        if (clients.size >= maxClients) {
          evictExpired(now);
          if (clients.size >= maxClients) evictOldest();
        }
        entry = { windowStart: now, count: 0, lastSeen: now };
        clients.set(key, entry);
      }

      entry.lastSeen = now;
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.windowStart + windowMs - now) / 1000));
      if (entry.count >= limit) {
        return { allowed: false, limit, remaining: 0, retryAfterSeconds };
      }

      entry.count += 1;
      return {
        allowed: true,
        limit,
        remaining: Math.max(0, limit - entry.count),
        retryAfterSeconds,
      };
    },
  };
}

export function installCompanyDomainPreviewGuard(app, {
  clock = { now: () => Date.now() },
  limiter = createPreviewRateLimiter({ clock }),
} = {}) {
  app.addHook("preValidation", async (request, reply) => {
    const path = request.url.split("?")[0];
    if (request.method !== "POST" || path !== COMPANY_DOMAIN_PREVIEW_PATH) return;

    const outcome = limiter.consume(request.ip ?? request.raw?.socket?.remoteAddress ?? "unknown");
    reply.header("x-ratelimit-limit", String(outcome.limit));
    reply.header("x-ratelimit-remaining", String(outcome.remaining));

    if (!outcome.allowed) {
      reply.header("retry-after", String(outcome.retryAfterSeconds));
      return reply.status(429).send({
        error: {
          code: "PREVIEW_RATE_LIMITED",
          message: "free preview request limit exceeded; retry later or use the paid enrichment endpoint",
          details: { retry_after_seconds: outcome.retryAfterSeconds },
        },
      });
    }

    if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) {
      return reply.status(400).send({
        error: {
          code: "INVALID_DOMAIN_REQUEST",
          message: "body must be a JSON object",
          details: {},
        },
      });
    }

    Object.defineProperty(request.body, COMPANY_DOMAIN_PREVIEW_MARKER, {
      value: true,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  });
}
