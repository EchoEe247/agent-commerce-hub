const ROOT_LANDING_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Hermes Agent Commerce API discovery page for business intelligence, compliance, software verification, and data-quality tools.">
  <title>Hermes Agent Commerce API</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #0b0d10; color: #f5f7fa; }
    main { width: min(860px, calc(100% - 32px)); margin: 0 auto; padding: 64px 0 72px; }
    .badge { display: inline-block; padding: 6px 10px; border: 1px solid #34404d; border-radius: 999px; color: #b9c4d0; font-size: 13px; }
    h1 { margin: 20px 0 12px; font-size: clamp(36px, 8vw, 64px); line-height: 1; letter-spacing: -0.04em; }
    .lead { max-width: 720px; color: #b9c4d0; font-size: 18px; line-height: 1.6; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin: 30px 0; }
    .card { padding: 18px; border: 1px solid #252c34; border-radius: 14px; background: #11151a; }
    .card strong { display: block; margin-bottom: 6px; }
    .card span { color: #99a7b5; line-height: 1.45; }
    .links { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 28px; }
    a { color: #f5f7fa; text-decoration: none; }
    .links a { padding: 11px 14px; border: 1px solid #34404d; border-radius: 10px; background: #171c22; }
    .links a:hover { background: #202731; }
    footer { margin-top: 36px; color: #7f8b98; font-size: 14px; }
    code { color: #cbd5df; }
  </style>
</head>
<body>
  <main>
    <span class="badge">API discovery</span>
    <h1>Hermes Agent Commerce API</h1>
    <p class="lead">13 API tools for agents and developers covering company and SEC intelligence, OFAC screening, dependency and package checks, and deterministic JSON/CSV data-quality operations. Inspect the service manifest for current access requirements and pricing.</p>

    <section class="grid" aria-label="Capabilities">
      <div class="card"><strong>Business intelligence</strong><span>Company/domain research, SEC snapshots, and practical counterparty contact windows.</span></div>
      <div class="card"><strong>Compliance</strong><span>Structured OFAC SDN screening for people and organizations.</span></div>
      <div class="card"><strong>Software verification</strong><span>Exact-version OSV vulnerability checks and npm/PyPI maintenance snapshots.</span></div>
      <div class="card"><strong>Data quality</strong><span>Profile, deduplicate, quality-gate, detect schema drift, validate contracts, clean, and plan repairs.</span></div>
    </section>

    <nav class="links" aria-label="API discovery">
      <a href="/openapi.json">OpenAPI</a>
      <a href="/llms.txt">llms.txt</a>
      <a href="/.well-known/x402">Service manifest</a>
      <a href="/health">Health</a>
    </nav>

    <footer>Machine clients should start with <code>/openapi.json</code> or <code>/.well-known/x402</code>.</footer>
  </main>
</body>
</html>`;

export function registerRootLanding(app) {
  app.get("/", async (_request, reply) => (
    reply
      .header("cache-control", "public, max-age=300")
      .header("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'")
      .header("x-content-type-options", "nosniff")
      .type("text/html; charset=utf-8")
      .send(ROOT_LANDING_HTML)
  ));
}
