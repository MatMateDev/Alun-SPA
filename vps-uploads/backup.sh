#!/bin/sh
# ============================================================================
#  Respaldo automático — Inversiones Alun SpA (VPS)
#  Respalda la base de datos (pg_dump) y los documentos (volumen uploads-data)
#  en /root/backups, conservando los últimos 14. Programar con cron:
#    crontab -e   →   0 3 * * * /root/Alun-SPA/vps-uploads/backup.sh >> /var/log/alun-backup.log 2>&1
# ============================================================================
set -e
cd "$(dirname "$0")"
DEST=/root/backups
FECHA=$(date +%Y%m%d_%H%M)
mkdir -p "$DEST"

# 1) Base de datos completa
docker compose exec -T db pg_dump -U alun alun > "$DEST/alun_db_$FECHA.sql"
gzip -f "$DEST/alun_db_$FECHA.sql"

# 2) Documentos adjuntos (volumen Docker)
docker run --rm -v vps-uploads_uploads-data:/data -v "$DEST":/backup alpine \
  tar czf "/backup/alun_docs_$FECHA.tar.gz" -C /data .

# 3) Conservar solo los últimos 14 de cada tipo
ls -1t "$DEST"/alun_db_*.sql.gz  2>/dev/null | tail -n +15 | xargs -r rm -f
ls -1t "$DEST"/alun_docs_*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm -f

echo "$(date) — respaldo OK: alun_db_$FECHA.sql.gz + alun_docs_$FECHA.tar.gz"
