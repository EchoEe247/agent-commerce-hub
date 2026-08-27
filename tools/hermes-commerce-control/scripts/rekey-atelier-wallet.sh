#!/usr/bin/env bash
set -euo pipefail

if [[ ! -t 0 ]]; then
  echo "ERROR: rekey the Atelier wallet from an interactive local terminal" >&2
  exit 1
fi

read -r -s -p "Current Atelier wallet passphrase: " old_passphrase
printf '\n'
read -r -s -p "New Atelier wallet passphrase (min 16 chars): " new_passphrase
printf '\n'
read -r -s -p "Confirm new Atelier wallet passphrase: " confirm_passphrase
printf '\n'

cleanup() {
  unset old_passphrase new_passphrase confirm_passphrase || true
}
trap cleanup EXIT HUP INT TERM

if [[ "${new_passphrase}" != "${confirm_passphrase}" ]]; then
  echo "ERROR: new passphrase confirmation does not match" >&2
  exit 1
fi
if [[ "${old_passphrase}" == "${new_passphrase}" ]]; then
  echo "ERROR: new passphrase must differ from current passphrase" >&2
  exit 1
fi

printf '%s\n%s\n' "${old_passphrase}" "${new_passphrase}" | node --import tsx scripts/atelier-wallet-rekey.ts
