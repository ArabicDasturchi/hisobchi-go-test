# Lokal ishlash (Windows) — bitta urinishda

Zanjir: **lokalda sina → shaxsiy branch'ga push → Vercel preview → GitHub'da merge → Vercel yangilaydi.** Umumiy qoidalar: [ISH-TARTIBI.md](ISH-TARTIBI.md).

## 1. Sozlash

Kerak: Node 22+ (tekshirilgan: 24), Git, GitHub CLI.

```bash
node -v && git --version && gh --version
gh auth login            # bir marta: brauzerda "Login with GitHub" ni bosing (parol so'ralmaydi)
git clone https://github.com/abdullohismoilov777-debug/hisobchi-go
cd hisobchi-go
npm ci
npm run check            # test + typecheck + veb build: hammasi yashil bo'lishi kerak
npm run demo             # http://localhost:3000 (kalitsiz, soxta ma'lumot, faqat ko'rish)
```

Node yo'q bo'lsa: `winget install OpenJS.NodeJS.LTS` yoki nodejs.org.

Admin panel demo: `npm run demo:admin` (http://localhost:3100, soxta ma'lumot), tafsilot: [ADMIN.md](ADMIN.md).

Demo haqida: [scripts/demo-seed/README.md](../scripts/demo-seed/README.md). Windows'da `scripts/demo-seed/run.mjs` env'ni o'zi beradi, `VAR=1 buyruq` yozish shart emas.

## 2. Haqiqiy baza bilan veb (ixtiyoriy)

1. `apps/web/.env.example` ni `apps/web/.env.local` ga nusxalang (`.env*.local` gitignore'da).
2. `NEXT_PUBLIC_SUPABASE_URL` va `NEXT_PUBLIC_SUPABASE_ANON_KEY` (faqat publishable/anon kalit) ni Supabase → Project Settings → API dan qo'ying.
3. **service_role kalitini hech qachon qo'ymang.**
4. `npm run dev:web`.

## 3. Push tartibi

```bash
git switch -c nom           # har o'zgarish uchun main'dan yangi branch
# ... o'zgartirish ...
npm run check               # yashil bo'lmaguncha push qilmang
git add -A && git commit -m "qisqa tavsif"
git push -u origin nom
```

Keyin: GitHub'da PR → Vercel preview havolasi PR'da chiqadi → ko'ring → GitHub'da merge. `main` ga to'g'ridan-to'g'ri push yo'q: migratsiya bo'lsa u production bazaga CI orqali o'zi qo'llanadi ([MIGRATSIYA-CI.md](MIGRATSIYA-CI.md)).

## 4. Windows: muammolar va yechimlar

| Belgi | Sabab | Yechim |
|---|---|---|
| `npm test` da `spawnSync mkdir ENOENT` (migration-guard) | Test `mkdir -p` chaqirardi, Windows'da yo'q | Tuzatilgan: `mkdirSync(..., { recursive: true })`. Yangi testlarda ham `mkdir`, `rm`, `cp` ni `node:fs` bilan yozing |
| `DeprecationWarning DEP0190` `npm run demo` da | `spawn(..., shell: true)` ogohlantirishi | Zararsiz, demo ishlaydi |
| PowerShell `NativeCommandError` npm chiqishida | npm/Vite ogohlantirishi stderr'ga tushadi | Chiqish kodiga qarang (`$LASTEXITCODE`), matnga emas |
| `npm ci` oxirida "vulnerabilities", "allow-scripts" | Bog'liqliklar auditi, postinstall | Xato emas. `npm audit fix --force` qilmang |
| Port 3000 band | Oldingi dev server ochiq | `DEMO_PORT=3001 npm run demo` (bash) yoki `$env:DEMO_PORT=3001; npm run demo` (PowerShell) |
| `/setup` sahifasi (demo emas, oddiy rejim) | `.env.local` yo'q | 2-bo'lim yoki `npm run demo` |
| git: "LF will be replaced by CRLF" | `core.autocrlf=true` | Zararsiz ogohlantirish |

## 5. Toza qayta yig'ish

```powershell
git switch main; git pull
Remove-Item -Recurse -Force node_modules, apps/web/.next
npm ci
npm run check
```

## Skrinshotlar (demo)

`npm run screenshots -- keyin` (yoki `oldin`) telefon va kompyuter ko'rinishida demo sahifalarini `docs/ekranlar/` ga yozadi: Bosh sahifa, Hisobot, Yangi savdo, Mijozlar va mijoz varag'i, Ta'minotchilar va varaq, Kirim yozish, Ombor (Qoldiq/Kirim/Chiqim), Sozlamalar. Mavjud bo'lmagan sahifa (eski holat) o'tkazib yuboriladi. Chrome yoki Edge o'rnatilgan bo'lishi kerak (`CHROME_PATH`); port band bo'lsa `DEMO_PORT`.
