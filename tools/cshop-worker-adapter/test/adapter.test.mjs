import assert from 'node:assert/strict';
import test from 'node:test';

import { CShopClient } from '../src/cshop-client.mjs';
import { executeProductGraphicsJob, normalizeProductGraphicsJob } from '../src/product-graphics-job.mjs';

function reply(result, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify({ jsonrpc: '2.0', id: 1, result });
    },
  };
}

test('client always sends the explicit session and optional bearer token', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return reply({ protocolVersion: '2025-06-18', capabilities: { tools: {} } });
  };

  const client = new CShopClient({
    baseUrl: 'http://127.0.0.1:7333/mcp',
    token: 'test-token',
    sessionId: 'commerce-job-1234',
    fetchImpl,
  });
  await client.initialize();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers['Mcp-Session-Id'], 'commerce-job-1234');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-token');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.method, 'initialize');
  assert.equal(body.params.protocolVersion, '2025-06-18');
});

test('client is loopback-only unless remote use is explicit and authenticated', () => {
  assert.throws(
    () => new CShopClient({ baseUrl: 'https://renderer.example/mcp', sessionId: 'commerce-job-remote' }),
    /remote C-Shop endpoints are disabled/,
  );
  assert.throws(
    () => new CShopClient({
      baseUrl: 'https://renderer.example/mcp',
      allowRemote: true,
      sessionId: 'commerce-job-remote',
    }),
    /require a bearer token/,
  );
  assert.doesNotThrow(() => new CShopClient({
    baseUrl: 'https://renderer.example/mcp',
    allowRemote: true,
    token: 'remote-token',
    sessionId: 'commerce-job-remote',
  }));
});

test('commerce job rejects path traversal and unsupported fields before C-Shop sees them', () => {
  assert.throws(
    () => normalizeProductGraphicsJob({ title: 'Safe title', asset: '../secret.png' }),
    /workspace filename/,
  );
  assert.throws(
    () => normalizeProductGraphicsJob({ title: 'Safe title', output: 'nested/out.png' }),
    /workspace filename/,
  );
  assert.throws(
    () => normalizeProductGraphicsJob({ title: 'Safe title', script: 'style noir' }),
    /unsupported product graphics job field: script/,
  );
});

test('product graphics workflow keeps supplied photos out of the text panel', async () => {
  const requests = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    requests.push(body);

    if (body.method === 'initialize') {
      return reply({ protocolVersion: '2025-06-18', capabilities: { tools: {} } });
    }

    const { name, arguments: args } = body.params;
    assert.ok(['run_script', 'reset'].includes(name));
    if (name === 'reset') return reply({ content: [{ type: 'text', text: 'reset' }] });

    if (args.script.startsWith('open "coffee.jpg"')) {
      return reply({
        content: [{
          type: 'text',
          text: 'coffee.jpg: 1600x900, 1 layers\n  document: 1600x900, 1 layers\n2 steps ran, 0 failed',
        }],
      });
    }
    if (args.script.startsWith('measure text "Coffee"')) {
      return reply({ content: [{ type: 'text', text: 'measure "Coffee": 300x72 (offset 0, -58)' }] });
    }
    if (args.script.startsWith('measure text "$9.99"')) {
      return reply({ content: [{ type: 'text', text: 'measure "$9.99": 140x44 (offset 0, -36)' }] });
    }
    if (args.return_image) {
      return reply({
        content: [
          { type: 'text', text: '1200x1200, 4 layers; 3 steps ran, 0 failed' },
          { type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgo=' },
        ],
      });
    }
    return reply({ content: [{ type: 'text', text: '1200x1200, 2 layers; steps ran, 0 failed' }] });
  };

  const client = new CShopClient({ sessionId: 'commerce-job-5678', fetchImpl });
  const result = await executeProductGraphicsJob(client, {
    title: 'Coffee',
    price: '$9.99',
    asset: 'coffee.jpg',
    output: 'coffee-card.png',
  });

  assert.equal(result.output, 'coffee-card.png');
  assert.equal(result.preview.mimeType, 'image/png');

  const scripts = requests
    .filter((request) => request.method === 'tools/call' && request.params.name === 'run_script')
    .map((request) => request.params.arguments.script);
  const emitted = scripts.join('\n');
  assert.match(emitted, /open "coffee\.jpg"\ninfo/);
  assert.match(emitted, /measure text "Coffee"/);
  assert.match(emitted, /export "coffee-card\.png"/);
  assert.doesNotMatch(emitted, /\bstyle\b/);
  assert.doesNotMatch(emitted, /\bgradient\b/);

  const assetLayout = scripts.find((script) => script.startsWith('resize scale='));
  assert.ok(assetLayout, 'expected a proportional contain resize before composition');
  const scale = Number(/^resize scale=([^\n]+)/.exec(assetLayout)?.[1]);
  assert.ok(Math.abs(scale - 0.75) < 1e-9);
  assert.match(assetLayout, /\nresize 1200 1200 canvas/);
  assert.match(assetLayout, /\nmove 0 -216/);
  assert.match(assetLayout, /\nlayer new\nset name="commerce-background"\nfill #111827\norder bottom$/);
  assert.doesNotMatch(assetLayout, /^resize 1200 1200$/m);

  const compose = scripts.find((script) => script.includes('export "coffee-card.png"'));
  assert.match(compose, /text 450 973 "Coffee" size=72 color=#ffffff bold/);
  assert.match(compose, /text 530 1045 "\$9\.99" size=45 color=#f9fafb bold/);
  assert.ok(requests.every((request) => request.jsonrpc === '2.0'));
});

test('long titles are remeasured at a smaller size before rendering', async () => {
  const requests = [];
  const title = 'Wireless Noise Cancelling Headphones';
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    requests.push(body);

    if (body.method === 'initialize') {
      return reply({ protocolVersion: '2025-06-18', capabilities: { tools: {} } });
    }

    const { name, arguments: args } = body.params;
    if (name === 'reset') return reply({ content: [{ type: 'text', text: 'reset' }] });

    if (args.script.startsWith(`measure text "${title}"`)) {
      const size = Number(/size=(\d+)/.exec(args.script)?.[1]);
      if (size === 90) {
        return reply({ content: [{ type: 'text', text: `measure "${title}": 1763x90 (offset 0, -72)` }] });
      }
      if (size === 56) {
        return reply({ content: [{ type: 'text', text: `measure "${title}": 1097x56 (offset 0, -45)` }] });
      }
      throw new Error(`unexpected fitted title size: ${size}`);
    }

    if (args.return_image) {
      return reply({
        content: [
          { type: 'text', text: '1200x1200, 2 layers; 4 steps ran, 0 failed' },
          { type: 'image', mimeType: 'image/jpeg', data: '/9j/4AAQSkZJRg==' },
        ],
      });
    }

    return reply({ content: [{ type: 'text', text: '1200x1200, 1 layers; 1 steps ran, 0 failed' }] });
  };

  const client = new CShopClient({ sessionId: 'commerce-job-long-title', fetchImpl });
  const result = await executeProductGraphicsJob(client, {
    title,
    output: 'long-title.jpg',
    width: 1200,
    height: 1200,
  });

  assert.equal(result.output, 'long-title.jpg');

  const scripts = requests
    .filter((request) => request.method === 'tools/call' && request.params.name === 'run_script')
    .map((request) => request.params.arguments.script);
  assert.ok(scripts.some((script) => script.includes(`measure text "${title}" size=90 bold`)));
  assert.ok(scripts.some((script) => script.includes(`measure text "${title}" size=56 bold`)));
  const compose = scripts.find((script) => script.includes('export "long-title.jpg"'));
  assert.match(compose, /Wireless Noise Cancelling Headphones" size=56 color=/);
  assert.doesNotMatch(compose, /Wireless Noise Cancelling Headphones" size=90 color=/);
});
