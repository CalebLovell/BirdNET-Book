#!/usr/bin/env bash
# Installs the web UI: Node, the trusted release key, the service that serves
# the site on port 80, the timer that keeps the station up to date, and the
# web UI bundle for the version that is checked out. Run as root, by
# install_services.sh on a fresh install and update_birdnet_snippets.sh on a
# station that predates the web UI. Safe to run again.
set -e
source /etc/birdnet/birdnet.conf
if [ -n "${BIRDNET_USER}" ]; then
  USER=${BIRDNET_USER}
  HOME=/home/${BIRDNET_USER}
fi
my_dir=$HOME/BirdNET-Pi/scripts
source "$my_dir/release_helpers.sh"

NODE_MAJOR=22

install_node() {
  local arch current tarball sums tmp
  if [ -x "$NODE_HOME/bin/node" ]; then
    current=$("$NODE_HOME/bin/node" -p 'process.versions.node.split(".")[0]')
    [ "$current" -ge "$NODE_MAJOR" ] && return 0
  fi
  case "$(uname -m)" in
    aarch64) arch=arm64 ;;
    x86_64) arch=x64 ;;
    *) echo "No Node build for $(uname -m)." >&2; return 1 ;;
  esac
  tmp=$(mktemp -d)
  # The latest release of the LTS line, checked against nodejs.org's own list of
  # hashes -- node:sqlite, which the web UI reads the database with, needs 22.13+.
  sums=$(curl -fsSL "https://nodejs.org/dist/latest-v${NODE_MAJOR}.x/SHASUMS256.txt")
  tarball=$(echo "$sums" | awk -v a="linux-${arch}.tar.xz" '$2 ~ a"$" {print $2}' | head -n 1)
  [ -n "$tarball" ] || { echo "Could not find a Node $NODE_MAJOR build." >&2; return 1; }
  curl -fsSL -o "$tmp/$tarball" "https://nodejs.org/dist/latest-v${NODE_MAJOR}.x/$tarball"
  (cd "$tmp" && echo "$sums" | grep " ${tarball}\$" | sha256sum -c --status) || {
    echo "Node download did not match its checksum." >&2
    rm -rf "$tmp"
    return 1
  }
  rm -rf "$NODE_HOME.new"
  mkdir -p "$NODE_HOME.new"
  tar -xJf "$tmp/$tarball" -C "$NODE_HOME.new" --strip-components=1
  rm -rf "$NODE_HOME"
  mv "$NODE_HOME.new" "$NODE_HOME"
  rm -rf "$tmp"
}

install_units() {
  cat << EOF > "$REPO_DIR/templates/birdnet_web_ui.service"
[Unit]
Description=BirdNET web UI
After=network.target
[Service]
Type=simple
User=${USER}
Restart=always
RestartSec=3
WorkingDirectory=${REPO_DIR}/web-ui
ExecStart=${NODE_HOME}/bin/node ${WEB_CURRENT}/server/index.mjs
AmbientCapabilities=CAP_NET_BIND_SERVICE
Environment=NODE_ENV=production
Environment=PORT=${WEB_UI_PORT}
Environment=HOST=::
Environment=BIRDNET_CONF=/etc/birdnet/birdnet.conf
Environment=BIRDNET_DB_PATH=${REPO_DIR}/scripts/birds.db
Environment=BIRDNET_MODEL_DIR=${REPO_DIR}/model
Environment=BIRDNET_LABELS_PATH=${REPO_DIR}/model/labels.txt
Environment=BIRDNET_SPECIES_LIST_DIR=${REPO_DIR}
Environment=BIRDNET_EXTRACTED_DIR=${EXTRACTED}
Environment=BIRDNET_UPDATE_DIR=${WEB_HOME}
[Install]
WantedBy=multi-user.target
EOF

  # -a: the nightly run, which always looks and installs only when
  # AUTOMATIC_UPDATE=1. The other two are what the Updates card starts.
  local unit flags description
  for unit in update update_now update_check; do
    case $unit in
      update) flags="-a"; description="Install a new BirdNET release if automatic updates are on" ;;
      update_now) flags=""; description="Install the newest BirdNET release" ;;
      update_check) flags="-c"; description="Look for a new BirdNET release" ;;
    esac
    cat << EOF > "$REPO_DIR/templates/birdnet_${unit}.service"
[Unit]
Description=${description}
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
ExecStart=/usr/local/bin/update_birdnet.sh ${flags}
EOF
  done

  # Nightly, spread over two hours so every station doesn't ask GitHub at once.
  cat << EOF > "$REPO_DIR/templates/birdnet_update.timer"
[Unit]
Description=Nightly BirdNET update check
[Timer]
OnCalendar=*-*-* 03:00:00
RandomizedDelaySec=2h
Persistent=true
[Install]
WantedBy=timers.target
EOF

  for unit in birdnet_web_ui.service birdnet_update.service birdnet_update_now.service \
      birdnet_update_check.service birdnet_update.timer; do
    ln -sf "$REPO_DIR/templates/$unit" /usr/lib/systemd/system
  done
  systemctl daemon-reload
  systemctl enable birdnet_web_ui.service birdnet_update.timer
}

# The password file lives in a directory the web UI's account owns: every
# write is a temp file renamed into place, and /etc/birdnet itself is root's.
AUTH_DIR=/etc/birdnet/web-ui
install_auth_dir() {
  install -d -o "$USER" -g "$USER" -m 700 "$AUTH_DIR"
  # Earlier versions kept the file directly in /etc/birdnet, where the service
  # could read a password but never write one. Bring a set password along.
  if [ -f /etc/birdnet/web-ui-auth.conf ] && [ ! -f "$AUTH_DIR/auth.conf" ]; then
    mv /etc/birdnet/web-ui-auth.conf "$AUTH_DIR/auth.conf"
    chown "$USER:$USER" "$AUTH_DIR/auth.conf"
    chmod 600 "$AUTH_DIR/auth.conf"
  fi
  rm -f /etc/birdnet/web-ui-auth.conf /etc/birdnet/web-ui-auth.conf.throttle.json
}

# There is no default password, so until one is set nobody can sign in. Asked
# here when someone is at the terminal; an unattended update only says so.
# A file from the old shipped default (WEB_UI_PWD_IS_DEFAULT=1) counts as
# unset -- the web UI no longer accepts that password.
ensure_password() {
  local file=$AUTH_DIR/auth.conf attempt
  if [ -f "$file" ] && ! grep -q '^WEB_UI_PWD_IS_DEFAULT=1$' "$file"; then
    return 0
  fi
  if { : < /dev/tty; } 2>/dev/null; then
    echo "Choose a password for the web UI's Settings, Review and Species control."
    for attempt in 1 2 3; do
      "$my_dir/set_web_ui_password.sh" < /dev/tty && return 0
    done
  fi
  echo "The web UI has no password yet, so nobody can sign in to it." >&2
  echo "Set one with: sudo $my_dir/set_web_ui_password.sh" >&2
}

# The bundle for whatever is checked out: the release's own when HEAD is a
# release tag, a local build otherwise.
install_initial_bundle() {
  local tag commit tmp
  [ -L "$WEB_CURRENT" ] && [ -f "$WEB_CURRENT/server/index.mjs" ] && return 0
  mkdir -p "$WEB_RELEASES"
  chown -R "$USER:$USER" "$WEB_HOME"
  commit=$(as_user git -C "$REPO_DIR" rev-parse HEAD)
  tag=$(as_user git -C "$REPO_DIR" describe --tags --exact-match HEAD 2>/dev/null || true)
  tmp=$(mktemp -d)
  if [ -n "$tag" ] && fetch_manifest "$tag" "$tmp" \
      && [ "$(jq -r .commit "$tmp/release.json")" = "$commit" ] \
      && install_bundle "$tmp"; then
    switch_web_ui "$tag"
    write_installed "$tag" "$commit"
  else
    tag=${tag:-dev-${commit:0:7}}
    build_bundle_from_source "$tag"
    switch_web_ui "$tag"
    write_installed "$tag" "$commit"
  fi
  rm -rf "$tmp"
}

install_node
install_auth_dir
install_units
install_initial_bundle
ensure_password
systemctl restart birdnet_web_ui.service
