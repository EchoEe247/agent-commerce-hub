# Product Listing Graphic — Draft

Status: **draft / not published / not deployed**

This is the first sellable workflow built on the validated private C-Shop worker adapter. It deliberately matches the functionality that has already passed local adapter tests, the full pinned C-Shop test suite, and a real MCP render smoke. It does not introduce a public C-Shop endpoint or new rendering capabilities that have not been validated.

## Customer outcome

Create one marketplace-ready product graphic from either:

- a supplied product image placed in the isolated C-Shop workspace; or
- a blank canvas when no source image is supplied.

The workflow adds a deterministic gradient overlay, measures title text before placement, places an optional price, exports a full-size PNG/JPEG, and returns a bounded preview plus the C-Shop execution report.

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

Only the fields implemented by `tools/cshop-worker-adapter/src/product-graphics-job.mjs` are accepted. Unknown fields are rejected rather than silently ignored.

The source asset and output are simple workspace filenames, not arbitrary paths. Output is currently limited to PNG/JPEG.

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
- free-form layout instructions;
- multi-image collage generation;
- batch/multi-variant delivery in a single job;
- PSD/C-Shop project delivery;
- automatic publication to marketplaces or social platforms.

Those can be added later only when a real customer/use case justifies them and the resulting implementation is validated.

## Security boundary

The underlying renderer is treated as a private worker rather than a commerce-facing API.

Current constraints:

- every adapter request uses an explicit `Mcp-Session-Id`;
- renderer access is loopback-only by default;
- remote renderer URLs require explicit opt-in and a bearer token;
- raw `script` input is rejected;
- `style` is excluded from this commerce contract;
- asset/output path components are rejected before C-Shop receives the request.

These boundaries preserve the upstream findings recorded in the runtime validation receipt without expanding this draft into an upstream C-Shop hardening project.

## Validation evidence

The integrated worker was validated before this product draft was created:

- adapter contract suite: **4/4 PASS**;
- C-Shop release build: **PASS**;
- full C-Shop Cargo workspace tests: **PASS**;
- real MCP graphics smoke: **PASS**;
- smoke deliverable: **1200×1200 RGBA PNG, 151,467 bytes**;
- known blockers: **none**.

Canonical receipt:

`handoffs/hermes-to-chatgpt/cshop-worker-runtime-validation-2026-08-29.json`

Merged adapter commit on `main`:

`e93a8992db5760941ef0a4377f8057d05e369824`

## Commercial state

No price is assigned in this draft yet. That is intentional: runtime feasibility is proven, but pricing should be selected as part of the first actual sales/distribution experiment rather than encoded as an unsupported assumption.

No payment route, x402 resource, marketplace listing, Render service, or public deployment is created by this draft.

## Promotion gate

Move this product out of `products/drafts/` only after a concrete commercialization pass establishes:

1. the buyer-facing scope and acceptance criteria;
2. initial price and delivery expectations;
3. how customer assets enter the isolated worker workspace;
4. how the finished export is returned to the buyer;
5. the payment/distribution path to use for the first real sale;
6. a complete end-to-end dry run of that commercial path without live-value movement unless explicitly authorized.

Until then, this remains a tested capability packaged as a product draft, not a published product.
