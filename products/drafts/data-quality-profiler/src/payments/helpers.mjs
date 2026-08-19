export function verifyX402Header(header, { facilitatorUrl, payTo, network, price }) {
  if (!header || typeof header !== "object") {
    throw new Error("x402 header is required");
  }
  const scheme = header.scheme;
  if (scheme !== "exact") {
    throw new Error(`unsupported scheme: ${scheme}`);
  }
  const networkPayload = header.network;
  if (networkPayload !== network) {
    throw new Error(`network mismatch: ${networkPayload} != ${network}`);
  }
  const payload = header.payload;
  if (!payload || !payload.signature || !payload.authorization) {
    throw new Error("invalid x402 payload");
  }
  if (payload.authorization.to !== payTo) {
    throw new Error(`recipient mismatch: ${payload.authorization.to} != ${payTo}`);
  }
  if (payload.authorization.amount !== "10000") {
    throw new Error(`amount mismatch: ${payload.authorization.amount} != 10000`);
  }
}
