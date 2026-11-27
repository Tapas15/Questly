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
setv('DATABASE_URL', 'sqlite:///./backend/data/app.db')
setv('FRONTEND_ORIGIN', 'http://localhost:8080')
setv('PUBLIC_BASE_URL', 'http://localhost:8080')
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

echo "App URLs:"
echo "  Local:    http://localhost:8080"
echo "  Network:  http://$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -n1):8080"
echo "Logs: .run/backend.log .run/frontend.log"
SH
chmod +x start-termux.sh

cat > stop-termux.sh <<'SH'
#!/data/data/com.termux/files/usr/bin/bash
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
chmod +x stop-termux.sh

echo "==> [8/8] Starting app"
./start-termux.sh

echo "Done. Admin: http://localhost:8080  (set ADMIN_TOKEN from .env)"
