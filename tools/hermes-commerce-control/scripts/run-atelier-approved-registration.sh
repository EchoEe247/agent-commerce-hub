#!/usr/bin/env bash
set -euo pipefail

export ATELIER_REGISTRATION_APPROVED=yes
cleanup() {
  unset ATELIER_REGISTRATION_APPROVED || true
  unset passphrase || true
}
trap cleanup EXIT HUP INT TERM

if [[ ! -r /dev/tty ]]; then
  echo "ERROR: local TTY required for hidden keystore passphrase entry" >&2
  exit 2
fi

read -r -s -p "Atelier keystore passphrase: " passphrase </dev/tty
printf '\n' >/dev/tty
printf '%s\n' "$passphrase" | node --import tsx scripts/atelier-register-approved.ts
