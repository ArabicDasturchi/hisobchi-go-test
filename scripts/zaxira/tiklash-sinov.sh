#!/usr/bin/env bash
# Hisobchi Go — zaxiradan tiklashni AMALDA sinash (production'ga tegmaydi).
#
#   bash scripts/zaxira/tiklash-sinov.sh <fayl.dump>
#
# Lokal PostgreSQL'da vaqtinchalik baza yaratadi, zaxirani unga tiklaydi, asosiy jadvallar sonini va pul
# yaxlitligini (har savdo jami = qatorlar yig'indisi, ikki yo'l formulasi bilan) tekshiradi, oxirida bazani o'chiradi.
# Ulanish: PGHOST/PGUSER/PGPORT/PGPASSWORD (standart: localhost, postgres). Supabase rollari (anon, authenticated)
# lokal bazada bo'lmasa ham tiklash ishlaydi (--no-owner --no-privileges).
set -euo pipefail

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "XATO: zaxira fayli berilmagan yoki topilmadi: '$FILE'" >&2
  exit 2
fi
if [ -f "$FILE.sha256" ] && command -v sha256sum >/dev/null 2>&1; then
  sha256sum -c "$FILE.sha256" >/dev/null || { echo "XATO: nazorat yig'indisi mos emas (fayl buzilgan)" >&2; exit 3; }
fi
export PGHOST="${PGHOST:-localhost}" PGUSER="${PGUSER:-postgres}"
DB="hisobchi_tiklash_$$"
PSQL=(psql -X -q -w -v ON_ERROR_STOP=1)
cleanup() { "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

"${PSQL[@]}" -d postgres -c "CREATE DATABASE $DB" >/dev/null
# Supabase'ga xos sxema/rollarsiz ham tiklansin: xatolar ro'yxati chiqariladi, lekin jadvallar tiklanadi
pg_restore --no-owner --no-privileges --dbname="$DB" "$FILE" 2> "/tmp/tiklash-$$.log" || true
WARN=$(grep -c "error:" "/tmp/tiklash-$$.log" || true)

count() { "${PSQL[@]}" -d "$DB" -At -c "SELECT CASE WHEN to_regclass('public.$1') IS NULL THEN 'yo''q' ELSE (SELECT count(*)::text FROM public.$1) END"; }
echo "Tiklangan jadvallar (qatorlar soni):"
for t in shops products customers suppliers documents document_lines payments purchase_documents purchase_lines supplier_payments stock_movements baskets audit_log; do
  printf '  %-20s %s\n' "$t" "$(count "$t")"
done

# Pul yaxlitligi: har savdoning subtotal = qatorlar yig'indisi ((qty_milli*unit_price+500)/1000) — ikki yo'l formulasi
BAD=$("${PSQL[@]}" -d "$DB" -At -c "
  SELECT count(*) FROM documents d
  WHERE d.subtotal <> coalesce((SELECT sum((l.qty_milli * l.unit_price + 500) / 1000) FROM document_lines l WHERE l.document_id = d.id), 0)")
echo "Jami mos kelmagan savdolar: $BAD"
echo "pg_restore ogohlantirishlari: $WARN (Supabase'ga xos rollar/kengaytmalar bo'lishi mumkin: /tmp/tiklash-$$.log)"
if [ "$BAD" != "0" ]; then echo "XATO: zaxirada pul yaxlitligi buzilgan" >&2; exit 4; fi
echo "OK: zaxira tiklandi va tekshirildi (vaqtinchalik baza o'chiriladi)"
