const ALLOWED_FIELDS = Object.freeze([
  "request_id",
  "timestamp",
  "request_bytes",
  "record_count",
  "field_count",
  "processing_ms",
  "status",
  "error_code",
  "payment_ref",
]);

export function buildRequestLog({ requestId, timestamp, requestBytes, recordCount, fieldCount, processingMs, status, errorCode, paymentRef }) {
  const entry = {
    request_id: requestId,
    timestamp: timestamp ?? new Date().toISOString(),
    request_bytes: requestBytes ?? 0,
    record_count: recordCount ?? 0,
    field_count: fieldCount ?? 0,
    processing_ms: processingMs ?? 0,
    status: status ?? 200,
  };
  if (errorCode !== undefined && errorCode !== null) entry.error_code = errorCode;
  if (paymentRef !== undefined && paymentRef !== null) entry.payment_ref = paymentRef;

  return Object.fromEntries(Object.entries(entry).filter(([key]) => ALLOWED_FIELDS.includes(key)));
}

export function installRequestLogging(app, { logger = console } = {}) {
  app.addHook("onResponse", async (request) => {
    const meta = request.raw?.["profilerLog"];
    if (!meta) return;
    const entry = buildRequestLog(meta);
    logger.log(JSON.stringify(entry));
  });
}