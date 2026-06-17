#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -e "process.stdout.write(require('${REPO_ROOT}/desktop/package.json').version)")"
URL="https://github.com/ferrule-io/reagent/archive/refs/tags/v${VERSION}.tar.gz"
FORMULA="${REPO_ROOT}/Formula/reagent-bridge.rb"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

echo "Downloading ${URL} ..."
curl -fsSL "$URL" -o "$TMP"

if command -v shasum &>/dev/null; then
  HASH="$(shasum -a 256 "$TMP" | awk '{print $1}')"
else
  HASH="$(sha256sum "$TMP" | awk '{print $1}')"
fi

sed -i.bak \
  -e "s|url \"https://github.com/ferrule-io/reagent/archive/refs/tags/v[^\"]*\"|url \"${URL}\"|" \
  -e "s|sha256 \"[a-f0-9]*\"|sha256 \"${HASH}\"|" \
  "$FORMULA"
rm -f "${FORMULA}.bak"

echo "Updated ${FORMULA} to v${VERSION} (sha256: ${HASH})"
