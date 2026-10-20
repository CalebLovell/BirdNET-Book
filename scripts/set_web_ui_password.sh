#!/usr/bin/env bash
# Sets the BirdNET-Pi web UI password. The plaintext is never written to disk,
# never passed as an argument, and never echoed to the terminal.
set -euo pipefail

my_dir=$(dirname "$(realpath "$0")")
web_ui_dir="$(dirname "${my_dir}")/web-ui"
export BIRDNET_AUTH_CONF="${BIRDNET_AUTH_CONF:-/etc/birdnet/web-ui/auth.conf}"

if [ -f /etc/birdnet/birdnet.conf ]; then
  # shellcheck disable=SC1091
  source /etc/birdnet/birdnet.conf
fi

# The installed bundle carries the tool prebuilt (`npm run build`), so a
# station installed from a release -- no source dependencies on disk -- can
# still set its password. A source checkout falls back to running it with tsx.
bundled_cli="/home/${BIRDNET_USER:-${USER:-}}/BirdNET-Pi-web/current/cli/set-password.mjs"
node_bin=/opt/birdnet-node/bin/node
tsx_bin="${web_ui_dir}/node_modules/.bin/tsx"
run_cli() {
  if [ -f "${bundled_cli}" ] && [ -x "${node_bin}" ]; then
    "${node_bin}" "${bundled_cli}"
  else
    (cd "${web_ui_dir}" && "${tsx_bin}" src/lib/set-password-cli.ts)
  fi
}
if [ ! -f "${bundled_cli}" ] && [ ! -x "${tsx_bin}" ]; then
  echo "No password tool: neither ${bundled_cli} nor ${tsx_bin} exists." >&2
  echo "Install the web UI first (scripts/install_web_ui.sh)." >&2
  exit 1
fi

if [ "$#" -gt 0 ]; then
  # --clear used to restore a shipped default password. There is none any
  # more; setting a new password is how to recover a forgotten one.
  echo "Usage: $0  (prompts for the new password; takes no arguments)" >&2
  exit 1
fi

# Make sure the auth file's directory exists, and that a root-run script
# leaves the file and its directory owned by the account the web UI actually
# runs as -- otherwise the owner locks themselves out with the password they
# just set, or the web UI can't write the files it keeps beside it.
auth_dir=$(dirname "${BIRDNET_AUTH_CONF}")
mkdir -p -m 700 "${auth_dir}"

fix_auth_file_ownership() {
  [ "${EUID}" -eq 0 ] || return 0

  if [ -z "${BIRDNET_USER:-}" ]; then
    echo "Cannot determine BIRDNET_USER from /etc/birdnet/birdnet.conf." >&2
    echo "${BIRDNET_AUTH_CONF} is owned by root and the web UI will not be able to read it." >&2
    echo "Fix ownership manually, e.g.: chown <birdnet-user> ${BIRDNET_AUTH_CONF}" >&2
    exit 1
  fi

  # Ownership only -- writeAuthFile already set mode 0600.
  chown "${BIRDNET_USER}:" "${auth_dir}"
  [ -f "${BIRDNET_AUTH_CONF}" ] && chown "${BIRDNET_USER}:" "${BIRDNET_AUTH_CONF}"
  return 0
}

# -s suppresses the echo; nothing here is added to shell history.
if ! read -rsp "New web UI password: " password; then
  echo
  echo "Cancelled (no input received)." >&2
  exit 1
fi
echo
if ! read -rsp "Confirm password: " confirm; then
  echo
  echo "Cancelled (no input received)." >&2
  exit 1
fi
echo

# Tracing (bash -x) would otherwise dump the plaintext password into the
# xtrace output via this comparison and the printf below.
set +x
if [ "${password}" != "${confirm}" ]; then
  echo "Passwords do not match." >&2
  exit 1
fi

printf '%s' "${password}" | run_cli
fix_auth_file_ownership
