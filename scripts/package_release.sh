#!/usr/bin/env bash
# Builds what a station installs for one release, into dist/: the web UI as a
# tarball, and release.json naming the commit and the tarball's sha256 --
# signed when RELEASE_SIGNING_KEY is set. Run by semantic-release (see
# .releaserc.json) once it has decided there is a release to make, with the
# tag it is about to create, e.g. `package_release.sh v1.4.0`.
set -euo pipefail

version=$1
root=$(cd "$(dirname "$0")/.." && pwd)
dist=$root/dist
commit=${GITHUB_SHA:-$(git -C "$root" rev-parse HEAD)}

rm -rf "$dist"
mkdir -p "$dist"

(cd "$root/web-ui" && npm run build)
echo "$version" > "$root/web-ui/.output/VERSION"
# A web-UI-only station has no checkout of this repo, so its updater comes
# with the bundle and replaces itself on each update.
mkdir -p "$root/web-ui/.output/updater"
cp "$root/scripts/update_birdnet.sh" "$root/scripts/release_helpers.sh" "$root/web-ui/.output/updater/"

bundle="birdnet-web-ui-${version}.tar.gz"
tar -C "$root/web-ui/.output" -czf "$dist/$bundle" .
sha=$(sha256sum "$dist/$bundle" | cut -d' ' -f1)
jq -n --arg version "$version" --arg commit "$commit" \
  --arg bundle "$bundle" --arg sha256 "$sha" \
  '{version: $version, commit: $commit, bundle: $bundle, sha256: $sha256}' \
  > "$dist/release.json"
cat "$dist/release.json"

if [ -z "${RELEASE_SIGNING_KEY:-}" ]; then
  echo "::warning::No RELEASE_SIGNING_KEY: $version is unsigned, so stations will not install it automatically."
  exit 0
fi
key=$(mktemp)
trap 'rm -f "$key"' EXIT
chmod 600 "$key"
printf '%s\n' "$RELEASE_SIGNING_KEY" > "$key"
ssh-keygen -Y sign -n birdnet-book-release -f "$key" "$dist/release.json"
