#!/usr/bin/env bash
set -euo pipefail

# Prefer the unlock-once memory signer broker. When it is healthy, this command
# performs authenticated inspection without asking the operator for a passphrase.
if node --import tsx scripts/bountybook-signer-status.ts >/dev/null 2>&1; then
  exec node --import tsx scripts/bountybook-failure-inspect-broker.ts
fi

# Safe fallback for sessions where the broker has not been unlocked yet.
if [[ ! -t 0 ]]; then
  echo "ERROR: signer broker is unavailable and passphrase fallback requires an interactive local terminal" >&2
  exit 1
fi

read -r -s -p "BountyBook keystore passphrase: " BOUNTYBOOK_KEYSTORE_PASSPHRASE
printf '\n'
if [[ -z "${BOUNTYBOOK_KEYSTORE_PASSPHRASE}" ]]; then
  echo "ERROR: empty passphrase" >&2
  exit 1
fi

export BOUNTYBOOK_KEYSTORE_PASSPHRASE
cleanup() {
  unset BOUNTYBOOK_KEYSTORE_PASSPHRASE || true
}
trap cleanup EXIT INT TERM

node --import tsx scripts/bountybook-failure-inspect.ts
