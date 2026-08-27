#!/usr/bin/env bash
set -euo pipefail

export BOUNTYBOOK_CLAIM_APPROVED=yes
cleanup() {
  unset BOUNTYBOOK_CLAIM_APPROVED || true
  unset BOUNTYBOOK_KEYSTORE_PASSPHRASE || true
}
trap cleanup EXIT HUP INT TERM

if node --import tsx scripts/bountybook-signer-status.ts >/dev/null 2>&1; then
  node --import tsx scripts/bountybook-claim-approved-broker.ts
  exit $?
fi

if [[ ! -t 0 ]]; then
  echo "ERROR: signer broker is unavailable and fallback passphrase input requires an interactive local terminal" >&2
  exit 2
fi

printf 'BountyBook keystore passphrase: ' >&2
IFS= read -r -s BOUNTYBOOK_KEYSTORE_PASSPHRASE
printf '\n' >&2
if [[ -z "${BOUNTYBOOK_KEYSTORE_PASSPHRASE}" ]]; then
  echo "ERROR: empty passphrase" >&2
  exit 2
fi
export BOUNTYBOOK_KEYSTORE_PASSPHRASE
node --import tsx scripts/bountybook-claim-approved.ts
