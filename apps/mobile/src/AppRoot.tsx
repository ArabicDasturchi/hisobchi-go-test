import { Stack } from 'expo-router';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Suspense, type ComponentProps } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './backend/AuthProvider';
import { SyncProvider } from './backend/SyncProvider';
import { fromExpoSqlite } from './data/expo-db';
import { LedgerProvider } from './data/LedgerProvider';
import { migrate } from './data/schema';
import { startupLog, useStartupMark } from './diagnostics/startupLog';
import { DraftProvider } from './features/DraftContext';
import { AppHeader } from './ui/AppHeader';
import { Loading } from './ui/components';
import { colors } from './ui/theme';

export const APP_DB_NAME = 'hisobchi.db';

export async function initDb(db: SQLiteDatabase) {
  startupLog('sqlite: onInit — migratsiya boshlandi');
  const report = await migrate(fromExpoSqlite(db));
  startupLog(`sqlite: migratsiya tugadi (user_version=${report.userVersion}, jadvallar: ${report.tables.join(', ')})`);
}

type StackProps = ComponentProps<typeof Stack>;

/**
 * Native header ishlatilmaydi: `header` berilganda native Stack o'z header'ini
 * o'chiradi (headerShown: false) va AppHeader'ni oddiy View sifatida chizadi.
 * Sabab: iPhone + Expo Go'da native header bilan ilova yopilgan (diagnostika 4b).
 */
export const stackScreenOptions: StackProps['screenOptions'] = {
  header: (props) => <AppHeader {...props} />,
  contentStyle: { backgroundColor: colors.bg },
};

export const SCREENS: { name: string; options: ComponentProps<typeof Stack.Screen>['options'] }[] = [
  // Asosiy bo'limlar — pastki tab navigatsiyasi o'z sarlavhasini chizadi
  { name: '(tabs)', options: { headerShown: false, title: 'Hisobchi Go' } },
  { name: 'review', options: { title: 'Qatorlarni tekshirish' } },
  { name: 'confirm', options: { title: 'Tasdiqlash' } },
  { name: 'sales/[id]', options: { title: 'Savdo tafsiloti' } },
  { name: 'customers/[id]', options: { title: 'Mijoz' } },
  { name: 'customers/form', options: { title: 'Mijoz', presentation: 'modal' } },
  { name: 'products', options: { title: 'Mahsulotlar' } },
  { name: 'quick-sale', options: { title: 'Tezkor savdo' } },
  { name: 'warehouse', options: { title: 'Ombor' } },
  { name: 'purchase/new', options: { title: 'Kirim qilish' } },
  { name: 'purchases/[id]', options: { title: 'Kirim' } },
  { name: 'books/[kind]', options: { title: 'Daftar' } },
  { name: 'suppliers/index', options: { title: "Ta'minotchilar" } },
  { name: 'suppliers/[id]', options: { title: "Ta'minotchi" } },
  { name: 'drafts', options: { title: 'Qoralamalar' } },
  { name: 'reports', options: { title: 'Hisobotlar' } },
  { name: 'settings', options: { title: 'Sozlamalar' } },
  { name: 'account', options: { title: 'Hisob va bulut' } },
  { name: 'auth/callback', options: { title: 'Email tasdiqlash' } },
];

function Mark({ name }: { name: string }) {
  useStartupMark(name);
  return null;
}

export default function AppRoot() {
  useStartupMark('AppRoot');
  return (
    <SafeAreaProvider>
      <AuthProvider>
      <Mark name="SafeAreaProvider" />
      <StatusBar style="light" />
      <Suspense fallback={<Loading label="Ma'lumotlar bazasi ochilmoqda…" />}>
        <SQLiteProvider databaseName={APP_DB_NAME} onInit={initDb} useSuspense>
          <Mark name="SQLiteProvider (baza tayyor)" />
          <LedgerProvider>
            <SyncProvider>
            <DraftProvider>
              <Mark name="Ledger + Draft providerlar" />
              <Stack screenOptions={stackScreenOptions}>
                {SCREENS.map((s) => (
                  <Stack.Screen key={s.name} name={s.name} options={s.options} />
                ))}
              </Stack>
            </DraftProvider>
            </SyncProvider>
          </LedgerProvider>
        </SQLiteProvider>
      </Suspense>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
