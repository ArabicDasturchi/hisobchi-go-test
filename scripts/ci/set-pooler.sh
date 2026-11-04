#!/usr/bin/env bash
# GitHub runner IPv6 ni qo'llamaydi, Supabase'ning to'g'ridan-to'g'ri bazasi esa IPv6.
# `supabase link` pooler manzilini yoza olmasa (token huquqi yetmasa), shu skript uni
# Management API'dan olib CLI kutgan faylga yozadi. Parol va token chop etilmaydi.
set -euo pipefail
: "${SUPABASE_PROJECT_REF:?}" "${SUPABASE_ACCESS_TOKEN:?}"
mkdir -p supabase/.temp
if [ -s supabase/.temp/pooler-url ]; then
  echo "pooler-url allaqachon bor."; exit 0
fi
resp=$(curl -sS -w '\n%{http_code}' -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/config/database/pooler") || true
code=${resp##*$'\n'}; body=${resp%$'\n'*}
if [ "$code" != "200" ]; then
  echo "::error::Pooler sozlamasini o'qib bo'lmadi (HTTP $code). Supabase tokeniga 'Project config / Database: read' huquqini bering."
  exit 1
fi
url=$(printf '%s' "$body" | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
 const a=JSON.parse(d);const l=Array.isArray(a)?a:[a];
 const s=l.find(x=>x.pool_mode==="session")||l.find(x=>/:5432\//.test(x.connection_string||""))||l[0];
 process.stdout.write((s&&s.connection_string)||"")})')
if [ -z "$url" ]; then echo "::error::Pooler manzili topilmadi."; exit 1; fi
# parolni olib tashlaymiz (CLI uni SUPABASE_DB_PASSWORD dan oladi)
printf '%s' "$url" | sed -E 's#(postgres(ql)?://[^:@/]+):[^@]*@#\1@#' | sed -E 's#:6543/#:5432/#' > supabase/.temp/pooler-url
echo "pooler-url yozildi: $(sed -E 's#@.*#@…#' supabase/.temp/pooler-url)"
