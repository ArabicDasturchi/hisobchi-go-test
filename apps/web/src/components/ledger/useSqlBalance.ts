'use client';
/**
 * Varaq qoldig'ining mustaqil ikkinchi yo'li: PostgreSQL `partner_statement`. `loadKey` o'zgarganda (ma'lumot qayta
 * yuklanganda) yangidan so'raladi; javob kelguncha `undefined` ("tekshirilmoqda"). `null` — SQL'ga yetib bo'lmadi.
 */
import { useEffect, useState } from 'react';
import { fetchSqlBalance, type PartnerKind } from '@/lib/data/partnerLedger';
import { getSupabase } from '@/lib/supabase/client';

export function useSqlBalance(kind: PartnerKind, shopId: string, partnerId: string, loadKey: string): bigint | null | undefined {
  const [res, setRes] = useState<{ key: string; value: bigint | null } | null>(null);
  const key = `${kind}:${shopId}:${partnerId}:${loadKey}`;
  useEffect(() => {
    let alive = true;
    void fetchSqlBalance(getSupabase(), shopId, kind, partnerId).then((value) => {
      if (alive) setRes({ key, value });
    });
    return () => {
      alive = false;
    };
  }, [kind, shopId, partnerId, key]);
  return res && res.key === key ? res.value : undefined;
}
