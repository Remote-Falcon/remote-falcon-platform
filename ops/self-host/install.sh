#!/usr/bin/env bash
#
# install.sh — first-time bring-up for a self-hosted Remote Falcon instance.
#
# Run from anywhere; the script always operates relative to its own location.
# What it does:
#   1. Verifies prerequisites (docker, docker compose, .env file).
#   2. Validates that required env vars in .env are set.
#   3. Generates a self-signed cert into nginx/ssl/ if one doesn't exist
#      (acceptable for first-boot testing on localhost; replace with a real
#      Let's Encrypt cert before exposing to the internet — see README).
#   4. Builds + starts the stack via docker compose.
#   5. Reports health.
#
# Re-running is idempotent. To upgrade after a `git pull`, use upgrade.sh.

set -euo pipefail

cd "$(dirname "$0")"

# -- pretty output ----------------------------------------------------------
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
info() { printf '\033[1;34m·\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*" >&2; }
err()  { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; }

# -- 1. prereqs -------------------------------------------------------------
info "Checking prerequisites..."
if ! command -v docker >/dev/null 2>&1; then
  err "docker not found. Install Docker Desktop or Docker Engine first."
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  err "docker compose plugin not found. Update Docker to a recent version."
  exit 1
fi
if [ ! -f .env ]; then
  err ".env not found in $(pwd). Copy .env.example to .env and edit it first:"
  echo "    cp .env.example .env"
  echo "    \$EDITOR .env"
  exit 1
fi
ok "docker + docker compose + .env present"

# -- 2. validate required env vars -----------------------------------------
info "Validating .env..."
# shellcheck disable=SC1091
set -a; source ./.env; set +a
required=(WEB_URL JWT_USER JWT_VIEWER HOSTNAME_PARTS)
missing=()
placeholder_hits=()
for var in "${required[@]}"; do
  val="${!var:-}"
  if [ -z "$val" ]; then
    missing+=("$var")
  elif [[ "$var" == JWT_* && "$val" == change-me-* ]]; then
    placeholder_hits+=("$var")
  elif [[ "$var" == WEB_URL && "$val" == *your-domain.com* ]]; then
    placeholder_hits+=("$var")
  fi
done
if [ ${#missing[@]} -gt 0 ]; then
  err "Missing required env vars: ${missing[*]}"
  exit 1
fi
if [ ${#placeholder_hits[@]} -gt 0 ]; then
  err "Still using example placeholders for: ${placeholder_hits[*]}"
  echo "    Set real values in .env before continuing."
  exit 1
fi
ok ".env looks valid"

# -- 3. SSL certs (first-boot self-signed if missing) -----------------------
mkdir -p nginx/ssl
if [ ! -f nginx/ssl/fullchain.pem ] || [ ! -f nginx/ssl/privkey.pem ]; then
  warn "No TLS cert found in nginx/ssl/. Generating a self-signed cert for"
  warn "first-boot testing. REPLACE THIS with a real cert (Let's Encrypt)"
  warn "before exposing to the public internet."
  openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
    -keyout nginx/ssl/privkey.pem \
    -out    nginx/ssl/fullchain.pem \
    -subj   "/CN=remote-falcon-self-host" >/dev/null 2>&1
  ok "Self-signed cert written to nginx/ssl/"
else
  ok "TLS cert present in nginx/ssl/"
fi

# -- 4. build + start -------------------------------------------------------
info "Building images (first run takes ~5 min on 4 GB RAM)..."
docker compose -f docker-compose.yaml up -d --build

# -- 5. report health -------------------------------------------------------
info "Waiting for services to settle (up to 90s)..."
for _ in $(seq 1 30); do
  if curl -sk --max-time 2 https://localhost/ >/dev/null 2>&1 \
     || curl -s  --max-time 2 http://localhost/ >/dev/null 2>&1; then
    break
  fi
  sleep 3
done

echo
ok "Stack is up. Browse to $WEB_URL"
echo
echo "  Health checks:"
echo "    Control panel:  $WEB_URL/remote-falcon-control-panel/actuator/health"
echo "    Viewer:         $WEB_URL/remote-falcon-viewer/q/health"
echo "    Plugins API:    $WEB_URL/remote-falcon-plugins-api/q/health"
echo
echo "  Logs:    docker compose -f $(pwd)/docker-compose.yaml logs -f"
echo "  Stop:    docker compose -f $(pwd)/docker-compose.yaml down"
echo "  Upgrade: ./upgrade.sh"
