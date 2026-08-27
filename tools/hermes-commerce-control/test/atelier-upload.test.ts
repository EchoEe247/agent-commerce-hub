import test from "node:test";
import assert from "node:assert/strict";
import { AtelierApiClient } from "../src/atelier/api-client.js";

test("uploadDocument sends one authenticated multipart POST and parses data.url", async () => {
  const captured: Array<{ url: string; method: string; auth: string | null; contentType: string | null; body: BodyInit | null | undefined }> = [];
  const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const headers = new Headers(init?.headers);
    captured.push({
      url,
      method: init?.method ?? "GET",
      auth: headers.get("authorization"),
      contentType: headers.get("content-type"),
      body: init?.body,
    });
    const form = init?.body;
    assert.ok(form instanceof FormData);
    const file = form.get("file");
    assert.ok(file instanceof Blob);
    assert.equal(file.size, Buffer.byteLength("# report\n"));
    return new Response(JSON.stringify({
      success: true,
      data: {
        url: "https://abc.public.blob.vercel-storage.com/atelier/uploads/report.md",
        media_type: "document",
      },
    }), { status: 200 });
  }) as typeof fetch;

  const client = new AtelierApiClient({ apiKey: "atelier_testkey123", fetchImpl });
  const result = await client.uploadDocument("report.md", "# report\n");
  assert.equal(result.url, "https://abc.public.blob.vercel-storage.com/atelier/uploads/report.md");
  assert.equal(result.mediaType, "document");
  assert.equal(captured.length, 1);
  assert.equal(captured[0]?.method, "POST");
  assert.match(captured[0]?.url ?? "", /\/api\/upload$/);
  assert.equal(captured[0]?.auth, "Bearer atelier_testkey123");
  assert.equal(captured[0]?.contentType, null, "fetch must set the multipart boundary itself");
});

test("uploadDocument rejects unsafe filenames and empty content before network", async () => {
  let calls = 0;
  const fetchImpl = (async (): Promise<Response> => {
    calls += 1;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  const client = new AtelierApiClient({ apiKey: "atelier_testkey123", fetchImpl });
  await assert.rejects(() => client.uploadDocument("../report.md", "x"), /invalid Atelier upload filename/);
  await assert.rejects(() => client.uploadDocument("report.exe", "x"), /unsupported Atelier document upload extension/);
  await assert.rejects(() => client.uploadDocument("report.md", ""), /cannot be empty/);
  assert.equal(calls, 0);
});
