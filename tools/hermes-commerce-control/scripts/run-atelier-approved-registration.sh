#!/usr/bin/env bash
set -euo pipefail

export ATELIER_REGISTRATION_APPROVED=yes
cleanup() {
  unset ATELIER_REGISTRATION_APPROVED || true
}
trap cleanup EXIT HUP INT TERM

node --import tsx scripts/atelier-register-approved.ts
