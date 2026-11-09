# Hisobchi Go — admin panel

Platforma egalari (asoschilar) uchun, **faqat o'qish**. Do'kon egasi ilovasi (`apps/web`) bilan aralashmaydi.
To'liq tavsif, maxfiylik qoidalari, adminni qo'shish buyrug'i: [docs/ADMIN.md](../../docs/ADMIN.md).

```bash
npm run demo:admin    # repo ildizidan: http://localhost:3100, soxta ma'lumot, Supabase'siz
npm run dev:admin     # haqiqiy rejim (.env.local kerak, .env.example ga qarang)
```

Tekshiruvlar (`apps/admin` ichida): `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
Faqat public (anon) kalit ishlatiladi; service_role kaliti hech qachon.
