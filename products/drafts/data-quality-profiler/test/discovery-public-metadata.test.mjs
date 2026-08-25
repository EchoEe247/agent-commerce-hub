import test from "node:test";
import assert from "node:assert/strict";
import { buildOpenApiDocument } from "../src/openapi.mjs";

test("final OpenAPI exposes operator contact and explicitly marks the free preview public", () => {
  const document = buildOpenApiDocument({});

  assert.equal(
    document.info.contact?.url,
    "https://github.com/EchoEe247/agent-commerce-hub",
  );
  assert.deepEqual(
    document.paths["/v1/company-domain-intelligence/preview"].post.security,
    [],
  );
});
