/**
 * Interfeys matnlari (o'zbek, lotin). Ko'p tillilik uchun: shu shakldagi boshqa lug'at qo'shiladi
 * va `useT()` joriy tilni tanlaydi. Umumiy (bir necha sahifada takrorlanadigan) yorliqlar shu yerda.
 */
export const uz = {
  app: { name: 'Hisobchi Go', tagline: 'Savdo va qarz hisobi — oddiy va aniq' },
  nav: {
    dashboard: 'Bosh sahifa',
    sales: 'Savdolar',
    drafts: 'Qoralamalar',
    newSale: 'Yangi savdo',
    customers: 'Mijozlar',
    products: 'Mahsulotlar',
    warehouse: 'Ombor',
    suppliers: "Ta'minotchilar",
    report: 'Hisobot',
    purchasesBook: 'Kirim daftari',
    salesBook: 'Chiqim daftari',
    ledgers: 'Daftarlar',
    groupMain: 'Asosiy',
    groupLedgers: 'Daftarlar',
    groupBase: 'Baza',
    settings: 'Sozlamalar',
    menu: 'Menyu',
    signOut: 'Chiqish',
  },
  units: {
    dona: 'dona',
    kg: 'kg',
    g: 'g',
    litr: 'litr',
    metr: 'metr',
    pachka: 'pachka',
    qop: 'qop',
    karobka: 'karobka',
    tonna: 'tonna',
  },
  composer: {
    title: 'Yangi savdo',
    customerLabel: 'Mijoz',
    cashSale: 'Mijozsiz (naqd)',
    placeholder: 'Tovar nomini yozing...',
    productInput: 'Tovar nomi',
    add: "Qo'shish",
    plus: "Qo'shimcha amallar",
    whoChip: 'Kimga',
    actionChip: 'Amal',
    actionSale: 'Savdo',
    actionPayment: "To'lov",
    newCustomer: 'Yangi mijoz',
    searchCustomer: 'Mijozni qidirish',
    close: 'Yopish',
    selected: 'ta tanlandi',
    listed: "Ro'yxatda",
    bumpHint: 'Bossangiz +1',
    confirm: 'Tasdiqlash',
    retry: 'Qayta urinish',
    emptyLines: "Tovar nomini yozing, takliflardan tanlang: kartochkalar shu yerda paydo bo'ladi.",
    newProduct: 'Yangi tovar',
    perUnit: "so'm",
    qty: 'Soni',
    price: 'Narx',
    removeLine: "Qatorni o'chirish",
  },
  methods: { naqd: 'Naqd', karta: 'Karta', otkazma: "O'tkazma" },
  roles: { owner: 'Egasi', admin: 'Administrator', member: 'Xodim' },
  status: { posted: 'Saqlangan', reversed: 'Bekor qilingan' },
  common: {
    save: 'Saqlash',
    cancel: 'Bekor qilish',
    close: 'Yopish',
    edit: 'Tahrirlash',
    delete: "O'chirish",
    search: 'Qidirish',
    retry: 'Qayta urinish',
    loading: 'Yuklanmoqda…',
    all: 'Hammasi',
    back: 'Orqaga',
    noCustomer: 'Mijozsiz',
    som: "so'm",
  },
} as const;

export type Messages = typeof uz;

const dictionaries = { uz } as const;
export type Locale = keyof typeof dictionaries;
export const DEFAULT_LOCALE: Locale = 'uz';

export function getMessages(locale: Locale = DEFAULT_LOCALE): Messages {
  return dictionaries[locale];
}

/** Hozircha bitta til; komponentlar shu orqali oladi — keyin kontekstga ulanadi */
export function useT(): Messages {
  return uz;
}
