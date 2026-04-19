#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f .env.railway ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.railway
  set +a
fi

if [[ -z "${RAILWAY_TOKEN:-}" ]] && [[ -z "${RAILWAY_API_TOKEN:-}" ]]; then
  echo "Missing RAILWAY_TOKEN. Copy .env.railway.example to .env.railway and add:" >&2
  echo '  export RAILWAY_TOKEN="your-project-token"' >&2
  exit 1
fi

# Default: last build logs (good for warnings). Override with args, e.g. ./scripts/railway-logs.sh -n 800
if [[ $# -eq 0 ]]; then
  exec railway logs --build --lines 500
else
  exec railway logs "$@"
fi
