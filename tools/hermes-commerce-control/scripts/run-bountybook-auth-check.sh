#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -t 0 && ! -r /dev/tty ]]; then
  echo "A local interactive terminal is required for hidden passphrase entry." >&2
  exit 1
fi

PASSPHRASE=""
cleanup() {
  PASSPHRASE=""
  unset PASSPHRASE || true
}
trap cleanup EXIT HUP INT TERM

printf 'BountyBook keystore passphrase: ' >/dev/tty
IFS= read -r -s PASSPHRASE </dev/tty
printf '\n' >/dev/tty

if [[ -z "$PASSPHRASE" ]]; then
  echo "Passphrase cannot be empty." >&2
  exit 1
fi

BOUNTYBOOK_KEYSTORE_PASSPHRASE="$PASSPHRASE" \
  node --import tsx scripts/bountybook-auth-check.ts
