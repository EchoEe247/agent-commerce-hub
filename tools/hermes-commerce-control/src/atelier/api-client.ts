import {
  ATELIER_ACTIONABLE_ORDER_STATUSES,
  ATELIER_API_BASE,
  buildDocumentDeliveryPayload,
  parseAtelierOrder,
  type AtelierActionableOrderStatus,
  type AtelierDeliverDocumentPayload,
  type AtelierOrderEnvelope,
  type AtelierServiceCreatePayload,
} from "./marketplace-contract.js";

type JsonObject = Record<string, unknown>;

export interface AtelierHttpResponse {
  readonly status: number;
  readonly body: unknown;
  readonly retryAfter: string | null;
}

export interface AtelierUploadedDocument {
  readonly url: string;
  readonly mediaType: string | null;
  readonly response: AtelierHttpResponse;
}

export type AtelierFetch = typeof fetch;

function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}
function envelopeData(value: unknown): unknown {
  const body = asObject(value);
  return body.data ?? value;
}
function arrayFromEnvelope(value: unknown): unknown[] {
  const data = envelopeData(value);
  if (Array.isArray(data)) return data;
  const obj = asObject(data);
  for (const key of ["orders", "items", "results"]) if (Array.isArray(obj[key])) return obj[key] as unknown[];
  return [];
}
function boundedErrorBody(value: unknown): string {
  if (typeof value === "string") return value.replace(/\s+/g, " ").slice(0, 800);
  try { return JSON.stringify(value).slice(0, 800); } catch { return "unreadable response body"; }
}
function requireAgentId(agentId: string): string {
  const normalized = agentId.trim();
  if (!normalized || !/^[A-Za-z0-9_-]+$/.test(normalized)) throw new Error("invalid Atelier agent id");
  return normalized;
}
function requireOrderId(orderId: string): string {
  const normalized = orderId.trim();
  if (!normalized || !/^[A-Za-z0-9_-]+$/.test(normalized)) throw new Error("invalid Atelier order id");
  return normalized;
}
function requireApiKey(apiKey: string): string {
  const normalized = apiKey.trim();
  if (!/^atelier_[A-Za-z0-9_-]+$/.test(normalized)) throw new Error("Atelier API key must start with atelier_");
  return normalized;
}
function parseResponseBody(raw: string): unknown {
  if (!raw.trim()) return null;
  try { return JSON.parse(raw) as unknown; } catch { return raw.slice(0, 20_000); }
}
function requireUploadFilename(filename: string): string {
  const normalized = filename.trim();
  if (!normalized || normalized.length > 160 || normalized.includes("/") || normalized.includes("\\")) {
    throw new Error("invalid Atelier upload filename");
  }
  if (!/\.(?:md|txt|csv|json|py|pdf|zip)$/i.test(normalized)) {
    throw new Error("unsupported Atelier document upload extension");
  }
  return normalized;
}

export class AtelierApiClient {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #fetch: AtelierFetch;

  constructor(options: { readonly apiKey: string; readonly baseUrl?: string; readonly fetchImpl?: AtelierFetch }) {
    this.#apiKey = requireApiKey(options.apiKey);
    this.#baseUrl = (options.baseUrl ?? ATELIER_API_BASE).replace(/\/+$/, "");
    this.#fetch = options.fetchImpl ?? fetch;
  }

  async #request(method: "GET" | "POST", path: string, body?: unknown): Promise<AtelierHttpResponse> {
    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      method,
      redirect: "manual",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.#apiKey}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20_000),
    });
    const bodyParsed = parseResponseBody(await response.text());
    return Object.freeze({ status: response.status, body: bodyParsed, retryAfter: response.headers.get("retry-after") });
  }

  async #requestMultipart(path: string, body: FormData): Promise<AtelierHttpResponse> {
    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      method: "POST",
      redirect: "manual",
      headers: { Accept: "application/json", Authorization: `Bearer ${this.#apiKey}` },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    const bodyParsed = parseResponseBody(await response.text());
    return Object.freeze({ status: response.status, body: bodyParsed, retryAfter: response.headers.get("retry-after") });
  }

  async listOrders(agentId: string, statuses: readonly AtelierActionableOrderStatus[] = ATELIER_ACTIONABLE_ORDER_STATUSES): Promise<readonly AtelierOrderEnvelope[]> {
    const id = requireAgentId(agentId);
    if (statuses.length === 0) return Object.freeze([]);
    const invalid = statuses.find((status) => !ATELIER_ACTIONABLE_ORDER_STATUSES.includes(status));
    if (invalid) throw new Error(`unsupported actionable order status: ${invalid}`);
    const query = encodeURIComponent(statuses.join(","));
    const response = await this.#request("GET", `/api/agents/${id}/orders?status=${query}`);
    if (response.status === 429) throw new Error(`Atelier order polling rate limited; retry after ${response.retryAfter ?? "server guidance"}`);
    if (response.status !== 200) throw new Error(`Atelier order polling failed HTTP ${response.status}: ${boundedErrorBody(response.body)}`);
    return Object.freeze(arrayFromEnvelope(response.body).map(parseAtelierOrder));
  }

  async createService(agentId: string, payload: AtelierServiceCreatePayload): Promise<AtelierHttpResponse> {
    return this.#request("POST", `/api/agents/${requireAgentId(agentId)}/services`, payload);
  }

  async uploadDocument(filename: string, content: string | Uint8Array, contentType = "text/markdown"): Promise<AtelierUploadedDocument> {
    const safeName = requireUploadFilename(filename);
    const bytes = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
    if (bytes.length === 0) throw new Error("Atelier upload document cannot be empty");
    if (bytes.length > 50 * 1024 * 1024) throw new Error("Atelier upload exceeds 50MB limit");
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: contentType }), safeName);
    const response = await this.#requestMultipart("/api/upload", form);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Atelier upload failed HTTP ${response.status}: ${boundedErrorBody(response.body)}`);
    }
    const data = asObject(envelopeData(response.body));
    const rawUrl = typeof data.url === "string" ? data.url.trim() : "";
    let url: URL;
    try { url = new URL(rawUrl); } catch { throw new Error("Atelier upload response missing valid data.url"); }
    if (url.protocol !== "https:") throw new Error("Atelier upload response URL must use HTTPS");
    const mediaType = typeof data.media_type === "string" && data.media_type.trim() ? data.media_type.trim() : null;
    return Object.freeze({ url: url.toString(), mediaType, response });
  }

  async deliverDocument(orderId: string, deliverableUrl: string): Promise<AtelierHttpResponse> {
    const payload: AtelierDeliverDocumentPayload = buildDocumentDeliveryPayload(deliverableUrl);
    return this.#request("POST", `/api/orders/${requireOrderId(orderId)}/deliver`, payload);
  }

  async sendMessage(orderId: string, content: string): Promise<AtelierHttpResponse> {
    const id = requireOrderId(orderId);
    const normalized = content.trim();
    if (!normalized || normalized.length > 2000) throw new Error("Atelier message content must be 1-2000 characters");
    return this.#request("POST", `/api/orders/${id}/messages`, { content: normalized });
  }
}
