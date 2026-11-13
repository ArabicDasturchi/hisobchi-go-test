#!/usr/bin/env bash
# Migratsiyalarni lokal PostgreSQL'da (Supabase stub bilan) qo'llab, xavfsizlik testlarini ishga tushiradi.
# Vaqtinchalik baza yaratiladi va oxirida o'chiriladi. Mavjud bazalarga tegilmaydi.
#
#   bash supabase/tests/run_local.sh
#
# Ulanish: PGHOST/PGUSER/PGPORT/PGPASSWORD muhit o'zgaruvchilari (standart: localhost, postgres).
set -euo pipefail
cd "$(dirname "$0")/.."
DB="hisobchi_rls_test_$$"
export PGHOST="${PGHOST:-localhost}" PGUSER="${PGUSER:-postgres}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -w)

cleanup() { "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# 003-018 ikki marta qo'llanadi — qayta ishga tushirish xavfsizligini tekshirish uchun
FILES=(
  tests/00_supabase_stub.sql
  migrations/001_initial_schema.sql
  migrations/002_test_calculations.sql
  migrations/003_security_and_mvp_rpc.sql
  migrations/003_security_and_mvp_rpc.sql
  migrations/004_mcp_agent.sql
  migrations/004_mcp_agent.sql
  migrations/005_agent_catalog.sql
  migrations/005_agent_catalog.sql
  migrations/006_partners_stock.sql
  migrations/006_partners_stock.sql
  migrations/007_purchases.sql
  migrations/007_purchases.sql
  migrations/008_agent_purchases.sql
  migrations/008_agent_purchases.sql
  migrations/009_supplier_opening_balance.sql
  migrations/009_supplier_opening_balance.sql
  migrations/010_shop_settings.sql
  migrations/010_shop_settings.sql
  migrations/011_platform_admin.sql
  migrations/011_platform_admin.sql
  migrations/012_admin_shop_activity.sql
  migrations/012_admin_shop_activity.sql
  migrations/013_bekor_tolov_va_qarz_yozuvi.sql
  migrations/013_bekor_tolov_va_qarz_yozuvi.sql
  migrations/014_xavfsizlik_barqarorlik.sql
  migrations/014_xavfsizlik_barqarorlik.sql
  migrations/015_savat.sql
  migrations/015_savat.sql
  migrations/016_audit_tuzatish.sql
  migrations/016_audit_tuzatish.sql
  migrations/017_ai_sarf.sql
  migrations/017_ai_sarf.sql
  migrations/018_rollar.sql
  migrations/018_rollar.sql
  tests/10_security_isolation.test.sql
  tests/20_agent_mcp.test.sql
  tests/30_agent_catalog.test.sql
  tests/40_partners_stock.test.sql
  tests/50_purchases.test.sql
  tests/60_agent_purchases.test.sql
  tests/70_supplier_opening.test.sql
  tests/80_platform_admin.test.sql
  tests/85_admin_shop_activity.test.sql
  tests/90_reversal_payments_supplier_debt.test.sql
  tests/91_xavfsizlik_014.test.sql
  tests/92_savat.test.sql
  tests/93_audit_tuzatish.test.sql
  tests/94_rollar.test.sql
  tests/95_ai_sarf.test.sql
)

"${PSQL[@]}" -d postgres -c "CREATE DATABASE $DB" >/dev/null
for f in "${FILES[@]}"; do
  echo "--> $f"
  out="$(mktemp)"
  status=0
  "${PSQL[@]}" -d "$DB" -f "$f" >"$out" 2>&1 || status=$?
  grep -E "PASS|FAIL|ERROR|BARCHA" "$out" || true
  rm -f "$out"
  if [ "$status" -ne 0 ]; then echo "XATO: $f (psql exit $status)"; exit "$status"; fi
done
echo "OK: barcha fayllar xatosiz bajarildi"
