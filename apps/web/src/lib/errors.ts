/**
 * Markazlashtirilgan xato boshqaruvi: Supabase/PostgREST/Auth xatolari → o'zbekcha tushunarli xabar.
 * Xom xato foydalanuvchiga ko'rsatilmaydi va loglanmaydi — unda shaxsiy ma'lumot bo'lishi mumkin.
 */
export type AppErrorKind = 'network' | 'auth' | 'forbidden' | 'conflict' | 'validation' | 'not_found' | 'unknown';

export class AppError extends Error {
  constructor(
    public readonly kind: AppErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Serverda RPC hali yo'q (migratsiya qo'llanmagan: PostgREST PGRST202 yoki Postgres 42883). Chaqiruvchi shu holatda
 * avvalgi xavfsiz yo'lga qaytishi yoki aniq ko'rsatma berishi mumkin. Hech narsa yozilmagan bo'ladi.
 */
export class RpcMissingError extends AppError {
  constructor(
    public readonly rpc: string,
    message: string = "Serverda bu amal hali yoqilmagan (migratsiya qo'llanmagan). Administratorga ayting.",
  ) {
    super('unknown', message);
    this.name = 'RpcMissingError';
  }
}

/** Xom Supabase/PostgREST xatosi "funksiya topilmadi" mi (faqat aniq kodlar va xabar) */
export function isRpcMissing(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  return e.code === 'PGRST202' || e.code === '42883' || /could not find the function/i.test(e.message ?? '');
}

interface ErrorShape {
  message?: string;
  code?: string;
  details?: string | null;
}

function debtSuffix(raw: string): string {
  const m = /debt=(-?\d+)/.exec(raw);
  if (!m?.[1]) return '';
  const digits = m[1].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return ` Joriy qarz: ${digits} so'm.`;
}

const RULES: readonly [RegExp, AppErrorKind, string][] = [
  // --- Auth ---
  [/invalid login credentials/, 'auth', "Email yoki parol noto'g'ri."],
  [/email not confirmed/, 'auth', 'Email hali tasdiqlanmagan. Pochtangizdagi havolani oching.'],
  [/user already registered|already been registered/, 'conflict', 'Bu email bilan hisob allaqachon mavjud. Kirish sahifasidan foydalaning.'],
  [/password should be at least|weak password|password is too weak|weak_password/, 'validation', 'Parol juda oddiy. Kamida 8 belgi, harf va raqam ishlating.'],
  [/same password|should be different from the old/, 'validation', 'Yangi parol eskisidan farq qilishi kerak.'],
  [/rate limit|too many requests|over_email_send_rate_limit|\b429\b/, 'network', "Juda ko'p urinish. Bir necha daqiqadan keyin qayta urinib ko'ring."],
  [/unable to validate email|invalid email|email address .* is invalid/, 'validation', "Email manzili noto'g'ri."],
  [/otp_expired|link is invalid or has expired|token has expired|flow state|code verifier/, 'auth', "Havola eskirgan, allaqachon ishlatilgan yoki boshqa brauzerda ochilgan. Yangi havola so'rang."],
  [/signups? not allowed|signup.*disabled/, 'forbidden', "Ro'yxatdan o'tish vaqtincha o'chirilgan."],
  // --- Tarmoq ---
  [/failed to fetch|network ?error|fetch failed|load failed|timeout|econn|offline/, 'network', "Internet aloqasi yo'q yoki server javob bermadi. Qayta urinib ko'ring."],
  // --- RPC biznes xatolari (003 migratsiyasidagi nomlar) ---
  [/not_authenticated|jwt|28000|refresh token|auth session missing/, 'auth', 'Sessiya tugagan. Qaytadan kiring.'],
  // --- Demo rejimi (npm run demo) ---
  [/demo_read_only/, 'forbidden', "Demo rejimida veb panel faqat ko'rsatadi: yozish o'chirilgan. Yozib ko'rish uchun mobil web demoni oching."],
  // --- Agent qoralamalari (004 migratsiyasi) ---
  [/draft_already_decided/, 'conflict', 'Bu qoralama allaqachon tasdiqlangan yoki rad etilgan.'],
  [/draft_not_found/, 'not_found', 'Qoralama topilmadi.'],
  [/draft_stale/, 'conflict', "Yozuv so'rov yaratilgandan keyin o'zgargan. Bu so'rovni rad eting, kerak bo'lsa AI dan qaytadan so'rang."],
  [/name_taken/, 'conflict', 'Bunday nomli tovar allaqachon bor.'],
  [/target_not_found/, 'not_found', 'Mijoz yoki tovar topilmadi.'],
  [/oauth_client_forbidden/, 'forbidden', 'Bu amal faqat Hisobchi Go ilovasida bajariladi.'],
  [/draft_immutable|draft_invalid_transition/, 'conflict', "Qoralamani o'zgartirib bo'lmaydi."],
  // --- Ta'minotchi, kirim, ombor (006/007/009) ---
  [/supplier_not_in_shop|supplier_not_found/, 'not_found', "Ta'minotchi topilmadi yoki bu do'konga tegishli emas."],
  [/opening_balance_exists/, 'conflict', "Bu ta'minotchining boshlang'ich qarzi allaqachon kiritilgan. Avval uni bekor qiling."],
  [/invalid_method/, 'validation', "To'lov usulini tanlang."],
  [/walkin_requires_full_payment/, 'validation', "Mijozsiz savdo to'liq to'langan bo'lishi kerak. Qarzga yoki qisman uchun «Kimga» da mijozni tanlang."],
  [/payment_requires_customer/, 'validation', "To'lov uchun mijozni tanlang."],
  [/invalid_date/, 'validation', "Sana noto'g'ri."],
  [/invalid_product|product_not_found/, 'not_found', 'Tovar topilmadi. Katalogdan tanlang.'],
  [/could not find the function|pgrst202|42883/, 'unknown', "Serverda bu amal hali yoqilmagan (migratsiya qo'llanmagan). Administratorga ayting."],
  [/calc_mismatch/, 'validation', 'Server hisobi summa bilan mos kelmadi — savdo saqlanmadi.'],
  [/already_reversed/, 'conflict', 'Bu savdo allaqachon bekor qilingan.'],
  // --- Savdoni to'lovi bilan bekor qilish (013) ---
  [/payment_exceeds_sale/, 'validation', "Bekor qilinayotgan to'lovlar savdo summasidan katta. Sahifani yangilab qayta urinib ko'ring."],
  [/payment_not_linked|invalid_payment_list/, 'conflict', "To'lov bu savdoga tegishli emas yoki allaqachon bekor qilingan. Sahifani yangilab qayta urinib ko'ring."],
  [/customer_not_in_shop/, 'forbidden', "Mijoz bu do'konga tegishli emas."],
  [/document_not_found/, 'not_found', 'Savdo topilmadi.'],
  [/payment_not_found/, 'not_found', "To'lov topilmadi."],
  [/reason_required/, 'validation', 'Sababni kiriting (kamida 3 belgi).'],
  [/invalid_shop_name/, 'validation', "Do'kon nomini kiriting."],
  [/empty_document/, 'validation', "Savdoda kamida bitta mahsulot bo'lishi kerak."],
  [/invalid_qty/, 'validation', "Miqdor noto'g'ri."],
  [/invalid_price/, 'validation', "Narx noto'g'ri yoki chegaradan katta."],
  [/invalid_unit/, 'validation', "O'lchov birligi noto'g'ri."],
  [/invalid_product_name/, 'validation', 'Mahsulot nomini kiriting.'],
  [/invalid_amount/, 'validation', "Summa noto'g'ri."],
  [/id_conflict/, 'conflict', "Yozuv identifikatori band. Sahifani yangilab qayta urinib ko'ring."],
  [/products_shop_id_name_key/, 'conflict', 'Bu nomdagi mahsulot allaqachon mavjud.'],
  [/foreign key|23503/, 'conflict', "Bu yozuvga bog'liq tarix bor — o'chirib bo'lmaydi."],
  [/23505|duplicate key/, 'conflict', 'Bunday yozuv allaqachon mavjud.'],
  [/forbidden|42501|permission denied|row-level security/, 'forbidden', "Bu amal uchun ruxsat yo'q."],
  [/pgrst116|0 rows/, 'not_found', "Ma'lumot topilmadi."],
  [/23514|check constraint|22023|22p02/, 'validation', "Server ma'lumotni rad etdi (noto'g'ri qiymat)."],
];

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const shape: ErrorShape = err && typeof err === 'object' ? (err as ErrorShape) : { message: String(err) };
  const raw = `${shape.code ?? ''} ${shape.message ?? ''} ${shape.details ?? ''}`.trim();
  const m = raw.toLowerCase();
  if (/payment_exceeds_debt/.test(m)) {
    return new AppError('validation', `To'lov mijoz qarzidan katta bo'lishi mumkin emas.${debtSuffix(raw)}`);
  }
  for (const [re, kind, message] of RULES) {
    if (re.test(m)) return new AppError(kind, message);
  }
  return new AppError('unknown', "Kutilmagan xato yuz berdi. Qayta urinib ko'ring.");
}

/** Supabase { data, error } javobidan ma'lumotni oladi yoki AppError tashlaydi */
export function unwrap<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw toAppError(res.error);
  if (res.data === null) throw new AppError('not_found', "Ma'lumot topilmadi.");
  return res.data;
}

/** accept/reject_agent_draft: qoralama allaqachon hal qilingan (masalan, ikki marta bosildi) */
export function isDraftAlreadyDecided(err: unknown): boolean {
  const shape: ErrorShape = err && typeof err === 'object' ? (err as ErrorShape) : { message: String(err) };
  return /draft_already_decided/i.test(`${shape.message ?? ''} ${shape.details ?? ''}`);
}

export function errorMessage(err: unknown): string {
  return toAppError(err).message;
}
