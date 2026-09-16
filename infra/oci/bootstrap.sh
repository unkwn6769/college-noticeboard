#!/usr/bin/env bash
set -euo pipefail

# Run as root on a fresh Ubuntu LTS OCI A1 VM.
APP_USER=noticeboard
APP_ROOT=/opt/college-noticeboard
DATA_ROOT=/srv/noticeboard

apt-get update
apt-get install -y nginx postgresql postgresql-contrib git curl ca-certificates build-essential

# Node.js 20.x baseline required by this project.
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_ROOT" "$DATA_ROOT"/{files,staging,quarantine/objects,quarantine/partials,tmp,backups}
chown -R "$APP_USER":"$APP_USER" "$APP_ROOT" "$DATA_ROOT"
chmod 0750 "$DATA_ROOT"

# The block volume should be formatted and mounted separately before this script's
# final ownership step if the mount point is not already active.
if ! mountpoint -q "$DATA_ROOT"; then
  echo "WARNING: $DATA_ROOT is not a mounted OCI Block Volume. Mount it before production use." >&2
fi

# Create the runtime secret/config file if it does not exist.
if [ ! -f /etc/college-noticeboard.env ]; then
  install -o root -g "$APP_USER" -m 0640 /dev/null /etc/college-noticeboard.env
  cat >/etc/college-noticeboard.env <<'ENV'
DATABASE_URL=postgresql://noticeboard@127.0.0.1:5432/noticeboard
STORAGE_ROOT=/srv/noticeboard
PORT=3000
ENV
fi

# PostgreSQL database/user.
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='noticeboard'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE ROLE noticeboard LOGIN;"
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='noticeboard'" | grep -q 1; then
  sudo -u postgres createdb -O noticeboard noticeboard
fi

systemctl enable --now postgresql nginx

echo "Bootstrap complete. Next: copy the application into $APP_ROOT, install/build it, run db migration, then enable the systemd units."
