#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DELETE=0

case "${1:-}" in
  "")
    ;;
  --delete)
    DELETE=1
    ;;
  -h|--help)
    cat <<'EOF'
Usage: bash scripts/dev/cleanup-legacy-output-roots.sh [--delete]

Default mode is a dry run. It reports legacy local output roots that can be
removed after the output/ migration. Pass --delete to remove them.
EOF
    exit 0
    ;;
  *)
    echo "Unknown argument: $1" >&2
    exit 2
    ;;
esac

targets=(
  "$ROOT/artifacts"
  "$ROOT/reports"
)

if [ "$DELETE" -eq 0 ]; then
  echo "Dry run: legacy output roots that would be removed with --delete"
else
  echo "Deleting legacy output roots"
fi

found=0
for target in "${targets[@]}"; do
  if [ ! -e "$target" ]; then
    continue
  fi
  found=1
  size="$(du -sh "$target" 2>/dev/null | cut -f1 || printf 'unknown')"
  rel="${target#$ROOT/}"
  if [ "$DELETE" -eq 0 ]; then
    echo "- $rel ($size)"
  else
    rm -rf "$target"
    echo "- removed $rel ($size)"
  fi
done

if [ "$found" -eq 0 ]; then
  echo "No legacy artifacts/ or reports/ roots found."
fi
