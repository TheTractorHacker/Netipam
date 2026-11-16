#!/usr/bin/env bash
# Rebuild the dev image from this checkout and recreate the running netipam container.
# Safe order: back up Postgres -> build -> recreate only the app container.
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-$HOME/Netipam/docker-compose.yml}"
SERVICE="${SERVICE:-netipam}"
DB_CONTAINER="${DB_CONTAINER:-netipam-db}"
IMAGE="${IMAGE:-netipam-dev:pg}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/Netipam/backups}"
SRC="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$BACKUP_DIR"
stamp="$(date +%Y%m%d-%H%M%S)"
echo ">> Backing up database to $BACKUP_DIR/netipam-$stamp.sql.gz"
docker exec "$DB_CONTAINER" pg_dump -U netipam netipam | gzip > "$BACKUP_DIR/netipam-$stamp.sql.gz"

echo ">> Building $IMAGE from $SRC"
docker build -t "$IMAGE" "$SRC"

echo ">> Recreating $SERVICE (database container untouched)"
docker compose -f "$COMPOSE_FILE" up -d --no-deps --force-recreate "$SERVICE"

echo ">> Done. Logs: docker logs -f netipam"
