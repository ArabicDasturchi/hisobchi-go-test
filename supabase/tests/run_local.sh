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

# 003-007 ikki marta qo'llanadi — qayta ishga tushirish xavfsizligini tekshirish uchun
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
  tests/10_security_isolation.test.sql
  tests/20_agent_mcp.test.sql
  tests/30_agent_catalog.test.sql
  tests/40_partners_stock.test.sql
  tests/50_purchases.test.sql
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
