# C-Shop Worker Adapter

Private, pre-production adapter between `agent-commerce-hub` and the standalone C-Shop graphics runtime.

This package does **not** vendor C-Shop, publish a graphics service, alter the live seller, or expose C-Shop to the public internet. C-Shop remains a separately cloned runtime. The adapter provides one deliberately narrow first workflow: create a marketplace/product graphic from a workspace image (or a blank canvas), measured title text, an optional price, a deterministic gradient overlay, and an exported PNG/JPEG.

When an input asset is supplied, the adapter preserves its aspect ratio: it proportionally cover-scales the image until the requested canvas is filled, then applies C-Shop's centered canvas crop to reach the exact requested output dimensions. It does not stretch a non-square photograph into a square output.

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

- Loopback C-Shop endpoints are the default and expected mode.
- A non-loopback endpoint is rejected unless code explicitly constructs `CShopClient` with `allowRemote: true` **and** supplies a bearer token.
- Every adapter client sends an explicit `Mcp-Session-Id`; it never relies on missing-session behavior.
- A bearer token can be supplied with `CSHOP_TOKEN` for loopback use as well.
- The commerce job does not accept a raw C-Shop script. Unknown job fields are rejected rather than silently ignored.
- The commerce job does not emit `style` commands in this first slice.
- Asset and output names are simple workspace filenames only; path components and `..` are rejected before a request reaches C-Shop.
- Output is limited to PNG/JPEG for the first workflow.
- Returned MCP preview images are for inspection only; the exported full-size file is the deliverable.

## Pinned-source findings already established

Static inspection of the pinned C-Shop source established three details that the native smoke run should confirm rather than rediscover:

1. **Explicit sessions are required for persistence.** When `Mcp-Session-Id` is missing or invalid, C-Shop generates a fresh session id for that request. Because that happens per request, a multi-call workflow cannot rely on omitted-session behavior. This adapter always sends one explicit session id.
2. **Public metadata is broader than the protected MCP endpoint.** `GET /` and `GET /health` do not pass through bearer-token checks. `/health` reports the workspace and active session metadata. This is acceptable for the current loopback-only worker boundary, but it is one reason remote operation is opt-in rather than automatic.
3. **Style lookup has a different filesystem surface.** C-Shop style discovery searches the workspace and style directories beside the executable, while the served runner otherwise carries a `Sandbox` for script-named paths. The commerce adapter therefore keeps `style` unreachable in this first slice.

These are upstream characteristics, not reasons to fork C-Shop yet. A fork/change is justified only if a real required workflow cannot stay inside this bounded contract.

## Unit tests

Requires Node.js 24 or newer for the supported local environment. The current dependency-free code path has also been exercised successfully under Node 22, but the package requirement is intentionally not weakened by that incidental compatibility.

```bash
cd tools/cshop-worker-adapter
npm test
```

The tests cover:

1. explicit session and bearer-token headers;
2. loopback-by-default and authenticated explicit remote opt-in;
3. path traversal rejection;
4. rejection of raw/unknown job fields such as `script`;
5. measured title/price placement and long-title fitting;
6. proportional cover-scaling plus centered canvas cropping for supplied assets;
7. no `style` command being emitted by the product workflow.

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
3. the pinned-source session/metadata/style findings are confirmed under the native runtime and remain bounded by this adapter;
4. this adapter's unit tests pass;
5. the live smoke job produces the expected exported file and preview;
6. a second full validation is clean after any concrete fixes.

Only then should a sellable graphics offering be considered under `products/drafts/`. Publication and production deployment are separate later decisions.
