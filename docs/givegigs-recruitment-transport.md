# GiveGigs recruitment transport

This is the first concrete credential-bearing recruitment transport behind the existing exact-intent B1 human-recruitment boundary.

Canonical module:

`tools/hermes-commerce-control/src/opportunities/givegigs-recruitment-transport.ts`

The transport targets GiveGigs' live REST task endpoint:

`POST https://givegigs.com/api/ai/tasks`

The provider contract was re-checked against GiveGigs' public API documentation on **2026-08-30**. The documented write endpoint requires an API key, supports `OFFSITE_PAY`, returns a task URL, and does not itself move the worker's compensation. GiveGigs' documented funded/crypto-staked task mode remains separate and is not used by this adapter.

Public references:

- `https://givegigs.com/ai/api-docs`
- `https://givegigs.com/ai`

## Why this transport fits B1

`OFFSITE_PAY` creates a worker-facing marketplace task while leaving actual payment outside GiveGigs. That makes the external task post a B1 external write rather than a B2 value-movement action.

The transport therefore does **not**:

- fund a task;
- send crypto;
- debit a wallet;
- release worker compensation;
- decide final worker compensation;
- enable general external writes.

A later real worker payment still requires the separate B2 design/authorization.

## Exact posting binding

GiveGigs requires worker-visible posting information that is more specific than the generic marketplace renderer, including contact and off-site payment information and, for local work, structured location data.

`buildGiveGigsRecruitmentTarget(...)` hashes the normalized non-secret GiveGigs posting configuration into the generic recruitment target:

`givegigs:offsite-pay:<32 hex>`

The binding covers:

- worker contact instructions;
- off-site payment-method text;
- optional client profile id;
- optional skills;
- urgency;
- optional expiry days;
- `REMOTE` vs `LOCAL`;
- local latitude / longitude / country / optional location name and radius.

Because the generic recruitment intent already binds the exact target string, changing any of those provider-visible settings changes the target and therefore changes the `hintent_...` that must be explicitly approved.

This prevents a transport from changing payment/contact/location details underneath an already-approved exact B1 intent.

## Frozen worker terms

The generic executor now passes the transport the existing frozen `workerTerms` object. It still does **not** expose upstream payout, internal margin, model reasoning, ranking scores, source listing text, or internal worker references.

For GiveGigs the transport maps:

- frozen full compensation → `promisedAmount`;
- currency → `USD`;
- transport type → `OFFSITE_PAY`;
- frozen rendered title/body → GiveGigs title/description;
- bound posting configuration → contact/payment/location/provider fields.

The frozen good-faith-attempt compensation remains in the rendered description produced from the contract.

## Physical vs remote work

The transport fails closed on a kind/location contradiction:

- a `physical` contract requires a `LOCAL` GiveGigs posting configuration;
- a `remote` contract requires a `REMOTE` GiveGigs posting configuration.

A local configuration must provide valid latitude, longitude, and country before a target can execute. This ensures a physical task is not published as an unlocated remote listing.

## Credential boundary

The API key is supplied lazily by an injected `apiKeyProvider` only when the exact approved transport is about to make the fixed GiveGigs request.

The key is never stored in:

- `CommerceConfig`;
- the recruitment payload or intent;
- the target binding;
- the request hash;
- the idempotency journal;
- execution receipts;
- lifecycle records;
- transport error messages.

The endpoint is fixed in code to `https://givegigs.com/api/ai/tasks`; untrusted opportunity/provider text cannot redirect the credential to another host.

A runtime may source the key from secret custody (for example an environment-backed secret provider), but the raw value must not be committed or persisted by Commerce Control.

## Crash-conservative idempotency

GiveGigs documents a short same-title deduplication window, but the generic recruitment executor requires stronger retry behavior than a five-minute title check.

`JsonlGiveGigsIdempotencyStore` therefore records a local claim **before** the remote POST.

State transitions are:

`claimed → completed`

or, only when no mutation is definitively established:

`claimed → released → claimed`

A completed key replays the stored task URL without another network call.

If the process times out, loses the connection, receives a 5xx, or receives a success response that cannot be safely parsed, the claim deliberately remains `pending`. An automatic retry stops before another POST. This trades a temporary operator reconciliation step for duplicate-listing prevention.

For provider responses that definitively indicate no task was created (for example authentication/validation/rate-limit responses), the transport releases the claim and a corrected retry may proceed.

Corrupt complete journal records fail closed instead of being silently ignored.

## Real execution prerequisites

Repository implementation alone does not authorize or perform a GiveGigs post. A real task requires all of the following at runtime:

1. a financially ready frozen human-fulfillment contract;
2. a GiveGigs target built from the exact intended worker-visible posting configuration;
3. fresh verification of the relevant GiveGigs/platform rules;
4. the resulting exact prepared `hintent_...`;
5. explicit B1 activation for that exact intent id;
6. a valid GiveGigs API key supplied from secret custody;
7. the durable local idempotency store;
8. invocation through `executeHumanRecruitmentAction(...)`.

The current PR validates this path with an injected HTTP transport only. It does **not** use a real API key and does not create a live GiveGigs task.

## Current commercial boundary

Once a real upstream opportunity passes delegation, economics, deadline, safety, and capability checks, this adapter can be the first marketplace path used to recruit a worker without enabling B2.

After a worker applies, the existing candidate qualification, assignment, attempt/correction, final review, and worker-performance machinery remains authoritative. GiveGigs posting does not bypass those stages.