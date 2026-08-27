#!/usr/bin/env bash
set -euo pipefail

ROOT="${HOME}/.hermes/commerce-control"
ATTEMPT1="${ROOT}/receipts/atelier-service-create-attempt-1.json"
ATTEMPT2="${ROOT}/receipts/atelier-service-create-attempt-2.json"
STATE="${ROOT}/state/atelier-readme-service.json"

if [[ ! -f "${ATTEMPT1}" ]]; then
  echo "ERROR: attempt-1 receipt is required before attempt 2" >&2
  exit 2
fi
if [[ -e "${ATTEMPT2}" ]]; then
  echo "ERROR: attempt-2 receipt already exists; refusing retry" >&2
  exit 2
fi
if [[ -e "${STATE}" ]]; then
  echo "ERROR: Atelier service state already exists; refusing duplicate listing" >&2
  exit 2
fi

export ATELIER_SERVICE_LISTING_APPROVED=yes
export ATELIER_SERVICE_RECEIPT_PATH="${ATTEMPT2}"
cleanup() {
  unset ATELIER_SERVICE_LISTING_APPROVED || true
  unset ATELIER_SERVICE_RECEIPT_PATH || true
}
trap cleanup EXIT HUP INT TERM

node --import tsx scripts/atelier-create-service-approved.ts
