#!/usr/bin/env bash
set -euo pipefail

export BOUNTYBOOK_DISPUTE_APPROVED=yes
cleanup() {
  unset BOUNTYBOOK_DISPUTE_APPROVED || true
  unset BOUNTYBOOK_KEYSTORE_PASSPHRASE || true
}
trap cleanup EXIT HUP INT TERM

if ! node --import tsx scripts/bountybook-signer-status.ts >/dev/null 2>&1; then
  echo "ERROR: BountyBook signer broker is unavailable; unlock the broker before the approved dispute" >&2
  exit 2
fi

node --import tsx scripts/bountybook-dispute-approved-broker.ts
