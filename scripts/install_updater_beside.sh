#!/usr/bin/env bash
# Sets up updates for a web UI that runs beside another BirdNET-Pi rather than
# as the station itself: the other project owns ~/BirdNET-Pi and port 80, and
# this web UI is a separate service on its own port. Run once, as root, from a
# directory holding this script, update_birdnet.sh and release_helpers.sh:
#
#   sudo WEB_UI_SERVICE=birdnet_web_ui_preview.service WEB_UI_PORT=8081 \
#     ./install_updater_beside.sh
#
# Copies the updater to ~/BirdNET-Pi-web/bin, adds the units the Settings
# page's Updates card starts (in WEB_UI_ONLY mode, so only the web UI is ever
# switched), a nightly check, and points the web UI at its update directory.
# Never installs anything by itself: the nightly run only looks.
set -euo pipefail
source /etc/birdnet/birdnet.conf

: "${WEB_UI_SERVICE:?name the web UI's service}"
: "${WEB_UI_PORT:?give the web UI's port}"
USER=${BIRDNET_USER:-$(awk -F: '/1000/ {print $1}' /etc/passwd)}
HOME=$(getent passwd "$USER" | cut -d: -f6)
here=$(dirname "$(readlink -f "$0")")
source "$here/release_helpers.sh"

install -d -o "$USER" -g "$USER" "$WEB_HOME/bin"
install -o "$USER" -g "$USER" -m 755 "$here/update_birdnet.sh" "$here/release_helpers.sh" "$WEB_HOME/bin/"

for unit in update_now update_check; do
  case $unit in
    update_now) flags=""; description="Install the newest BirdNET-Book web UI" ;;
    update_check) flags="-c"; description="Look for a new BirdNET-Book web UI" ;;
  esac
  cat << EOF > "/etc/systemd/system/birdnet_${unit}.service"
[Unit]
Description=${description}
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
Environment=WEB_UI_ONLY=1
Environment=WEB_UI_SERVICE=${WEB_UI_SERVICE}
Environment=WEB_UI_PORT=${WEB_UI_PORT}
ExecStart=${WEB_HOME}/bin/update_birdnet.sh ${flags}
EOF
done

# Only a check: installing waits for someone to press Update on Settings.
cat << EOF > /etc/systemd/system/birdnet_update_check.timer
[Unit]
Description=Nightly BirdNET-Book web UI update check
[Timer]
OnCalendar=*-*-* 03:00:00
RandomizedDelaySec=2h
Persistent=true
[Install]
WantedBy=timers.target
EOF

install -d "/etc/systemd/system/${WEB_UI_SERVICE}.d"
cat << EOF > "/etc/systemd/system/${WEB_UI_SERVICE}.d/updates.conf"
[Service]
Environment=BIRDNET_UPDATE_DIR=${WEB_HOME}
EOF

# What is running now, so the card has a version to compare releases with.
if [ ! -f "$INSTALLED_FILE" ] && version=$(current_web_ui_version); then
  write_installed "$version" "" false
fi

systemctl daemon-reload
systemctl enable --now birdnet_update_check.timer
systemctl restart "$WEB_UI_SERVICE"
echo "Updates set up for $WEB_UI_SERVICE on port $WEB_UI_PORT."
