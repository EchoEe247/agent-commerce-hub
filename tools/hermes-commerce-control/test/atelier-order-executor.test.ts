import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { executeAtelierReadmeOrderOnce, type AtelierOrderExecutionClient } from "../src/atelier/order-executor.js";
import { parseAtelierOrder } from "../src/atelier/marketplace-contract.js";

const RAW_ORDER = {
  id: "ord_123",
  status: "paid",
  service_id: "svc_setup",
  brief: { repo_url: "https://github.com/example/project" },
};

const prepare = async (rawOrder: unknown) => ({
  order: parseAtelierOrder(rawOrder),
  input: { repoUrl: "https://github.com/example/project", problemOrGoal: null },
  result: {
    stack: "node" as const,
    packageManager: "npm" as const,
    issues: [],
    verifiedCommands: ["npm install", "npm test"],
    suggestedReadmeSection: "## Setup\n",
    reportMarkdown: "# README & Setup Fix Report\n",
  },
  reportMarkdown: "# README & Setup Fix Report\n\nEverything is deterministic.",
});

test("order executor uploads and delivers exactly once, then skips duplicate polling", async () => {
  const stateRoot = mkdtempSync(join(tmpdir(), "atelier-order-exec-"));
  let uploads = 0;
  let deliveries = 0;
  const client: AtelierOrderExecutionClient = {
    uploadDocument: async () => {
      uploads += 1;
      return {
        url: "https://blob.public.blob.vercel-storage.com/report.md",
        mediaType: "document",
        response: { status: 200, body: { success: true }, retryAfter: null },
      };
    },
    deliverDocument: async () => {
      deliveries += 1;
      return { status: 200, body: { success: true }, retryAfter: null };
    },
  };
  try {
    const first = await executeAtelierReadmeOrderOnce({ client, rawOrder: RAW_ORDER, serviceId: "svc_setup", stateRoot, prepare });
    assert.equal(first.action, "delivered");
    assert.equal(first.state, "delivered");
    assert.equal(uploads, 1);
    assert.equal(deliveries, 1);

    const second = await executeAtelierReadmeOrderOnce({ client, rawOrder: RAW_ORDER, serviceId: "svc_setup", stateRoot, prepare });
    assert.equal(second.action, "skipped");
    assert.equal(second.state, "delivered");
    assert.equal(uploads, 1);
    assert.equal(deliveries, 1);
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("ambiguous upload is never automatically retried", async () => {
  const stateRoot = mkdtempSync(join(tmpdir(), "atelier-order-ambiguous-"));
  let uploads = 0;
  const client: AtelierOrderExecutionClient = {
    uploadDocument: async () => {
      uploads += 1;
      throw new Error("socket closed after POST");
    },
    deliverDocument: async () => {
      throw new Error("delivery must not run");
    },
  };
  try {
    const first = await executeAtelierReadmeOrderOnce({ client, rawOrder: RAW_ORDER, serviceId: "svc_setup", stateRoot, prepare });
    assert.equal(first.action, "manual_review");
    assert.equal(first.state, "upload_attempted");
    assert.equal(uploads, 1);

    const second = await executeAtelierReadmeOrderOnce({ client, rawOrder: RAW_ORDER, serviceId: "svc_setup", stateRoot, prepare });
    assert.equal(second.action, "manual_review");
    assert.equal(second.state, "upload_attempted");
    assert.equal(uploads, 1);
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("one revision uses a separate durable phase", async () => {
  const stateRoot = mkdtempSync(join(tmpdir(), "atelier-order-revision-"));
  let uploads = 0;
  let deliveries = 0;
  const client: AtelierOrderExecutionClient = {
    uploadDocument: async () => {
      uploads += 1;
      return { url: `https://blob.public.blob.vercel-storage.com/report-${uploads}.md`, mediaType: "document", response: { status: 200, body: {}, retryAfter: null } };
    },
    deliverDocument: async () => {
      deliveries += 1;
      return { status: 200, body: {}, retryAfter: null };
    },
  };
  try {
    await executeAtelierReadmeOrderOnce({ client, rawOrder: RAW_ORDER, serviceId: "svc_setup", stateRoot, prepare });
    const revision = { ...RAW_ORDER, status: "revision_requested", revision_feedback: "Clarify install step" };
    const result = await executeAtelierReadmeOrderOnce({ client, rawOrder: revision, serviceId: "svc_setup", stateRoot, prepare });
    assert.equal(result.phase, "revision-1");
    assert.equal(result.action, "delivered");
    assert.equal(uploads, 2);
    assert.equal(deliveries, 2);
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});
