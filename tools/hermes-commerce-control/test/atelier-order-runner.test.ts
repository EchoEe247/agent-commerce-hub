import test from "node:test";
import assert from "node:assert/strict";
import { parseReadmeSetupInputFromBrief } from "../src/atelier/order-runner.js";

test("order runner parses direct requirement fields", () => {
  assert.deepEqual(
    parseReadmeSetupInputFromBrief({
      repo_url: "https://github.com/example/project",
      problem_or_goal: "Fix the npm setup.",
    }),
    {
      repoUrl: "https://github.com/example/project",
      problemOrGoal: "Fix the npm setup.",
    },
  );
});

test("order runner parses nested requirements", () => {
  assert.deepEqual(
    parseReadmeSetupInputFromBrief({
      requirements: {
        repository_url: "https://github.com/example/project",
        goal: "Clarify installation",
      },
    }),
    {
      repoUrl: "https://github.com/example/project",
      problemOrGoal: "Clarify installation",
    },
  );
});

test("order runner parses JSON and plain-text briefs", () => {
  assert.deepEqual(
    parseReadmeSetupInputFromBrief('{"repo_url":"https://github.com/example/project"}'),
    { repoUrl: "https://github.com/example/project", problemOrGoal: null },
  );
  assert.deepEqual(
    parseReadmeSetupInputFromBrief("Please fix https://github.com/example/project because setup is confusing."),
    {
      repoUrl: "https://github.com/example/project",
      problemOrGoal: "Please fix because setup is confusing.",
    },
  );
});

test("order runner rejects a brief without a repository URL", () => {
  assert.throws(
    () => parseReadmeSetupInputFromBrief("Please fix the setup instructions."),
    /does not contain a public GitHub repository URL/,
  );
});
