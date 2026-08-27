#!/usr/bin/env bash
set -euo pipefail

RUN_DIR="${HOME}/.hermes/commerce-control/run"
SOCKET="${RUN_DIR}/bountybook-signer.sock"
PID_FILE="${RUN_DIR}/bountybook-signer.pid"
LOG_FILE="${RUN_DIR}/bountybook-signer.log"

umask 077
mkdir -p "${RUN_DIR}"
chmod 700 "${RUN_DIR}"

if node --import tsx scripts/bountybook-signer-status.ts >/dev/null 2>&1; then
  node --import tsx scripts/bountybook-signer-status.ts
  exit 0
fi

if [[ -f "${PID_FILE}" ]]; then
  old_pid="$(tr -dc '0-9' < "${PID_FILE}")"
  if [[ -n "${old_pid}" ]] && kill -0 "${old_pid}" 2>/dev/null; then
    echo "ERROR: signer broker PID ${old_pid} is alive but its socket is unhealthy" >&2
    exit 1
  fi
fi

rm -f "${SOCKET}" "${PID_FILE}"

if [[ ! -t 0 ]]; then
  echo "ERROR: start the signer broker from an interactive local terminal" >&2
  exit 1
fi

read -r -s -p "BountyBook signer unlock passphrase: " signer_passphrase
printf '\n'
if [[ -z "${signer_passphrase}" ]]; then
  echo "ERROR: empty passphrase" >&2
  exit 1
fi

printf '%s\n' "${signer_passphrase}" | nohup node --import tsx scripts/bountybook-signer-broker.ts >"${LOG_FILE}" 2>&1 &
broker_pid=$!
unset signer_passphrase

disown "${broker_pid}" 2>/dev/null || true

for _ in $(seq 1 80); do
  if node --import tsx scripts/bountybook-signer-status.ts >/dev/null 2>&1; then
    echo "SIGNER_BROKER_STARTED=yes"
    echo "BROKER_PID=${broker_pid}"
    echo "BROKER_LOG=${LOG_FILE}"
    node --import tsx scripts/bountybook-signer-status.ts
    exit 0
  fi
  if ! kill -0 "${broker_pid}" 2>/dev/null; then
    echo "ERROR: signer broker exited during startup" >&2
    tail -n 20 "${LOG_FILE}" 2>/dev/null || true
    exit 1
  fi
  sleep 0.1
done

echo "ERROR: signer broker did not become ready in time" >&2
kill "${broker_pid}" 2>/dev/null || true
exit 1
