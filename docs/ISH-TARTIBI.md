# Ish tartibi (1 sahifa)

Maqsad: asoschi "mana bu joyni mana bunday qil" deydi, Claude Code o'zgartiradi, PR ochiladi, CI yashil, preview havolada ko'rinadi, asoschi 1 bosish bilan `main` ga qo'shadi.

1. **Har o'zgarish: `main` dan alohida kichik branch va kichik PR.** Zanjir (stacked PR, PR ustiga PR) **taqiqlangan**: branch doim `main` dan ochiladi, base doim `main`. Bog'liq ish bo'lsa avval birinchisi merge bo'ladi, keyin ikkinchisi `main` dan ochiladi.
2. **Squash merge.** `main` tarixi: bitta PR = bitta commit. Merge'ni asoschi qiladi, Claude Code o'zi merge qilmaydi.
3. **PR tavsifida "Nima ko'rinadi":** qaysi ekran, nima o'zgardi, skrinshot yoki preview havola (Vercel PR'ga o'zi yozadi: `hisobchi-go-web`, `hisobchi-go-mcp`). Ko'rinadigan narsa bo'lmasa shuni yozing. Sinalmagan narsa "sinalmagan" deb yoziladi.
4. **Migratsiyali PR ikkiga bo'linadi:** (a) faqat SQL (`supabase/migrations/00N_*.sql` + `supabase/tests`), (b) ilova kodi. Avval (a) merge bo'ladi va CI qo'llaydi (avval staging, [MIGRATSIYA-CI.md](MIGRATSIYA-CI.md)), keyin (b) `main` dan ochiladi. Ilova eski bazada ham yiqilmasligi kerak.
5. **CI yashil bo'lmaguncha merge yo'q.** `CI / Testlar`, `CI / Veb build`, `CI / Mobil bundle`, `CI / SQL testlar` (branch himoyasida "Require status checks" ga shularni qo'shing). Lokal, push'dan oldin: `npm run check` (test + typecheck + veb build). Windows eslatmalari: [LOKAL.md](LOKAL.md).
6. **Kim qaysi fayllarda ishlaydi:** [VAZIFALAR-ICE.md](VAZIFALAR-ICE.md) 3-bo'lim. Hozir: veb va `packages/core` faol, `apps/mobile` muzlatilgan ([VEB-DAN-MOBILGA.md](VEB-DAN-MOBILGA.md)).
7. **Ko'rib chiqish:** `npm run demo` (kalitsiz, soxta ma'lumot) yoki PR preview havolasi.

Asoschining 1 bosishi: PR sahifasida CI yashil + preview ko'rindi, "Squash and merge".
