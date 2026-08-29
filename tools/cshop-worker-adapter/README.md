# C-Shop Worker Adapter

Private, pre-production adapter between `agent-commerce-hub` and the standalone C-Shop graphics runtime.

This package does **not** vendor C-Shop, publish a graphics service, alter the live seller, or expose C-Shop to the public internet. C-Shop remains a separately cloned runtime. The adapter provides one deliberately narrow first workflow: create a marketplace/product graphic from a workspace image (or a blank canvas), measured title text, an optional price, a deterministic gradient overlay, and an exported PNG/JPEG.

## Upstream pin for validation

Validate against:

- Repository: `https://github.com/stubbb/c-shop`
- Commit: `f3b2033c07df92e8e72ff83a29955a2c10494d95`
- MCP endpoint: `http://127.0.0.1:7333/mcp`
- MCP protocol requested by this adapter: `2025-06-18`

Do not silently advance the upstream pin while validating this integration. A later upstream revision should be treated as a separate compatibility change.

## Boundary

`agent-commerce-hub` owns the commerce job contract. C-Shop owns editing and rendering.

```text
agent-commerce-hub
  tools/cshop-worker-adapter
       |
       | constrained product-graphics job
       v
standalone C-Shop runtime
  cshop --serve --workspace <job-workspace>
       |
       v
rendered file in that workspace
```

The public seller under `products/published/` does not import this package.

## Security decisions in this first slice

- C-Shop is expected to bind to loopback for local validation.
- Every adapter client sends an explicit `Mcp-Session-Id`; it never relies on missing-session behavior.
- A bearer token can be supplied with `CSHOP_TOKEN`, but loopback-only operation is the initial target.
- The commerce job does not accept a raw C-Shop script.
- The commerce job does not emit `style` commands in this first slice.
- Asset and output names are simple workspace filenames only; path components and `..` are rejected before a request reaches C-Shop.
- Output is limited to PNG/JPEG for the first workflow.
- Returned MCP preview images are for inspection only; the exported full-size file is the deliverable.

These restrictions are intentional while the previously identified style-path sandbox behavior and server/session details are validated against the pinned runtime.

## Unit tests

Requires Node.js 24 or newer, matching the repository's current local tooling direction.

```bash
cd tools/cshop-worker-adapter
npm test
```

The tests are dependency-free and cover:

1. explicit session and bearer-token headers;
2. path traversal rejection;
3. measured title/price placement;
4. raw `script` input not crossing the job boundary;
5. no `style` command being emitted by the product workflow.

## Live smoke test

Start C-Shop in a separate checkout and give it a dedicated workspace:

```bash
cshop --serve --workspace /path/to/cshop-workspace
```

Put an input image such as `coffee.jpg` directly inside that workspace, then create a temporary job JSON outside the repository or in a gitignored local location:

```json
{
  "title": "Coffee Beans",
  "price": "$9.99",
  "asset": "coffee.jpg",
  "output": "coffee-card.png",
  "width": 1200,
  "height": 1200
}
```

Run:

```bash
export CSHOP_URL=http://127.0.0.1:7333/mcp
node tools/cshop-worker-adapter/scripts/smoke.mjs /path/to/job.json
```

The smoke runner prints the C-Shop report, explicit session id, output filename, and preview metadata without dumping the base64 preview into the terminal.

## Promotion rule

This remains an internal tool until all of the following are true:

1. the pinned C-Shop runtime builds locally;
2. its full relevant test suite is green or environment-specific exclusions are explicitly evidenced;
3. the earlier sandbox/style, session, and public metadata findings are reproduced and resolved or bounded;
4. this adapter's unit tests pass;
5. the live smoke job produces the expected exported file and preview;
6. a second full validation is clean after any concrete fixes.

Only then should a sellable graphics offering be considered under `products/drafts/`. Publication and production deployment are separate later decisions.
