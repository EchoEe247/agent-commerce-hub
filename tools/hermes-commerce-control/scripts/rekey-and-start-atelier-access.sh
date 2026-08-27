#!/usr/bin/env bash
set -euo pipefail

RUN_DIR="${HOME}/.hermes/commerce-control/run"
SOCKET="${RUN_DIR}/atelier-access.sock"
PID_FILE="${RUN_DIR}/atelier-access.pid"
LOG_FILE="${RUN_DIR}/atelier-access.log"

umask 077
mkdir -p "${RUN_DIR}"
chmod 700 "${RUN_DIR}"

if [[ ! -t 0 ]]; then
  echo "ERROR: run this one-time Atelier access setup from an interactive local terminal" >&2
  exit 1
fi

if node --import tsx scripts/atelier-access-status.ts >/dev/null 2>&1; then
  echo "ERROR: Atelier access broker is already running; stop it before rekeying" >&2
  exit 1
fi
if [[ -f "${PID_FILE}" ]]; then
  old_pid="$(tr -dc '0-9' < "${PID_FILE}")"
  if [[ -n "${old_pid}" ]] && kill -0 "${old_pid}" 2>/dev/null; then
    echo "ERROR: Atelier access broker PID ${old_pid} is alive but unhealthy" >&2
    exit 1
  fi
fi
rm -f "${SOCKET}" "${PID_FILE}"

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

printf '%s\n' "${new_passphrase}" | nohup node --import tsx scripts/atelier-access-broker.ts >"${LOG_FILE}" 2>&1 &
broker_pid=$!
unset old_passphrase confirm_passphrase

disown "${broker_pid}" 2>/dev/null || true
for _ in $(seq 1 80); do
  if node --import tsx scripts/atelier-access-status.ts >/dev/null 2>&1; then
    unset new_passphrase
    echo "ATELIER_ACCESS_SETUP_COMPLETE=yes"
    echo "BROKER_PID=${broker_pid}"
    echo "BROKER_LOG=${LOG_FILE}"
    node --import tsx scripts/atelier-access-status.ts
    exit 0
  fi
  if ! kill -0 "${broker_pid}" 2>/dev/null; then
    unset new_passphrase
    echo "ERROR: Atelier access broker exited during startup" >&2
    tail -n 20 "${LOG_FILE}" 2>/dev/null || true
    exit 1
  fi
  sleep 0.1
done

unset new_passphrase
echo "ERROR: Atelier access broker did not become ready in time" >&2
kill "${broker_pid}" 2>/dev/null || true
exit 1
