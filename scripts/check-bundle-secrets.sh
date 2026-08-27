#!/usr/bin/env bash
#
# Fails the build if a privileged secret reached the browser bundle.
#
#   npm run check:secrets      (after npm run build)
#
# Three layers already stop this: `import "server-only"` in the admin client,
# a runtime guard in serverOnlyEnv(), and the fact that the key has no
# NEXT_PUBLIC_ prefix so Next never inlines it. This script is the check that
# those layers actually worked, because "we were careful" is not evidence.
#
# It also refuses to let a real .env file be committed.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATIC_DIR="$ROOT/.next/static"
status=0

fail() {
  echo "FAIL  $1" >&2
  status=1
}

pass() {
  echo "ok    $1"
}

if [[ ! -d "$STATIC_DIR" ]]; then
  echo "No build found. Run 'npm run build' first." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 1. The service role key must not appear in anything the browser downloads.
# ---------------------------------------------------------------------------
service_key="${SUPABASE_SERVICE_ROLE_KEY:-}"
if [[ -z "$service_key" && -f "$ROOT/.env.local" ]]; then
  service_key="$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' "$ROOT/.env.local" | head -1 | cut -d= -f2- || true)"
fi

if [[ -n "$service_key" ]]; then
  if grep -rqF "$service_key" "$STATIC_DIR" 2>/dev/null; then
    fail "the service role key is present in the client bundle"
  else
    pass "the service role key is not in the client bundle"
  fi
else
  echo "warn  no SUPABASE_SERVICE_ROLE_KEY set, so its absence proves nothing"
fi

# ---------------------------------------------------------------------------
# 2. The variable name must not appear either. Next only inlines NEXT_PUBLIC_*,
#    so seeing this in a chunk means someone renamed a variable badly.
# ---------------------------------------------------------------------------
if grep -rqF "SUPABASE_SERVICE_ROLE_KEY" "$STATIC_DIR" 2>/dev/null; then
  fail "SUPABASE_SERVICE_ROLE_KEY is referenced in the client bundle"
else
  pass "no reference to the service role variable in the client bundle"
fi

# ---------------------------------------------------------------------------
# 3. Nothing that looks like a service_role JWT, whatever it is called.
# ---------------------------------------------------------------------------
if grep -rqE '"role"\s*:\s*"service_role"' "$STATIC_DIR" 2>/dev/null; then
  fail "something decoding to a service_role token is in the client bundle"
else
  pass "no service_role token in the client bundle"
fi

# ---------------------------------------------------------------------------
# 4. No real environment file is tracked by git.
# ---------------------------------------------------------------------------
tracked_env="$(cd "$ROOT" && git ls-files | grep -E '^\.env' | grep -v '^\.env\.example$' || true)"
if [[ -n "$tracked_env" ]]; then
  fail "an environment file is committed: $tracked_env"
else
  pass "no environment file is committed"
fi

exit "$status"
