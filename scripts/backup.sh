#!/usr/bin/env bash
# Backs up the cabas database (pg_dump custom format) and the uploaded images.
# Usage: scripts/backup.sh [output-dir]   (default: ./backups)
# Run it from the directory of the Compose project (see README, "Backup and restore").
set -euo pipefail
# The dump and archive hold every purchase and receipt photo: readable by their owner only.
umask 077

out_dir="${1:-./backups}"
stamp="$(date +%Y%m%d-%H%M)"
db_file="$out_dir/cabas-db-$stamp.dump"
uploads_file="$out_dir/cabas-uploads-$stamp.tar.gz"

mkdir -p "$out_dir"
# Never leave a half-written backup that looks complete, even when cron or Ctrl-C stops the run.
trap 'rm -f "$db_file" "$uploads_file"; exit 1' ERR INT TERM

# Single quotes: the variables expand inside the db container, so no secret reaches this shell.
docker compose exec -T db sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$db_file"
# The app image's entrypoint ignores arguments, so stream from the running container instead of `compose run`.
docker compose exec -T app tar czf - -C /data uploads > "$uploads_file"

trap - ERR INT TERM
echo "$db_file"
echo "$uploads_file"
