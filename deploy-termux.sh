#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

# End-to-end Termux deployment for AI Questionnaire app
# Usage:
#   chmod +x deploy-termux.sh
#   ./deploy-termux.sh

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

echo "==> [1/8] Updating Termux packages"
pkg update -y || true
pkg upgrade -y || true

echo "==> [2/8] Installing dependencies"
pkg install -y python nodejs-lts git openssl clang make pkg-config libffi

echo "==> [3/8] Python environment"
if [ ! -d ".venv" ]; then
  python -m venv .venv
fi
source .venv/bin/activate
python -m pip install --upgrade pip wheel
pip install -r backend/requirements.txt

echo "==> [4/8] Environment file"
if [ ! -f ".env" ]; then
  cp .env.example .env
fi

# Safe defaults for Termux/local
python - <<'PY'
from pathlib import Path
p = Path('.env')
text = p.read_text(encoding='utf-8')
def setv(key, val):
    global text
    import re
    pat = rf'^{key}=.*$'
    line = f'{key}={val}'
    if re.search(pat, text, flags=re.M):
        text = re.sub(pat, line, text, flags=re.M)
    else:
        text += ('\n' if not text.endswith('\n') else '') + line + '\n'
# Leave URL vars empty so app infers active origin (quick tunnel / LAN / localhost).
setv('DATABASE_URL', 'sqlite:///./backend/data/app.db')
for k in ['FRONTEND_ORIGIN','PUBLIC_BASE_URL']:
    if not re.search(rf'^{k}=.*$', text, flags=re.M):
        text += ('\n' if not text.endswith('\n') else '') + f'{k}=\n'
p.write_text(text, encoding='utf-8')
print('env updated')
PY

echo "==> [5/8] Frontend build"
cd frontend
npm install
npm run build
cd "$APP_DIR"

echo "==> [6/8] App directories"
mkdir -p backend/data backend/uploads

echo "==> [7/8] Creating start/stop scripts"
cat > start-termux.sh <<'SH'
#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"
source .venv/bin/activate
mkdir -p .run backend/data backend/uploads

if [ -f .run/backend.pid ] && kill -0 "$(cat .run/backend.pid)" 2>/dev/null; then
  echo "Backend already running: $(cat .run/backend.pid)"
else
  nohup python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 > .run/backend.log 2>&1 &
  echo $! > .run/backend.pid
  echo "Backend started: $(cat .run/backend.pid)"
fi

if [ -f .run/frontend.pid ] && kill -0 "$(cat .run/frontend.pid)" 2>/dev/null; then
  echo "Frontend already running: $(cat .run/frontend.pid)"
else
  nohup python -m http.server 8080 --bind 0.0.0.0 --directory frontend/dist > .run/frontend.log 2>&1 &
  echo $! > .run/frontend.pid
  echo "Frontend started: $(cat .run/frontend.pid)"
fi

IP="$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -n1)"
BASE_LOCAL="http://localhost:8080"
BASE_NET=""
if [ -n "$IP" ]; then BASE_NET="http://$IP:8080"; fi
SLUG="$(python - <<'PY'
import sqlite3
try:
    con=sqlite3.connect('backend/data/app.db')
    row=con.execute('select public_slug from questionnaires order by created_at desc limit 1').fetchone()
    print(row[0] if row else '')
except Exception:
    print('')
PY
)"

echo ""
echo "App URLs (local):"
echo "  Admin:       $BASE_LOCAL/"
echo "  API health:  $BASE_LOCAL/api/health"
if [ -n "$SLUG" ]; then
  echo "  Form:        $BASE_LOCAL/q/$SLUG"
  echo "  Form anon:   $BASE_LOCAL/q/$SLUG?auth=open"
  echo "  Dashboard:   $BASE_LOCAL/dashboard/$SLUG"
else
  echo "  Form:        upload a .docx in Admin first, then /q/<slug>"
fi

if [ -n "$BASE_NET" ]; then
  echo ""
  echo "App URLs (network/LAN):"
  echo "  Admin:       $BASE_NET/"
  echo "  API health:  $BASE_NET/api/health"
  if [ -n "$SLUG" ]; then
    echo "  Form:        $BASE_NET/q/$SLUG"
    echo "  Form anon:   $BASE_NET/q/$SLUG?auth=open"
    echo "  Dashboard:   $BASE_NET/dashboard/$SLUG"
  fi
fi

if command -v cloudflared >/dev/null 2>&1; then
  echo ""
  echo "Cloudflare quick tunnel:"
  echo "  Starting tunnel... new URL will be printed below (changes on restart)."
  echo "  Add new callback to Google OAuth: https://<new-url>/api/auth/callback/google"
  pkill -f "cloudflared tunnel --url http://localhost:8080" >/dev/null 2>&1 || true
  nohup cloudflared tunnel --url http://localhost:8080 --no-autoupdate > .run/cloudflared.log 2>&1 &
  echo $! > .run/cloudflared.pid
  for i in $(seq 1 30); do
    TURL="$(grep -oE 'https://[-a-z0-9]+\.trycloudflare\.com' .run/cloudflared.log | tail -n1 || true)"
    if [ -n "$TURL" ]; then
      echo "  Public URL:  $TURL"
      echo "  Admin:       $TURL/"
      echo "  API health:  $TURL/api/health"
      if [ -n "$SLUG" ]; then
        echo "  Form:        $TURL/q/$SLUG"
        echo "  Form anon:   $TURL/q/$SLUG?auth=open"
        echo "  Dashboard:   $TURL/dashboard/$SLUG"
        echo "  Share:       use Admin to copy share link (contains token)"
      fi
      echo "  Google OAuth redirect URI to add now:"
      echo "    $TURL/api/auth/callback/google"
      break
    fi
    sleep 1
  done
  if [ -z "${TURL:-}" ]; then
    echo "  Tunnel URL not detected yet. Check: tail -f .run/cloudflared.log"
  fi
else
  echo ""
  echo "Cloudflare quick tunnel: cloudflared not installed."
  echo "  Install: pkg install cloudflared -y   (or install official binary)"
  echo "  Then rerun ./start-termux.sh to get a public URL."
fi

echo ""
echo "Logs: .run/backend.log .run/frontend.log .run/cloudflared.log"
SH
chmod +x start-termux.sh

cat > stop-termux.sh <<'SH'
#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"
for name in backend frontend cloudflared; do
  if [ -f ".run/${name}.pid" ]; then
    pid="$(cat ".run/${name}.pid")"
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" || true
      echo "Stopped $name ($pid)"
    fi
    rm -f ".run/${name}.pid"
  fi
done
pkill -f "cloudflared tunnel --url http://localhost:8080" >/dev/null 2>&1 || true
SH
chmod +x stop-termux.sh

echo "==> [8/8] Starting app"
./start-termux.sh

echo "Done. Admin: http://localhost:8080  (set ADMIN_TOKEN from .env)"
