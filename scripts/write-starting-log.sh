#!/bin/sh
set -eu
LOCAL_BASE="${LOCAL_BASE:-http://localhost:8080}"
LOCAL_BASE="${LOCAL_BASE%/}"
CF_LOG="${CLOUDFLARED_LOG:-/out/cloudflared.err.log}"
OUT="/out/starting.log"
CF=""
if [ -f "$CF_LOG" ]; then
  CF=$(grep -oE 'https://[-a-z0-9]+\.trycloudflare\.com' "$CF_LOG" | tail -n1 || true)
fi
if [ -n "$CF" ]; then
  CF_ADMIN="$CF/"
  CF_REDIRECT="$CF/api/auth/callback/google"
else
  CF="(not detected)"
  CF_ADMIN="(not detected)"
  CF_REDIRECT="(not detected - add after tunnel starts)"
fi
cat > "$OUT" <<EOF
Admin Dashboard (Local): ${LOCAL_BASE}/
Admin Dashboard (Cloudflare): ${CF_ADMIN}
Google OAuth Redirect URL (Local): ${LOCAL_BASE}/api/auth/callback/google
Google OAuth Redirect URL (Cloudflare): ${CF_REDIRECT}
Cloudflare URL: ${CF}
EOF
echo "Wrote $OUT"
cat "$OUT"
