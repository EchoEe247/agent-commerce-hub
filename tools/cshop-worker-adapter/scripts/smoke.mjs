import { readFile } from 'node:fs/promises';

import { CShopClient } from '../src/cshop-client.mjs';
import { executeProductGraphicsJob } from '../src/product-graphics-job.mjs';

const jobPath = process.argv[2];
if (!jobPath) {
  console.error('usage: node scripts/smoke.mjs JOB.json');
  process.exit(64);
}

const job = JSON.parse(await readFile(jobPath, 'utf8'));
const client = new CShopClient();
const result = await executeProductGraphicsJob(client, job);

console.log(JSON.stringify({
  output: result.output,
  report: result.report,
  sessionId: result.sessionId,
  preview: result.preview
    ? { mimeType: result.preview.mimeType, base64Length: result.preview.data.length }
    : null,
}, null, 2));
