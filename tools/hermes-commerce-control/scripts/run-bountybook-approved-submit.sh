#!/usr/bin/env bash
set -euo pipefail

if [[ ! -t 0 ]]; then
  echo "ERROR: run this helper from an interactive local terminal" >&2
  exit 1
fi

read -r -s -p "BountyBook keystore passphrase: " BOUNTYBOOK_KEYSTORE_PASSPHRASE
printf '\n'
if [[ -z "${BOUNTYBOOK_KEYSTORE_PASSPHRASE}" ]]; then
  echo "ERROR: empty passphrase" >&2
  exit 1
fi

export BOUNTYBOOK_KEYSTORE_PASSPHRASE
export BOUNTYBOOK_SUBMISSION_APPROVED=yes

cleanup() {
  unset BOUNTYBOOK_KEYSTORE_PASSPHRASE || true
  unset BOUNTYBOOK_SUBMISSION_APPROVED || true
}
trap cleanup EXIT INT TERM

node --import tsx scripts/bountybook-submit-approved.ts
