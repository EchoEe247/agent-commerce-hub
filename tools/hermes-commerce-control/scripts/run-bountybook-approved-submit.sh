#!/usr/bin/env bash
set -euo pipefail

export BOUNTYBOOK_SUBMISSION_APPROVED=yes
cleanup() {
  unset BOUNTYBOOK_SUBMISSION_APPROVED || true
  unset BOUNTYBOOK_KEYSTORE_PASSPHRASE || true
}
trap cleanup EXIT HUP INT TERM

if ! node --import tsx scripts/bountybook-signer-status.ts >/dev/null 2>&1; then
  echo "ERROR: BountyBook signer broker is unavailable; unlock the broker before an approved submission" >&2
  exit 2
fi

node --import tsx scripts/bountybook-submit-approved-broker-v2.ts
