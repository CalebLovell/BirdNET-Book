#!/usr/bin/env bash
# Updates the station to the newest release published on GitHub.
#
#   update_birdnet.sh       install the newest release now
#   update_birdnet.sh -a    the nightly run: always looks, and installs only
#                           when AUTOMATIC_UPDATE=1
#   update_birdnet.sh -c    only look, and record what was found
#
# A release is its git commit plus a prebuilt web UI, both pinned by its
# release.json (see .github/workflows/release.yml). The new web UI is unpacked
# beside the running one; if the station doesn't come back after the switch,
# the commit and the web UI are both put back. Progress is written to
# ~/BirdNET-Pi-web/update-status.json for the Settings page's Updates card.
#
# WEB_UI_ONLY=1 is for a web UI running beside another BirdNET-Pi (see
# install_updater_beside.sh): only the web UI bundle is switched and only
# WEB_UI_SERVICE restarted. ~/BirdNET-Pi is that other project's checkout, so
# it is never touched.
source /etc/birdnet/birdnet.conf
trap 'exit 1' SIGINT SIGHUP

usage() { echo "Usage: $0 [-a | -c]" 1>&2; exit 1; }

if [ -n "${BIRDNET_USER}" ]; then
  USER=${BIRDNET_USER}
  HOME=/home/${BIRDNET_USER}
else
  USER=$(awk -F: '/1000/ {print $1}' /etc/passwd)
  HOME=$(awk -F: '/1000/ {print $6}' /etc/passwd)
fi
my_dir=$HOME/BirdNET-Pi/scripts
# Beside its own helpers: in the repo's scripts/, linked into /usr/local/bin,
# or copied to ~/BirdNET-Pi-web/bin on a web-UI-only install.
source "$(dirname "$(readlink -f "$0")")/release_helpers.sh"
WEB_UI_ONLY=${WEB_UI_ONLY:-0}
WEB_UI_SERVICE=${WEB_UI_SERVICE:-birdnet_web_ui.service}

mode=now
while getopts ":ac" o; do
  case "${o}" in
    a) mode=auto ;;
    c) mode=check ;;
    *) usage ;;
  esac
done

if [ "$EUID" -ne 0 ]; then
  exec sudo -E "$0" "$@"
fi

# One run at a time: the timer and a click on Update now can coincide.
exec 9> /run/lock/birdnet-update.lock
if ! flock -n 9; then
  echo "An update is already running."
  exit 0
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

fail() {
  echo "$1" >&2
  status_merge "$(jq -n --arg m "$1" '{state: "failed", message: $m}')"
  exit 1
}

status_merge '{"state":"checking","message":"Looking for a new release."}'
tag=$(latest_release_tag)
[ -n "$tag" ] || fail "Couldn't reach GitHub, or no release has been published yet."
fetch_manifest "$tag" "$work" || fail "Release $tag failed its checks and was not installed."
installed=$(jq -r '.version // empty' "$INSTALLED_FILE" 2>/dev/null)

status_merge "$(jq -n --arg v "$tag" --arg at "$(now_iso)" '{latest: {version: $v}, checkedAt: $at}')"

if [ "$tag" = "$installed" ]; then
  status_merge '{"state":"idle","message":"Up to date."}'
  echo "Already on $tag."
  exit 0
fi

# The nightly run with automatic updates off only looks, so the Settings link
# can show that a release is waiting.
if [ "$mode" = check ] || { [ "$mode" = auto ] && [ "${AUTOMATIC_UPDATE:-0}" != 1 ]; }; then
  status_merge "$(jq -n --arg v "$tag" '{state: "idle", message: ("Version " + $v + " is available.")}')"
  echo "$tag is available."
  exit 0
fi

status_merge "$(jq -n --arg v "$tag" '{state: "updating", target: $v, message: ("Installing " + $v + ".")}')"

commit=$(jq -r .commit "$work/release.json")

if [ "$WEB_UI_ONLY" = 1 ]; then
  install_bundle "$work" || fail "The web UI for $tag couldn't be downloaded."
  previous_web=$(current_web_ui_version)
  apply_web() {
    switch_web_ui "$1"
    systemctl restart "$WEB_UI_SERVICE"
    web_ui_healthy
  }
  if apply_web "$tag"; then
    # The updater rides along in the bundle, so it updates itself too.
    if [ -d "$WEB_RELEASES/$tag/updater" ]; then
      install -o "$USER" -g "$USER" -m 755 "$WEB_RELEASES/$tag/updater"/*.sh "$WEB_HOME/bin/"
    fi
    write_installed "$tag" "$commit"
    prune_releases "$previous_web"
    status_merge "$(jq -n --arg v "$tag" '{state: "updated", target: null, message: ("Updated to " + $v + ".")}')"
    echo "Updated the web UI to $tag."
    exit 0
  fi
  echo "Update to $tag failed; rolling back." >&2
  [ -n "$previous_web" ] && apply_web "$previous_web"
  fail "Updating to $tag didn't work, so the web UI went back to ${previous_web:-the version it had}."
fi

# The code: fetch the tag and make sure it is the commit the release names.
as_user git -C "$REPO_DIR" fetch --force origin "refs/tags/$tag:refs/tags/$tag" \
  || fail "Couldn't download $tag."
fetched=$(as_user git -C "$REPO_DIR" rev-parse "$tag^{commit}")
[ "$fetched" = "$commit" ] || fail "The $tag tag doesn't match its release, so it was not installed."

# The web UI, unpacked beside the running one.
install_bundle "$work" || fail "The web UI for $tag couldn't be downloaded."

previous_commit=$(as_user git -C "$REPO_DIR" rev-parse HEAD)
previous_web=$(current_web_ui_version)

apply() {
  local target_commit=$1 target_web=$2
  as_user git -C "$REPO_DIR" reset --hard
  as_user git -C "$REPO_DIR" checkout --quiet --detach "$target_commit" || return 1
  ln -sf "$my_dir"/* /usr/local/bin/
  "$my_dir/pre_update.sh"
  "$my_dir/update_birdnet_snippets.sh" || return 1
  switch_web_ui "$target_web"
  systemctl daemon-reload
  systemctl restart "$WEB_UI_SERVICE"
  web_ui_healthy
}

as_user git --no-pager -C "$REPO_DIR" diff --stat "$previous_commit" "$commit"
if apply "$commit" "$tag"; then
  write_installed "$tag" "$commit"
  prune_releases "$previous_web"
  status_merge "$(jq -n --arg v "$tag" '{state: "updated", target: null, message: ("Updated to " + $v + ".")}')"
  echo "Updated to $tag."
  exit 0
fi

# Something didn't come back: put the old code and the old web UI back.
echo "Update to $tag failed; rolling back." >&2
if [ -n "$previous_web" ]; then
  apply "$previous_commit" "$previous_web"
fi
fail "Updating to $tag didn't work, so the station went back to ${previous_web:-the version it had}."
