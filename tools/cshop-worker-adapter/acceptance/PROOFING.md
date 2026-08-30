# Product Graphics Proof Gate

This adapter is pre-production, but renderer regressions should be caught systematically rather than rediscovered one image at a time.

## What automation can prove

The automated gate treats these as invariants:

- job inputs stay bounded and continue rejecting raw scripts, styles, path traversal, and unknown fields;
- supplied-image layout preserves source aspect ratio;
- supplied images remain fully contained in the image zone by default;
- supplied images do not overlap the dedicated text panel;
- blank-canvas jobs keep their gradient layout while supplied-photo jobs do not receive that gradient;
- title and price are measured and fitted before placement;
- requested output dimensions are exact;
- layout geometry stays valid across minimum, maximum, portrait, landscape, square, and extreme source aspect ratios;
- the pinned real C-Shop runtime can execute a reusable acceptance matrix.

## What automation cannot honestly prove

Geometry tests cannot decide whether an arbitrary customer photograph is aesthetically good, whether similarly colored objects are perceptually ambiguous, or whether a composition communicates the intended product clearly.

Those remain an explicit visual gate. A mechanical PASS must never be promoted to a visual PASS automatically.

## Permanent regression rule

When a real defect is found:

1. classify the failure;
2. add a regression assertion or runtime-matrix case that would have caught it;
3. implement the coherent fix;
4. run the full adapter suite;
5. if renderer/layout behavior changed, run the runtime matrix once against pinned C-Shop;
6. visually review the matrix outputs once;
7. merge only when the required gates pass.

This prevents the same class of defect from returning without turning every change into another architecture review.

## Current failure classes encoded

- long titles overflowing the canvas;
- non-square product photos being stretched;
- center-cover cropping trimming source content;
- full-bleed photo + gradient composition making source shapes read like artificial shadows/halos;
- asset text crossing into the photo area;
- blank and supplied-photo layouts accidentally sharing the wrong overlay behavior;
- path traversal and unsupported raw script/style input.

## CI gate

`npm test` is dependency-free and is run by the protected `workflow-policy` job on every pull request to protected branches.

The suite contains both concrete regressions and deterministic layout-property coverage.

## Real-runtime matrix

When renderer/layout code changes, start the pinned C-Shop worker with a fresh workspace and run:

```bash
cd tools/cshop-worker-adapter
CSHOP_URL=http://127.0.0.1:7333/mcp \
  npm run acceptance:runtime -- /path/to/cshop-workspace
```

The runner uses the committed coffee source fixture and produces:

- blank square;
- blank long-title;
- blank portrait/no-price;
- supplied-photo square;
- supplied-photo portrait;
- supplied-photo landscape;
- supplied-photo small-square.

It checks exact exported dimensions and expected layout-layer class, writes `acceptance-matrix.json`, and leaves all rendered images plus `acceptance-matrix.html` in the workspace for one visual pass.

Do not run this matrix for unrelated seller/payment/control-plane changes. It is a renderer/layout gate, not a ritual.

## Acceptance states

Keep these separate:

- `MECHANICAL_ACCEPTANCE=PASS|FAIL`
- `RUNTIME_MATRIX=PASS|FAIL|NOT_REQUIRED`
- `VISUAL_ACCEPTANCE=PASS|FAIL|NOT_REQUIRED`

Never collapse them into one PASS when a required gate has not run.
