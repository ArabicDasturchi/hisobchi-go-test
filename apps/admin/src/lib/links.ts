/** Admin ichidagi yo'llar: bosiladigan joylar shu yerdan oladi (testlanadi) */
export const shopHref = (id: string): string => `/shops/${encodeURIComponent(id)}`;

export const OVERVIEW_LINKS = {
  shops: '/shops',
  // Alohida foydalanuvchilar sahifasi yo'q: egalari bilan do'konlar ro'yxati (QARORLAR.md)
  users: '/shops',
  salesToday: '/shops?sort=activity',
  active7d: '/shops?faol=7',
} as const;
