#!/usr/bin/env bash
set -euo pipefail

export BOUNTYBOOK_SUBMISSION_APPROVED=yes
cleanup() {
  unset BOUNTYBOOK_SUBMISSION_APPROVED || true
  unset BOUNTYBOOK_KEYSTORE_PASSPHRASE || true
}
trap cleanup EXIT HUP INT TERM

if node --import tsx scripts/bountybook-signer-status.ts >/dev/null 2>&1; then
  node --import tsx scripts/bountybook-submit-approved-broker.ts
  exit $?
fi

if [[ ! -t 0 ]]; then
  echo "ERROR: signer broker is unavailable and fallback passphrase input requires an interactive local terminal" >&2
  exit 2
fi

read -r -s -p "BountyBook keystore passphrase: " BOUNTYBOOK_KEYSTORE_PASSPHRASE
printf '\n'
if [[ -z "${BOUNTYBOOK_KEYSTORE_PASSPHRASE}" ]]; then
  echo "ERROR: empty passphrase" >&2
  exit 1
fi
export BOUNTYBOOK_KEYSTORE_PASSPHRASE
node --import tsx scripts/bountybook-submit-approved.ts
