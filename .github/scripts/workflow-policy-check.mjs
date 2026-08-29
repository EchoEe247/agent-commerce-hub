import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW_DIR = path.join(ROOT, ".github", "workflows");
const allowedWriteWorkflow = "hermes-x402-signer.yml";
const errors = [];

for (const name of fs.readdirSync(WORKFLOW_DIR).filter((n) => /\.ya?ml$/i.test(n)).sort()) {
  const filePath = path.join(WORKFLOW_DIR, name);
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    const match = line.match(/^\s*uses:\s*([^@\s]+)@([^\s#]+)/);
    if (!match) continue;
    const [, action, ref] = match;
    if (action.startsWith("./")) continue;
    if (!/^[0-9a-f]{40}$/i.test(ref)) {
      errors.push(`${name}:${index + 1}: action ${action} must be pinned to a full 40-char commit SHA`);
    }
  }

  if (/npm\s+ci\s*\|\|\s*npm\s+install/.test(text)) {
    errors.push(`${name}: npm ci || npm install fallback is forbidden`);
  }

  if (/uses:\s*actions\/checkout@/i.test(text)) {
    const checkoutUses = [...text.matchAll(/uses:\s*actions\/checkout@[0-9a-f]{40}[^\n]*\n(?:\s+[^\n]*\n)*/gi)];
    if (checkoutUses.length === 0 || checkoutUses.some((m) => !/persist-credentials:\s*false/i.test(m[0]))) {
      errors.push(`${name}: every actions/checkout use must set persist-credentials: false`);
    }
  }

  if (/\bcontents:\s*write\b/.test(text) && name !== allowedWriteWorkflow) {
    errors.push(`${name}: contents: write is only allowed in ${allowedWriteWorkflow}`);
  }
}

const buyer = fs.readFileSync(path.join(WORKFLOW_DIR, "hermes-agent402-buy.yml"), "utf8");
if (/upload-artifact|private-results/i.test(buyer)) {
  errors.push("hermes-agent402-buy.yml: public buyer workflow must not upload or reference private paid results");
}

const live = fs.readFileSync(path.join(WORKFLOW_DIR, "hermes-seller-live-check.yml"), "utf8");
if (/api\/index\/register|git\s+push|contents:\s*write/i.test(live)) {
  errors.push("hermes-seller-live-check.yml: live smoke must remain read-only");
}
if (/^\s*push:\s*$/m.test(live)) {
  errors.push("hermes-seller-live-check.yml: live smoke must not run automatically on push");
}

if (errors.length) {
  console.error("WORKFLOW_POLICY=FAIL");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("WORKFLOW_POLICY=PASS");
