# Product Listing Graphic — Draft

Status: **draft / not published / not deployed**

This product is built on the validated private C-Shop worker adapter. It remains deliberately narrow: one deterministic product graphic from a supplied workspace image or a blank canvas, with measured title placement, an optional price, and PNG/JPEG export. It does not introduce a public C-Shop endpoint.

## Customer outcome

Create one product graphic from either:

- a supplied product image placed in the isolated C-Shop workspace; or
- a blank canvas when no source image is supplied.

### Supplied product image

A customer photo is **not** used as a full-bleed text background anymore.

The v0.2 draft uses a conservative split card:

```text
+------------------------------+
|                              |
|      supplied product        |
|           image              |
|                              |
|        upper 64%             |
+------------------------------+
|        Product Title         |
|           $Price             |
|        lower 36%             |
+------------------------------+
```

The source image is proportionally contained inside the upper image zone, so the complete source remains visible without stretching or default cropping. The configured `background` colour fills any remaining space and the lower text panel. Title and optional price are measured before placement and centered in that lower panel.

This change exists because the earlier full-bleed layout passed mechanical resize checks but failed human visual review on a real coffee image. Enlarging/cropping the photograph and laying a dark gradient across it made the saucer around the cup read like a large artificial shadow/halo. That output was not good enough to sell even though its dimensions and text placement were technically valid.

### Blank canvas

When there is no source image, the existing blank-card workflow remains: configured background, deterministic bottom gradient, measured title, and optional price.

## Current job contract

Example:

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

Only fields implemented by `tools/cshop-worker-adapter/src/product-graphics-job.mjs` are accepted. Unknown fields are rejected rather than silently ignored.

The source asset and output are simple workspace filenames, not arbitrary paths. Output is currently limited to PNG/JPEG.

For supplied-photo jobs, `overlayFrom` and `overlayTo` are not applied because the photograph is kept separate from the text panel. Those fields remain part of the blank-canvas layout.

## Execution path

```text
commerce job
    |
    v
tools/cshop-worker-adapter
    |
    | constrained MCP requests + explicit session ID
    v
standalone pinned C-Shop runtime
    |
    v
isolated workspace
    |
    +--> full-size export (deliverable)
    +--> bounded preview (inspection)
    +--> execution report
```

Pinned renderer revision:

`stubbb/c-shop@f3b2033c07df92e8e72ff83a29955a2c10494d95`

## What is intentionally not offered yet

This draft does **not** promise capabilities that the current adapter does not implement, including:

- arbitrary C-Shop scripts;
- named C-Shop styles;
- arbitrary filesystem paths;
- public or customer-accessible C-Shop MCP;
- background removal;
- generative image creation;
- automatic logo extraction;
- subject/focal-point detection;
- semantic or free-form layout instructions;
- automatic repair of a poorly composed source photograph;
- multi-image collage generation;
- batch/multi-variant delivery in a single job;
- PSD/C-Shop project delivery;
- automatic publication to marketplaces or social platforms.

The split layout is intentionally a safer deterministic default, not a claim that the renderer understands the photograph.

## Security boundary

The underlying renderer is treated as a private worker rather than a commerce-facing API.

Current constraints:

- every adapter request uses an explicit `Mcp-Session-Id`;
- renderer access is loopback-only by default;
- remote renderer URLs require explicit opt-in and a bearer token;
- raw `script` input is rejected;
- `style` is excluded from this commerce contract;
- asset/output path components are rejected before C-Shop receives the request.

## Validation state

The underlying integration remains validated:

- pinned C-Shop release build: **PASS**;
- full C-Shop Cargo workspace tests: **PASS**;
- real MCP graphics smoke: **PASS**;
- long-title fitting: **PASS**;
- source aspect-ratio preservation: **PASS**.

However, the previous full-bleed source-photo layout is now explicitly recorded as a **human visual FAIL**. The v0.2 split layout must pass the adapter suite, the real coffee-photo runtime case, and human visual inspection before this product's graphics acceptance is considered complete.

Canonical runtime receipt:

`handoffs/hermes-to-chatgpt/cshop-worker-runtime-validation-2026-08-29.json`

## Commercial state

No price is assigned in this draft yet. No payment route, x402 resource, marketplace listing, Render service, or public deployment is created by this draft.

## Promotion gate

Move this product out of `products/drafts/` only after:

1. the v0.2 supplied-photo layout passes real visual acceptance;
2. the buyer-facing scope and acceptance criteria are fixed;
3. initial price and delivery expectations are set;
4. customer asset intake into the isolated worker is defined;
5. finished-output delivery is defined;
6. the payment/distribution path for the first sale is selected;
7. one complete non-live commercial dry run passes.

Until then, this remains a product draft, not a published product.
