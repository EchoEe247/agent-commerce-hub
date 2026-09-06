# Security Rules

This repository can coordinate sensitive operational work, but it must never become a credential store, wallet, or place where a file is mistaken for financial authorization.

## Forbidden secrets

Never commit:

- passwords;
- API keys;
- access or refresh tokens;
- private keys;
- wallet seeds or recovery phrases;
- NWC connection strings/secrets;
- payment preimages;
- session cookies;
- Authorization headers;
- SSH private keys;
- exchange or wallet credentials;
- reusable signed payment authorizations;
- any equivalent secret that can authenticate, sign, spend, recover an account, or expose private paid data.

References to local secret locations or environment-variable names are acceptable—for example `${KILOCODE_API_KEY}`—as long as the value itself is not committed.

## Public-repository assumption

Treat every committed file as though it could become public later.

If exposing the information would create a security, privacy, financial, customer, or credential risk, do not commit it merely because the repository is currently private.

## Raw evidence

Marketplace/API captures can contain fields that were not expected when the capture was requested.

Before committing raw evidence:

- inspect for secret-bearing fields;
- remove or quarantine unsafe material;
- preserve the original locally only when it is actually needed for debugging or audit;
- do not weaken provenance by silently changing factual values that are safe to keep.

Historical evidence should stay evidence, but unsafe secret material does not belong in Git history just to preserve completeness.

## Financial authorization boundary

Repository state is coordination state, not wallet authorization.

A file changing to `ready`, `approved`, `funded`, `qualified`, or another positive state does **not** independently authorize ChatGPT, Hermes, another model, or an automated runtime to:

- send crypto or fiat value;
- sign a transaction;
- fund an opportunity;
- claim a bounty;
- purchase a proof;
- pay a worker;
- withdraw funds;
- publish reusable signing authority;
- expose wallet credentials.

The actual authorization must come through the appropriate explicit operator/runtime boundary.

## Production boundary

Likewise, a merge to `main` is not automatically production authorization. Follow the current production-promotion rules in `docs/CURRENT_STATE.md` and the relevant deployment/runtime controls.

Revenue-first operation means reducing unnecessary friction around real commercial work. It does not mean weakening the places where secrets, production, money, or irreversible actions require a real boundary.