import { describe, expect, it } from 'vitest';
import { isActive, NAV_GROUPS, NAV_ITEMS, pageTitle } from '../src/components/layout/nav';

describe('menyu: Qoralamalar', () => {
  it('"Savdo va pul" bo\'limida, sarlavha va faol holat to\'g\'ri', () => {
    const group = NAV_GROUPS.find((g) => g.items.some((i) => i.href === '/drafts'));
    expect(group?.label).toBe('Savdo va pul');
    expect(NAV_ITEMS.filter((i) => i.href === '/drafts')).toHaveLength(1);
    expect(pageTitle('/drafts')).toBe('Qoralamalar');
    expect(isActive('/drafts', '/drafts')).toBe(true);
    expect(isActive('/sales', '/drafts')).toBe(false);
  });
});
