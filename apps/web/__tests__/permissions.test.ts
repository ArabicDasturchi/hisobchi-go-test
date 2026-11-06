import { describe, expect, it } from 'vitest';
import { can, PERMISSIONS, type Action } from '../src/lib/permissions';

describe('can(role, action) — yagona ruxsat nuqtasi', () => {
  it('sozlamalarni faqat egasi boshqaradi (avvalgi xatti-harakat saqlangan)', () => {
    expect(can('owner', 'settings.manage')).toBe(true);
    expect(can('admin', 'settings.manage')).toBe(false);
    expect(can('member', 'settings.manage')).toBe(false);
  });

  it("egasi hamma amalni bajara oladi; har amal uchun kamida bitta rol bor", () => {
    for (const a of Object.keys(PERMISSIONS) as Action[]) {
      expect(can('owner', a), a).toBe(true);
      expect(PERMISSIONS[a].length).toBeGreaterThan(0);
    }
  });
});
