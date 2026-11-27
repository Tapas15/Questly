#!/usr/bin/env bash
set -euo pipefail

# Deploy Questly/formfill inside a proot-distro Linux container (Ubuntu/Debian).
# Recommended over native Termux for Python packages with native wheels (pydantic v2).
#
# Termux (host) setup:
#   pkg update && pkg install proot-distro git -y
#   proot-distro install ubuntu
#   proot-distro login ubuntu
#
# Inside Ubuntu proot:
#   git clone https://github.com/Tapas15/Questly.git
#   cd Questly
#   chmod +x deploy-proot.sh
#   ./deploy-proot.sh

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

if ! command -v apt-get >/dev/null 2>&1; then
  echo "ERROR: apt-get not found. Run this inside Ubuntu/Debian proot-distro, not native Termux."
  echo "  pkg install proot-distro -y && proot-distro install ubuntu && proot-distro login ubuntu"
  exit 1
fi

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then SUDO="sudo"; else echo "Run as root or install sudo."; exit 1; fi
fi

echo "==> [1/7] Installing system dependencies"
$SUDO apt-get update -y
$SUDO apt-get install -y python3 python3-venv python3-pip python3-dev \
  git curl ca-certificates build-essential pkg-config libffi-dev

# Node.js 20 LTS (needed for Vite/React build)
NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -v | sed 's/^v//' | cut -d. -f1)"
  if [ "$NODE_MAJOR" -ge 18 ]; then NEED_NODE=0; fi
fi
if [ "$NEED_NODE" -eq 1 ]; then
  echo "==> Installing Node.js 20 LTS"
  curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO bash -
  $SUDO apt-get install -y nodejs
fi

echo "==> [2/7] Python virtual environment"
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
python -m pip install --upgrade pip wheel setuptools
pip install -r backend/requirements.txt

echo "==> [3/7] Environment file"
if [ ! -f ".env" ]; then
  cp .env.example .env
fi
python - <<'PY'
from pathlib import Path
import re
p = Path('.env')
text = p.read_text(encoding='utf-8')
def setv(key, val):
    global text
    pat = rf'^{re.escape(key)}=.*$'
    line = f'{key}={val}'
    text = re.sub(pat, line, text, flags=re.M) if re.search(pat, text, flags=re.M) else text.rstrip() + '\n' + line + '\n'
# Leave URL vars empty so app infers active origin (quick tunnel / LAN / localhost).
for k in ['FRONTEND_ORIGIN', 'PUBLIC_BASE_URL']:
    if not re.search(rf'^{re.escape(k)}=.*$', text, flags=re.M):
        text = text.rstrip() + f'\n{k}=\n'
setv('DATABASE_URL', 'sqlite:///./backend/data/app.db')
p.write_text(text, encoding='utf-8')
print('.env ready')
PY

echo "==> [4/7] Frontend build"
cd frontend
npm install
npm run build
cd "$APP_DIR"

echo "==> [5/7] App directories"
mkdir -p backend/data backend/uploads .run

echo "==> [6/7] Creating start/stop scripts"
cat > start-proot.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"
# shellcheck disable=SC1091
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

IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
BASE_LOCAL="http://localhost:8080"
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

cat > starting.log <<LOG
Admin Dashboard (Local): $BASE_LOCAL/
Admin Dashboard (Cloudflare): (not detected)
Google OAuth Redirect URL (Local): $BASE_LOCAL/api/auth/callback/google
Google OAuth Redirect URL (Cloudflare): (not detected - add after tunnel starts)
Cloudflare URL: (not detected)
LOG

echo ""
echo "============================================"
echo " Questly URLs"
echo "============================================"
echo "Admin Dashboard:       $BASE_LOCAL/"
echo "API Health:            $BASE_LOCAL/api/health"
echo "Google OAuth Redirect: $BASE_LOCAL/api/auth/callback/google"
if [ -n "$SLUG" ]; then
  echo "Form:                  $BASE_LOCAL/q/$SLUG"
  echo "Form (anonymous):      $BASE_LOCAL/q/$SLUG?auth=open"
  echo "Dashboard:             $BASE_LOCAL/dashboard/$SLUG"
else
  echo "Form:                  upload a .docx in Admin first, then /q/<slug>"
fi
if [ -n "$IP" ]; then
  echo "LAN:                   http://$IP:8080/"
fi
echo "============================================"
echo "Logs: .run/backend.log .run/frontend.log"
echo "Saved: starting.log"
SH
chmod +x start-proot.sh

cat > stop-proot.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"
for name in backend frontend; do
  if [ -f ".run/${name}.pid" ]; then
    pid="$(cat ".run/${name}.pid")"
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" || true
      echo "Stopped $name ($pid)"
    fi
    rm -f ".run/${name}.pid"
  fi
done
SH
chmod +x stop-proot.sh

echo "==> [7/7] Starting app"
./start-proot.sh

echo "Done. Admin: http://localhost:8080  (set ADMIN_TOKEN from .env)"
