#!/usr/bin/env bash
set -euo pipefail

RUN_DIR="${HOME}/.hermes/commerce-control/run"
SOCKET="${RUN_DIR}/bountybook-signer.sock"
PID_FILE="${RUN_DIR}/bountybook-signer.pid"

if [[ ! -f "${PID_FILE}" ]]; then
  rm -f "${SOCKET}"
  echo "SIGNER_BROKER_STOPPED=already"
  exit 0
fi

pid="$(tr -dc '0-9' < "${PID_FILE}")"
if [[ -z "${pid}" ]]; then
  rm -f "${PID_FILE}" "${SOCKET}"
  echo "SIGNER_BROKER_STOPPED=stale_pid_removed"
  exit 0
fi

if kill -0 "${pid}" 2>/dev/null; then
  kill -TERM "${pid}"
  for _ in $(seq 1 50); do
    if ! kill -0 "${pid}" 2>/dev/null; then
      break
    fi
    sleep 0.1
  done
fi

if kill -0 "${pid}" 2>/dev/null; then
  echo "ERROR: signer broker did not stop after SIGTERM" >&2
  exit 1
fi

rm -f "${PID_FILE}" "${SOCKET}"
echo "SIGNER_BROKER_STOPPED=yes"
