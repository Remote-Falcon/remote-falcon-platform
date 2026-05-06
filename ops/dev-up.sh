#!/usr/bin/env bash
#
# dev-up.sh — bring up / tear down / iterate on the Remote Falcon stack
# locally using Docker Compose. No GitHub Actions, no DigitalOcean.
#
# Architecture:
#   - One MongoDB container (data persists in a named volume).
#   - Service images built from each apps/<svc>/Dockerfile.
#   - An nginx reverse-proxy on :8080 mirrors the prod ingress paths so the
#     UI talks to APIs at the same URLs as production.
#
#   Browse to:    http://localhost:8080
#   Direct ports: ui=3000, mongo=27017, control-panel=8081, viewer=8082,
#                 plugins-api=8083, external-api=8084, mongo-backup=8085,
#                 account-archive=8086, gateway=8087.
#
# Operating modes:
#   - platform (default): full SaaS stack we operate
#                         core + gateway + external-api + mongo-backup + account-archive
#   - core (--core flag): self-host shape (matches the deployment-wizard / developer-files)
#                         mongo + ui + control-panel + viewer + plugins-api + ingress
#
# Heads-up: the FIRST build pulls base images and resolves dep trees end-to-end.
# Each service builds in ~1-3 min on JVM (the dev-mode default — see Dockerfile.dev
# vs Dockerfile in each apps/<svc>/). Subsequent builds are cached.
#
# Usage:
#   ./dev-up.sh up [--core] [svc...]    # build + start (platform default; --core for self-host)
#   ./dev-up.sh down [--core]           # stop and remove containers (keeps mongo data)
#   ./dev-up.sh nuke [--core]           # down + delete the mongo volume (DESTRUCTIVE)
#   ./dev-up.sh logs [--core] [svc]     # tail logs (all, or one)
#   ./dev-up.sh ps [--core]             # show service status
#   ./dev-up.sh rebuild [--core] <svc>  # force-rebuild and restart one service
#   ./dev-up.sh shell <svc>             # exec /bin/sh inside a running container
#   ./dev-up.sh health [--core]         # hit each service's health endpoint
#   ./dev-up.sh seed                    # seed dev data into mongo (placeholder)
#
# The --core flag must be paired with the same mode that brought the stack up,
# or the underlying compose state may diverge from what dev-up.sh expects.

set -euo pipefail

cd "$(dirname "$0")"

COMPOSE_FILE="docker-compose.dev.yml"
ENV_FILE=".env.dev"

# Default: platform mode (matches what we operate locally).
MODE="platform"

log()  { printf '\033[1;34m[dev-up]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[dev-up]\033[0m %s\n' "$*" >&2; }
err()  { printf '\033[1;31m[dev-up]\033[0m %s\n' "$*" >&2; }

# -- arg parsing: extract --core anywhere in the arg list --------------------
parse_mode() {
  local out=() arg
  for arg in "$@"; do
    case "$arg" in
      --core)     MODE="core" ;;
      --platform) MODE="platform" ;;
      *)          out+=("$arg") ;;
    esac
  done
  # Re-export filtered args for the caller via a global REMAINING_ARGS.
  REMAINING_ARGS=("${out[@]:-}")
}

# -- compose v2 vs v1 -------------------------------------------------------
if docker compose version >/dev/null 2>&1; then
  DC_BIN=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DC_BIN=(docker-compose)
else
  err "docker compose / docker-compose not found. Install Docker Desktop or the compose plugin."
  exit 1
fi

# Wrapper that prepends the right --profile flag based on MODE.
# Compose semantics: with no profile, only services that have no `profiles:`
# tag start. With --profile platform, those *plus* services tagged [platform].
dc() {
  if [[ "$MODE" == "platform" ]]; then
    "${DC_BIN[@]}" -f "$COMPOSE_FILE" --profile platform "$@"
  else
    "${DC_BIN[@]}" -f "$COMPOSE_FILE" "$@"
  fi
}

# -- preflight --------------------------------------------------------------
preflight() {
  if ! command -v docker >/dev/null 2>&1; then
    err "docker not found."
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    err "Docker daemon not reachable. Is Docker Desktop running?"
    exit 1
  fi
  if [[ ! -f "$COMPOSE_FILE" ]]; then
    err "Missing $COMPOSE_FILE in $(pwd)."
    exit 1
  fi
  if [[ ! -f "$ENV_FILE" ]]; then
    if [[ -f ".env.dev.example" ]]; then
      warn "$ENV_FILE not found. Bootstrapping from .env.dev.example."
      cp .env.dev.example "$ENV_FILE"
      log "Edit $ENV_FILE if you need real values for SendGrid / S3 / Maps / etc."
    else
      err "Missing $ENV_FILE and .env.dev.example. Cannot continue."
      exit 1
    fi
  fi
}

# -- commands ---------------------------------------------------------------

cmd_up() {
  preflight
  local first_run=false
  if ! docker image ls --format '{{.Repository}}' | grep -q '^remote-falcon-dev'; then
    first_run=true
  fi
  if $first_run; then
    if [[ "$MODE" == "platform" ]]; then
      warn "First-time build detected (platform mode). 9 services build serially via Dockerfile.dev (JVM jars; ~1-3 min each)."
      warn "Stack-wide initial build typically completes in ~10-15 minutes. Subsequent builds cache."
    else
      warn "First-time build detected (core mode). 5 services build serially via Dockerfile.dev (JVM jars; ~1-3 min each)."
      warn "Stack-wide initial build typically completes in ~5-8 minutes. Subsequent builds cache."
    fi
    if [[ -n "${DEV_UP_YES:-}" || ! -t 0 ]]; then
      # Non-interactive: CI runs ($DEV_UP_YES=1) or piped stdin (no TTY) auto-proceed.
      log "Non-interactive mode (DEV_UP_YES set or no TTY); proceeding without prompt."
    else
      read -r -p "Proceed? [y/N] " ans
      [[ "$ans" =~ ^[Yy]$ ]] || { warn "Aborted."; exit 0; }
    fi
  fi
  # Build sequentially first, then start in parallel.
  # Why sequential build: GraalVM native-image generation peaks at 4-6GB RAM
  # per service. Parallel builds OOM on default Docker Desktop allocations
  # (~8GB). Sequential builds use the full Docker memory budget for one
  # native-image at a time. Override with COMPOSE_PARALLEL_LIMIT=N if you
  # have headroom (e.g. 16GB+ allocated to Docker).
  local parallel_limit="${COMPOSE_PARALLEL_LIMIT:-1}"
  if [[ ${#REMAINING_ARGS[@]} -gt 0 && -n "${REMAINING_ARGS[0]:-}" ]]; then
    log "[$MODE] Building (parallel=$parallel_limit): ${REMAINING_ARGS[*]}"
    COMPOSE_PARALLEL_LIMIT="$parallel_limit" dc build "${REMAINING_ARGS[@]}"
    log "[$MODE] Starting: ${REMAINING_ARGS[*]}"
    dc up -d "${REMAINING_ARGS[@]}"
  else
    log "[$MODE] Building (parallel=$parallel_limit) — JVM jars; ~1-3 min per service on first build."
    COMPOSE_PARALLEL_LIMIT="$parallel_limit" dc build
    log "[$MODE] Starting the stack."
    dc up -d
  fi
  log "Up. Browse: http://localhost:8080"
  log "Health check: ./dev-up.sh health${MODE:+ }${MODE:+--$MODE}"
}

cmd_down() {
  preflight
  log "[$MODE] Stopping containers (mongo volume preserved)."
  dc down
}

cmd_nuke() {
  preflight
  warn "This will DELETE the local mongo volume — all dev data will be lost."
  read -r -p "Type 'nuke' to confirm: " ans
  [[ "$ans" == "nuke" ]] || { warn "Aborted."; exit 0; }
  dc down -v
  log "Stack and mongo volume removed."
}

cmd_logs() {
  preflight
  if [[ ${#REMAINING_ARGS[@]} -gt 0 && -n "${REMAINING_ARGS[0]:-}" ]]; then
    dc logs -f --tail=200 "${REMAINING_ARGS[@]}"
  else
    dc logs -f --tail=100
  fi
}

cmd_ps() {
  preflight
  dc ps
}

cmd_rebuild() {
  preflight
  if [[ ${#REMAINING_ARGS[@]} -lt 1 || -z "${REMAINING_ARGS[0]:-}" ]]; then
    err "Usage: ./dev-up.sh rebuild [--core] <service>"
    exit 1
  fi
  local svc="${REMAINING_ARGS[0]}"
  log "[$MODE] Rebuilding $svc (no cache)."
  COMPOSE_PARALLEL_LIMIT="${COMPOSE_PARALLEL_LIMIT:-1}" dc build --no-cache "$svc"
  dc up -d "$svc"
}

cmd_shell() {
  preflight
  if [[ ${#REMAINING_ARGS[@]} -lt 1 || -z "${REMAINING_ARGS[0]:-}" ]]; then
    err "Usage: ./dev-up.sh shell <service>"
    exit 1
  fi
  dc exec "${REMAINING_ARGS[0]}" /bin/sh
}

cmd_health() {
  preflight
  log "[$MODE] Hitting each service's health endpoint via the local ingress…"
  # Core checks — always run.
  local checks=(
    "ui|http://localhost:8080/"
    "control-panel|http://localhost:8080/remote-falcon-control-panel/actuator/health"
    "viewer|http://localhost:8080/remote-falcon-viewer/q/health"
    "plugins-api|http://localhost:8080/remote-falcon-plugins-api/q/health"
  )
  # Platform-only checks — skipped in core mode.
  if [[ "$MODE" == "platform" ]]; then
    checks+=(
      "external-api|http://localhost:8080/remote-falcon-external-api/actuator/health"
      "mongo-backup|http://localhost:8080/remote-falcon-mongo-backup/q/health"
      "account-archive|http://localhost:8080/remote-falcon-account-archive/q/health"
      # Gateway's actuator lives at /actuator/health (no prefix). In prod, kubelet
      # hits the pod directly there; the ingress prefix /remote-falcon-gateway is
      # only used for SCG's own request-routing predicates. We mirror prod by
      # hitting the gateway's mapped port directly instead of via dev-nginx.
      "gateway|http://localhost:8087/actuator/health"
    )
  fi
  local ok=0 fail=0
  for c in "${checks[@]}"; do
    local svc="${c%%|*}" url="${c#*|}"
    local code
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" 2>/dev/null || echo "000")
    if [[ "$code" =~ ^2[0-9][0-9]$ ]]; then
      printf '  \033[1;32m✓\033[0m %-18s %s\n' "$svc" "$code"
      ok=$((ok+1))
    else
      printf '  \033[1;31m✗\033[0m %-18s %s  (%s)\n' "$svc" "$code" "$url"
      fail=$((fail+1))
    fi
  done
  log "Healthy: $ok / Failing: $fail"
  [[ $fail -eq 0 ]] || exit 1
}

cmd_seed() {
  preflight
  warn "Seed data not yet implemented. To populate dev data manually:"
  warn "  docker exec -it rf-mongo mongosh remote-falcon"
  warn "Or restore a sanitized prod dump:"
  warn "  docker exec -i rf-mongo mongorestore --drop /backup/<dump-dir>"
}

cmd_help() {
  sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'
}

# -- dispatch ---------------------------------------------------------------

# First arg is the subcommand; everything else (including --core anywhere) is
# parsed for mode then handed to the subcommand as REMAINING_ARGS.
SUBCMD="${1:-help}"
shift || true
parse_mode "$@"

case "$SUBCMD" in
  up)             cmd_up ;;
  down)           cmd_down ;;
  nuke)           cmd_nuke ;;
  logs)           cmd_logs ;;
  ps|status)      cmd_ps ;;
  rebuild)        cmd_rebuild ;;
  shell|sh)       cmd_shell ;;
  health)         cmd_health ;;
  seed)           cmd_seed ;;
  help|-h|--help) cmd_help ;;
  *)              err "Unknown command: $SUBCMD"; cmd_help; exit 1 ;;
esac
