#!/usr/bin/env bash
# Hisobchi Go — qo'lda zaxira nusxa (Supabase'ning o'z kunlik zaxirasiga QO'SHIMCHA).
#
#   ZAXIRA_DB_URL='postgresql://...' bash scripts/zaxira/zaxira.sh [papka]
#
# - Ulanish manzili faqat muhit o'zgaruvchisidan (repoga, chatga yozilmaydi). Supabase: Project Settings → Database →
#   Connection string (Session pooler yoki direct). Parol shu manzil ichida.
# - Faqat `public` sxemasi (ilova ma'lumoti) + sxema tuzilmasi; `auth` foydalanuvchilari Supabase zaxirasida qoladi.
# - Natija: <papka>/hisobchi-YYYYmmdd-HHMMSS.dump (pg_dump custom format) va .sha256 nazorat yig'indisi.
# - Faqat o'qiydi: bazaga hech narsa yozmaydi.
set -euo pipefail

if [ -z "${ZAXIRA_DB_URL:-}" ]; then
  echo "XATO: ZAXIRA_DB_URL berilmagan (masalan: ZAXIRA_DB_URL='postgresql://...' bash $0)" >&2
  exit 2
fi
OUT_DIR="${1:-./zaxira}"
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$OUT_DIR/hisobchi-$STAMP.dump"

pg_dump --dbname="$ZAXIRA_DB_URL" --schema=public --format=custom --no-owner --no-privileges --file="$FILE"
if command -v sha256sum >/dev/null 2>&1; then sha256sum "$FILE" > "$FILE.sha256"; fi
echo "OK: $FILE ($(du -h "$FILE" | cut -f1))"
echo "Keyingi qadam: tiklashni sinash — bash scripts/zaxira/tiklash-sinov.sh $FILE"
