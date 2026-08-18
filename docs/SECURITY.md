# Security Rules

This repository may contain public or private operational metadata, but it must never be treated as a credential store.

## Forbidden secrets

Never commit:

- passwords
- API keys
- access/refresh tokens
- private keys
- wallet seeds or recovery phrases
- NWC connection strings/secrets
- payment preimages
- session cookies
- Authorization headers
- SSH private keys
- exchange or wallet credentials
- any equivalent secret capable of authentication, signing, spending, or account recovery

References to local secret locations or environment-variable names are acceptable, for example `${KILOCODE_API_KEY}`, provided the secret value is not committed.

## Public-repo assumption

Treat every committed file as if it could become public. If information would be dangerous when public, do not commit it.

## Raw evidence

Before committing marketplace/API captures, remove or quarantine any unexpected secret-bearing fields. Preserve the original locally if required for debugging, but do not push unsafe material.

## Financial actions

Repository state is coordination state, not wallet authorization. A file changing to `ready` or `approved` does not grant ChatGPT or another model independent authority to send crypto, withdraw funds, or expose wallet credentials.
