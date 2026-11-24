#!/usr/bin/env bash
# Runs integration tests against the local stack. Prereqs: `npx supabase start`, `npx supabase db reset`,
# and `npx supabase functions serve --env-file supabase/functions/.env` in another terminal.
set -euo pipefail
cd "$(dirname "$0")/.."
eval "$(npx supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=' | sed 's/^/export /')"
export SUPABASE_URL="$API_URL" SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
set -a; . supabase/functions/.env; set +a
exec deno test --config tests/deno.json --allow-env --allow-net tests/integration "$@"
