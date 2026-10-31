/**
 * Xavfsiz rejim — Expo Go'da ilova nima uchun yopilishini bosqichma-bosqich aniqlash.
 *
 * Ishga tushirish (PowerShell):
 *   $env:EXPO_PUBLIC_SAFE_MODE = "1"; npx expo start --clear --tunnel
 *
 * Har bir tekshiruv faqat tugma bosilganda modulni yuklaydi va natijani
 * ekranga hamda Metro terminaliga ([SAFE] prefiksi bilan) yozadi.
 * Ilova biror tugmadan keyin yopilsa — terminaldagi oxirgi "[SAFE] start: ..."
 * qatori aybdor bosqichni ko'rsatadi.
 */
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Status = 'ok' | 'error' | 'running';
interface StepResult {
  name: string;
  status: Status;
  detail: string;
}

/** AppRoot'dagi SQLiteProvider bilan bir xil fayl nomi */
const APP_DB = 'hisobchi.db';

/* eslint-disable @typescript-eslint/no-require-imports */
const STEPS: { name: string; run: () => Promise<string> }[] = [
  {
    name: '1. Expo muhiti',
    run: async () => {
      const { isRunningInExpoGo } = require('expo') as typeof import('expo');
      const Constants = (require('expo-constants') as typeof import('expo-constants')).default;
      return `Expo Go: ${isRunningInExpoGo()}, execEnv: ${Constants.executionEnvironment}, ${Platform.OS} ${String(Platform.Version)}`;
    },
  },
  {
    name: '2. Core (BigInt) hisob',
    run: async () => {
      const core = require('@hisobchi/core') as typeof import('@hisobchi/core');
      const list = core.parseProductList('chirmoq 10 ta 13 ming, yurak 5 ta 15 ming, momiq 20 ta 9 ming');
      const total = core.calculateDocument(
        list.rows.map((r) => ({ qtyMilli: r.qtyMilli!, unitPrice: r.unitPrice! })),
      ).subtotal;
      const price = core.parseUnitPriceText('1,5 ming');
      if (total !== 385000n) throw new Error(`Kutilgan 385000, natija ${total}`);
      return `jami=${total}, "1,5 ming"=${price.ok ? price.unitPrice : price.message}`;
    },
  },
  {
    name: '3. expo-crypto',
    run: async () => {
      const { randomUUID } = require('expo-crypto') as typeof import('expo-crypto');
      return randomUUID();
    },
  },
  {
    name: '4a. SQLite: ilova bazasi (hisobchi.db)',
    run: async () => {
      // Ilova ishlatadigan haqiqiy fayl va haqiqiy migratsiyalar. Test yozuvi YOZILMAYDI.
      const SQLite = require('expo-sqlite') as typeof import('expo-sqlite');
      const { fromExpoSqlite } = require('../data/expo-db') as typeof import('../data/expo-db');
      const { migrate } = require('../data/schema') as typeof import('../data/schema');
      const raw = await SQLite.openDatabaseAsync(APP_DB);
      try {
        const db = fromExpoSqlite(raw);
        const report = await migrate(db);
        const counts = await db.get<{ s: number; c: number; l: number }>(
          `SELECT (SELECT COUNT(*) FROM sales) AS s, (SELECT COUNT(*) FROM customers) AS c,
                  (SELECT COUNT(*) FROM ledger_entries) AS l`,
        );
        return `user_version=${report.userVersion}; jadvallar: ${report.tables.join(', ')}; savdo=${counts?.s}, mijoz=${counts?.c}, ledger=${counts?.l}`;
      } finally {
        await raw.closeAsync();
      }
    },
  },
  {
    name: "4b. SQLite: saqlash va qayta o'qish (alohida fayl)",
    run: async () => {
      // Ilova bilan bir xil kod yo'li (fayl baza, migratsiya, navbatli tranzaksiya),
      // lekin foydalanuvchi ledgeriga tegmaslik uchun alohida diagnostika fayli.
      const SQLite = require('expo-sqlite') as typeof import('expo-sqlite');
      const { fromExpoSqlite } = require('../data/expo-db') as typeof import('../data/expo-db');
      const { migrate } = require('../data/schema') as typeof import('../data/schema');
      const { createLedger } = require('../data/ledger') as typeof import('../data/ledger');
      const { randomUUID } = require('expo-crypto') as typeof import('expo-crypto');
      const name = 'hisobchi-diagnostika.db';
      const raw = await SQLite.openDatabaseAsync(name);
      try {
        const db = fromExpoSqlite(raw);
        await migrate(db);
        const ledger = createLedger(db, { newId: randomUUID, now: () => new Date().toISOString() });
        const lines = [{ productName: 'non', qtyMilli: 3000n, unit: 'dona' as const, unitPrice: 4000n, rawText: null }];
        const opId = randomUUID();
        const first = await ledger.postSale({ clientOpId: opId, customerId: null, rawInput: null, lines });
        const second = await ledger.postSale({ clientOpId: opId, customerId: null, rawInput: null, lines });
        const sale = await ledger.getSale(first.saleId);
        if (!sale || sale.total !== 12000n) throw new Error(`Qayta o'qishda noto'g'ri summa: ${sale?.total}`);
        if (!second.duplicate || second.saleId !== first.saleId) throw new Error('Takroriy saqlash himoyasi ishlamadi');
        return `saqlandi va o'qildi: jami=${sale.total}, TS=${sale.tsTotal}, SQL=${sale.sqlTotal}, takror bloklandi`;
      } finally {
        await raw.closeAsync();
        await SQLite.deleteDatabaseAsync(name);
      }
    },
  },
  {
    name: '5. Ovoz moduli',
    run: async () => {
      const { loadSpeechModule } = require('../features/useVoiceInput') as typeof import('../features/useVoiceInput');
      return loadSpeechModule() ? 'mavjud' : "mavjud emas (Expo Go'da kutilgan holat)";
    },
  },
  {
    name: '6. Ekranlar va navigatsiya (import)',
    run: async () => {
      require('expo-router');
      require('react-native-screens');
      require('react-native-safe-area-context');
      require('../AppRoot');
      return "to'liq ilova modullari yuklandi";
    },
  },
];
/* eslint-enable @typescript-eslint/no-require-imports */

export default function SafeModeRoot() {
  const [results, setResults] = useState<StepResult[]>([]);
  const [busy, setBusy] = useState(false);

  const runStep = async (step: (typeof STEPS)[number]) => {
    console.log(`[SAFE] start: ${step.name}`);
    setResults((r) => [...r.filter((x) => x.name !== step.name), { name: step.name, status: 'running', detail: '…' }]);
    try {
      const detail = await step.run();
      console.log(`[SAFE] ok: ${step.name} — ${detail}`);
      setResults((r) => r.map((x) => (x.name === step.name ? { ...x, status: 'ok', detail } : x)));
    } catch (e) {
      const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      console.error(`[SAFE] error: ${step.name} — ${detail}`);
      setResults((r) => r.map((x) => (x.name === step.name ? { ...x, status: 'error', detail } : x)));
    }
  };

  const runAll = async () => {
    setBusy(true);
    for (const step of STEPS) await runStep(step);
    setBusy(false);
  };

  return (
    <ScrollView contentContainerStyle={s.container}>
      <Text style={s.title}>Hisobchi Go</Text>
      <Text style={s.subtitle}>Xavfsiz rejim — ilova ochildi ✓</Text>
      <Text style={s.help}>
        Har bir tekshiruvni alohida bosing. Ilova yopilsa, Metro terminalidagi oxirgi “[SAFE] start” qatorini yuboring.
      </Text>

      <Pressable disabled={busy} onPress={runAll} style={[s.btn, s.btnPrimary, busy && { opacity: 0.5 }]}>
        <Text style={s.btnPrimaryText}>Hammasini tekshirish</Text>
      </Pressable>

      {STEPS.map((step) => {
        const r = results.find((x) => x.name === step.name);
        return (
          <View key={step.name} style={s.card}>
            <Pressable disabled={busy} onPress={() => runStep(step)} style={s.btn}>
              <Text style={s.btnText}>{step.name}</Text>
            </Pressable>
            {r ? (
              <Text style={[s.result, r.status === 'error' ? s.err : r.status === 'ok' ? s.ok : null]} selectable>
                {r.status === 'ok' ? '✓ ' : r.status === 'error' ? '✗ ' : '… '}
                {r.detail}
              </Text>
            ) : null}
          </View>
        );
      })}

      <Text style={s.help}>
        To'liq ilovaga qaytish: EXPO_PUBLIC_SAFE_MODE o'zgaruvchisini olib tashlab, `npx expo start --clear` bilan qayta ishga tushiring.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { padding: 20, paddingTop: 64, gap: 12, backgroundColor: '#F4F6F8', flexGrow: 1 },
  title: { fontSize: 30, fontWeight: '800', color: '#0F7B5F' },
  subtitle: { fontSize: 17, fontWeight: '700', color: '#14212B' },
  help: { fontSize: 14, color: '#5B6875' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 12, gap: 8, borderWidth: 1, borderColor: '#D9DFE5' },
  btn: { minHeight: 48, borderRadius: 10, justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1.5, borderColor: '#0F7B5F' },
  btnText: { color: '#0F7B5F', fontSize: 16, fontWeight: '700' },
  btnPrimary: { backgroundColor: '#0F7B5F' },
  btnPrimaryText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  result: { fontSize: 14, color: '#14212B' },
  ok: { color: '#127A3E' },
  err: { color: '#B42318' },
});
