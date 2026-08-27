import test from "node:test";
import assert from "node:assert/strict";
import { extractScriptSources, disputeSnippets } from "../scripts/bountybook-dispute-schema-inspect.js";

test("dispute schema inspector extracts only same-origin JavaScript assets", () => {
  const html = `
    <script src="/_next/static/chunks/a.js"></script>
    <script src='https://www.bountybook.ai/_next/static/chunks/b.js?x=1'></script>
    <script src="https://evil.example/x.js"></script>
    <script src="/not-js.css"></script>
  `;
  assert.deepEqual(extractScriptSources(html, "https://www.bountybook.ai/job/abc"), [
    "https://www.bountybook.ai/_next/static/chunks/a.js",
    "https://www.bountybook.ai/_next/static/chunks/b.js?x=1",
  ]);
});

test("dispute schema inspector returns bounded dispute-related snippets", () => {
  const source = `fetch(API + "/bounties/" + id + "/dispute", {
    method: "POST",
    body: JSON.stringify({ reason: explanation, attemptId })
  });`;
  const snippets = disputeSnippets(source);
  assert.ok(snippets.length > 0);
  assert.ok(snippets.some((snippet) => snippet.includes("/dispute")));
  assert.ok(snippets.some((snippet) => snippet.includes("reason")));
});
