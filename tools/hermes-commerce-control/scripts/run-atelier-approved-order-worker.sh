#!/usr/bin/env bash
set -euo pipefail

export ATELIER_ORDER_WORKER_APPROVED=yes
cleanup() {
  unset ATELIER_ORDER_WORKER_APPROVED || true
}
trap cleanup EXIT HUP INT TERM

node --import tsx scripts/atelier-order-worker.ts
