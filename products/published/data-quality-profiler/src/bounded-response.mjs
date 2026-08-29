export class ResponseBodyLimitError extends Error {
  constructor(maxBytes) {
    super(`response body exceeded ${maxBytes} bytes`);
    this.name = "ResponseBodyLimitError";
    this.maxBytes = maxBytes;
  }
}

function contentLength(headers) {
  if (!headers) return null;
  const raw = typeof headers.get === "function"
    ? headers.get("content-length")
    : Object.entries(headers).find(([key]) => key.toLowerCase() === "content-length")?.[1];
  if (raw === undefined || raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function asBuffer(chunk) {
  if (Buffer.isBuffer(chunk)) return chunk;
  if (chunk instanceof Uint8Array) return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  return Buffer.from(String(chunk));
}

async function cancelBody(body) {
  try {
    if (typeof body?.cancel === "function") await body.cancel();
    else if (typeof body?.destroy === "function") body.destroy();
  } catch {}
}

async function readWebStream(body, maxBytes) {
  const reader = body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const bytes = asBuffer(value);
      total += bytes.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch {}
        throw new ResponseBodyLimitError(maxBytes);
      }
      chunks.push(bytes);
    }
  } finally {
    try { reader.releaseLock?.(); } catch {}
  }
  return Buffer.concat(chunks, total).toString("utf8");
}

async function readAsyncIterable(body, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of body) {
    const bytes = asBuffer(chunk);
    total += bytes.byteLength;
    if (total > maxBytes) {
      if (typeof body.destroy === "function") body.destroy();
      throw new ResponseBodyLimitError(maxBytes);
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, total).toString("utf8");
}

function assertBoundedText(text, maxBytes) {
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new ResponseBodyLimitError(maxBytes);
  }
  return text;
}

/**
 * Read a Fetch-compatible response body without permitting an unbounded native
 * Response to be buffered first. Production WHATWG responses are consumed from
 * their stream and stopped as soon as the byte cap is crossed. Lightweight test
 * doubles may fall back to text()/json(); their resulting bytes are still
 * validated against the same contract.
 */
export async function readResponseTextBounded(response, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new TypeError("maxBytes must be a positive safe integer");
  }

  const declared = contentLength(response?.headers);
  if (declared !== null && declared > maxBytes) {
    await cancelBody(response?.body);
    throw new ResponseBodyLimitError(maxBytes);
  }

  const body = response?.body;
  if (body && typeof body.getReader === "function") {
    return readWebStream(body, maxBytes);
  }
  if (body && typeof body[Symbol.asyncIterator] === "function") {
    return readAsyncIterable(body, maxBytes);
  }
  if (typeof response?.text === "function") {
    return assertBoundedText(String(await response.text()), maxBytes);
  }
  if (typeof response?.json === "function") {
    return assertBoundedText(JSON.stringify(await response.json()), maxBytes);
  }
  return "";
}

export async function readResponseJsonBounded(response, maxBytes) {
  return JSON.parse(await readResponseTextBounded(response, maxBytes));
}
