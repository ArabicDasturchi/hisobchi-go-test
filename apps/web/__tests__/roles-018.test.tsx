// @vitest-environment jsdom
/**
 * 018 rollar (web tomoni): sotuvchi (member) bekor qilish va ombor tuzatish tugmalarini ko'rmaydi; bazada ham
 * majburiy (supabase/tests/94_rollar.test.sql). K3: harakati bor tovar birligi o'zgarmasligi haqida xabar.
 */
import { describe, expect, it } from 'vitest';
import { toAppError } from '@/lib/errors';
import { can } from '@/lib/permissions';
import { unitLockedMessage } from '@/lib/productIdentity';

describe('rollar (018)', () => {
  it('bekor qilish va ombor tuzatish: owner/admin — ha, member — yo‘q', () => {
    for (const a of ['ledger.reverse', 'stock.adjust'] as const) {
      expect(can('owner', a)).toBe(true);
      expect(can('admin', a)).toBe(true);
      expect(can('member', a)).toBe(false);
    }
  });
  it('savdo, to‘lov, kirim yozish hamma rolga ochiq', () => {
    expect(can('member', 'ledger.write')).toBe(true);
  });
  it('server xatolari o‘zbekcha: role_forbidden, unit_locked', () => {
    expect(toAppError({ code: '42501', message: "role_forbidden: bu amalni faqat do'kon egasi yoki administrator bajaradi" })).toMatchObject({ kind: 'forbidden', message: expect.stringContaining('egasi yoki administrator') });
    expect(toAppError({ code: '22023', message: 'unit_locked: tovarda harakat bor' })).toMatchObject({ kind: 'validation', message: expect.stringContaining('birligini') });
    expect(unitLockedMessage('Un')).toContain('«Un»');
  });
});
