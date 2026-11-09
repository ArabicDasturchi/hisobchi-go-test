import type { AuditRow } from './types';

const ACTIONS: Record<string, string> = {
  admin_overview: "Umumiy ko'rinishni ochdi",
  admin_shops: "Do'konlar ro'yxatini ochdi",
  admin_shop_detail: "Do'kon sahifasini ochdi",
  admin_funnel: 'Voronkani ochdi',
  admin_my_audit: 'Jurnalni ochdi',
};

export function actionLabel(a: AuditRow): string {
  const base = ACTIONS[a.action] ?? a.action;
  return a.action === 'admin_shops' && a.target === 'search' ? `${base} (qidiruv)` : base;
}

