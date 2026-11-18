#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" != 0 ]]; then
  echo 'Run from the extracted project: sudo bash deploy/install.sh'
  exit 1
fi

SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR=/opt/rental-notes
DATA_DIR=/var/lib/rental-notes

if [[ -d "$APP_DIR" && ! -f "$APP_DIR/.rental-notes-managed" ]]; then
  echo 'The target folder exists and is not managed by this installer. No changes made.'
  exit 1
fi
if [[ ! -f "$SOURCE_DIR/server.py" || ! -f "$SOURCE_DIR/web/index.html" ]]; then
  echo 'Project files are incomplete.'
  exit 1
fi
if command -v ss >/dev/null && ss -lntH 'sport = :8877' | head -n 1 | read -r _; then
  if ! systemctl is-active --quiet rental-notes; then
    echo 'Port 8877 is already in use. Stop here and choose another port before installation.'
    exit 1
  fi
fi

apt-get update
apt-get install -y python3-venv
if ! id rental-notes >/dev/null 2>&1; then
  useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin rental-notes
fi
install -d -m 755 "$APP_DIR" "$APP_DIR/web" "$APP_DIR/deploy"
install -d -m 700 -o rental-notes -g rental-notes "$DATA_DIR"
install -m 644 "$SOURCE_DIR/server.py" "$SOURCE_DIR/requirements.txt" "$APP_DIR/"
install -m 644 "$SOURCE_DIR/web/"* "$APP_DIR/web/"
install -m 644 "$SOURCE_DIR/deploy/backup_daily.py" "$APP_DIR/deploy/"
touch "$APP_DIR/.rental-notes-managed"
python3 -m venv "$APP_DIR/.venv"
"$APP_DIR/.venv/bin/pip" install -r "$APP_DIR/requirements.txt"

if [[ ! -f "$DATA_DIR/admin.json" ]]; then
  echo 'Set your personal password. Input is hidden; use at least 12 characters.'
  RENT_DATA_DIR="$DATA_DIR" "$APP_DIR/.venv/bin/python" "$APP_DIR/server.py" init-admin
  chown -R rental-notes:rental-notes "$DATA_DIR"
fi
if [[ ! -f /etc/rental-notes.env ]]; then
  cat > /etc/rental-notes.env <<'ENV'
RENT_DATA_DIR=/var/lib/rental-notes
RENT_ALLOWED_ORIGINS=
RENT_TRUST_PROXY=0
ENV
  chown root:rental-notes /etc/rental-notes.env
  chmod 640 /etc/rental-notes.env
fi
install -m 644 "$SOURCE_DIR/deploy/rental-notes.service" /etc/systemd/system/
install -m 644 "$SOURCE_DIR/deploy/rental-notes-backup.service" /etc/systemd/system/
install -m 644 "$SOURCE_DIR/deploy/rental-notes-backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now rental-notes.service rental-notes-backup.timer
systemctl restart rental-notes.service
systemctl --no-pager --full status rental-notes.service
echo 'Installed on 127.0.0.1:8877. Open an SSH tunnel from your own computer to preview.'
