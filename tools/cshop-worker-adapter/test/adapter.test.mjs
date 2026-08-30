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

test('product graphics workflow uses measured placement and emits only its constrained script', async () => {
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

    if (args.script.startsWith('measure text "Coffee"')) {
      return reply({ content: [{ type: 'text', text: 'measure "Coffee": 300x72 (offset 0, -58)' }] });
    }
    if (args.script.startsWith('measure text "$9.99"')) {
      return reply({ content: [{ type: 'text', text: 'measure "$9.99": 140x44 (offset 0, -36)' }] });
    }
    if (args.return_image) {
      return reply({
        content: [
          { type: 'text', text: '1200x1200, 4 layers; 5 steps ran, 0 failed' },
          { type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgo=' },
        ],
      });
    }
    return reply({ content: [{ type: 'text', text: '1200x1200, 1 layers; 1 steps ran, 0 failed' }] });
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
  assert.match(emitted, /open "coffee\.jpg"/);
  assert.match(emitted, /measure text "Coffee"/);
  assert.match(emitted, /export "coffee-card\.png"/);
  assert.doesNotMatch(emitted, /\bstyle\b/);
  assert.ok(requests.every((request) => request.jsonrpc === '2.0'));
});
