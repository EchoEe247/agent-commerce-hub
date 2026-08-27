import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCodeTestOutputData,
  readCodeTestContract,
} from "../src/bountybook/code-test-submission.js";

test("code_test contract accepts the exact required file", () => {
  const contract = readCodeTestContract(
    {
      spec: {
        success_condition: {
          type: "code_test",
          language: "javascript",
          required_files: ["urlcheck.go"],
        },
      },
    },
    "urlcheck.go",
  );

  assert.equal(contract.type, "code_test");
  assert.deepEqual(contract.requiredFiles, ["urlcheck.go"]);
  assert.equal(contract.language, "javascript");
});

test("code_test contract parses string specs", () => {
  const contract = readCodeTestContract(
    {
      spec: JSON.stringify({
        success_condition: {
          type: "code_test",
          required_files: ["urlcheck.go"],
        },
      }),
    },
    "urlcheck.go",
  );

  assert.deepEqual(contract.requiredFiles, ["urlcheck.go"]);
});

test("code_test contract fails closed when required files drift", () => {
  assert.throws(
    () =>
      readCodeTestContract(
        {
          spec: {
            success_condition: {
              type: "code_test",
              required_files: ["urlcheck.go", "README.md"],
            },
          },
        },
        "urlcheck.go",
      ),
    /required_files changed/i,
  );
});

test("code_test payload uses files map and no metadata wrapper", () => {
  const output = buildCodeTestOutputData("urlcheck.go", "package main\nfunc main() {}\n");
  assert.deepEqual(output, {
    files: {
      "urlcheck.go": "package main\nfunc main() {}\n",
    },
  });
});
