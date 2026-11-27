#!/bin/sh
set -eu
BASE="${PUBLIC_BASE_URL:-${FRONTEND_ORIGIN:-http://localhost:8080}}"
BASE="${BASE%/}"
OUT="/out/starting.log"
cat > "$OUT" <<EOF
Admin Dashboard: ${BASE}/
Google OAuth Redirect URL: ${BASE}/api/auth/callback/google
Cloudflare URL: (not detected - run cloudflared and update)
EOF
echo "Wrote $OUT"
cat "$OUT"