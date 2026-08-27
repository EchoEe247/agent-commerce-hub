import test from "node:test";
import assert from "node:assert/strict";
import { AtelierApiClient } from "../src/atelier/api-client.js";
import { buildReadmeSetupServicePayload } from "../src/atelier/marketplace-contract.js";

interface CapturedRequest {
  readonly url: string;
  readonly method: string;
  readonly authorization: string | null;
  readonly body: string | null;
}

function fakeFetch(
  responses: readonly { readonly status: number; readonly body: unknown; readonly retryAfter?: string }[],
  captured: CapturedRequest[],
): typeof fetch {
  let index = 0;
  return (async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const headers = new Headers(init?.headers);
    captured.push({
      url,
      method: init?.method ?? "GET",
      authorization: headers.get("authorization"),
      body: typeof init?.body === "string" ? init.body : null,
    });
    const next = responses[index++];
    if (!next) throw new Error("unexpected extra request");
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: next.retryAfter ? { "Retry-After": next.retryAfter } : undefined,
    });
  }) as typeof fetch;
}

test("listOrders performs one authenticated GET and parses the envelope", async () => {
  const captured: CapturedRequest[] = [];
  const client = new AtelierApiClient({
    apiKey: "atelier_testkey123",
    fetchImpl: fakeFetch([
      {
        status: 200,
        body: {
          success: true,
          data: {
            orders: [
              {
                id: "ord_1",
                status: "paid",
                service_id: "svc_1",
                brief: { repo_url: "https://github.com/example/project" },
              },
            ],
          },
        },
      },
    ], captured),
  });

  const orders = await client.listOrders("agt_1");
  assert.equal(captured.length, 1);
  assert.equal(captured[0]?.method, "GET");
  assert.equal(captured[0]?.authorization, "Bearer atelier_testkey123");
  assert.match(captured[0]?.url ?? "", /\/api\/agents\/agt_1\/orders\?status=paid%2Cin_progress%2Crevision_requested$/);
  assert.equal(orders.length, 1);
  assert.equal(orders[0]?.id, "ord_1");
});

test("createService performs exactly one POST with approved payload", async () => {
  const captured: CapturedRequest[] = [];
  const client = new AtelierApiClient({
    apiKey: "atelier_testkey123",
    fetchImpl: fakeFetch([{ status: 201, body: { success: true, data: { id: "svc_new" } } }], captured),
  });
  const payload = buildReadmeSetupServicePayload();
  const response = await client.createService("agt_1", payload);
  assert.equal(response.status, 201);
  assert.equal(captured.length, 1);
  assert.equal(captured[0]?.method, "POST");
  assert.match(captured[0]?.url ?? "", /\/api\/agents\/agt_1\/services$/);
  assert.deepEqual(JSON.parse(captured[0]?.body ?? "null"), payload);
});

test("deliverDocument sends only HTTPS document payload", async () => {
  const captured: CapturedRequest[] = [];
  const client = new AtelierApiClient({
    apiKey: "atelier_testkey123",
    fetchImpl: fakeFetch([{ status: 200, body: { success: true } }], captured),
  });
  await client.deliverDocument("ord_1", "https://cdn.example.com/report.md");
  assert.equal(captured.length, 1);
  assert.equal(captured[0]?.method, "POST");
  assert.match(captured[0]?.url ?? "", /\/api\/orders\/ord_1\/deliver$/);
  assert.deepEqual(JSON.parse(captured[0]?.body ?? "null"), {
    deliverable_url: "https://cdn.example.com/report.md",
    deliverable_media_type: "document",
  });
});

test("429 polling failure does not retry", async () => {
  const captured: CapturedRequest[] = [];
  const client = new AtelierApiClient({
    apiKey: "atelier_testkey123",
    fetchImpl: fakeFetch([{ status: 429, body: { error: "rate limit" }, retryAfter: "120" }], captured),
  });
  await assert.rejects(() => client.listOrders("agt_1"), /retry after 120/);
  assert.equal(captured.length, 1);
});
