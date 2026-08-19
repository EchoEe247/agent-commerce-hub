import test from "node:test";
import assert from "node:assert/strict";
import { verifyX402Header } from "../src/payments/helpers.mjs";

test("accepts valid exact scheme header", () => {
  assert.doesNotThrow(() =>
    verifyX402Header(
      {
        scheme: "exact",
        network: "eip155:84532",
        payload: {
          signature: "0xabc",
          authorization: { from: "0xbuyer", to: "0x0000000000000000000000000000000000000001", amount: "10000" },
        },
      },
      { facilitatorUrl: "", payTo: "0x0000000000000000000000000000000000000001", network: "eip155:84532", price: "$0.02" }
    )
  );
});

test("rejects network mismatch", () => {
  assert.throws(
    () =>
      verifyX402Header(
        { scheme: "exact", network: "eip155:1", payload: { signature: "0xabc", authorization: { to: "0x0000000000000000000000000000000000000001", amount: "10000" } } },
        { facilitatorUrl: "", payTo: "0x0000000000000000000000000000000000000001", network: "eip155:84532", price: "$0.02" }
      ),
    /network mismatch/
  );
});

test("rejects unsupported scheme", () => {
  assert.throws(
    () => verifyX402Header({ scheme: "unknown" }, { facilitatorUrl: "", payTo: "", network: "", price: "" }),
    /unsupported scheme/
  );
});
