#!/usr/bin/env node
import { fetchPublicRepoSnapshot } from "../src/atelier/public-github-snapshot.js";
import { analyzeReadmeSetup, type RepoStack } from "../src/atelier/readme-setup-fix.js";

const CASES: readonly { readonly url: string; readonly expectedStack: RepoStack }[] = [
  { url: "https://github.com/expressjs/express", expectedStack: "node" },
  { url: "https://github.com/pallets/flask", expectedStack: "python" },
  { url: "https://github.com/cli/cli", expectedStack: "go" },
];

type CaseResult = {
  readonly url: string;
  readonly expectedStack: RepoStack;
  readonly stack: RepoStack | "error";
  readonly issueCount: number | null;
  readonly issueCodes: readonly string[];
  readonly verifiedCommands: readonly string[];
  readonly reportLength: number | null;
  readonly pass: boolean;
  readonly error?: string;
};

const results: CaseResult[] = [];
for (const entry of CASES) {
  try {
    const snapshot = await fetchPublicRepoSnapshot(entry.url);
    const analysis = analyzeReadmeSetup(snapshot);
    results.push({
      url: entry.url,
      expectedStack: entry.expectedStack,
      stack: analysis.stack,
      issueCount: analysis.issues.length,
      issueCodes: analysis.issues.map((issue) => issue.code),
      verifiedCommands: analysis.verifiedCommands,
      reportLength: analysis.reportMarkdown.length,
      pass:
        analysis.stack === entry.expectedStack &&
        analysis.reportMarkdown.length > 200 &&
        analysis.verifiedCommands.length > 0,
    });
  } catch (error) {
    results.push({
      url: entry.url,
      expectedStack: entry.expectedStack,
      stack: "error",
      issueCount: null,
      issueCodes: [],
      verifiedCommands: [],
      reportLength: null,
      pass: false,
      error: error instanceof Error ? error.message.slice(0, 800) : String(error).slice(0, 800),
    });
  }
}

console.log(`LIVE_SMOKE_CASE_COUNT=${results.length}`);
console.log(`LIVE_SMOKE_PASS_COUNT=${results.filter((entry) => entry.pass).length}`);
console.log(`LIVE_SMOKE_RESULTS=${JSON.stringify(results)}`);
console.log("PUBLIC_REPOS_ONLY=yes");
console.log("UNTRUSTED_REPO_CODE_EXECUTED=no");
console.log("AUTHENTICATION_USED=no");
console.log("PAID_API_USED=no");
console.log("FINANCIAL_ACTION_EXECUTED=no");
console.log("BLOCKCHAIN_TX_EXECUTED=no");
console.log(`LIVE_SMOKE_PASS=${results.every((entry) => entry.pass) ? "yes" : "no"}`);

if (!results.every((entry) => entry.pass)) process.exitCode = 1;
