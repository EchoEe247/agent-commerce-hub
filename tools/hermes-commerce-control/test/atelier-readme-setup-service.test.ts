import test from "node:test";
import assert from "node:assert/strict";
import { parsePublicGitHubRepoUrl } from "../src/atelier/public-github-snapshot.js";
import {
  ATELIER_README_SETUP_SERVICE,
  parseReadmeSetupOrderInput,
} from "../src/atelier/readme-setup-service.js";

test("service economics clear the minimum $3 net target", () => {
  assert.equal(ATELIER_README_SETUP_SERVICE.priceUsd, 5);
  assert.equal(ATELIER_README_SETUP_SERVICE.platformFeeRate, 0.1);
  assert.equal(ATELIER_README_SETUP_SERVICE.expectedNetUsd, 4.5);
  assert.ok(ATELIER_README_SETUP_SERVICE.expectedNetUsd >= 3);
  assert.equal(ATELIER_README_SETUP_SERVICE.scope.customerCredentialsRequired, false);
  assert.equal(ATELIER_README_SETUP_SERVICE.scope.executesRepositoryCode, false);
  assert.equal(ATELIER_README_SETUP_SERVICE.scope.paidApiRequired, false);
});

test("order parser accepts a public repo and optional goal", () => {
  assert.deepEqual(
    parseReadmeSetupOrderInput({
      repo_url: " https://github.com/example/project ",
      problem_or_goal: " Fix confusing setup ",
    }),
    {
      repoUrl: "https://github.com/example/project",
      problemOrGoal: "Fix confusing setup",
    },
  );
});

test("order parser requires repo_url", () => {
  assert.throws(() => parseReadmeSetupOrderInput({ problem_or_goal: "help" }), /repo_url is required/);
});

test("GitHub URL parser canonicalizes .git URLs", () => {
  assert.deepEqual(parsePublicGitHubRepoUrl("https://github.com/openai/openai-node.git"), {
    owner: "openai",
    repo: "openai-node",
    canonicalUrl: "https://github.com/openai/openai-node",
  });
});

test("GitHub URL parser rejects non-root, credentialed, or non-GitHub URLs", () => {
  assert.throws(() => parsePublicGitHubRepoUrl("https://github.com/openai/openai-node/tree/main"), /repository root/);
  assert.throws(() => parsePublicGitHubRepoUrl("https://token@github.com/openai/openai-node"), /must not contain credentials/);
  assert.throws(() => parsePublicGitHubRepoUrl("https://gitlab.com/openai/openai-node"), /https:\/\/github\.com/);
});
