#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/home2/lawpath/app/LawPath"
PUBLIC_DIR="/home2/lawpath/public_html"
PM2_APP="lawpath-api"
MIGRATIONS_DIR="db/migrations"
MIGRATIONS_TABLE="schema_migrations"

cd "$APP_DIR"

log() {
  printf "\n\033[1;32m==>\033[0m %s\n" "$1"
}

fail() {
  printf "\n\033[1;31mERROR:\033[0m %s\n" "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

load_env() {
  if [[ ! -f ".env" ]]; then
    fail "Missing .env file in $APP_DIR"
  fi

  DATABASE_URL="$(node -e "require('dotenv').config({ quiet: true }); process.stdout.write(process.env.DATABASE_URL || '')")"
  PORT="$(node -e "require('dotenv').config({ quiet: true }); process.stdout.write(process.env.PORT || '3069')")"
  export DATABASE_URL PORT

  [[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL is not set in .env"
}

ensure_clean_worktree() {
  if [[ -n "$(git status --porcelain)" ]]; then
    git status --short
    fail "Server worktree has local changes. Commit, stash or remove them before deploying."
  fi
}

show_remote_changes() {
  local before after
  before="$(git rev-parse HEAD)"

  log "Fetching latest changes"
  git fetch origin main

  after="$(git rev-parse origin/main)"

  if [[ "$before" == "$after" ]]; then
    echo "Already up to date with origin/main."
  else
    echo "Changes to deploy:"
    git --no-pager log --oneline "$before..$after"
    echo
    echo "Changed files:"
    git --no-pager diff --name-status "$before..$after"
  fi
}

pull_latest() {
  log "Pulling latest code"
  git pull --ff-only origin main
}

install_and_build() {
  log "Installing dependencies"
  npm ci

  log "Building frontend"
  npm run build
}

sync_public_html() {
  log "Publishing frontend to public_html"

  if [[ ! -d "dist" ]]; then
    fail "dist folder not found after build."
  fi

  mkdir -p "$PUBLIC_DIR"
  rsync -a --delete "dist/" "$PUBLIC_DIR/"
}

ensure_migrations_table() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<SQL
create table if not exists ${MIGRATIONS_TABLE} (
  filename text primary key,
  checksum text not null,
  applied_at timestamptz not null default now()
);
SQL
}

baseline_migrations() {
  load_env
  ensure_migrations_table

  log "Baselining existing migrations"
  for migration in "$MIGRATIONS_DIR"/*.sql; do
    [[ -e "$migration" ]] || continue
    local filename checksum
    filename="$(basename "$migration")"
    checksum="$(sha256sum "$migration" | awk '{print $1}')"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q \
      -c "insert into ${MIGRATIONS_TABLE} (filename, checksum) values ('$filename', '$checksum') on conflict (filename) do nothing;"
    echo "Marked as applied: $filename"
  done
}

run_migrations() {
  load_env
  ensure_migrations_table

  log "Running pending database migrations"

  local applied_any="false"
  for migration in "$MIGRATIONS_DIR"/*.sql; do
    [[ -e "$migration" ]] || continue

    local filename checksum already_applied
    filename="$(basename "$migration")"
    checksum="$(sha256sum "$migration" | awk '{print $1}')"
    already_applied="$(psql "$DATABASE_URL" -tAc "select checksum from ${MIGRATIONS_TABLE} where filename = '$filename';")"

    if [[ -n "$already_applied" ]]; then
      if [[ "$already_applied" != "$checksum" ]]; then
        fail "Migration checksum changed after being applied: $filename"
      fi
      echo "Skipping applied migration: $filename"
      continue
    fi

    echo "Applying migration: $filename"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q \
      -c "insert into ${MIGRATIONS_TABLE} (filename, checksum) values ('$filename', '$checksum');"
    applied_any="true"
  done

  if [[ "$applied_any" == "false" ]]; then
    echo "No pending migrations."
  fi
}

restart_app() {
  log "Restarting PM2 app"

  mkdir -p logs

  if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
    pm2 reload "$PM2_APP" --update-env
  else
    pm2 start ecosystem.config.cjs
  fi

  pm2 save
  pm2 status "$PM2_APP"
}

health_check() {
  log "Waiting for API to become ready"

  local url="http://127.0.0.1:${PORT:-3069}/api/health"
  local max_attempts=24   # 24 × 5 s = 120 s maximum wait
  local attempt=1

  until curl --fail --silent --show-error "$url" > /dev/null 2>&1; do
    if (( attempt >= max_attempts )); then
      echo
      fail "API did not respond after $(( max_attempts * 5 )) seconds. Check: pm2 logs ${PM2_APP}"
    fi
    printf "  [%d/%d] Not ready yet — retrying in 5 s…\n" "$attempt" "$max_attempts"
    sleep 5
    (( attempt++ ))
  done

  echo
  curl --fail --silent --show-error "$url"
  echo
  log "API is up"
}

main() {
  require_command git
  require_command node
  require_command npm
  require_command psql
  require_command pm2
  require_command curl
  require_command sha256sum
  require_command rsync

  case "${1:-deploy}" in
    --baseline)
      baseline_migrations
      ;;
    deploy)
      load_env
      ensure_clean_worktree
      show_remote_changes
      pull_latest
      install_and_build
      sync_public_html
      run_migrations
      restart_app
      health_check
      log "Deployment complete"
      ;;
    *)
      echo "Usage:"
      echo "  ./deploy.sh             Pull, build, migrate and restart"
      echo "  ./deploy.sh --baseline  Mark existing migrations as already applied"
      exit 1
      ;;
  esac
}

main "$@"
