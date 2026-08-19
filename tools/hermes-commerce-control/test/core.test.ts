import test from "node:test";
import assert from "node:assert/strict";
import { buildAppMetadata } from "../src/app.js";

test("app metadata is Mode A", () => {
  assert.deepEqual(buildAppMetadata(), {
    name: "hermes-commerce-control",
    version: "0.1.0",
    mode: "A",
  });
});
