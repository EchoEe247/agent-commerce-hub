const started = Date.now();
const apiUrl = "https://api.osv.dev/v1/query";
const response = await fetch(apiUrl, {
  method: "POST",
  headers: {
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": "Hermes Commerce OSV smoke https://hermes-counterparty-api.onrender.com",
  },
  body: JSON.stringify({
    package: { ecosystem: "PyPI", name: "jinja2" },
    version: "2.4.1",
  }),
  signal: AbortSignal.timeout(10000),
});

if (!response.ok) {
  throw new Error(`OSV_SOURCE_SMOKE_FAILED: HTTP ${response.status}`);
}
const body = await response.json();
if (!body || typeof body !== "object" || !Array.isArray(body.vulns) || body.vulns.length < 1) {
  throw new Error("OSV_SOURCE_SMOKE_FAILED: expected at least one known vulnerability for PyPI jinja2 2.4.1");
}

console.log(JSON.stringify({
  smoke: "OSV_SOURCE_OK",
  provider: "OSV.dev",
  api_url: apiUrl,
  ecosystem: "PyPI",
  package: "jinja2",
  version: "2.4.1",
  vulnerabilities_found: body.vulns.length,
  first_id: body.vulns[0]?.id ?? null,
  elapsed_ms: Date.now() - started,
}));
