import type { SupabaseClient } from '@supabase/supabase-js';
import { ForbiddenError, isForbidden } from './errors';
import type { AdminApi, AdminFunnel, AdminOverview, AdminShopDetail, AdminShopsPage, AuditRow } from './types';

/**
 * Haqiqiy API: faqat `admin_*` RPC'lar. Jadvallarga to'g'ridan-to'g'ri murojaat yo'q (ular admin uchun ham yopiq).
 * Hamma sanash SQL'da; bu yerda faqat chaqirish va xatoni o'girish.
 */
export function createSupabaseApi(client: SupabaseClient): AdminApi {
  async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.rpc(fn, args);
    if (error) {
      if (isForbidden(error)) throw new ForbiddenError();
      throw error;
    }
    return data as T;
  }
  return {
    overview: (days = 14) => rpc<AdminOverview>('admin_overview', { p_days: days }),
    shops: (q = {}) =>
      rpc<AdminShopsPage>('admin_shops', {
        p_search: q.search?.trim() ? q.search.trim() : null,
        p_limit: q.limit ?? 50,
        p_offset: q.offset ?? 0,
        p_sort: q.sort ?? 'activity',
      }),
    shopDetail: (id) => rpc<AdminShopDetail>('admin_shop_detail', { p_shop_id: id }),
    funnel: () => rpc<AdminFunnel>('admin_funnel'),
    myAudit: (limit = 100) => rpc<AuditRow[]>('admin_my_audit', { p_limit: limit }),
  };
}
