import test from "node:test";
import assert from "node:assert/strict";

// The old verifyX402Header helper and tests that treated an arbitrary
// signature=0xabc as sufficient payment proof have been removed.
// Payment verification is now handled entirely by the official
// @x402/fastify middleware and the facilitator — no structural header
// check bypasses the facilitator's verify endpoint.
