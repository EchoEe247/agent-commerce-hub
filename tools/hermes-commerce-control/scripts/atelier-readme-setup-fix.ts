#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fetchPublicRepoSnapshot } from "../src/atelier/public-github-snapshot.js";
import { analyzeReadmeSetup } from "../src/atelier/readme-setup-fix.js";

function usage(): never {
  console.error("usage: node --import tsx scripts/atelier-readme-setup-fix.ts <public-github-repo-url> [--output <report.md>]");
  process.exit(2);
}

const args = process.argv.slice(2);
const repoUrl = args[0];
if (!repoUrl || repoUrl.startsWith("--")) usage();

let outputPath: string | null = null;
for (let index = 1; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--output") {
    const value = args[index + 1];
    if (!value || value.startsWith("--")) usage();
    outputPath = resolve(process.cwd(), value);
    index += 1;
    continue;
  }
  usage();
}

async function main(): Promise<void> {
  const snapshot = await fetchPublicRepoSnapshot(repoUrl);
  const result = analyzeReadmeSetup(snapshot);

  if (outputPath) {
    writeFileSync(outputPath, `${result.reportMarkdown}\n`, { encoding: "utf8", mode: 0o600 });
  }

  console.log(`REPO_URL=${snapshot.repoUrl}`);
  console.log(`DEFAULT_BRANCH=${snapshot.defaultBranch}`);
  console.log(`STACK=${result.stack}`);
  console.log(`PACKAGE_MANAGER=${result.packageManager ?? "none"}`);
  console.log(`ISSUE_COUNT=${result.issues.length}`);
  console.log(`ISSUE_CODES=${result.issues.map((issue) => issue.code).join(",") || "none"}`);
  console.log(`VERIFIED_COMMAND_COUNT=${result.verifiedCommands.length}`);
  console.log(`OUTPUT_PATH=${outputPath ?? "stdout"}`);
  console.log("UNTRUSTED_REPO_CODE_EXECUTED=no");
  console.log("CUSTOMER_CREDENTIALS_REQUIRED=no");
  console.log("PAID_API_USED=no");
  console.log("FINANCIAL_ACTION_EXECUTED=no");
  console.log("BLOCKCHAIN_TX_EXECUTED=no");
  console.log("---REPORT---");
  console.log(result.reportMarkdown);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`README_SETUP_FIX_FAILED=${message.slice(0, 1200)}`);
  console.error("UNTRUSTED_REPO_CODE_EXECUTED=no");
  console.error("FINANCIAL_ACTION_EXECUTED=no");
  process.exitCode = 1;
});
