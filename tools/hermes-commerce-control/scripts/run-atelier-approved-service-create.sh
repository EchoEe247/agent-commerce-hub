#!/usr/bin/env bash
set -euo pipefail

export ATELIER_SERVICE_LISTING_APPROVED=yes
cleanup() {
  unset ATELIER_SERVICE_LISTING_APPROVED || true
}
trap cleanup EXIT HUP INT TERM

node --import tsx scripts/atelier-create-service-approved.ts
