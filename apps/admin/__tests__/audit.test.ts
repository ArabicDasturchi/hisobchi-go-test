import { describe, expect, it } from 'vitest';
import { actionLabel } from '@/lib/audit';

const row = (action: string, target: string | null = null) => ({ id: '1', action, target, at: '2026-11-09T09:00:00Z' });

describe('actionLabel', () => {
  it("o'zbekcha nom; qidiruv belgilanadi; noma'lum amal o'zgarishsiz", () => {
    expect(actionLabel(row('admin_funnel'))).toBe('Voronkani ochdi');
    expect(actionLabel(row('admin_shops', 'list'))).toBe("Do'konlar ro'yxatini ochdi");
    expect(actionLabel(row('admin_shops', 'search'))).toBe("Do'konlar ro'yxatini ochdi (qidiruv)");
    expect(actionLabel(row('admin_yangi'))).toBe('admin_yangi');
  });
});
