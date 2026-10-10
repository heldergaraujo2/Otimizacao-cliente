#!/usr/bin/env bash
# Clones the pinned reference repositories used for research and conformance checks.
# They are NOT part of the build: they are read-only references (see docs/REPOSITORIES.md).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${1:-$ROOT/third_party}"

clone_pinned() {
  local name="$1" url="$2" sha="$3"
  if [ -d "$DEST/$name/.git" ]; then
    echo "[skip] $name already present"
    return
  fi
  echo "[clone] $name @ $sha"
  git clone --filter=blob:none "$url" "$DEST/$name"
  git -C "$DEST/$name" fetch --depth 1 origin "$sha"
  git -C "$DEST/$name" checkout --detach "$sha"
}

mkdir -p "$DEST"
# Pins are recorded in third_party/PINS.json (committed).
python3 - "$DEST" <<'PY'
import json, subprocess, sys, os
dest = sys.argv[1]
pins = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'third_party', 'PINS.json')))
for name, info in pins['references'].items():
    target = os.path.join(dest, name)
    if os.path.isdir(os.path.join(target, '.git')):
        print(f"[skip] {name} already present")
        continue
    print(f"[clone] {name} @ {info['commit']}")
    subprocess.run(['git', 'clone', '--filter=blob:none', info['url'], target], check=True)
    subprocess.run(['git', '-C', target, 'fetch', '--depth', '1', 'origin', info['commit']], check=True)
    subprocess.run(['git', '-C', target, 'checkout', '--detach', info['commit']], check=True)
PY
echo "Done. References are in $DEST (git-ignored)."
