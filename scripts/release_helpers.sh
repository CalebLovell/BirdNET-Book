#!/usr/bin/env bash
# Shared by install_web_ui.sh and update_birdnet.sh: where releases come from,
# how one is checked, and how the web UI bundle is installed and switched to.
# Sourced, never run. Expects USER and HOME to name the station's user, and
# runs as root.

UPDATE_REPO=${UPDATE_REPO:-CalebLovell/BirdNET-Book}
REPO_DIR=$HOME/BirdNET-Pi
WEB_HOME=$HOME/BirdNET-Pi-web
WEB_RELEASES=$WEB_HOME/releases
WEB_CURRENT=$WEB_HOME/current
UPDATE_STATUS=$WEB_HOME/update-status.json
INSTALLED_FILE=$WEB_HOME/installed.json
NODE_HOME=/opt/birdnet-node
WEB_UI_PORT=${WEB_UI_PORT:-80}

as_user() {
  sudo -u "$USER" "$@"
}

now_iso() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

# Merges a JSON object into the status file the web UI's Updates card reads,
# e.g. status_merge '{"state":"updating"}'. Written whole and renamed into
# place, so the page never reads half a file.
status_merge() {
  local patch=$1 tmp
  mkdir -p "$WEB_HOME"
  tmp=$(mktemp "$WEB_HOME/.status.XXXXXX")
  if [ -s "$UPDATE_STATUS" ] && jq -e . "$UPDATE_STATUS" >/dev/null 2>&1; then
    jq --argjson patch "$patch" --arg at "$(now_iso)" '. + $patch + {updatedAt: $at}' "$UPDATE_STATUS" > "$tmp"
  else
    jq -n --argjson patch "$patch" --arg at "$(now_iso)" '$patch + {updatedAt: $at}' > "$tmp"
  fi
  chmod 644 "$tmp"
  chown "$USER:$USER" "$tmp"
  mv -f "$tmp" "$UPDATE_STATUS"
}

# The newest published release's tag, or nothing when there is none yet.
latest_release_tag() {
  curl -fsSL --max-time 30 \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${UPDATE_REPO}/releases/latest" 2>/dev/null \
    | jq -r '.tag_name // empty'
}

release_asset_url() {
  echo "https://github.com/${UPDATE_REPO}/releases/download/$1/$2"
}

# Downloads a release's manifest into a directory and checks it names what a
# station needs; install_bundle then checks the bundle against its sha256.
fetch_manifest() {
  local tag=$1 dir=$2
  curl -fsSL --max-time 60 -o "$dir/release.json" "$(release_asset_url "$tag" release.json)" || {
    echo "Release $tag has no release.json." >&2
    return 1
  }
  jq -e '.version and .commit and .bundle and .sha256' "$dir/release.json" >/dev/null || {
    echo "Release $tag has an unreadable release.json." >&2
    return 1
  }
}

# Downloads the bundle a manifest names, checks it against the manifest's
# sha256, and unpacks it to $WEB_RELEASES/<version>. Leaves an existing copy of
# the same version alone.
install_bundle() {
  local dir=$1 version bundle sha target
  version=$(jq -r .version "$dir/release.json")
  bundle=$(jq -r .bundle "$dir/release.json")
  sha=$(jq -r .sha256 "$dir/release.json")
  target=$WEB_RELEASES/$version
  [ -f "$target/server/index.mjs" ] && return 0
  curl -fsSL --max-time 600 -o "$dir/$bundle" "$(release_asset_url "$version" "$bundle")" || {
    echo "Could not download $bundle." >&2
    return 1
  }
  echo "$sha  $dir/$bundle" | sha256sum -c --status || {
    echo "$bundle does not match its release.json." >&2
    return 1
  }
  mkdir -p "$WEB_RELEASES"
  rm -rf "$target.partial"
  mkdir -p "$target.partial"
  tar -xzf "$dir/$bundle" -C "$target.partial"
  [ -f "$target.partial/server/index.mjs" ] || {
    echo "$bundle has no server in it." >&2
    rm -rf "$target.partial"
    return 1
  }
  mv "$target.partial" "$target"
  chown -R "$USER:$USER" "$WEB_HOME"
}

# Builds the web UI from the checked-out source, for a checkout no release
# describes (a station on main, or a repo with no releases yet). Slow on a Pi,
# but it is the only way such a station gets a web UI at all.
build_bundle_from_source() {
  local version=$1 target=$WEB_RELEASES/$1
  [ -f "$target/server/index.mjs" ] && return 0
  as_user env PATH="$NODE_HOME/bin:$PATH" npm --prefix "$REPO_DIR/web-ui" ci
  as_user env PATH="$NODE_HOME/bin:$PATH" npm --prefix "$REPO_DIR/web-ui" run build
  mkdir -p "$WEB_RELEASES"
  rm -rf "$target"
  cp -a "$REPO_DIR/web-ui/.output" "$target"
  echo "$version" > "$target/VERSION"
  chown -R "$USER:$USER" "$WEB_HOME"
}

# Points `current` at a version in one rename, so the service never starts
# between two half-switched links.
switch_web_ui() {
  ln -sfn "releases/$1" "$WEB_HOME/.current.tmp"
  mv -T "$WEB_HOME/.current.tmp" "$WEB_CURRENT"
  chown -h "$USER:$USER" "$WEB_CURRENT"
}

current_web_ui_version() {
  [ -L "$WEB_CURRENT" ] && basename "$(readlink "$WEB_CURRENT")"
}

# Waits up to a minute and a half for the web UI to answer its home page.
web_ui_healthy() {
  local i
  for i in $(seq 1 30); do
    if curl -fsS -o /dev/null --max-time 5 "http://127.0.0.1:${WEB_UI_PORT}/"; then
      return 0
    fi
    sleep 3
  done
  return 1
}

# Keeps the running version and the one before it; anything older goes.
prune_releases() {
  local keep_current keep_previous=$1 entry
  keep_current=$(current_web_ui_version)
  for entry in "$WEB_RELEASES"/*; do
    [ -d "$entry" ] || continue
    case "$(basename "$entry")" in
      "$keep_current" | "$keep_previous") ;;
      *) rm -rf "$entry" ;;
    esac
  done
}

write_installed() {
  local version=$1 commit=$2 tmp
  tmp=$(mktemp "$WEB_HOME/.installed.XXXXXX")
  jq -n --arg version "$version" --arg commit "$commit" --arg at "$(now_iso)" \
    '{version: $version, commit: $commit, installedAt: $at}' > "$tmp"
  chmod 644 "$tmp"
  chown "$USER:$USER" "$tmp"
  mv -f "$tmp" "$INSTALLED_FILE"
}
