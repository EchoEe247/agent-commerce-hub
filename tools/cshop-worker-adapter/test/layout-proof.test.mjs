import assert from 'node:assert/strict';
import test from 'node:test';

import { CShopClient } from '../src/cshop-client.mjs';
import { executeProductGraphicsJob } from '../src/product-graphics-job.mjs';
import { assetLayoutGeometry, assertAssetLayoutInvariants } from '../src/layout-policy.mjs';

function reply(result, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify({ jsonrpc: '2.0', id: 1, result });
    },
  };
}

const CANVASES = [
  [256, 256],
  [320, 640],
  [640, 320],
  [1080, 1350],
  [1200, 1200],
  [1600, 900],
  [2048, 2048],
  [4096, 256],
  [256, 4096],
  [4096, 4096],
];

const SOURCES = [
  [1, 1],
  [1280, 853],
  [853, 1280],
  [2000, 500],
  [500, 2000],
  [4096, 4096],
  [10000, 333],
  [333, 10000],
];

test('asset layout invariants hold across broad deterministic dimensions', () => {
  for (const [canvasWidth, canvasHeight] of CANVASES) {
    for (const [sourceWidth, sourceHeight] of SOURCES) {
      const layout = assetLayoutGeometry({ canvasWidth, canvasHeight, sourceWidth, sourceHeight });
      assert.equal(assertAssetLayoutInvariants(layout), true);

      const sourceRatio = sourceWidth / sourceHeight;
      const scaledRatio = layout.scaledWidth / layout.scaledHeight;
      assert.ok(Math.abs(sourceRatio - scaledRatio) <= Math.max(1, sourceRatio) * 1e-12);
      assert.ok(layout.panelTop + layout.panelHeight === canvasHeight);
      assert.ok(layout.x >= -1e-7);
      assert.ok(layout.y >= -1e-7);
      assert.ok(layout.x + layout.scaledWidth <= canvasWidth + 1e-7);
      assert.ok(layout.y + layout.scaledHeight <= layout.panelTop + 1e-7);
    }
  }

  assert.throws(
    () => assetLayoutGeometry({ canvasWidth: 1200, canvasHeight: 1200, sourceWidth: 0, sourceHeight: 853 }),
    /sourceWidth must be a positive finite number/,
  );
});

test('real workflow follows the invariant geometry across representative asset shapes', async () => {
  const cases = [
    { canvas: [256, 256], source: [1280, 853] },
    { canvas: [1080, 1350], source: [1280, 853] },
    { canvas: [1600, 900], source: [853, 1280] },
    { canvas: [1200, 1200], source: [2000, 500] },
    { canvas: [1200, 1200], source: [500, 2000] },
  ];

  for (const [index, entry] of cases.entries()) {
    const [width, height] = entry.canvas;
    const [sourceWidth, sourceHeight] = entry.source;
    const requests = [];
    const fetchImpl = async (_url, init) => {
      const body = JSON.parse(init.body);
      requests.push(body);

      if (body.method === 'initialize') {
        return reply({ protocolVersion: '2025-06-18', capabilities: { tools: {} } });
      }

      const { name, arguments: args } = body.params;
      if (name === 'reset') return reply({ content: [{ type: 'text', text: 'reset' }] });

      if (args.script.startsWith('open "fixture.jpg"')) {
        return reply({
          content: [{
            type: 'text',
            text: `fixture.jpg: ${sourceWidth}x${sourceHeight}, 1 layers\n  document: ${sourceWidth}x${sourceHeight}, 1 layers\n2 steps ran, 0 failed`,
          }],
        });
      }
      if (args.script.startsWith('measure text "Proof"')) {
        return reply({ content: [{ type: 'text', text: 'measure "Proof": 72x28 (offset 0, -22)' }] });
      }
      if (args.script.startsWith('measure text "$1.00"')) {
        return reply({ content: [{ type: 'text', text: 'measure "$1.00": 54x20 (offset 0, -16)' }] });
      }
      if (args.return_image) {
        return reply({
          content: [
            { type: 'text', text: `${width}x${height}, commerce-background, 3 layers; 3 steps ran, 0 failed` },
            { type: 'image', mimeType: 'image/jpeg', data: '/9j/4AAQSkZJRg==' },
          ],
        });
      }
      return reply({ content: [{ type: 'text', text: `${width}x${height}, 2 layers; 6 steps ran, 0 failed` }] });
    };

    const client = new CShopClient({ sessionId: `proof-layout-${index}`, fetchImpl });
    await executeProductGraphicsJob(client, {
      title: 'Proof',
      price: '$1.00',
      asset: 'fixture.jpg',
      output: `proof-${index}.jpg`,
      width,
      height,
    });

    const scripts = requests
      .filter((request) => request.method === 'tools/call' && request.params.name === 'run_script')
      .map((request) => request.params.arguments.script);
    const layout = assetLayoutGeometry({ canvasWidth: width, canvasHeight: height, sourceWidth, sourceHeight });
    const prepare = scripts.find((script) => script.startsWith('resize scale='));
    assert.ok(prepare, `missing asset preparation script for case ${index}`);

    const scale = Number(/^resize scale=([^\n]+)/.exec(prepare)?.[1]);
    assert.ok(Math.abs(scale - layout.scale) <= 1e-12, `wrong contain scale for case ${index}`);
    assert.match(prepare, new RegExp(`resize ${width} ${height} canvas`));
    assert.match(prepare, new RegExp(`move 0 -${layout.verticalShift}`));
    assert.match(prepare, /set name="commerce-background"/);

    const compose = scripts.find((script) => script.includes(`export "proof-${index}.jpg"`));
    assert.ok(compose, `missing compose/export script for case ${index}`);
    assert.doesNotMatch(compose, /\bgradient\b/);
    assert.doesNotMatch(compose, /commerce-overlay/);
  }
});
