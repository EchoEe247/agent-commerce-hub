import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CShopClient } from '../src/cshop-client.mjs';
import { executeProductGraphicsJob } from '../src/product-graphics-job.mjs';

const workspaceArg = process.argv[2];
if (!workspaceArg) {
  console.error('usage: node scripts/acceptance-matrix.mjs CSHOP_WORKSPACE');
  process.exit(64);
}

const workspace = path.resolve(workspaceArg);
await mkdir(workspace, { recursive: true });

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../..');
const fixtureSource = path.join(
  repoRoot,
  'receipts/visual-acceptance/product-listing-graphic/2026-08-30-split-layout-v02/source-coffee.jpg',
);
const workspaceFixture = path.join(workspace, 'proof-coffee.jpg');
await copyFile(fixtureSource, workspaceFixture);

const cases = [
  {
    id: 'blank-square',
    kind: 'blank',
    job: { title: 'Coffee Beans', price: '$9.99', output: 'proof-blank-square.jpg', width: 1200, height: 1200 },
  },
  {
    id: 'blank-long-title',
    kind: 'blank',
    job: {
      title: 'Wireless Noise Cancelling Headphones',
      price: '$79.99',
      output: 'proof-blank-long-title.jpg',
      width: 1200,
      height: 1200,
    },
  },
  {
    id: 'blank-portrait-no-price',
    kind: 'blank',
    job: { title: 'Summer Collection', output: 'proof-blank-portrait.jpg', width: 1080, height: 1350 },
  },
  {
    id: 'asset-square',
    kind: 'asset',
    job: {
      title: 'Fresh Roasted Coffee',
      price: '$12.99',
      asset: 'proof-coffee.jpg',
      output: 'proof-asset-square.jpg',
      width: 1200,
      height: 1200,
    },
  },
  {
    id: 'asset-portrait',
    kind: 'asset',
    job: {
      title: 'Fresh Roasted Coffee',
      price: '$12.99',
      asset: 'proof-coffee.jpg',
      output: 'proof-asset-portrait.jpg',
      width: 1080,
      height: 1350,
    },
  },
  {
    id: 'asset-landscape',
    kind: 'asset',
    job: {
      title: 'Fresh Roasted Coffee',
      price: '$12.99',
      asset: 'proof-coffee.jpg',
      output: 'proof-asset-landscape.jpg',
      width: 1600,
      height: 900,
    },
  },
  {
    id: 'asset-small-square',
    kind: 'asset',
    job: {
      title: 'Coffee',
      price: '$4.99',
      asset: 'proof-coffee.jpg',
      output: 'proof-asset-small.jpg',
      width: 256,
      height: 256,
    },
  },
];

function jpegSize(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 < buffer.length) {
    while (offset < buffer.length && buffer[offset] !== 0xff) offset += 1;
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    const isSof = [
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
      0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
    ].includes(marker);
    if (isSof && length >= 7) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += length;
  }
  return null;
}

function pngSize(buffer) {
  const signature = '89504e470d0a1a0a';
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== signature) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function imageSize(filePath) {
  const buffer = await readFile(filePath);
  const size = pngSize(buffer) ?? jpegSize(buffer);
  if (!size) throw new Error(`unsupported or unreadable output image: ${filePath}`);
  return size;
}

const results = [];
for (const entry of cases) {
  try {
    const client = new CShopClient();
    const result = await executeProductGraphicsJob(client, entry.job);
    const outputPath = path.join(workspace, result.output);
    const info = await stat(outputPath);
    const size = await imageSize(outputPath);

    if (size.width !== entry.job.width || size.height !== entry.job.height) {
      throw new Error(
        `wrong output dimensions: expected ${entry.job.width}x${entry.job.height}, got ${size.width}x${size.height}`,
      );
    }

    if (entry.kind === 'asset') {
      if (!result.report.includes('commerce-background')) {
        throw new Error('asset output report does not contain commerce-background');
      }
      if (result.report.includes('commerce-overlay')) {
        throw new Error('asset output unexpectedly contains commerce-overlay');
      }
    } else if (!result.report.includes('commerce-overlay')) {
      throw new Error('blank output report does not contain commerce-overlay');
    }

    results.push({
      id: entry.id,
      kind: entry.kind,
      status: 'PASS',
      output: result.output,
      width: size.width,
      height: size.height,
      bytes: info.size,
      report: result.report,
    });
  } catch (error) {
    results.push({
      id: entry.id,
      kind: entry.kind,
      status: 'FAIL',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const passed = results.filter((entry) => entry.status === 'PASS').length;
const failed = results.length - passed;
const summary = {
  schemaVersion: 1,
  cshopUrl: process.env.CSHOP_URL || 'http://127.0.0.1:7333/mcp',
  fixture: 'proof-coffee.jpg',
  total: results.length,
  passed,
  failed,
  result: failed === 0 ? 'PASS' : 'FAIL',
  cases: results,
  visualAcceptance: 'PENDING',
};

await writeFile(
  path.join(workspace, 'acceptance-matrix.json'),
  `${JSON.stringify(summary, null, 2)}\n`,
  'utf8',
);

const cards = results
  .filter((entry) => entry.status === 'PASS')
  .map((entry) => `
    <article>
      <h2>${entry.id}</h2>
      <img src="${entry.output}" alt="${entry.id}">
      <p>${entry.width}×${entry.height} · ${entry.bytes} bytes · ${entry.kind}</p>
    </article>`)
  .join('\n');

await writeFile(
  path.join(workspace, 'acceptance-matrix.html'),
  `<!doctype html>
<meta charset="utf-8">
<title>C-Shop product graphics acceptance matrix</title>
<style>
body{font-family:system-ui,sans-serif;background:#111827;color:#f9fafb;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}article{background:#1f2937;padding:16px;border-radius:12px}img{display:block;width:100%;height:auto;background:white}h1,h2,p{margin:0 0 12px}p{color:#d1d5db}
</style>
<h1>C-Shop product graphics acceptance matrix — ${summary.result}</h1>
<p>${passed}/${results.length} mechanical runtime cases passed. Visual acceptance remains separate.</p>
<main>${cards}</main>\n`,
  'utf8',
);

console.log(JSON.stringify(summary, null, 2));
if (failed > 0) process.exitCode = 1;
