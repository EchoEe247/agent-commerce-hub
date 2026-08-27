import test from "node:test";
import assert from "node:assert/strict";
import {
  ATELIER_AGENT_PROFILE,
  buildDocumentDeliveryPayload,
  buildReadmeSetupServicePayload,
  buildSolanaRegistrationPayload,
  parseAtelierOrder,
} from "../src/atelier/marketplace-contract.js";

test("Atelier service payload preserves approved $5 offer", () => {
  const payload = buildReadmeSetupServicePayload();
  assert.equal(payload.title, "$5 GitHub README & Setup Fix");
  assert.equal(payload.category, "coding");
  assert.equal(payload.price_usd, "5.00");
  assert.equal(payload.price_type, "fixed");
  assert.equal(payload.turnaround_hours, 4);
  assert.deepEqual(payload.deliverables, ["document"]);
  assert.equal(payload.max_revisions, 1);
  assert.deepEqual(payload.requirement_fields.map((field) => [field.key, field.required]), [
    ["repo_url", true],
    ["problem_or_goal", false],
  ]);
});

test("Solana registration payload uses same owner and signer wallet", () => {
  const payload = buildSolanaRegistrationPayload({
    ownerWallet: "8x1B2cFakeSolanaAddressForContractTest123",
    walletSignature: "3fakebase58signature",
    walletSignatureTimestamp: 1787840000000,
  });
  assert.equal(payload.name, ATELIER_AGENT_PROFILE.name);
  assert.equal(payload.owner_wallet, payload.wallet);
  assert.equal(payload.wallet_sig, "3fakebase58signature");
  assert.equal(payload.wallet_sig_ts, 1787840000000);
});

test("registration helper refuses an EVM address for the zero-cost path", () => {
  assert.throws(
    () => buildSolanaRegistrationPayload({
      ownerWallet: "0x1111111111111111111111111111111111111111",
      walletSignature: "0xfake",
      walletSignatureTimestamp: 1787840000000,
    }),
    /pinned to the documented Solana wallet-signature path/,
  );
});

test("Atelier order parser tolerates documented aliases and revision feedback", () => {
  const order = parseAtelierOrder({
    order_id: "ord_123",
    status: "revision_requested",
    service: { id: "svc_456" },
    requirements: { repo_url: "https://github.com/example/project" },
    revision_request: { feedback: "Clarify the pnpm setup." },
  });
  assert.equal(order.id, "ord_123");
  assert.equal(order.status, "revision_requested");
  assert.equal(order.serviceId, "svc_456");
  assert.deepEqual(order.brief, { repo_url: "https://github.com/example/project" });
  assert.equal(order.revisionFeedback, "Clarify the pnpm setup.");
});

test("document delivery payload requires HTTPS", () => {
  assert.deepEqual(buildDocumentDeliveryPayload("https://cdn.example.com/report.md"), {
    deliverable_url: "https://cdn.example.com/report.md",
    deliverable_media_type: "document",
  });
  assert.throws(() => buildDocumentDeliveryPayload("http://localhost/report.md"), /must use HTTPS/);
});
