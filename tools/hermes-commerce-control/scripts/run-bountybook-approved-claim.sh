#!/usr/bin/env bash
set -euo pipefail

if [[ ! -t 0 ]]; then
  echo "ERROR: run this from an interactive local terminal" >&2
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
export BOUNTYBOOK_CLAIM_APPROVED=yes

cleanup() {
  unset BOUNTYBOOK_KEYSTORE_PASSPHRASE || true
  unset BOUNTYBOOK_CLAIM_APPROVED || true
}
trap cleanup EXIT HUP INT TERM

node --import tsx scripts/bountybook-claim-approved.ts
