const HTTP_BY_CODE = Object.freeze({
  UNSUPPORTED_FORMAT: 415,
  INVALID_DATASET: 400,
  INVALID_RECORD_SHAPE: 400,
  MALFORMED_CSV: 400,
  TOO_MANY_RECORDS: 413,
  TOO_MANY_FIELDS: 413,
  NESTING_TOO_DEEP: 413,
  PROCESSING_TIMEOUT: 408,
  INVALID_LOCALE_REQUEST: 400,
  INVALID_TIMEZONE: 400,
  UNSUPPORTED_COUNTRY: 400,
  INVALID_SANCTIONS_REQUEST: 400,
  SANCTIONS_SOURCE_UNAVAILABLE: 503,
  INVALID_DOMAIN_REQUEST: 400,
  UNSAFE_DOMAIN_TARGET: 400,
});

export class ServiceError extends Error {
  constructor(code, message, statusCode = 400, details = {}) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

// Dataset modules throw plain Errors whose message begins with the stable
// ERROR_CODES token (e.g. "TOO_MANY_RECORDS: max 1000 records allowed").
// Classify such errors into a structured response with the approved HTTP code.
export function classifyError(error) {
  // Fastify rejects payloads exceeding bodyLimit with this code before routing.
  if (error && error.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
    return {
      statusCode: 413,
      body: { error: { code: "REQUEST_TOO_LARGE", message: "request body exceeds the 1 MiB limit", details: {} } },
    };
  }
  const message = (error && error.message) || "";
  const match = message.match(/^([A-Z_]+):\s*([\s\S]*)$/);
  if (match && HTTP_BY_CODE[match[1]]) {
    return {
      statusCode: HTTP_BY_CODE[match[1]],
      body: { error: { code: match[1], message: match[2].trim(), details: {} } },
    };
  }
  // Never leak stack traces or raw internals to the caller.
  return {
    statusCode: 500,
    body: { error: { code: "INTERNAL_ERROR", message: "internal processing failure", details: {} } },
  };
}
