/**
 * To'liq ilovaning ishga tushishini bosqichma-bosqich yig'ish (crash qaysi qatlamda ekanini topish).
 *
 * Ishga tushirish (PowerShell, apps\mobile ichida):
 *   $env:EXPO_PUBLIC_STARTUP_STAGE = "1"; npx expo start --clear --tunnel
 *
 * Bosqichlar:
 *   1  — SafeAreaProvider + StatusBar + oddiy matn
 *   2  — + SQLiteProvider (haqiqiy hisobchi.db, haqiqiy migratsiya) + Ledger/Draft providerlar
 *   3  — + expo-router <Slot/> → haqiqiy bosh ekran (native stack'siz)
 *   4  — + native <Stack/> standart sozlamalar bilan (header bor) + bosh ekran
 *   4a — native Stack, header YO'Q (headerShown: false) + bosh ekran
 *   4b — native Stack, header bor + minimal ekran (HomeScreen o'rniga)
 *   4c — native Stack, header YO'Q + minimal ekran
 *   4d — native Stack, header YO'Q + minimal ekran, providerlarsiz (SQLite yo'q)
 *   4e — native Stack + JS header (AppHeader, ilovaning yangi sozlamasi) + minimal ekran
 *        (4b bilan bir xil, faqat native header o'rniga AppHeader)
 *   5  — + to'liq Stack sozlamalari (AppHeader) va ekranlar ro'yxati (Suspense'siz SQLite)
 *   6  — to'liq AppRoot (Suspense bilan) — oddiy ilova bilan bir xil
 *
 * 4-bosqich variantlarini sinash tartibi: 4d → 4c → 4b → 4a; tuzatish uchun: 4e → 5 → 6.
 */
import { Slot, Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppRoot, { APP_DB_NAME, initDb, SCREENS, stackScreenOptions } from '../AppRoot';
import { LedgerProvider, useLedger } from '../data/LedgerProvider';
import { DraftProvider } from '../features/DraftContext';
import { MinimalScreenContext } from './minimalScreen';
import { startupLog, useStartupMark } from './startupLog';

export const STAGE_NAMES: Record<string, string> = {
  '1': 'SafeAreaProvider + StatusBar',
  '2': 'SQLite + providerlar',
  '3': 'expo-router Slot + bosh ekran',
  '4': 'native Stack (header bor) + bosh ekran',
  '4a': "native Stack (header yo'q) + bosh ekran",
  '4b': 'native Stack (header bor) + minimal ekran',
  '4c': "native Stack (header yo'q) + minimal ekran",
  '4d': "native Stack (header yo'q) + minimal ekran, providerlarsiz",
  '4e': 'native Stack + JS header (AppHeader) + minimal ekran',
  '5': "native Stack (to'liq sozlamalar, AppHeader) + bosh ekran",
  '6': "to'liq AppRoot (Suspense)",
};

function Info({ stage, children }: { stage: string; children?: ReactNode }) {
  return (
    <ScrollView contentContainerStyle={s.container}>
      <Text style={s.title}>Startup bosqichi {stage}</Text>
      <Text style={s.subtitle}>{STAGE_NAMES[stage]} — ochildi ✓</Text>
      {children}
      <Text style={s.help}>Keyingi bosqich: EXPO_PUBLIC_STARTUP_STAGE = {Number(stage) + 1}</Text>
    </ScrollView>
  );
}

function DbProbe() {
  useStartupMark('DbProbe');
  const ledger = useLedger();
  const [text, setText] = useState("Baza o'qilmoqda…");
  useEffect(() => {
    ledger
      .listSales({ limit: 1000 })
      .then(async (sales) => {
        const customers = await ledger.listCustomers();
        const msg = `Baza ishlayapti: savdolar=${sales.length}, mijozlar=${customers.length}`;
        startupLog(`DbProbe: ${msg}`);
        setText(msg);
      })
      .catch((e: unknown) => {
        const msg = `Baza xatosi: ${e instanceof Error ? e.message : String(e)}`;
        console.error(`[STARTUP] ${msg}`);
        setText(msg);
      });
  }, [ledger]);
  return <Text style={s.result}>{text}</Text>;
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <SQLiteProvider
      databaseName={APP_DB_NAME}
      onInit={initDb}
      onError={(e) => {
        console.error(`[STARTUP] SQLiteProvider xatosi: ${e.message}`);
        throw e;
      }}
    >
      <LedgerProvider>
        <DraftProvider>{children}</DraftProvider>
      </LedgerProvider>
    </SQLiteProvider>
  );
}

/** Stage 4 variantlari: header va ekran tarkibini alohida-alohida o'chirish */
function NativeStackVariant({ header, minimal, providers }: { header: boolean; minimal: boolean; providers: boolean }) {
  useStartupMark(`NativeStack(header=${header}, minimal=${minimal}, providers=${providers})`);
  const stack = (
    <MinimalScreenContext.Provider value={minimal}>
      <Stack screenOptions={header ? undefined : { headerShown: false }} />
    </MinimalScreenContext.Provider>
  );
  return providers ? <Providers>{stack}</Providers> : stack;
}

function Stage({ stage }: { stage: string }) {
  useStartupMark(`Stage ${stage} (${STAGE_NAMES[stage]})`);

  switch (stage) {
    case '1':
      return <Info stage="1" />;
    case '2':
      return (
        <Providers>
          <Info stage="2">
            <DbProbe />
          </Info>
        </Providers>
      );
    case '3':
      return (
        <Providers>
          <Slot />
        </Providers>
      );
    case '4':
      return <NativeStackVariant header minimal={false} providers />;
    case '4a':
      return <NativeStackVariant header={false} minimal={false} providers />;
    case '4b':
      return <NativeStackVariant header minimal providers />;
    case '4c':
      return <NativeStackVariant header={false} minimal providers />;
    case '4d':
      return <NativeStackVariant header={false} minimal providers={false} />;
    case '4e':
      return (
        <Providers>
          <MinimalScreenContext.Provider value>
            <Stack screenOptions={stackScreenOptions}>
              {SCREENS.map((sc) => (
                <Stack.Screen key={sc.name} name={sc.name} options={sc.options} />
              ))}
            </Stack>
          </MinimalScreenContext.Provider>
        </Providers>
      );
    default:
      return (
        <Providers>
          <Stack screenOptions={stackScreenOptions}>
            {SCREENS.map((sc) => (
              <Stack.Screen key={sc.name} name={sc.name} options={sc.options} />
            ))}
          </Stack>
        </Providers>
      );
  }
}

export default function StartupStages({ stage }: { stage: string }) {
  const known = stage in STAGE_NAMES ? stage : '1';
  startupLog(`=== STARTUP DIAGNOSTIKA: bosqich ${known} — ${STAGE_NAMES[known]} ===`);
  if (known === '6') return <AppRoot />;
  return (
    <SafeAreaProvider>
      <StatusBar style={known === '1' || known === '2' ? 'dark' : 'light'} />
      <Stage stage={known} />
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  container: { padding: 20, paddingTop: 64, gap: 12, backgroundColor: '#F4F6F8', flexGrow: 1 },
  title: { fontSize: 28, fontWeight: '800', color: '#0F7B5F' },
  subtitle: { fontSize: 17, fontWeight: '700', color: '#14212B' },
  result: { fontSize: 15, color: '#14212B' },
  help: { fontSize: 14, color: '#5B6875' },
});
