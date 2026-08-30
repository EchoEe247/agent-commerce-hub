import { randomUUID } from 'node:crypto';

export const CSHOP_PROTOCOL_VERSION = '2025-06-18';
export const DEFAULT_CSHOP_URL = 'http://127.0.0.1:7333/mcp';

function normalizeEndpoint(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new TypeError('C-Shop URL must use http or https');
  }
  if (url.username || url.password) {
    throw new TypeError('C-Shop URL must not contain embedded credentials');
  }
  if (url.pathname === '/' || url.pathname === '') url.pathname = '/mcp';
  if (url.pathname !== '/mcp') {
    throw new TypeError('C-Shop URL must target the /mcp endpoint');
  }
  return url;
}

function isLoopbackHostname(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new TypeError('timeoutMs must be a positive integer');
  }
  return parsed;
}

export function toolText(result) {
  const block = result?.content?.find?.((item) => item?.type === 'text');
  return typeof block?.text === 'string' ? block.text : '';
}

export function toolImage(result) {
  const block = result?.content?.find?.((item) => item?.type === 'image');
  if (!block || typeof block.data !== 'string') return null;
  return {
    mimeType: block.mimeType ?? 'image/png',
    data: block.data,
  };
}

export class CShopClient {
  constructor({
    baseUrl = process.env.CSHOP_URL || DEFAULT_CSHOP_URL,
    token = process.env.CSHOP_TOKEN || null,
    sessionId = randomUUID(),
    timeoutMs = process.env.CSHOP_TIMEOUT_MS || 120_000,
    allowRemote = false,
    fetchImpl = globalThis.fetch,
  } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
    if (typeof sessionId !== 'string' || sessionId.length < 8 || sessionId.length > 128) {
      throw new TypeError('sessionId must be an 8-128 character string');
    }
    if (token != null && (typeof token !== 'string' || token.length === 0)) {
      throw new TypeError('token must be a non-empty string when provided');
    }

    const endpoint = normalizeEndpoint(baseUrl);
    const remote = !isLoopbackHostname(endpoint.hostname);
    if (remote && !allowRemote) {
      throw new TypeError('remote C-Shop endpoints are disabled; pass allowRemote=true explicitly');
    }
    if (remote && !token) {
      throw new TypeError('remote C-Shop endpoints require a bearer token');
    }

    this.baseUrl = endpoint.toString();
    this.token = token;
    this.sessionId = sessionId;
    this.timeoutMs = parsePositiveInteger(timeoutMs, 120_000);
    this.fetchImpl = fetchImpl;
    this.nextId = 1;
  }

  async rpc(method, params = undefined) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers = {
      'Content-Type': 'application/json',
      'Mcp-Session-Id': this.sessionId,
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    const payload = {
      jsonrpc: '2.0',
      id: this.nextId++,
      method,
    };
    if (params !== undefined) payload.params = params;

    try {
      const response = await this.fetchImpl(this.baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const raw = await response.text();
      let decoded;
      try {
        decoded = JSON.parse(raw);
      } catch {
        throw new Error(`C-Shop returned non-JSON HTTP ${response.status}`);
      }
      if (!response.ok) {
        throw new Error(`C-Shop HTTP ${response.status}: ${decoded?.error?.message || raw}`);
      }
      if (decoded?.error) {
        throw new Error(`C-Shop RPC ${decoded.error.code ?? 'error'}: ${decoded.error.message ?? 'unknown error'}`);
      }
      return decoded?.result;
    } finally {
      clearTimeout(timer);
    }
  }

  initialize() {
    return this.rpc('initialize', {
      protocolVersion: CSHOP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: 'agent-commerce-hub-cshop-worker-adapter',
        version: '0.1.0',
      },
    });
  }

  listTools() {
    return this.rpc('tools/list');
  }

  async callTool(name, args = {}) {
    const result = await this.rpc('tools/call', {
      name,
      arguments: args,
    });
    if (result?.isError) {
      throw new Error(`C-Shop tool ${name} failed: ${toolText(result) || 'unknown tool error'}`);
    }
    return result;
  }

  runScript(script, { returnImage = false, imageFit } = {}) {
    if (typeof script !== 'string' || script.length === 0) {
      throw new TypeError('script must be a non-empty string');
    }
    const args = {
      script,
      return_image: Boolean(returnImage),
    };
    if (imageFit !== undefined) {
      if (!Number.isSafeInteger(imageFit) || imageFit < 1 || imageFit > 2048) {
        throw new TypeError('imageFit must be an integer between 1 and 2048');
      }
      args.image_fit = imageFit;
    }
    return this.callTool('run_script', args);
  }

  reset() {
    return this.callTool('reset', {});
  }
}
